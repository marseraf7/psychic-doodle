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
 */
'use strict';

const TYPES = ['single', 'double', 'roundrobin', 'swiss'];
const GROUP_TYPES = ['roundrobin', 'swiss']; // được dùng làm vòng trước (có người đi tiếp)
const BYE = '-';

function seedOrder(size) {
  let o = [1];
  while (o.length < size) {
    const n = o.length * 2;
    o = o.flatMap((s) => [s, n + 1 - s]);
  }
  return o;
}
const pow2 = (n) => { let s = 2; while (s < n) s *= 2; return s; };
const isElim = (type) => type === 'single' || type === 'double';
const real = (x) => typeof x === 'string' && x !== BYE;

function newMatch(id, round, extra = {}) {
  return { id, round, a: null, b: null, wins: {}, games: [], done: false, winner: null, loser: null, room: null, readyAt: null, ...extra };
}

/** Chuẩn hoá cấu hình một vòng (dữ liệu từ client). last: có phải vòng cuối không. */
function normalizeStage(c, last) {
  c = c || {};
  let type = TYPES.includes(c.type) ? c.type : 'single';
  if (!last && !GROUP_TYPES.includes(type)) type = 'roundrobin';
  const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  const out = { type, bestOf: [1, 3, 5].includes(Number(c.bestOf)) ? Number(c.bestOf) : (isElim(type) ? 3 : 1) };
  if (type === 'single') out.thirdPlace = c.thirdPlace !== false;
  if (type === 'double') out.reset = c.reset !== false;
  if (type === 'roundrobin') { out.groups = int(c.groups, 1, 16, 1); out.meetings = Number(c.meetings) === 2 ? 2 : 1; }
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

// ------------------------------------------------------------ Loại trực tiếp / nhánh thắng-thua
/** Đặt người (hoặc ô trống) vào trận đích; trận có đủ 2 ô mà một bên trống thì tự xử. */
function place(st, ref, value, events) {
  if (!ref) return;
  const m = st.matches[ref.to];
  m[ref.slot] = value;
  autoBye(st, m, events);
}

function autoBye(st, m, events) {
  if (m.done || m.a === null || m.b === null) return;
  if (m.a === BYE || m.b === BYE) {
    const w = m.a === BYE ? m.b : m.a;
    m.bye = true;
    resolveElim(st, m, w, BYE, events);
  }
}

/** Ghi kết quả trận của vòng loại trực tiếp và chuyển người thắng / thua tới trận tiếp theo. */
function resolveElim(st, m, winner, loser, events = []) {
  m.done = true;
  m.winner = winner;
  m.loser = loser;
  events.push(m.id);
  if (st.type === 'double' && m.id === st.gf[0]) {
    const gf2 = st.gf[1] && st.matches[st.gf[1]];
    // Người từ nhánh thắng thắng luôn (hoặc không có "reset"): xong; ngược lại đấu thêm trận reset
    if (gf2) {
      if (winner === m.a || !real(m.b) || !real(m.a)) { gf2.done = true; gf2.skipped = true; gf2.winner = BYE; }
      else { gf2.a = m.a; gf2.b = m.b; }
    }
    return events;
  }
  place(st, m.next, winner, events);
  place(st, m.loserTo, loser, events);
  return events;
}

/** Tránh 2 người cùng bảng gặp nhau ngay trận đầu playoff (đổi chỗ với cặp khác nếu được). */
function avoidSameGroup(pairs, groupOf) {
  if (!groupOf) return;
  const same = (x, y) => real(x) && real(y) && groupOf[x] != null && groupOf[x] === groupOf[y];
  for (let i = 0; i < pairs.length; i++) {
    if (!same(pairs[i][0], pairs[i][1])) continue;
    for (let j = 0; j < pairs.length; j++) {
      if (j === i) continue;
      if (!same(pairs[i][0], pairs[j][1]) && !same(pairs[j][0], pairs[i][1])) {
        [pairs[i][1], pairs[j][1]] = [pairs[j][1], pairs[i][1]];
        break;
      }
    }
  }
}

function firstRound(seeds, size, groupOf) {
  const order = seedOrder(size);
  const pairs = [];
  for (let i = 0; i < size / 2; i++) pairs.push([seeds[order[2 * i] - 1] || BYE, seeds[order[2 * i + 1] - 1] || BYE]);
  avoidSameGroup(pairs, groupOf);
  return pairs;
}

function buildSingle(st, seeds, groupOf) {
  const size = pow2(Math.max(2, seeds.length));
  const R = Math.log2(size);
  const id = (r, i) => `${st.key}w${r}m${i}`;
  st.rounds = [];
  for (let r = 0; r < R; r++) {
    const ids = [];
    for (let i = 0; i < size >> (r + 1); i++) {
      const m = newMatch(id(r, i), r);
      if (r < R - 1) m.next = { to: id(r + 1, i >> 1), slot: i % 2 ? 'b' : 'a' };
      st.matches[m.id] = m;
      ids.push(m.id);
    }
    st.rounds.push(ids);
  }
  if (st.cfg.thirdPlace && size >= 4) {
    const t = newMatch(`${st.key}third`, R - 1, { third: true });
    st.matches[t.id] = t;
    st.third = t.id;
    st.rounds[R - 2].forEach((mid, i) => { st.matches[mid].loserTo = { to: t.id, slot: i % 2 ? 'b' : 'a' }; });
  }
  const events = [];
  firstRound(seeds, size, groupOf).forEach(([a, b], i) => {
    const m = st.matches[id(0, i)];
    m.a = a;
    m.b = b;
  });
  for (const mid of st.rounds[0]) autoBye(st, st.matches[mid], events);
}

function buildDouble(st, seeds, groupOf) {
  const size = pow2(Math.max(4, seeds.length));
  const k = Math.log2(size);
  const W = (r, i) => `${st.key}w${r}m${i}`;
  const L = (j, i) => `${st.key}l${j}m${i}`;
  st.rounds = [];
  st.lrounds = [];
  st.gf = [];
  const gf1 = newMatch(`${st.key}gf1`, k, { gf: 1 });
  st.matches[gf1.id] = gf1;
  st.gf.push(gf1.id);
  if (st.cfg.reset) {
    const gf2 = newMatch(`${st.key}gf2`, k + 1, { gf: 2 });
    st.matches[gf2.id] = gf2;
    st.gf.push(gf2.id);
  }
  const nL = 2 * (k - 1);
  const lbCount = [];
  for (let j = 0; j < nL; j++) lbCount.push(j === 0 ? size / 4 : j % 2 ? lbCount[j - 1] : lbCount[j - 1] / 2);
  for (let j = 0; j < nL; j++) {
    const ids = [];
    for (let i = 0; i < lbCount[j]; i++) {
      const m = newMatch(L(j, i), j, { lb: true });
      if (j === nL - 1) m.next = { to: gf1.id, slot: 'b' };
      else if (j % 2 === 0) m.next = { to: L(j + 1, i), slot: 'a' };
      else m.next = { to: L(j + 1, i >> 1), slot: i % 2 ? 'b' : 'a' };
      st.matches[m.id] = m;
      ids.push(m.id);
    }
    st.lrounds.push(ids);
  }
  for (let r = 0; r < k; r++) {
    const ids = [];
    const n = size >> (r + 1);
    for (let i = 0; i < n; i++) {
      const m = newMatch(W(r, i), r);
      m.next = r < k - 1 ? { to: W(r + 1, i >> 1), slot: i % 2 ? 'b' : 'a' } : { to: gf1.id, slot: 'a' };
      if (r === 0) m.loserTo = { to: L(0, i >> 1), slot: i % 2 ? 'b' : 'a' };
      else {
        // Người thua nhánh thắng rơi xuống nhánh thua; đảo thứ tự xen kẽ để tránh gặp lại ngay
        const idx = r % 2 === 1 ? n - 1 - i : i;
        m.loserTo = { to: L(2 * r - 1, idx), slot: 'b' };
      }
      st.matches[m.id] = m;
      ids.push(m.id);
    }
    st.rounds.push(ids);
  }
  const events = [];
  firstRound(seeds, size, groupOf).forEach(([a, b], i) => {
    const m = st.matches[W(0, i)];
    m.a = a;
    m.b = b;
  });
  for (const mid of st.rounds[0]) autoBye(st, st.matches[mid], events);
}

// ------------------------------------------------------------ Vòng tròn
function buildRoundRobin(st, seeds) {
  const G = Math.max(1, Math.min(st.cfg.groups, Math.floor(seeds.length / 2)));
  st.groups = Array.from({ length: G }, (_, g) => ({ name: String.fromCharCode(65 + g), players: [], rounds: [] }));
  // Chia bảng kiểu "rắn": hạt giống 1..G vào A..cuối, rồi đảo chiều
  seeds.forEach((uid, i) => {
    const row = Math.floor(i / G), col = i % G;
    st.groups[row % 2 ? G - 1 - col : col].players.push(uid);
  });
  st.groups.forEach((grp, g) => {
    const arr = [...grp.players];
    if (arr.length % 2) arr.push(BYE);
    const n = arr.length;
    const base = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const x = arr[i], y = arr[n - 1 - i];
        if (x !== BYE && y !== BYE) pairs.push(r % 2 ? [y, x] : [x, y]);
      }
      base.push(pairs);
      arr.splice(1, 0, arr.pop()); // xoay vòng (giữ cố định người đầu)
    }
    const all = st.cfg.meetings === 2 ? [...base, ...base.map((ps) => ps.map(([x, y]) => [y, x]))] : base;
    all.forEach((pairs, r) => {
      const ids = [];
      pairs.forEach(([x, y], i) => {
        const m = newMatch(`${st.key}g${g}r${r}m${i}`, r, { group: g });
        m.a = x;
        m.b = y;
        st.matches[m.id] = m;
        ids.push(m.id);
      });
      grp.rounds.push(ids);
    });
  });
}

