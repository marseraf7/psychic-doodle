/*
 * Giải offline – vòng tranh hạt giống + cơ hội cuối (kiểu "Group Kings / Last Chance" ở giải MOBA di động của các giải
 * Esports – chỉ mô phỏng thể thức). Giai đoạn giữa, thường đứng sau vòng bảng và trước loại trực tiếp:
 *   Nửa trên (các đội đầu bảng – thứ tự hạt giống vào giai đoạn): cao gặp thấp (1–4, 2–3…). Cả hai đội đều đi tiếp;
 *     đội thắng vào nhóm hạt giống 1, đội thua vào nhóm hạt giống 2.
 *   Nửa dưới (các đội xếp sau): cũng cao gặp thấp, Bo riêng (cfg.boLow); đội thắng vào nhóm hạt giống 2, đội thua bị loại.
 * Người đi tiếp: thắng nửa trên, thua nửa trên, thắng nửa dưới (mỗi nhóm theo hạt giống) = 3/4 số đội. Hai đội đã gặp nhau
 * ở nửa trên mang cùng "nhóm" (groupOf) để nhánh sau tránh gặp lại ngay vòng đầu. Không có hoà; trận không nối tới trận sau.
 * st.groups = [{ name: 'top', players, rounds: [[trận…]] }, { name: 'low', … }] – cùng hình dạng bảng vòng tròn để dùng
 * chung xếp lịch (otour-sched.js) và bản vá gửi trình duyệt (tourpush.js).
 */
'use strict';
const { real, newMatch } = require('./stages-base.js');

const MAX = 256;

/** Chuẩn hoá (stages.js gọi khi giải offline, giai đoạn giữa). boLow: Bo riêng của nửa dưới (0 = như nửa trên). */
function normalizeKings(c, oddBo) {
  const out = { type: 'kings', bestOf: oddBo(c.bestOf) || 3 };
  const lo = oddBo(c.boLow);
  if (lo && lo !== out.bestOf) out.boLow = lo;
  return out;
}

/** Lỗi cỡ giai đoạn (null nếu được): số đội chia hết cho 4 (mỗi nửa ghép cặp đủ), tối đa MAX. */
function kingsError(cfg, n) {
  if (cfg.type !== 'kings') return null;
  if (n % 4 || n < 4) return { code: 'ot_kings_four', args: { n } };
  return n > MAX ? { code: 'ot_kings_many', args: { n: MAX } } : null;
}

/** Số đội đi tiếp của n đội. */
const advanceOf = (n) => Math.floor(n / 4) * 3;

/** Dựng hai nửa: mỗi nửa cao gặp thấp theo thứ tự hạt giống vào giai đoạn. */
function buildKings(st, seeds) {
  const h = Math.floor(seeds.length / 4) * 2;
  st.groups = [seeds.slice(0, h), seeds.slice(h, 2 * h)].map((list, g) => {
    const ids = [];
    for (let k = 0; k < h / 2; k++) {
      const m = newMatch(`${st.key}k${g}m${k}`, 0, { grp: g, tag: g ? 'low' : 'top', ...(g && st.cfg.boLow ? { bo: st.cfg.boLow } : {}) });
      Object.assign(m, { a: list[k], b: list[h - 1 - k] });
      st.matches[m.id] = m;
      ids.push(m.id);
    }
    return { name: g ? 'low' : 'top', players: list, rounds: [ids] };
  });
}

/** Người đi tiếp theo tầng: [thắng nửa trên], [thua nửa trên], [thắng nửa dưới] – mỗi tầng theo hạt giống. */
function advancers(st, seedOf = () => 0) {
  const by = (x, y) => seedOf(x) - seedOf(y);
  const pick = (g, k) => st.groups[g].rounds[0].map((id) => st.matches[id]).filter((m) => m.done && real(m[k])).map((m) => m[k]).sort(by);
  const tiers = [pick(0, 'winner'), pick(0, 'loser'), pick(1, 'winner')];
  const groupOf = {};
  st.groups[0].rounds[0].forEach((id, k) => { const m = st.matches[id]; for (const u of [m.a, m.b]) if (real(u)) groupOf[u] = k; });
  return { seeds: tiers.flat(), groupOf, tiers };
}

/** Bảng cho người xem (mỗi nửa): thắng – thua, nhóm hạt giống khi đã có kết quả (pool 1 / 2), bị loại (out). */
function tables(st, side, seedOf = () => 0) {
  return st.groups.map((grp, g) => {
    const res = {};
    for (const id of grp.rounds[0]) {
      const m = st.matches[id];
      if (!m.done) continue;
      if (real(m.winner)) res[m.winner] = { w: 1, l: 0, pool: g ? 2 : 1 };
      if (real(m.loser)) res[m.loser] = g ? { w: 0, l: 1, out: true } : { w: 0, l: 1, pool: 2 };
    }
    const rank = (u) => (res[u] ? (res[u].out ? 3 : res[u].pool) : 2.5);
    return [...grp.players].sort((a, b) => rank(a) - rank(b) || seedOf(a) - seedOf(b))
      .map((u) => ({ ...side(u), w: 0, l: 0, ...(res[u] || {}), adv: !!(res[u] && res[u].pool) }));
  });
}

module.exports = { MAX, normalizeKings, kingsError, advanceOf, buildKings, advancers, tables };
