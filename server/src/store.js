/*
 * Lưu dữ liệu bằng SQLite có sẵn trong Node.js (node:sqlite, Node >= 22.13) – một file, không cần
 * cài máy chủ CSDL. Mỗi thay đổi chỉ ghi phần thay đổi (khác file JSON trước đây ghi lại toàn bộ).
 *  - Tài khoản giữ trong bộ nhớ để đọc nhanh; tài khoản nào đổi thì ghi lại dòng đó (gom mỗi 300ms).
 *  - Trận đấu: mỗi người giữ 10 trận gần nhất; một trận chỉ lưu 1 bản dùng chung cho 2 người.
 *  - Thành tích đối đầu, tin nhắn bạn bè (100 tin gần nhất mỗi cặp), báo cáo, mã đặt lại mật khẩu.
 * Lần đầu chạy mà còn file db.json cũ thì tự nhập vào. Cấu trúc bảng + câu lệnh SQL: store-schema.js;
 * phiên đăng nhập: store-sessions.js.
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { openDb, prepareQueries } = require('./store-schema.js'); // bảng, cột, câu lệnh SQL dựng sẵn
const { upgradePools } = require('./rating.js');
const { Sessions, SESSION_TTL } = require('./store-sessions.js');
const { ClubStore } = require('./store-club.js');
const { EvalCache } = require('./evalcache.js');

const HISTORY_PER_USER = 300; // số ván giữ lại cho mỗi tài khoản (Lịch sử đấu); ván cũ hơn tự xoá
const RATING_POINTS_PER_USER = 400; // điểm vẽ biểu đồ trên trang hồ sơ
const DM_PER_PAIR = 100;
// Chỉ lưu mã băm của token: lộ file dữ liệu cũng không dùng được để đăng nhập.
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const pair = (a, b) => (a < b ? [a, b] : [b, a]);
const today = () => new Date().toISOString().slice(0, 10);

class Store {
  /**
   * @param {string|null} file đường dẫn file SQLite; null = chỉ trong bộ nhớ (dùng cho test)
   * @param {string} [legacyJson] file db.json cũ để nhập một lần
   */
  constructor(file, legacyJson) {
    this.db = openDb(file);
    this.users = new Map(); // id -> user
    this.byUsername = new Map();
    this.byGoogle = new Map();
    this.byEmail = new Map();
    this.dirty = new Set();
    this.dirtyDocs = new Map(); // 'club:id' / 'tour:id' -> bản ghi câu lạc bộ / giải đấu cần ghi
    this.timer = null;
    this.q = prepareQueries(this.db);
    for (const row of this.db.prepare('SELECT data FROM users').all()) this.index(this.upgrade(JSON.parse(row.data)));
    this.pruneSessions(Date.now(), true);
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
    upgradePools(u); // điểm Glicko-2 theo loại thời gian (tài khoản cũ: bắt đầu từ Elo cũ)
    u.wstreak = { cur: 0, best: 0, ...(u.wstreak || {}) }; // chuỗi thắng
    u.lstreak = { cur: 0, best: 0, ...(u.lstreak || {}) }; // chuỗi thua (đối xứng wstreak, cùng phạm vi ván hai tài khoản)
    u.tours = { played: 0, won: 0, podium: 0, ...(u.tours || {}) }; // thành tích giải đấu
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
        if (Date.now() - s.created < SESSION_TTL) this.q.addSession.run(hash, s.uid, s.created, null, null, null, s.created);
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

  schedule(delay = 300) {
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), delay);
      this.timer.unref?.();
    }
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty.size && !this.dirtyDocs.size) return;
    const list = [...this.dirty];
    const docs = [...this.dirtyDocs.entries()];
    try {
      this.db.exec('BEGIN');
      for (const u of list) this.q.upsertUser.run(u.id, u.username, JSON.stringify(u));
      for (const [key, d] of docs) {
        if (key.startsWith('club:')) this.q.upsertClub.run(d.id, JSON.stringify(d));
        else this.q.upsertTour.run(d.id, d.status, d.created, JSON.stringify(d));
      }
      this.db.exec('COMMIT');
    } catch (e) {
      // H-S1 + H-S2: flush chạy từ hẹn giờ nên lỗi ghi (đĩa đầy, CSDL kẹt…) không được làm sập
      // tiến trình, và hàng đợi KHÔNG được xoá trước khi ghi thành công — giữ nguyên các mục
      // chưa ghi, ghi log, rồi hẹn thử lại sau 5 giây. Chỉ xoá đúng các mục đã COMMIT ở dưới.
      try { this.db.exec('ROLLBACK'); } catch (_) { /* chưa vào được giao dịch */ }
      console.error('[store] ghi dữ liệu thất bại, giữ hàng đợi để thử lại:', e && e.message);
      this.schedule(5000);
      return;
    }
    for (const u of list) this.dirty.delete(u);
    for (const [key] of docs) this.dirtyDocs.delete(key);
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
      run('DELETE FROM avatars WHERE uid = ?', id); // ảnh đại diện (avatar.js)
      run('DELETE FROM tour_imgs WHERE uid = ?', id); // ảnh trong mô tả / đính kèm (hub/tour-img.js)
      run('DELETE FROM eval_sub WHERE who = ?', EvalCache.who(id)); // các lần gửi điểm phân tích (evalcache.js)
      run('DELETE FROM rated_pairs WHERE a = ? OR b = ?', id, id);
      run('DELETE FROM rating_hist WHERE uid = ?', id);
      run('DELETE FROM reports WHERE reporter = ?', id);
      this.clubTalkUserGone(id); // tin chat + bài diễn đàn câu lạc bộ (store-club.js)
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

  // Phiên đăng nhập: store-sessions.js (trộn vào cuối file)

  // ------------------------------------------------------------ Trận đấu
  /** Lưu một ván đã kết thúc; xId/oId là id tài khoản (null nếu là khách). Trả về mã chia sẻ. */
  recordGame({ kind, timeLimit, clock = null, opening = 'free', rule = 'vn', xId, oId, xName, oName, winner, reason, moves }) {
    if (!xId && !oId) return null;
    const share = crypto.randomBytes(8).toString('base64url');
    const { lastInsertRowid } = this.q.addGame.run(share, Date.now(), kind, timeLimit || 0, xId || null, oId || null,
      xName, oName, winner, reason, JSON.stringify(moves), clock || null, opening || 'free', rule || 'vn');
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

  /** Ván của uid, mới nhất trước; before: chỉ lấy ván có id nhỏ hơn (trang sau), limit: số ván. */
  history(uid, limit = 10, before = Number.MAX_SAFE_INTEGER) {
    return this.q.history.all(uid, Number(before) > 0 ? Number(before) : Number.MAX_SAFE_INTEGER, Math.min(limit, HISTORY_PER_USER));
  }

  gameByShare(share) {
    if (typeof share !== 'string' || !/^[\w-]{6,20}$/.test(share)) return null;
    const g = this.q.gameByShare.get(share);
    if (!g) return null;
    return { ...g, moves: JSON.parse(g.moves) };
  }

  /** n ván gần nhất giữa 2 tài khoản (mới nhất trước): [{ winnerId, moves }] – chống cày điểm bằng ván lặp lại. */
  pairGames(a, b, n = 2) {
    return this.q.pairGames.all(a, b, b, a, n).map((g) => ({
      winnerId: g.winner === 1 ? g.x_id : g.winner === 2 ? g.o_id : null, moves: JSON.parse(g.moves),
    }));
  }

  // ------------------------------------------------------------ Biểu đồ điểm
  addRatingPoint(uid, pool, r, at = Date.now()) {
    this.q.addPoint.run(uid, pool, at, Math.round(r));
    this.q.prunePoints.run(uid, uid, RATING_POINTS_PER_USER);
  }

  /** { pool: [[thời điểm, điểm], ...] } */
  ratingPoints(uid) {
    const out = {};
    for (const p of this.q.points.all(uid)) (out[p.pool] = out[p.pool] || []).push([p.at, p.r]);
    return out;
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
    this.clubTalkDrop(id); // chat + diễn đàn (store-club.js)
  }

  /** Giải chưa kết thúc + các giải đã xong gần đây nhất. */
  loadTours(recentDone = 100) {
    const active = this.db.prepare("SELECT data FROM tours WHERE status IN ('draft', 'pending', 'scheduled', 'running')").all();
    const done = this.db.prepare("SELECT data FROM tours WHERE status NOT IN ('draft', 'pending', 'scheduled', 'running') ORDER BY created DESC LIMIT ?").all(recentDone);
    return [...active, ...done].map((r) => JSON.parse(r.data));
  }

  saveTour(t) {
    this.dirtyDocs.set('tour:' + t.id, t);
    this.schedule();
  }

  /** Xoá hẳn một giải (ban tổ chức bấm Xoá): bỏ khỏi hàng chờ ghi rồi xoá trong CSDL. */
  deleteTour(id) {
    this.dirtyDocs.delete('tour:' + id);
    this.db.prepare('DELETE FROM tours WHERE id = ?').run(id);
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

// ---- Mật khẩu (scrypt, không cần thư viện ngoài). Bản bất đồng bộ: băm chạy ở luồng phụ của libuv, không chặn
// vòng sự kiện – trong lúc một người đăng nhập, mọi ván đang chơi vẫn chạy bình thường.
const scrypt = (password, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 32, (err, key) => (err ? reject(err) : resolve(key)));
});
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt)).toString('hex');
  return { salt, hash };
}
async function checkPassword(password, pass) {
  // Bản ghi hỏng (thiếu muối, mã băm không đủ 32 byte – vd. nhập từ db.json cũ) thì coi như sai mật khẩu (L-S1): trước đây
  // scrypt / timingSafeEqual ném lỗi, tài khoản không bao giờ đăng nhập được và chỉ thấy lỗi chung chung
  if (!pass || typeof pass.salt !== 'string' || !pass.salt || typeof pass.hash !== 'string' || !/^[0-9a-f]{64}$/i.test(pass.hash)) return false;
  const h = await scrypt(password, pass.salt);
  return crypto.timingSafeEqual(h, Buffer.from(pass.hash, 'hex'));
}

// Phiên đăng nhập / thiết bị (store-sessions.js)
// + chat / diễn đàn câu lạc bộ (store-club.js)
for (const part of [Sessions, ClubStore]) for (const name of Object.getOwnPropertyNames(part.prototype)) {
  if (name !== 'constructor') Object.defineProperty(Store.prototype, name, Object.getOwnPropertyDescriptor(part.prototype, name));
}

module.exports = { Store, hashPassword, checkPassword };
