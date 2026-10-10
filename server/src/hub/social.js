/* Bạn bè, xếp hạng, lịch sử & đối đầu, chặn & báo cáo, tin nhắn bạn bè. */
'use strict';
const { DRAW } = require('../room.js');
const { E, note } = require('../msg.js');
const { REPORT_REASONS, cleanText, userPid, uidOf } = require('./shared.js');
const R = require('../rating.js');

class Social {
  status(uid) {
    const pid = userPid(uid);
    if (!this.isOnline(pid)) return 'offline';
    const room = this.roomFor(pid);
    return room && room.full ? 'playing' : 'online';
  }

  friendsMsg(uid) {
    const u = this.store.users.get(uid);
    const card = (id) => {
      const f = this.store.users.get(id);
      return f && { id: f.id, username: f.username, name: f.name, status: this.status(f.id), rating: f.rating };
    };
    const unread = this.store.unread(uid);
    return {
      t: 'friends',
      // Bạn bè: thêm thành tích đối đầu và số tin nhắn chưa đọc
      friends: u.friends.map((id) => {
        const c = card(id);
        return c && { ...c, h2h: this.store.h2h(uid, id), unread: unread[id] || 0 };
      }).filter(Boolean),
      incoming: u.incoming.map(card).filter(Boolean),
      outgoing: u.outgoing.map(card).filter(Boolean),
    };
  }

  sendFriends(uid) {
    if (this.isOnline(userPid(uid))) this.send(userPid(uid), this.friendsMsg(uid));
  }

  notifyFriends(pid) {
    const uid = uidOf(pid);
    const u = uid && this.store.users.get(uid);
    if (!u) return;
    for (const f of new Set([...u.friends, ...u.incoming, ...u.outgoing])) this.sendFriends(f);
  }

  on_friendAdd(conn, { username, id }) {
    const me = this.requireUser(conn);
    const other = id ? this.store.users.get(uidOf(id) || id) : this.store.byUsername.get(String(username || '').trim().toLowerCase().replace(/^@/, ''));
    if (!other) throw E('player_not_found');
    if (other.id === me.id) throw E('friend_self');
    if (me.blocked.includes(other.id) || other.blocked.includes(me.id)) throw E('blocked');
    if (me.friends.includes(other.id)) throw E('already_friends');
    if (me.incoming.includes(other.id)) return this.on_friendRespond(conn, { id: other.id, accept: true });
    if (!me.outgoing.includes(other.id)) {
      me.outgoing.push(other.id);
      other.incoming.push(me.id);
      this.store.touch(me, other);
    }
    conn.send(note('friend_request_sent', { name: other.name }));
    this.send(userPid(other.id), note('friend_request_in', { name: me.name }));
    this.sendFriends(me.id);
    this.sendFriends(other.id);
  }

  on_friendRespond(conn, { id, accept }) {
    const me = this.requireUser(conn);
    const other = this.store.users.get(id);
    if (!other || !me.incoming.includes(id)) throw E('request_gone');
    me.incoming = me.incoming.filter((x) => x !== id);
    other.outgoing = other.outgoing.filter((x) => x !== me.id);
    if (accept) {
      if (!me.friends.includes(id)) me.friends.push(id);
      if (!other.friends.includes(me.id)) other.friends.push(me.id);
      this.send(userPid(id), note('friend_accepted', { name: me.name }));
    }
    this.store.touch(me, other);
    this.sendFriends(me.id);
    this.sendFriends(id);
  }

  on_friendRemove(conn, { id }) {
    const me = this.requireUser(conn);
    const other = this.store.users.get(id);
    const rm = (arr, x) => arr.filter((v) => v !== x);
    me.friends = rm(me.friends, id); me.outgoing = rm(me.outgoing, id); me.incoming = rm(me.incoming, id);
    if (other) { other.friends = rm(other.friends, me.id); other.outgoing = rm(other.outgoing, me.id); other.incoming = rm(other.incoming, me.id); }
    this.store.touch(me, other);
    this.sendFriends(me.id);
    if (other) this.sendFriends(other.id);
  }

