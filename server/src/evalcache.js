/*
 * Bộ nhớ điểm dùng chung cho phân tích ván bằng Rapfi (như "cloud eval" của Lichess): thế nào đã có người chấm kỹ thì máy
 * khác lấy ngay, khỏi chấm lại – khai cuộc phổ biến gần như có kết quả tức thì, điện thoại đỡ tốn pin.
 *
 * An toàn (điểm do trình duyệt gửi lên, không tin được):
 *   - máy chủ tự tính khoá chuẩn từ chính các nước đi (caro/eval-key.js – dời + 8 phép đối xứng), không nhận khoá của máy
 *     khách; thế không hợp lệ (nước trùng, đã có người thắng, quá lớn) bị bỏ;
 *   - mỗi điểm gắn với bản engine (ENGINE) và số nút đã chấm (phân tích chấm theo số nút – rapfi-analysis.js – nên máy
 *     khách trung thực ra cùng kết quả);
 *   - chỉ phát cho người khác khi ít nhất 2 tài khoản khác nhau gửi kết quả khớp nhau (cùng số nút, cùng thắng / thua chắc
 *     hoặc khả năng thắng lệch ≤ AGREE) – một người gửi điểm sai không làm hỏng được bộ nhớ;
 *   - người gửi lưu dạng băm (who = SHA-256 của id tài khoản), xoá tài khoản thì xoá luôn; giới hạn số dòng và thời hạn.
 *   new EvalCache(db).lookup(rule, eng, nodes, list) → [{ i, move, score, mate }]
 *   .submit(who, rule, eng, nodes, items)           → { accepted, confirmed } · items: [{ moves, move, score, mate }]
 *   EvalCache.who(uid) · .dropWho(who) · .prune(now)
 */
'use strict';
const crypto = require('crypto');
const C = require('../../caro/rules.js');
const K = require('../../caro/eval-key.js');

const RULES = new Set(['free', 'std', 'renju', 'vn']);
const MAX_LIST = 200; // số thế tối đa mỗi lần hỏi / gửi (một ván dài + các thế sau nước tốt nhất)
const MAX_NODES = 1e8;
const WIN = 1000000;
const AGREE = 0.04; // hai lần chấm coi là khớp nếu khả năng thắng lệch ≤ 4%
const SUB_DAYS = 30; // lần gửi chưa được ai xác nhận giữ 30 ngày
const MAX_CACHE = 300000, MAX_SUB = 1000000;
const winChance = (s) => (s >= WIN - 1000 ? 1 : s <= -(WIN - 1000) ? 0 : 1 / (1 + Math.exp(-s / 360)));

/** Thế hợp lệ để chấm: nước hợp lệ, chưa ai thắng → khoá chuẩn + bàn cờ, hoặc null. */
function position(rule, moves) {
  if (!K.validMoves(moves)) return null;
  const b = new C.Board(rule);
  for (let i = 0; i < moves.length; i++) {
    const [x, y] = moves[i], p = i % 2 ? C.O : C.X;
    if (b.get(x, y) !== C.EMPTY) return null;
    b.play(x, y, p);
    if (C.checkWin(b, x, y, p)) return null; // ván đã kết thúc: thế này không cần chấm
  }
  return { c: K.canon(moves), b };
}

/** Kết quả chấm hợp lệ: nước đi vào ô trống, điểm trong thang của engine.js, thắng / thua chắc khớp dấu điểm. */
function validResult(b, r) {
  if (!r || !Array.isArray(r.move) || r.move.length !== 2 || !Number.isInteger(r.move[0]) || !Number.isInteger(r.move[1])) return false;
  if (b.get(r.move[0], r.move[1]) !== C.EMPTY) return false;
  if (!Number.isInteger(r.score) || Math.abs(r.score) > WIN) return false;
  if (r.mate !== null && r.mate !== undefined) {
    if (!Number.isInteger(r.mate) || r.mate === 0 || Math.abs(r.mate) > 999 || Math.sign(r.mate) !== Math.sign(r.score)) return false;
  }
  return true;
}

const agree = (a, b) => {
  const ma = a.mate || 0, mb = b.mate || 0;
  if (ma || mb) return Math.sign(ma) === Math.sign(mb) && ma !== 0 && mb !== 0;
  return Math.abs(winChance(a.score) - winChance(b.score)) <= AGREE;
};

