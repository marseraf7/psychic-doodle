/*
 * API công khai v1 (C4) – phần dữ liệu: chỉ đọc, không lộ dữ liệu riêng (email, bạn bè, chặn, thiết bị, giờ online chi tiết).
 * Phần HTTP (đường dẫn, CORS, giới hạn theo IP, ETag, lỗi, OpenAPI) ở ../api-v1-http.js.
 * Quyền riêng tư:
 *   – Danh sách ván của một người chỉ trả khi Lịch sử đấu của họ để "Công khai" (u.histVis – history.js); ngoài ra trả
 *     { hidden: true, games: [] }. Ván lẻ thì mở bằng mã chia sẻ (như link xem lại – ai có link đều xem được).
 *   – Giải đấu: chỉ giải người chưa đăng nhập xem được (publicTour – api.js): không riêng tư / CLB / nháp / chờ duyệt.
 * Mỗi hàm trả null khi không có (HTTP 404).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../rating.js');
const GT = require('../../../caro/game-text.js');
const AC = require('../../../caro/a11y-coords.js');
const { DRAW } = require('../room.js');

const USER_RE = /^[a-z0-9_.]{3,20}$/;
const MAX_GAMES = 50;
let puzzleList = null; // caro/puzzles.json (đọc một lần)

const resultOf = (w) => (w === 1 ? 'x' : w === 2 ? 'o' : w === DRAW ? 'draw' : null);
/** Ngày theo giờ Việt Nam (UTC+7) – bài của ngày đổi lúc 0:00 giờ Việt Nam. */
const vnDay = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);

class ApiV1 {
  v1User(username) {
    const name = String(username || '').toLowerCase();
    return USER_RE.test(name) ? this.store.byUsername.get(name) || null : null;
  }

  /** Hồ sơ công khai. */
  v1Player(username) {
    const u = this.v1User(username);
    if (!u) return null;
    const now = Date.now();
    const perfs = {};
    for (const p of R.POOLS) {
      const x = u.pools[p];
      perfs[p] = { rating: Math.round(x.r), rd: Math.round(R.decayedRd(x, now)), provisional: R.provisional(x, now), games: x.n };
    }
    return {
      username: u.username, name: u.name, createdAt: u.created || null, perfs,
      count: { wins: u.stats.wins, losses: u.stats.losses, draws: u.stats.draws, rated: u.rated },
      tournaments: { played: u.tours.played, won: u.tours.won, podium: u.tours.podium },
      historyPublic: this.histVisOf(u) === 'public',
      url: '/?u=' + encodeURIComponent(u.username),
    };
  }

  /** Biểu đồ điểm: { pool: [[thời điểm ms, điểm], …] }. */
  v1Ratings(username) {
    const u = this.v1User(username);
    return u ? { username: u.username, history: this.store.ratingPoints(u.id) } : null;
  }

  /** Ván gần đây (mới nhất trước), chỉ khi lịch sử đấu công khai. store.history chỉ có số nước (moveCount) – nước đi ở v1Game. */
  v1Games(username, max) {
    const u = this.v1User(username);
    if (!u) return null;
    if (this.histVisOf(u) !== 'public') return { username: u.username, hidden: true, games: [] };
    const n = Math.max(1, Math.min(MAX_GAMES, Number(max) || 20));
    const games = this.store.history(u.id, n).map((g) => ({
      id: g.share, createdAt: g.created, kind: g.kind, rule: g.rule || 'vn', opening: g.opening || 'free', clock: g.clock || null,
      timeLimit: g.time_limit || 0, x: g.x_name, o: g.o_name, result: resultOf(g.winner), termination: g.reason || null, moveCount: g.moves,
    }));
    return { username: u.username, hidden: false, games };
  }

