/*
 * Câu lạc bộ (học theo Team của Lichess):
 *  - Ai có tài khoản cũng tạo được (tối đa 2 câu lạc bộ mình làm chủ), quản trị viên duyệt mới hiện công khai.
 *  - Cách vào: tự do / gửi yêu cầu chờ duyệt / mã mời.
 *  - Vai trò: chủ (1 người), quản lý (duyệt thành viên, mời ra, tạo giải của CLB, sửa thông báo), thành viên.
 *  - Trang CLB: giới thiệu, thông báo ghim, thành viên xếp theo Elo (ai đang online), giải đấu của CLB.
 */
'use strict';
const crypto = require('crypto');
const { E, note } = require('../msg.js');
const { cleanText, cleanPublicText, cleanPublicName, userPid, uidOf } = require('./shared.js');

const CLUB_JOIN = ['open', 'request', 'code'];
const MAX_OWNED_CLUBS = 2;
const MAX_CLUBS_PER_USER = 20;
const MAX_REQUESTS = 200;
const newCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

class Clubs {
  loadClubs() {
    this.clubs = new Map();
    for (const c of this.store.loadClubs()) this.clubs.set(c.id, c);
  }

  saveClub(c) {
    this.store.saveClub(c);
  }

  isOfficer(c, uid) {
    const r = c.members[uid];
    return r === 'owner' || r === 'officer' || this.isAdmin(uid);
  }

  /** CLB mà người này xem được: đã duyệt, hoặc mình là chủ / quản trị viên. */
  canSeeClub(c, uid) {
    return c.status === 'approved' || c.owner === uid || this.isAdmin(uid);
  }

  clubSummary(c, uid) {
    return {
      id: c.id, name: c.name, desc: c.desc.slice(0, 140), join: c.join, status: c.status,
      count: Object.keys(c.members).length, role: (uid && c.members[uid]) || null,
      requested: !!(uid && c.requests.includes(uid)), owner: this.store.users.get(c.owner)?.name || '?',
    };
  }

