/*
 * Câu lạc bộ – quản lý (học theo Team của Lichess):
 *  - Cài đặt: biểu tượng, giới thiệu ngắn, mô tả, mô tả chỉ thành viên thấy, thông báo ghim, cách vào, ẩn danh sách
 *    thành viên, chat / diễn đàn (ai được dùng – Đợt 8), mã mời.
 *  - Vai trò và 8 quyền của quản lý (CLUB_PERMS); trao quyền chủ; giải tán.
 *  - Danh sách đã từ chối (duyệt lại), bị chặn (bỏ chặn).
 *  - Tin gửi toàn CLB (quyền broadcast, 1 tin / 12 giờ): người online nhận ngay, người offline nhận khi vào lại (chuông
 *    thông báo); thành viên tự tắt nhận tin được.
 * Dữ liệu, quyền, vào / rời / duyệt / mời ra: clubs.js.
 */
'use strict';
const crypto = require('crypto');
const { E, note } = require('../msg.js');
const { cleanPublicText, userPid } = require('./shared.js');
const { CLUB_PERMS, DEFAULT_PERMS, CLUB_ICONS, CLUB_JOIN, MAX_DESC, clubPerms, cleanMultiline, newCode } = require('./clubs.js');

const CHAT_MODES = ['off', 'officers', 'members'];
const FORUM_MODES = ['off', 'officers', 'members', 'everyone'];
const MAX_MSGS = 20; // tin gửi toàn CLB giữ lại
const INBOX_DAYS = 14; // người offline: chỉ nhận tin trong 14 ngày gần đây

class ClubManage {
  /**
   * Ai được đổi vai trò / quyền của người khác: chủ CLB (mọi người), quản lý có quyền admin (chỉ quản lý không có
   * quyền admin và thành viên – không "đảo chính" lẫn nhau). Không ai đổi được chủ CLB ở đây.
   */
  canSetRole(c, by, uid) {
    if (!c.members[uid] || uid === c.owner || uid === by) return false;
    if (c.owner === by || this.isAdmin(by)) return true;
    if (!this.clubCan(c, by, 'admin')) return false;
    return !(c.members[uid] === 'officer' && clubPerms(c, uid).includes('admin'));
  }

  /** Đổi vai trò: 'officer' / 'member'; 'owner' = trao quyền chủ (chỉ chủ CLB; chủ cũ thành quản lý đủ quyền). */
  on_clubRole(conn, { id, uid, role }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (!['officer', 'member', 'owner'].includes(role)) throw E('bad_message');
    if (role === 'owner') {
      this.requireClubPerm(c, me.id, 'owner'); // chỉ chủ CLB / quản trị viên ('owner' không phải quyền của quản lý)
      if (!c.members[uid] || uid === c.owner) throw E('bad_message');
      c.members[c.owner] = 'officer';
      c.perms[c.owner] = [...CLUB_PERMS];
      c.owner = uid;
      c.members[uid] = 'owner';
      delete c.perms[uid];
    } else {
      if (!this.canSetRole(c, me.id, uid)) throw E(this.isOfficer(c, me.id) ? 'club_cannot_kick' : 'club_officers_only');
      c.members[uid] = role;
      if (role === 'officer') c.perms[uid] = c.perms[uid] || [...DEFAULT_PERMS];
      else delete c.perms[uid];
    }
    this.saveClub(c);
    this.pushClub(c);
  }

  /** Tick quyền cho một quản lý. Quyền admin chỉ chủ CLB cấp. */
  on_clubPerms(conn, { id, uid, perms }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (c.members[uid] !== 'officer' || !this.canSetRole(c, me.id, uid)) throw E('club_officers_only');
    const owner = c.owner === me.id || this.isAdmin(me.id);
    const want = new Set((Array.isArray(perms) ? perms : []).filter((p) => CLUB_PERMS.includes(p)));
    // Người không phải chủ: giữ nguyên quyền admin của người kia (không cấp, không gỡ)
    if (!owner) { want.delete('admin'); if (clubPerms(c, uid).includes('admin')) want.add('admin'); }
    c.perms[uid] = CLUB_PERMS.filter((p) => want.has(p));
    this.saveClub(c);
    this.pushClub(c);
  }

  on_clubUpdate(conn, o) {
    const me = this.requireUser(conn);
    const c = this.findClub(o.id, me.id);
    this.requireClubPerm(c, me.id, 'settings');
    if (typeof o.intro === 'string') c.intro = cleanPublicText(o.intro, 200);
    if (typeof o.desc === 'string') c.desc = cleanMultiline(o.desc, MAX_DESC);
    if (typeof o.privDesc === 'string') c.privDesc = cleanMultiline(o.privDesc, 2000);
    if (typeof o.announcement === 'string') c.announcement = cleanPublicText(o.announcement, 300);
    if (typeof o.icon === 'string') c.icon = CLUB_ICONS.includes(o.icon) ? o.icon : '';
    if (CLUB_JOIN.includes(o.join)) c.join = o.join;
    if (typeof o.hideMembers === 'boolean') c.hideMembers = o.hideMembers;
    if (CHAT_MODES.includes(o.chat)) c.chat = o.chat;
    if (FORUM_MODES.includes(o.forum)) c.forum = o.forum;
    this.saveClub(c);
    this.pushClub(c);
  }

