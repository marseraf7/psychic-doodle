/*
 * Số liệu máy chủ cho quản trị viên (kết nối, phòng, RAM, lệnh chậm, số lệnh theo loại) và dữ liệu cho
 * API công khai chỉ đọc (/api/player/:username, /api/leaderboard – phục vụ ở web.js).
 */
'use strict';
const R = require('../rating.js');
const { userPid } = require('./shared.js');

const SLOW_MS = 50; // lệnh xử lý lâu hơn mức này thì ghi lại
const SLOW_KEEP = 50;

class Api {
  metricsData() {
    return this.metrics || (this.metrics = { since: Date.now(), count: Object.create(null), slow: [], crash: Object.create(null) });
  }

  /** Ghi thời gian xử lý một lệnh (gọi từ core.handle). */
  timed(type, ms) {
    const m = this.metricsData();
    const key = typeof this['on_' + type] === 'function' ? type : '?';
    m.count[key] = (m.count[key] || 0) + 1;
    if (ms >= SLOW_MS) {
      m.slow.push({ t: key, ms: Math.round(ms), at: Date.now() });
      if (m.slow.length > SLOW_KEEP) m.slow.shift();
    }
  }

  /** Đếm sự cố (lỗi bất ngờ khi xử lý lệnh). */
  crashed(type) {
    const c = this.metricsData().crash;
    const key = typeof this['on_' + type] === 'function' ? type : '?';
    c[key] = (c[key] || 0) + 1;
  }

  on_adminStats(conn) {
    this.requireAdmin(conn);
    const m = this.metricsData();
    let active = 0, watchers = 0;
    for (const r of this.rooms.values()) {
      if (r.active) active++;
      if (r.watchers) watchers += r.watchers.size;
    }
    const mem = process.memoryUsage();
    const mb = (n) => Math.round((n / 1048576) * 10) / 10;
    conn.send({
      t: 'adminStats',
      stats: {
        uptime: Math.round(process.uptime()), since: m.since,
        conns: this.conns || 0, online: this.byPid.size, rooms: this.rooms.size, active, watchers, queue: this.queue.size,
        users: this.store.users.size, clubs: this.clubs.size, tours: this.tours.size,
        mem: { rss: mb(mem.rss), heap: mb(mem.heapUsed), heapTotal: mb(mem.heapTotal), ext: mb(mem.external) },
        count: Object.entries(m.count).sort((a, b) => b[1] - a[1]).slice(0, 40),
        slow: m.slow.slice().reverse(), crash: m.crash,
      },
    });
  }

  /** Hồ sơ công khai (không có email, bạn bè, danh sách chặn…). */
  publicPlayer(username) {
    const u = this.store.byUsername.get(String(username || '').slice(0, 40).toLowerCase());
    if (!u) return null;
    const now = Date.now();
    const perfs = {};
    for (const p of R.POOLS) {
      const x = u.pools[p];
      perfs[p] = { rating: Math.round(x.r), rd: Math.round(R.decayedRd(x, now)), prov: R.provisional(x, now), games: x.n };
    }
    return {
      id: u.id, username: u.username, name: u.name, createdAt: u.created || null, online: this.isOnline(userPid(u.id)),
      rating: u.rating, perfs, count: { ...u.stats, rated: u.rated }, tours: u.tours,
    };
  }

  /** Bảng xếp hạng công khai: 50 người đầu. */
  publicLeaderboard(pool) {
    pool = R.POOLS.includes(pool) ? pool : null;
    return {
      pool, players: this.ranked(pool).slice(0, 50).map((e, i) => ({ rank: i + 1, username: e.u.username, name: e.u.name, rating: e.r, games: e.n })),
    };
  }
}

module.exports = { Api };
