/*
 * Giải đấu – mẫu giải và giải định kỳ (Đợt 10):
 *  - Mẫu giải: mỗi người lưu tối đa MAX_TPL mẫu (bản nháp của form tạo giải, do trình duyệt tạo – máy chủ chỉ giữ, giới
 *    hạn kích thước). Dùng lại ở form nhanh ("Mẫu của tôi"). Sao chép một giải cũ làm ở trình duyệt (tour-tpl.js).
 *  - Giải định kỳ ('weekly' / 'monthly'): giải xong (hoặc bị huỷ) thì tự tạo giải kế tiếp cùng cài đặt, giờ đấu lùi
 *    1 tuần / 1 tháng. Vẫn qua quản trị viên duyệt (người tạo là quản trị viên thì mở đăng ký luôn). Tắt ở cài đặt giải kế tiếp.
 */
'use strict';
const crypto = require('crypto');
const { E, note } = require('../msg.js');
const { cleanPublicName, userPid } = require('./shared.js');

const MAX_TPL = 10;
const MAX_ACTIVE_TOURS_PER_USER = 3; // như tournaments.js
const MAX_TPL_BYTES = 16 * 1024;
const RECUR = ['weekly', 'monthly'];
// Cấu hình mang sang giải kế tiếp (không mang người chơi, kết quả, hàng chờ, thông báo…)
const KEEP = ['name', 'desc', 'format', 'timeLimit', 'clock', 'opening', 'rule', 'rated', 'access', 'club', 'maxPlayers', 'minutes', 'stages',
  'seeding', 'checkin', 'offline', 'scoreMode', 'noShowMin', 'hideSeeds', 'teams', 'recur', 'selfReport', 'notifyMatch', 'notifyResults', 'showNews',
  'showStandings', 'roundLabels', 'hideBracket', 'quickAdvance', 'attachments', 'placeBy', 'shareImages', 'arrangeNext']; // không mang link riêng (slug)

class TourTpl {
  // ------------------------------------------------------------ Mẫu giải
  on_tourTpls(conn) {
    const me = this.requireUser(conn);
    conn.send({ t: 'tourTpls', list: (me.tourTpls || []).map(({ id, name, at, data }) => ({ id, name, at, data })) });
  }

  on_tourTplSave(conn, { name, data }) {
    const me = this.requireUser(conn);
    name = cleanPublicName(name).slice(0, 40);
    if (name.length < 2) throw E('tour_tpl_name');
    let json;
    try { json = JSON.stringify(data); } catch (e) { throw E('bad_message'); }
    if (!json || json.length > MAX_TPL_BYTES || typeof data !== 'object') throw E('bad_message');
    me.tourTpls = (me.tourTpls || []).filter((x) => x.name !== name); // trùng tên: ghi đè
    if (me.tourTpls.length >= MAX_TPL) throw E('tour_tpl_limit', { n: MAX_TPL });
    me.tourTpls.unshift({ id: crypto.randomBytes(4).toString('hex'), name, at: Date.now(), data: JSON.parse(json) });
    this.store.touch(me);
    this.on_tourTpls(conn);
  }

  on_tourTplDel(conn, { id }) {
    const me = this.requireUser(conn);
    me.tourTpls = (me.tourTpls || []).filter((x) => x.id !== id);
    this.store.touch(me);
    this.on_tourTpls(conn);
  }

  // ------------------------------------------------------------ Giải định kỳ
  /** Giờ đấu kế tiếp: lùi 1 tuần / 1 tháng cho tới khi còn ít nhất 1 giờ nữa. */
  nextStart(t, now) {
    const d = new Date(t.startsAt);
    do {
      if (t.recur === 'weekly') d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
    } while (d.getTime() < now + 3600000);
    return d.getTime();
  }

  /** Giải định kỳ vừa xong / bị huỷ (tour-run.js gọi): tạo giải kế tiếp một lần. */
  tourRecur(t) {
    if (!RECUR.includes(t.recur) || t.recurNext || t.teamMatch) return;
    const u = this.store.users.get(t.creator);
    if (!u) return;
    const now = Date.now();
    const active = [...this.tours.values()].filter((x) => x.creator === u.id && ['draft', 'pending', 'scheduled', 'running'].includes(x.status));
    if (active.length >= MAX_ACTIVE_TOURS_PER_USER) return;
    const fields = Object.fromEntries(KEEP.filter((k) => t[k] !== undefined).map((k) => [k, structuredClone(t[k])]));
    const status = this.isAdmin(u.id) ? 'scheduled' : 'pending';
    const next = {
      ...fields, id: crypto.randomBytes(5).toString('hex'), startsAt: this.nextStart(t, now), reg: t.reg ? { ...structuredClone(t.reg), closeAt: null } : null,
      staff: structuredClone(t.staff || []), recurFrom: t.recurFrom || t.id, recurN: (t.recurN || 1) + 1,
      creator: u.id, status, created: now, players: [], games: [], queue: [],
    };
    t.recurNext = next.id;
    this.tours.set(next.id, next);
    this.tourLog(next, null, 'recur_created', { n: next.recurN });
    this.saveTour(next);
    this.saveTour(t);
    this.send(userPid(u.id), note('tour_recur_next', { name: next.name }));
    if (status === 'pending') this.notifyAdmins(next.name);
  }
}

module.exports = { TourTpl, RECUR, MAX_TPL };
