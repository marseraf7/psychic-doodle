/*
 * Giải đấu – kết quả do ban tổ chức nhập (như MyLeague):
 *  - Giải offline (t.offline): trận diễn ra ngoài đời; ban tổ chức nhập tỉ số từng set (ván), tỉ số trận tự suy ra theo
 *    cách tính của giải (t.scoreMode): số set thắng, hoặc tổng điểm các set. Bằng nhau thì "kết quả phụ" (luân lưu)
 *    quyết định; vòng tròn / Thụy Sĩ được hoà, loại trực tiếp thì bắt buộc phân thắng thua.
 *  - Giải trực tuyến: ban tổ chức ghi đè kết quả một trận chưa đấu / không đấu được (xử thắng cho một bên).
 *  - Huỷ kết quả: trận trở về chưa đấu, nhánh đấu lùi lại – chỉ khi các trận phụ thuộc chưa đấu.
 * Quyền: người tạo giải, quản lý CLB của giải, quản trị viên (quyền cao nhất). Không đổi Elo (giải offline không tính Elo).
 */
'use strict';
const { E, note } = require('../msg.js');
const ST = require('./stages.js');
const { uidOf, userPid } = require('./shared.js');

const MAX_SETS = 9;
const MAX_POINT = 999;

/** Đọc một cặp tỉ số [a, b] (số nguyên 0..999). */
function pair(x) {
  if (!Array.isArray(x) || x.length !== 2) return null;
  const [a, b] = x.map((v) => Math.floor(Number(v)));
  return Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= 0 && a <= MAX_POINT && b <= MAX_POINT ? [a, b] : null;
}

/** Tỉ số trận từ các set: { ka, kb } theo cách tính (số set thắng / tổng điểm). */
function matchScore(sets, mode) {
  if (mode === 'points') return { ka: sets.reduce((t, s) => t + s[0], 0), kb: sets.reduce((t, s) => t + s[1], 0) };
  return { ka: sets.filter((s) => s[0] > s[1]).length, kb: sets.filter((s) => s[1] > s[0]).length };
}

class TourScore {
  /** Giải offline đang chạy: không mở phòng, chỉ xử thắng khi một bên đã rút (bị loại khỏi giải). */
  runOffline(t) {
    for (let guard = 0; guard < 500 && t.status === 'running'; guard++) {
      const st = this.curStage(t);
      const m = ST.playable(st).find((x) => this.player(t, x.a).withdrawn || this.player(t, x.b).withdrawn);
      if (!m) break;
      const pa = this.player(t, m.a), pb = this.player(t, m.b);
      if (pa.withdrawn && pb.withdrawn && !ST.isElim(st.type)) this.finishMatch(t, st, m, null, { double: true, walkover: true });
      else this.finishMatch(t, st, m, pa.withdrawn ? m.b : m.a, { walkover: true });
      this.saveTour(t);
      this.pushTour(t);
    }
    this.notifyMatchReady(t); // báo người chơi có tài khoản: trận đã sẵn sàng (tour-notes.js)
  }

  /** Trận đang sẵn sàng (đủ 2 người, chưa xong) ở giai đoạn hiện tại mà ban tổ chức được nhập / ghi đè. */
  scoreTarget(conn, id, match, self = false) {
    let t, mine = false;
    try { t = this.requireManager(conn, id, 'results'); } catch (e) {
      // Người chơi tự báo tỉ số trận của mình (giải offline bật "selfReport", người chơi có tài khoản – như Challonge).
      // Tra cả theo link riêng (slug) như mọi handler khác qua findTour: trước đây chỉ tra theo mã giải nên
      // tự báo bằng slug bị ném lại lỗi tour_managers_only dù người báo đúng là người chơi (mục 74h)
      const uid = uidOf(conn.pid), x = uid && (this.tours.get(String(id || '')) || this.tourBySlug(id));
      if (!self || !x || !x.offline || !x.selfReport || !this.canSeeTour(x, uid)) throw e;
      t = x;
      mine = uid;
    }
    if (t.status !== 'running' || t.format !== 'bracket') throw E('tour_not_running');
    const found = this.findMatch(t, match);
    if (!found || found.st !== this.curStage(t)) throw E('tour_match_not_found');
    if (mine && (found.m.done || (found.m.a !== mine && found.m.b !== mine))) throw E('tour_managers_only');
    return { t, ...found, self: !!mine };
  }

