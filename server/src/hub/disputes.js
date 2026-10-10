/*
 * Ván giải đấu kết thúc vì mất kết nối (quá 90 giây không quay lại): ban tổ chức được quyết định.
 *   - Công nhận (confirm): giữ kết quả – người mất kết nối thua ván đó.
 *   - Huỷ kết quả (annul): ván đó không tính. Arena: trả lại điểm; nhánh đấu: trận đấu tiếp từ tỉ số trước ván đó.
 *   - Cho đấu lại (replay): Arena: huỷ kết quả và ghép lại hai người ngay nếu cả hai đang rảnh;
 *     nhánh đấu: đánh lại cả trận từ 0–0.
 * Arena: kết quả được tính ngay (các ván khác vẫn chạy), ban tổ chức xử lý được tới khi giải kết thúc.
 * Nhánh đấu: trận tạm dừng chờ quyết định (không mở ván tiếp, không sang vòng sau); quá TOUR_DISPUTE_MS (5 phút)
 * mà chưa ai xử lý thì tự công nhận để giải không bị treo.
 */
'use strict';
const crypto = require('crypto');
const { E, note } = require('../msg.js');
const { userPid, uidOf } = require('./shared.js');
const ST = require('./stages.js');

const KEEP = 50;
const ACTIONS = ['confirm', 'annul', 'replay'];

class Disputes {
  /** Ghi một ván mất kết nối chờ xử lý và báo ban tổ chức. */
  openDispute(t, d) {
    const rec = { id: crypto.randomBytes(5).toString('hex'), at: Date.now(), status: 'open', ...d };
    t.disputes = [...(t.disputes || []), rec].slice(-KEEP);
    const args = { name: t.name, loser: this.player(t, d.l)?.name || '?', winner: this.player(t, d.w)?.name || '?' };
    for (const uid of this.tourManagers(t)) this.send(userPid(uid), note('tour_dispute_new', args));
    return rec;
  }

  /** Ban tổ chức đang có tài khoản: người tạo giải và quản lý CLB (quản trị viên xem trên trang giải). */
  tourManagers(t) {
    const out = new Set([t.creator]);
    const c = t.club && this.clubs.get(t.club);
    if (c) for (const uid of Object.keys(c.members)) if (this.isOfficer(c, uid)) out.add(uid);
    return out;
  }

  /** Danh sách gửi cho trang giải (mới nhất trước). */
  disputeViews(t) {
    const side = (u) => this.tourSide(t, u);
    return (t.disputes || []).slice(-20).reverse().map((d) => ({
      id: d.id, kind: d.kind, w: side(d.w), l: side(d.l), share: d.share || null, status: d.status, at: d.at,
      deadline: d.deadline || null, auto: !!d.auto, match: d.match || null,
    }));
  }

  /** Ban tổ chức xử lý: action = 'confirm' | 'annul' | 'replay'. */
  on_tourDispute(conn, { id, dispute, action }) {
    const t = this.requireManager(conn, id);
    if (!ACTIONS.includes(action)) throw E('bad_message');
    const d = (t.disputes || []).find((x) => x.id === dispute);
    if (!d || d.status !== 'open') throw E('dispute_gone');
    if (t.status !== 'running') throw E('dispute_closed');
    const res = this.resolveDispute(t, d, action, uidOf(conn.pid));
    conn.send(note(res === 'replay_later' ? 'tour_dispute_replay_later' : 'tour_dispute_saved'));
  }

  resolveDispute(t, d, action, by = null) {
    const res = d.kind === 'arena' ? this.resolveArena(t, d, action) : this.resolveBracket(t, d, action);
    d.status = action === 'confirm' ? 'confirmed' : action === 'annul' ? 'annulled' : 'replayed';
    d.by = by;
    d.auto = !by;
    d.done = Date.now();
    const code = 'tour_dispute_' + d.status;
    for (const uid of [d.w, d.l]) this.send(userPid(uid), note(code, { name: t.name }));
    this.saveTour(t);
    this.pushTour(t);
    return res;
  }

