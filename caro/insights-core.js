/*
 * Thống kê cá nhân (Personal Insights) – phần tính toán thuần, không đụng DOM.
 * Dùng chung: máy chủ (server/src/hub/insights.js – ván đã lưu của tài khoản) và trình duyệt (window.CaroInsightsCore –
 * ván lưu trên máy cho khách: local-games.js; kết quả phân tích lưu trên máy: insights-an.js).
 *   aggregate(games)      → thắng / hoà / thua theo màu quân, luật, loại thời gian, sức đối thủ, khai cuộc, độ dài ván
 *   anAggregate(list)     → xu hướng độ chính xác + kiểu lỗi hay gặp (chỉ các ván đã phân tích)
 *   anSummary(result)     → bản gọn của kết quả analysis.js để lưu (độ chính xác, số lỗi, lỗi theo giai đoạn ván)
 *   openingKey(moves, k)  → khoá khai cuộc k nước đầu, giống nhau khi dời / xoay / lật bàn (eval-key.js canon)
 *   band(my, opp)         → nhóm sức đối thủ so với mình (điểm chênh)
 *   hash(moves)           → mã ngắn của chuỗi nước đi (khớp ván máy chủ với kết quả phân tích lưu trên máy)
 * games: [{ at, rule, pool, side: 1 | 2, res: 'win' | 'loss' | 'draw', moves: [[x, y], …] | null, n, band }].
 */
