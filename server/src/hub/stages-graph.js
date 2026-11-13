/*
 * Giải offline – giai đoạn "nhánh đồ thị" (type 'graph', cfg.shape – khuôn ở caro/otour-graph.js, dùng chung trình duyệt):
 * Page playoff, Final Eight / Final Ten kiểu AFL, thang leo bậc (gauntlet – có trận tặng sẵn kiểu KBO / NPB), loại kép lai
 * kiểu RLCS, Compass draw 8. Mỗi trận có next (người thắng) / loserTo (người thua) như nhánh loại trực tiếp nên ghi kết quả,
 * tự xử miễn đấu và khoá huỷ kết quả dùng chung resolveElim (stages-elim.js) và on_otUndo (otour-run.js).
 * Thứ hạng: hạng ghi ở khuôn (wp / lp) – người thua dừng ở hạng lp của trận, người thắng trận cuối nhánh ở hạng wp.
 * Đăng ký vào registry loại giai đoạn (stages-kinds.js).
 */
'use strict';
const { real, newMatch } = require('./stages-base.js');
const G = require('../../../caro/otour-graph.js');

const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

/** Chuẩn hoá: khuôn, Bo chung / chung kết; gauntlet: Bo, trận tặng và luật hoà loạt từng bậc. */
function normalize(c, last, { oddBo }) {
  const shape = G.SHAPES.includes(c.shape) ? c.shape : 'page';
  const out = { type: 'graph', shape, bestOf: oddBo(c.bestOf) || 1 };
  const bf = oddBo(c.boFinal);
  if (bf && bf !== out.bestOf) out.boFinal = bf;
  if (shape === 'gauntlet' && Array.isArray(c.ladder)) {
    out.ladder = c.ladder.slice(0, G.MAX_GAUNTLET - 1).map((x) => {
      const y = {};
      const bo = Math.floor(Number(x && x.bo));
      if (bo >= 1 && bo <= 25) y.bo = bo; // Bo chẵn được khi có trận tặng (KBO Wild Card: Bo3 gồm 1 trận tặng = tối đa 2 trận)
      const s = Array.isArray(x && x.start) ? x.start : [];
      const sa = int(s[0], 0, 3, 0), sb = int(s[1], 0, 3, 0);
      if (sa || sb) y.start = [sa, sb];
      if (x && x.tie === true) y.tie = true;
      return y;
    });
    if (!out.ladder.some((y) => Object.keys(y).length)) delete out.ladder;
  }
  if (!last) out.advance = int(c.advance, 1, 8, 1);
  return out;
}

/** Lỗi cỡ giai đoạn: số đội phải hợp khuôn. */
function error(cfg, n) {
  if (cfg.type !== 'graph') return null;
  return G.make(cfg.shape, n, cfg) ? null : { code: 'ot_graph_size', args: { n: (G.SIZES[cfg.shape] || []).join(' / ') } };
}

function build(st, seeds, opts = {}) {
  const g = G.make(st.cfg.shape, seeds.length, st.cfg);
  // Gauntlet chéo bảng: xếp lại theo bảng của giai đoạn trước (hạng 2 bảng A, B, C; hạng 3…; hạng 4…) để cặp chéo đúng bảng
  if (st.cfg.shape === 'cross9' && opts.groupOf) seeds = crossOrder(seeds, opts.groupOf);
  if (!g) throw new Error('graph size');
  const id = (k) => `${st.key}x${k}`;
  const ref = (s) => (s ? { to: id(s.split('.')[0]), slot: s.split('.')[1] } : null);
  st.cols = g.cols.map(() => []);
  st.colNames = g.cols; // khoá tên từng cột (i18n)
  const last = g.ms.length - 1;
  g.ms.forEach((d, i) => {
    const bo = d.bo || (d.wp === 1 && st.cfg.boFinal) || 0;
    const m = newMatch(id(d.k), d.col, { tag: d.tag, gk: d.k, ...(bo ? { bo } : {}), ...(d.start ? { start: d.start } : {}), ...(d.tie ? { tie: true } : {}) });
    m.next = ref(d.win);
    m.loserTo = ref(d.lose);
    if (d.wp) m.wp = d.wp;
    if (d.lp) m.lp = d.lp;
    if (d.a) m.a = seeds[d.a - 1];
    if (d.b) m.b = seeds[d.b - 1];
    if (i === last) m.final = true;
    st.matches[m.id] = m;
    st.cols[d.col].push(m.id);
  });
  st.rounds = st.cols; // cùng hình dạng nhánh loại trực tiếp (bản vá gửi trình duyệt, xếp lịch)
}

/** 9 đội theo tầng (3 đội mỗi tầng, theo hạt giống): trong mỗi tầng xếp theo bảng (0, 1, 2) của giai đoạn trước. */
function crossOrder(seeds, groupOf) {
  const out = [];
  for (let k = 0; k < 3; k++) out.push(...seeds.slice(3 * k, 3 * k + 3).sort((a, b) => (groupOf[a] ?? 9) - (groupOf[b] ?? 9)));
  return out;
}

/** Thứ hạng hiện có: [{ uid, place }] theo hạng rồi hạt giống (người còn đang đấu không có hạng). */
function places(st, seedOf = () => 0) {
  const out = [];
  for (const m of Object.values(st.matches)) {
    if (!m.done) continue;
    if (m.wp && real(m.winner)) out.push({ uid: m.winner, place: m.wp });
    if (m.lp && real(m.loser)) out.push({ uid: m.loser, place: m.lp });
  }
  return out.sort((x, y) => x.place - y.place || seedOf(x.uid) - seedOf(y.uid));
}

function advancers(st, seedOf) {
  return { seeds: places(st, seedOf).map((x) => x.uid).slice(0, Math.max(1, st.cfg.advance || 1)), groupOf: {} };
}
const podium = (st, seedOf) => places(st, seedOf).slice(0, 3).map((x) => x.uid);

/** Phần riêng gửi trình duyệt: các cột trận, nơi người thắng / thua đi tới, bảng hạng. */
function view(st, { M, side, seedOf }) {
  const tagOf = (r) => (r ? { tag: st.matches[r.to].tag, k: st.matches[r.to].gk } : null);
  const rounds = st.cols.map((ids) => ids.map((id) => {
    const m = st.matches[id], v = M(id);
    return { ...v, gk: m.gk, to: { win: tagOf(m.next), lose: tagOf(m.loserTo), wp: m.wp || 0, lp: m.lp || 0 }, ...(m.start ? { start: m.start } : {}), ...(m.tie ? { tie: true } : {}) };
  }));
  // Đội không đi tiếp ở giai đoạn giữa có nhãn đích ra ngoài giải (cfg.exit) khi đã có hạng
  const adv = st.cfg.advance || 0;
  const table = places(st, seedOf).map((x, k) => ({ ...side(x.uid), place: x.place, ...(st.cfg.exit && adv && k >= adv ? { exit: st.cfg.exit } : {}) }));
  return { rounds, table, shape: st.cfg.shape, colNames: st.colNames || [] };
}

module.exports = { normalize, error, build, places, advancers, podium, view, linked: true, selfMark: true };
