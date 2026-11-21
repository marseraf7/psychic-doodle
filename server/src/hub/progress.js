/*
 * Tiến độ trong tài khoản + Puzzle Storm có kiểm (A5).
 *   progressSync { data }  – máy gửi tiến độ đang có (Giải đố, Storm, chuỗi ngày, huy hiệu); máy chủ GỘP với bản đã lưu
 *                            (caro/progress-merge.js: không bao giờ mất tiến độ) rồi trả { t: 'progress', data } để máy gộp lại.
 *   stormStart             – phát một lượt Storm: mã lượt + thứ tự bài (storm-verify.js – seed của máy chủ). { t: 'stormRun' }
 *   stormEnd { run, solved: [{ i, line }], wrong } – máy chủ tự kiểm từng bài (lời giải, thời gian, tốc độ); hợp lệ thì
 *                            ghi vào bảng tuần. { t: 'stormResult', score, best, week, rank } hoặc { rejected }.
 *   stormBoard             – bảng xếp hạng Storm tuần này (tuần ISO, đổi lúc 00:00 thứ Hai giờ Việt Nam) + hạng của mình.
 * Khách / chơi offline: chỉ lưu trên máy (progress-sync.js), Storm chơi như cũ, không vào bảng.
 * publicStormBoard(week) – cho GET /api/storm/leaderboard (web.js): không có id tài khoản / trường riêng.
 * progressOf(u) – chuỗi ngày + huy hiệu + Storm cho trang hồ sơ (profile.js).
 */
'use strict';
const crypto = require('crypto');
const { E } = require('../msg.js');
const P = require('../../../caro/progress-merge.js');
const V = require('../storm-verify.js');

const RUN_TTL = V.DURATION + V.MAX_BONUS + V.GRACE + 60 * 1000;
const RUNS_PER_DAY = 100; // mỗi tài khoản – chặn máy tự động chơi liên tục
const BOARD_N = 50;

let PUZZLES = null; // caro/puzzles.json – nạp khi cần
function puzzles() {
  if (!PUZZLES) {
    const list = require('../../../caro/puzzles.json');
    PUZZLES = { list, byId: new Map(list.map((q) => [q.id, q])) };
  }
  return PUZZLES;
}

class Progress {
  stormRuns() { return this._stormRuns || (this._stormRuns = new Map()); } // uid → lượt đang chơi { id, ids, at }
  stormDaily() { return this._stormDaily || (this._stormDaily = new Map()); } // uid → { day, n }

  on_progressSync(conn, { data }) {
    const u = this.requireUser(conn);
    this.throttle(conn, 'progressSync', 2000);
    // sane: ngày ở tương lai / trước khi có tính năng bị bỏ, chuỗi dài nhất trong giới hạn (dữ liệu máy tự báo)
    const merged = P.sane(P.merge(this.store.progressGet(u.id), data));
    // Điểm Storm cao nhất: ít nhất bằng điểm đã kiểm trên máy chủ
    merged.storm.best = Math.max(merged.storm.best, this.store.stormBestEver(u.id));
    this.store.progressSet(u.id, merged);
    conn.send({ t: 'progress', data: merged });
  }

  on_stormStart(conn) {
    const u = this.requireUser(conn);
    this.throttle(conn, 'stormStart', 5000);
    const day = new Date().toISOString().slice(0, 10);
    const d = this.stormDaily().get(u.id);
    const n = d && d.day === day ? d.n : 0;
    if (n >= RUNS_PER_DAY) throw E('storm_limit', { n: RUNS_PER_DAY });
    this.stormDaily().set(u.id, { day, n: n + 1 });
    const seed = crypto.randomBytes(4).readUInt32LE(0);
    const run = { id: crypto.randomBytes(8).toString('hex'), ids: V.stormList(puzzles().list, seed), at: Date.now() };
    this.stormRuns().set(u.id, run); // một lượt mỗi người: lượt mới thay lượt cũ
    for (const [k, r] of this.stormRuns()) if (Date.now() - r.at > RUN_TTL) this.stormRuns().delete(k);
    conn.send({ t: 'stormRun', run: run.id, ids: run.ids });
  }

