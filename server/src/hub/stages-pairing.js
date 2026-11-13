/*
 * Thể thức thi đấu – các cách ghép cặp hệ Thụy Sĩ (plugin; swissNextRound ở stages-groups.js gọi pair()):
 *   'dutch'    (FIDE, mặc định) – trong mỗi nhóm điểm nửa trên gặp nửa dưới, tránh gặp lại;
 *   'adjacent' (cách của bản trước) – 1–2, 3–4… theo điểm rồi hạt giống, tránh gặp lại;
 *   'monrad'   – sắp cả giải theo bảng xếp hạng (điểm → các chỉ số phụ → hạt giống), ghép thẳng 1–2, 3–4…, hoán đổi tối
 *                thiểu để tránh gặp lại;
 *   'danish'   – như Monrad nhưng cho gặp lại (vòng cuối luôn là hạng 1 gặp hạng 2);
 *   'baku'     – tăng tốc Baku (FIDE C.04.7): nửa trên theo hạt giống đầu giai đoạn (GA) được cộng điểm ảo CHỈ để ghép cặp
 *                (mặc định giải 9 vòng: +1 ở vòng 1–3, +0,5 ở vòng 4–5), rồi ghép kiểu Hà Lan theo điểm ghép cặp – điểm
 *                thật, bảng xếp hạng và mọi chỉ số phụ không đổi;
 *   pairingByRound – ghi đè cách ghép từng vòng (vd. Hà Lan các vòng đầu, Danish vòng cuối).
 * King of the Hill + Gibsonization (Scrabble – koth: { rounds }, gibson: { spots, swing }): các vòng cuối ghép thẳng theo
 * bảng xếp hạng (cho gặp lại); trước mỗi vòng đó, người đã chắc suất (top `spots`) dù thua hết các trận còn lại với chênh
 * lệch −swing mỗi trận (người đuổi theo thắng hết với +swing) thì được tách khỏi nhóm tranh chấp – gặp người xếp cao nhất
 * đã hết cơ hội vào top `spots`.
 * Cắt theo thành tích (advanceMode 'record', cutLosses – kiểu VGC X-2): mọi người thua ≤ cutLosses trận đi tiếp
 * (stages-groups.js – advancers).
 */
'use strict';
const { real } = require('./stages-base.js');
const DRF = require('./stages-draft.js'); // draft kiểu Magic: bốc ghế, ghép đối diện bàn

const MODES = ['dutch', 'adjacent', 'monrad', 'danish', 'baku'];
const NEW = ['monrad', 'danish', 'baku']; // chỉ giải offline
const MAX_ROUNDS = 15;
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const BAKU = [{ from: 1, to: 3, pts: 1 }, { from: 4, to: 5, pts: 0.5 }]; // lịch điểm ảo mặc định (giải 9 vòng – C.04.7)

/** Chuẩn hoá tuỳ chọn ghép cặp / cắt của giai đoạn Thụy Sĩ thường (giải offline). c: cấu hình gốc, out: đã chuẩn hoá. */
function normalizeSwiss(c, out) {
  if (out.type !== 'swiss' || out.record) return;
  if (NEW.includes(c.pairing)) out.pairing = c.pairing;
  if (Array.isArray(c.pairingByRound) && c.pairingByRound.some((x) => MODES.includes(x))) out.pairingByRound = c.pairingByRound.slice(0, MAX_ROUNDS).map((x) => (MODES.includes(x) ? x : null));
  const usesBaku = out.pairing === 'baku' || (out.pairingByRound || []).includes('baku');
  if (usesBaku) {
    const v = Array.isArray(c.baku && c.baku.virtual) ? c.baku.virtual : BAKU;
    out.baku = { virtual: v.slice(0, 6).map((x) => ({ from: int(x && x.from, 1, MAX_ROUNDS, 1), to: int(x && x.to, 1, MAX_ROUNDS, 1), pts: Math.max(0, Math.min(10, Math.round(Number(x && x.pts) * 2) / 2 || 0)) })).filter((x) => x.pts > 0 && x.to >= x.from) };
  }
  // Pod kiểu Magic: The Gathering (draft): chia pod `size` người, mỗi pod ghép `rounds` vòng trong nội bộ rồi chia lại pod
  if (c.pod && Number(c.pod.size) >= 4) out.pod = { size: int(c.pod.size, 4, 16, 8), rounds: int(c.pod.rounds, 1, 5, 3) };
  if (c.koth && Number(c.koth.rounds) > 0) {
    out.koth = { rounds: int(c.koth.rounds, 1, 5, 2) };
    if (c.gibson && Number(c.gibson.spots) > 0) out.gibson = { spots: int(c.gibson.spots, 1, 8, 2), swing: int(c.gibson.swing, 0, 100000, 1000) };
  }
  if (c.advanceMode === 'record') { out.advanceMode = 'record'; out.cutLosses = int(c.cutLosses, 0, 10, 2); }
}

