/*
 * Các thể thức thi đấu theo vòng (không phụ thuộc mạng, kiểm thử riêng được):
 *   single     – loại trực tiếp (tuỳ chọn tranh hạng 3)
 *   double     – nhánh thắng / nhánh thua (thua 2 lần mới bị loại), chung kết tổng
 *                (tuỳ chọn "reset": người từ nhánh thua thắng chung kết thì đấu thêm 1 trận)
 *   roundrobin – vòng tròn, chia bảng (gặp nhau 1 hoặc 2 lần), tính điểm thắng / hoà / thua
 *   swiss      – hệ Thụy Sĩ: N vòng, mỗi vòng ghép người cùng điểm chưa gặp nhau
 *
 * Một giải có thể gồm nhiều vòng, ví dụ vòng bảng (vòng tròn) → playoff (loại trực tiếp / nhánh thắng-thua):
 * người đứng đầu mỗi bảng đi tiếp, được xếp hạt giống theo thành tích.
 *
 * Trận (match): { id, round, a, b, wins, games, done, winner, loser, ... }
 *   a / b: mã người chơi; null = chưa biết; '-' = trống (miễn đấu).
 *   winner: mã người thắng; null khi hoà (vòng tròn / Thụy Sĩ); '-' khi cả hai bên trống.
 * Các phần: stages-base.js (hằng số, trận mới), stages-elim.js (loại trực tiếp / nhánh thắng-thua),
 * stages-groups.js (vòng tròn, Thụy Sĩ, bảng điểm). File này: chuẩn hoá cấu hình, tạo vòng, ghi kết quả, thứ hạng.
 */
'use strict';
const { TYPES, GROUP_TYPES, BYE, MAX_GROUP, MAX_GROUPS, isElim, real } = require('./stages-base.js');
const { seedOrder, resolveElim, buildSingle, buildDouble } = require('./stages-elim.js');
const { groupCount, drawGroups, buildRoundRobin, swissPairs, swissNextRound, tally, standings, advancers, swissMaxRounds } = require('./stages-groups.js');

/** Chuẩn hoá cấu hình một vòng (dữ liệu từ client). last: có phải vòng cuối không. */
function normalizeStage(c, last) {
  c = c || {};
  let type = TYPES.includes(c.type) ? c.type : 'single';
  if (!last && !GROUP_TYPES.includes(type)) type = 'roundrobin';
  const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  const out = { type, bestOf: [1, 3, 5].includes(Number(c.bestOf)) ? Number(c.bestOf) : (isElim(type) ? 3 : 1) };
  if (type === 'single') out.thirdPlace = c.thirdPlace !== false;
  if (type === 'double') out.reset = c.reset !== false;
  if (type === 'roundrobin') {
    // Chia bảng theo số bảng, hoặc (như Challonge) theo số người mỗi bảng
    if (c.groupSize != null && c.groupSize !== '') out.groupSize = int(c.groupSize, 2, MAX_GROUP, 4);
    else out.groups = int(c.groups, 1, MAX_GROUPS, 1);
    out.meetings = Number(c.meetings) === 2 ? 2 : 1;
  }
  if (type === 'swiss') out.rounds = int(c.rounds, 1, 15, 5);
  if (!isElim(type)) {
    out.points = { w: int(c.points && c.points.w, 0, 10, 3), d: int(c.points && c.points.d, 0, 10, 1), l: int(c.points && c.points.l, 0, 10, 0) };
    if (!last) out.advance = int(c.advance, 1, 32, 2); // RR: mỗi bảng; Thụy Sĩ: tổng số người đi tiếp
  }
  return out;
}

function normalizeStages(list) {
  const arr = Array.isArray(list) && list.length ? list.slice(0, 3) : [{ type: 'single' }];
  return arr.map((c, i) => normalizeStage(c, i === arr.length - 1));
}

// ------------------------------------------------------------ Khởi tạo / tiến trình
/** Tạo vòng mới với danh sách hạt giống (thứ tự = hạt giống 1, 2, …). */
function buildStage(cfg, index, seeds, opts = {}) {
  const st = { type: cfg.type, cfg, index, key: `s${index}`, entrants: [...seeds], matches: {}, done: false };
  if (cfg.type === 'single') buildSingle(st, seeds, opts.groupOf);
  else if (cfg.type === 'double') buildDouble(st, seeds, opts.groupOf);
  else if (cfg.type === 'roundrobin') buildRoundRobin(st, seeds, opts.groups);
  else {
    st.rounds = [];
    st.cfg = { ...cfg, rounds: Math.min(cfg.rounds, swissMaxRounds(seeds.length)) };
    swissNextRound(st, opts.seedOf || ((u) => seeds.indexOf(u)), opts.isActive);
  }
  return st;
}

