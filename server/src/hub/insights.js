/*
 * Thống kê cá nhân (mục "Thống kê" ở hồ sơ): gom các ván đã lưu của một tài khoản (tối đa 300 ván – store.js) theo màu
 * quân, luật, loại thời gian, sức đối thủ, khai cuộc (chuẩn hoá đối xứng), độ dài ván. Phần tính: caro/insights-core.js.
 * Quyền xem: như Lịch sử đấu (history.js – Công khai · Bạn bè · Chỉ mình tôi); người đã chặn mình coi như không có.
 * Tin nhắn:
 *   insights { uid? } → { t: 'insights', owner: { id, name, self }, data, games?, recent?, hidden? }
 *     data: kết quả aggregate; games (chỉ của mình): [[mã nước đi, bên, lúc]] để trình duyệt ghép kết quả phân tích lưu trên
 *     máy; recent (chỉ của mình): RECENT ván gần nhất kèm nước đi cho nút "Phân tích N ván gần nhất".
 * Bộ nhớ tạm theo tài khoản: dùng lại tới khi có ván mới (lastGameId đổi) hoặc quá CACHE_MS (điểm đối thủ thay đổi dần).
 */
'use strict';
const { E } = require('../msg.js');
const { uidOf } = require('./shared.js');
const { DRAW } = require('../room.js');
const R = require('../rating.js');
const IC = require('../../../caro/insights-core.js');

const LIMIT = 300;
const RECENT = 20;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 2000;

class Insights {
  /** Dữ liệu thống kê của u (dùng bộ nhớ tạm nếu còn mới). */
  insightsOf(u, now = Date.now()) {
    const cache = this.insCache || (this.insCache = new Map());
    const last = this.store.lastGameId(u.id);
    const c = cache.get(u.id);
    if (c && c.last === last && now - c.at < CACHE_MS) return c;
    const rows = this.store.statsGames(u.id, LIMIT);
    const games = rows.map((g) => {
      const side = g.x_id === u.id ? 1 : 2;
      // Ván chơi theo lượt (corr.js): loại riêng "Theo lượt" – không gộp vào "không giới hạn giờ", sức đối thủ theo điểm corr
      const pool = g.kind === 'corr' ? 'corr' : g.time_limit || g.clock ? R.poolOf({ timeLimit: g.time_limit, clock: g.clock }) : 'none';
      const opp = this.store.users.get(side === 1 ? g.o_id : g.x_id);
      const b = opp && pool !== 'none' ? IC.band(R.ratingIn(u, pool).r, R.ratingIn(opp, pool).r) : 'unknown';
      return {
        at: g.created, rule: g.rule || 'vn', pool, side, band: b, moves: g.moves, share: g.share,
        res: g.winner === DRAW ? 'draw' : g.winner === side ? 'win' : 'loss',
      };
    });
    const out = {
      last, at: now, data: IC.aggregate(games),
      games: games.map((g) => [IC.hash(g.moves), g.side, g.at]),
      recent: games.slice(0, RECENT).filter((g) => g.moves.length >= 6).map((g) => ({ share: g.share, side: g.side, rule: g.rule, at: g.at, moves: g.moves })),
    };
    cache.delete(u.id);
    cache.set(u.id, out);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return out;
  }

  on_insights(conn, { uid } = {}) {
    this.throttle(conn, 'insights', 1000);
    const viewer = uidOf(conn.pid);
    const target = uid ? this.store.users.get(uidOf(uid) || uid) : viewer && this.store.users.get(viewer);
    if (!target) throw E(uid ? 'player_not_found' : 'need_account');
    // Người đã chặn mình: coi như không có (không lộ là đã bị chặn)
    if (viewer && viewer !== target.id && target.blocked.includes(viewer)) throw E('player_not_found');
    const self = viewer === target.id;
    const owner = { id: target.id, name: target.name, self };
    if (!this.canSeeHistory(viewer, target)) return conn.send({ t: 'insights', owner, hidden: true });
    const r = this.insightsOf(target);
    conn.send({ t: 'insights', owner, data: r.data, ...(self ? { games: r.games, recent: r.recent } : {}) });
  }
}

module.exports = { Insights };