class EvalCache {
  constructor(db) {
    this.db = db;
    const q = (sql) => db.prepare(sql);
    this.q = {
      get: q('SELECT nodes, move, score, mate FROM eval_cache WHERE key = ?'),
      used: q('UPDATE eval_cache SET used = ? WHERE key = ?'),
      put: q(`INSERT INTO eval_cache (key, nodes, move, score, mate, at, used) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET nodes = excluded.nodes, move = excluded.move, score = excluded.score, mate = excluded.mate, at = excluded.at`),
      sub: q(`INSERT INTO eval_sub (key, who, nodes, move, score, mate, at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key, who) DO UPDATE SET nodes = excluded.nodes, move = excluded.move, score = excluded.score, mate = excluded.mate, at = excluded.at`),
      peers: q('SELECT who, move, score, mate FROM eval_sub WHERE key = ? AND nodes = ? AND who <> ?'),
      dropWho: q('DELETE FROM eval_sub WHERE who = ?'),
      oldSubs: q('DELETE FROM eval_sub WHERE at < ?'),
      countSubs: q('SELECT COUNT(*) AS n FROM eval_sub'),
      countCache: q('SELECT COUNT(*) AS n FROM eval_cache'),
      trimSubs: q('DELETE FROM eval_sub WHERE rowid IN (SELECT rowid FROM eval_sub ORDER BY at LIMIT ?)'),
      trimCache: q('DELETE FROM eval_cache WHERE key IN (SELECT key FROM eval_cache ORDER BY used LIMIT ?)'),
    };
  }

  /** Mã người gửi (băm của id tài khoản – không lưu id thật). */
  static who(uid) {
    return crypto.createHash('sha256').update('caro-eval:' + uid).digest('hex').slice(0, 32);
  }

  static ok(rule, eng, nodes, list) {
    return RULES.has(rule) && eng === K.ENGINE && Number.isInteger(nodes) && nodes > 0 && nodes <= MAX_NODES &&
      Array.isArray(list) && list.length <= MAX_LIST;
  }

  /** Tra các thế: list[i] = các nước đi → điểm đã được xác nhận với số nút ≥ nodes, đổi về toạ độ của người hỏi. */
  lookup(rule, eng, nodes, list, now = Date.now()) {
    if (!EvalCache.ok(rule, eng, nodes, list)) return [];
    const hits = [];
    list.forEach((moves, i) => {
      const pos = position(rule, moves);
      if (!pos || !moves.length) return;
      const key = rule + '|' + eng + '|' + pos.c.key;
      const row = this.q.get.get(key);
      if (!row || row.nodes < nodes) return;
      const move = K.fromCanon(pos.c, JSON.parse(row.move));
      if (pos.b.get(move[0], move[1]) !== C.EMPTY) return; // không thể xảy ra với dữ liệu đúng – phòng hờ
      this.q.used.run(now, key);
      hits.push({ i, move, score: row.score, mate: row.mate === null ? null : row.mate });
    });
    return hits;
  }

  /** Nhận kết quả chấm của một người; thế nào có người khác (tài khoản khác) gửi khớp thì đưa vào bộ nhớ dùng chung. */
  submit(who, rule, eng, nodes, items, now = Date.now()) {
    const out = { accepted: 0, confirmed: 0 };
    if (!who || !EvalCache.ok(rule, eng, nodes, items)) return out;
    this.db.exec('BEGIN');
    try {
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const pos = position(rule, it.moves);
        if (!pos || !it.moves.length || !validResult(pos.b, it)) continue;
        const key = rule + '|' + eng + '|' + pos.c.key;
        const r = { move: K.toCanon(pos.c, it.move), score: it.score, mate: it.mate || null };
        this.q.sub.run(key, who, nodes, JSON.stringify(r.move), r.score, r.mate, now);
        out.accepted++;
        const peer = this.q.peers.all(key, nodes, who).find((p) => agree(p, r));
        if (!peer) continue;
        const cur = this.q.get.get(key);
        if (cur && cur.nodes > nodes) continue; // đã có kết quả chấm kỹ hơn
        this.q.put.run(key, nodes, JSON.stringify(r.move), r.score, r.mate, now, now);
        out.confirmed++;
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return out;
  }

  /** Xoá mọi lần gửi của một người (xoá tài khoản). Điểm đã được hai người xác nhận thì giữ – không còn gắn với ai. */
  dropWho(who) { this.q.dropWho.run(who); }

  /** Dọn: lần gửi quá SUB_DAYS ngày; quá giới hạn số dòng thì bỏ dòng cũ nhất / lâu không ai dùng nhất. */
  prune(now = Date.now()) {
    this.q.oldSubs.run(now - SUB_DAYS * 86400000);
    const subs = this.q.countSubs.get().n;
    if (subs > MAX_SUB) this.q.trimSubs.run(subs - MAX_SUB);
    const n = this.q.countCache.get().n;
    if (n > MAX_CACHE) this.q.trimCache.run(n - MAX_CACHE);
  }
}

module.exports = { EvalCache, position, validResult, agree, MAX_LIST, AGREE };
