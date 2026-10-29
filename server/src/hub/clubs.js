/*
 * Câu lạc bộ (học theo Team của Lichess):
 *  - Ai có tài khoản cũng tạo được (tối đa 2 câu lạc bộ mình làm chủ), quản trị viên duyệt mới hiện công khai.
 *  - Cách vào: tự do / gửi yêu cầu chờ duyệt / mã mời.
 *  - Vai trò: chủ (1 người, mọi quyền), quản lý (8 quyền tick riêng như TeamSecurity của Lichess – CLUB_PERMS), thành viên.
 *  - Trang CLB: biểu tượng, giới thiệu ngắn, mô tả (+ phần chỉ thành viên thấy), thông báo ghim, tin gửi toàn CLB,
 *    thành viên xếp theo Elo (ai đang online, ngày vào; có thể ẩn với người ngoài), giải đấu của CLB.
 *  - Yêu cầu vào kèm lời nhắn; từ chối thì vào danh sách đã từ chối (duyệt lại được, không gửi lại được); mời ra kèm chặn.
 * File này: dữ liệu, quyền, xem, vào / rời / duyệt / mời ra. Cài đặt, phân quyền, tin gửi toàn CLB: club-manage.js.
 */
'use strict';
const crypto = require('crypto');
const { E, note } = require('../msg.js');
const { cleanText, cleanPublicText, cleanPublicName, userPid, uidOf } = require('./shared.js');

const CLUB_JOIN = ['open', 'request', 'code'];
/**
 * Quyền của quản lý: public – hiện là quản lý trên trang CLB; settings – cài đặt, mô tả, thông báo, mã mời; tours – giải
 * của CLB; mod – kiểm duyệt chat / diễn đàn; requests – duyệt yêu cầu vào; broadcast – gửi tin toàn CLB; kick – mời ra,
 * chặn; admin – phân quyền cho quản lý khác. Chủ CLB và quản trị viên có mọi quyền.
 */
const CLUB_PERMS = ['public', 'settings', 'tours', 'mod', 'requests', 'broadcast', 'kick', 'admin'];
// Quản lý tạo trước khi có phân quyền (và quản lý mới thăng) có đúng các quyền của vai trò "quản lý" cũ
const DEFAULT_PERMS = ['public', 'settings', 'tours', 'requests', 'kick'];
const MAX_DECLINED = 100;
const MAX_BANNED = 500;
const MAX_OWNED_CLUBS = 2;
const MAX_CLUBS_PER_USER = 20;
const MAX_REQUESTS = 200;
const newCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

class Clubs {
  loadClubs() {
    this.clubs = new Map();
    for (const c of this.store.loadClubs()) this.clubs.set(c.id, normalizeClub(c));
  }

  saveClub(c) {
    this.store.saveClub(c);
  }

  /** Có vai trò quản lý (chủ / quản lý / quản trị viên) – không xét quyền cụ thể. */
  isOfficer(c, uid) {
    const r = c.members[uid];
    return r === 'owner' || r === 'officer' || this.isAdmin(uid);
  }

  /** Quyền cụ thể của quản lý (CLUB_PERMS); chủ CLB và quản trị viên có mọi quyền. */
  clubCan(c, uid, perm) {
    if (!uid) return false;
    if (c.owner === uid || this.isAdmin(uid)) return true;
    return c.members[uid] === 'officer' && clubPerms(c, uid).includes(perm);
  }

  requireClubPerm(c, uid, perm) {
    if (!this.clubCan(c, uid, perm)) throw E(perm === 'owner' ? 'club_owner_only' : 'club_officers_only');
  }

  /** CLB mà người này xem được: đã duyệt, hoặc mình là chủ / quản trị viên. */
  canSeeClub(c, uid) {
    return c.status === 'approved' || c.owner === uid || this.isAdmin(uid);
  }

  clubSummary(c, uid) {
    return {
      id: c.id, name: c.name, icon: c.icon || '', intro: c.intro || c.desc.slice(0, 140), join: c.join, status: c.status,
      count: Object.keys(c.members).length, role: (uid && c.members[uid]) || null,
      requested: !!(uid && c.requests.includes(uid)), owner: this.store.users.get(c.owner)?.name || '?',
    };
  }

