/*
 * Giải đấu Offline – playoff kiểu nhà nghề Mỹ (loại trực tiếp ngay sau mùa giải – stages-season.js):
 * cfg.playoff = { mode, per, divWin, playin, reseed, playinBo }
 *   per     – số đội mỗi miền vào nhánh chính (NBA 8, NFL 7, MLB 6, NHL 8, MLS 8). Mỗi miền một nửa nhánh, hai nhà vô địch
 *             miền gặp nhau ở chung kết. Hạt giống chuẩn trong nửa nhánh (1–8, 4–5, 3–6, 2–7); thiếu đội thì hạt giống
 *             cao được miễn vòng đầu (NFL: hạt giống 1; MLB: 1 và 2).
 *   divWin  – nhất các bảng con giữ các hạt giống đầu (NFL 1–4, MLB 1–3), rồi tới đội vé vớt theo thành tích.
 *   mode    – 'seed' (như trên) | 'div' (NHL: mỗi bảng con 3 đội đầu + 2 vé vớt; nhất bảng con thành tích tốt hơn gặp vé
 *             vớt thứ 2, nhất bảng con kia gặp vé vớt thứ 1; nhì gặp ba trong từng bảng con).
 *   playin  – 'none' | 'nba' (hạt giống 7–10: 7 gặp 8 → thắng là hạt giống 7; 9 gặp 10; thua trận 7–8 gặp thắng trận 9–10 →
 *             thắng là hạt giống 8) | 'one' (MLS: 8 gặp 9 → thắng là hạt giống 8).
 *   reseed  – sau mỗi vòng, xếp lại cặp trong từng miền: hạt giống cao nhất còn lại gặp thấp nhất (NFL).
 * Bo từng vòng: cfg.boRounds (stages.js – boOf). Trận play-in: Bo playinBo (mặc định 1).
 *   need(cfg)             – số đội mỗi miền mùa giải phải cho đi tiếp
 *   playoffPlan(prev, cfg, seedOf) → { seeds, slots, pre, label } hoặc null (không hợp: xếp như thường)
 *   attachPre(st, plan)   – gắn kế hoạch vào giai đoạn đã dựng: trận play-in (nối người thắng / thua vào nhánh), nhãn
 *                           hạt giống, số nửa nhánh, thứ tự hạt giống cho reseed
 *   reseed(st)            – NFL: xếp lại cặp vòng sau trong từng miền khi vòng trước của miền đó xong
 *   undoLocked(st, m)     – có xếp lại cặp: khoá huỷ kết quả khi vòng sau cùng nửa nhánh đã có trận xong
 */
'use strict';
const { BYE, real, newMatch } = require('./stages-base.js');
const { seedOrder } = require('./stages-elim.js');

const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const PLAYIN = { none: 0, nba: 2, one: 1 }; // số đội thêm mỗi miền phải đi tiếp để đá play-in
const pow2 = (n) => { let s = 1; while (s < n) s *= 2; return s; };

function normalizePlayoff(p) {
  if (!p || typeof p !== 'object') return null;
  const mode = p.mode === 'div' ? 'div' : 'seed';
  return {
    mode,
    per: mode === 'div' ? 8 : int(p.per, 2, 16, 8),
    divWin: mode === 'seed' && p.divWin === true,
    playin: mode === 'seed' && PLAYIN[p.playin] ? p.playin : 'none',
    reseed: p.reseed === true,
    playinBo: [1, 3, 5, 7].includes(Number(p.playinBo)) ? Number(p.playinBo) : 1,
  };
}

/** Số đội mỗi miền mùa giải phải cho đi tiếp. */
const need = (po) => (po ? po.per + PLAYIN[po.playin || 'none'] : 0);

/**
 * Thứ tự hạt giống của một miền (mảng uid, dài per + đội play-in) từ bảng xếp hạng miền (list) và các bảng con (divs).
 * mode 'div': trả { div: [[3 đội], [3 đội]], wc: [2 đội] } để xếp nhánh kiểu NHL.
 */
