/*
 * Cấu trúc CSDL SQLite của store.js: bảng, chỉ mục, cột thêm sau (CSDL tạo từ bản cũ), và các câu lệnh dựng sẵn.
 *   openDb(file)       – mở file (null = chỉ trong bộ nhớ), tạo bảng, thêm cột còn thiếu
 *   prepareQueries(db) – các câu lệnh SQL dùng trong store.js / store-sessions.js (this.q)
 */
'use strict';
const fs = require('fs');
const path = require('path');
// node:sqlite còn gắn nhãn "experimental" trong Node 22 nên in 1 dòng cảnh báo khi khởi động.
// Các lệnh chạy (npm start, Dockerfile, caro.service) dùng --disable-warning=ExperimentalWarning để ẩn.
const { DatabaseSync } = require('node:sqlite');

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
  CREATE TABLE IF NOT EXISTS rating_hist (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, pool TEXT NOT NULL,
    at INTEGER NOT NULL, r INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS rating_hist_uid ON rating_hist (uid, id);
  CREATE INDEX IF NOT EXISTS games_pair ON games (x_id, o_id, id);
  CREATE TABLE IF NOT EXISTS eval_sub (key TEXT NOT NULL, who TEXT NOT NULL, nodes INTEGER NOT NULL, move TEXT NOT NULL,
    score INTEGER NOT NULL, mate INTEGER, at INTEGER NOT NULL, PRIMARY KEY (key, who));
  CREATE INDEX IF NOT EXISTS eval_sub_at ON eval_sub (at);
  CREATE INDEX IF NOT EXISTS eval_sub_who ON eval_sub (who);
  CREATE TABLE IF NOT EXISTS eval_cache (key TEXT PRIMARY KEY, nodes INTEGER NOT NULL, move TEXT NOT NULL, score INTEGER NOT NULL,
    mate INTEGER, at INTEGER NOT NULL, used INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS eval_cache_used ON eval_cache (used);
  CREATE TABLE IF NOT EXISTS avatars (uid TEXT PRIMARY KEY, type TEXT NOT NULL, data BLOB NOT NULL);
`;
// Cột thêm sau (CSDL tạo từ bản cũ chưa có): đồng hồ tổng và luật khai cuộc của ván
// Phiên đăng nhập: thông tin thiết bị (mục Thiết bị – store-sessions.js)
const ADD_COLUMNS = [['games', 'clock', 'TEXT'], ['games', 'opening', 'TEXT'], ['games', 'rule', 'TEXT'],
  ['sessions', 'platform', 'TEXT'], ['sessions', 'ua', 'TEXT'], ['sessions', 'ip', 'TEXT'], ['sessions', 'seen', 'INTEGER']];

function openDb(file) {
  if (file) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file || ':memory:');
  db.exec(SCHEMA);
  for (const [table, col, type] of ADD_COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
  return db;
}

function prepareQueries(db) {
  const q = (sql) => db.prepare(sql);
  return {
    upsertUser: q('INSERT INTO users (id, username, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET username = excluded.username, data = excluded.data'),
    addSession: q('INSERT INTO sessions (hash, uid, created, platform, ua, ip, seen) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    getSession: q('SELECT uid, created, seen, ip, ua, platform FROM sessions WHERE hash = ?'),
    touchSession: q('UPDATE sessions SET seen = ?, ip = ?, ua = ?, platform = ? WHERE hash = ?'),
    userSessions: q('SELECT hash, created, seen, platform, ua, ip FROM sessions WHERE uid = ? ORDER BY COALESCE(seen, created) DESC'),
    dropSessionPrefix: q('DELETE FROM sessions WHERE uid = ? AND hash LIKE ?'),
    pruneSessions: q('DELETE FROM sessions WHERE created < ?'),
    dropSession: q('DELETE FROM sessions WHERE hash = ?'),
    dropUserSessions: q('DELETE FROM sessions WHERE uid = ? AND hash <> ?'),
    addGame: q('INSERT INTO games (share, created, kind, time_limit, x_id, o_id, x_name, o_name, winner, reason, moves, clock, opening, rule) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    linkGame: q('INSERT OR IGNORE INTO user_games (uid, game_id) VALUES (?, ?)'),
    oldGames: q('SELECT game_id FROM user_games WHERE uid = ? ORDER BY game_id DESC LIMIT -1 OFFSET ?'),
    unlinkGame: q('DELETE FROM user_games WHERE uid = ? AND game_id = ?'),
    gameRefs: q('SELECT COUNT(*) AS n FROM user_games WHERE game_id = ?'),
    dropGame: q('DELETE FROM games WHERE id = ?'),
    history: q(`SELECT g.id, g.share, g.created, g.kind, g.time_limit, g.clock, g.opening, g.rule, g.x_id, g.o_id, g.x_name, g.o_name, g.winner, g.reason,
      json_array_length(g.moves) AS moves FROM user_games ug JOIN games g ON g.id = ug.game_id WHERE ug.uid = ? AND g.id < ? ORDER BY g.id DESC LIMIT ?`),
    gameByShare: q('SELECT * FROM games WHERE share = ?'),
    pairGames: q(`SELECT * FROM (SELECT id, x_id, o_id, winner, moves FROM games WHERE x_id = ? AND o_id = ?
      UNION ALL SELECT id, x_id, o_id, winner, moves FROM games WHERE x_id = ? AND o_id = ?) ORDER BY id DESC LIMIT ?`),
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
    addPoint: q('INSERT INTO rating_hist (uid, pool, at, r) VALUES (?, ?, ?, ?)'),
    prunePoints: q('DELETE FROM rating_hist WHERE uid = ? AND id <= (SELECT id FROM rating_hist WHERE uid = ? ORDER BY id DESC LIMIT 1 OFFSET ?)'),
    points: q('SELECT pool, at, r FROM rating_hist WHERE uid = ? ORDER BY id'),
    upsertTour: q('INSERT INTO tours (id, status, created, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data'),
  };
}

module.exports = { openDb, prepareQueries };