  /** Một ván đã lưu (theo mã chia sẻ) – không có id tài khoản. */
  v1Game(share) {
    const g = this.store.gameByShare(share);
    if (!g) return null;
    return {
      id: g.share, createdAt: g.created, kind: g.kind, rule: g.rule || 'vn', opening: g.opening || 'free', clock: g.clock || null,
      timeLimit: g.time_limit || 0, x: g.x_name, o: g.o_name, result: resultOf(g.winner), termination: g.reason || null,
      moves: g.moves, notation: g.moves.map(([x, y]) => AC.name(x, y)), url: '/?replay=' + g.share,
    };
  }

  /** Bản ghi chữ kiểu PGN (caro/game-text.js). base: địa chỉ trang (link xem lại tuyệt đối). */
  v1GameText(share, base = '') {
    const g = this.store.gameByShare(share);
    if (!g) return null;
    return GT.toText({ x: g.x_name, o: g.o_name, winner: g.winner, reason: g.reason, moves: g.moves, rule: g.rule, opening: g.opening,
      clock: g.clock, timeLimit: g.time_limit, created: g.created }, { site: base + '/?replay=' + g.share });
  }

  /** Thông tin giải (trực tuyến) – chỉ phần công khai. */
  v1Tour(id) {
    const t = this.publicTour(id);
    if (!t) return null;
    return {
      id: t.id, name: t.name, format: t.format, status: t.status, startsAt: t.startsAt, endsAt: t.endsAt, startedAt: t.startedAt,
      finishedAt: t.finishedAt, rule: t.rule, opening: t.opening, clock: t.clock, timeLimit: t.timeLimit, rated: !!t.rated,
      players: t.count, maxPlayers: t.maxPlayers || null, club: t.club ? t.club.name : null, creator: t.creator,
      podium: (t.podium || []).filter(Boolean).map((p) => p.name), url: t.url,
    };
  }

  /** Bảng xếp hạng của giải (thứ tự như trang giải: Arena theo điểm, giải khác theo hạt giống). */
  v1Standings(id) {
    const t = this.publicTour(id);
    if (!t) return null;
    const players = t.players.filter((p) => !p.withdrawn).map((p, i) => {
      const u = this.store.users.get(p.uid);
      return { rank: i + 1, name: p.name, username: u ? u.username : null, rating: p.rating || null, score: p.score || 0,
        wins: p.wins || 0, draws: p.draws || 0, losses: p.losses || 0, games: p.games || 0, out: p.out || null };
    });
    return { id: t.id, name: t.name, format: t.format, status: t.status, players };
  }

  /** Bảng xếp hạng chung / theo loại thời gian. */
  v1Leaderboard(pool) {
    const b = this.publicLeaderboard(pool);
    return { pool: b.pool, players: b.players.map((p) => ({ rank: p.rank, username: p.username, name: p.name, rating: p.rating, games: p.games })) };
  }

  /**
   * Bài đố của ngày (cách chọn giống puzzles.js trên trình duyệt: băm ngày YYYY-MM-DD trong các bài 800–1600 điểm).
   * date: 'YYYY-MM-DD' (mặc định hôm nay theo giờ Việt Nam).
   */
  v1Puzzle(date) {
    if (!puzzleList) {
      try { puzzleList = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'caro', 'puzzles.json'), 'utf8')).filter((q) => !q.rule); } catch (e) { puzzleList = []; }
    }
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : vnDay(Date.now());
    const pool = puzzleList.filter((q) => q.r >= 800 && q.r <= 1600);
    const src = pool.length ? pool : puzzleList;
    if (!src.length) return null;
    let h = 2166136261;
    for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const q = src[h % src.length];
    return {
      date: day, id: q.id, rating: q.r, theme: q.t || 'vct', rule: 'vn', toMove: q.m.length % 2 ? 'o' : 'x', winIn: q.len,
      moves: q.m, notation: q.m.map(([x, y]) => AC.name(x, y)), solution: { move: q.sol, notation: AC.name(q.sol[0], q.sol[1]) },
    };
  }
}

module.exports = { ApiV1, vnDay };
