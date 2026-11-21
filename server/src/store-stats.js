/*
 * Đọc ván đã lưu để làm thống kê (Thống kê cá nhân – hub/insights.js, Tổng kết – hub/recap.js). Trộn vào Store.prototype
 * (store.js). Chỉ đọc: bảng games + user_games (có chỉ mục theo uid, game_id).
 */
'use strict';

const row = (r) => (r ? { ...r } : null); // node:sqlite trả về đối tượng không có prototype

class StatsStore {
  /** Mã ván mới nhất của uid (0 nếu chưa có) – đổi khi có ván mới, dùng để biết bộ nhớ tạm thống kê đã cũ chưa. */
  lastGameId(uid) {
    return this.db.prepare('SELECT MAX(game_id) AS m FROM user_games WHERE uid = ?').get(uid).m || 0;
  }

  /**
   * limit ván gần nhất của uid kèm nước đi (mới nhất trước). since: chỉ ván từ thời điểm này (ms).
   * Trả [{ id, share, created, kind, time_limit, clock, rule, x_id, o_id, x_name, o_name, winner, reason, moves: [[x, y]] }].
   */
  statsGames(uid, limit = 300, since = 0) {
    return this.db.prepare(`SELECT g.id, g.share, g.created, g.kind, g.time_limit, g.clock, g.rule, g.x_id, g.o_id, g.x_name, g.o_name,
      g.winner, g.reason, g.moves FROM user_games ug JOIN games g ON g.id = ug.game_id WHERE ug.uid = ? AND g.created >= ?
      ORDER BY g.id DESC LIMIT ?`).all(uid, since, limit).map((r) => {
      const g = row(r);
      try { g.moves = JSON.parse(g.moves); } catch (e) { g.moves = []; } // bản ghi hỏng: coi như ván rỗng
      return g;
    });
  }
}

module.exports = { StatsStore };
