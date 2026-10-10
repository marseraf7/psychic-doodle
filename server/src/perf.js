/*
 * Thống kê sâu theo loại thời gian (học ý tưởng "perfStat" của Lichess) và nhật ký hoạt động 30 ngày.
 *  u.perf[pool] = { hi: { r, at }, lo: { r, at }, best: [...], worst: [...], win: { cur, max }, loss: { cur, max } }
 *    best  : 5 trận thắng đối thủ điểm cao nhất · worst: 5 trận thua đối thủ điểm thấp nhất (chỉ ván tính điểm)
 *    win / loss: chuỗi thắng / thua liên tiếp hiện tại và dài nhất (ván tính điểm).
 *  u.act = { 'YYYY-MM-DD': { w, l, d, r: { pool: điểm thay đổi } } } – 30 ngày gần nhất, mọi ván (kể cả không tính điểm).
 */
'use strict';

const TOP = 5;
const ACT_DAYS = 30;
const day = (at) => new Date(at).toISOString().slice(0, 10);

function emptyPerf() {
  return { hi: null, lo: null, best: [], worst: [], win: { cur: 0, max: 0 }, loss: { cur: 0, max: 0 } };
}

/**
 * Một ván tính điểm vừa xong. g = { result: 'win' | 'loss' | 'draw', r: điểm sau ván, opp: { name, r }, share, at }.
 */
function addRated(u, pool, g) {
  if (!u.perf) u.perf = {};
  const p = u.perf[pool] || (u.perf[pool] = emptyPerf());
  const r = Math.round(g.r);
  if (!p.hi || r > p.hi.r) p.hi = { r, at: g.at };
  if (!p.lo || r < p.lo.r) p.lo = { r, at: g.at };
  const item = { r: Math.round(g.opp.r), name: g.opp.name, share: g.share || null, at: g.at };
  if (g.result === 'win') p.best = [...p.best, item].sort((a, b) => b.r - a.r).slice(0, TOP);
  if (g.result === 'loss') p.worst = [...p.worst, item].sort((a, b) => a.r - b.r).slice(0, TOP);
  for (const [k, hit] of [['win', g.result === 'win'], ['loss', g.result === 'loss']]) {
    p[k].cur = hit ? p[k].cur + 1 : 0;
    p[k].max = Math.max(p[k].max, p[k].cur);
  }
  return p;
}

/** Ghi một ván vào nhật ký hoạt động (delta: điểm thay đổi nếu ván tính điểm). */
function addActivity(u, result, pool, delta, at = Date.now()) {
  const act = u.act || (u.act = {});
  const d = act[day(at)] || (act[day(at)] = { w: 0, l: 0, d: 0, r: {} });
  d[result === 'win' ? 'w' : result === 'loss' ? 'l' : 'd']++;
  if (pool && typeof delta === 'number') d.r[pool] = (d.r[pool] || 0) + delta;
  const cut = day(at - ACT_DAYS * 86400000);
  for (const k of Object.keys(act)) if (k <= cut) delete act[k];
}

/** Nhật ký mới nhất trước: [{ day, w, l, d, r }]. */
function activity(u) {
  return Object.entries(u.act || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([k, v]) => ({ day: k, ...v }));
}

module.exports = { emptyPerf, addRated, addActivity, activity, TOP, ACT_DAYS };
