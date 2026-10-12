/*
 * Lịch sử đấu (như Lichess): xem ván của mình và của người khác, tuỳ quyền riêng tư chủ lịch sử chọn.
 *   u.histVis: 'public' (mặc định – ai cũng xem được) | 'friends' (chỉ bạn bè) | 'private' (chỉ mình tôi)
 * Tin nhắn:
 *   history    { uid?, before? } → { t: 'history', owner: { id, name, self, vis }, games, more, hidden? }
 *              uid bỏ trống = lịch sử của mình; before = id ván cuối trang trước (tải thêm)
 *   setHistVis { vis }          → { t: 'histVis', vis }
 * Máy chủ chỉ đọc ván đã lưu (SQLite, có chỉ mục) theo trang 20 ván – việc phân tích làm trên máy người xem.
 */
'use strict';
const { DRAW } = require('../room.js');
const { E } = require('../msg.js');
const { uidOf } = require('./shared.js');

const VIS = ['public', 'friends', 'private'];
const PAGE = 20;

class History {
  histVisOf(u) { return VIS.includes(u.histVis) ? u.histVis : 'public'; }

  /** Người xem viewerUid (null = khách) có được xem lịch sử đấu của u không. */
  canSeeHistory(viewerUid, u) {
    if (viewerUid && viewerUid === u.id) return true;
    if (viewerUid && u.blocked.includes(viewerUid)) return false;
    const v = this.histVisOf(u);
    if (v === 'public') return true;
    if (v === 'friends') return !!viewerUid && u.friends.includes(viewerUid);
    return false;
  }

  /** Danh sách ván của u (nhìn từ phía u). */
  historyItems(u, limit, before) {
    return this.store.history(u.id, limit, before).map((g) => {
      const side = g.x_id === u.id ? 1 : 2;
      return {
        id: g.id, share: g.share, created: g.created, kind: g.kind, timeLimit: g.time_limit, clock: g.clock || null, opening: g.opening || 'free', rule: g.rule || 'vn',
        opponent: side === 1 ? g.o_name : g.x_name, mySide: side,
        result: g.winner === DRAW ? 'draw' : g.winner === side ? 'win' : 'loss',
        reason: g.reason, moves: g.moves,
      };
    });
  }

  on_history(conn, { uid, before } = {}) {
    const viewer = uidOf(conn.pid);
    const target = uid ? this.store.users.get(uidOf(uid) || uid) : viewer && this.store.users.get(viewer);
    if (!target) throw E(uid ? 'player_not_found' : 'need_account');
    // Người đã chặn mình: coi như không có (không lộ là đã bị chặn)
    if (viewer && viewer !== target.id && target.blocked.includes(viewer)) throw E('player_not_found');
    const self = viewer === target.id;
    const owner = { id: target.id, name: target.name, self, vis: this.histVisOf(target) };
    if (!this.canSeeHistory(viewer, target)) return conn.send({ t: 'history', owner, games: [], more: false, hidden: true });
    const games = this.historyItems(target, PAGE + 1, before);
    conn.send({ t: 'history', owner, games: games.slice(0, PAGE), more: games.length > PAGE, before: Number(before) || 0 });
  }

  on_setHistVis(conn, { vis }) {
    const me = this.requireUser(conn);
    if (!VIS.includes(vis)) throw E('bad_message');
    me.histVis = vis;
    this.store.touch(me);
    conn.send({ t: 'histVis', vis });
  }
}

module.exports = { History, HIST_VIS: VIS };