  on_stormEnd(conn, { run, solved, wrong }) {
    const u = this.requireUser(conn);
    this.throttle(conn, 'stormEnd', 2000);
    const r = this.stormRuns().get(u.id);
    if (!r || r.id !== run) return conn.send({ t: 'stormResult', rejected: 'run' });
    this.stormRuns().delete(u.id); // mỗi lượt nộp một lần
    const res = V.checkRun(r, { solved, wrong }, Date.now(), puzzles().byId);
    if (!res.ok) return conn.send({ t: 'stormResult', rejected: res.reason });
    const week = this.store.stormAdd(u.id, res.score);
    const prog = this.store.progressGet(u.id) || P.clean({});
    prog.storm = { best: Math.max(prog.storm.best, res.score), runs: prog.storm.runs + 1, last: res.score };
    this.store.progressSet(u.id, prog);
    const mine = this.store.stormMine(u.id, week);
    conn.send({ t: 'stormResult', score: res.score, best: prog.storm.best, week, rank: mine.rank, weekBest: mine.score });
  }

  /** Bảng tuần (week mặc định: tuần này) – chỉ tên hiển thị / tên đăng nhập / điểm. */
  stormBoardView(week) {
    const w = /^\d{4}-W\d{2}$/.test(week || '') ? week : P.weekKey();
    const players = [];
    for (const r of this.store.stormBoard(w, BOARD_N)) {
      const u = this.store.users.get(r.uid);
      if (u) players.push({ rank: players.length + 1, username: u.username, name: u.name, score: r.score });
    }
    return { week: w, players };
  }

  on_stormBoard(conn) {
    this.throttle(conn, 'stormBoard', 1000);
    const v = this.stormBoardView();
    const uid = conn.pid && conn.pid.startsWith('u_') ? conn.pid.slice(2) : null;
    conn.send({ t: 'stormBoard', ...v, me: uid ? this.store.stormMine(uid, v.week) : null });
  }

  publicStormBoard(week) { return this.stormBoardView(week); }

  /**
   * Phần tiến độ hiện ở trang hồ sơ: chuỗi ngày (theo ngày của người đó), huy hiệu đã đạt, Storm. Chuỗi ngày / huy hiệu do
   * máy tự báo: làm sạch lại (P.sane), huy hiệu kiểm được bằng dữ liệu tài khoản (online, điểm, giải, chuỗi ngày) chỉ hiện
   * khi tài khoản đạt thật – tự sửa localStorage không làm hồ sơ công khai hiện "điểm 1800" hay "chuỗi 30 ngày".
   */
  progressOf(u) {
    const raw = this.store.progressGet(u.id);
    const p = raw && P.sane(raw);
    const tz = Number.isInteger(u.tz) ? u.tz : 0;
    const today = new Date(Date.now() + tz * 60000).toISOString().slice(0, 10);
    const week = P.weekKey();
    const best = p ? Math.max(p.habits.best, P.streakOf(p.habits.days, today)) : 0;
    return {
      streak: p ? P.streakOf(p.habits.days, today) : 0, bestStreak: best,
      badges: p ? P.BADGE_IDS.filter((id) => p.habits.earned[id] && this.badgeReal(u, id, best)) : [],
      storm: this.store.stormBestEver(u.id), stormWeek: this.store.stormMine(u.id, week).score,
    };
  }

  /** Huy hiệu có điều kiện kiểm được trên máy chủ (như habits.js): tài khoản đạt thật chưa. Huy hiệu khác (chơi với máy, bài
   *  học, giải đố – chỉ có trên máy) giữ như máy báo. */
  badgeReal(u, id, bestStreak) {
    const s = u.stats || {};
    const peak = () => Object.values(this.store.ratingPoints(u.id)).flat().reduce((m, x) => Math.max(m, x[1] || 0), u.rating || 0);
    switch (id) {
      case 'daily_3': return bestStreak >= 3;
      case 'daily_7': return bestStreak >= 7;
      case 'daily_30': return bestStreak >= 30;
      case 'online_10': return (s.wins | 0) >= 10;
      case 'online_100': return (s.wins | 0) + (s.losses | 0) + (s.draws | 0) >= 100;
      case 'win_streak_5': return !!(u.wstreak && u.wstreak.best >= 5);
      case 'rating_1500': return peak() >= 1500;
      case 'rating_1800': return peak() >= 1800;
      case 'tour_win': return !!(u.tours && u.tours.won >= 1);
      default: return true;
    }
  }
}

module.exports = { Progress, puzzles };
