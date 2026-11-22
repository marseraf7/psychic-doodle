/*
 * Nguồn người chơi (Đợt 0 – docs/ke-hoach-tiep-can-toan-cau-21-11-2026.md mục 4): tin hello mang `src` (web, pwa, app,
 * desktop, telegram, vk, crazygames, itch, mcp, embed, unknown) và `ref` (?ref= / utm_source của lần mở đầu – caro/src-track.js).
 *   srcSeen(conn, pid)  – gọi từ core.attach: ghi lần đầu thấy danh tính + hoạt động trong ngày (store-sources.js);
 *                          khách vừa đăng ký / đăng nhập thì tài khoản (chưa có dòng nào) nhận nguồn của khách
 *   srcGames(pids)      – gọi khi ván online xong (rooms.js)
 *   srcSweep(now)       – gọi mỗi phút từ core.sweep: dọn dữ liệu cũ mỗi ngày một lần
 *   on_srcStats         – bảng cho quản trị viên (requireAdmin): 30 ngày, người mới / D1 / D7 / số ván mỗi người theo nguồn
 * Không lưu IP / UA; không có API công khai. Lỗi CSDL ở đây không được làm hỏng đăng nhập / ván đấu (chỉ ghi log).
 */
'use strict';

const SOURCES = ['web', 'pwa', 'app', 'desktop', 'telegram', 'vk', 'crazygames', 'itch', 'mcp', 'embed', 'unknown'];
const cleanSrc = (s) => (SOURCES.includes(s) ? s : 'unknown');
/** ref: chữ thường a-z 0-9 _ -, tối đa 24 ký tự; rỗng → null. */
const cleanRef = (s) => {
  const r = typeof s === 'string' ? s.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) : '';
  return r || null;
};

class Sources {
  srcSafe(fn) {
    try { return fn(); } catch (e) { console.error('[hub] thống kê nguồn lỗi:', e.message); return null; }
  }

  srcSeen(conn, pid) {
    if (!pid || !conn) return;
    const prev = conn.srcPid;
    conn.srcPid = pid;
    this.srcSafe(() => {
      if (prev && prev !== pid && prev.startsWith('g_') && pid.startsWith('u_')) this.store.srcAdopt(prev, pid);
      this.store.srcTouch(pid, conn.src || 'unknown', conn.srcRef || null);
    });
  }

  srcGames(pids) {
    for (const pid of new Set(pids)) {
      if (!pid) continue;
      const conns = this.byPid.get(pid);
      const c = conns && conns.size ? conns.values().next().value : null;
      this.srcSafe(() => this.store.srcGame(pid, (c && c.src) || (this.store.srcFirst(pid) || {}).src || 'unknown'));
    }
  }

  /** Gọi mỗi phút từ core.sweep; dọn dữ liệu cũ (src_active 60 ngày, src_daily 400 ngày) mỗi ngày một lần – trước đây
   *  chỉ dọn khi quản trị viên mở bảng, không ai mở thì bảng hoạt động theo ngày phình mãi. → true nếu đã dọn. */
  srcSweep(now = Date.now()) {
    if (now - (this.srcPrunedAt || 0) < 24 * 3600 * 1000) return false;
    this.srcPrunedAt = now;
    this.srcSafe(() => this.store.srcPrune(now));
    return true;
  }

  on_srcStats(conn, { days } = {}) {
    this.requireAdmin(conn);
    const n = Number.isInteger(days) && days >= 7 && days <= 90 ? days : 30;
    this.srcSafe(() => this.store.srcPrune());
    const r = this.srcSafe(() => this.store.srcReport(n)) || { sources: [], refs: [], daily: [], days: n };
    conn.send({ t: 'srcStats', ...r });
  }
}

module.exports = { Sources, SOURCES, cleanSrc, cleanRef };