/** Trận đã sẵn sàng đấu (đủ 2 người thật, chưa xong; vòng tròn: đã xong các vòng trước của 2 người). */
function playable(st) {
  const all = Object.values(st.matches);
  // Vòng tròn: vòng sớm nhất còn trận chưa xong của từng người (mỗi người chỉ ở một bảng).
  // Tính một lượt cho cả vòng (O(số trận)) – giải 512 người có tới 3840 trận.
  let first = null;
  if (st.type === 'roundrobin') {
    first = new Map();
    for (const x of all) {
      if (x.done) continue;
      for (const u of [x.a, x.b]) if (!first.has(u) || x.round < first.get(u)) first.set(u, x.round);
    }
  }
  const out = [];
  for (const m of all) {
    if (m.done || !real(m.a) || !real(m.b)) continue;
    if (first && (first.get(m.a) < m.round || first.get(m.b) < m.round)) continue;
    out.push(m);
  }
  return out;
}

/**
 * Ghi kết quả một trận. winner: mã người thắng, hoặc null nếu hoà (chỉ vòng tròn / Thụy Sĩ).
 * Trả về true nếu cả vòng đã xong.
 */
function recordResult(st, m, winner, opts = {}) {
  if (m.done) return st.done;
  if (isElim(st.type)) resolveElim(st, m, winner, winner === m.a ? m.b : m.a);
  else {
    m.done = true;
    m.winner = winner;
    m.loser = winner === null ? null : winner === m.a ? m.b : m.a;
    if (opts.double) { m.double = true; m.winner = BYE; }
    if (st.type === 'swiss') {
      const cur = st.rounds[st.rounds.length - 1];
      if (cur.every((id) => st.matches[id].done) && st.rounds.length < st.cfg.rounds) swissNextRound(st, opts.seedOf || ((u) => st.entrants.indexOf(u)), opts.isActive);
    }
  }
  st.done = Object.values(st.matches).every((x) => x.done);
  return st.done;
}

/** Thứ hạng cuối của vòng cuối: [nhất, nhì, ba…] (mã người chơi). */
function podium(st, seedOf) {
  if (st.type === 'single') {
    const final = st.matches[st.rounds[st.rounds.length - 1][0]];
    const out = [final.winner, final.loser];
    if (st.third) out.push(st.matches[st.third].winner);
    else if (st.rounds.length >= 2) out.push(...st.rounds[st.rounds.length - 2].map((id) => st.matches[id].loser));
    return out.filter(real);
  }
  if (st.type === 'double') {
    const g1 = st.matches[st.gf[0]], g2 = st.gf[1] && st.matches[st.gf[1]];
    const last = g2 && !g2.skipped ? g2 : g1;
    const lbFinal = st.matches[st.lrounds[st.lrounds.length - 1][0]];
    return [last.winner, last.loser, lbFinal.loser].filter(real);
  }
  const tables = standings(st, seedOf);
  if (tables.length === 1) return tables[0].list.slice(0, 3);
  // Nhiều bảng ở vòng cuối: nhất các bảng xếp theo thành tích
  return advancers({ ...st, cfg: { ...st.cfg, advance: 1 } }, seedOf).seeds.slice(0, 3);
}

/** Người bị loại ở vòng loại trực tiếp (thua trận cuối của mình và không còn trận nào). */
function eliminated(st, uid) {
  if (!isElim(st.type)) return false;
  const mine = Object.values(st.matches).filter((m) => m.a === uid || m.b === uid);
  if (mine.some((m) => !m.done)) return false;
  return mine.some((m) => m.done && m.loser === uid && !m.loserTo) || (st.type === 'double' && mine.some((m) => m.lb && m.loser === uid));
}

module.exports = {
  TYPES, GROUP_TYPES, BYE, seedOrder, normalizeStages, buildStage, playable, recordResult, standings, advancers, podium,
  tally, eliminated, isElim, real, swissPairs, swissMaxRounds, drawGroups, groupCount, MAX_GROUP, MAX_GROUPS,
};