/** Cách ghép của vòng r (0-based). */
function modeOf(cfg, r) {
  if (cfg.koth && cfg.rounds && r >= cfg.rounds - cfg.koth.rounds) return 'koth';
  const o = cfg.pairingByRound && cfg.pairingByRound[r];
  return o || cfg.pairing || 'dutch';
}
/** Điểm ảo Baku của vòng r cho nhóm GA (0 nếu ngoài lịch). */
const bakuPoints = (cfg, r) => ((cfg.baku && cfg.baku.virtual) || BAKU).filter((x) => r + 1 >= x.from && r + 1 <= x.to).reduce((a, x) => a + x.pts, 0);

/**
 * Thứ tự đối thủ nên thử cho người đứng đầu a (rest[0]). 'dutch' (FIDE): trong nhóm cùng điểm với a, chia nửa trên /
 * nửa dưới và ưu tiên người đầu nửa dưới (8 người: 1–5, 2–6, 3–7, 4–8), rồi lần lượt xa dần; sau đó các nhóm điểm thấp
 * hơn (người "trôi" xuống). Không có điểm (score) hoặc 'adjacent': theo thứ tự (1–2, 3–4…).
 */
function candidates(rest, score, mode) {
  const others = rest.slice(1);
  if (mode !== 'dutch' || !score) return others.map((_, i) => i);
  const top = score[rest[0]];
  let g = 1; // số người cùng điểm với a (kể cả a)
  while (g < rest.length && score[rest[g]] === top) g++;
  const half = Math.max(1, Math.floor(g / 2)); // vị trí trong rest của người đầu nửa dưới
  const order = [];
  for (let j = half; j < g; j++) order.push(j - 1);
  for (let j = half - 1; j >= 1; j--) order.push(j - 1);
  for (let j = g; j < rest.length; j++) order.push(j - 1);
  return order;
}

/** Người được miễn đấu (số lẻ): người thấp nhất chưa được miễn đấu. Trả { list (bỏ người đó), bye }. */
function takeBye(order, byes) {
  const list = [...order];
  let bye = null;
  if (list.length % 2) {
    for (let i = list.length - 1; i >= 0; i--) if (!byes[list[i]]) { bye = list[i]; break; }
    if (bye === null) bye = list[list.length - 1];
    list.splice(list.indexOf(bye), 1);
  }
  return { list, bye };
}

/**
 * Ghép một vòng Thụy Sĩ: cùng điểm gặp nhau, không gặp lại; số lẻ thì người thấp nhất chưa được miễn đấu được miễn.
 * mode 'dutch' + score (uid → điểm): nửa trên gặp nửa dưới trong mỗi nhóm điểm (candidates).
 */
function swissPairs(order, played, byes, mode, score) {
  const { list, bye } = takeBye(order, byes);
  const key = (x, y) => (x < y ? x + '|' + y : y + '|' + x);
  // Giới hạn số bước tìm (mô phỏng 30–36 người, 15 vòng: cần tới ~10⁶ bước, chậm nhất ~0,1 giây)
  let budget = 1000000;
  // Ghép từ trên xuống, ưu tiên người gần điểm nhất; allow = số cặp gặp lại còn được phép
  const dfs = (rest, allow) => {
    if (!rest.length) return [];
    if (--budget < 0) return null;
    const [a, ...others] = rest;
    for (const i of candidates(rest, score, mode)) {
      const again = played.has(key(a, others[i]));
      if (again && !allow) continue;
      const sub = dfs(others.filter((_, j) => j !== i), allow - (again ? 1 : 0));
      if (sub) return [[a, others[i]], ...sub];
    }
    return null;
  };
  let pairs = dfs(list, 0);
  // Không tránh được gặp lại: cho phép ít cặp gặp lại nhất có thể (1, 2, …)
  for (let allow = 1; !pairs && allow <= list.length / 2; allow++) { budget = 20000; pairs = dfs(list, allow); }
  if (!pairs) { // hết thời gian tìm: ghép lần lượt theo thứ hạng
    pairs = [];
    for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
  }
  return { pairs, bye };
}

