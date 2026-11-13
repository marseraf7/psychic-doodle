/*
 * Giải offline – giai đoạn "loại trực tiếp dựng từng vòng" (type 'knock' – chỉ mô phỏng thể thức). Không có cây cố định: xong
 * một vòng mới ghép vòng sau trong số người còn lại. cfg.mode:
 *   'shootout' – kiểu Snooker Shoot Out: mỗi vòng bốc thăm lại ngẫu nhiên (máy chủ giữ hạt giống bốc thăm, lưu từng lần bốc);
 *   'bounty'   – kiểu BLAST Bounty: mỗi đội có tiền thưởng trên đầu (bounty) và quỹ đã nhận (bank – stages-bounty.js). Mỗi vòng
 *                chia hai nồi theo hạt giống; đội nồi dưới (giỏi nhất trước) chọn đối thủ ở nồi trên – mặc định chọn hạt giống
 *                gần nhất, ban tổ chức đổi được bằng otKnockPick trước khi vòng có kết quả.
 * Số người lẻ: người cuối (shootout: người không được bốc) đi tiếp không đấu. Trận nối như loại trực tiếp (linked) nhưng không
 * có next – vòng sau dựng ở after(); huỷ kết quả chỉ ở vòng cuối, vòng sau chưa đấu thì xoá đi dựng lại.
 * Đăng ký vào registry loại giai đoạn (stages-kinds.js).
 */
'use strict';
const { real, newMatch } = require('./stages-base.js');
const BT = require('./stages-bounty.js');

const MODES = ['shootout', 'bounty'];

function normalize(c, last, { oddBo }) {
  const out = { type: 'knock', mode: MODES.includes(c.mode) ? c.mode : 'shootout', bestOf: oddBo(c.bestOf) || 1 };
  if (out.mode === 'bounty') out.bounty = BT.normalize(c.bounty);
  if (!last) out.advance = Math.max(1, Math.min(8, Math.floor(Number(c.advance)) || 1));
  return out;
}

const error = (cfg, n) => (cfg.type === 'knock' && n < 2 ? { code: 'ot_knock_few', args: { n: 2 } } : null);

/** Bộ sinh số ngẫu nhiên có hạt giống (LCG) – lưu trạng thái trong st để bốc thăm tái lập được. */
function rand(st) {
  st.rng = (Math.imul(st.rng >>> 0, 1664525) + 1013904223) >>> 0;
  return st.rng / 4294967296;
}

/** Hạt giống hiện tại (bounty 'inherit': đội thắng nhận hạt giống tốt hơn của hai đội). */
const seedNow = (st, u) => (st.seedNow && st.seedNow[u]) || st.seed0[u];

