/*
 * Hạng đấu tuần (tên trong game: "Hạng đấu tuần"): mỗi ván online tính điểm giữa hai tài khoản cho điểm hạng đấu trong
 * tuần ISO (giờ Việt Nam). Người có ván đầu tiên trong tuần vào một nhóm ≤ 30 người cùng bậc; cuối tuần người đứng đầu
 * nhóm lên bậc, người cuối nhóm xuống bậc (league-core.js). Lưu trữ: store-league.js.
 * Chống cày điểm (league-core.js gamePoints): ván dưới 10 nước / bỏ ván không có điểm; gặp lại cùng đối thủ trong tuần
 * điểm giảm dần; chuỗi ≥ 3 ván liền cùng một người thắng giữa hai người → cặp bị đánh dấu, cả tuần không có điểm nữa.
 * Chốt tuần (leagueTick): gọi ở nhịp quét mỗi phút (core.js sweep), khi có ván mới và khi mở trang. Trạng thái tuần đang mở
 * lưu trong CSDL ('week'), chốt trong một giao dịch và đánh dấu 'done:<tuần>' → khởi động lại, chạy lại nhiều lần vẫn chỉ
 * chốt một lần; máy chủ tắt qua nhiều tuần thì lần chạy sau chốt tuần còn mở. Chốt xong gửi thông báo (tour-notes.js pushNote).
 * Tin nhắn: league {} → { t: 'league', week, ends, div, best, me, group, up, down, hist }
 */
'use strict';
const LC = require('../league-core.js');
const { DRAW } = require('../room.js');

const KEEP_WEEKS = 4; // giữ bảng nhóm của 4 tuần gần nhất

class League {
  /** Tuần đổi thì chốt tuần cũ. Trả về kết quả chốt (để kiểm thử) hoặc null. */
  leagueTick(now = Date.now()) {
    const cur = LC.weekKey(now);
    const open = this.store.lgState('week');
    if (!open) { this.store.lgSetState('week', cur); return null; }
    if (open >= cur) return null; // cùng tuần (hoặc đồng hồ lùi): không làm gì
    const res = this.leagueClose(open, now);
    this.store.lgSetState('week', cur);
    return res;
  }

  /**
   * Chốt tuần week: xếp hạng từng nhóm, đổi bậc, ghi lịch sử – một giao dịch, chỉ một lần. BEGIN IMMEDIATE giữ khoá ghi
   * từ đầu và kiểm 'done:<tuần>' BÊN TRONG giao dịch: hai tiến trình cùng mở một CSDL (chạy song song / khởi động lại chồng
   * nhau) thì tiến trình sau thấy tuần đã chốt, không chốt và không gửi thông báo lần hai.
   */
  leagueClose(week, now = Date.now()) {
    const S = this.store;
    let res;
    S.lg().exec('BEGIN IMMEDIATE');
    try {
      if (S.lgState('done:' + week)) { S.lg().exec('COMMIT'); return []; }
      res = LC.rollover(S.lgWeekMembers(week));
      for (const r of res) { S.lgAddHist(r, week); S.lgSetDiv(r.uid, r.next); }
      S.lgSetState('done:' + week, now);
      S.lgPrune(LC.weekKey(LC.weekStart(week) - KEEP_WEEKS * 7 * 86400000));
      S.lg().exec('COMMIT');
    } catch (e) {
      S.lg().exec('ROLLBACK');
      throw e;
    }
    for (const r of res) this.pushNote(r.uid, { k: 'league', week, outcome: r.outcome, div: r.next, rank: r.rank });
    return res;
  }

  /** Ván tính điểm vừa xong (rooms.js settle): cộng điểm hạng đấu cho hai người. Lỗi chỉ ghi log, không ảnh hưởng ván. */
  leagueOnRated(room, ux, uo, moves, now = Date.now()) {
    try {
      this.leagueTick(now);
      const S = this.store, week = LC.weekKey(now);
      const draw = room.winner === DRAW;
      const winnerId = draw ? null : room.winner === 1 ? ux.id : uo.id;
      const pair = S.lgPair(week, ux.id, uo.id);
      const lo = ux.id < uo.id ? ux.id : uo.id;
      // Ván trước trong tuần nhìn từ phía u ('a' = người có id nhỏ hơn thắng)
      const view = (u) => [...pair.res].map((c) => (c === 'd' ? 'draw' : (c === 'a') === (u.id === lo) ? 'win' : 'loss'));
      let flag = false;
      const out = {};
      for (const [u, side] of [[ux, 1], [uo, 2]]) {
        const result = draw ? 'draw' : room.winner === side ? 'win' : 'loss';
        const r = LC.gamePoints({ result, moves: moves.length, reason: room.reason, prior: view(u), flagged: !!pair.flag });
        if (r.flag) flag = true;
        S.lgJoin(week, u.id, LC.GROUP);
        S.lgAddPoints(week, u.id, r.pts, now);
        out[u.id] = r;
      }
      S.lgPushPair(week, ux.id, uo.id, draw ? 'd' : winnerId === lo ? 'a' : 'b', flag);
      return out;
    } catch (e) {
      console.error('[league] lỗi cộng điểm hạng đấu:', e);
      return null;
    }
  }

  /** Huy hiệu bậc cho trang hồ sơ: { div, best } hoặc null (chưa từng vào hạng đấu). */
  leagueBadge(uid) {
    try {
      const r = this.store.lg().prepare('SELECT div, best FROM league_div WHERE uid = ?').get(uid);
      if (r) return { div: r.div, best: r.best };
      return this.store.lgMember(LC.weekKey(Date.now()), uid) ? { div: 0, best: 0 } : null;
    } catch (e) { return null; }
  }

  on_league(conn) {
    const me = this.requireUser(conn);
    this.throttle(conn, 'league', 500);
    this.leagueTick();
    const S = this.store, week = LC.weekKey(Date.now());
    const d = S.lgDiv(me.id);
    const m = S.lgMember(week, me.id);
    let group = [], up = 0, down = 0;
    if (m) {
      const list = S.lgGroup(week, m.div, m.grp).sort((a, b) => LC.order(a, b));
      up = m.div < LC.DIVS.length - 1 ? LC.moveCount(list.length) : 0;
      down = m.div > 0 ? LC.moveCount(list.length) : 0;
      group = list.map((x, i) => ({ rank: i + 1, id: x.uid, name: S.users.get(x.uid)?.name || '?', pts: x.pts, games: x.games, me: x.uid === me.id }));
    }
    conn.send({
      t: 'league', week, ends: LC.weekEnd(week), div: m ? m.div : d.div, best: d.best, me: !!m, group, up, down,
      size: LC.GROUP, hist: S.lgHist(me.id, 8), divs: LC.DIVS,
    });
  }
}

module.exports = { League };