// ------------------------------------------------------------ Thụy Sĩ
/** Ghép một vòng Thụy Sĩ: cùng điểm gặp nhau, không gặp lại; số lẻ thì người thấp nhất chưa được miễn đấu được miễn. */
function swissPairs(order, played, byes) {
  const list = [...order];
  let bye = null;
  if (list.length % 2) {
    for (let i = list.length - 1; i >= 0; i--) if (!byes[list[i]]) { bye = list[i]; break; }
    if (bye === null) bye = list[list.length - 1];
    list.splice(list.indexOf(bye), 1);
  }
  const key = (x, y) => (x < y ? x + '|' + y : y + '|' + x);
  let budget = 50000;
  const dfs = (rest) => {
    if (!rest.length) return [];
    if (--budget < 0) return null;
    const [a, ...others] = rest;
    for (let i = 0; i < others.length; i++) {
      if (played.has(key(a, others[i]))) continue;
      const sub = dfs(others.filter((_, j) => j !== i));
      if (sub) return [[a, others[i]], ...sub];
    }
    return null;
  };
  let pairs = dfs(list);
  if (!pairs) { // không tránh được gặp lại: ghép lần lượt theo thứ hạng
    pairs = [];
    for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
  }
  return { pairs, bye };
}

function swissNextRound(st, seedOf, isActive = () => true) {
  const r = st.rounds.length;
  const stats = tally(st);
  // Người đã rút không được ghép nữa (vẫn còn trong bảng xếp hạng)
  const order = st.entrants.filter(isActive).sort((a, b) => stats[b].pts - stats[a].pts || seedOf(a) - seedOf(b));
  const played = new Set();
  for (const m of Object.values(st.matches)) if (real(m.a) && real(m.b)) played.add(m.a < m.b ? m.a + '|' + m.b : m.b + '|' + m.a);
  const byes = {};
  for (const m of Object.values(st.matches)) if (m.bye && real(m.winner)) byes[m.winner] = (byes[m.winner] || 0) + 1;
  const { pairs, bye } = swissPairs(order, played, byes);
  const ids = [];
  pairs.forEach(([a, b], i) => {
    const m = newMatch(`${st.key}s${r}m${i}`, r);
    m.a = a;
    m.b = b;
    st.matches[m.id] = m;
    ids.push(m.id);
  });
  if (bye) {
    const m = newMatch(`${st.key}s${r}bye`, r, { bye: true });
    m.a = bye;
    m.b = BYE;
    m.done = true;
    m.winner = bye;
    m.loser = BYE;
    st.matches[m.id] = m;
    ids.push(m.id);
  }
  st.rounds.push(ids);
}

