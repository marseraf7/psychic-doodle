/*
 * Tổng kết tháng / năm (kiểu "Wrapped"): số ván, luật / thời gian chơi nhiều nhất, thắng đẹp nhất, chuỗi thắng dài nhất,
 * đối thủ gặp nhiều nhất (chỉ khi CẢ HAI để lịch sử đấu công khai). Chỉ xem của chính mình. Tính từ các ván đã lưu
 * (tối đa 300 ván gần nhất – store.js) bằng caro/recap-core.js; giải đố / Storm lưu trên máy nên trình duyệt tự thêm.
 * Điểm đối thủ: điểm hiện tại theo loại thời gian của ván (không lưu điểm lúc đấu).
 * Kỳ tháng / năm và "ngày có chơi" theo múi giờ THIẾT BỊ đã lưu của tài khoản (local-time.js: tên IANA – đúng giờ mùa hè – hoặc
 * số phút lệch UTC; chưa có thì giờ Việt Nam).
 * Tin nhắn: recap { kind: 'month' | 'year', y, m } → { t: 'recap', kind, y, m, from, to, data }. Máy bản cũ gửi { from, to } (ms,
 * khoảng ≤ 366 ngày – trình duyệt tính theo giờ máy): vẫn nhận, "ngày có chơi" vẫn theo múi giờ đã lưu.
 */
'use strict';
const { E } = require('../msg.js');
const { DRAW } = require('../room.js');
const R = require('../rating.js');
const RC = require('../../../caro/recap-core.js');
const LT = require('../local-time.js');

const DAY = 86400000;
const MAX_SPAN = 367 * DAY;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

class Recap {
  on_recap(conn, { from, to, kind, y, m } = {}) {
    const me = this.requireUser(conn);
    this.throttle(conn, 'recap', 1000);
    const zone = LT.tzOf(me);
    let keep = () => true;
    if (kind !== undefined) {
      if (!(kind === 'year' || kind === 'month') || !int(y, 1970, 9999) || (kind === 'month' && !int(m, 1, 12))) throw E('bad_message');
      if (kind === 'year') m = undefined;
      // Lấy rộng thêm 1 ngày mỗi đầu (múi giờ lệch tối đa ±14 giờ) rồi lọc đúng theo khoá tháng / năm địa phương
      const want = kind === 'year' ? String(y) : `${y}-${String(m).padStart(2, '0')}`;
      from = (kind === 'year' ? Date.UTC(y, 0, 1) : Date.UTC(y, m - 1, 1)) - DAY;
      to = (kind === 'year' ? Date.UTC(y + 1, 0, 1) : Date.UTC(y, m, 1)) + DAY;
      keep = (at) => LT.localKey(at, zone)[kind] === want;
    } else {
      from = Number(from); to = Number(to);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > MAX_SPAN) throw E('bad_message');
    }
    const mePub = this.histVisOf(me) === 'public';
    const games = this.store.statsGames(me.id, 300, from).filter((g) => g.created < to && keep(g.created)).map((g) => {
      const side = g.x_id === me.id ? 1 : 2;
      const pool = g.time_limit || g.clock ? R.poolOf({ timeLimit: g.time_limit, clock: g.clock }) : null;
      const ou = this.store.users.get(side === 1 ? g.o_id : g.x_id);
      const opp = ou ? { id: ou.id, name: ou.name, r: Math.round(R.ratingIn(ou, pool || 'classical').r), pub: mePub && this.histVisOf(ou) === 'public' } : null;
      return { id: g.id, at: g.created, rule: g.rule || 'vn', pool, share: g.share, res: g.winner === DRAW ? 'draw' : g.winner === side ? 'win' : 'loss', opp };
    });
    conn.send({ t: 'recap', kind, y, m, from, to, data: RC.summarize(games, (at) => LT.localKey(at, zone).day) });
  }
}

module.exports = { Recap };
