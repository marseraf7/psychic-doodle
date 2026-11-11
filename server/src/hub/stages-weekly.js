/*
 * Vòng tuần của sinh tồn (kiểu PGC 2021 – chỉ mô phỏng thể thức): giai đoạn race 'points' có
 *   cfg.weekly = { weeks, seats, final, bottom, sit }
 * Mỗi tuần (R = thứ tự đầu tuần; tuần 1: hạt giống, `sit` hạt giống cuối nghỉ tuần 1):
 *   1. Weekly Survival – cổng thắng trận, KHÔNG tính điểm: phòng `seats` đội đầu hàng chờ R; đội về nhất mỗi trận vào Weekly
 *      Final của tuần và rời phòng, đội kế tiếp trong hàng chờ vào thay – `seats` trận, đủ `seats` đội thắng khác nhau.
 *   2. Weekly Final – `final` trận tính điểm giữa các đội thắng Survival; đội nhất được bảo đảm suất (đứng đầu bảng giai đoạn);
 *      điểm cộng vào bảng Weekly Finals cộng dồn cả các tuần.
 *   3. Bottom – `bottom` trận tính điểm giữa các đội còn lại (cả đội nghỉ), chỉ để xếp lại hàng chờ tuần sau (không có ở tuần
 *      cuối; không loại ai).
 *   R tuần sau = thứ tự Weekly Final tuần này, rồi thứ tự Bottom.
 * Bảng giai đoạn (đi tiếp, dải hạng – routes): các đội nhất Weekly Final (theo thứ tự tuần, mỗi đội một lần), rồi mọi đội khác
 * theo điểm Weekly Finals cộng dồn (chỉ số phụ cfg.tb); đội chưa vào Weekly Final nào xếp sau theo thứ tự hàng chờ cuối.
 * Ví dụ PGC 2021: 32 đội, { weeks: 3, seats: 16, final: 10, bottom: 6, sit: 1 }; 12 đội đầu (3 đội nhất tuần + 9 đội điểm
 * cộng dồn cao nhất) vào thẳng chung kết, 19 đội kế đá Grand Survival, đội cuối bị loại.
 * Đội của từng trận phụ thuộc kết quả trước → nhập lần lượt, máy chủ gửi danh sách đội của trận kế tiếp.
 * Hàm thuần; stages-race.js truyền vào hàm xếp bảng `table(st, seedOf, members) → { list, stats }`.
 */
'use strict';

const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

function normalizeWeekly(c, out) {
  const x = c.weekly;
  if (!x || typeof x !== 'object') return;
  out.weekly = { weeks: int(x.weeks, 1, 5, 3), seats: int(x.seats, 2, 64, 16), final: int(x.final, 1, 30, 10), bottom: int(x.bottom, 0, 30, 6), sit: int(x.sit, 0, 8, 0) };
  for (const k of ['groups', 'rot', 'rotBlock', 'mp', 'gate', 'head', 'carry', 'circuit']) delete out[k];
}

/** Số trận một tuần (tuần cuối không có Bottom). */
const perWeek = (W, w) => W.seats + W.final + (w < W.weeks - 1 ? W.bottom : 0);
const totalEvents = (cfg) => { const W = cfg.weekly; let n = 0; for (let w = 0; w < W.weeks; w++) n += perWeek(W, w); return n; };
const weekStart = (W, w) => w * (W.seats + W.final + W.bottom); // các tuần trước tuần cuối đều đủ Bottom
/** Trận i: tuần w, loại ('surv' | 'final' | 'bottom'), thứ tự k trong loại. */
function phase(cfg, i) {
  const W = cfg.weekly;
  let w = Math.min(W.weeks - 1, Math.floor(i / (W.seats + W.final + W.bottom)));
  while (w > 0 && i < weekStart(W, w)) w--;
  const r = i - weekStart(W, w);
  if (r < W.seats) return { w, kind: 'surv', k: r };
  if (r < W.seats + W.final) return { w, kind: 'final', k: r - W.seats };
  return { w, kind: 'bottom', k: r - W.seats - W.final };
}
const isFinal = (cfg, i) => phase(cfg, i).kind === 'final';
const isSurv = (cfg, i) => phase(cfg, i).kind === 'surv';

/** Lỗi cỡ giai đoạn: hàng chờ tuần 1 phải đủ một phòng; còn ít nhất 2 đội cho Bottom (nếu có). */
function weeklyError(cfg, n) {
  if (!cfg.weekly) return null;
  const W = cfg.weekly, need = Math.max(W.seats + W.sit, W.bottom && W.weeks > 1 ? W.seats + 2 : 0, W.seats + 1);
  return n < need ? { code: 'ot_weekly_few', args: { n: need } } : null;
}

