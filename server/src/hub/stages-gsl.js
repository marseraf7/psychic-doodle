/*
 * Giải đấu Offline – bảng đấu loại kép kiểu GSL (thể thức vòng bảng của nhiều giải Esports – chỉ mô phỏng thể thức):
 * không có hoà, không cần hệ số phụ. Hai cỡ bảng (cfg.size):
 *   4 đội, 5 trận, nhất – nhì bảng đi tiếp:
 *     Trận mở màn: hạt giống 1 gặp 4, 2 gặp 3 của bảng.
 *     Trận nhánh thắng: hai đội thắng gặp nhau – đội thắng nhất bảng (đi tiếp).
 *     Trận nhánh thua: hai đội thua gặp nhau – đội thua bị loại (hạng 4).
 *     Trận quyết định: đội thua trận nhánh thắng gặp đội thắng trận nhánh thua – đội thắng nhì bảng, thua hạng 3.
 *   8 đội, 10 trận, 4 đội đi tiếp (bảng đấu loại kép 8 người lấy 4 – như vòng bảng StarCraft II):
 *     4 trận mở màn (1–8, 4–5, 2–7, 3–6); 2 trận nhánh thắng – hai đội thắng đi tiếp (hạng 1–2);
 *     2 trận nhánh thua (các đội thua mở màn) – đội thua bị loại (hạng 7–8);
 *     2 trận quyết định: đội thua nhánh thắng gặp đội thắng nhánh thua (chéo nhánh) – đội thắng đi tiếp (hạng 3–4).
 * Số đội phải chia hết cho cỡ bảng; chia bảng kiểu rắn theo hạt giống. Mỗi trận nối sẵn tới trận sau (next / loserTo) như
 * nhánh loại trực tiếp nên dùng chung cách chuyển người (stages-elim.js – resolveElim) và huỷ kết quả.
 * cfg.skip = 1 (giải 3 giai đoạn): đội nhất bảng vào thẳng giai đoạn 3, các đội đi tiếp còn lại đá giai đoạn 2.
 * st.groups = [{ name, players, rounds: [[mở màn…], [nhánh thắng…, nhánh thua…], [quyết định…]] }] – cùng hình dạng bảng
 * vòng tròn để dùng chung xếp lịch (otour-sched.js) và bản vá gửi trình duyệt (tourpush.js).
 */
'use strict';
const { real, newMatch } = require('./stages-base.js');

const SIZES = [4, 8];
const MAX_GROUPS = 64;
const groupName = (g) => (g < 26 ? String.fromCharCode(65 + g) : String(g + 1));
const sizeOf = (cfg) => (cfg.size === 8 ? 8 : 4);
/** Số hạng đi tiếp mỗi bảng: nửa bảng; không loại ai (keepAll – kiểu BLAST Groups: mọi hạng đều có đích) thì cả bảng. */
const keepOf = (cfg) => (cfg.keepAll ? sizeOf(cfg) : sizeOf(cfg) / 2);

/** Chuẩn hoá cấu hình (stages.js gọi khi giải offline). boDecider: Bo riêng cho trận quyết định (0 = như các trận khác). */
function normalizeGsl(c, last, oddBo) {
  const out = { type: 'gsl', bestOf: oddBo(c.bestOf) || 1 };
  if (Number(c.size) === 8) out.size = 8;
  const bd = oddBo(c.boDecider);
  if (bd && bd !== out.bestOf) out.boDecider = bd;
  // Không loại ai (kiểu BLAST Premier Groups): mọi hạng trong bảng đều có đích – dải hạng (routes) và phần đi tiếp
  if (c.eliminates === false && !last) out.keepAll = true;
  if (!last) out.advance = keepOf(out); // nửa bảng đi tiếp (không loại ai: cả bảng)
  return out;
}

/** Lỗi cỡ giai đoạn (null nếu được): số đội chia hết cho cỡ bảng, tối đa 64 bảng. */
function gslError(cfg, n) {
  if (cfg.type !== 'gsl') return null;
  const k = sizeOf(cfg);
  if (n % k || n < k) return { code: 'ot_gsl_four', args: { n, k } };
  return n / k > MAX_GROUPS ? { code: 'ot_gsl_many', args: { n: MAX_GROUPS * k } } : null;
}

