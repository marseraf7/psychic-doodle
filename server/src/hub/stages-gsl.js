/*
 * Giải đấu Offline – bảng đấu loại kép 4 đội kiểu GSL (thể thức vòng bảng của nhiều giải Esports: mỗi bảng 4 đội, 5 trận,
 * không có hoà, không cần hệ số phụ – chỉ mô phỏng thể thức):
 *   Trận mở màn: hạt giống 1 gặp 4, 2 gặp 3 của bảng.
 *   Trận nhánh thắng: hai đội thắng gặp nhau – đội thắng nhất bảng (đi tiếp).
 *   Trận nhánh thua: hai đội thua gặp nhau – đội thua bị loại (hạng 4).
 *   Trận quyết định: đội thua trận nhánh thắng gặp đội thắng trận nhánh thua – đội thắng nhì bảng (đi tiếp), thua hạng 3.
 * Số đội phải chia hết cho 4; chia bảng kiểu rắn theo hạt giống. Mỗi trận nối sẵn tới trận sau (next / loserTo) như nhánh
 * loại trực tiếp nên dùng chung cách chuyển người (stages-elim.js – resolveElim) và huỷ kết quả.
 * st.groups = [{ name, players, rounds: [[mở màn 1, mở màn 2], [nhánh thắng, nhánh thua], [quyết định]] }] – cùng hình
 * dạng bảng vòng tròn để dùng chung xếp lịch (otour-sched.js) và bản vá gửi trình duyệt (tourpush.js).
 */
'use strict';
const { real, newMatch } = require('./stages-base.js');

const SIZE = 4;
const MAX_GROUPS = 64;
const groupName = (g) => (g < 26 ? String.fromCharCode(65 + g) : String(g + 1));

/** Chuẩn hoá cấu hình (stages.js gọi khi giải offline). boDecider: Bo riêng cho trận quyết định (0 = như các trận khác). */
function normalizeGsl(c, last, oddBo) {
  const out = { type: 'gsl', bestOf: oddBo(c.bestOf) || 1 };
  const bd = oddBo(c.boDecider);
  if (bd && bd !== out.bestOf) out.boDecider = bd;
  if (!last) out.advance = 2; // nhất và nhì mỗi bảng
  return out;
}

/** Lỗi cỡ giai đoạn (null nếu được): số đội chia hết cho 4, tối đa 64 bảng. */
const gslError = (cfg, n) => (cfg.type !== 'gsl' ? null : n % SIZE || n < SIZE ? { code: 'ot_gsl_four', args: { n } } : n / SIZE > MAX_GROUPS ? { code: 'ot_gsl_many', args: { n: MAX_GROUPS * SIZE } } : null);

/** Dựng các bảng: chia kiểu rắn theo hạt giống (bảng A: 1, 2G, 2G+1, 4G…). */
function buildGsl(st, seeds) {
  const G = Math.max(1, Math.floor(seeds.length / SIZE));
  const groups = Array.from({ length: G }, (_, g) => ({ name: groupName(g), players: [], rounds: [] }));
  seeds.slice(0, G * SIZE).forEach((u, i) => {
    const row = Math.floor(i / G), col = i % G;
    groups[row % 2 ? G - 1 - col : col].players.push(u);
  });
  groups.forEach((grp, g) => {
    const id = (k) => `${st.key}g${g}${k}`;
    const mk = (k, round, tag, extra = {}) => { const m = newMatch(id(k), round, { grp: g, tag, ...extra }); st.matches[m.id] = m; return m; };
    const [p1, p2, p3, p4] = grp.players;
    const o1 = mk('o1', 0, 'open'), o2 = mk('o2', 0, 'open');
    const w = mk('w', 1, 'win'), l = mk('l', 1, 'lose');
    const d = mk('d', 2, 'dec', st.cfg.boDecider ? { bo: st.cfg.boDecider } : {});
    Object.assign(o1, { a: p1, b: p4, next: { to: w.id, slot: 'a' }, loserTo: { to: l.id, slot: 'a' } });
    Object.assign(o2, { a: p2, b: p3, next: { to: w.id, slot: 'b' }, loserTo: { to: l.id, slot: 'b' } });
    w.loserTo = { to: d.id, slot: 'a' };
    l.next = { to: d.id, slot: 'b' };
    grp.rounds = [[o1.id, o2.id], [w.id, l.id], [d.id]];
  });
  st.groups = groups;
}

/** Thứ hạng trong một bảng: [nhất, nhì, ba, tư] (chỗ chưa xác định: null). */
function places(st, grp) {
  const M = (r, i) => st.matches[grp.rounds[r][i]];
  const w = M(1, 0), l = M(1, 1), d = M(2, 0);
  const ok = (m, k) => (m.done && real(m[k]) ? m[k] : null);
  return [ok(w, 'winner'), ok(d, 'winner'), ok(d, 'loser'), ok(l, 'loser')];
}

/** Người đi tiếp: nhất các bảng (theo hạt giống) rồi nhì các bảng; groupOf để nhánh sau tránh cùng bảng gặp sớm. */
function advancers(st, seedOf) {
  const groupOf = {}, firsts = [], seconds = [];
  st.groups.forEach((grp, g) => {
    const [a, b] = places(st, grp);
    if (a) { firsts.push(a); groupOf[a] = g; }
    if (b) { seconds.push(b); groupOf[b] = g; }
  });
  const by = (x, y) => seedOf(x) - seedOf(y);
  return { seeds: [...firsts.sort(by), ...seconds.sort(by)], groupOf };
}

/** Bảng của từng bảng đấu cho người xem: thắng – thua, hạng (khi đã rõ), suất đi tiếp. */
function tables(st, side, seedOf, adv) {
  return st.groups.map((grp) => {
    const pl = places(st, grp);
    const rec = Object.fromEntries(grp.players.map((u) => [u, { w: 0, l: 0 }]));
    for (const ids of grp.rounds) for (const id of ids) {
      const m = st.matches[id];
      if (m.done && rec[m.winner] && rec[m.loser]) { rec[m.winner].w++; rec[m.loser].l++; }
    }
    const rank = (u) => { const i = pl.indexOf(u); return i < 0 ? null : i + 1; };
    return [...grp.players].sort((a, b) => ((rank(a) || 9) - (rank(b) || 9)) || (rec[b].w - rec[a].w) || (rec[a].l - rec[b].l) || (seedOf(a) - seedOf(b)))
      .map((u) => ({ ...side(u), w: rec[u].w, l: rec[u].l, rank: rank(u), adv: !!adv && rank(u) != null && rank(u) <= 2, out: rank(u) != null && rank(u) > 2 }));
  });
}

module.exports = { SIZE, normalizeGsl, gslError, buildGsl, places, advancers, tables };
