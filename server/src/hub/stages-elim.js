/*
 * Thể thức thi đấu – loại trực tiếp (single, tuỳ chọn tranh hạng 3) và nhánh thắng / nhánh thua (double, chung kết
 * tổng, tuỳ chọn "reset"): dựng nhánh đấu, xếp hạt giống, tự xử trận miễn đấu, chuyển người thắng / thua.
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

module.exports = { seedOrder, resolveElim, buildSingle, buildDouble };