/** Dựng các bảng: chia kiểu rắn theo hạt giống (bảng A: 1, 2G, 2G+1, 4G…). */
function buildGsl(st, seeds) {
  const K = sizeOf(st.cfg);
  const G = Math.max(1, Math.floor(seeds.length / K));
  const groups = Array.from({ length: G }, (_, g) => ({ name: groupName(g), players: [], rounds: [] }));
  seeds.slice(0, G * K).forEach((u, i) => {
    const row = Math.floor(i / G), col = i % G;
    groups[row % 2 ? G - 1 - col : col].players.push(u);
  });
  const dec = st.cfg.boDecider ? { bo: st.cfg.boDecider } : {};
  groups.forEach((grp, g) => {
    const mk = (k, round, tag, extra = {}) => { const m = newMatch(`${st.key}g${g}${k}`, round, { grp: g, tag, ...extra }); st.matches[m.id] = m; return m; };
    const to = (m, slot) => ({ to: m.id, slot });
    const p = grp.players;
    if (K === 4) {
      const o1 = mk('o1', 0, 'open'), o2 = mk('o2', 0, 'open'), w = mk('w', 1, 'win'), l = mk('l', 1, 'lose'), d = mk('d', 2, 'dec', dec);
      Object.assign(o1, { a: p[0], b: p[3], next: to(w, 'a'), loserTo: to(l, 'a') });
      Object.assign(o2, { a: p[1], b: p[2], next: to(w, 'b'), loserTo: to(l, 'b') });
      w.loserTo = to(d, 'a');
      l.next = to(d, 'b');
      grp.rounds = [[o1.id, o2.id], [w.id, l.id], [d.id]];
      return;
    }
    const o = [1, 2, 3, 4].map((k) => mk('o' + k, 0, 'open'));
    const w = [1, 2].map((k) => mk('w' + k, 1, 'win')), l = [1, 2].map((k) => mk('l' + k, 1, 'lose'));
    const d = [1, 2].map((k) => mk('d' + k, 2, 'dec', dec));
    [[0, 7], [3, 4], [1, 6], [2, 5]].forEach(([x, y], k) => Object.assign(o[k], { a: p[x], b: p[y], next: to(w[k >> 1], k % 2 ? 'b' : 'a'), loserTo: to(l[k >> 1], k % 2 ? 'b' : 'a') }));
    // Chéo nhánh: đội thua nhánh thắng 1 gặp đội thắng nhánh thua 2 (không gặp lại đối thủ trận mở màn)
    w[0].loserTo = to(d[1], 'a'); w[1].loserTo = to(d[0], 'a');
    l[0].next = to(d[0], 'b'); l[1].next = to(d[1], 'b');
    grp.rounds = [o.map((m) => m.id), [...w, ...l].map((m) => m.id), d.map((m) => m.id)];
  });
  st.groups = groups;
}

/**
 * Thứ hạng trong một bảng: mảng theo hạng (chỗ chưa xác định: null). Bảng 8: hạng 1–2 (thắng nhánh thắng), 3–4 (thắng trận
 * quyết định), 5–6 (thua trận quyết định), 7–8 (thua nhánh thua) – trong mỗi cặp xếp theo hạt giống.
 */
function places(st, grp, seedOf = () => 0) {
  const ms = (r) => grp.rounds[r].map((id) => st.matches[id]);
  const pick = (list, k) => list.map((m) => (m.done && real(m[k]) ? m[k] : null)).sort((a, b) => (a === null) - (b === null) || (a && b ? seedOf(a) - seedOf(b) : 0));
  const mid = ms(1), half = mid.length / 2;
  const w = mid.slice(0, half), l = mid.slice(half), d = ms(2);
  return [...pick(w, 'winner'), ...pick(d, 'winner'), ...pick(d, 'loser'), ...pick(l, 'loser')];
}

/**
 * Người đi tiếp theo tầng: hạng 1 các bảng (theo hạt giống), rồi hạng 2 các bảng…; groupOf để nhánh sau tránh cùng bảng
 * gặp sớm. tiers: các tầng (dùng cho cfg.skip – nhất bảng vào thẳng giai đoạn 3).
 */
function advancers(st, seedOf) {
  const K = keepOf(st.cfg), groupOf = {}, tiers = Array.from({ length: K }, () => []);
  st.groups.forEach((grp, g) => places(st, grp, seedOf).slice(0, K).forEach((u, k) => { if (u) { tiers[k].push(u); groupOf[u] = g; } }));
  const by = (x, y) => seedOf(x) - seedOf(y);
  tiers.forEach((t) => t.sort(by));
  return { seeds: tiers.flat(), groupOf, tiers };
}

/** Bảng của từng bảng đấu cho người xem: thắng – thua, hạng (khi đã rõ), suất đi tiếp, vào thẳng giai đoạn 3 (skip). */
function tables(st, side, seedOf, adv) {
  const K = keepOf(st.cfg), skip = st.cfg.skip || 0;
  // Chuyển đội theo dải thứ hạng (routes): tầng hạng r (1, 2…) → giai đoạn `to`; skip cũ = dải đầu sang giai đoạn sau nữa
  const bands = [];
  for (const r of Array.isArray(st.cfg.routes) && st.cfg.routes.length ? st.cfg.routes : skip ? [{ n: skip, to: st.index + 2 }] : []) for (let k = 0; k < r.n; k++) bands.push(r.to);
  return st.groups.map((grp) => {
    const pl = places(st, grp, seedOf);
    const rec = Object.fromEntries(grp.players.map((u) => [u, { w: 0, l: 0 }]));
    for (const ids of grp.rounds) for (const id of ids) {
      const m = st.matches[id];
      if (m.done && rec[m.winner] && rec[m.loser]) { rec[m.winner].w++; rec[m.loser].l++; }
    }
    const rank = (u) => { const i = pl.indexOf(u); return i < 0 ? null : i + 1; };
    return [...grp.players].sort((a, b) => ((rank(a) || 99) - (rank(b) || 99)) || (rec[b].w - rec[a].w) || (rec[a].l - rec[b].l) || (seedOf(a) - seedOf(b)))
      .map((u) => {
        const r = rank(u);
        return { ...side(u), w: rec[u].w, l: rec[u].l, rank: r, adv: !!adv && r != null && r <= K, out: r != null && r > K, ...(adv && r != null && bands[r - 1] != null ? { skip: true, to: bands[r - 1] + 1 } : {}) };
      });
  });
}

module.exports = { SIZES, sizeOf, keepOf, normalizeGsl, gslError, buildGsl, places, advancers, tables };