  clubView(c, uid) {
    const member = !!(uid && c.members[uid]);
    const can = (p) => this.clubCan(c, uid, p);
    const officer = !!uid && this.isOfficer(c, uid);
    const ROLE = { owner: 0, officer: 1, member: 2 };
    const name = (id) => this.store.users.get(id)?.name || '?';
    // Ẩn danh sách thành viên: người ngoài chỉ thấy chủ và quản lý công khai
    const showAll = !c.hideMembers || member || officer;
    const members = Object.entries(c.members)
      .filter(([id, role]) => showAll || role === 'owner' || (role === 'officer' && clubPerms(c, id).includes('public')))
      .map(([id, role]) => {
        const u = this.store.users.get(id);
        // Quản lý không công khai: người khác (trừ ban quản lý) thấy như thành viên
        const shown = role === 'officer' && !clubPerms(c, id).includes('public') && !officer ? 'member' : role;
        return {
          id, role: shown, name: u?.name || '?', username: u?.username || '', rating: u?.rating || 1200, status: this.status(id),
          joined: c.joinedAt[id] || c.created, perms: officer && role === 'officer' ? clubPerms(c, id) : undefined,
        };
      }).sort((a, b) => b.rating - a.rating || ROLE[a.role] - ROLE[b.role]);
    const myPerms = uid ? CLUB_PERMS.filter(can) : [];
    return {
      ...this.clubSummary(c, uid),
      desc: c.desc, privDesc: member || officer ? c.privDesc || '' : '', announcement: c.announcement || '', created: c.created,
      hideMembers: !!c.hideMembers, chat: c.chat, forum: c.forum,
      members, membersHidden: !showAll, officer, isOwner: c.owner === uid, perms: myPerms,
      muted: !!(uid && c.muted.includes(uid)),
      // Chat / diễn đàn (club-talk.js): mình đọc / viết được không; người bị cấm nói (ban quản lý thấy)
      talk: {
        chat: this.canChat(c, uid, false), chatWrite: this.canChat(c, uid, true), forum: this.canForum(c, uid, false), forumWrite: this.canForum(c, uid, true),
        muted: !!(uid && c.talkMuted.includes(uid)),
      },
      talkMuted: can('mod') ? c.talkMuted : [],
      msgs: member || officer ? c.msgs.slice(-10).reverse() : [],
      msgWait: can('broadcast') ? Math.max(0, (c.lastMsgAt || 0) + this.T.CLUB_MSG_MS - Date.now()) : 0,
      code: (can('settings') || can('requests')) && c.join === 'code' ? c.code : null,
      requests: can('requests') ? c.requests.map((id) => ({ id, name: name(id), rating: this.store.users.get(id)?.rating || 1200, msg: c.reqMsg[id] || '' })) : [],
      declined: can('requests') ? c.declined.map((x) => ({ id: x.uid, name: name(x.uid), at: x.at, msg: x.msg || '' })) : [],
      banned: can('kick') ? Object.entries(c.banned).map(([id, x]) => ({ id, name: name(id), at: x.at })) : [],
      reviewNote: c.owner === uid || this.isAdmin(uid) ? c.reviewNote || '' : '',
      tours: [...this.tours.values()].filter((t) => t.club === c.id && this.canSeeTour(t, uid))
        .sort((a, b) => b.startsAt - a.startsAt).slice(0, 30).map((t) => this.tourSummary(t, uid)),
    };
  }

  findClub(id, uid) {
    const c = this.clubs.get(String(id || ''));
    if (!c || !this.canSeeClub(c, uid)) throw E('club_not_found');
    return c;
  }

  /** Người đang mở trang CLB này nhận bản mới. */
  pushClub(c) {
    for (const set of this.byPid.values()) {
      for (const conn of set) if (conn.watchClub === c.id) conn.send({ t: 'club', club: this.canSeeClub(c, uidOf(conn.pid)) ? this.clubView(c, uidOf(conn.pid)) : null, id: c.id });
    }
  }

  on_clubCreate(conn, { name, desc, intro, icon, join }) {
    const me = this.requireUser(conn);
    name = cleanPublicName(name).slice(0, 40);
    if (name.length < 3) throw E('club_name_short');
    const owned = [...this.clubs.values()].filter((c) => c.owner === me.id && c.status !== 'rejected');
    if (owned.length >= MAX_OWNED_CLUBS) throw E('club_limit', { n: MAX_OWNED_CLUBS });
    const key = name.toLowerCase();
    if ([...this.clubs.values()].some((c) => c.status !== 'rejected' && c.name.toLowerCase() === key)) throw E('club_name_taken');
    const admin = this.isAdmin(me.id);
    const c = normalizeClub({
      id: crypto.randomBytes(5).toString('hex'), name, desc: cleanMultiline(desc, MAX_DESC), intro: cleanPublicText(intro, 200),
      icon: CLUB_ICONS.includes(icon) ? icon : '', join: CLUB_JOIN.includes(join) ? join : 'open',
      code: newCode(), owner: me.id, members: { [me.id]: 'owner' }, requests: [], announcement: '',
      status: admin ? 'approved' : 'pending', created: Date.now(),
    });
    this.clubs.set(c.id, c);
    this.saveClub(c);
    conn.send({ t: 'clubCreated', id: c.id, status: c.status });
    if (!admin) this.notifyAdmins(name);
  }

