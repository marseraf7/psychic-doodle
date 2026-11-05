/*
 * Giải đấu Offline – tải lười các trận của giai đoạn vòng tròn nhiều bảng (docs/de-xuat-giai-offline.md mục 7.3):
 * giải 512 đội chia 32 bảng có ~3 800 trận – trang đầy đủ ~1,6 MB, phần lớn là các trận. Giai đoạn vòng tròn có hơn
 * LAZY_GROUPS bảng hoặc hơn LAZY_MATCHES trận (mùa giải kiểu Mỹ): trang chung (gửi mọi người xem, tính bản vá) chỉ còn bảng xếp hạng của mỗi bảng, các trận của bảng
 * thay bằng rounds: null (v.lazy = true). Người xem mở bảng nào thì gửi otGroup và nhận các trận của bảng đó; bảng đang
 * mở được đẩy lại (chỉ bảng đó) mỗi khi đổi. Client: caro/otour.js (D.otGroups), tour-stages.js (K.roundsOfGroup).
 *   otLite(views)        – bản trang chung (otShared gọi), giữ bản đầy đủ để trả otGroup.
 *   on_otGroup           – { id, stage, g } (g = số bảng hoặc 'all' – xuất CSV cần đủ).
 *   otPushGroups(t, cs)  – otFlush gọi: gửi lại các bảng đang mở đã đổi.
 */
'use strict';
const { E } = require('../msg.js');
const { uidOf } = require('./shared.js');

const LAZY_GROUPS = 8; // giai đoạn vòng tròn có nhiều hơn số bảng này thì tải lười
const LAZY_MATCHES = 400; // … hoặc nhiều hơn số trận này (mùa giải kiểu Mỹ: NBA 1 230 trận, MLB 2 430 trận chỉ 2 miền)
const matchCount = (v) => v.groups.reduce((t, g) => t + (g.rounds || []).reduce((k, r) => k + r.length, 0), 0);
const MAX_OPEN = 64; // mỗi kết nối theo dõi tối đa 64 bảng

class OTourLazy {
  /** Bản trang chung: giai đoạn vòng tròn nhiều bảng bỏ các trận (chỉ còn bảng xếp hạng). Bản đầy đủ giữ ở otFullViews. */
  otLite(t, views) {
    if (!this.otFullViews) this.otFullViews = new Map();
    this.otFullViews.set(t.id, { views, at: t.updated });
    return views.map((v) => (v.type === 'roundrobin' && v.groups && (v.groups.length > LAZY_GROUPS || matchCount(v) > LAZY_MATCHES)
      ? { ...v, lazy: true, groups: v.groups.map((g) => ({ ...g, rounds: null })) } : v));
  }

  /** Bản đầy đủ mới nhất của các giai đoạn (dựng lại nếu giải đã đổi từ lần dựng trước). */
  otFull(t) {
    const c = this.otFullViews && this.otFullViews.get(t.id);
    if (c && c.at === t.updated) return c.views;
    this.otShared(t);
    return this.otFullViews.get(t.id).views;
  }

  /** Các trận của một bảng (hoặc mọi bảng – g = 'all') của giai đoạn tải lười. */
  on_otGroup(conn, { id, stage, g }) {
    const t = this.otGet(id);
    if (!t || !this.otCanSee(t, uidOf(conn.pid))) throw E('ot_not_found');
    const v = this.otFull(t)[Math.floor(Number(stage))];
    if (!v || !v.groups) throw E('bad_message');
    const all = g === 'all';
    const gi = Math.floor(Number(g));
    if (!all && !v.groups[gi]) throw E('bad_message');
    const list = all ? v.groups.map((x, i) => i) : [gi];
    if (!all && conn.watchOt === t.id) { // theo dõi bảng này: đổi thì đẩy lại (otPushGroups)
      conn.otGroups = conn.otGroups || new Map();
      if (conn.otGroups.size >= MAX_OPEN && !conn.otGroups.has(v.index + ':' + gi)) conn.otGroups.delete(conn.otGroups.keys().next().value);
      conn.otGroups.set(v.index + ':' + gi, JSON.stringify(v.groups[gi].rounds));
    }
    conn.send({ t: 'otGroup', id: t.id, stage: v.index, groups: list.map((i) => ({ g: i, rounds: v.groups[i].rounds })) });
  }

  /** Sau mỗi nhịp cập nhật: gửi lại các bảng người xem đang mở mà đã đổi (mỗi bảng chuyển JSON một lần cho mọi người). */
  otPushGroups(t, watchers) {
    let views = null;
    const json = new Map();
    for (const c of watchers) {
      if (!c.otGroups || !c.otGroups.size || c.watchOt !== t.id) continue;
      views = views || this.otFull(t);
      for (const [key, sent] of c.otGroups) {
        const [i, gi] = key.split(':').map(Number);
        const g = views[i] && views[i].groups && views[i].groups[gi];
        if (!g) { c.otGroups.delete(key); continue; }
        if (!json.has(key)) json.set(key, JSON.stringify(g.rounds));
        const now = json.get(key);
        if (now === sent) continue;
        c.otGroups.set(key, now);
        this.sendRaw(c, `{"t":"otGroup","id":${JSON.stringify(t.id)},"stage":${i},"groups":[{"g":${gi},"rounds":${now}}]}`);
      }
    }
  }
}

module.exports = { OTourLazy, LAZY_GROUPS, LAZY_MATCHES };
