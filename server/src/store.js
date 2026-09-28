/*
 * Lưu tài khoản & phiên đăng nhập vào 1 file JSON (ghi nguyên tử, gom ghi mỗi 300ms).
 * Đủ dùng cho vài chục nghìn tài khoản; muốn lớn hơn thì thay bằng CSDL thật.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_TTL = 180 * 24 * 3600 * 1000;

class Store {
  constructor(file) {
    this.file = file;
    this.users = new Map(); // id -> user
    this.sessions = new Map(); // token -> { uid, created }
    this.byUsername = new Map();
    this.byGoogle = new Map();
    this.timer = null;
    this.load();
  }

  load() {
    if (!this.file || !fs.existsSync(this.file)) return;
    const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    for (const u of data.users || []) this.index(u);
    for (const [t, s] of Object.entries(data.sessions || {})) {
      if (Date.now() - s.created < SESSION_TTL) this.sessions.set(t, s);
    }
  }

  index(u) {
    this.users.set(u.id, u);
    this.byUsername.set(u.username, u);
    if (u.google) this.byGoogle.set(u.google.sub, u);
  }

  save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({
      users: [...this.users.values()],
      sessions: Object.fromEntries(this.sessions),
    }));
    fs.renameSync(tmp, this.file);
  }

  createUser({ username, name, pass = null, google = null }) {
    const u = {
      id: crypto.randomBytes(8).toString('hex'),
      username, name, pass, google,
      friends: [], incoming: [], outgoing: [],
      stats: { wins: 0, losses: 0 },
      created: Date.now(),
    };
    this.index(u);
    this.save();
    return u;
  }

  linkGoogle(u, google) {
    u.google = google;
    this.byGoogle.set(google.sub, u);
    this.save();
  }

  /** Tìm tên đăng nhập còn trống, dựa trên gợi ý (dùng cho tài khoản Google). */
  freeUsername(base) {
    base = (base || 'user').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 14) || 'user';
    if (base.length < 3) base = base.padEnd(3, '0');
    let name = base;
    while (this.byUsername.has(name)) name = base + Math.floor(1000 + Math.random() * 9000);
    return name;
  }

  newSession(uid) {
    const token = crypto.randomBytes(24).toString('base64url');
    this.sessions.set(token, { uid, created: Date.now() });
    this.save();
    return token;
  }

  userByToken(token) {
    const s = token && this.sessions.get(token);
    if (!s) return null;
    if (Date.now() - s.created > SESSION_TTL) { this.sessions.delete(token); return null; }
    return this.users.get(s.uid) || null;
  }

  dropSession(token) {
    if (this.sessions.delete(token)) this.save();
  }
}

// ---- Mật khẩu (scrypt, không cần thư viện ngoài)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}
function checkPassword(password, pass) {
  if (!pass) return false;
  const h = crypto.scryptSync(password, pass.salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(pass.hash, 'hex'));
}

module.exports = { Store, hashPassword, checkPassword };
