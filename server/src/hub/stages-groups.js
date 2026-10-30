/*
 * Thể thức thi đấu – vòng tròn (chia bảng, gặp nhau 1–3 lần), hệ Thụy Sĩ (ghép cùng điểm, không gặp lại),
 * bảng xếp hạng từng bảng và người đi tiếp sang vòng sau (bảng điểm + tie-break: stages-tiebreak.js).
 * Dùng bởi stages.js.
 */
'use strict';
const { BYE, MAX_GROUP, MAX_GROUPS, real, newMatch } = require('./stages-base.js');
const { tally, rankList, crossCompare } = require('./stages-tiebreak.js');

// ------------------------------------------------------------ Vòng tròn
/** Tên bảng: A..Z, rồi AA, AB… */
const groupName = (g) => (g < 26 ? '' : String.fromCharCode(64 + Math.floor(g / 26))) + String.fromCharCode(65 + (g % 26));

/** Số bảng cho n người: theo cấu hình, nhưng không bảng nào quá MAX_GROUP người và mỗi bảng ít nhất 2 người. */
function groupCount(cfg, n) {
  let G = cfg.groupSize ? Math.ceil(n / cfg.groupSize) : cfg.groups || 1;
  G = Math.max(G, Math.ceil(n / MAX_GROUP));
  return Math.max(1, Math.min(G, Math.floor(n / 2), MAX_GROUPS));
}

/**
 * Chia người vào các bảng (mảng các mảng mã người chơi).
 * Không có plan: chia kiểu "rắn" theo hạt giống (1..G vào A..cuối, rồi đảo chiều).
 * plan: ban tổ chức tự xếp (mảng các bảng). Người không còn trong giải bị bỏ ra; người chưa được xếp vào
 * bảng ít người nhất (theo thứ tự hạt giống); bảng chỉ còn 0–1 người bị gộp vào bảng khác.
 */
function drawGroups(cfg, seeds, plan) {
  if (!Array.isArray(plan) || !plan.length) {
    const G = groupCount(cfg, seeds.length);
    const groups = Array.from({ length: G }, () => []);
    seeds.forEach((uid, i) => {
      const row = Math.floor(i / G), col = i % G;
      groups[row % 2 ? G - 1 - col : col].push(uid);
    });
    return groups;
  }
  const inTour = new Set(seeds);
  const seen = new Set();
  let groups = plan.slice(0, MAX_GROUPS).map((g) => (Array.isArray(g) ? g : []).filter((u) => inTour.has(u) && !seen.has(u) && seen.add(u)));
  const smallest = () => groups.reduce((best, g) => (g.length < best.length ? g : best), groups[0]);
  for (const uid of seeds) if (!seen.has(uid)) smallest().push(uid);
  // Bảng quá ít người: dồn sang bảng khác (giữ thứ tự hạt giống)
  for (;;) {
    const small = groups.find((g) => g.length < 2);
    if (!small || groups.length < 2) break;
    groups = groups.filter((g) => g !== small);
    for (const uid of small) smallest().push(uid);
  }
  const rank = new Map(seeds.map((u, i) => [u, i]));
  return groups.filter((g) => g.length).map((g) => g.sort((x, y) => rank.get(x) - rank.get(y)));
}

function buildRoundRobin(st, seeds, plan) {
  st.groups = drawGroups(st.cfg, seeds, plan).map((players, g) => ({ name: groupName(g), players, rounds: [] }));
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
    // Gặp nhau 2–3 lần: lượt về đổi bên đi trước, lượt thứ ba như lượt đi
    const back = base.map((ps) => ps.map(([x, y]) => [y, x]));
    const all = st.cfg.meetings === 3 ? [...base, ...back, ...base] : st.cfg.meetings === 2 ? [...base, ...back] : base;
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
  // Giới hạn số bước tìm (mô phỏng 30–36 người, 15 vòng: cần tới ~10⁶ bước, chậm nhất ~0,1 giây)
  let budget = 1000000;
  // Ghép từ trên xuống, ưu tiên người gần điểm nhất; allow = số cặp gặp lại còn được phép
  const dfs = (rest, allow) => {
    if (!rest.length) return [];
    if (--budget < 0) return null;
    const [a, ...others] = rest;
    for (let i = 0; i < others.length; i++) {
      const again = played.has(key(a, others[i]));
      if (again && !allow) continue;
      const sub = dfs(others.filter((_, j) => j !== i), allow - (again ? 1 : 0));
      if (sub) return [[a, others[i]], ...sub];
    }
    return null;
  };
  let pairs = dfs(list, 0);
  // Không tránh được gặp lại: cho phép ít cặp gặp lại nhất có thể (1, 2, …)
  for (let allow = 1; !pairs && allow <= list.length / 2; allow++) { budget = 20000; pairs = dfs(list, allow); }
  if (!pairs) { // hết thời gian tìm: ghép lần lượt theo thứ hạng
    pairs = [];
    for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
  }
  return { pairs, bye };
}

function swissNextRound(st, seedOf, isActive = () => true, fixed = null) {
  const r = st.rounds.length;
  const stats = tally(st);
  // Người đã rút không được ghép nữa (vẫn còn trong bảng xếp hạng)
  const order = st.entrants.filter(isActive).sort((a, b) => stats[b].pts - stats[a].pts || seedOf(a) - seedOf(b));
  const played = new Set();
  for (const m of Object.values(st.matches)) if (real(m.a) && real(m.b)) played.add(m.a < m.b ? m.a + '|' + m.b : m.b + '|' + m.a);
  const byes = {};
  for (const m of Object.values(st.matches)) if (m.bye && real(m.winner)) byes[m.winner] = (byes[m.winner] || 0) + 1;
  // Cặp cố định (giao hữu CLB: bàn 1 gặp bàn 1…) chỉ cho vòng đầu
  const { pairs, bye } = fixed && r === 0 ? { pairs: fixed, bye: null } : swissPairs(order, played, byes);
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

// ------------------------------------------------------------ Bảng điểm (tally, rankList: stages-tiebreak.js)
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
    tier.sort(crossCompare(st, seedOf));
    seeds.push(...tier.map((x) => x.uid));
  }
  return { seeds: seeds.length >= 2 ? seeds : tables.flatMap((t) => t.list).slice(0, 2), groupOf };
}

/**
 * Số vòng Thụy Sĩ tối đa cho n người. Đánh gần hết n-1 vòng thì thường không còn cách ghép nào tránh gặp lại
 * (mô phỏng: 5–6 người gặp lại từ vòng 4, 8 người từ vòng 6), nên giới hạn khoảng một nửa số người.
 * Riêng 3–4 người thì đánh đủ (mọi người gặp nhau) luôn ghép được.
 */
function swissMaxRounds(n) {
  if (n <= 4) return Math.max(1, n % 2 ? n : n - 1);
  return Math.ceil(n / 2);
}

module.exports = { groupCount, drawGroups, buildRoundRobin, swissPairs, swissNextRound, tally, standings, advancers, swissMaxRounds };