/** Ghép vòng mới trong số người còn lại. */
function newRound(st) {
  const alive = st.alive;
  if (alive.length < 2) return;
  const r = st.rounds.length, ids = [];
  let pairs = [], bye = null;
  if (st.cfg.mode === 'shootout') {
    const pool = [...alive];
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(rand(st) * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
    if (pool.length % 2) bye = pool.pop();
    for (let k = 0; k < pool.length; k += 2) pairs.push([pool[k], pool[k + 1]]);
  } else {
    const order = [...alive].sort((a, b) => seedNow(st, a) - seedNow(st, b));
    if (order.length % 2) bye = order.shift(); // số đội lẻ: hạt giống cao nhất đi tiếp
    const half = order.length / 2, high = order.slice(0, half), low = order.slice(half);
    // Nồi dưới chọn theo thứ tự hạt giống tốt nhất trước; mặc định chọn hạt giống gần nhất còn lại ở nồi trên
    const left = [...high];
    pairs = low.map((p) => [left.pop(), p]);
  }
  pairs.forEach(([a, b], k) => {
    const m = newMatch(`${st.key}k${r}_${k}`, r, {});
    m.a = a; m.b = b;
    if (alive.length === 2) m.final = true;
    st.matches[m.id] = m;
    ids.push(m.id);
  });
  st.rounds.push(ids);
  st.byes.push(bye);
  st.draws.push(pairs.map((p) => [...p])); // lưu lần bốc / ghép của vòng
}

function build(st, seeds) {
  st.rounds = [];
  st.byes = [];
  st.draws = [];
  st.seed0 = Object.fromEntries(seeds.map((u, k) => [u, k + 1]));
  st.alive = [...seeds];
  st.rng = (Math.floor(Math.random() * 4294967296) >>> 0) || 1;
  st.rng0 = st.rng; // hạt giống bốc thăm ban đầu (công khai sau khi xong giải)
  if (st.cfg.mode === 'bounty') BT.init(st, seeds);
  newRound(st);
}

/** Xong một trận: cập nhật bounty; xong cả vòng thì dựng vòng sau. */
function after(st) {
  const r = st.rounds.length - 1, cur = st.rounds[r].map((id) => st.matches[id]);
  if (!cur.every((m) => m.done)) return;
  st.alive = [...cur.map((m) => m.winner), ...(st.byes[r] ? [st.byes[r]] : [])];
  if (st.cfg.mode === 'bounty') {
    if (st.cfg.bounty.seeding === 'inherit') {
      st.seedNow = st.seedNow || {};
      for (const m of cur) st.seedNow[m.winner] = Math.min(seedNow(st, m.winner), seedNow(st, m.loser));
    }
  }
  newRound(st);
}

/** Đổi đối thủ (bounty): đội `picker` (nồi dưới) chọn `target` (nồi trên) – chỉ khi vòng hiện tại chưa có kết quả. */
function pick(st, picker, target) {
  const r = st.rounds.length - 1, cur = st.rounds[r].map((id) => st.matches[id]);
  if (st.cfg.mode !== 'bounty' || cur.some((m) => m.done)) return 'ot_knock_pick_locked';
  const mp = cur.find((m) => m.b === picker), mt = cur.find((m) => m.a === target);
  if (!mp || !mt) return 'ot_knock_pick_bad';
  [mp.a, mt.a] = [mt.a, mp.a];
  st.draws[r] = cur.map((m) => [m.a, m.b]);
  return null;
}

/** Trước khi huỷ trận m: chỉ ở vòng cuối, hoặc vòng sau chưa có kết quả (xoá vòng sau). */
function beforeUndo(st, m) {
  const r = m.round, last = st.rounds.length - 1;
  if (r === last) return true;
  if (r !== last - 1 || st.rounds[last].some((id) => st.matches[id].done)) return false;
  for (const id of st.rounds[last]) delete st.matches[id];
  st.rounds.pop();
  st.byes.pop();
  st.draws.pop();
  st.alive = [...st.rounds[r].map((id) => st.matches[id]).filter((x) => x !== m).map((x) => x.winner), m.a, m.b, ...(st.byes[r] ? [st.byes[r]] : [])].filter(Boolean);
  if (st.seedNow) for (const x of st.rounds[r].map((id) => st.matches[id])) delete st.seedNow[x.winner];
  return true;
}

/** Thứ hạng: vô địch 1, á quân 2, thua vòng trước nữa đồng hạng (3, 5, 9…). */
function places(st, seedOf = () => 0) {
  const out = [], R = st.rounds.length;
  st.rounds.forEach((ids, r) => {
    const ms = ids.map((id) => st.matches[id]);
    for (const m of ms) {
      if (!m.done) continue;
      if (m.final) { out.push({ uid: m.winner, place: 1 }, { uid: m.loser, place: 2 }); continue; }
      // Người thua vòng r: hạng = số người còn lại sau vòng r + 1
      const left = ms.length + (st.byes[r] ? 1 : 0);
      out.push({ uid: m.loser, place: left + 1 });
    }
  });
  if (R && !out.some((x) => x.place === 1) && st.alive.length === 1) out.push({ uid: st.alive[0], place: 1 });
  return out.filter((x) => real(x.uid)).sort((a, b) => a.place - b.place || seedOf(a.uid) - seedOf(b.uid));
}

function advancers(st, seedOf) { return { seeds: places(st, seedOf).map((x) => x.uid).slice(0, Math.max(1, st.cfg.advance || 1)), groupOf: {} }; }
const podium = (st, seedOf) => places(st, seedOf).slice(0, 4).map((x) => x.uid);

function view(st, { M, side, seedOf }) {
  const rounds = st.rounds.map((ids) => ids.map((id) => ({ ...M(id), ...(st.matches[id].final ? { final: true } : {}) })));
  const table = places(st, seedOf).map((x) => ({ ...side(x.uid), place: x.place }));
  const v = { rounds, byes: st.byes.map((u) => (u ? side(u) : null)), table, mode: st.cfg.mode, ...(st.done ? { rng: st.rng0 } : {}) };
  if (st.cfg.mode === 'bounty') v.bounty = BT.view(st, side);
  return v;
}

module.exports = { MODES, normalize, error, build, after, pick, beforeUndo, places, advancers, podium, view, linked: true, selfMark: true, sched: 'rounds' };
