/*
 * Giải đấu Offline – giải của mọi bộ môn (docs/de-xuat-giai-offline.md), tách hẳn khỏi giải Caro (tournaments.js):
 * bảng riêng (store-otour.js), link riêng …/?o=<url>, không Elo, không phòng đấu. Phần này: giữ giải trong RAM theo yêu
 * cầu, hạn mức, tạo / xem / sửa / xoá, gửi cập nhật cho người xem (bản vá như giải Caro – tourpush.js).
 * Diễn biến giải (đội, bắt đầu, nhập kết quả, chuyển giai đoạn): otour-run.js. Bản cấu hình: otour-spec.js.
 *
 *  - Mọi tài khoản tạo ngay (không cần duyệt); người xem không cần đăng nhập (giải 'public' / 'link').
 *  - RAM: chỉ giữ giải đang có người xem / sửa; quá IDLE_MS không ai đụng (và đã ghi xong) thì bỏ khỏi RAM, tối đa MAX_CACHED.
 *  - Hạn mức mỗi tài khoản: MAX_ACTIVE giải chưa kết thúc, MAX_PER_DAY lần tạo mỗi ngày; giải ≤ 512 đội, ≤ 10 000 trận.
 */
'use strict';
const crypto = require('crypto');
const { E } = require('../msg.js');
const { cleanPublicName, cleanRich, uidOf } = require('./shared.js');
const { viewParts, diffParts } = require('./tourpush.js');
const { SLUG_RE } = require('./tour-opts.js');
const Spec = require('./otour-spec.js');

const MAX_ACTIVE = 10;
const MAX_PER_DAY = 20;
const MAX_CACHED = 200;
const IDLE_MS = 30 * 60 * 1000;
const ACCESS = ['public', 'link', 'private'];

/** Lỗi bản cấu hình (otour-spec.js) → lỗi có mã cho client. */
function specGuard(fn) {
  try { return fn(); } catch (e) { if (e instanceof Spec.SpecError) throw E(e.code, e.args); throw e; }
}

class OTour {
  // ------------------------------------------------------------ Giữ giải trong RAM
  otCache() {
    if (!this.otours) {
      this.otours = new Map(); // id → giải
      this.otUsed = new Map(); // id → lần đụng gần nhất
      this.otTimer = setInterval(() => this.safeTimer('otEvict', () => this.otEvict()), 60000);
      this.otTimer.unref?.();
    }
    return this.otours;
  }

  /** Giải theo mã / link riêng (nạp từ CSDL nếu chưa có trong RAM). null nếu không có. */
  otGet(key) {
    const cache = this.otCache();
    let t = cache.get(String(key || ''));
    if (!t) for (const x of cache.values()) if (x.slug && x.slug === String(key || '').toLowerCase()) { t = x; break; }
    if (!t) {
      t = this.store.loadOTour(key);
      if (!t) return null;
      cache.set(t.id, t);
    }
    this.otUsed.set(t.id, Date.now());
    if (cache.size > MAX_CACHED) this.otEvict(true);
    return t;
  }

  /** Bỏ khỏi RAM giải lâu không ai đụng, không có người xem và đã ghi xong; force: bỏ bớt cho đủ MAX_CACHED. */
  otEvict(force = false) {
    const cache = this.otCache(), now = Date.now();
    const watched = new Set();
    for (const set of this.byPid.values()) for (const c of set) if (c.watchOt) watched.add(c.watchOt);
    const idle = [...cache.keys()].filter((id) => !watched.has(id) && !this.store.dirtyDocs.has('ot:' + id))
      .sort((a, b) => (this.otUsed.get(a) || 0) - (this.otUsed.get(b) || 0));
    for (const id of idle) {
      if (!force && now - (this.otUsed.get(id) || 0) < IDLE_MS) continue;
      if (force && cache.size <= MAX_CACHED) break;
      this.otForget(id);
    }
  }