  /** Bảng xếp hạng: pool = 'bullet' | 'blitz' | 'rapid' | 'classical' (theo loại thời gian), không có = điểm chính. */
  on_leaderboard(conn, { pool } = {}) {
    pool = R.POOLS.includes(pool) ? pool : null;
    const now = Date.now();
    const entry = (u) => {
      if (!pool) return { u, r: u.rating, n: u.rated, prov: false };
      const p = u.pools[pool];
      return { u, r: Math.round(p.r), n: p.n, prov: R.provisional(p, now) };
    };
    // Loại thời gian: chỉ xếp người đã chơi loại đó và điểm không còn "tạm" (như Lichess)
    const ranked = [...this.store.users.values()].map(entry).filter((e) => e.n > 0 && !e.prov)
      .sort((a, b) => b.r - a.r || b.n - a.n);
    const uid = uidOf(conn.pid);
    const myRank = uid ? ranked.findIndex((e) => e.u.id === uid) + 1 : 0;
    conn.send({
      t: 'leaderboard', pool,
      top: ranked.slice(0, 20).map((e, i) => ({ rank: i + 1, id: e.u.id, name: e.u.name, username: e.u.username, rating: e.r, games: e.n })),
      me: myRank ? { rank: myRank, rating: ranked[myRank - 1].r } : null,
    });
  }

  /** Trang hồ sơ người chơi: điểm từng loại + biểu đồ, thành tích, chuỗi thắng, giải đấu, ván gần đây. */
  on_profile(conn, { id, username }) {
    const u = id ? this.store.users.get(uidOf(id) || id) : this.store.byUsername.get(String(username || '').trim().toLowerCase().replace(/^@/, ''));
    if (!u) throw E('player_not_found');
    const meUid = uidOf(conn.pid);
    if (meUid && u.blocked.includes(meUid)) throw E('player_not_found');
    const now = Date.now();
    const pools = {};
    for (const p of R.POOLS) {
      const x = u.pools[p];
      pools[p] = { r: Math.round(x.r), rd: Math.round(R.decayedRd(x, now)), prov: R.provisional(x, now), n: x.n };
    }
    const recent = this.store.history(u.id).map((g) => {
      const side = g.x_id === u.id ? 1 : 2;
      return { share: g.share, created: g.created, timeLimit: g.time_limit, clock: g.clock || null, opening: g.opening || 'free',
        opponent: side === 1 ? g.o_name : g.x_name, result: g.winner === DRAW ? 'draw' : g.winner === side ? 'win' : 'loss', moves: g.moves, reason: g.reason };
    });
    const me = meUid && this.store.users.get(meUid);
    conn.send({
      t: 'profile',
      profile: {
        id: u.id, name: u.name, username: u.username, created: u.created || null, status: this.status(u.id),
        rating: u.rating, main: R.mainPool(u), pools, history: this.store.ratingPoints(u.id),
        stats: u.stats, rated: u.rated, streak: u.wstreak, tours: u.tours, recent,
        self: meUid === u.id, friend: !!(me && me.friends.includes(u.id)), h2h: me && me.id !== u.id ? this.store.h2h(me.id, u.id) : null,
      },
    });
  }

  on_history(conn) {
    const me = this.requireUser(conn);
    const games = this.store.history(me.id).map((g) => {
      const mySide = g.x_id === me.id ? 1 : 2;
      return {
        share: g.share, created: g.created, kind: g.kind, timeLimit: g.time_limit, clock: g.clock || null, opening: g.opening || 'free',
        opponent: mySide === 1 ? g.o_name : g.x_name, mySide,
        result: g.winner === DRAW ? 'draw' : g.winner === mySide ? 'win' : 'loss',
        reason: g.reason, moves: g.moves,
      };
    });
    conn.send({ t: 'history', games });
  }

  on_h2h(conn, { id }) {
    const me = this.requireUser(conn);
    const other = this.store.users.get(uidOf(id) || id);
    if (!other) throw E('player_not_found');
    conn.send({ t: 'h2h', id: other.id, name: other.name, rating: other.rating, record: this.store.h2h(me.id, other.id) });
  }

  /** a đã chặn b (a, b là pid)? */
  isBlocked(aPid, bPid) {
    const a = uidOf(aPid) && this.store.users.get(uidOf(aPid));
    const b = uidOf(bPid);
    return !!(a && b && a.blocked.includes(b));
  }

