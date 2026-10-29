/*
 * Giải đấu – khu quản trị của ban tổ chức (như MyLeague "Tuỳ chỉnh" + Challonge "Settings / Log / Announcements"):
 *  - Nhật ký: ai làm gì, lúc nào (tạo, sửa cài đặt, duyệt, thêm người, hạt giống, lịch, kết quả, huỷ KQ, tạm dừng…).
 *  - Thông báo trên trang giải (ghim, ≤ 20), gửi tới mọi người chơi.
 *  - Hạt giống thủ công (kéo thả / xáo) trước khi bắt đầu – cũng là cách xếp cặp vòng đầu (cặp = vị trí hạt giống).
 *  - Lịch theo vòng: giờ + địa điểm dự kiến (hiện trên trang giải và biên bản).
 *  - Sửa cài đặt sau khi tạo: trước giờ đấu sửa được hết; đang / đã đấu chỉ còn tên và mô tả (như Challonge khoá
 *    Type / Format khi giải đã bắt đầu).
 *  - Tạm dừng / chơi tiếp (không mở trận / ghép ván mới), Đặt lại (về trước khi bắt đầu, giữ người chơi), Xoá.
 *  - Nháp: tạo giải ở trạng thái nháp (chỉ người tạo thấy), bấm Gửi duyệt khi xong.
 */
'use strict';
const { E } = require('../msg.js');
const { cleanPublicText, cleanText } = require('./shared.js');

const MAX_LOG = 300;
const MAX_NEWS = 20;

class TourManage {
  /** Ghi một dòng nhật ký của giải (giữ MAX_LOG dòng gần nhất). */
  tourLog(t, by, act, args = {}) {
    t.log = t.log || [];
    t.log.push({ at: Date.now(), by: by || null, act, ...args });
    if (t.log.length > MAX_LOG) t.log.splice(0, t.log.length - MAX_LOG);
  }

  /** Nhật ký gửi cho ban tổ chức: tên người làm (không gửi mã tài khoản người khác). */
  tourLogView(t) {
    return (t.log || []).slice(-100).reverse().map((x) => ({ ...x, by: x.by ? this.store.users.get(x.by)?.name || '?' : null }));
  }

  managerOf(conn, id) {
    const t = this.requireManager(conn, id);
    return { t, uid: this.requireUser(conn).id };
  }

  on_tourNews(conn, { id, text }) {
    const { t, uid } = this.managerOf(conn, id);
    const body = cleanPublicText(text, 1000).trim();
    if (!body) throw E('tour_news_empty');
    t.news = t.news || [];
    const item = { id: Date.now().toString(36) + Math.floor(Math.random() * 1000), at: Date.now(), by: this.store.users.get(uid)?.name || '?', text: body };
    t.news.unshift(item);
    t.news = t.news.slice(0, MAX_NEWS);
    this.tourLog(t, uid, 'news');
    this.saveTour(t);
    this.pushTour(t);
    this.notifyPlayers(t, 'tour_news', { text: body.slice(0, 120) });
  }