  /**
   * Nhập tỉ số (giải offline): sets = [[a, b], …] theo thứ tự ô a / b của trận; extra = [a, b] kết quả phụ (tuỳ chọn).
   * Ghi đè (giải trực tuyến): winner = mã người thắng.
   * "Quick advance" (giải offline bật t.quickAdvance – như Challonge): chỉ báo người thắng (winner), hoặc hoà (draw: true,
   * chỉ vòng tròn / Thụy Sĩ), không nhập tỉ số.
   */
  on_tourScore(conn, { id, match, sets, extra, winner, draw }) {
    const { t, st, m, self } = this.scoreTarget(conn, id, match, true);
    if (m.done) throw E('tour_match_done');
    // Trận đang tạm dừng chờ xử lý khiếu nại mất kết nối: chỉ được chốt qua quyết định khiếu nại (công nhận /
    // huỷ / đấu lại). Cho nhập / ghi đè ở đây thì khiếu nại kẹt "open", hết hạn sẽ tự ghi "confirmed" sai nội
    // dung và cờ hold không bao giờ được gỡ (rà soát 16/11/2026, mục 67)
    if (m.hold) throw E('tour_match_held');
    if (!ST.real(m.a) || !ST.real(m.b)) throw E('tour_match_not_ready');
    const by = conn.pid;
    if (!t.offline) {
      if (m.room && this.rooms.has(m.room)) throw E('tour_match_live');
      if (winner !== m.a && winner !== m.b) throw E('tour_score_bad');
      m.override = true;
      this.finishMatch(t, st, m, winner, { walkover: true });
    } else {
      const r = this.readScore(t, st, m, { sets, extra, winner, draw }); // sai thì ném lỗi, chưa đổi gì
      if (self) {
        // Người chơi tự báo: mới là ĐỀ XUẤT. Kết quả chỉ chốt khi đối thủ báo trùng, hoặc ban tổ chức nhập / xác nhận
        // (trước đây một người tự báo là chốt luôn → tự thắng tới vô địch, không đảo ngược được – rà soát 16/11/2026, mục 2)
        const who = uidOf(conn.pid), opp = m.a === who ? m.b : m.a;
        const key = JSON.stringify([r.quick, r.sets, r.extra, r.winner]);
        if (!(m.claim && m.claim.by === opp && m.claim.key === key)) {
          m.claim = { by: who, at: Date.now(), key, sets: r.sets, extra: r.extra, w: r.winner };
          const side = (u) => (this.player(t, u) || {}).name || '?';
          const args = { name: t.name, who: side(who), a: side(m.a), b: side(m.b) };
          for (const uid of new Set([opp, ...this.tourManagers(t, 'results')])) if (uid !== who && ST.real(uid)) this.send(userPid(uid), note('tour_claim', args));
          this.tourLog(t, who, 'self_claim', { match: m.id, a: args.a, b: args.b, s: r.sets ? r.sets.map((x) => x.join('-')).join(' ') : null, w: ST.real(r.winner) ? side(r.winner) : null });
          this.saveTour(t);
          this.pushTour(t);
          return;
        }
      }
      delete m.claim;
      m.quick = r.quick;
      m.sets = r.sets;
      m.extra = r.extra;
      m.wins = r.wins;
      this.finishMatch(t, st, m, r.winner);
      if (t.status === 'running') this.runOffline(t);
    }
    m.by = by ? String(by) : null;
    const side = (u) => (this.player(t, u) || {}).name || '?';
    this.tourLog(t, this.requireUser(conn).id, self ? 'self_score' : t.offline ? 'score' : 'override', { match: m.id, a: side(m.a), b: side(m.b), s: m.sets ? m.sets.map((x) => x.join('-')).join(' ') : null, w: ST.real(m.winner) ? side(m.winner) : null });
    this.saveTour(t);
    this.pushTour(t);
  }

