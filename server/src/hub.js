/*
 * Trung tâm xử lý tin nhắn realtime: danh tính, tài khoản, bạn bè, trạng thái online,
 * phòng chơi và thách đấu. Không phụ thuộc thư viện WebSocket: mỗi kết nối chỉ cần
 * có conn.send(obj) và conn.ip.
 */
'use strict';
const crypto = require('crypto');
const { Room } = require('./room.js');
const { hashPassword, checkPassword } = require('./store.js');
const { E, note, fmt } = require('./msg.js');

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const OFFLINE_FORFEIT_MS = 90 * 1000; // mất kết nối quá 90s khi đang đánh -> xử thua
const NEXT_GAME_MS = 4000; // Bo3/Bo5: ván sau tự bắt đầu sau 4s
const INVITE_TTL_MS = 60 * 1000;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const SEAT_IDLE_MS = 10 * 60 * 1000;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const TIME_LIMITS = [0, 10, 20, 30]; // giây mỗi nước, 0 = không giới hạn

const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const userPid = (uid) => 'u_' + uid;
const uidOf = (pid) => (pid && pid.startsWith('u_') ? pid.slice(2) : null);

class Hub {
  constructor({ store, googleClientId = '', verifyGoogle = null, timers = {} }) {
    this.store = store;
    this.googleClientId = googleClientId;
    this.verifyGoogle = verifyGoogle;
    // SECOND_MS: độ dài 1 "giây" của đồng hồ mỗi nước (test đặt nhỏ để chạy nhanh).
    this.T = { NEXT_GAME_MS, OFFLINE_FORFEIT_MS, INVITE_TTL_MS, SECOND_MS: 1000, ...timers };
    this.byPid = new Map(); // pid -> Set<conn>
    this.names = new Map(); // pid khách -> tên
    this.rooms = new Map(); // mã phòng -> Room
    this.roomOf = new Map(); // pid -> mã phòng
    this.invites = new Map();
    this.offlineAt = new Map(); // pid -> thời điểm mất kết nối
    this.forfeitTimers = new Map(); // pid -> hẹn giờ xử thua khi mất kết nối
    this.fails = new Map();
    this.sweeper = setInterval(() => this.sweep(), 60 * 1000);
    this.sweeper.unref?.();
  }

  close() { clearInterval(this.sweeper); }

  // ---------------------------------------------------------------- kết nối
  connect(conn) {
    conn.pid = null;
  }

  disconnect(conn) {
    const pid = conn.pid;
    if (!pid) return;
    this.detach(conn);
    if (!this.isOnline(pid)) this.wentOffline(pid);
  }

