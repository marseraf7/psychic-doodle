/*
 * Hệ Race – cách tính 'backyard' (Backyard Ultra – chỉ mô phỏng thể thức). Mỗi giờ một vòng (yard, mặc định 6,706 km); ai không
 * về kịp trong giờ là dừng. Mỗi chặng là một yard: ban tổ chức đánh dấu người hoàn thành (done) / không hoàn thành; chặng sau
 * tự thêm khi yard trước xong và còn ít nhất 2 người.
 *   – Chỉ còn đúng 1 người hoàn thành yard: người đó phải chạy thêm 1 yard một mình – hoàn thành thì vô địch, không thì không
 *     có nhà vô địch (mọi người còn lại đều DNF).
 *   – Cả yard không ai hoàn thành: không có nhà vô địch.
 * Thứ hạng: vô địch, rồi số yard hoàn thành (nhiều xếp trên); bằng nhau theo hạt giống (cùng hạng hiển thị như nhau).
 * st.backyard = { status: 'running' | 'champion' | 'none', winner }. Nhập / huỷ lần lượt từng yard. Đăng ký vào stages-race-plug.js.
 */
'use strict';

const MAX_YARDS = 300;
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

function normalize(c, out) {
  const b = c.backyard && typeof c.backyard === 'object' ? c.backyard : {};
  out.events = 1;
  out.backyard = { m: int(b.m, 100, 100000, 6706), min: int(b.min, 10, 180, 60) }; // độ dài yard (mét), thời gian mỗi yard (phút)
}

/** Số yard hoàn thành của từng người + người còn chạy trước yard i. */
function calc(st, seedOf = () => 0) {
  const yards = Object.fromEntries(st.entrants.map((u) => [u, 0]));
  let alive = [...st.entrants], status = 'running', winner = null;
  for (const ev of st.events) {
    if (!ev.done) break;
    const fin = new Set(ev.rows.filter((x) => x.done).map((x) => x.uid));
    const next = alive.filter((u) => fin.has(u));
    for (const u of next) yards[u]++;
    if (alive.length === 1) { status = next.length ? 'champion' : 'none'; winner = next.length ? next[0] : null; alive = []; break; } // yard chạy một mình
    if (!next.length) { status = 'none'; alive = []; break; } // cả yard không ai về kịp
    alive = next;
  }
  const order = [...st.entrants].sort((a, b) => (b === winner) - (a === winner) || yards[b] - yards[a] || seedOf(a) - seedOf(b));
  return { yards, alive, status, winner, order };
}

function clean(st, i, rows) {
  const C = calc({ ...st, events: st.events.filter((e) => e.i < i) });
  if (!Array.isArray(rows) || !rows.length) return { code: 'tour_score_bad' };
  const ok = new Set(C.alive), seen = new Set(), out = [];
  for (const r of rows) {
    const uid = r && String(r.uid);
    if (!ok.has(uid) || seen.has(uid)) return { code: 'tour_score_bad' };
    seen.add(uid);
    out.push({ uid, done: r.done === true });
  }
  // Người còn chạy không có dòng: coi như không hoàn thành
  for (const u of C.alive) if (!seen.has(u)) out.push({ uid: u, done: false });
  return { rows: out };
}

function record(st, i, rows) {
  const ev = st.events[i];
  ev.rows = rows;
  ev.done = true;
  const C = calc(st);
  st.backyard = { status: C.status, winner: C.winner };
  st.done = C.status !== 'running';
  if (!st.done && i === st.events.length - 1 && st.events.length < MAX_YARDS) st.events.push({ i: i + 1, done: false, rows: null }); // yard kế tiếp
  return st.done;
}

/** Huỷ yard i (chỉ yard nhập sau cùng): bỏ các yard chưa đấu phía sau. */
function undo(st, i) {
  st.events.length = i + 1;
  Object.assign(st.events[i], { done: false, rows: null });
  st.backyard = { status: 'running', winner: null };
  st.done = false;
}

function table(st, seedOf) { const C = calc(st, seedOf); return { list: C.order, stats: Object.fromEntries(st.entrants.map((u) => [u, { uid: u, yards: C.yards[u] }])) }; }

function view(st, i, adv, side, seedOf) {
  const C = calc(st, seedOf), alive = new Set(C.alive), Y = st.cfg.backyard;
  let prev = null, pos = 0;
  const rows = C.order.map((u, k) => {
    const key = u === C.winner ? -1 : C.yards[u];
    if (key !== prev) { pos = k + 1; prev = key; }
    return { ...side(u), rank: pos, yards: C.yards[u], km: Math.round(C.yards[u] * Y.m / 10) / 100, ...(alive.has(u) ? { alive: true } : {}), ...(u === C.winner ? { champ: true } : {}), adv: k < adv };
  });
  const events = st.events.map((e) => ({ i: e.i, done: e.done, ...(e.rows ? { rows: e.rows } : {}) }));
  return { index: i, type: 'race', cfg: st.cfg, done: st.done, events, table: rows, backyard: { status: C.status, alive: C.alive.map(side), solo: C.alive.length === 1 }, entrants: st.entrants.map(side) };
}

module.exports = { MAX_YARDS, normalize, calc, clean, record, undo, plug: { normalize, clean, record, undo, table, view } };