  // ------------------------------------------------------------ Quyền
  /** Xem được: giải công khai / có link; riêng tư chỉ chủ giải và quản trị viên. */
  otCanSee(t, uid) {
    return t.access !== 'private' || this.otCanManage(t, uid);
  }

  otCanManage(t, uid) {
    return !!uid && (t.owner === uid || this.isAdmin(uid));
  }

  /** Giải mà người gửi được quản lý (không có / không có quyền → lỗi). */
  otManaged(conn, id) {
    const me = this.requireUser(conn);
    const t = this.otGet(id);
    if (!t || !this.otCanSee(t, me.id)) throw E('ot_not_found');
    if (!this.otCanManage(t, me.id)) throw E('tour_managers_only');
    return { t, me };
  }

  /** Ghi (gom) + gửi cập nhật cho người đang xem. */
  otSave(t) {
    t.updated = Date.now();
    this.store.saveOTour(t);
    this.otPush(t);
  }

  // ------------------------------------------------------------ Tạo / sửa / xoá
  /** Các trường chung khi tạo và sửa (tên, mô tả có định dạng, link riêng, ai xem được). */
  otFields(o, id = null) {
    const name = cleanPublicName(o.name).slice(0, 60);
    if (name.length < 3) throw E('tour_name_short');
    const slug = String(o.slug || '').trim().toLowerCase();
    if (slug && !SLUG_RE.test(slug)) throw E('tour_slug_bad');
    if (slug && this.store.oTourSlugTaken(slug, id)) throw E('tour_slug_taken');
    return { name, desc: cleanRich(o.desc, 4000), slug: slug || null, access: ACCESS.includes(o.access) ? o.access : 'public' };
  }

  on_otCreate(conn, o) {
    const me = this.requireUser(conn);
    const today = new Date().toISOString().slice(0, 10);
    const day = me.otDay && me.otDay.d === today ? me.otDay : { d: today, n: 0 };
    if (day.n >= MAX_PER_DAY) throw E('ot_daily_limit', { n: MAX_PER_DAY });
    if (this.store.countActiveOTours(me.id) >= MAX_ACTIVE) throw E('ot_active_limit', { n: MAX_ACTIVE });
    const f = this.otFields(o);
    const spec = specGuard(() => Spec.normalizeSpec(o.spec));
    const now = Date.now();
    const t = { id: crypto.randomBytes(5).toString('hex'), kind: 'otour', ...f, ...spec, owner: me.id, status: 'draft', created: now, updated: now,
      players: [], st: null, stage: 0, podium: null, log: [] };
    this.otAddTeams(t, o.teams);
    this.otCache().set(t.id, t);
    this.otUsed.set(t.id, now);
    me.otDay = { d: today, n: day.n + 1 };
    this.store.touch(me);
    this.otLog(t, me.id, 'created');
    this.otSave(t);
    conn.send({ t: 'otCreated', id: t.id });
  }

  /** Sửa: tên / mô tả / link / quyền xem lúc nào cũng được; bộ môn và thể thức chỉ trước khi bắt đầu. */
  on_otEdit(conn, o) {
    const { t, me } = this.otManaged(conn, o.id);
    Object.assign(t, this.otFields(o, t.id));
    if (o.spec && t.status === 'draft') Object.assign(t, specGuard(() => Spec.normalizeSpec(o.spec)));
    this.otLog(t, me.id, 'edited');
    this.otSave(t);
    conn.send({ t: 'otEdited', id: t.id });
  }

  on_otDelete(conn, { id }) {
    const { t } = this.otManaged(conn, id);
    for (const set of this.byPid.values()) for (const c of set) if (c.watchOt === t.id) { c.watchOt = null; c.send({ t: 'ot', id: t.id, tour: null }); }
    this.otForget(t.id);
    this.store.dropOTour(t.id);
    conn.send({ t: 'otDeleted', id: t.id });
  }

