/*
 * Giải đấu Offline – dựng mùa giải kiểu nhà nghề Mỹ (vòng tròn có season – cấu hình và cách tính ở caro/otour-season.js):
 * mỗi miền là một "bảng" (bảng xếp hạng riêng, đi tiếp theo miền), trong miền chia bảng con. Trận giữa hai miền được
 * tính cho cả hai bảng xếp hạng (tally đếm mọi trận của giai đoạn) và nằm ở danh sách trận của miền có đội sân nhà.
 *   buildSeason(st, seeds, rnd)  – dựng st.groups (kèm divs) + st.matches; các lượt đấu dùng chung chỉ số giữa các miền.
 *   seasonPairs(seeds, info, rnd) – danh sách cặp [sân nhà, sân khách] (mỗi lần gặp một cặp) – dùng cho bài thử.
 */
'use strict';
const { newMatch } = require('./stages-base.js');
const SS = require('../../../caro/otour-season.js');
const { scheduleRounds } = require('./stages-league.js');

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Các cặp "gặp thêm" ở một mức: parts = D mảng đội bằng nhau (hai đội cùng mảng không gặp nhau), mỗi đội đúng d cặp. */
function extraEdges(parts, d, rnd) {
  if (!d) return [];
  const D = parts.length, h = parts[0].length;
  const plan = SS.regularPlan(D * h, D, d);
  if (!plan) throw new Error('season: không dựng được');
  const sh = parts.map((p) => shuffle([...p], rnd)); // đổi ngẫu nhiên ai gặp thêm ai
  const out = [];
  if (plan.kind === 'bip') {
    const [A, B] = sh;
    for (const o of plan.steps) for (let i = 0; i < h; i++) out.push([A[i], B[(i + o) % h]]);
    return out;
  }
  // Xếp xen kẽ: vị trí p = ô * D + phần → hai đội cùng phần luôn cách nhau bội số của D
  const pos = [];
  for (let i = 0; i < h; i++) for (let j = 0; j < D; j++) pos.push(sh[j][i]);
  const N = pos.length;
  for (const o of plan.steps) {
    if (o * 2 === N) for (let p = 0; p < N / 2; p++) out.push([pos[p], pos[p + o]]);
    else for (let p = 0; p < N; p++) out.push([pos[p], pos[(p + o) % N]]);
  }
  return out;
}

/** Cơ cấu miền / bảng con theo thứ tự hạt giống: miền c = confSize đội liên tiếp, chia tiếp thành divs bảng con. */
function structure(seeds, info) {
  const confs = [];
  for (let c = 0; c < info.confs; c++) {
    const conf = seeds.slice(c * info.confSize, (c + 1) * info.confSize);
    confs.push(Array.from({ length: info.divs }, (_, d) => conf.slice(d * info.divSize, (d + 1) * info.divSize)));
  }
  return confs;
}

/**
 * Mọi lần gặp nhau [sân nhà, sân khách]. Số lần gặp mỗi cặp = m của mức + 1 nếu là cặp "gặp thêm"; sân nhà chia đều,
 * số lần lẻ thì lần dư cho đội đang ít trận sân nhà hơn (xét các cặp theo thứ tự ngẫu nhiên).
 */
function seasonPairs(seeds, info, rnd = Math.random) {
  const confs = structure(seeds, info);
  const where = new Map(); // đội → [miền, bảng con]
  confs.forEach((divs, c) => divs.forEach((d, j) => d.forEach((u) => where.set(u, [c, j]))));
  const level = (a, b) => {
    const [ca, da] = where.get(a), [cb, db] = where.get(b);
    return ca !== cb ? 'inter' : da !== db ? 'conf' : 'div';
  };
  const key = (a, b) => (a < b ? a + '\n' + b : b + '\n' + a);
  const times = new Map();
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const m = info.levels[level(seeds[i], seeds[j])].m;
      if (m) times.set(key(seeds[i], seeds[j]), m);
    }
  }
  const add = (a, b) => times.set(key(a, b), (times.get(key(a, b)) || 0) + 1);
  // Gặp thêm: cùng bảng con (trong từng bảng con), cùng miền (giữa các bảng con của miền), khác miền (giữa các miền)
  for (const divs of confs) {
    // Trong một bảng con: một "phần" duy nhất (D = 1) – vòng xoay trên chính bảng con
    if (info.levels.div.x) for (const d of divs) for (const [a, b] of extraEdges([d], info.levels.div.x, rnd)) add(a, b);
    if (info.levels.conf.x && divs.length > 1) for (const [a, b] of extraEdges(divs, info.levels.conf.x, rnd)) add(a, b);
  }
  if (info.levels.inter.x && confs.length > 1) for (const [a, b] of extraEdges(confs.map((divs) => divs.flat()), info.levels.inter.x, rnd)) add(a, b);
  // Lần gặp chẵn: chia đôi sân nhà. Lần lẻ (một lần dư mỗi cặp): định hướng theo chu trình Euler để mỗi đội có số
  // trận sân nhà và sân khách lệch nhau tối đa 1 (giải thật: NBA 41 / 41, MLB 81 / 81)
  const out = [], odd = [];
  for (const k of shuffle([...times.keys()], rnd)) {
    const [a, b] = k.split('\n'), t = times.get(k);
    for (let i = 0; i < Math.floor(t / 2); i++) out.push([a, b], [b, a]);
    if (t % 2) odd.push(rnd() < 0.5 ? [a, b] : [b, a]);
  }
  return out.concat(eulerOrient(odd));
}

