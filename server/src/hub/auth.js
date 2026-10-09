/* Tài khoản: chào hỏi, đăng ký / đăng nhập / Google, đổi tên, mật khẩu, email, quên mật khẩu, xoá tài khoản. */
'use strict';
const crypto = require('crypto');
const { hashPassword, checkPassword } = require('../store.js');
const { E, note } = require('../msg.js');
const { USERNAME_RE, EMAIL_RE, RESET_TTL_MS, VERIFY_TTL_MS, sha256, VERIFY_MAIL, RESET_MAIL, cleanName, userPid, uidOf, compareVersions } = require('./shared.js');

class Auth {
  on_hello(conn, { token, guestKey, guestName, client }) {
    // App điện thoại quá cũ: không cho vào online (tránh lỗi khó hiểu khi giao thức đã đổi)
    const platform = client && typeof client.platform === 'string' ? client.platform : 'web';
    if ((platform === 'android' || platform === 'ios') && this.minAppVersion &&
        compareVersions(String(client.version || '0'), this.minAppVersion) < 0) {
      return conn.send({ t: 'updateRequired', min: this.minAppVersion, url: this.updateUrls[platform] || '' });
    }
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
    this.dequeue(conn.pid);
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
      const u = this.store.users.get(uid);
      u.name = name;
      this.store.touch(u);
      this.notifyFriends(pid);
    } else this.names.set(pid, name);
    for (const c of this.byPid.get(pid) || []) c.send({ t: 'me', me: this.meView(pid) });
    const room = this.roomFor(pid);
    if (room) { room.rename(pid, name); this.broadcastRoom(room); }
  }

  on_changePassword(conn, { current, next }) {
    const me = this.requireUser(conn);
    if (typeof next !== 'string' || next.length < 6 || next.length > 100) throw E('short_password');
    if (me.pass) {
      const rules = [['pw:' + me.id, 8]];
      this.limit(rules);
      if (typeof current !== 'string' || !checkPassword(current, me.pass)) { this.fail(rules); throw E('wrong_password'); }
    }
    me.pass = hashPassword(next);
    this.store.touch(me);
    this.store.dropOtherSessions(me.id, conn.token); // đăng xuất các thiết bị khác
    for (const c of this.byPid.get(conn.pid) || []) c.send({ t: 'me', me: this.meView(conn.pid) });
    conn.send(note('password_changed'));
  }

  /**
   * Thêm / đổi email: gửi mã xác minh tới địa chỉ mới, nhập đúng mã thì email mới có hiệu lực
   * (không để ai nhập email của người khác rồi khiến thư khôi phục mật khẩu gửi nhầm tới họ).
   * Email trống = xoá email, có hiệu lực ngay.
   */
  on_setEmail(conn, { email, password, lang }) {
    const me = this.requireUser(conn);
    email = String(email || '').trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) throw E('email_invalid');
    // Mọi lần lưu email đều bị đếm (kể cả tài khoản Google chưa có mật khẩu), để không dùng
    // thông báo "email đã được dùng" dò hàng loạt xem email nào đã đăng ký.
    const tries = [['email:' + me.id, 10], ['email-ip:' + conn.ip, 30]];
    this.limit(tries);
    this.fail(tries);
    if (me.pass) {
      const rules = [['pw:' + me.id, 8]];
      this.limit(rules);
      if (typeof password !== 'string' || !checkPassword(password, me.pass)) { this.fail(rules); throw E('wrong_password'); }
    }
    const owner = email && this.store.byEmail.get(email);
    if (owner && owner !== me) throw E('email_taken');
    const sendMe = () => { for (const c of this.byPid.get(conn.pid) || []) c.send({ t: 'me', me: this.meView(conn.pid) }); };
    if (!email || email === me.email) {
      me.emailPending = null;
      if (!email) this.store.setEmail(me, '');
      else this.store.touch(me);
      sendMe();
      return conn.send(note('email_saved'));
    }
    if (!this.sendMail) throw E('reset_unavailable');
    // Không gửi dồn thư tới cùng một địa chỉ (kể cả từ nhiều tài khoản)
    const toRules = [['email-to:' + email, 3]];
    this.limit(toRules);
    this.fail(toRules);
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    me.emailPending = { email, hash: sha256(code), expires: Date.now() + VERIFY_TTL_MS, tries: 0 };
    this.store.touch(me);
    const mail = VERIFY_MAIL[lang] || VERIFY_MAIL.vi;
    Promise.resolve().then(() => this.sendMail(email, mail.subject, mail.body(me.username, code))).catch(() => {});
    sendMe();
    conn.send(note('email_code_sent', { email }));
  }

  /** Nhập mã xác minh email. Sai 5 lần thì phải gửi mã mới. */
  on_verifyEmail(conn, { code }) {
    const me = this.requireUser(conn);
    const p = me.emailPending;
    if (!p || p.expires < Date.now() || p.tries >= 5) throw E('email_bad_code');
    if (sha256(String(code || '').trim()) !== p.hash) {
      p.tries++;
      this.store.touch(me);
      throw E('email_bad_code');
    }
    const owner = this.store.byEmail.get(p.email);
    if (owner && owner !== me) throw E('email_taken'); // người khác xác minh trước
    me.emailPending = null;
    this.store.setEmail(me, p.email);
    for (const c of this.byPid.get(conn.pid) || []) c.send({ t: 'me', me: this.meView(conn.pid) });
    conn.send(note('email_verified'));
  }

  findByLogin(login) {
    login = String(login || '').trim().toLowerCase().slice(0, 254);
    return this.store.byUsername.get(login.replace(/^@/, '')) || this.store.byEmail.get(login) || null;
  }

  /** Quên mật khẩu: gửi mã 6 số qua email. Luôn trả lời giống nhau để không lộ tài khoản nào tồn tại. */
  on_forgot(conn, { login, lang }) {
    if (!this.sendMail) throw E('reset_unavailable');
    const rules = [['forgot-ip:' + conn.ip, 10], ['forgot:' + String(login || '').toLowerCase().slice(0, 60), 3]];
    this.limit(rules);
    this.fail(rules);
    const u = this.findByLogin(login);
    if (u && u.email) {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      this.store.setReset(u.id, code, RESET_TTL_MS);
      const mail = RESET_MAIL[lang] || RESET_MAIL.vi;
      // Gửi thư chạy nền: nếu chờ gửi xong mới trả lời thì thời gian trả lời sẽ lộ ra
      // tài khoản có email hay không.
      Promise.resolve().then(() => this.sendMail(u.email, mail.subject, mail.body(u.username, code))).catch(() => {});
    }
    conn.send({ t: 'forgotSent' });
  }

  on_reset(conn, { login, code, password }) {
    if (!this.sendMail) throw E('reset_unavailable');
    const rules = [['reset-ip:' + conn.ip, 20]];
    this.limit(rules);
    if (typeof password !== 'string' || password.length < 6 || password.length > 100) throw E('short_password');
    const u = this.findByLogin(login);
    if (!u || !this.store.checkReset(u.id, String(code || '').trim())) { this.fail(rules); throw E('reset_bad_code'); }
    u.pass = hashPassword(password);
    this.store.touch(u);
    this.store.dropOtherSessions(u.id, null); // mật khẩu cũ có thể đã lộ: đăng xuất mọi nơi
    this.loginConn(conn, u);
    conn.send(note('password_changed'));
  }

  /**
   * Xoá hẳn tài khoản (yêu cầu của Google Play / App Store với app có tạo tài khoản).
   * Có mật khẩu: nhập mật khẩu. Chỉ có Google: gõ lại tên đăng nhập để xác nhận.
   */
  on_deleteAccount(conn, { password, confirm }) {
    const me = this.requireUser(conn);
    const rules = [['del:' + me.id, 8]];
    this.limit(rules);
    if (me.pass) {
      if (typeof password !== 'string' || !checkPassword(password, me.pass)) { this.fail(rules); throw E('wrong_password'); }
    } else if (String(confirm || '').trim().toLowerCase() !== me.username) {
      this.fail(rules);
      throw E('confirm_username');
    }
    const pid = userPid(me.id);
    // Đang trong phòng: rời phòng như bình thường (đang đánh thì xử thua)
    this.dequeue(pid);
    if (this.roomFor(pid)) this.leave(pid);
    for (const inv of [...this.invites.values()]) if (inv.from === pid || inv.to === pid) this.dropInvite(inv);
    clearTimeout(this.forfeitTimers.get(pid));
    this.forfeitTimers.delete(pid);
    this.offlineAt.delete(pid);
    // Gỡ khỏi danh sách bạn bè / lời mời / chặn của mọi người
    const affected = [];
    for (const u of this.store.users.values()) {
      if (u === me) continue;
      let hit = false;
      for (const k of ['friends', 'incoming', 'outgoing', 'blocked']) {
        if (u[k].includes(me.id)) { u[k] = u[k].filter((x) => x !== me.id); hit = true; }
      }
      if (hit) { this.store.touch(u); affected.push(u.id); }
    }
    this.store.deleteUser(me);
    // Mọi thiết bị đang đăng nhập tài khoản này quay về làm khách
    for (const c of [...(this.byPid.get(pid) || [])]) {
      c.send({ t: 'accountDeleted' });
      this.detach(c);
      c.token = null;
    }
    for (const id of affected) this.sendFriends(id);
  }
}

module.exports = { Auth };