  /** Danh sách: giải của mình + giải công khai gần đây (khách: chỉ giải công khai). */
  on_otList(conn) {
    const uid = uidOf(conn.pid);
    const mine = uid ? this.store.listOTours({ owner: uid, limit: 50 }) : [];
    const pub = this.store.listOTours({ limit: 50 }).filter((x) => !mine.some((y) => y.id === x.id));
    const view = (x) => ({ id: x.id, slug: x.slug, name: x.name, status: x.status, access: x.access, updated: x.updated,
      owner: this.store.users.get(x.owner)?.name || '?', mine: x.owner === uid });
    conn.send({ t: 'otList', mine: mine.map(view), recent: pub.map(view) });
  }

  // ------------------------------------------------------------ Xem (không cần đăng nhập)
  on_otGet(conn, { id }) {
    const uid = uidOf(conn.pid);
    const t = this.otGet(id);
    if (!t || !this.otCanSee(t, uid)) throw E('ot_not_found');
    if (conn.watchOt !== t.id) conn.otGroups = null; // bảng đang mở (otour-lazy.js) là của giải trước
    conn.watchOt = t.id;
    if (!this.fullViewAllowed(conn, t)) { conn.otFull = true; this.otPush(t); return; } // hết lượt tải đầy đủ: tới ở nhịp sau
    conn.otFull = true; // nhịp cập nhật kế tiếp gửi thêm một bản đầy đủ (khớp bản mọi người đang có)
    conn.send({ t: 'ot', id: t.id, tour: this.otShared(t), mine: this.otMine(t, uid) });
  }

  on_otUnwatch(conn) { conn.watchOt = null; conn.otGroups = null; }

  /** Phần chung (giống mọi người xem) – cùng hình dạng trang giải Caro để dùng chung bản vá và cách vẽ nhánh / bảng. */
  otShared(t) {
    const side = (u) => this.tourSide(t, u);
    if (!this.otMemo) this.otMemo = new WeakMap();
    if (!this.otMemo.has(t)) this.otMemo.set(t, new Map());
    return {
      id: t.id, kind: 'otour', name: t.name, desc: t.desc, slug: t.slug, access: t.access, status: t.status, sport: t.sport, result: t.result, set: t.set || null,
      owner: this.store.users.get(t.owner)?.name || '?', created: t.created, startedAt: t.startedAt || null, finishedAt: t.finishedAt || null,
      stages: t.stages, stage: t.stage || 0, format: 'bracket', offline: true, hideSeeds: false, showStandings: true, roundLabels: true, shareImages: true,
      players: t.players.map((p) => ({ uid: p.uid, name: p.name, seed: p.seed || null, withdrawn: !!p.withdrawn, out: p.out || null, ...(p.country ? { country: p.country } : {}), ...(p.team ? { team: p.team } : {}),
        ...(p.roster && p.roster.length ? { roster: p.roster } : {}) })), // đội hình (otour-league.js)
      // Giai đoạn đã xong không đổi nữa: dựng một lần (otMemo) – giải nhiều bảng không phải dựng lại mỗi kết quả
      // Vòng tròn nhiều bảng: chỉ bảng xếp hạng, các trận tải khi người xem mở bảng (otour-lazy.js)
      stageViews: this.otLite(t, this.stageViews(t, this.otMemo.get(t))),
      podium: (t.podium || []).map(side), now: Date.now(),
      // Đăng ký đội đang mở; thống kê cầu thủ (vua phá lưới, thẻ phạt) – otour-league.js
      reg: t.reg && t.reg.open && t.status === 'draft' ? { open: true } : null, stats: this.otStats(t),
    };
  }