function confSeeds(list, divs, po) {
  const k = need(po);
  if (po.mode === 'div') {
    if (!divs || divs.length !== 2) return null;
    const pos = new Map(list.map((u, i) => [u, i]));
    const byRank = (arr) => [...arr].sort((a, b) => pos.get(a) - pos.get(b));
    const top = divs.map((d) => byRank(d).slice(0, 3));
    if (top.some((d) => d.length < 3)) return null;
    const used = new Set(top.flat());
    const wc = list.filter((u) => !used.has(u)).slice(0, 2);
    if (wc.length < 2) return null;
    // Bảng con có đội nhất thành tích tốt hơn đứng trước
    if (pos.get(top[1][0]) < pos.get(top[0][0])) top.reverse();
    return { div: top, wc };
  }
  let order = list;
  if (po.divWin && divs && divs.length > 1) {
    const winners = new Set(divs.map((d) => list.find((u) => d.includes(u))).filter(Boolean));
    order = [...list.filter((u) => winners.has(u)), ...list.filter((u) => !winners.has(u))];
  }
  return order.length >= k ? order.slice(0, k) : null;
}

/**
 * Kế hoạch nhánh playoff từ giai đoạn mùa giải vừa xong. Trả null nếu không hợp (giai đoạn trước không phải mùa giải,
 * thiếu đội) – khi đó otour-run.js xếp nhánh theo hạt giống như thường.
 * slots: mảng ô vòng 1 (uid | BYE | null = chờ play-in); pre: các trận play-in [{ a, b, win: ô, lose: chỉ số trận play-in nhận người thua }].
 */
function playoffPlan(prev, cfg, standings) {
  const po = cfg.playoff;
  if (!po || !prev || prev.type !== 'roundrobin' || !prev.cfg.season || !prev.groups || !prev.groups.length) return null;
  const C = prev.groups.length;
  const half = po.mode === 'div' ? 8 : pow2(po.per);
  const size = pow2(C) * half;
  const slots = new Array(size).fill(BYE);
  const pre = [];
  const label = {};
  const seeds = [];
  for (let c = 0; c < C; c++) {
    const g = prev.groups[c];
    const s = confSeeds(standings[c].list, g.divs, po);
    if (!s) return null;
    const base = c * half;
    const name = g.name;
    if (po.mode === 'div') {
      // [D1-nhất, vé vớt 2, D1-nhì, D1-ba, D2-nhất, vé vớt 1, D2-nhì, D2-ba]
      const [d1, d2] = s.div, [w1, w2] = s.wc;
      [d1[0], w2, d1[1], d1[2], d2[0], w1, d2[1], d2[2]].forEach((u, i) => { slots[base + i] = u; });
      d1.forEach((u, i) => { label[u] = `${name} · ${i + 1}`; });
      d2.forEach((u, i) => { label[u] = `${name} · ${i + 1}`; });
      label[w1] = `${name} · WC1`;
      label[w2] = `${name} · WC2`;
      seeds.push(d1[0], d2[0], d1[1], d2[1], d1[2], d2[2], w1, w2);
      continue;
    }
    const order = seedOrder(half); // ô → hạt giống (1-based)
    const at = (seed) => base + order.indexOf(seed); // ô của hạt giống trong nửa nhánh
    s.forEach((u, i) => { label[u] = `${name}${i + 1}`; });
    for (let seed = 1; seed <= po.per; seed++) slots[at(seed)] = s[seed - 1];
    seeds.push(...s);
    if (po.playin === 'nba' && po.per >= 2) {
      // 7–8: thắng → ô hạt giống per − 1; thua → trận vớt. 9–10: thắng → trận vớt. Vớt: thắng → ô hạt giống per
      const p = po.per;
      slots[at(p - 1)] = null;
      slots[at(p)] = null;
      const a = pre.length;
      pre.push({ a: s[p - 2], b: s[p - 1], win: at(p - 1), lose: a + 2, loseSlot: 'a', tag: 'pi_78' },
        { a: s[p], b: s[p + 1], win: null, winTo: a + 2, winSlot: 'b', tag: 'pi_910' },
        { a: null, b: null, win: at(p), tag: 'pi_last' });
    } else if (po.playin === 'one') {
      const p = po.per;
      slots[at(p)] = null;
      pre.push({ a: s[p - 1], b: s[p], win: at(p), tag: 'pi_89' });
    }
  }
  return { seeds, slots, pre, label };
}

/**
 * Gắn kế hoạch vào nhánh vừa dựng (ô null = chờ play-in): các trận play-in, nhãn hạt giống, số nửa nhánh (mỗi miền một
 * nửa – reseed xếp lại trong từng nửa) và thứ tự hạt giống để xếp lại cặp.
 */
