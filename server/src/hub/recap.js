/*
 * Tổng kết tháng / năm (kiểu "Wrapped"): số ván, luật / thời gian chơi nhiều nhất, thắng đẹp nhất, chuỗi thắng dài nhất,
 * đối thủ gặp nhiều nhất (chỉ khi CẢ HAI để lịch sử đấu công khai). Chỉ xem của chính mình. Tính từ các ván đã lưu
 * (tối đa 300 ván gần nhất – store.js) bằng caro/recap-core.js; giải đố / Storm lưu trên máy nên trình duyệt tự thêm.
 * Điểm đối thủ: điểm hiện tại theo loại thời gian của ván (không lưu điểm lúc đấu).
 * Tin nhắn: recap { from, to } (ms, khoảng ≤ 366 ngày – trình duyệt tính theo giờ máy) → { t: 'recap', from, to, data }
 */
'use strict';
const { E } = require('../msg.js');
const { DRAW } = require('../room.js');
const R = require('../rating.js');
const RC = require('../../../caro/recap-core.js');

const MAX_SPAN = 367 * 86400000;

class Recap {
  on_recap(conn, { from, to } = {}) {
    const me = this.requireUser(conn);
    this.throttle(conn, 'recap', 1000);
    from = Number(from); to = Number(to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > MAX_SPAN) throw E('bad_message');
    const mePub = this.histVisOf(me) === 'public';
    const games = this.store.statsGames(me.id, 300, from).filter((g) => g.created < to).map((g) => {
      const side = g.x_id === me.id ? 1 : 2;
      const pool = g.time_limit || g.clock ? R.poolOf({ timeLimit: g.time_limit, clock: g.clock }) : null;
      const ou = this.store.users.get(side === 1 ? g.o_id : g.x_id);
      const opp = ou ? { id: ou.id, name: ou.name, r: Math.round(R.ratingIn(ou, pool || 'classical').r), pub: mePub && this.histVisOf(ou) === 'public' } : null;
      return { id: g.id, at: g.created, rule: g.rule || 'vn', pool, share: g.share, res: g.winner === DRAW ? 'draw' : g.winner === side ? 'win' : 'loss', opp };
    });
    conn.send({ t: 'recap', from, to, data: RC.summarize(games) });
  }
}

module.exports = { Recap };