// ------------------------------------------------------------ Bảng điểm
/** Thống kê từng người trong vòng (vòng tròn / Thụy Sĩ). */
function tally(st, only) {
  const p = st.cfg.points || { w: 1, d: 0, l: 0 };
  const s = {};
  for (const uid of only || st.entrants) s[uid] = { uid, mp: 0, w: 0, d: 0, l: 0, gw: 0, gl: 0, pts: 0, opps: [], beat: [], drew: [], byes: 0 };
  for (const m of Object.values(st.matches)) {
    if (!m.done) continue;
    if (m.bye) { // miễn đấu (Thụy Sĩ): tính như thắng
      if (s[m.winner]) { s[m.winner].pts += p.w; s[m.winner].w++; s[m.winner].byes++; }
      continue;
    }
    for (const [me, op] of [[m.a, m.b], [m.b, m.a]]) {
      const x = s[me];
      if (!x || !real(me)) continue;
      x.mp++;
      x.opps.push(op);
      x.gw += m.wins[me] || 0;
      x.gl += m.wins[op] || 0;
      if (m.double) { x.l++; x.pts += p.l; continue; } // cả hai vắng mặt: đều thua
      if (m.winner === null) { x.d++; x.pts += p.d; x.drew.push(op); } else if (m.winner === me) { x.w++; x.pts += p.w; x.beat.push(op); } else { x.l++; x.pts += p.l; }
    }
  }
  // Buchholz (tổng điểm các đối thủ) và Sonneborn–Berger (điểm đối thủ mình thắng + ½ hoà)
  for (const x of Object.values(s)) {
    x.bh = x.opps.reduce((t, o) => t + (s[o] ? s[o].pts : 0), 0);
    x.sb = x.beat.reduce((t, o) => t + (s[o] ? s[o].pts : 0), 0) + x.drew.reduce((t, o) => t + (s[o] ? s[o].pts / 2 : 0), 0);
  }
  return s;
}