  clubView(c, uid) {
    const officer = !!uid && this.isOfficer(c, uid);
    const ROLE = { owner: 0, officer: 1, member: 2 };
    const members = Object.entries(c.members).map(([id, role]) => {
      const u = this.store.users.get(id);
      return { id, role, name: u?.name || '?', username: u?.username || '', rating: u?.rating || 1200, status: this.status(id) };
    }).sort((a, b) => b.rating - a.rating || ROLE[a.role] - ROLE[b.role]);
    return {
      ...this.clubSummary(c, uid),
      desc: c.desc, announcement: c.announcement || '', created: c.created,
      members, officer, isOwner: c.owner === uid,
      code: officer && c.join === 'code' ? c.code : null,
      requests: officer ? c.requests.map((id) => ({ id, name: this.store.users.get(id)?.name || '?', rating: this.store.users.get(id)?.rating || 1200 })) : [],
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

  on_clubCreate(conn, { name, desc, join }) {
    const me = this.requireUser(conn);
    name = cleanPublicName(name).slice(0, 40);
    if (name.length < 3) throw E('club_name_short');
    const owned = [...this.clubs.values()].filter((c) => c.owner === me.id && c.status !== 'rejected');
    if (owned.length >= MAX_OWNED_CLUBS) throw E('club_limit', { n: MAX_OWNED_CLUBS });
    const key = name.toLowerCase();
    if ([...this.clubs.values()].some((c) => c.status !== 'rejected' && c.name.toLowerCase() === key)) throw E('club_name_taken');
    const admin = this.isAdmin(me.id);
    const c = {
      id: crypto.randomBytes(5).toString('hex'), name, desc: cleanPublicText(desc, 500), join: CLUB_JOIN.includes(join) ? join : 'open',
      code: newCode(), owner: me.id, members: { [me.id]: 'owner' }, requests: [], announcement: '',
      status: admin ? 'approved' : 'pending', created: Date.now(),
    };
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
  }

  on_clubUnwatch(conn) {
    conn.watchClub = null;
  }

  on_clubJoin(conn, { id, code }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (c.status !== 'approved') throw E('club_not_found');
    if (c.members[me.id]) return;
    if ([...this.clubs.values()].filter((x) => x.members[me.id]).length >= MAX_CLUBS_PER_USER) {
      throw E('club_join_limit', { n: MAX_CLUBS_PER_USER });
    }
    if (c.join === 'code') {
      const rules = [['clubcode:' + me.id, 10]];
      this.limit(rules);
      if (String(code || '').trim().toUpperCase() !== c.code) { this.fail(rules); throw E('club_bad_code'); }
    }
    if (c.join === 'request') {
      if (!c.requests.includes(me.id)) {
        if (c.requests.length >= MAX_REQUESTS) throw E('too_fast');
        c.requests.push(me.id);
        for (const [uid, role] of Object.entries(c.members)) {
          if (role !== 'member') this.send(userPid(uid), note('club_request_in', { name: me.name, club: c.name }));
        }
      }
      conn.send(note('club_request_sent', { club: c.name }));
    } else {
      c.members[me.id] = 'member';
      conn.send(note('club_joined', { club: c.name }));
    }
    this.saveClub(c);
    this.pushClub(c);
  }

  on_clubLeave(conn, { id }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (c.owner === me.id) throw E('club_owner_leave');
    delete c.members[me.id];
    c.requests = c.requests.filter((x) => x !== me.id);
    this.saveClub(c);
    this.pushClub(c);
  }

  on_clubRequest(conn, { id, uid, accept }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (!this.isOfficer(c, me.id)) throw E('club_officers_only');
    if (!c.requests.includes(uid)) throw E('request_gone');
    c.requests = c.requests.filter((x) => x !== uid);
    if (accept && this.store.users.get(uid)) {
      c.members[uid] = 'member';
      this.send(userPid(uid), note('club_request_accepted', { club: c.name }));
    }
    this.saveClub(c);
    this.pushClub(c);
  }

  on_clubKick(conn, { id, uid }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (!this.isOfficer(c, me.id)) throw E('club_officers_only');
    const role = c.members[uid];
    // Quản lý chỉ mời ra được thành viên thường; chủ CLB không bị mời ra
    if (!role || role === 'owner' || (role === 'officer' && c.owner !== me.id && !this.isAdmin(me.id))) throw E('club_cannot_kick');
    delete c.members[uid];
    this.saveClub(c);
    this.send(userPid(uid), note('club_kicked', { club: c.name }));
    this.pushClub(c);
  }

  /** Chủ CLB đổi vai trò: 'officer' / 'member', hoặc 'owner' = trao quyền chủ (mình thành quản lý). */
  on_clubRole(conn, { id, uid, role }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (c.owner !== me.id && !this.isAdmin(me.id)) throw E('club_owner_only');
    if (!c.members[uid] || uid === c.owner || !['officer', 'member', 'owner'].includes(role)) throw E('bad_message');
    if (role === 'owner') {
      c.members[c.owner] = 'officer';
      c.owner = uid;
    }
    c.members[uid] = role;
    this.saveClub(c);
    this.pushClub(c);
  }

  on_clubUpdate(conn, { id, desc, announcement, join }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (!this.isOfficer(c, me.id)) throw E('club_officers_only');
    if (typeof desc === 'string') c.desc = cleanPublicText(desc, 500);
    if (typeof announcement === 'string') c.announcement = cleanPublicText(announcement, 300);
    if (CLUB_JOIN.includes(join) && (c.owner === me.id || this.isAdmin(me.id))) c.join = join;
    this.saveClub(c);
    this.pushClub(c);
  }

  on_clubNewCode(conn, { id }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (!this.isOfficer(c, me.id)) throw E('club_officers_only');
    c.code = newCode();
    this.saveClub(c);
    this.pushClub(c);
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

  /** Tài khoản bị xoá: rời mọi CLB; CLB mình làm chủ trao cho quản lý / thành viên lâu nhất, hết người thì giải tán. */
  clubUserGone(uid) {
    for (const c of [...this.clubs.values()]) {
      c.requests = c.requests.filter((x) => x !== uid);
      if (!c.members[uid] && c.owner !== uid) continue;
      delete c.members[uid];
      if (c.owner === uid) {
        const next = Object.keys(c.members).find((k) => c.members[k] === 'officer') || Object.keys(c.members)[0];
        if (!next) {
          this.clubs.delete(c.id);
          this.store.dropClub(c.id);
          continue;
        }
        c.owner = next;
        c.members[next] = 'owner';
      }
      this.saveClub(c);
    }
  }
}

module.exports = { Clubs };