  on_clubList(conn, { q }) {
    const uid = uidOf(conn.pid);
    q = cleanText(q, 40).toLowerCase();
    const all = [...this.clubs.values()];
    conn.send({
      t: 'clubList',
      mine: uid ? all.filter((c) => c.members[uid] || (c.owner === uid && c.status !== 'approved')).map((c) => this.clubSummary(c, uid)) : [],
      clubs: all.filter((c) => c.status === 'approved' && (!q || c.name.toLowerCase().includes(q)))
        .sort((a, b) => Object.keys(b.members).length - Object.keys(a.members).length).slice(0, 50)
        .map((c) => this.clubSummary(c, uid)),
    });
  }

  on_clubGet(conn, { id }) {
    const uid = uidOf(conn.pid);
    const c = this.findClub(id, uid);
    conn.watchClub = c.id;
    conn.send({ t: 'club', club: this.clubView(c, uid), id: c.id });
    this.clubTalkOpen(conn, c, uid); // chat gần nhất (club-talk.js)
  }

  on_clubUnwatch(conn) {
    conn.watchClub = null;
    conn.watchTopic = null;
  }

  on_clubJoin(conn, { id, code, msg }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (c.status !== 'approved') throw E('club_not_found');
    if (c.members[me.id]) return;
    if (c.banned[me.id]) throw E('club_banned');
    if ([...this.clubs.values()].filter((x) => x.members[me.id]).length >= MAX_CLUBS_PER_USER) {
      throw E('club_join_limit', { n: MAX_CLUBS_PER_USER });
    }
    if (c.join === 'code') {
      const rules = [['clubcode:' + me.id, 10]];
      this.limit(rules);
      if (String(code || '').trim().toUpperCase() !== c.code) { this.fail(rules); throw E('club_bad_code'); }
    }
    if (c.join === 'request') {
      // Đã bị từ chối: không gửi lại được (tránh làm phiền) – ban quản lý có thể duyệt lại từ danh sách đã từ chối
      if (c.declined.some((x) => x.uid === me.id)) throw E('club_request_declined');
      if (!c.requests.includes(me.id)) {
        if (c.requests.length >= MAX_REQUESTS) throw E('too_fast');
        c.requests.push(me.id);
        const text = cleanPublicText(msg, 300);
        if (text) c.reqMsg[me.id] = text;
        for (const uid of this.clubManagers(c, 'requests')) this.send(userPid(uid), note('club_request_in', { name: me.name, club: c.name }));
      }
      conn.send(note('club_request_sent', { club: c.name }));
    } else {
      this.addMember(c, me.id);
      conn.send(note('club_joined', { club: c.name }));
    }
    this.saveClub(c);
    this.pushClub(c);
  }

  on_clubLeave(conn, { id }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (c.owner === me.id) throw E('club_owner_leave');
    this.dropMember(c, me.id);
    c.requests = c.requests.filter((x) => x !== me.id);
    delete c.reqMsg[me.id];
    this.saveClub(c);
    this.pushClub(c);
  }

  /** Duyệt yêu cầu vào (quyền requests). Từ chối: vào danh sách đã từ chối – duyệt lại được bằng clubReconsider. */
  on_clubRequest(conn, { id, uid, accept }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    this.requireClubPerm(c, me.id, 'requests');
    if (!c.requests.includes(uid)) throw E('request_gone');
    c.requests = c.requests.filter((x) => x !== uid);
    const msg = c.reqMsg[uid] || '';
    delete c.reqMsg[uid];
    if (accept && this.store.users.get(uid)) {
      this.addMember(c, uid);
      this.send(userPid(uid), note('club_request_accepted', { club: c.name }));
    } else if (!accept) {
      c.declined.push({ uid, at: Date.now(), msg });
      if (c.declined.length > MAX_DECLINED) c.declined.shift();
    }
    this.saveClub(c);
    this.pushClub(c);
  }

