/*
 * Giải tuần (Đợt 2 – docs/giai-tuan.md): máy chủ tự bảo đảm LUÔN có đúng một "Giải tuần" sắp tới / đang diễn ra.
 *   - Lúc khởi động và mỗi T.WEEKLY_TICK_MS (~10 phút), khi giải tuần xong / bị huỷ: không còn giải tuần nào chưa xong thì
 *     tạo giải cho lần kế tiếp (giờ ở cấu hình – weekly-cfg.js, tính theo múi giờ IANA – weekly-time.js), mở đăng ký ngay.
 *   - Chống tạo trùng: mỗi lần giải có khoá weeklyKey = 'YYYY-MM-DD' (ngày đấu theo múi giờ cấu hình), giữ chỗ trong CSDL
 *     (store-weekly.js – giao dịch) trước khi tạo. Lần đã có giải (kể cả đã huỷ / đã xoá) không tạo lại → nhảy sang tuần sau.
 *   - Chủ giải là hệ thống (creator SYSTEM_UID, t.system): không gắn tài khoản nào, không giới hạn số giải, không chờ duyệt;
 *     quản trị viên sửa / huỷ được như mọi giải (tourPerms: isAdmin → 'owner'); khiếu nại ván mất kết nối báo quản trị viên.
 *   - Thưởng = danh hiệu: giải xong, hạng 1–3 nhận danh hiệu trên hồ sơ (u.titles: { k: 'wc', n, p, tid, at }) – một lần
 *     mỗi giải (t.wcAwarded + lọc theo tid), nhịp quét tự trao bù nếu máy chủ tắt giữa chừng.
 *   - Nhắc trước giờ đấu: ~30 phút trước, người đã đăng ký nhận thông báo (chuông – tour-notes.js pushNote, k 'tour_soon').
 * Tin nhắn: weeklyCup {} → { t: 'weeklyCup', on, cup, last, now } (thẻ Giải tuần ở Trang chủ – caro/weekly-cup.js).
 * Trạng thái cho quản trị viên: weeklyStatus() (api.js on_adminStats).
 */
'use strict';
const crypto = require('crypto');
const WT = require('../weekly-time.js');
const WC = require('../weekly-cfg.js');
const { uidOf } = require('./shared.js');
const { MAX_PLAYERS } = require('./tournaments.js');

const SYSTEM_UID = '~system'; // không trùng được mã tài khoản (16 chữ số hex)
const OPEN = ['draft', 'pending', 'scheduled', 'running'];
const LEAD_MS = 30 * 60000; // tạo giải mới: giờ đấu phải còn ít nhất 30 phút nữa (không thì lấy tuần sau)
const REMIND_MS = 30 * 60000; // nhắc người đã đăng ký khi còn ≤ 30 phút
const LOST_MS = 60000; // chỗ đã giữ mà không thấy giải sau 1 phút: giải bị mất (máy chủ tắt trước khi ghi) – giữ lại chỗ
const MAX_TITLES = 50;

class WeeklyCup {
  /** env: biến môi trường (server.js truyền process.env; test truyền object) – null = tắt hẳn (test, e2e mặc định). */
  weeklyInit(env) {
    clearInterval(this.wcTimer);
    this.wcTimer = null;
    this.wc = null;
    this.wcWarn = [];
    if (!env) return;
    const { cfg, warn } = WC.parseCfg(env);
    for (const w of warn) console.warn('[giải tuần] ' + w); // ghi log một lần lúc khởi động
    this.wc = cfg;
    this.wcWarn = warn;
    if (!cfg.on) return;
    this.safeTimer('weeklyCup', () => this.weeklyTick());
    this.wcTimer = setInterval(() => this.safeTimer('weeklyCup', () => this.weeklyTick()), this.T.WEEKLY_TICK_MS);
    this.wcTimer.unref?.();
  }

  /** Nhịp quét: trao bù danh hiệu, nhắc giờ đấu, bảo đảm có giải tuần kế tiếp. Trả giải tuần đang mở (hoặc null). */
  weeklyTick(now = Date.now()) {
    if (this.closed || !this.wc || !this.wc.on) return null;
    for (const t of this.tours.values()) {
      if (!t.weekly) continue;
      if (t.status === 'finished') this.weeklyAward(t);
      else this.weeklyRemind(t, now);
    }
    return this.weeklyEnsure(now);
  }

  /** Giải tuần chưa xong (nháp / chờ duyệt / mở đăng ký / đang diễn ra) – có thì không tạo thêm. */
  weeklyLive() {
    for (const t of this.tours.values()) if (t.weekly && OPEN.includes(t.status)) return t;
    return null;
  }

  weeklyEnsure(now = Date.now()) {
    if (this.closed || !this.wc || !this.wc.on) return null;
    const live = this.weeklyLive();
    if (live) return live;
    const S = this.store;
    let after = now + LEAD_MS;
    for (let i = 0; i < 12; i++) {
      const slot = WT.nextSlot(after, this.wc);
      after = slot.at;
      if ([...this.tours.values()].some((t) => t.weeklyKey === slot.key)) continue; // lần này đã có giải (xong / huỷ)
      const id = crypto.randomBytes(5).toString('hex');
      let n = S.wcClaim(slot.key, id, now);
      if (!n) {
        const cur = S.wcSlot(slot.key);
        if (cur.gone) continue; // quản trị viên đã xoá giải lần này
        const st = S.tourStatusOf(cur.id);
        if (st && OPEN.includes(st)) return null; // tiến trình khác (cùng CSDL) vừa tạo – lần quét sau sẽ nạp được
        if (st) continue; // xong / huỷ
        if (now - cur.at < LOST_MS) return null; // vừa giữ chỗ ở nơi khác, chưa kịp ghi giải
        n = S.wcClaim(slot.key, id, now, cur); // giải bị mất trước khi ghi xuống đĩa: tạo lại, giữ số cũ
      }
      return this.weeklyCreate(slot, n, id, now);
    }
    return null;
  }