/** Xếp hạng một nhóm người: điểm → (vòng tròn: đối đầu, hiệu số ván) / (Thụy Sĩ: Buchholz, SB) → hạt giống. */
function rankList(st, uids, seedOf) {
  const s = tally(st, uids);
  const cmp = st.type === 'swiss'
    ? (a, b) => s[b].pts - s[a].pts || s[b].bh - s[a].bh || s[b].sb - s[a].sb || s[b].w - s[a].w || seedOf(a) - seedOf(b)
    : (a, b) => s[b].pts - s[a].pts || (s[b].gw - s[b].gl) - (s[a].gw - s[a].gl) || s[b].gw - s[a].gw || seedOf(a) - seedOf(b);
  const list = [...uids].sort(cmp);
  if (st.type === 'roundrobin') {
    // Hai người bằng điểm: ai thắng trận đối đầu xếp trên
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      if (s[a].pts !== s[b].pts || (list[i + 2] && s[list[i + 2]].pts === s[a].pts) || (i > 0 && s[list[i - 1]].pts === s[a].pts)) continue;
      const h = Object.values(st.matches).filter((m) => m.done && ((m.a === a && m.b === b) || (m.a === b && m.b === a)));
      const aw = h.filter((m) => m.winner === a).length, bw = h.filter((m) => m.winner === b).length;
      if (bw > aw) { list[i] = b; list[i + 1] = a; }
    }
  }
  return { list, stats: s };
}

/** Bảng xếp hạng của vòng: vòng tròn = từng bảng; Thụy Sĩ = một bảng. */
function standings(st, seedOf) {
  if (st.type === 'roundrobin') return st.groups.map((g) => rankList(st, g.players, seedOf));
  if (st.type === 'swiss') return [rankList(st, st.entrants, seedOf)];
  return null;
}

/** Người đi tiếp sang vòng sau, theo thứ tự hạt giống mới (nhất các bảng, rồi nhì các bảng…). */
function advancers(st, seedOf) {
  const k = st.cfg.advance || 2;
  const tables = standings(st, seedOf);
  const groupOf = {};
  if (st.type === 'swiss') return { seeds: tables[0].list.slice(0, Math.max(2, k)), groupOf };
  const tiers = [];
  tables.forEach((t, g) => t.list.slice(0, k).forEach((uid, pos) => { (tiers[pos] = tiers[pos] || []).push({ uid, s: t.stats[uid] }); groupOf[uid] = g; }));
  const seeds = [];
  for (const tier of tiers) {
    tier.sort((a, b) => b.s.pts - a.s.pts || (b.s.gw - b.s.gl) - (a.s.gw - a.s.gl) || b.s.gw - a.s.gw || seedOf(a.uid) - seedOf(b.uid));
    seeds.push(...tier.map((x) => x.uid));
  }
  return { seeds: seeds.length >= 2 ? seeds : tables.flatMap((t) => t.list).slice(0, 2), groupOf };
}

// ------------------------------------------------------------ Khởi tạo / tiến trình
/** Tạo vòng mới với danh sách hạt giống (thứ tự = hạt giống 1, 2, …). */
function buildStage(cfg, index, seeds, opts = {}) {
  const st = { type: cfg.type, cfg, index, key: `s${index}`, entrants: [...seeds], matches: {}, done: false };
  if (cfg.type === 'single') buildSingle(st, seeds, opts.groupOf);
  else if (cfg.type === 'double') buildDouble(st, seeds, opts.groupOf);
  else if (cfg.type === 'roundrobin') buildRoundRobin(st, seeds);
  else {
    st.rounds = [];
    st.cfg = { ...cfg, rounds: Math.max(1, Math.min(cfg.rounds, seeds.length % 2 ? seeds.length : seeds.length - 1)) };
    swissNextRound(st, opts.seedOf || ((u) => seeds.indexOf(u)), opts.isActive);
  }
  return st;
}

/** Trận đã sẵn sàng đấu (đủ 2 người thật, chưa xong; vòng tròn: đã xong các vòng trước của 2 người). */
function playable(st) {
  const out = [];
  for (const m of Object.values(st.matches)) {
    if (m.done || !real(m.a) || !real(m.b)) continue;
    if (st.type === 'roundrobin') {
      const earlier = Object.values(st.matches).some((x) => !x.done && x.round < m.round && x.group === m.group &&
        (x.a === m.a || x.b === m.a || x.a === m.b || x.b === m.b));
      if (earlier) continue;
    }
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
  tally, eliminated, isElim, real, swissPairs,
};