  on_block(conn, { id }) {
    const me = this.requireUser(conn);
    const other = this.store.users.get(uidOf(id) || id);
    if (!other || other.id === me.id) throw E('player_not_found');
    if (!me.blocked.includes(other.id)) me.blocked.push(other.id);
    // Chặn = huỷ kết bạn và mọi lời mời giữa hai người.
    const rm = (arr, x) => arr.filter((v) => v !== x);
    me.friends = rm(me.friends, other.id); me.incoming = rm(me.incoming, other.id); me.outgoing = rm(me.outgoing, other.id);
    other.friends = rm(other.friends, me.id); other.incoming = rm(other.incoming, me.id); other.outgoing = rm(other.outgoing, me.id);
    for (const inv of [...this.invites.values()]) {
      if ([inv.from, inv.to].includes(conn.pid) && [inv.from, inv.to].includes(userPid(other.id))) this.dropInvite(inv);
    }
    this.store.touch(me, other);
    for (const c of this.byPid.get(conn.pid) || []) c.send({ t: 'me', me: this.meView(conn.pid) });
    conn.send(note('user_blocked', { name: other.name }));
    this.sendFriends(me.id);
    this.sendFriends(other.id);
  }

  on_unblock(conn, { id }) {
    const me = this.requireUser(conn);
    const other = this.store.users.get(uidOf(id) || id);
    me.blocked = me.blocked.filter((x) => x !== (other ? other.id : id));
    this.store.touch(me);
    for (const c of this.byPid.get(conn.pid) || []) c.send({ t: 'me', me: this.meView(conn.pid) });
    if (other) conn.send(note('user_unblocked', { name: other.name }));
  }

  /** Báo cáo người chơi. Máy chủ tự đính kèm tin nhắn gần nhất giữa hai người làm bằng chứng. */
  on_report(conn, { id, reason }) {
    const me = this.requireUser(conn);
    const rules = [['report:' + me.id, 10]];
    this.limit(rules);
    this.fail(rules);
    if (!REPORT_REASONS.includes(reason)) throw E('bad_message');
    const targetUid = uidOf(id) || (this.store.users.has(id) ? id : null);
    let context = '';
    if (targetUid) {
      context = this.store.listDm(me.id, targetUid, null, 20)
        .map((m) => `[${new Date(m.created).toISOString()}] ${this.store.users.get(m.sender)?.username || m.sender}: ${m.text}`).join('\n');
    }
    this.store.addReport(me.id, targetUid || String(id).slice(0, 40), reason, context);
    conn.send(note('reported'));
  }

  on_dmSend(conn, { to, text }) {
    const me = this.requireUser(conn);
    const other = this.store.users.get(uidOf(to) || to);
    if (!other || !me.friends.includes(other.id)) throw E('not_friends');
    if (me.blocked.includes(other.id) || other.blocked.includes(me.id)) throw E('blocked');
    text = cleanText(text, 500);
    if (!text) throw E('message_empty');
    const rules = [['dm:' + me.id, 60]]; // tối đa 60 tin / 10 phút
    this.limit(rules);
    this.fail(rules);
    const msg = this.store.addDm(me.id, other.id, text);
    this.send(userPid(me.id), { t: 'dm', peer: other.id, msg });
    this.send(userPid(other.id), { t: 'dm', peer: me.id, msg });
  }

  on_dmHistory(conn, { peer, before }) {
    const me = this.requireUser(conn);
    const other = this.store.users.get(uidOf(peer) || peer);
    if (!other) throw E('player_not_found');
    const msgs = this.store.listDm(me.id, other.id, Number(before) || null, 50);
    conn.send({ t: 'dmHistory', peer: other.id, msgs, more: msgs.length === 50 });
  }

  on_dmRead(conn, { peer, lastId }) {
    const me = this.requireUser(conn);
    // Chỉ ghi cho người chơi có thật (không để chuỗi tuỳ ý làm phình CSDL)
    if (typeof peer === 'string' && this.store.users.has(peer) && Number.isInteger(lastId) && lastId > 0) {
      this.store.markRead(me.id, peer, lastId);
    }
  }
}

module.exports = { Social };