/** Ghép thẳng 1–2, 3–4… theo thứ tự, cho gặp lại (Danish, King of the Hill). */
function straight(order, byes) {
  const { list, bye } = takeBye(order, byes);
  const pairs = [];
  for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
  return { pairs, bye };
}

/**
 * Gibsonization: người trong top `spots` đã chắc suất – kể cả thua hết `left` trận còn lại với chênh lệch −swing mỗi trận,
 * số người có thể vượt lên trên (thắng hết, +swing mỗi trận) vẫn ít hơn `spots`. Trả { clinched: [uid], out: [uid hết cơ hội] }.
 * list: bảng xếp hạng hiện tại; S: thống kê (pts, spread = gw − gl); win: điểm một trận thắng.
 */
function gibsonSplit(list, S, left, win, g) {
  const spread = (u) => S[u].gw - S[u].gl;
  const maxP = (u) => S[u].pts + left * win, maxS = (u) => spread(u) + left * g.swing;
  const minS = (u) => spread(u) - left * g.swing;
  // j có thể kết thúc trên i (i ở kịch bản xấu nhất, j ở kịch bản tốt nhất)
  const canAbove = (j, i) => maxP(j) > S[i].pts || (maxP(j) === S[i].pts && maxS(j) > minS(i));
  const clinched = list.slice(0, g.spots).filter((i) => list.filter((j) => j !== i && canAbove(j, i)).length < g.spots);
  // j hết cơ hội: đã có ít nhất `spots` người chắc chắn ở trên j
  const out = list.filter((j) => list.filter((i) => i !== j && !canAbove(j, i)).length >= g.spots);
  return { clinched, out };
}

/**
 * Ghép vòng r. ctx: { order (theo điểm rồi hạt giống), played (Set 'a|b'), byes, score, standings() → { list, stats }, seedIndex(u) }.
 * Trả { pairs, bye, tags: { 'a|b': 'koth' | 'gib' } }.
 */
function pair(st, r, ctx) {
  const cfg = st.cfg, mode = modeOf(cfg, r);
  if (cfg.pod) return podPair(st, r, ctx);
  if (mode === 'monrad' || mode === 'danish' || mode === 'koth') {
    const { list, stats } = ctx.standings();
    const active = list.filter((u) => ctx.order.includes(u));
    if (mode === 'monrad') return { ...swissPairs(active, ctx.played, ctx.byes, 'adjacent', null), tags: {} };
    if (mode === 'danish' || !cfg.gibson) return { ...straight(active, ctx.byes), tags: {} };
    // King of the Hill + Gibsonization
    const left = cfg.rounds - r, win = (cfg.points && cfg.points.w) || 1;
    const { clinched, out } = gibsonSplit(active, stats, left, win, cfg.gibson);
    st.gib = st.gib || {};
    for (const u of clinched) if (st.gib[u] == null) st.gib[u] = r;
    const { list: rest0, bye } = takeBye(active, ctx.byes);
    let rest = [...rest0];
    const pairs = [], tags = {};
    for (const u of clinched) {
      if (!rest.includes(u)) continue;
      rest = rest.filter((x) => x !== u);
      const opp = out.find((x) => rest.includes(x) && !clinched.includes(x)) || rest.find((x) => clinched.includes(x)) || null;
      if (opp === null) { rest.unshift(u); continue; } // không có ai để cách ly: ghép như thường
      rest = rest.filter((x) => x !== opp);
      pairs.push([u, opp]);
      tags[u + '|' + opp] = 'gib';
    }
    for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
    return { pairs, bye, tags };
  }
  if (mode === 'baku') {
    // Nhóm GA: nửa trên theo hạt giống đầu giai đoạn (cố định cả giai đoạn); điểm ghép cặp = điểm thật + điểm ảo của vòng
    const v = bakuPoints(cfg, r), ga = new Set(st.entrants.slice(0, Math.ceil(st.entrants.length / 2)));
    const ps = Object.fromEntries(ctx.order.map((u) => [u, ctx.score[u] + (ga.has(u) ? v : 0)]));
    const order = [...ctx.order].sort((a, b) => ps[b] - ps[a] || ctx.seedIndex(a) - ctx.seedIndex(b));
    st.pp = { r, v, ga: [...ga] }; // để trang giải ghi chú điểm ghép cặp
    return { ...swissPairs(order, ctx.played, ctx.byes, 'dutch', ps), tags: {} };
  }
  return { ...swissPairs(ctx.order, ctx.played, ctx.byes, mode === 'adjacent' ? 'adjacent' : 'dutch', ctx.score), tags: {} };
}