  /** Arena: kết quả đã tính – huỷ thì trả lại điểm và số ván; đấu lại thì ghép hai người ngay nếu được. */
  resolveArena(t, d, action) {
    if (action === 'confirm') return 'ok';
    const g = t.games.find((x) => x.gid === d.gid);
    for (const [uid, k] of [[d.w, 'wins'], [d.l, 'losses']]) {
      const p = this.player(t, uid);
      if (!p) continue;
      p.score = Math.max(0, p.score - ((d.pts && d.pts[uid]) || 0));
      p[k] = Math.max(0, p[k] - 1);
      p.games = Math.max(0, p.games - 1);
      if (uid === d.w) p.streak = Math.max(0, p.streak - 1);
    }
    if (g) { g.px = 0; g.po = 0; g.annulled = true; }
    if (action !== 'replay') return 'ok';
    const pw = this.player(t, d.w), pl = this.player(t, d.l);
    if (pw) pw.last = null;
    if (pl) pl.last = null;
    const free = (u) => this.available(u) && !this.inTourGame(t, u) && !this.player(t, u)?.withdrawn;
    if (Date.now() < t.endsAt && free(d.w) && free(d.l)) {
      this.openTourRoom(t, 'room', 1, d.w, d.l, crypto.randomInt(2) === 0, {});
      return 'ok';
    }
    return 'replay_later'; // chưa ghép ngay được: điểm đã trả lại, hai người có thể được ghép lại sau
  }

  /** Nhánh đấu: trận đang tạm dừng (m.hold) – ghi / bỏ ván đó rồi cho trận chạy tiếp. */
  resolveBracket(t, d, action) {
    const found = this.findMatch(t, d.match);
    if (!found || found.m.done || !found.m.hold) throw E('dispute_gone');
    const { st, m } = found;
    const h = m.hold;
    m.hold = null;
    m.readyAt = Date.now();
    if (action === 'confirm') {
      m.games.push({ share: h.share || null, w: h.w });
      m.wins = h.after;
      const decided = this.decideMatch(t, st, m, h.gameNo);
      if (decided !== undefined) this.finishMatch(t, st, m, decided);
      else m.carry = { wins: h.after, games: h.gameNo };
    } else if (action === 'annul') {
      m.wins = h.prev;
      m.carry = { wins: h.prev, games: h.gameNo - 1 };
    } else {
      m.games = [];
      m.wins = {};
      m.carry = null;
    }
    this.runBracket(t, Date.now());
    return 'ok';
  }

  /** Nhịp chạy: trận nhánh đấu chờ quá hạn thì tự công nhận; giải Arena kết thúc thì đóng các mục còn mở. */
  tickDisputes(t, now) {
    for (const d of t.disputes || []) {
      if (d.status !== 'open') continue;
      if (t.status !== 'running') { d.status = 'confirmed'; d.auto = true; continue; }
      if (d.kind === 'bracket' && d.deadline && now >= d.deadline) {
        try { this.resolveDispute(t, d, 'confirm'); } catch (e) { d.status = 'confirmed'; d.auto = true; }
      }
    }
  }

  /** Trận nhánh đấu đủ điều kiện kết thúc chưa (theo tỉ số m.wins sau gameNo ván). undefined = chưa. */
  decideMatch(t, st, m, gameNo) {
    const bo = st.cfg.bestOf, need = Math.floor(bo / 2) + 1;
    const wa = m.wins[m.a] || 0, wb = m.wins[m.b] || 0;
    if (wa >= need) return m.a;
    if (wb >= need) return m.b;
    if (!ST.isElim(st.type) && gameNo >= bo) return wa > wb ? m.a : wb > wa ? m.b : null; // vòng tròn / Thụy Sĩ: hoà được
    if (gameNo >= bo * 2) {
      // Loại trực tiếp hoà quá nhiều ván: ai thắng nhiều ván hơn, bằng nhau thì hạt giống cao hơn đi tiếp
      const pa = this.player(t, m.a), pb = this.player(t, m.b);
      return wa > wb ? m.a : wb > wa ? m.b : ((pa.seed || 999) <= (pb.seed || 999) ? m.a : m.b);
    }
    return undefined;
  }
}

module.exports = { Disputes };