  async handle(conn, raw) {
    let msg;
    try {
      msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!msg || typeof msg.t !== 'string') throw new Error();
    } catch (e) {
      return conn.send({ t: 'error', code: 'bad_message', msg: fmt('bad_message') });
    }
    const fn = this['on_' + msg.t];
    if (!fn) return conn.send({ t: 'error', code: 'unsupported', msg: fmt('unsupported') });
    if (!conn.pid && msg.t !== 'hello') return conn.send({ t: 'error', code: 'no_hello', msg: fmt('no_hello') });
    try {
      await fn.call(this, conn, msg);
    } catch (e) {
      // Lỗi có mã (GameError) để client dịch; lỗi bất ngờ thì báo chung chung.
      if (e.code) conn.send({ t: 'error', code: e.code, args: e.args, msg: e.message, ctx: msg.t });
      else conn.send({ t: 'error', code: 'error', msg: fmt('error'), ctx: msg.t });
    }
  }

  send(pid, obj) {
    const set = this.byPid.get(pid);
    if (set) for (const c of set) c.send(obj);
  }

  isOnline(pid) { return (this.byPid.get(pid)?.size || 0) > 0; }

  attach(conn, pid) {
    if (conn.pid) this.detach(conn);
    conn.pid = pid;
    const first = !this.isOnline(pid);
    if (!this.byPid.has(pid)) this.byPid.set(pid, new Set());
    this.byPid.get(pid).add(conn);
    if (first) this.cameOnline(pid);
  }

  detach(conn) {
    const set = this.byPid.get(conn.pid);
    if (set) {
      set.delete(conn);
      if (!set.size) this.byPid.delete(conn.pid);
    }
    conn.pid = null;
  }

  cameOnline(pid) {
    this.offlineAt.delete(pid);
    clearTimeout(this.forfeitTimers.get(pid));
    this.forfeitTimers.delete(pid);
    const room = this.roomFor(pid);
    if (room) this.broadcastRoom(room);
    this.notifyFriends(pid);
  }

  wentOffline(pid) {
    this.offlineAt.set(pid, Date.now());
    const room = this.roomFor(pid);
    if (room) {
      this.broadcastRoom(room);
      this.armForfeit(room, pid);
    }
    // Lời mời chưa trả lời của người này bị huỷ.
    for (const inv of [...this.invites.values()]) {
      if (inv.from === pid || inv.to === pid) this.dropInvite(inv, inv.from === pid ? ['inviter_offline'] : null);
    }
    this.notifyFriends(pid);
  }

  /** Người chơi mất kết nối trong lúc ván đang diễn ra (kể cả khi chưa ai đánh nước nào):
   *  quá hạn mà chưa quay lại thì xử thua. */
  armForfeit(room, pid) {
    if (this.isOnline(pid) || !room.active || !room.has(pid)) return;
    clearTimeout(this.forfeitTimers.get(pid));
    const game = room.gameNo;
    const t = setTimeout(() => {
      this.forfeitTimers.delete(pid);
      if (this.isOnline(pid) || this.rooms.get(room.code) !== room) return;
      if (!room.active || room.gameNo !== game || !room.has(pid)) return;
      room.finish(3 - room.sideOf(pid), 'timeout');
      this.afterChange(room);
    }, this.T.OFFLINE_FORFEIT_MS);
    t.unref?.();
    this.forfeitTimers.set(pid, t);
  }

  /** Bắt đầu ván mới; ai đang offline thì bắt đầu đếm giờ xử thua ngay. */
  startNext(room) {
    room.nextGame();
    for (const p of room.players) this.armForfeit(room, p.id);
    this.broadcastRoom(room);
  }

  // ---------------------------------------------------------------- danh tính
  nameOf(pid) {
    const uid = uidOf(pid);
    if (uid) return this.store.users.get(uid)?.name || '?';
    return this.names.get(pid) || 'Khách';
  }

  meView(pid) {
    const uid = uidOf(pid);
    if (!uid) return { id: pid, name: this.nameOf(pid), guest: true };
    const u = this.store.users.get(uid);
    return { id: pid, uid, name: u.name, username: u.username, guest: false, google: !!u.google, hasPassword: !!u.pass, stats: u.stats };
  }

  welcome(conn) {
    const pid = conn.pid;
    const room = this.roomFor(pid);
    conn.send({
      t: 'welcome',
      me: this.meView(pid),
      googleClientId: this.googleClientId,
      room: room ? this.roomView(room) : null,
    });
    if (uidOf(pid)) {
      conn.send(this.friendsMsg(uidOf(pid)));
      for (const inv of this.invites.values()) if (inv.to === pid) conn.send(this.inviteMsg(inv));
    }
  }

  on_hello(conn, { token, guestKey, guestName }) {
    conn.token = null;
    const user = this.store.userByToken(token);
    if (user) {
      conn.token = token;
      this.attach(conn, userPid(user.id));
    } else {
      if (typeof guestKey !== 'string' || guestKey.length < 16 || guestKey.length > 128) throw E('no_guest_key');
      const pid = 'g_' + crypto.createHash('sha256').update(guestKey).digest('hex').slice(0, 16);
      conn.guestPid = pid;
      if (!this.names.has(pid)) this.names.set(pid, cleanName(guestName) || 'Khách-' + pid.slice(2, 6).toUpperCase());
      this.attach(conn, pid);
    }
    this.welcome(conn);
  }

  /** Đăng nhập thành công trên kết nối đang là khách: chuyển sang tài khoản. */
  loginConn(conn, user) {
    const oldPid = conn.pid;
    const newPid = userPid(user.id);
    const token = this.store.newSession(user.id);
    conn.token = token;
    if (oldPid !== newPid) {
      this.migrate(oldPid, newPid);
      this.detach(conn);
      if (oldPid && !this.isOnline(oldPid)) this.wentOffline(oldPid);
      this.attach(conn, newPid);
    }
    conn.send({ t: 'auth', token });
    this.welcome(conn);
  }

  /** Khách đang ở trong phòng mà đăng nhập: giữ chỗ trong phòng cho tài khoản. */
  migrate(oldPid, newPid) {
    const code = this.roomOf.get(oldPid);
    if (!code || this.roomOf.has(newPid)) return;
    const room = this.rooms.get(code);
    if (!room || room.has(newPid)) return;
    const p = room.players.find((q) => q.id === oldPid);
    p.id = newPid;
    p.name = this.nameOf(newPid);
    for (const s of [1, 2]) if (room.seats[s] === oldPid) room.seats[s] = newPid;
    room.score[newPid] = room.score[oldPid] || 0;
    delete room.score[oldPid];
    if (room.rematch.delete(oldPid)) room.rematch.add(newPid);
    if (room.seriesWinner === oldPid) room.seriesWinner = newPid;
    this.roomOf.delete(oldPid);
    this.roomOf.set(newPid, code);
    this.broadcastRoom(room);
  }

  /*
   * Giới hạn thử sai. Nhà mạng di động dùng chung 1 IP cho rất nhiều thuê bao (CGNAT),
   * nên không khoá cả IP sau vài lần sai: khoá theo từng đối tượng bị dò (phòng, tài khoản),
   * còn ngưỡng theo IP đặt cao để chỉ chặn dò hàng loạt.
   * rules: [[khoá, số lần tối đa trong 10 phút], ...]
   */
  limit(rules) {
    const now = Date.now();
    for (const [key, max] of rules) {
      const f = this.fails.get(key);
      if (f && f.n >= max && now - f.t < FAIL_WINDOW_MS) throw E('too_many_attempts');
    }
  }
  fail(rules) {
    const now = Date.now();
    for (const [key] of rules) {
      const f = this.fails.get(key);
      if (!f || now - f.t > FAIL_WINDOW_MS) this.fails.set(key, { n: 1, t: now });
      else f.n++;
    }
  }

  on_register(conn, { username, password, name }) {
    const rules = [['reg:' + conn.ip, 30]];
    this.limit(rules);
    username = String(username || '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) throw E('bad_username');
    if (typeof password !== 'string' || password.length < 6 || password.length > 100) throw E('short_password');
    if (this.store.byUsername.has(username)) throw E('username_taken');
    this.fail(rules); // giới hạn số tài khoản tạo từ 1 IP
    const user = this.store.createUser({ username, name: cleanName(name) || username, pass: hashPassword(password) });
    this.loginConn(conn, user);
  }

  on_login(conn, { username, password }) {
    const name = String(username || '').trim().toLowerCase().slice(0, 40);
    const rules = [['login:' + conn.ip + ':' + name, 8], ['login-user:' + name, 30], ['login-ip:' + conn.ip, 100]];
    this.limit(rules);
    const user = this.store.byUsername.get(name);
    if (!user || typeof password !== 'string' || !checkPassword(password, user.pass)) {
      this.fail(rules);
      throw E('bad_login');
    }
    this.loginConn(conn, user);
  }

  async on_google(conn, { credential }) {
    if (!this.googleClientId || !this.verifyGoogle) throw E('google_disabled');
    const rules = [['google:' + conn.ip, 60]];
    this.limit(rules);
    let g;
    try {
      g = await this.verifyGoogle(String(credential || ''), this.googleClientId);
    } catch (e) {
      this.fail(rules);
      throw E('google_failed');
    }
    const google = { sub: g.sub, email: g.email || '' };
    const current = uidOf(conn.pid) && this.store.users.get(uidOf(conn.pid));
    const owner = this.store.byGoogle.get(g.sub);
    if (current) {
      // Đang đăng nhập -> liên kết Google vào tài khoản hiện tại.
      if (owner && owner !== current) throw E('google_taken');
      this.store.linkGoogle(current, google);
      for (const c of this.byPid.get(conn.pid) || []) c.send({ t: 'me', me: this.meView(conn.pid) });
      conn.send(note('google_linked'));
      return;
    }
    const user = owner || this.store.createUser({
      username: this.store.freeUsername((g.email || '').split('@')[0]),
      name: cleanName(g.name) || 'Người chơi',
      google,
    });
    this.loginConn(conn, user);
  }

  on_logout(conn) {
    // Rời phòng trước (đang đánh thì xử thua, client đã hỏi xác nhận) để không bị
    // giữ chỗ rồi âm thầm xử thua sau khi mất kết nối.
    if (this.roomFor(conn.pid)) {
      this.leave(conn.pid);
      for (const c of this.byPid.get(conn.pid) || []) c.send({ t: 'room', room: null });
    }
    if (conn.token) this.store.dropSession(conn.token);
    conn.token = null;
    conn.send({ t: 'loggedOut' });
  }

  on_setName(conn, { name }) {
    name = cleanName(name);
    if (!name) throw E('empty_name');
    const pid = conn.pid;
    const uid = uidOf(pid);
    if (uid) {
      this.store.users.get(uid).name = name;
      this.store.save();
      this.notifyFriends(pid);
    } else this.names.set(pid, name);
    for (const c of this.byPid.get(pid) || []) c.send({ t: 'me', me: this.meView(pid) });
    const room = this.roomFor(pid);
    if (room) { room.rename(pid, name); this.broadcastRoom(room); }
  }

  // ---------------------------------------------------------------- bạn bè
  requireUser(conn) {
    const uid = uidOf(conn.pid);
    const u = uid && this.store.users.get(uid);
    if (!u) throw E('need_account');
    return u;
  }

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
      return f && { id: f.id, username: f.username, name: f.name, status: this.status(f.id) };
    };
    return {
      t: 'friends',
      friends: u.friends.map(card).filter(Boolean),
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
    if (me.friends.includes(other.id)) throw E('already_friends');
    if (me.incoming.includes(other.id)) return this.on_friendRespond(conn, { id: other.id, accept: true });
    if (!me.outgoing.includes(other.id)) {
      me.outgoing.push(other.id);
      other.incoming.push(me.id);
      this.store.save();
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
    this.store.save();
    this.sendFriends(me.id);
    this.sendFriends(id);
  }

  on_friendRemove(conn, { id }) {
    const me = this.requireUser(conn);
    const other = this.store.users.get(id);
    const rm = (arr, x) => arr.filter((v) => v !== x);
    me.friends = rm(me.friends, id); me.outgoing = rm(me.outgoing, id); me.incoming = rm(me.incoming, id);
    if (other) { other.friends = rm(other.friends, me.id); other.outgoing = rm(other.outgoing, me.id); other.incoming = rm(other.incoming, me.id); }
    this.store.save();
    this.sendFriends(me.id);
    if (other) this.sendFriends(other.id);
  }

  // ---------------------------------------------------------------- phòng
  roomFor(pid) {
    const code = this.roomOf.get(pid);
    return code ? this.rooms.get(code) || null : null;
  }

  roomView(room) {
    const v = room.view();
    for (const p of v.players) p.online = this.isOnline(p.id);
    return v;
  }

  broadcastRoom(room) {
    this.scheduleClock(room);
    const v = this.roomView(room);
    for (const p of room.players) this.send(p.id, { t: 'room', room: v });
  }

  /** Hẹn giờ hết lượt: người đang tới lượt mà không đánh kịp thì thua. */
  scheduleClock(room) {
    const at = room.turnEndsAt;
    if (room.clockAt === at) return;
    clearTimeout(room.clockTimer);
    room.clockAt = at;
    if (!at) return;
    room.clockTimer = setTimeout(() => {
      if (this.rooms.get(room.code) !== room || room.turnEndsAt !== at || !room.active) return;
      room.finish(3 - room.turn, 'time');
      this.afterChange(room);
    }, Math.max(0, at - Date.now()) + 50);
    room.clockTimer.unref?.();
  }

  newCode() {
    for (;;) {
      const code = String(crypto.randomInt(100000, 1000000));
      if (!this.rooms.has(code)) return code;
    }
  }

  makeRoom(kind, bestOf, timeLimit) {
    const room = new Room({
      code: this.newCode(),
      password: String(crypto.randomInt(0, 1000)).padStart(3, '0'),
      kind,
      bestOf,
      timeLimit: TIME_LIMITS.includes(Number(timeLimit)) ? Number(timeLimit) : 0,
      secondMs: this.T.SECOND_MS,
    });
    this.rooms.set(room.code, room);
    return room;
  }

  enter(room, pid, side) {
    room.addPlayer({ id: pid, name: this.nameOf(pid) }, side);
    this.roomOf.set(pid, room.code);
    // Đã vào ván khác: huỷ lời thách đấu đang chờ để lúc bạn bè nhận lời không bị kéo khỏi ván này.
    for (const inv of [...this.invites.values()]) if (inv.from === pid) this.dropInvite(inv);
  }

  leave(pid) {
    const room = this.roomFor(pid);
    this.roomOf.delete(pid);
    if (!room) return;
    if (room.inProgress) {
      // Rời phòng khi đang đánh = xử thua (tính trước khi bàn cờ được làm mới).
      room.finish(3 - room.sideOf(pid), 'leave');
      this.settle(room, true);
    }
    room.removePlayer(pid);
    if (!room.players.length) this.rooms.delete(room.code);
    else {
      for (const p of room.players) this.send(p.id, note('left_room', { name: this.nameOf(pid) }));
      this.broadcastRoom(room);
    }
    this.notifyFriends(pid);
    for (const p of room.players) this.notifyFriends(p.id);
  }

  on_createRoom(conn, { side, timeLimit }) {
    this.leave(conn.pid);
    const room = this.makeRoom('room', 1, timeLimit);
    this.enter(room, conn.pid, side === 'second' ? 2 : 1);
    this.broadcastRoom(room);
  }

  on_joinRoom(conn, { code, password }) {
    code = String(code || '').trim();
    const room = this.rooms.get(code);
    if (room && room.has(conn.pid)) { this.roomOf.set(conn.pid, code); return this.broadcastRoom(room); }
    code = code.slice(0, 12);
    const rules = [['room:' + conn.ip + ':' + code, 8], ['room-code:' + code, 40], ['room-ip:' + conn.ip, 60]];
    this.limit(rules);
    if (!room || room.kind !== 'room') { this.fail(rules); throw E('room_not_found', { code }); }
    if (String(password || '').trim() !== room.password) { this.fail(rules); throw E('wrong_room_password'); }
    if (room.full) throw E('room_full');
    this.leave(conn.pid);
    this.enter(room, conn.pid);
    for (const p of room.players) this.armForfeit(room, p.id); // chủ phòng có thể đã offline
    this.broadcastRoom(room);
    for (const p of room.players) this.notifyFriends(p.id);
    const opp = room.opponentOf(conn.pid);
    if (opp) this.send(opp.id, note('joined_room', { name: this.nameOf(conn.pid) }));
  }

  on_leaveRoom(conn) {
    this.leave(conn.pid);
    conn.send({ t: 'room', room: null });
  }

  inRoom(conn) {
    const room = this.roomFor(conn.pid);
    if (!room) throw E('not_in_room');
    return room;
  }

  on_move(conn, { x, y }) {
    const room = this.inRoom(conn);
    room.move(conn.pid, x, y);
    this.afterChange(room);
  }

  on_resign(conn) {
    const room = this.inRoom(conn);
    room.resign(conn.pid);
    this.afterChange(room);
  }

  on_rematch(conn) {
    const room = this.inRoom(conn);
    const started = room.voteRematch(conn.pid);
    if (!started) {
      const opp = room.opponentOf(conn.pid);
      if (opp) this.send(opp.id, note('wants_rematch', { name: this.nameOf(conn.pid) }));
    }
    this.broadcastRoom(room);
  }

  afterChange(room) {
    this.settle(room, false);
    this.broadcastRoom(room);
  }

  /** Khi một ván vừa kết thúc: cộng thống kê và hẹn giờ ván tiếp theo (Bo3/Bo5). */
  settle(room, leaving) {
    if (!room.winner || room.settled === room.gameNo + ':' + room.board.moves.length) return;
    room.settled = room.gameNo + ':' + room.board.moves.length;
    const w = room.seats[room.winner];
    const l = room.seats[3 - room.winner];
    for (const [pid, key] of [[w, 'wins'], [l, 'losses']]) {
      const u = uidOf(pid) && this.store.users.get(uidOf(pid));
      if (u) { u.stats[key]++; this.store.save(); }
    }
    if (!leaving && room.awaitingNextGame) {
      const game = room.gameNo;
      setTimeout(() => {
        if (this.rooms.get(room.code) !== room || room.gameNo !== game || !room.awaitingNextGame) return;
        this.startNext(room);
      }, this.T.NEXT_GAME_MS).unref?.();
    }
  }

  // ---------------------------------------------------------------- thách đấu
  inviteMsg(inv) {
    return { t: 'invite', invite: { id: inv.id, from: { id: inv.from, name: this.nameOf(inv.from) }, bestOf: inv.bestOf, first: inv.first, timeLimit: inv.timeLimit } };
  }

  dropInvite(inv, reason) {
    if (!this.invites.delete(inv.id)) return;
    clearTimeout(inv.timer);
    this.send(inv.to, { t: 'inviteGone', id: inv.id });
    this.send(inv.from, { t: 'inviteGone', id: inv.id });
    if (reason) this.send(inv.from, note(...reason));
  }

  on_challenge(conn, { to, bestOf, first, timeLimit }) {
    const me = this.requireUser(conn);
    const friend = this.store.users.get(to);
    if (!friend || !me.friends.includes(friend.id)) throw E('challenge_friends_only');
    const toPid = userPid(friend.id);
    if (!this.isOnline(toPid)) throw E('friend_offline', { name: friend.name });
    if (this.roomFor(conn.pid)?.active) throw E('busy_in_game');
    bestOf = [1, 3, 5].includes(Number(bestOf)) ? Number(bestOf) : 1;
    first = ['me', 'them', 'random'].includes(first) ? first : 'random';
    timeLimit = TIME_LIMITS.includes(Number(timeLimit)) ? Number(timeLimit) : 0;
    for (const inv of [...this.invites.values()]) if (inv.from === conn.pid) this.dropInvite(inv);
    const inv = { id: crypto.randomBytes(6).toString('hex'), from: conn.pid, to: toPid, bestOf, first, timeLimit };
    inv.timer = setTimeout(() => this.dropInvite(inv, ['invite_no_answer', { name: friend.name }]), this.T.INVITE_TTL_MS);
    inv.timer.unref?.();
    this.invites.set(inv.id, inv);
    this.send(toPid, this.inviteMsg(inv));
    this.send(conn.pid, { t: 'inviteSent', invite: { id: inv.id, to: { id: toPid, name: friend.name }, bestOf, first, timeLimit } });
  }

  on_challengeCancel(conn, { id }) {
    const inv = this.invites.get(id);
    if (inv && inv.from === conn.pid) this.dropInvite(inv);
  }

  on_challengeRespond(conn, { id, accept }) {
    const inv = this.invites.get(id);
    if (!inv || inv.to !== conn.pid) throw E('invite_expired');
    this.dropInvite(inv);
    if (!accept) {
      this.send(inv.from, note('challenge_declined', { name: this.nameOf(conn.pid) }));
      return;
    }
    if (!this.isOnline(inv.from)) throw E('inviter_offline');
    this.leave(inv.from);
    this.leave(inv.to);
    const room = this.makeRoom('series', inv.bestOf, inv.timeLimit);
    let challengerFirst = inv.first === 'me' ? true : inv.first === 'them' ? false : crypto.randomInt(2) === 0;
    this.enter(room, inv.from, challengerFirst ? 1 : 2);
    this.enter(room, inv.to, challengerFirst ? 2 : 1);
    this.broadcastRoom(room);
    this.notifyFriends(inv.from);
    this.notifyFriends(inv.to);
  }

  // ---------------------------------------------------------------- dọn dẹp
  sweep() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      for (const p of [...room.players]) {
        const off = this.offlineAt.get(p.id);
        if (!this.isOnline(p.id) && off && now - off > SEAT_IDLE_MS && !room.inProgress) this.leave(p.id);
      }
      const anyone = room.players.some((p) => this.isOnline(p.id));
      if (this.rooms.get(room.code) === room && !anyone && now - room.activeAt > ROOM_IDLE_MS) {
        for (const p of room.players) this.roomOf.delete(p.id);
        this.rooms.delete(room.code);
      }
    }
    for (const [pid, t] of this.offlineAt) if (now - t > ROOM_IDLE_MS && !this.roomOf.has(pid)) this.offlineAt.delete(pid);
    for (const [k, f] of this.fails) if (now - f.t > 10 * 60 * 1000) this.fails.delete(k);
  }
}

/** Xác minh ID token của Google Identity Services qua API tokeninfo. */
async function verifyGoogleToken(credential, clientId) {
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!r.ok) throw new Error('invalid');
  const j = await r.json();
  if (j.aud !== clientId) throw new Error('aud');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(j.iss)) throw new Error('iss');
  if (Number(j.exp) * 1000 < Date.now()) throw new Error('exp');
  return { sub: j.sub, email: j.email_verified === 'true' || j.email_verified === true ? j.email : '', name: j.name };
}

module.exports = { Hub, verifyGoogleToken };