  /**
   * Trang giải công khai dạng JSON (/api/otour/<mã | link riêng>.json – trang nhúng caro/embed.html?o=, website ngoài):
   * đúng phần khách chưa đăng nhập thấy (otShared); không có giải riêng tư và giải nháp.
   */
  publicOTour(key) {
    const t = this.otGet(String(key || '').slice(0, 40));
    if (!t || t.status === 'draft' || !this.otCanSee(t, null)) return null;
    return { ...this.otShared(t), url: '/?o=' + (t.slug || t.id) };
  }

  otMine(t, uid) {
    return { canManage: this.otCanManage(t, uid), log: this.otCanManage(t, uid) ? (t.log || []).slice(-50).reverse() : null, now: Date.now(), ...this.otRegMine(t, uid) };
  }

  /** Gom cập nhật rồi gửi: người mới mở trang nhận bản đầy đủ, còn lại nhận bản vá (như giải Caro). */
  otPush(t) {
    if (!this.otPushTimers) this.otPushTimers = new Map();
    if (this.otPushTimers.has(t.id) || this.closed) return;
    const delay = Math.max(this.T.TOUR_PUSH_MS, Math.min(2000, t.players.length * 4));
    const timer = setTimeout(() => { this.otPushTimers.delete(t.id); if (!this.closed) this.safeTimer('otFlush', () => this.otFlush(t)); }, delay);
    timer.unref?.();
    this.otPushTimers.set(t.id, timer);
  }

  otFlush(t) {
    if (!this.otSnaps) this.otSnaps = new Map();
    const watchers = [];
    for (const set of this.byPid.values()) for (const c of set) if (c.watchOt === t.id) watchers.push(c);
    if (!watchers.length) { this.otSnaps.delete(t.id); return; }
    const shared = this.otShared(t);
    const next = viewParts(shared);
    const prev = this.otSnaps.get(t.id);
    this.otSnaps.set(t.id, next);
    let full = null, patch = null;
    for (const c of watchers) {
      const uid = uidOf(c.pid);
      if (!this.otCanSee(t, uid)) { c.watchOt = null; c.send({ t: 'ot', id: t.id, tour: null }); continue; }
      const mine = JSON.stringify(this.otMine(t, uid));
      if (!prev || c.otFull) {
        full = full || `{"t":"ot","id":${JSON.stringify(t.id)},"tour":${JSON.stringify(shared)},"mine":`;
        c.otFull = false;
        this.sendRaw(c, full + mine + '}');
      } else {
        patch = patch || `{"t":"otPatch","id":${JSON.stringify(t.id)},"patch":${JSON.stringify(diffParts(prev, next, shared))},"mine":`;
        this.sendRaw(c, patch + mine + '}');
      }
    }
    this.otPushGroups(t, watchers); // các bảng đang mở (tải lười) đã đổi
  }

  /** Nhật ký thao tác của ban tổ chức (giữ 200 dòng gần nhất). */
  otLog(t, uid, act, args = {}) {
    t.log = t.log || [];
    t.log.push({ at: Date.now(), by: uid ? this.store.users.get(uid)?.name || '?' : null, act, ...args });
    if (t.log.length > 200) t.log.splice(0, t.log.length - 200);
  }

  /** Xoá tài khoản (auth.js): bỏ giải offline của người đó khỏi RAM (CSDL xoá trong store.deleteUser). */
  otUserGone(uid) {
    for (const [id, t] of this.otCache()) if (t.owner === uid) this.otForget(id);
  }

  /** Bỏ hẳn một giải khỏi RAM: bản giải, lần đụng, bản chụp tính bản vá (có thể vài MB), nhịp gửi đang chờ. */
  otForget(id) {
    this.otCache().delete(id);
    this.otUsed.delete(id);
    this.otSnaps?.delete(id);
    this.otFullViews?.delete(id);
    const timer = this.otPushTimers?.get(id);
    if (timer) { clearTimeout(timer); this.otPushTimers.delete(id); }
  }
}

module.exports = { OTour, MAX_ACTIVE, MAX_PER_DAY, MAX_CACHED, IDLE_MS, specGuard };
