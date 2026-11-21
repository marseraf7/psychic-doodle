/*
 * Chống gian lận Puzzle Storm (A5): máy chủ phát danh sách bài cho mỗi lượt chơi và tự kiểm lại lời giải.
 *   stormList(puzzles, seed) – thứ tự bài của một lượt (như storm.js: bài đầu dễ, mỗi bài sau khó hơn ~45 điểm, chọn ngẫu
 *                              nhiên trong 6 bài gần nhất – ngẫu nhiên theo seed của máy chủ)
 *   verifySolve(q, line)      – dãy nước người chơi đi (nước mình, máy chặn, …, nước thắng) có đúng là lời giải bài q:
 *                              nước đầu là lời giải trong puzzles.json hoặc được chứng minh thắng chắc, các nước hợp lệ, nước
 *                              cuối thành 5, không có 5 sớm hơn / máy không thắng trước
 *   checkRun(run, sub, now, puzzlesById) – kiểm cả lượt: thời gian (≤ 3 phút + thưởng tối đa + trễ mạng), số bài không vượt
 *                              số lượt thử, chỉ số bài hợp lệ / không trùng, mỗi bài giải đúng, tốc độ (≥ MIN_PER_SOLVE mỗi bài)
 *                              → { ok, score, reason }
 * Dùng caro/rules.js + caro/analysis.js (chạy được trên Node).
 */
'use strict';
const C = require('../../caro/rules.js');
const A = require('../../caro/analysis.js');

const DURATION = 3 * 60 * 1000; // như storm.js
const MAX_BONUS = (3 + 5 + 7 + 10) * 1000; // cộng thời gian khi chuỗi đúng 5 / 12 / 20 / 30
const GRACE = 30 * 1000; // trễ mạng, máy chậm
const MIN_PER_SOLVE = 800; // ms – mỗi bài ít nhất: đi nước + chờ chuyển bài (storm.js 350 ms) + máy chặn (450 ms / nước)
const MAX_COORD = 200;

/** Số ngẫu nhiên 0…1 theo seed (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stormPool = (puzzles) => puzzles.filter((q) => q.len <= 3 && !q.rule);

function stormList(puzzles, seed) {
  const pool = stormPool(puzzles);
  const r = rng(seed);
  const used = new Set(), out = [];
  for (let k = 0; out.length < pool.length; k++) {
    const target = 500 + k * 45;
    const top = pool.filter((q) => !used.has(q.id)).sort((a, b) => Math.abs(a.r - target) - Math.abs(b.r - target) || a.id - b.id).slice(0, 6);
    const q = top[Math.floor(r() * top.length)];
    used.add(q.id);
    out.push(q.id);
  }
  return out;
}

const isMove = (m) => Array.isArray(m) && m.length === 2 && m.every((v) => Number.isInteger(v) && Math.abs(v) <= MAX_COORD);

/** budget: { left: ms } – tổng thời gian CPU còn được dùng để chứng minh nước đầu khác lời giải sẵn có (cả lượt). */
function verifySolve(q, line, budget = { left: 150 }) {
  if (!q || !Array.isArray(line) || !line.length || line.length % 2 === 0 || line.length > 2 * (q.len + 2) - 1 || !line.every(isMove)) return false;
  const b = new C.Board(q.rule || 'vn');
  for (let i = 0; i < q.m.length; i++) b.play(q.m[i][0], q.m[i][1], i % 2 ? C.O : C.X);
  const p = q.m.length % 2 ? C.O : C.X, opp = C.other(p);
  const [fx, fy] = line[0];
  if (b.get(fx, fy) !== C.EMPTY) return false;
  let first = (q.sol && q.sol[0] === fx && q.sol[1] === fy) || C.winsIfPlaced(b, fx, fy, p);
  if (!first && budget.left > 0) {
    const t0 = Date.now();
    first = A.winningMove(b, p, [fx, fy], Math.max(2, q.len + 1), { deadline: t0 + Math.min(150, budget.left) });
    budget.left -= Date.now() - t0 + 1;
  }
  if (!first) return false;
  for (let i = 0; i < line.length; i++) {
    const [x, y] = line[i];
    const side = i % 2 ? opp : p;
    if (b.get(x, y) !== C.EMPTY) return false;
    b.play(x, y, side);
    const five = C.checkWin(b, x, y, side);
    if (five) return side === p && i === line.length - 1; // thắng đúng ở nước cuối; máy không được thành 5
  }
  return false; // hết dãy mà chưa thành 5
}

/**
 * run: { ids, at } (máy chủ đã phát); sub: { solved: [{ i, line }], wrong }; puzzlesById: Map(id → bài).
 */
function checkRun(run, sub, now, puzzlesById) {
  const elapsed = now - run.at;
  if (elapsed > DURATION + MAX_BONUS + GRACE) return { ok: false, reason: 'late' };
  const solved = Array.isArray(sub && sub.solved) ? sub.solved : [];
  const wrong = Math.max(0, Math.floor(Number(sub && sub.wrong) || 0));
  if (solved.length > run.ids.length) return { ok: false, reason: 'count' };
  const seen = new Set();
  for (const s of solved) {
    const i = s && s.i;
    if (!Number.isInteger(i) || i < 0 || i >= run.ids.length || seen.has(i)) return { ok: false, reason: 'index' };
    if (i >= solved.length + wrong) return { ok: false, reason: 'index' }; // bài thứ i chỉ tới được sau i lượt thử
    seen.add(i);
  }
  if (solved.length * MIN_PER_SOLVE > elapsed) return { ok: false, reason: 'fast' };
  const budget = { left: 1500 }; // cả lượt tối đa ~1,5 giây CPU cho các nước đầu khác lời giải sẵn có
  for (const s of solved) if (!verifySolve(puzzlesById.get(run.ids[s.i]), s.line, budget)) return { ok: false, reason: 'line' };
  return { ok: true, score: solved.length };
}

module.exports = { stormList, verifySolve, checkRun, stormPool, rng, DURATION, MAX_BONUS, GRACE, MIN_PER_SOLVE };