  /**
   * Đọc và kiểm kết quả giải offline (chưa ghi gì): { quick, sets, extra, wins, winner } – winner null = hoà.
   * Sai thì ném lỗi tour_score_bad / tour_score_tie.
   */
  readScore(t, st, m, { sets, extra, winner, draw }) {
    if (t.quickAdvance && sets == null) {
      const tie = draw === true && !ST.isElim(st.type);
      if (!tie && winner !== m.a && winner !== m.b) throw E('tour_score_bad');
      return { quick: true, sets: null, extra: null, winner: tie ? null : winner, wins: tie ? { [m.a]: 0, [m.b]: 0 } : { [winner]: 1, [winner === m.a ? m.b : m.a]: 0 } };
    }
    const list = Array.isArray(sets) ? sets.slice(0, MAX_SETS).map(pair) : [];
    if (!list.length || list.some((x) => !x)) throw E('tour_score_bad');
    // Số set không vượt Bo của trận (trước đây trận Bo1 nhận 9 set × 999–0, phồng hiệu số ván – rà soát 16/11/2026, mục 15)
    if (sets.length > ST.boOf(st, m)) throw E('tour_score_bad');
    const ex = extra == null ? null : pair(extra);
    if (extra != null && !ex) throw E('tour_score_bad');
    const { ka, kb } = matchScore(list, t.scoreMode);
    let w = ka > kb ? m.a : kb > ka ? m.b : null;
    if (w === null && ex && ex[0] !== ex[1]) w = ex[0] > ex[1] ? m.a : m.b;
    if (w === null && ST.isElim(st.type)) throw E('tour_score_tie');
    // wins luôn là số set thắng (bảng điểm / tie-break đọc như số ván thắng); cách tính chỉ quyết định ai thắng
    const sw = matchScore(list, 'sets');
    return { quick: false, sets: list, extra: ex, winner: w, wins: { [m.a]: sw.ka, [m.b]: sw.kb } };
  }

  /** Huỷ kết quả một trận: chỉ khi các trận nhận người thắng / thua của nó chưa đấu (và giai đoạn chưa chuyển). */
  on_tourScoreUndo(conn, { id, match }) {
    const { t, st, m } = this.scoreTarget(conn, id, match);
    // Đang chờ xếp nhánh giai đoạn sau (người đi tiếp đã chốt): không huỷ kết quả giai đoạn trước nữa
    if (!m.done || m.bye || m.split || t.arrange) throw E('tour_undo_locked');
    // Trận trực tuyến đã đấu thật (đã tính Elo, có ván phát lại): không huỷ được – chỉ trận ban tổ chức xử / vắng mặt
    if (!t.offline && m.games && m.games.length) throw E('tour_undo_online');
    if (ST.isElim(st.type)) {
      const targets = [m.next, m.loserTo].filter(Boolean).map((r) => ({ r, x: st.matches[r.to] }));
      if (targets.some(({ x }) => x.done || (x.room && this.rooms.has(x.room)))) throw E('tour_undo_locked');
      const g2 = m.gf === 1 && st.gf[1] && st.matches[st.gf[1]];
      if (g2 && g2.done && !g2.skipped) throw E('tour_undo_locked');
      for (const { r, x } of targets) { x[r.slot] = null; x.readyAt = null; }
      if (g2) Object.assign(g2, { done: false, skipped: false, winner: null, loser: null, a: null, b: null });
    } else if (st.type === 'swiss' && m.round < st.rounds.length - 1) throw E('tour_undo_locked');
    Object.assign(m, { done: false, winner: null, loser: null, wins: {}, sets: null, extra: null, walkover: false, double: false, override: false, quick: false, readyAt: Date.now() });
    delete m.claim;
    st.done = false;
    for (const u of [m.a, m.b]) {
      const p = ST.real(u) && this.player(t, u);
      if (p && p.out === 'lost') p.out = null;
    }
    this.tourLog(t, this.requireUser(conn).id, 'undo', { match: m.id });
    this.saveTour(t);
    this.pushTour(t);
  }
}

module.exports = { TourScore, matchScore };