  /** Mời ra (quyền kick); ban: chặn luôn (không vào / gửi yêu cầu lại được). */
  on_clubKick(conn, { id, uid, ban }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    this.requireClubPerm(c, me.id, 'kick');
    const role = c.members[uid];
    // Quản lý chỉ mời ra được thành viên thường; chủ CLB không bị mời ra
    if (!role || role === 'owner' || (role === 'officer' && c.owner !== me.id && !this.isAdmin(me.id))) throw E('club_cannot_kick');
    this.dropMember(c, uid);
    if (ban) {
      c.banned[uid] = { at: Date.now(), by: me.id };
      const ids = Object.keys(c.banned);
      if (ids.length > MAX_BANNED) delete c.banned[ids[0]];
    }
    this.saveClub(c);
    this.send(userPid(uid), note('club_kicked', { club: c.name }));
    this.pushClub(c);
  }

  /** Vào CLB: ghi ngày vào. */
  addMember(c, uid) {
    c.members[uid] = 'member';
    c.joinedAt[uid] = Date.now();
    c.declined = c.declined.filter((x) => x.uid !== uid);
  }

  /** Rời / bị mời ra: xoá mọi dấu vết thành viên (quyền, ngày vào, tắt tin, đã đọc). */
  dropMember(c, uid) {
    delete c.members[uid];
    delete c.perms[uid];
    delete c.joinedAt[uid];
    delete c.seen[uid];
    c.muted = c.muted.filter((x) => x !== uid);
    c.talkMuted = c.talkMuted.filter((x) => x !== uid);
  }

  /** Những người có quyền perm (chủ + quản lý có quyền đó) – để gửi thông báo. */
  clubManagers(c, perm) {
    return Object.keys(c.members).filter((u) => c.owner === u || (c.members[u] === 'officer' && clubPerms(c, u).includes(perm)));
  }

  /** Tài khoản bị xoá: rời mọi CLB; CLB mình làm chủ trao cho quản lý / thành viên lâu nhất, hết người thì giải tán. */
  clubUserGone(uid) {
    for (const c of [...this.clubs.values()]) {
      c.requests = c.requests.filter((x) => x !== uid);
      delete c.reqMsg[uid];
      c.declined = c.declined.filter((x) => x.uid !== uid);
      delete c.banned[uid];
      if (!c.members[uid] && c.owner !== uid) continue;
      this.dropMember(c, uid);
      if (c.owner === uid) {
        const next = Object.keys(c.members).find((k) => c.members[k] === 'officer') || Object.keys(c.members)[0];
        if (!next) {
          this.clubs.delete(c.id);
          this.store.dropClub(c.id);
          continue;
        }
        c.owner = next;
        c.members[next] = 'owner';
        delete c.perms[next];
      }
      this.saveClub(c);
    }
  }
}

// Biểu tượng CLB chọn sẵn (không tải ảnh lên: không phải duyệt ảnh, không tốn chỗ)
const CLUB_ICONS = ['♟️', '🏆', '⚔️', '🔥', '⭐', '🐉', '🦁', '🐯', '🦅', '🐺', '🦊', '🐼', '🌸', '🍀', '⚡', '🌙', '☀️', '🌊', '🎯', '🎓', '🏫', '🏰', '🚀', '💎'];
const MAX_DESC = 2000;
/** Chữ nhiều dòng (mô tả CLB): giữ xuống dòng, bỏ ký tự điều khiển khác, tối đa 2 dòng trống liền nhau, che từ tục. */
const cleanMultiline = (s, max) => cleanPublicText(String(s || '').replace(/\r\n?/g, '\n').replace(/\n/g, '\u2028'), max)
  .replace(/\u2028/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
/** Quyền của một quản lý (chưa phân quyền: quyền mặc định của vai trò quản lý cũ). */
const clubPerms = (c, uid) => (c.perms && Array.isArray(c.perms[uid]) ? c.perms[uid] : DEFAULT_PERMS);
/** CLB lưu từ bản trước: thêm các trường mới. */
function normalizeClub(c) {
  c.perms = c.perms || {};
  c.joinedAt = c.joinedAt || {};
  c.reqMsg = c.reqMsg || {};
  c.declined = c.declined || [];
  c.banned = c.banned || {};
  c.muted = c.muted || [];
  c.msgs = c.msgs || [];
  c.seen = c.seen || {};
  c.talkMuted = c.talkMuted || []; // bị cấm nói ở chat / diễn đàn (club-talk.js)
  c.chat = c.chat || 'members';
  c.forum = c.forum || 'members';
  if (c.intro == null) c.intro = '';
  return c;
}

module.exports = { Clubs, CLUB_PERMS, DEFAULT_PERMS, CLUB_ICONS, CLUB_JOIN, MAX_DESC, clubPerms, cleanMultiline, newCode };