/**
 * Chia pod: `size` người một pod theo thứ tự (vòng đầu: hạt giống; sau đó: bảng xếp hạng – pod 1 là nhóm dẫn đầu); pod cuối
 * thiếu (< 6 người) gộp vào pod trước. Đổi pod mỗi cfg.pod.rounds vòng; ghép cặp chỉ trong pod (ưu tiên hơn "không gặp lại").
 */
function makePods(list, size) {
  const pods = [];
  for (let k = 0; k < list.length; k += size) pods.push(list.slice(k, k + size));
  if (pods.length > 1 && pods[pods.length - 1].length < Math.min(6, size)) pods[pods.length - 2].push(...pods.pop());
  return pods;
}
function podPair(st, r, ctx) {
  const P = st.cfg.pod, block = Math.floor(r / P.rounds);
  if (!st.pods || st.podBlock !== block) {
    const base = block === 0 ? st.entrants : ctx.standings().list;
    st.pods = makePods(base.filter((u) => ctx.order.includes(u)), P.size);
    st.podBlock = block;
    (st.podHist = st.podHist || [])[block] = st.pods.map((p) => [...p]);
    if (st.cfg.draft) DRF.seat(st, block, st.pods); // mỗi khối vòng là một phiên draft: bốc ghế
  }
  // Vòng đầu phiên draft: ghép người ngồi đối diện bàn (ghế 1 gặp ghế 5 ở pod 8 người)
  if (st.cfg.draft && st.cfg.draft.cross && r % P.rounds === 0 && st.drafts && st.drafts[block]) {
    const out = st.drafts[block].pods.map((p) => DRF.crossPairs(p.filter((u) => ctx.order.includes(u))));
    const { pairs: extra, bye } = spare(out.map((x) => x.bye), ctx);
    return { pairs: [...out.flatMap((x) => x.pairs), ...extra], bye, tags: {} };
  }
  const res = st.pods.map((pod) => swissPairs(ctx.order.filter((u) => pod.includes(u)), ctx.played, ctx.byes, 'dutch', ctx.score));
  const { pairs: extra, bye } = spare(res.map((x) => x.bye), ctx);
  return { pairs: [...res.flatMap((x) => x.pairs), ...extra], bye, tags: {} };
}

/**
 * Người lẻ của từng pod (có người rút nên nhiều pod cùng lẻ): ghép họ với nhau theo thứ tự xếp hạng, chỉ người còn lại cuối
 * cùng (nếu lẻ) được miễn đấu – không ai bị bỏ sót khỏi vòng.
 */
function spare(byes, ctx) {
  const left = byes.filter(Boolean).sort((a, b) => ctx.order.indexOf(a) - ctx.order.indexOf(b));
  if (left.length < 2) return { pairs: [], bye: left[0] || null };
  const res = swissPairs(left, ctx.played, ctx.byes, 'adjacent', null);
  return { pairs: res.pairs, bye: res.bye };
}

/** Người đi tiếp theo thành tích (cắt X-2): mọi người thua ≤ cutLosses trận, theo bảng xếp hạng. */
const recordCut = (list, stats, cutLosses) => list.filter((u) => real(u) && stats[u] && stats[u].l <= cutLosses);

module.exports = { makePods, MODES, NEW, BAKU, normalizeSwiss, modeOf, bakuPoints, candidates, swissPairs, straight, gibsonSplit, pair, recordCut };