function make(st, table) {
  const cfg = st.cfg, W = cfg.weekly;
  const seed = new Map(st.entrants.map((u, k) => [u, k + 1]));
  const seedOf = (u) => seed.get(u) || 1e9;
  const memo = new Map();
  const once = (key, f) => { if (!memo.has(key)) memo.set(key, f()); return memo.get(key); };
  const evs = (w, kind) => st.events.filter((e) => { const p = phase(cfg, e.i); return p.w === w && p.kind === kind; });
  const sub = (list) => ({ ...st, cfg: { ...cfg, weekly: undefined }, head: null, mpWinner: null, events: list });
  const winnerOf = (e) => (e.done ? (e.rows.find((x) => !x.dnf && x.rank === 1) || {}).uid : null);
  /** Thứ tự đầu tuần w. */
  const rank = (w) => once('r' + w, () => (w === 0 ? [...st.entrants] : [...finalTable(w - 1), ...bottomTable(w - 1)]));
  /** Hàng chờ Survival tuần w (tuần 1: bỏ `sit` hạt giống cuối). */
  const queue = (w) => (w === 0 && W.sit ? rank(0).slice(0, rank(0).length - W.sit) : rank(w));
  /** Đội thắng các trận Survival tuần w có thứ tự < upto. */
  const survWinners = (w, upto = Infinity) => evs(w, 'surv').filter((e) => phase(cfg, e.i).k < upto).map(winnerOf).filter(Boolean);
  function survLobby(w, k) {
    const won = new Set(survWinners(w, k));
    return queue(w).filter((u) => !won.has(u)).slice(0, W.seats);
  }
  const finalists = (w) => survWinners(w);
  const finalTable = (w) => once('f' + w, () => table(sub(evs(w, 'final')), seedOf, finalists(w)).list);
  const bottomMembers = (w) => { const f = new Set(finalists(w)); return rank(w).filter((u) => !f.has(u)); };
  const bottomTable = (w) => once('b' + w, () => table(sub(evs(w, 'bottom')), seedOf, bottomMembers(w)).list);
  function lobby(i) {
    const p = phase(cfg, i);
    if (p.kind === 'surv') return survLobby(p.w, p.k);
    if (p.kind === 'final') return finalists(p.w);
    return bottomMembers(p.w);
  }
  /** Đội nhất Weekly Final các tuần đã đấu xong (mỗi đội một lần, theo thứ tự tuần). */
  function weekWinners() {
    const out = [];
    for (let w = 0; w < W.weeks; w++) {
      const f = evs(w, 'final');
      if (!f.length || !f.every((e) => e.done)) continue;
      const top = finalTable(w)[0];
      if (top && !out.includes(top)) out.push(top);
    }
    return out;
  }
  /** Bảng giai đoạn: đội nhất tuần, rồi điểm Weekly Finals cộng dồn; đội chưa vào Weekly Final nào theo hàng chờ cuối. */
  function overall(cum) {
    const won = weekWinners(), wset = new Set(won);
    const played = new Set();
    for (let w = 0; w < W.weeks; w++) for (const u of finalists(w)) played.add(u);
    let lastRank = rank(0);
    for (let w = W.weeks - 1; w > 0; w--) { if (evs(w - 1, 'bottom').every((e) => e.done) && evs(w - 1, 'final').every((e) => e.done)) { lastRank = rank(w); break; } }
    const rest = cum.filter((u) => !wset.has(u) && played.has(u));
    const never = lastRank.filter((u) => !wset.has(u) && !played.has(u));
    return [...won, ...rest, ...never];
  }
  return { lobby, survLobby, survWinners, finalists, finalTable, bottomMembers, bottomTable, weekWinners, overall, rank };
}

/** Các tuần đã bắt đầu: [{ w, done }]. */
function weeksShown(st) {
  const W = st.cfg.weekly, out = [];
  const next = st.events.findIndex((e) => !e.done);
  for (let w = 0; w < W.weeks; w++) {
    const from = weekStart(W, w), to = from + perWeek(W, w);
    const started = st.events.slice(from, to).some((e) => e.done) || (next >= from && next < to);
    if (started) out.push({ w, done: st.events.slice(from, to).every((e) => e.done) });
  }
  return out;
}

module.exports = { normalizeWeekly, totalEvents, phase, isFinal, isSurv, weeklyError, make, weeksShown, perWeek };