function attachPre(st, plan) {
  if (!plan) return;
  const po = st.cfg.playoff || {};
  st.halves = Math.max(1, plan.slots.length / (po.mode === 'div' ? 8 : pow2(po.per || 8)));
  st.reseedOrder = plan.seeds;
  st.seedLabel = plan.label;
  if (!plan.pre.length) return;
  const r0 = st.rounds[0];
  const slotRef = (i) => ({ to: r0[i >> 1], slot: i % 2 ? 'b' : 'a' });
  const ids = plan.pre.map((_, i) => `${st.key}p${i}`);
  st.pre = ids;
  plan.pre.forEach((p, i) => {
    const m = newMatch(ids[i], 0, { pre: true, tag: p.tag });
    m.a = p.a;
    m.b = p.b;
    if (p.win != null) m.next = slotRef(p.win);
    else if (p.winTo != null) m.next = { to: ids[p.winTo], slot: p.winSlot };
    if (p.lose != null) m.loserTo = { to: ids[p.lose], slot: p.loseSlot };
    m.bo = po.playinBo || 1; // Bo riêng của play-in (mặc định 1 trận), không theo Bo của giai đoạn
    st.matches[m.id] = m;
  });
}

/**
 * NFL: khi mọi trận vòng r của một miền đã xong mà vòng r + 1 của miền đó chưa đấu trận nào, xếp lại cặp vòng r + 1:
 * hạt giống cao nhất còn lại gặp thấp nhất (thứ tự theo st.entrants – thứ tự hạt giống khi dựng). Ghi lại next của các
 * trận vòng r cho đúng chỗ mới (để huỷ kết quả vẫn đúng). Trả true nếu đã đổi.
 */
function reseed(st) {
  const po = st.cfg.playoff;
  if (!po || !po.reseed || st.type !== 'single') return false;
  const halves = st.halves || 1;
  const rank = new Map((st.reseedOrder || st.entrants).map((u, i) => [u, i]));
  let changed = false;
  for (let r = 0; r + 2 < st.rounds.length; r++) { // không xếp lại trận chung kết miền về sau (vòng chung kết giải)
    const cur = st.rounds[r], next = st.rounds[r + 1];
    const perHalfNext = next.length / halves;
    if (perHalfNext < 2) continue;
    for (let h = 0; h < halves; h++) {
      const src = cur.slice(h * perHalfNext * 2, (h + 1) * perHalfNext * 2).map((id) => st.matches[id]);
      const dst = next.slice(h * perHalfNext, (h + 1) * perHalfNext).map((id) => st.matches[id]);
      if (!src.every((m) => m.done) || dst.some((m) => m.done)) continue;
      const winners = src.map((m) => ({ m, u: m.winner })).filter((x) => real(x.u)).sort((x, y) => rank.get(x.u) - rank.get(y.u));
      if (winners.length !== dst.length * 2) continue;
      dst.forEach((d, i) => {
        const hi = winners[i], lo = winners[winners.length - 1 - i];
        if (d.a !== hi.u || d.b !== lo.u) changed = true;
        d.a = hi.u;
        d.b = lo.u;
        hi.m.next = { to: d.id, slot: 'a' };
        lo.m.next = { to: d.id, slot: 'b' };
      });
    }
  }
  return changed;
}

/**
 * Có xếp lại cặp: huỷ kết quả một trận vòng r khi vòng r + 1 cùng nửa nhánh đã có trận đấu xong thì cặp đã chốt sẽ sai –
 * khoá lại (otour-run.js – on_otUndo). Trả true nếu phải khoá.
 */
function undoLocked(st, m) {
  const po = st.cfg.playoff;
  if (!po || !po.reseed || st.type !== 'single' || m.pre || !st.rounds[m.round + 1]) return false;
  const next = st.rounds[m.round + 1], cur = st.rounds[m.round];
  const halves = st.halves || 1, per = next.length / halves;
  if (per < 1) return false;
  const h = Math.floor(cur.indexOf(m.id) / (cur.length / halves));
  return next.slice(h * per, (h + 1) * per).some((id) => st.matches[id].done);
}

module.exports = { PLAYIN, normalizePlayoff, need, confSeeds, playoffPlan, attachPre, reseed, undoLocked };
