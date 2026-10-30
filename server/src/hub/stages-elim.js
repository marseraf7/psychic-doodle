/*
 * Thể thức thi đấu – loại trực tiếp (single: tranh hạng 3, hoặc trận xếp hạng mọi vị trí) và nhánh thắng / nhánh
 * thua (double: chung kết tổng 1–2 trận / 1 trận / không có; "split": nửa dưới hạt giống bắt đầu ở nhánh thua):
 * dựng nhánh đấu, xếp hạt giống, tự xử trận miễn đấu, chuyển người thắng / thua.
 * Dùng bởi stages.js.
 */
'use strict';
const { BYE, real, newMatch } = require('./stages-base.js');

function seedOrder(size) {
  let o = [1];
  while (o.length < size) {
    const n = o.length * 2;
    o = o.flatMap((s) => [s, n + 1 - s]);
  }
  return o;
}
const pow2 = (n) => { let s = 2; while (s < n) s *= 2; return s; };

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

/**
 * Các cặp vòng 1. placeBy 'seed' (luật hạt giống: 1 gặp cuối, ô trống cho hạt giống cao); 'list' (như "The Order of the
 * Participants List" của Challonge): ghép lần lượt theo danh sách 1–2, 3–4…, ô trống (miễn đấu) dồn về các cặp cuối.
 */
function firstRound(seeds, size, groupOf, placeBy) {
  const pairs = [];
  if (placeBy === 'list') {
    const full = seeds.length - size / 2; // số cặp đủ hai người
    let k = 0;
    for (let i = 0; i < size / 2; i++) pairs.push(i < full ? [seeds[k++], seeds[k++]] : [seeds[k++] || BYE, BYE]);
    return pairs;
  }
  const order = seedOrder(size);
  for (let i = 0; i < size / 2; i++) pairs.push([seeds[order[2 * i] - 1] || BYE, seeds[order[2 * i + 1] - 1] || BYE]);
  avoidSameGroup(pairs, groupOf);
  return pairs;
}

/**
 * Trận xếp hạng (như "Break ties with placement matches" của Challonge): người thua các trận feeders (theo thứ tự)
 * đấu một nhánh loại trực tiếp riêng để phân hạng base … base + n − 1; người thua từng vòng của nhánh này lại đấu
 * tiếp để phân các hạng sau. Chung kết của nhánh base = 3 chính là trận tranh hạng ba.
 * want(lo, k): có hạng nào ban tổ chức chọn phân định trong [lo, lo + k − 1] không (cfg.places – chọn từng cặp hạng
 * 3–4, 5–6, 7–8…). Vòng r của nhánh chỉ được tạo khi còn hạng cần phân trong phần người thắng [base, base + n/2^r − 1];
 * không cần thì những người còn lại đồng hạng (vd. chỉ chọn 7–8: đấu bán kết nhánh 5–8, hai người thắng đồng hạng 5).
 */
function placement(st, feeders, base, round0, want) {
  const n = feeders.length;
  if (n < 2 || !want(base, n)) return;
  const R = Math.log2(n);
  let K = 0; // số vòng thật sự tạo
  while (K < R && want(base, n >> K)) K++;
  const id = (r, i) => `${st.key}p${base}r${r}m${i}`;
  const rounds = [];
  for (let r = 0; r < K; r++) {
    const ids = [];
    for (let i = 0; i < n >> (r + 1); i++) {
      const m = newMatch(id(r, i), round0 + r, { place: base });
      if (r < K - 1) m.next = { to: id(r + 1, i >> 1), slot: i % 2 ? 'b' : 'a' };
      if (base === 3) m.third = true;
      st.matches[m.id] = m;
      ids.push(m.id);
    }
    rounds.push(ids);
  }
  feeders.forEach((f, i) => { st.matches[f].loserTo = { to: id(0, i >> 1), slot: i % 2 ? 'b' : 'a' }; });
  if (base === 3) st.third = id(R - 1, 0);
  else st.places.push({ base, n, rounds });
  for (let r = 0; r < K && r < R - 1; r++) placement(st, rounds[r], base + (n >> (r + 1)), round0 + r + 1, want);
}

/** Hàm want cho cấu hình: mọi vị trí (placement), các cặp hạng đã chọn (places), hoặc chỉ tranh hạng ba. */
function placeWanted(cfg) {
  if (cfg.placement) return () => true;
  const list = Array.isArray(cfg.places) ? cfg.places : cfg.thirdPlace ? [3] : [];
  return (lo, k) => list.some((p) => p >= lo && p < lo + k);
}

function buildSingle(st, seeds, groupOf, placeBy) {
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
  const want = placeWanted(st.cfg);
  if (size >= 4 && (st.cfg.placement || (st.cfg.places || []).some((p) => p > 3))) {
    // Người thua vòng r (size / 2^(r+1) người) tranh các hạng sau những người còn đi tiếp
    st.places = [];
    for (let r = 0; r < R - 1; r++) placement(st, st.rounds[r], (size >> (r + 1)) + 1, r + 1, want);
  } else if (st.cfg.thirdPlace && size >= 4) {
    const t = newMatch(`${st.key}third`, R - 1, { third: true });
    st.matches[t.id] = t;
    st.third = t.id;
    st.rounds[R - 2].forEach((mid, i) => { st.matches[mid].loserTo = { to: t.id, slot: i % 2 ? 'b' : 'a' }; });
  }
  const events = [];
  firstRound(seeds, size, groupOf, placeBy).forEach(([a, b], i) => {
    const m = st.matches[id(0, i)];
    m.a = a;
    m.b = b;
  });
  for (const mid of st.rounds[0]) autoBye(st, st.matches[mid], events);
}

function buildDouble(st, seeds, groupOf, placeBy) {
  const size = pow2(Math.max(4, seeds.length));
  const k = Math.log2(size);
  const W = (r, i) => `${st.key}w${r}m${i}`;
  const L = (j, i) => `${st.key}l${j}m${i}`;
  st.rounds = [];
  st.lrounds = [];
  st.gf = [];
  // Không có chung kết tổng (gf 'none'): vô địch nhánh thắng nhất, vô địch nhánh thua nhì
  const noGf = st.cfg.gf === 'none';
  const gf1 = noGf ? null : newMatch(`${st.key}gf1`, k, { gf: 1 });
  if (gf1) { st.matches[gf1.id] = gf1; st.gf.push(gf1.id); }
  if (gf1 && st.cfg.reset) {
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
      if (j === nL - 1) { if (gf1) m.next = { to: gf1.id, slot: 'b' }; }
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
      if (r < k - 1) m.next = { to: W(r + 1, i >> 1), slot: i % 2 ? 'b' : 'a' };
      else if (gf1) m.next = { to: gf1.id, slot: 'a' };
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
  firstRound(seeds, size, groupOf, placeBy).forEach(([a, b], i) => {
    const m = st.matches[W(0, i)];
    m.a = a;
    m.b = b;
    // Split (như Challonge): nửa trên hạt giống vào thẳng vòng 2 nhánh thắng, nửa dưới bắt đầu ở nhánh thua –
    // trận vòng 1 nhánh thắng không đấu, tự xử hạt giống cao hơn đi tiếp, hạt giống thấp xuống nhánh thua
    if (st.cfg.split && real(a) && real(b)) { m.split = true; resolveElim(st, m, a, b, events); }
  });
  for (const mid of st.rounds[0]) autoBye(st, st.matches[mid], events);
}

module.exports = { seedOrder, resolveElim, buildSingle, buildDouble, placeWanted };
