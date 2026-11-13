/*
 * Giải offline – pool loại kép xếp tầng (kiểu EVO / giải đối kháng; chỉ mô phỏng thể thức): type 'pools', cfg.pool = cỡ pool
 * (8 / 16 / 32), cfg.out = số suất mỗi phía (1, 2, 4… – lũy thừa 2, ≤ cỡ / 4).
 *   - Người chơi chia kiểu rắn theo hạt giống vào các pool; mỗi pool là một nhánh thắng – thua (stages-elim.js – buildDouble)
 *     đấu tới khi nhánh thắng còn `out` người chưa thua và nhánh thua còn `out` người thua đúng 1 trận (các vòng sau và chung
 *     kết tổng bị cắt).
 *   - Suất đi tiếp: phía thắng (W) rồi phía thua (L) – mỗi phía theo thứ tự pool. Người phía L mang "đã thua 1 trận" sang giai
 *     đoạn sau (st.oneLife ở giai đoạn sau): ở nhánh thắng – thua, thua thêm một trận là bị loại ngay (stages-elim.js).
 * st.pools = [{ name, players, rounds: [[mã trận]] (nhánh thắng), lrounds: [[…]] (nhánh thua) }].
 */
'use strict';
const { real } = require('./stages-base.js');
const { buildDouble } = require('./stages-elim.js');

const SIZES = [8, 16, 32];
const groupName = (g) => (g < 26 ? String.fromCharCode(65 + g) : String(g + 1));

function normalize(c, last, { oddBo }) {
  const pool = SIZES.includes(Number(c.pool)) ? Number(c.pool) : 16;
  let out = Math.floor(Number(c.out)) || 2;
  out = Math.max(1, Math.min(pool / 4, 2 ** Math.floor(Math.log2(Math.max(1, out)))));
  return { type: 'pools', bestOf: oddBo(c.bestOf) || 3, pool, out, ...(last ? {} : { advance: 0 }) };
}

const poolCount = (cfg, n) => Math.max(1, Math.ceil(n / cfg.pool));
/** Lỗi cỡ: mỗi pool phải có hơn 2 × out người (để phía thua có người đi tiếp). */
function error(cfg, n) {
  if (cfg.type !== 'pools') return null;
  const P = poolCount(cfg, n);
  return Math.floor(n / P) < 4 * cfg.out ? { code: 'ot_pools_few', args: { n: 4 * cfg.out } } : null;
}

function build(st, seeds) {
  const P = poolCount(st.cfg, seeds.length), lists = Array.from({ length: P }, () => []);
  seeds.forEach((u, i) => { const r = Math.floor(i / P), c = i % P; lists[r % 2 ? P - 1 - c : c].push(u); });
  st.pools = lists.map((players, g) => {
    const tmp = { type: 'double', key: `${st.key}p${g}`, cfg: { type: 'double', bestOf: st.cfg.bestOf, gf: 'none', reset: false }, matches: {} };
    buildDouble(tmp, players);
    // Cắt: vòng nhánh thắng rw có đúng `out` trận (người thắng = suất W); nhánh thua tới vòng nhận người thua vòng rw
    const rw = tmp.rounds.findIndex((r) => r.length <= st.cfg.out);
    const rl = Math.max(0, 2 * rw - 1);
    const rounds = tmp.rounds.slice(0, rw + 1), lrounds = tmp.lrounds.slice(0, rl + 1);
    const keep = new Set([...rounds, ...lrounds].flat());
    for (const id of keep) {
      const m = tmp.matches[id];
      if (m.next && !keep.has(m.next.to)) m.next = null;
      if (m.loserTo && !keep.has(m.loserTo.to)) m.loserTo = null;
      m.pool = g;
      st.matches[id] = m;
    }
    return { name: groupName(g), players, rounds, lrounds };
  });
  st.groups = st.pools.map((p) => ({ name: p.name, players: p.players, rounds: [...p.rounds, ...p.lrounds] })); // xếp lịch (otour-sched.js)
}

/** Suất đi tiếp: { seeds: [W…, L…], groupOf, oneLife: [L…], side: { uid: 'W' | 'L' } }. */
function advancers(st) {
  const W = [], L = [], groupOf = {}, side = {};
  st.pools.forEach((p, g) => {
    for (const id of p.rounds[p.rounds.length - 1]) { const m = st.matches[id]; if (m.done && real(m.winner)) { W.push(m.winner); groupOf[m.winner] = g; side[m.winner] = 'W'; } }
    for (const id of p.lrounds[p.lrounds.length - 1] || []) { const m = st.matches[id]; if (m.done && real(m.winner)) { L.push(m.winner); groupOf[m.winner] = g; side[m.winner] = 'L'; } }
  });
  return { seeds: [...W, ...L], groupOf, oneLife: L, side };
}
const podium = (st) => advancers(st).seeds.slice(0, 3);

/** Phần gửi trình duyệt: từng pool (nhánh thắng, nhánh thua) + danh sách suất W / L đã có. */
function view(st, { M, side }) {
  const a = advancers(st);
  return {
    groups: st.pools.map((p) => ({ name: p.name, rounds: [...p.rounds, ...p.lrounds].map((r) => r.map(M)), wb: p.rounds.length, table: [] })),
    qual: a.seeds.map((u) => ({ ...side(u), side: a.side[u] })),
  };
}

module.exports = { SIZES, normalize, error, build, advancers, podium, view, linked: true, selfMark: true, midOnly: true, sched: 'groups' };
