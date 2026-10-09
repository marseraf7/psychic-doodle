/*
 * Lưu dữ liệu bằng SQLite có sẵn trong Node.js (node:sqlite, Node >= 22.13) – một file, không cần
 * cài máy chủ CSDL. Mỗi thay đổi chỉ ghi phần thay đổi (khác file JSON trước đây ghi lại toàn bộ).
 *  - Tài khoản giữ trong bộ nhớ để đọc nhanh; tài khoản nào đổi thì ghi lại dòng đó (gom mỗi 300ms).
 *  - Trận đấu: mỗi người giữ 10 trận gần nhất; một trận chỉ lưu 1 bản dùng chung cho 2 người.
 *  - Thành tích đối đầu, tin nhắn bạn bè (100 tin gần nhất mỗi cặp), báo cáo, mã đặt lại mật khẩu.
 * Lần đầu chạy mà còn file db.json cũ thì tự nhập vào.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// node:sqlite còn gắn nhãn "experimental" trong Node 22 nên in 1 dòng cảnh báo khi khởi động.
// Các lệnh chạy (npm start, Dockerfile, caro.service) dùng --disable-warning=ExperimentalWarning để ẩn.
const { DatabaseSync } = require('node:sqlite');

const SESSION_TTL = 180 * 24 * 3600 * 1000;
const HISTORY_PER_USER = 10;
const DM_PER_PAIR = 100;
// Chỉ lưu mã băm của token: lộ file dữ liệu cũng không dùng được để đăng nhập.
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const pair = (a, b) => (a < b ? [a, b] : [b, a]);
const today = () => new Date().toISOString().slice(0, 10);

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, uid TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT, share TEXT UNIQUE NOT NULL, created INTEGER NOT NULL,
    kind TEXT, time_limit INTEGER, x_id TEXT, o_id TEXT, x_name TEXT, o_name TEXT,
    winner INTEGER, reason TEXT, moves TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS user_games (uid TEXT NOT NULL, game_id INTEGER NOT NULL, PRIMARY KEY (uid, game_id));
  CREATE TABLE IF NOT EXISTS h2h (a TEXT NOT NULL, b TEXT NOT NULL, a_wins INTEGER DEFAULT 0, b_wins INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0, PRIMARY KEY (a, b));
  CREATE TABLE IF NOT EXISTS dm (id INTEGER PRIMARY KEY AUTOINCREMENT, a TEXT NOT NULL, b TEXT NOT NULL,
    sender TEXT NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS dm_pair ON dm (a, b, id);
  CREATE INDEX IF NOT EXISTS dm_b ON dm (b, id);
  CREATE TABLE IF NOT EXISTS rated_pairs (a TEXT NOT NULL, b TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL,
    PRIMARY KEY (a, b, day));
  CREATE TABLE IF NOT EXISTS dm_read (uid TEXT NOT NULL, peer TEXT NOT NULL, last_id INTEGER NOT NULL, PRIMARY KEY (uid, peer));
  CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter TEXT, target TEXT, reason TEXT,
    context TEXT, created INTEGER);
  CREATE TABLE IF NOT EXISTS resets (uid TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS clubs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tours (id TEXT PRIMARY KEY, status TEXT NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS tours_status ON tours (status, created);
`;

class Store {
  /**
   * @param {string|null} file đường dẫn file SQLite; null = chỉ trong bộ nhớ (dùng cho test)
   * @param {string} [legacyJson] file db.json cũ để nhập một lần
   */
  constructor(file, legacyJson) {
    if (file) fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file || ':memory:');
    this.db.exec(SCHEMA);
    this.users = new Map(); // id -> user
    this.byUsername = new Map();
    this.byGoogle = new Map();
    this.byEmail = new Map();
    this.dirty = new Set();
    this.dirtyDocs = new Map(); // 'club:id' / 'tour:id' -> bản ghi câu lạc bộ / giải đấu cần ghi
    this.timer = null;
    const q = (sql) => this.db.prepare(sql);
    this.q = {
      upsertUser: q('INSERT INTO users (id, username, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET username = excluded.username, data = excluded.data'),
      addSession: q('INSERT INTO sessions (hash, uid, created) VALUES (?, ?, ?)'),
      getSession: q('SELECT uid, created FROM sessions WHERE hash = ?'),
      dropSession: q('DELETE FROM sessions WHERE hash = ?'),
      dropUserSessions: q('DELETE FROM sessions WHERE uid = ? AND hash <> ?'),
      addGame: q('INSERT INTO games (share, created, kind, time_limit, x_id, o_id, x_name, o_name, winner, reason, moves) VALUES (?,?,?,?,?,?,?,?,?,?,?)'),
      linkGame: q('INSERT OR IGNORE INTO user_games (uid, game_id) VALUES (?, ?)'),
      oldGames: q('SELECT game_id FROM user_games WHERE uid = ? ORDER BY game_id DESC LIMIT -1 OFFSET ?'),
      unlinkGame: q('DELETE FROM user_games WHERE uid = ? AND game_id = ?'),
      gameRefs: q('SELECT COUNT(*) AS n FROM user_games WHERE game_id = ?'),
      dropGame: q('DELETE FROM games WHERE id = ?'),
      history: q(`SELECT g.id, g.share, g.created, g.kind, g.time_limit, g.x_id, g.o_id, g.x_name, g.o_name, g.winner, g.reason,
        json_array_length(g.moves) AS moves FROM user_games ug JOIN games g ON g.id = ug.game_id WHERE ug.uid = ? ORDER BY g.id DESC LIMIT ?`),
      gameByShare: q('SELECT * FROM games WHERE share = ?'),
      getH2h: q('SELECT a_wins, b_wins, draws FROM h2h WHERE a = ? AND b = ?'),
      addH2h: q(`INSERT INTO h2h (a, b, a_wins, b_wins, draws) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(a, b) DO UPDATE SET a_wins = a_wins + excluded.a_wins, b_wins = b_wins + excluded.b_wins, draws = draws + excluded.draws`),
      addDm: q('INSERT INTO dm (a, b, sender, text, created) VALUES (?, ?, ?, ?, ?)'),
      pruneDm: q('DELETE FROM dm WHERE a = ? AND b = ? AND id <= (SELECT id FROM dm WHERE a = ? AND b = ? ORDER BY id DESC LIMIT 1 OFFSET ?)'),
      listDm: q('SELECT id, sender, text, created FROM dm WHERE a = ? AND b = ? AND id < ? ORDER BY id DESC LIMIT ?'),
      getRead: q('SELECT last_id FROM dm_read WHERE uid = ? AND peer = ?'),
      setRead: q('INSERT INTO dm_read (uid, peer, last_id) VALUES (?, ?, ?) ON CONFLICT(uid, peer) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)'),
      // Hai nhánh a = ? / b = ? để SQLite dùng chỉ mục thay vì đọc cả bảng tin nhắn
      // (câu này chạy mỗi lần gửi danh sách bạn bè, tức là rất thường xuyên).
      unread: q(`SELECT sender AS peer, COUNT(*) AS n FROM (
          SELECT id, sender FROM dm WHERE a = ? AND sender <> ?
          UNION ALL SELECT id, sender FROM dm WHERE b = ? AND sender <> ?) d
        WHERE d.id > COALESCE((SELECT last_id FROM dm_read r WHERE r.uid = ? AND r.peer = d.sender), 0) GROUP BY sender`),
      ratedToday: q('SELECT n FROM rated_pairs WHERE a = ? AND b = ? AND day = ?'),
      bumpRated: q(`INSERT INTO rated_pairs (a, b, day, n) VALUES (?, ?, ?, 1)
        ON CONFLICT(a, b, day) DO UPDATE SET n = n + 1`),
      pruneRated: q('DELETE FROM rated_pairs WHERE day < ?'),
      addReport: q('INSERT INTO reports (reporter, target, reason, context, created) VALUES (?, ?, ?, ?, ?)'),
      listReports: q('SELECT * FROM reports ORDER BY id DESC LIMIT ?'),
      setReset: q('INSERT INTO resets (uid, code_hash, expires, tries) VALUES (?, ?, ?, 0) ON CONFLICT(uid) DO UPDATE SET code_hash = excluded.code_hash, expires = excluded.expires, tries = 0'),
      getReset: q('SELECT code_hash, expires, tries FROM resets WHERE uid = ?'),
      bumpReset: q('UPDATE resets SET tries = tries + 1 WHERE uid = ?'),
      dropReset: q('DELETE FROM resets WHERE uid = ?'),
      upsertClub: q('INSERT INTO clubs (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'),
      dropClub: q('DELETE FROM clubs WHERE id = ?'),
      upsertTour: q('INSERT INTO tours (id, status, created, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data'),
    };
    for (const row of this.db.prepare('SELECT data FROM users').all()) this.index(this.upgrade(JSON.parse(row.data)));
    this.db.prepare('DELETE FROM sessions WHERE created < ?').run(Date.now() - SESSION_TTL);
    if (legacyJson && !this.users.size) this.importLegacy(legacyJson);
  }

  /** Bổ sung trường mới cho tài khoản tạo từ phiên bản cũ. */
  upgrade(u) {
    u.friends = u.friends || [];
    u.incoming = u.incoming || [];
    u.outgoing = u.outgoing || [];
    u.blocked = u.blocked || [];
    u.stats = { wins: 0, losses: 0, draws: 0, ...(u.stats || {}) };
    if (typeof u.rating !== 'number') u.rating = 1200;
    if (typeof u.rated !== 'number') u.rated = 0; // số trận đã tính Elo
    u.email = u.email || '';
    return u;
  }

  /** Nhập dữ liệu từ file db.json của phiên bản trước (một lần), rồi đổi tên file cũ. */
  importLegacy(file) {
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    this.db.exec('BEGIN');
    try {
      for (const u of data.users || []) {
        this.upgrade(u);
        this.index(u);
        this.q.upsertUser.run(u.id, u.username, JSON.stringify(u));
      }
      for (const [hash, s] of Object.entries(data.sessions || {})) {
        if (Date.now() - s.created < SESSION_TTL) this.q.addSession.run(hash, s.uid, s.created);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    fs.renameSync(file, file + '.imported');
  }

  index(u) {
    this.users.set(u.id, u);
    this.byUsername.set(u.username, u);
    if (u.google) this.byGoogle.set(u.google.sub, u);
    if (u.email) this.byEmail.set(u.email, u);
  }

  /** Đánh dấu tài khoản đã thay đổi; ghi xuống đĩa sau ~300ms (gom nhiều thay đổi một lần). */
  touch(...users) {
    for (const u of users) if (u) this.dirty.add(u);
    this.schedule();
  }

  schedule() {
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 300);
      this.timer.unref?.();
    }
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty.size && !this.dirtyDocs.size) return;
    const list = [...this.dirty];
    const docs = [...this.dirtyDocs.entries()];
    this.dirty.clear();
    this.dirtyDocs.clear();
    this.db.exec('BEGIN');
    try {
      for (const u of list) this.q.upsertUser.run(u.id, u.username, JSON.stringify(u));
      for (const [key, d] of docs) {
        if (key.startsWith('club:')) this.q.upsertClub.run(d.id, JSON.stringify(d));
        else this.q.upsertTour.run(d.id, d.status, d.created, JSON.stringify(d));
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * Xoá hẳn một tài khoản và dữ liệu cá nhân: phiên đăng nhập, tin nhắn, đối đầu, mã khôi phục…
   * Ván đã chơi với người khác vẫn còn trong lịch sử của họ nhưng bỏ tên và id của người bị xoá.
   * Báo cáo người khác gửi VỀ tài khoản này được giữ lại cho quản trị viên (ghi trong chính sách).
   */
  deleteUser(u) {
    const id = u.id;
    this.dirty.delete(u);
    this.db.exec('BEGIN');
    try {
      const run = (sql, ...args) => this.db.prepare(sql).run(...args);
      run('DELETE FROM users WHERE id = ?', id);
      run('DELETE FROM sessions WHERE uid = ?', id);
      run("UPDATE games SET x_id = NULL, x_name = '' WHERE x_id = ?", id);
      run("UPDATE games SET o_id = NULL, o_name = '' WHERE o_id = ?", id);
      run('DELETE FROM user_games WHERE uid = ?', id);
      run('DELETE FROM games WHERE id NOT IN (SELECT game_id FROM user_games)');
      run('DELETE FROM h2h WHERE a = ? OR b = ?', id, id);
      run('DELETE FROM dm WHERE a = ? OR b = ?', id, id);
      run('DELETE FROM dm_read WHERE uid = ? OR peer = ?', id, id);
      run('DELETE FROM resets WHERE uid = ?', id);
      run('DELETE FROM rated_pairs WHERE a = ? OR b = ?', id, id);
      run('DELETE FROM reports WHERE reporter = ?', id);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    this.users.delete(id);
    if (this.byUsername.get(u.username) === u) this.byUsername.delete(u.username);
    if (u.google && this.byGoogle.get(u.google.sub) === u) this.byGoogle.delete(u.google.sub);
    if (u.email && this.byEmail.get(u.email) === u) this.byEmail.delete(u.email);
  }

  close() {
    this.flush();
    this.db.close();
  }

  createUser({ username, name, pass = null, google = null }) {
    const u = this.upgrade({
      id: crypto.randomBytes(8).toString('hex'),
      username, name, pass, google,
      created: Date.now(),
    });
    this.index(u);
    this.q.upsertUser.run(u.id, u.username, JSON.stringify(u)); // ghi ngay: không mất tài khoản mới
    return u;
  }

  linkGoogle(u, google) {
    u.google = google;
    this.byGoogle.set(google.sub, u);
    this.touch(u);
  }

  setEmail(u, email) {
    if (u.email) this.byEmail.delete(u.email);
    u.email = email;
    if (email) this.byEmail.set(email, u);
    this.touch(u);
  }

  /** Tìm tên đăng nhập còn trống, dựa trên gợi ý (dùng cho tài khoản Google). */
  freeUsername(base) {
    base = (base || 'user').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 14) || 'user';
    if (base.length < 3) base = base.padEnd(3, '0');
    let name = base;
    while (this.byUsername.has(name)) name = base + Math.floor(1000 + Math.random() * 9000);
    return name;
  }

  // ------------------------------------------------------------ Phiên đăng nhập
  newSession(uid) {
    const token = crypto.randomBytes(24).toString('base64url');
    this.q.addSession.run(sha256(token), uid, Date.now());
    return token;
  }

  userByToken(token) {
    if (typeof token !== 'string' || !token || token.length > 100) return null;
    const s = this.q.getSession.get(sha256(token));
    if (!s) return null;
    if (Date.now() - s.created > SESSION_TTL) { this.q.dropSession.run(sha256(token)); return null; }
    return this.users.get(s.uid) || null;
  }

  dropSession(token) {
    if (typeof token === 'string') this.q.dropSession.run(sha256(token));
  }

  /** Đăng xuất mọi thiết bị khác (sau khi đổi mật khẩu). */
  dropOtherSessions(uid, keepToken) {
    this.q.dropUserSessions.run(uid, keepToken ? sha256(keepToken) : '');
  }

  // ------------------------------------------------------------ Trận đấu
  /** Lưu một ván đã kết thúc; xId/oId là id tài khoản (null nếu là khách). Trả về mã chia sẻ. */
  recordGame({ kind, timeLimit, xId, oId, xName, oName, winner, reason, moves }) {
    if (!xId && !oId) return null;
    const share = crypto.randomBytes(8).toString('base64url');
    const { lastInsertRowid } = this.q.addGame.run(share, Date.now(), kind, timeLimit || 0, xId || null, oId || null,
      xName, oName, winner, reason, JSON.stringify(moves));
    const id = Number(lastInsertRowid);
    for (const uid of new Set([xId, oId].filter(Boolean))) {
      this.q.linkGame.run(uid, id);
      // Chỉ giữ 10 trận gần nhất; trận không còn ai giữ thì xoá hẳn.
      for (const { game_id } of this.q.oldGames.all(uid, HISTORY_PER_USER)) {
        this.q.unlinkGame.run(uid, game_id);
        if (!this.q.gameRefs.get(game_id).n) this.q.dropGame.run(game_id);
      }
    }
    return share;
  }

  history(uid) {
    return this.q.history.all(uid, HISTORY_PER_USER);
  }

  gameByShare(share) {
    if (typeof share !== 'string' || !/^[\w-]{6,20}$/.test(share)) return null;
    const g = this.q.gameByShare.get(share);
    if (!g) return null;
    return { ...g, moves: JSON.parse(g.moves) };
  }

  // ------------------------------------------------------------ Đối đầu
  h2h(me, other) {
    const [a, b] = pair(me, other);
    const r = this.q.getH2h.get(a, b) || { a_wins: 0, b_wins: 0, draws: 0 };
    return me === a ? { wins: r.a_wins, losses: r.b_wins, draws: r.draws } : { wins: r.b_wins, losses: r.a_wins, draws: r.draws };
  }

  /** winnerId: id người thắng, hoặc null nếu hoà. */
  addH2h(x, y, winnerId) {
    const [a, b] = pair(x, y);
    this.q.addH2h.run(a, b, winnerId === a ? 1 : 0, winnerId === b ? 1 : 0, winnerId ? 0 : 1);
  }

  /** Số ván tính Elo giữa 2 người trong ngày (UTC) – chống 2 tài khoản đánh qua lại để cày điểm. */
  ratedToday(x, y) {
    const [a, b] = pair(x, y);
    return this.q.ratedToday.get(a, b, today())?.n || 0;
  }

  bumpRated(x, y) {
    const [a, b] = pair(x, y);
    const day = today();
    this.q.bumpRated.run(a, b, day);
    if (this.prunedDay !== day) { this.prunedDay = day; this.q.pruneRated.run(day); }
  }

  // ------------------------------------------------------------ Tin nhắn bạn bè
  addDm(from, to, text) {
    const [a, b] = pair(from, to);
    const created = Date.now();
    const { lastInsertRowid } = this.q.addDm.run(a, b, from, text, created);
    this.q.pruneDm.run(a, b, a, b, DM_PER_PAIR);
    this.q.setRead.run(from, to, Number(lastInsertRowid)); // tin mình gửi coi như đã đọc
    return { id: Number(lastInsertRowid), sender: from, text, created };
  }

  listDm(me, peer, before, limit = 50) {
    const [a, b] = pair(me, peer);
    return this.q.listDm.all(a, b, before || Number.MAX_SAFE_INTEGER, limit).reverse();
  }

  markRead(me, peer, lastId) {
    this.q.setRead.run(me, peer, lastId);
  }

  /** { peerId: số tin chưa đọc } */
  unread(uid) {
    const out = {};
    for (const r of this.q.unread.all(uid, uid, uid, uid, uid)) out[r.peer] = r.n;
    return out;
  }

  // ------------------------------------------------------------ Báo cáo
  addReport(reporter, target, reason, context) {
    this.q.addReport.run(reporter, target, String(reason).slice(0, 40), String(context || '').slice(0, 2000), Date.now());
  }

  reports(limit = 100) {
    return this.q.listReports.all(limit);
  }

  // ------------------------------------------------------------ Câu lạc bộ & giải đấu
  /** Mọi câu lạc bộ (số lượng nhỏ, giữ trong bộ nhớ). */
  loadClubs() {
    return this.db.prepare('SELECT data FROM clubs').all().map((r) => JSON.parse(r.data));
  }

  saveClub(c) {
    this.dirtyDocs.set('club:' + c.id, c);
    this.schedule();
  }

  dropClub(id) {
    this.dirtyDocs.delete('club:' + id);
    this.q.dropClub.run(id);
  }

  /** Giải chưa kết thúc + các giải đã xong gần đây nhất. */
  loadTours(recentDone = 100) {
    const active = this.db.prepare("SELECT data FROM tours WHERE status IN ('pending', 'scheduled', 'running')").all();
    const done = this.db.prepare("SELECT data FROM tours WHERE status NOT IN ('pending', 'scheduled', 'running') ORDER BY created DESC LIMIT ?").all(recentDone);
    return [...active, ...done].map((r) => JSON.parse(r.data));
  }

  saveTour(t) {
    this.dirtyDocs.set('tour:' + t.id, t);
    this.schedule();
  }

  // ------------------------------------------------------------ Đặt lại mật khẩu
  setReset(uid, code, ttlMs) {
    this.q.setReset.run(uid, sha256(code), Date.now() + ttlMs);
  }

  /** Kiểm tra mã; tối đa 5 lần thử, dùng xong thì xoá. */
  checkReset(uid, code) {
    const r = this.q.getReset.get(uid);
    if (!r || r.expires < Date.now() || r.tries >= 5) return false;
    if (r.code_hash !== sha256(String(code))) { this.q.bumpReset.run(uid); return false; }
    this.q.dropReset.run(uid);
    return true;
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