  weeklyCreate(slot, n, id, now) {
    const C = this.wc;
    const swiss = C.format === 'swiss';
    const fields = this.tourFields({ id: SYSTEM_UID }, {
      name: WC.tourName(n), desc: WC.tourDesc(C, n, slot.at), format: swiss ? 'bracket' : 'arena', stages: swiss ? [{ type: 'swiss' }] : undefined,
      startsAt: slot.at, clock: C.clock, rule: C.rule, opening: 'free', rated: true, access: 'public', maxPlayers: MAX_PLAYERS, minutes: C.minutes,
    }, now);
    const t = { id, ...fields, creator: SYSTEM_UID, system: true, weekly: true, weeklyKey: slot.key, weeklyN: n,
      status: 'scheduled', created: now, players: [], games: [], queue: [] };
    this.tours.set(t.id, t);
    this.tourLog(t, null, 'created');
    this.saveTour(t);
    this.store.flush(); // ghi ngay: khởi động lại ngay sau đó vẫn thấy giải (không tạo lần hai)
    console.log(`[giải tuần] tạo #${n} (${slot.key}) – ${new Date(slot.at).toISOString()}`);
    return t;
  }

  /** Giải tuần xong / bị huỷ (tour-run.js gọi): trao danh hiệu, tạo lần kế tiếp. Lỗi chỉ ghi log, không chặn kết thúc giải. */
  weeklyDone(t) {
    this.safeTimer('weeklyDone', () => {
      if (t.status === 'finished') this.weeklyAward(t);
      this.weeklyEnsure();
    });
  }

  /** Quản trị viên xoá hẳn giải tuần (tour-manage.js): không tạo lại lần đó. */
  weeklyGone(t) {
    if (t.weekly && t.weeklyKey) this.store.wcGone(t.weeklyKey);
  }

  weeklyAward(t) {
    if (t.wcAwarded || t.status !== 'finished') return;
    (t.podium || []).slice(0, 3).forEach((uid, i) => {
      const u = this.store.users.get(uid);
      if (!u) return;
      u.titles = [...(u.titles || []).filter((x) => x.tid !== t.id), { k: 'wc', n: t.weeklyN, p: i + 1, tid: t.id, at: t.finishedAt || Date.now() }].slice(-MAX_TITLES);
      this.store.touch(u);
    });
    t.wcAwarded = true;
    this.saveTour(t);
  }

  weeklyRemind(t, now) {
    if (t.status !== 'scheduled' || t.wcReminded || now < t.startsAt - REMIND_MS || now >= t.startsAt) return;
    t.wcReminded = true;
    for (const p of t.players) if (!p.withdrawn) this.pushNote(p.uid, { k: 'tour_soon', id: t.id, name: t.name, starts: t.startsAt });
    this.saveTour(t);
  }

  /** Giải tuần gần nhất đã xong (kết quả tuần trước ở Trang chủ). */
  weeklyLast() {
    let last = null;
    for (const t of this.tours.values()) if (t.weekly && t.status === 'finished' && (!last || (t.finishedAt || 0) > (last.finishedAt || 0))) last = t;
    return last;
  }

  on_weeklyCup(conn) {
    if (!this.wc || !this.wc.on) return conn.send({ t: 'weeklyCup', on: false });
    const uid = uidOf(conn.pid);
    const live = this.weeklyLive();
    // Quản trị viên đổi giải sang "chỉ ai có link" / riêng tư: thẻ Trang chủ chỉ hiện cho người đã ở trong giải
    const shown = (t) => !!t && this.canSeeTour(t, uid) && (t.access === 'public' || !!(uid && this.player(t, uid)));
    const cup = shown(live) && live.status !== 'draft' && live.status !== 'pending' ? live : null;
    const last0 = this.weeklyLast();
    const last = shown(last0) ? last0 : null;
    conn.send({
      t: 'weeklyCup', on: true, now: Date.now(),
      cup: cup ? { ...this.tourSummary(cup, uid), slug: cup.slug || null, canJoin: this.canJoinTour(cup, uid) } : null,
      last: last ? { id: last.id, slug: last.slug || null, name: last.name, weekly: last.weeklyN, finishedAt: last.finishedAt || null,
        podium: (last.podium || []).slice(0, 3).map((u) => this.player(last, u)?.name || '?') } : null,
    });
  }

  /** Dòng trạng thái cho bảng quản trị (chỉ đọc). */
  weeklyStatus() {
    if (!this.wc) return { on: false, cfg: null, next: null, warn: [] };
    const live = this.weeklyLive();
    return {
      on: this.wc.on, cfg: WC.cfgText(this.wc), warn: this.wcWarn || [],
      next: live ? { id: live.id, name: live.name, startsAt: live.startsAt, status: live.status, count: live.players.filter((p) => !p.withdrawn).length } : null,
    };
  }
}

module.exports = { WeeklyCup, SYSTEM_UID };
