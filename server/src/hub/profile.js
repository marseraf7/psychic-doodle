/*
 * Bảng xếp hạng (chung và theo loại thời gian) và trang hồ sơ người chơi.
 * Bảng xếp hạng phải sắp xếp mọi tài khoản: kết quả được giữ lại tới khi có ván tính điểm mới (hoặc tối đa 60 giây),
 * nên mở bảng liên tục không làm máy chủ phải sắp xếp lại.
 */
'use strict';
const { E } = require('../msg.js');
const { uidOf, cleanRich } = require('./shared.js');

const MAX_BIO = 2000; // giới thiệu bản thân (có định dạng – caro/rich-text.js)
const R = require('../rating.js');
const Perf = require('../perf.js');

const LB_TOP = 20;
const LB_CACHE_MS = 60 * 1000;

class Profile {
  /** Danh sách đã xếp hạng của một loại (null = điểm chính), dùng lại khi chưa có điểm mới. */
  ranked(pool) {
    const key = pool || 'main';
    const now = Date.now();
    const c = (this.lbCache || (this.lbCache = {}))[key];
    if (c && c.ver === this.ratingVer && now - c.at < LB_CACHE_MS) return c.list;
    const list = [];
    for (const u of this.store.users.values()) {
      // Chỉ người đã chơi và điểm đủ chắc chắn (rd ≤ 75, như Lichess); điểm chính: theo loại chơi nhiều nhất
      if (!pool) { if (u.rated > 0 && R.rankable(u.pools[R.mainPool(u)], now)) list.push({ u, r: u.rating, n: u.rated }); continue; }
      const p = u.pools[pool];
      if (R.rankable(p, now)) list.push({ u, r: Math.round(p.r), n: p.n });
    }
    list.sort((a, b) => b.r - a.r || b.n - a.n);
    this.lbCache[key] = { ver: this.ratingVer, at: now, list };
    return list;
  }

  /** Có ván tính điểm mới: bảng xếp hạng cần dựng lại. */
  ratingsChanged() { this.ratingVer = (this.ratingVer || 0) + 1; }

  /** Bảng xếp hạng: pool = 'bullet' | 'blitz' | 'rapid' | 'classical', không có = điểm chính. */
  on_leaderboard(conn, { pool } = {}) {
    // Kết quả dùng lại (ranked): gọi nhiều chỉ tốn cắt danh sách, không cần giới hạn riêng
    pool = R.POOLS.includes(pool) ? pool : null;
    const list = this.ranked(pool);
    const uid = uidOf(conn.pid);
    const myRank = uid ? list.findIndex((e) => e.u.id === uid) + 1 : 0;
    // Đã chơi nhưng điểm chưa đủ chắc chắn để lên bảng: cho biết độ lệch hiện tại (cần ≤ 75)
    const u = uid && !myRank && this.store.users.get(uid);
    const p = u && u.pools[pool || R.mainPool(u)];
    const unranked = p && p.n > 0 ? { rd: Math.round(R.decayedRd(p, Date.now())), need: R.RANKABLE_RD, n: p.n } : null;
    conn.send({
      t: 'leaderboard', pool,
      top: list.slice(0, LB_TOP).map((e, i) => ({ rank: i + 1, id: e.u.id, name: e.u.name, username: e.u.username, rating: e.r, games: e.n })),
      me: myRank ? { rank: myRank, rating: list[myRank - 1].r } : null, unranked,
    });
  }

  /** Sửa phần giới thiệu bản thân ở trang hồ sơ (tài khoản thật, không phải khách). */
  on_setBio(conn, { bio }) {
    const me = this.requireUser(conn);
    this.throttle(conn, 'bio', 2000);
    me.bio = cleanRich(bio, MAX_BIO);
    this.store.touch(me);
    conn.send({ t: 'bioSaved', bio: me.bio });
  }

  /** Trang hồ sơ: điểm từng loại + biểu đồ, thành tích, chuỗi thắng, giải đấu, ván gần đây. */
  on_profile(conn, { id, username }) {
    this.throttle(conn, 'profile', 300);
    const u = typeof id === 'string' ? this.store.users.get(uidOf(id) || id)
      : this.store.byUsername.get(String(username || '').slice(0, 40).trim().toLowerCase().replace(/^@/, ''));
    const meUid = uidOf(conn.pid);
    // Người đã chặn mình: coi như không có (không lộ là đã bị chặn)
    if (!u || (meUid && u.blocked.includes(meUid))) throw E('player_not_found');
    const now = Date.now();
    const pools = {};
    for (const p of R.POOLS) {
      const x = u.pools[p];
      pools[p] = { r: Math.round(x.r), rd: Math.round(R.decayedRd(x, now)), prov: R.provisional(x, now), n: x.n };
    }
    // Ván gần đây: theo quyền riêng tư Lịch sử đấu của chủ hồ sơ (history.js)
    const canHistory = this.canSeeHistory(meUid, u);
    const recent = canHistory ? this.historyItems(u, 10) : [];
    const me = meUid && this.store.users.get(meUid);
    conn.send({
      t: 'profile',
      profile: {
        id: u.id, name: u.name, username: u.username, av: u.avatar ? u.avatar.v : 0, created: u.created || null, status: this.status(u.id),
        rating: u.rating, main: R.mainPool(u), pools, history: this.store.ratingPoints(u.id),
        stats: u.stats, rated: u.rated, streak: u.wstreak, lstreak: u.lstreak, tours: u.tours, recent, canHistory, histVis: this.histVisOf(u),
        perf: u.perf || {}, activity: Perf.activity(u), // thống kê sâu theo loại + hoạt động 30 ngày
        bio: u.bio || '', // giới thiệu bản thân (đánh dấu như Markdown; trình duyệt dựng HTML an toàn)
        self: meUid === u.id, friend: !!(me && me.friends.includes(u.id)), h2h: me && me.id !== u.id ? this.store.h2h(me.id, u.id) : null,
      },
    });
  }
}

module.exports = { Profile, MAX_BIO };