  on_tourNewsDel(conn, { id, news }) {
    const { t, uid } = this.managerOf(conn, id);
    const before = (t.news || []).length;
    t.news = (t.news || []).filter((x) => x.id !== news);
    if (t.news.length === before) return;
    this.tourLog(t, uid, 'news_del');
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Hạt giống thủ công (trước khi bắt đầu): order = mã người chơi theo thứ tự; null = theo cách xếp của giải. */
  on_tourSeeds(conn, { id, order }) {
    const { t, uid } = this.managerOf(conn, id);
    if (!['draft', 'pending', 'scheduled'].includes(t.status) || t.format !== 'bracket') throw E('tour_seeds_closed');
    if (order == null) t.seedPlan = null;
    else {
      if (!Array.isArray(order)) throw E('bad_message');
      const ids = new Set(t.players.filter((p) => !p.withdrawn).map((p) => p.uid));
      t.seedPlan = [...new Set(order.map(String))].filter((u) => ids.has(u));
    }
    this.tourLog(t, uid, t.seedPlan ? 'seeds' : 'seeds_auto');
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Thứ tự người vào giải khi bốc thăm: theo hạt giống thủ công (người chưa xếp xếp sau theo cách của giải). */
  applySeedPlan(t, entrants) {
    if (!t.seedPlan || !t.seedPlan.length) return entrants;
    const pos = new Map(t.seedPlan.map((u, i) => [u, i]));
    const planned = entrants.filter((p) => pos.has(p.uid)).sort((a, b) => pos.get(a.uid) - pos.get(b.uid));
    return [...planned, ...entrants.filter((p) => !pos.has(p.uid))];
  }

  /** Lịch theo vòng: key = "giai đoạn:vòng" (vd. "0:2"), at = giờ (ms) hoặc null để xoá, place = địa điểm. */
  on_tourSchedule(conn, { id, key, at, place }) {
    const { t, uid } = this.managerOf(conn, id);
    if (!/^\d{1,2}:\d{1,3}$/.test(String(key || ''))) throw E('bad_message');
    t.schedule = t.schedule || {};
    if (!(key in t.schedule) && Object.keys(t.schedule).length >= 200) throw E('bad_message'); // kiểm trước khi ghi
    const ms = Number(at);
    const where = cleanPublicText(place, 80).trim();
    if (!Number.isFinite(ms) || ms <= 0) { if (!where) delete t.schedule[key]; else t.schedule[key] = { at: null, place: where }; }
    else t.schedule[key] = { at: ms, place: where };
    this.tourLog(t, uid, 'schedule', { key });
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Sửa cài đặt. Trước giờ đấu: mọi cài đặt (kiểm như khi tạo); đang / đã đấu: chỉ tên và mô tả. */
  on_tourEdit(conn, o) {
    const { t, uid } = this.managerOf(conn, o.id);
    const me = this.store.users.get(uid);
    if (['running', 'finished', 'cancelled', 'rejected'].includes(t.status)) {
      const f = this.tourFields(me, { ...o, startsAt: Date.now() + 3600000, format: t.format, stages: t.stages });
      t.name = f.name;
      t.desc = f.desc;
    } else {
      const f = this.tourFields(me, o);
      const count = t.players.filter((p) => !p.withdrawn).length;
      if (f.maxPlayers < count) throw E('tour_max_low', { n: count });
      // Không đổi giữa trực tuyến và offline khi đã có người (người chơi offline không có tài khoản)
      if (count && f.offline !== !!t.offline) throw E('tour_offline_locked');
      // Người thường đổi tên / giới thiệu của giải đã duyệt: duyệt lại nội dung (quản trị viên sửa thì không cần)
      const review = !this.isAdmin(uid) && t.status === 'scheduled' && (f.name !== t.name || f.desc !== t.desc);
      Object.assign(t, f);
      t.checkinNotified = false;
      if (review) { t.status = 'pending'; this.notifyAdmins(t.name); }
    }
    this.tourLog(t, uid, 'edited');
    this.saveTour(t);
    this.pushTour(t);
    conn.send({ t: 'tourEdited', id: t.id });
  }

  /** Tạm dừng (không mở trận / ghép ván mới; ván đang đấu vẫn đánh nốt) / chơi tiếp. */
  on_tourHold(conn, { id, hold }) {
    const { t, uid } = this.managerOf(conn, id);
    if (t.status !== 'running') throw E('tour_not_running');
    t.held = !!hold;
    // Chơi tiếp: tính lại giờ chờ vắng mặt từ lúc này (thời gian tạm dừng không tính là vắng mặt)
    if (!t.held && t.format === 'bracket') for (const m of this.allMatches(t)) if (!m.done) m.readyAt = null;
    this.tourLog(t, uid, t.held ? 'held' : 'resumed');
    this.saveTour(t);
    this.pushTour(t);
    this.notifyPlayers(t, t.held ? 'tour_held' : 'tour_resumed');
  }

  /** Đặt lại: giải đang chạy về trước khi bắt đầu (giữ người chơi, bỏ nhánh đấu / điểm); ván đang dở không tính nữa. */
  on_tourReset(conn, { id }) {
    const { t, uid } = this.managerOf(conn, id);
    if (t.status !== 'running') throw E('tour_not_running');
    for (const r of this.rooms.values()) if (r.tour && r.tour.id === t.id) r.tour.cancelled = true;
    Object.assign(t, { status: 'scheduled', st: null, stage: 0, startedAt: null, endsAt: null, held: false, podium: null, disputes: [], games: [],
      checkinNotified: false, checkinWaived: false }); // điểm danh lại từ đầu
    t.startsAt = Math.max(t.startsAt, Date.now() + 10 * 60 * 1000); // không tự bắt đầu lại ngay
    for (const p of t.players) Object.assign(p, { seed: null, out: null, score: 0, wins: 0, draws: 0, losses: 0, games: 0, streak: 0, paused: false, checkedIn: false });
    t.players = t.players.filter((p) => !p.withdrawn);
    this.tourLog(t, uid, 'reset');
    this.saveTour(t);
    this.pushTour(t);
    this.notifyPlayers(t, 'tour_reset');
  }

  /** Xoá hẳn giải (không còn trong danh sách). Đang đấu thì phải huỷ / đặt lại trước. */
  on_tourDelete(conn, { id, confirm }) {
    const { t } = this.managerOf(conn, id);
    if (t.status === 'running') throw E('tour_delete_running');
    if (cleanText(confirm, 60) !== t.name) throw E('tour_delete_confirm');
    const wasPending = t.status === 'pending';
    this.notifyPlayers(t, 'tour_deleted');
    this.tours.delete(t.id);
    this.store.deleteTour(t.id);
    for (const set of this.byPid.values()) for (const c of set) if (c.watchTour === t.id) { c.watchTour = null; c.send({ t: 'tour', id: t.id, tour: null }); }
    conn.send({ t: 'tourDeleted', id: t.id });
    if (wasPending) this.notifyAdmins();
  }

  /** Nháp → gửi duyệt (quản trị viên: mở đăng ký luôn). */
  on_tourSubmit(conn, { id }) {
    const { t, uid } = this.managerOf(conn, id);
    if (t.status !== 'draft') throw E('tour_not_draft');
    if (t.startsAt < Date.now() + 60 * 1000) throw E('tour_bad_start');
    t.status = this.isAdmin(uid) ? 'scheduled' : 'pending';
    this.tourLog(t, uid, 'submitted');
    this.saveTour(t);
    this.pushTour(t);
    if (t.status === 'pending') this.notifyAdmins(t.name);
    conn.send({ t: 'tourSubmitted', id: t.id, status: t.status }); // không dùng tourCreated: client xoá nháp tạo giải đang soạn
  }
}

module.exports = { TourManage };
