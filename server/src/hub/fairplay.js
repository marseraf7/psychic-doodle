/*
 * Soát chơi đẹp v1 (nhẹ) – KHÔNG xử phạt tự động, chỉ gom dữ liệu cho quản trị viên tự quyết:
 *  (a) Rời tab / mất tiêu điểm trong ván online giữa hai tài khoản: trình duyệt người chơi báo (fpBlur – chỉ trong lượt của
 *      mình, đã gom, tối đa 1 tin / 3 giây), máy chủ cộng vào phòng (có trần) rồi lưu kèm ván khi ván xong (fp_game).
 *  (b) Hàng chờ xem lại (fp_queue): ván rời tab nhiều (BLUR_N lần hoặc BLUR_MS), ván bàn đầu của giải (một trong hai người
 *      đang ở TOP_BOARDS hạng đầu giải), ván bị báo cáo gian lận (social.js on_report lý do 'cheat'). Máy chủ không chạy
 *      được Rapfi nên phần so với máy cờ chạy trên trình duyệt của quản trị viên khi mở hàng chờ (fairplay-admin.js, bộ phân
 *      tích song song an-pool.js) rồi gửi kết quả về (fpResult) – tỉ lệ trùng nước máy cờ, mức tụt khả năng thắng trung bình.
 *  (c) Trang quản trị: fpQueue / fpResult / fpMark (requireAdmin, như admin.js / playban.js).
 * Ghi trong chính sách quyền riêng tư (privacy.html): dữ liệu gì, để làm gì.
 */
'use strict';
const { E } = require('../msg.js');
const { uidOf } = require('./shared.js');

const MAX_N = 200, MAX_MS = 3600 * 1000; // trần mỗi bên mỗi ván
const STEP_N = 3, STEP_MS = 5 * 60 * 1000; // trần mỗi tin
const BLUR_N = 8, BLUR_MS = 90 * 1000;
const TOP_BOARDS = 3;
const STATUSES = ['open', 'reviewed', 'dismissed'];

const num = (v, hi) => Math.max(0, Math.min(hi, Math.round(Number(v)) || 0));

class Fairplay {
  /** Người chơi báo rời tab trong lượt của mình. Sai / quá nhanh thì lặng lẽ bỏ qua (không làm phiền người chơi). */
  on_fpBlur(conn, { n, ms } = {}) {
    const pid = conn.pid;
    const room = this.roomFor(pid);
    const now = Date.now();
    if (!room || !room.inProgress || !uidOf(pid)) return; // khách: không theo dõi
    if (conn.fpAt && now - conn.fpAt < 3000 * this.T.THROTTLE_SCALE) return;
    conn.fpAt = now;
    const side = room.sideOf(pid);
    if (!side) return;
    if (!room.fp || room.fp.g !== room.gameNo) room.fp = { g: room.gameNo, 1: { n: 0, ms: 0 }, 2: { n: 0, ms: 0 } };
    const f = room.fp[side];
    f.n = Math.min(MAX_N, f.n + num(n, STEP_N));
    f.ms = Math.min(MAX_MS, f.ms + num(ms, STEP_MS));
  }

  /** Ván vừa lưu (rooms.js settle, giữa hai tài khoản): lưu số lần rời tab, đưa vào hàng chờ nếu cần. */
  fpOnSettle(room, share) {
    try {
      if (!share) return;
      const fp = room.fp && room.fp.g === room.gameNo ? room.fp : null;
      if (fp && (fp[1].n || fp[2].n)) {
        this.store.fpSaveBlur(share, fp[1], fp[2]);
        if ([1, 2].some((s) => fp[s].n >= BLUR_N || fp[s].ms >= BLUR_MS)) this.store.fpEnqueue(share, 'blur');
      }
      if (room.tour && this.fpTopBoard(room)) this.store.fpEnqueue(share, 'tour_top');
    } catch (e) {
      console.error('[fairplay] lỗi lưu ván:', e);
    }
  }

  /** Ván của giải mà một trong hai người đang ở TOP_BOARDS hạng đầu (Arena: theo điểm; giải khác: theo hạt giống). */
  fpTopBoard(room) {
    const t = this.tours && this.tours.get(room.tour.id);
    if (!t || !Array.isArray(t.players)) return false;
    const rating = (p) => this.store.users.get(p.uid)?.rating || p.rating || 0;
    const list = t.players.filter((p) => !p.withdrawn);
    if (t.format === 'arena') list.sort((a, b) => (b.score || 0) - (a.score || 0) || rating(b) - rating(a));
    else list.sort((a, b) => (a.seed || 999) - (b.seed || 999) || rating(b) - rating(a));
    const top = new Set(list.slice(0, TOP_BOARDS).map((p) => p.uid));
    return [1, 2].some((s) => top.has(uidOf(room.seats[s])));
  }

  /** Bị báo cáo gian lận (social.js): đưa ván gần nhất giữa hai người (hoặc ván gần nhất của người bị báo cáo) vào hàng chờ. */
  fpReport(reporterUid, targetUid) {
    try {
      const games = this.store.statsGames(targetUid, 30);
      const g = games.find((x) => x.x_id === reporterUid || x.o_id === reporterUid) || games[0];
      if (g) this.store.fpEnqueue(g.share, 'report');
    } catch (e) {
      console.error('[fairplay] lỗi báo cáo:', e);
    }
  }

  on_fpQueue(conn, { status } = {}) {
    this.requireAdmin(conn);
    const st = [...STATUSES, 'all'].includes(status) ? status : 'open';
    conn.send({ t: 'fpQueue', status: st, items: this.store.fpQueue(st), open: this.store.fpOpenCount() });
  }

  /** Kết quả so với máy cờ do trình duyệt quản trị viên tính: { 1: { n, match, loss, acc }, 2: {…}, engine }. */
  on_fpResult(conn, { id, stats } = {}) {
    this.requireAdmin(conn);
    if (!this.store.fpItem(Number(id))) throw E('bad_message');
    const side = (s) => (s && typeof s === 'object' ? { n: num(s.n, 1000), match: num(s.match, 1000), loss: num(s.loss, 100), acc: num(s.acc, 100) } : null);
    const clean = { 1: side(stats && stats[1]), 2: side(stats && stats[2]), engine: String((stats && stats.engine) || '').slice(0, 40), at: Date.now() };
    this.store.fpSetStats(Number(id), clean);
    conn.send({ t: 'fpSaved', id: Number(id), stats: clean });
  }

  on_fpMark(conn, { id, status } = {}) {
    const me = this.requireAdmin(conn);
    if (!STATUSES.includes(status) || !this.store.fpMark(Number(id), status, me.username)) throw E('bad_message');
    conn.send({ t: 'fpSaved', id: Number(id), status });
  }
}

module.exports = { Fairplay, BLUR_N, BLUR_MS, TOP_BOARDS };
