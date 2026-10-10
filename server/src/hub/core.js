/* Lõi Hub: trạng thái chung, kết nối, danh tính phiên, giới hạn tần suất, dọn dẹp. */
'use strict';
const { E, fmt } = require('../msg.js');
const R = require('../rating.js');
const { OFFLINE_FORFEIT_MS, NEXT_GAME_MS, INVITE_TTL_MS, ROOM_IDLE_MS, SEAT_IDLE_MS, FAIL_WINDOW_MS, DRAW_COOLDOWN_MS, userPid, uidOf } = require('./shared.js');

class Hub {
  /**
   * sendMail(to, subject, text): gửi email đặt lại mật khẩu (null = tắt tính năng quên mật khẩu).
   */
  /**
   * minAppVersion / updateUrls: bản app điện thoại cũ hơn minAppVersion bị yêu cầu cập nhật
   * (updateUrls = { android, ios } – link cửa hàng). Bản web luôn là bản mới nhất nên không bị kiểm tra.
   */
  constructor({ store, googleClientId = '', verifyGoogle = null, sendMail = null, timers = {}, minAppVersion = '', updateUrls = {}, admins = [] }) {
    this.store = store;
    this.minAppVersion = minAppVersion;
    this.updateUrls = updateUrls;
    this.sendMail = sendMail;
    this.googleClientId = googleClientId;
    this.verifyGoogle = verifyGoogle;
    // SECOND_MS: độ dài 1 "giây" của đồng hồ mỗi nước (test đặt nhỏ để chạy nhanh).
    this.T = { NEXT_GAME_MS, OFFLINE_FORFEIT_MS, INVITE_TTL_MS, SECOND_MS: 1000, DRAW_COOLDOWN_MS, MATCH_TICK_MS: 1000, LOBBY_DEBOUNCE_MS: 250,
      TOUR_TICK_MS: 1000, TOUR_CHECKIN_MS: 10 * 60 * 1000, TOUR_NOSHOW_MS: 2 * 60 * 1000, TOUR_MIN_LEAD_MS: 5 * 60 * 1000, TOUR_PUSH_MS: 300,
      ARENA_REST_MS: 3000, ARENA_REPEAT_MS: 20000, THROTTLE_SCALE: 1, ...timers };
    // Quản trị viên: duyệt câu lạc bộ và giải đấu
    this.admins = new Set(admins.map((a) => String(a).trim().toLowerCase()).filter(Boolean));
    this.byPid = new Map(); // pid -> Set<conn>
    this.names = new Map(); // pid khách -> tên
    this.rooms = new Map(); // mã phòng -> Room
    this.roomOf = new Map(); // pid -> mã phòng
    this.invites = new Map();
    this.offlineAt = new Map(); // pid -> thời điểm mất kết nối
    this.forfeitTimers = new Map(); // pid -> hẹn giờ xử thua khi mất kết nối
    this.fails = new Map();
    this.queue = new Map(); // pid -> { pid, timeLimit, since }: hàng chờ tìm trận nhanh
    this.matchTimer = null;
    this.lobbyWatchers = new Set(); // kết nối đang mở sảnh phòng công khai
    this.lobbyTimer = null;
    this.loadClubs();
    this.loadTours();
    this.sweeper = setInterval(() => this.sweep(), 60 * 1000);
    this.sweeper.unref?.();
  }

  close() {
    this.closed = true; // máy chủ đang tắt: bỏ qua các sự kiện đến muộn (CSDL sắp đóng)
    clearInterval(this.sweeper);
    this.stopMatching();
    clearTimeout(this.lobbyTimer);
    clearInterval(this.tourTimer);
    for (const timer of (this.tourPushTimers || new Map()).values()) clearTimeout(timer);
  }

  connect(conn) {
    conn.pid = null;
  }

  disconnect(conn) {
    const pid = conn.pid;
    this.lobbyWatchers.delete(conn);
    if (this.closed) return;
    this.unwatch(conn);
    if (!pid) return;
    this.detach(conn);
    if (!this.isOnline(pid)) this.wentOffline(pid);
  }

  async handle(conn, raw) {
    if (this.closed) return;
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
    this.dequeue(pid);
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

  nameOf(pid) {
    const uid = uidOf(pid);
    if (uid) return this.store.users.get(uid)?.name || '?';
    return this.names.get(pid) || 'Khách';
  }

  meView(pid) {
    const uid = uidOf(pid);
    if (!uid) return { id: pid, name: this.nameOf(pid), guest: true };
    const u = this.store.users.get(uid);
    return {
      id: pid, uid, name: u.name, username: u.username, guest: false, google: !!u.google, hasPassword: !!u.pass,
      stats: u.stats, rating: u.rating, rated: u.rated, email: u.email,
      pools: Object.fromEntries(R.POOLS.map((p) => [p, R.ratingIn(u, p)])), streak: u.wstreak, tours: u.tours,
      pendingEmail: u.emailPending && u.emailPending.expires > Date.now() ? u.emailPending.email : '',
      blocked: u.blocked.map((id) => ({ id, name: this.store.users.get(id)?.name || '?' })),
      admin: this.isAdmin(uid),
    };
  }

  welcome(conn) {
    const pid = conn.pid;
    const room = this.roomFor(pid);
    conn.send({
      t: 'welcome',
      me: this.meView(pid),
      googleClientId: this.googleClientId,
      resetEnabled: !!this.sendMail,
      room: room ? this.roomView(room) : null,
    });
    if (this.queue.has(pid)) conn.send(this.queueMsg(pid));
    if (uidOf(pid)) {
      conn.send(this.friendsMsg(uidOf(pid)));
      for (const inv of this.invites.values()) if (inv.to === pid) conn.send(this.inviteMsg(inv));
      if (this.isAdmin(uidOf(pid))) conn.send({ t: 'adminCount', n: this.pendingCount() });
    }
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
    // Swap2 / đồng hồ tổng giữ theo id người chơi
    if (room.opener === oldPid) room.opener = newPid;
    if (room.decider === oldPid) room.decider = newPid;
    if (oldPid in room.clockLeft) { room.clockLeft[newPid] = room.clockLeft[oldPid]; delete room.clockLeft[oldPid]; }
    if (room.clockRun && room.clockRun.id === oldPid) room.clockRun.id = newPid;
    if (room.lastDelta && oldPid in room.lastDelta) { room.lastDelta[newPid] = room.lastDelta[oldPid]; delete room.lastDelta[oldPid]; }
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

  /**
   * Chống spam các lệnh tốn tài nguyên (truy vấn CSDL, duyệt mọi phòng): mỗi kết nối chỉ được gọi lệnh key
   * một lần mỗi ms mili giây, gọi dồn thì báo "thao tác quá nhanh".
   */
  throttle(conn, key, ms) {
    const now = Date.now();
    const t = conn.throttle || (conn.throttle = {});
    if (t[key] && now - t[key] < ms * this.T.THROTTLE_SCALE) throw E('too_fast');
    t[key] = now;
  }

  requireUser(conn) {
    const uid = uidOf(conn.pid);
    const u = uid && this.store.users.get(uid);
    if (!u) throw E('need_account');
    return u;
  }

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
        this.dropWatchers(room);
      }
    }
    for (const [pid, t] of this.offlineAt) if (now - t > ROOM_IDLE_MS && !this.roomOf.has(pid)) this.offlineAt.delete(pid);
    for (const [k, f] of this.fails) if (now - f.t > 10 * 60 * 1000) this.fails.delete(k);
  }
}

module.exports = { Hub };