/**
 * Định hướng các cạnh (cặp) sao cho mỗi đỉnh có số cạnh ra / vào lệch nhau tối đa 1: nối các đỉnh bậc lẻ với một đỉnh
 * giả, đi chu trình Euler (Hierholzer) và lấy chiều đi làm chiều sân nhà → sân khách; bỏ các cạnh nối đỉnh giả.
 */
function eulerOrient(edges) {
  const FAKE = '\u0000';
  const adj = new Map(), deg = new Map();
  const list = edges.map(([a, b]) => ({ a, b, used: false }));
  const link = (e) => { for (const v of [e.a, e.b]) { if (!adj.has(v)) adj.set(v, []); adj.get(v).push(e); deg.set(v, (deg.get(v) || 0) + 1); } };
  list.forEach(link);
  for (const [v, d] of [...deg]) if (d % 2) { const e = { a: v, b: FAKE, used: false }; list.push(e); link(e); }
  const out = [], ptr = new Map();
  for (const start of adj.keys()) {
    const stack = [[start, null]];
    while (stack.length) {
      const [v] = stack[stack.length - 1];
      const es = adj.get(v);
      let i = ptr.get(v) || 0;
      while (i < es.length && es[i].used) i++;
      ptr.set(v, i);
      if (i === es.length) {
        const [, e] = stack.pop();
        if (e && e.a !== FAKE && e.b !== FAKE) out.push(e.dir);
        continue;
      }
      const e = es[i];
      e.used = true;
      const w = e.a === v ? e.b : e.a;
      e.dir = [w, v]; // đi v → w; khi rút khỏi ngăn xếp chu trình đảo chiều, nên ghi [w, v] để giữ cùng một chiều đi
      stack.push([w, e]);
    }
  }
  return out;
}

/** Dựng giai đoạn mùa giải vào st (st.cfg.season đã chuẩn hoá; số đội không khớp thì gộp thành một miền, một bảng con). */
function buildSeason(st, seeds, rnd = Math.random) {
  let info = SS.seasonInfo(st.cfg.season, seeds.length);
  if (info.error) info = SS.seasonInfo({ confs: 1, divs: 1, div: { m: 2 } }, seeds.length); // đi tiếp lệch dự tính: vòng tròn 2 lượt
  const confs = structure(seeds, info);
  const confOf = new Map();
  confs.forEach((divs, c) => divs.flat().forEach((u) => confOf.set(u, c)));
  const name = (c) => String.fromCharCode(65 + c);
  st.groups = confs.map((divs, c) => ({ name: name(c), players: divs.flat(), divs: info.divs > 1 ? divs : null, rounds: [] }));
  const rounds = scheduleRounds(seasonPairs(seeds, info, rnd), rnd);
  rounds.forEach((pairs, r) => {
    for (const g of st.groups) g.rounds[r] = [];
    pairs.forEach(([x, y], i) => {
      const g = confOf.get(x);
      const m = newMatch(`${st.key}g${g}r${r}m${i}`, r, { group: g });
      m.a = x;
      m.b = y;
      st.matches[m.id] = m;
      st.groups[g].rounds[r].push(m.id);
    });
  });
  st.season = { perTeam: info.perTeam, confs: info.confs, divs: info.divs }; // thông tin hiển thị
}

module.exports = { buildSeason, seasonPairs, extraEdges, eulerOrient };