  on_clubNewCode(conn, { id }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    this.requireClubPerm(c, me.id, 'settings');
    c.code = newCode();
    this.saveClub(c);
    this.pushClub(c);
  }

  /** Danh sách đã từ chối: accept = nhận vào; không thì bỏ khỏi danh sách (người đó gửi yêu cầu lại được). */
  on_clubReconsider(conn, { id, uid, accept }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    this.requireClubPerm(c, me.id, 'requests');
    if (!c.declined.some((x) => x.uid === uid)) throw E('request_gone');
    c.declined = c.declined.filter((x) => x.uid !== uid);
    if (accept && this.store.users.get(uid) && !c.members[uid] && !c.banned[uid]) {
      this.addMember(c, uid);
      this.send(userPid(uid), note('club_request_accepted', { club: c.name }));
    }
    this.saveClub(c);
    this.pushClub(c);
  }

  on_clubUnban(conn, { id, uid }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    this.requireClubPerm(c, me.id, 'kick');
    delete c.banned[uid];
    this.saveClub(c);
    this.pushClub(c);
  }

  /** Tin gửi toàn CLB (quyền broadcast): mỗi CLB 1 tin / CLUB_MSG_MS (12 giờ); quản trị viên không bị giới hạn. */
  on_clubBroadcast(conn, { id, text }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    this.requireClubPerm(c, me.id, 'broadcast');
    if (c.status !== 'approved') throw E('club_not_found');
    text = cleanMultiline(text, 1000);
    if (!text) throw E('bad_message');
    const wait = (c.lastMsgAt || 0) + this.T.CLUB_MSG_MS - Date.now();
    if (wait > 0 && !this.isAdmin(me.id)) throw E('club_msg_wait', { h: Math.ceil(wait / 3600000) });
    const msg = { id: crypto.randomBytes(4).toString('hex'), at: Date.now(), by: me.name, text };
    c.msgs.push(msg);
    if (c.msgs.length > MAX_MSGS) c.msgs.shift();
    c.lastMsgAt = msg.at;
    const club = { id: c.id, name: c.name, icon: c.icon || '' };
    for (const uid of Object.keys(c.members)) {
      if (uid === me.id || c.muted.includes(uid) || !this.isOnline(userPid(uid))) continue;
      this.send(userPid(uid), { t: 'clubMsgs', items: [{ club, msg }] });
      c.seen[uid] = msg.at;
    }
    this.saveClub(c);
    this.pushClub(c);
  }

  /** Thành viên tự tắt / bật nhận tin gửi toàn CLB. */
  on_clubMute(conn, { id, mute }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (!c.members[me.id]) throw E('club_not_found');
    c.muted = c.muted.filter((x) => x !== me.id);
    if (mute) c.muted.push(me.id);
    this.saveClub(c);
    this.pushClub(c);
  }

  /** Vào lại (welcome): tin gửi toàn CLB chưa nhận của các CLB mình tham gia (14 ngày gần đây). */
  clubInbox(conn, uid) {
    const items = [];
    const since = Date.now() - INBOX_DAYS * 86400000;
    for (const c of this.clubs.values()) {
      if (!c.members[uid] || c.muted.includes(uid) || !c.msgs.length) continue;
      const from = Math.max(c.seen[uid] || 0, c.joinedAt[uid] || 0, since);
      const fresh = c.msgs.filter((m) => m.at > from);
      if (!fresh.length) continue;
      for (const msg of fresh) items.push({ club: { id: c.id, name: c.name, icon: c.icon || '' }, msg });
      c.seen[uid] = fresh[fresh.length - 1].at;
      this.saveClub(c);
    }
    if (items.length) conn.send({ t: 'clubMsgs', items: items.sort((a, b) => a.msg.at - b.msg.at).slice(-30) });
  }

  /** Giải tán CLB (chủ CLB / quản trị viên). Giải của CLB chưa bắt đầu bị huỷ. */
  on_clubDisband(conn, { id }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (c.owner !== me.id && !this.isAdmin(me.id)) throw E('club_owner_only');
    const tours = [...this.tours.values()].filter((t) => t.club === c.id);
    if (tours.some((t) => t.status === 'running')) throw E('club_has_running_tour');
    for (const t of tours) if (t.status === 'pending' || t.status === 'scheduled') this.cancelTour(t, 'club_disbanded');
    this.clubs.delete(c.id);
    this.store.dropClub(c.id);
    for (const set of this.byPid.values()) for (const k of set) if (k.watchClub === c.id) { k.watchClub = null; k.send({ t: 'club', club: null, id: c.id }); }
    if (c.status === 'pending') this.notifyAdmins();
  }
}

module.exports = { ClubManage, CHAT_MODES, FORUM_MODES };