(function (global) {
  'use strict';
  const K = global.CaroEvalKey || (typeof require === 'function' ? require('./eval-key.js') : null);

  const RULES = ['vn', 'free', 'std', 'renju'];
  const POOLS = ['bullet', 'blitz', 'rapid', 'classical', 'none'];
  const BANDS = ['much_weaker', 'weaker', 'equal', 'stronger', 'much_stronger', 'unknown'];
  const LENS = ['l1', 'l2', 'l3', 'l4']; // < 20 · 20–39 · 40–59 · ≥ 60 nước
  const OPEN_K = 4; // khai cuộc: 4 nước đầu
  const TOP_OPENINGS = 8;
  const MIST = ['inacc', 'mistake', 'blunder', 'miss'];

  const zero = () => ({ w: 0, d: 0, l: 0 });
  const add = (o, res) => { o[res === 'win' ? 'w' : res === 'draw' ? 'd' : 'l']++; };

  /** Nhóm sức đối thủ theo điểm chênh (đối thủ − mình); không rõ điểm (khách, tài khoản đã xoá, máy) → 'unknown'. */
  function band(my, opp) {
    if (!(my > 0) || !(opp > 0)) return 'unknown';
    const d = opp - my;
    return d <= -200 ? 'much_weaker' : d < -50 ? 'weaker' : d <= 50 ? 'equal' : d < 200 ? 'stronger' : 'much_stronger';
  }

  const lenBucket = (n) => (n < 20 ? 'l1' : n < 40 ? 'l2' : n < 60 ? 'l3' : 'l4');

  /** FNV-1a 32 bit của chuỗi nước đi, viết cơ số 36 – trình duyệt và máy chủ ra cùng một mã. */
  function hash(moves) {
    const s = JSON.stringify(moves || []);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }

  /**
   * Khoá khai cuộc k nước đầu (X đi trước), đã chuẩn hoá theo 8 phép đối xứng và phép dời: hai ván mở đầu giống nhau
   * sau khi xoay / lật bàn có cùng khoá. Trả { key, cells: [[x, y, 1 | 2], …] (toạ độ trong thế chuẩn) } hoặc null.
   */
  function openingKey(moves, k) {
    k = k || OPEN_K;
    if (!K || !Array.isArray(moves) || moves.length < k) return null;
    const head = moves.slice(0, k);
    const c = K.canon(head);
    const cells = head.map((m, i) => { const [x, y] = K.toCanon(c, m); return [x, y, i % 2 ? 2 : 1]; });
    return { key: c.key, cells };
  }

  /** Thống kê thắng / hoà / thua theo từng mục. */
  function aggregate(games) {
    const out = {
      n: 0, total: zero(), color: { 1: zero(), 2: zero() }, rule: {}, pool: {}, band: {}, len: {}, openings: [],
    };
    const op = new Map();
    for (const g of games || []) {
      if (!g || ![1, 2].includes(g.side) || !['win', 'loss', 'draw'].includes(g.res)) continue;
      out.n++;
      add(out.total, g.res);
      add(out.color[g.side], g.res);
      const rule = RULES.includes(g.rule) ? g.rule : 'vn';
      add(out.rule[rule] || (out.rule[rule] = zero()), g.res);
      const pool = POOLS.includes(g.pool) ? g.pool : 'none';
      add(out.pool[pool] || (out.pool[pool] = zero()), g.res);
      const b = BANDS.includes(g.band) ? g.band : 'unknown';
      add(out.band[b] || (out.band[b] = zero()), g.res);
      const n = Array.isArray(g.moves) ? g.moves.length : Number(g.n) || 0;
      const lb = lenBucket(n);
      add(out.len[lb] || (out.len[lb] = zero()), g.res);
      // Khai cuộc chỉ so trong cùng luật (Renju / luật Việt Nam mở đầu khác nhau)
      const o = openingKey(g.moves);
      if (o) {
        const key = rule + '|' + o.key;
        let e = op.get(key);
        if (!e) { e = { key, rule, cells: o.cells, ...zero(), x: 0 }; op.set(key, e); }
        add(e, g.res);
        if (g.side === 1) e.x++;
      }
    }
    out.openings = [...op.values()]
      .sort((a, b) => b.w + b.d + b.l - (a.w + a.d + a.l) || b.w - a.w || (a.key < b.key ? -1 : 1))
      .slice(0, TOP_OPENINGS);
    return out;
  }

  /** Giai đoạn của nước thứ i (0-based): khai cuộc < 10 nước, trung cuộc < 30, tàn cuộc. */
  const phaseOf = (i) => (i < 10 ? 0 : i < 30 ? 1 : 2);

  /**
   * Bản gọn của kết quả phân tích (analysis.js analyzeGame): { a: { 1, 2 } độ chính xác, c: { 1: {…}, 2: {…} } số nước
   * từng loại lỗi, ph: { 1: [khai, trung, tàn], 2: […] } số lỗi (sai lầm, sai lầm nặng, bỏ lỡ) theo giai đoạn ván }.
   */
  function anSummary(res) {
    if (!res || !res.acc || !Array.isArray(res.moves)) return null;
    const c = { 1: {}, 2: {} }, ph = { 1: [0, 0, 0], 2: [0, 0, 0] };
    for (const m of res.moves) {
      if (!m || ![1, 2].includes(m.p) || !MIST.includes(m.cls)) continue;
      c[m.p][m.cls] = (c[m.p][m.cls] || 0) + 1;
      if (m.cls !== 'inacc') ph[m.p][phaseOf(m.i)]++;
    }
    return { a: { 1: Math.round(res.acc[1]), 2: Math.round(res.acc[2]) }, c, ph };
  }

  /**
   * Xu hướng độ chính xác + kiểu lỗi của người chơi qua các ván đã phân tích.
   * list: [{ at, side, s: anSummary }] → { n, trend: [[at, %], …] (cũ → mới), avg, mist: { inacc, … }, ph: [3], per: lỗi / ván }.
   */
  function anAggregate(list) {
    const ok = (list || []).filter((g) => g && g.s && g.s.a && [1, 2].includes(g.side) && Number.isFinite(g.s.a[g.side]));
    ok.sort((a, b) => (a.at || 0) - (b.at || 0));
    const mist = { inacc: 0, mistake: 0, blunder: 0, miss: 0 }, ph = [0, 0, 0];
    let sum = 0;
    for (const g of ok) {
      sum += g.s.a[g.side];
      const c = (g.s.c && g.s.c[g.side]) || {};
      for (const k of MIST) mist[k] += c[k] || 0;
      const p = (g.s.ph && g.s.ph[g.side]) || [];
      for (let i = 0; i < 3; i++) ph[i] += p[i] || 0;
    }
    const n = ok.length;
    const top = MIST.slice().sort((a, b) => mist[b] - mist[a])[0];
    return {
      n, avg: n ? Math.round(sum / n) : 0, mist, ph,
      top: n && mist[top] ? top : null,
      trend: ok.map((g) => [g.at || 0, g.s.a[g.side]]),
    };
  }

  /** Tỉ lệ thắng (%) của một mục { w, d, l } – hoà tính nửa ván. */
  const score = (o) => { const t = o.w + o.d + o.l; return t ? Math.round(((o.w + o.d / 2) / t) * 100) : 0; };

  const CaroInsightsCore = { aggregate, anAggregate, anSummary, openingKey, band, lenBucket, hash, score, phaseOf, RULES, POOLS, BANDS, LENS, MIST, OPEN_K };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroInsightsCore;
  else global.CaroInsightsCore = CaroInsightsCore;
})(typeof window !== 'undefined' ? window : globalThis);
