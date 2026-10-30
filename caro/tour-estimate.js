/*
 * Ước tính quy mô một giải theo giai đoạn (dùng chung trình duyệt và máy chủ – hàm thuần, không phụ thuộc mạng):
 * số trận, số lượt đấu nối tiếp (vòng), số người đi tiếp từng giai đoạn, thời gian ước tính.
 * Như MyLeague ("Đối với cấu hình này thì số lượng trận đấu của giải là: N"), cập nhật ngay khi đổi cấu hình.
 * Khớp cách máy chủ dựng giải (server/src/hub/stages*.js): nhánh đấu mô phỏng đường đi từng ô (trận xếp hạng, split,
 * chung kết tổng); vòng tròn / Thụy Sĩ theo công thức. server/test/estimate.test.js mô phỏng cả giải để kiểm lại.
 * Trận miễn đấu không tính.
 *   CaroTourEstimate.estimate({ stages, players, timeLimit, clock }) → { stages: [...], matches, maxMatches, waves, minutes }
 */
(function (global) {
  'use strict';
  const MAX_GROUP = 16; // như stages-base.js
  const MAX_GROUPS = 64;
  /** Số ván trung bình của một trận BoN (Bo3 thường 2–3 ván, Bo5 thường 3–5 ván). */
  const GAMES = { 1: 1, 3: 2.5, 5: 4 };
  const BREAK_MIN = 1; // nghỉ giữa hai lượt đấu (chờ trận chậm nhất, vào phòng)
  const STAGE_BREAK_MIN = 2; // giữa hai giai đoạn

  const log2up = (n) => { let k = 0; while ((1 << k) < n) k++; return k; };
  /** Số bảng vòng tròn (như groupCount ở stages-groups.js). */
  function groupCount(c, n) {
    let G = c.groupSize ? Math.ceil(n / c.groupSize) : c.groups || 1;
    G = Math.max(G, Math.ceil(n / MAX_GROUP));
    return Math.max(1, Math.min(G, Math.floor(n / 2), MAX_GROUPS));
  }
  /** Cỡ từng bảng khi chia đều n người vào G bảng. */
  const groupSizes = (n, G) => Array.from({ length: G }, (_, i) => Math.floor(n / G) + (i < n % G ? 1 : 0));
  /** Số vòng Thụy Sĩ tối đa có nghĩa với n người (như swissMaxRounds ở stages-groups.js). */
  const swissMax = (n) => (n <= 4 ? Math.max(1, n % 2 ? n : n - 1) : Math.ceil(n / 2));

  // ---- Nhánh đấu: mô phỏng đường đi của từng ô (người thật / trống) như stages-elim.js. Mỗi ô có t = lượt đấu mà
  // người ở ô đó sẵn sàng; trận giữa hai người thật đấu ở lượt max(t) + 1, trận có ô trống tự xử ngay.
  const pow2 = (n) => { let s = 2; while (s < n) s *= 2; return s; };
  function seedOrder(size) {
    let o = [1];
    while (o.length < size) { const n = o.length * 2; o = o.flatMap((s) => [s, n + 1 - s]); }
    return o;
  }
  /** Một trận: trả [ô người thắng, ô người thua]; out đếm số trận thật và lượt muộn nhất. */
  function play(a, b, out) {
    const t = Math.max(a.t, b.t);
    if (a.real && b.real) { out.m++; out.w = Math.max(out.w, t + 1); return [{ real: true, t: t + 1 }, { real: true, t: t + 1 }]; }
    return [{ real: a.real || b.real, t }, { real: false, t }];
  }
  /** Nhánh loại trực tiếp trên các ô (cặp liền nhau), tối đa K vòng; trả danh sách người thua từng vòng. */
  function knockout(slots, out, K = Infinity) {
    let cur = slots;
    const losers = [];
    while (cur.length > 1 && losers.length < K) {
      const next = [], lo = [];
      for (let i = 0; i < cur.length; i += 2) { const [w, l] = play(cur[i], cur[i + 1], out); next.push(w); lo.push(l); }
      losers.push(lo);
      cur = next;
    }
    return losers;
  }
  /** Hạng nào cần phân định (như placeWanted ở stages-elim.js): mọi vị trí / các cặp hạng đã chọn / chỉ hạng ba. */
  function placeWanted(c) {
    if (c.placement) return () => true;
    const list = Array.isArray(c.places) ? c.places : c.thirdPlace !== false ? [3] : [];
    return (lo, k) => list.some((p) => p >= lo && p < lo + k);
  }
  /** Trận xếp hạng (như placement ở stages-elim.js): nhánh phân hạng base … base + n − 1, chỉ các vòng còn cần. */
  function placeBracket(slots, base, want, out) {
    const n = slots.length, R = Math.log2(n);
    if (n < 2 || !want(base, n)) return;
    let K = 0;
    while (K < R && want(base, n >> K)) K++;
    const losers = knockout(slots, out, K);
    for (let r = 0; r < K && r < R - 1; r++) placeBracket(losers[r], base + (n >> (r + 1)), want, out);
  }
  const firstSlots = (n, size) => seedOrder(size).map((sd) => ({ real: sd <= n, t: 0 }));
  function single(c, n) {
    const out = { m: 0, w: 0 };
    const size = pow2(Math.max(2, n));
    const losers = knockout(firstSlots(n, size), out);
    const want = placeWanted(c);
    if (size >= 4 && (c.placement || (c.places || []).some((p) => p > 3))) {
      for (let r = 0; r < losers.length - 1; r++) placeBracket(losers[r], (size >> (r + 1)) + 1, want, out);
    } else if ((Array.isArray(c.places) ? c.places.includes(3) : c.thirdPlace !== false) && size >= 4) play(losers[losers.length - 2][0], losers[losers.length - 2][1], out);
    return { matches: out.m, maxMatches: out.m, waves: out.w, advance: null };
  }
  /** Nhánh thắng – thua: dựng đủ các trận như buildDouble rồi lan dần kết quả tới khi không còn trận nào xử được. */
  function double(c, n) {
    const size = pow2(Math.max(4, n)), k = Math.log2(size), nL = 2 * (k - 1);
    const M = {}; // id → { a, b, next, loserTo }
    const add = (id, x) => { M[id] = { a: null, b: null, ...x }; };
    const gf = c.gf || (c.reset === false ? '1' : '2');
    if (gf !== 'none') add('gf', {});
    const lbCount = [];
    for (let j = 0; j < nL; j++) lbCount.push(j === 0 ? size / 4 : j % 2 ? lbCount[j - 1] : lbCount[j - 1] / 2);
    for (let j = 0; j < nL; j++) {
      for (let i = 0; i < lbCount[j]; i++) {
        const next = j === nL - 1 ? (gf !== 'none' ? ['gf', 'b'] : null) : j % 2 === 0 ? [`l${j + 1}.${i}`, 'a'] : [`l${j + 1}.${i >> 1}`, i % 2 ? 'b' : 'a'];
        add(`l${j}.${i}`, { next });
      }
    }
    for (let r = 0; r < k; r++) {
      const cnt = size >> (r + 1);
      for (let i = 0; i < cnt; i++) {
        const next = r < k - 1 ? [`w${r + 1}.${i >> 1}`, i % 2 ? 'b' : 'a'] : gf !== 'none' ? ['gf', 'a'] : null;
        const loserTo = r === 0 ? [`l0.${i >> 1}`, i % 2 ? 'b' : 'a'] : [`l${2 * r - 1}.${r % 2 === 1 ? cnt - 1 - i : i}`, 'b'];
        add(`w${r}.${i}`, { next, loserTo });
      }
    }
    const slots = firstSlots(n, size);
    const out = { m: 0, w: 0 };
    const put = (ref, v) => { if (ref) M[ref[0]][ref[1]] = v; };
    for (let i = 0; i < size / 2; i++) {
      const m = M[`w0.${i}`];
      m.a = slots[2 * i]; m.b = slots[2 * i + 1];
      // Split: trận vòng 1 nhánh thắng không đấu – hạt giống cao đi tiếp, hạt giống thấp xuống nhánh thua
      if (c.split && m.a.real && m.b.real) { m.done = true; put(m.next, { real: true, t: 0 }); put(m.loserTo, { real: true, t: 0 }); }
    }
    for (let changed = true; changed;) {
      changed = false;
      for (const m of Object.values(M)) {
        if (m.done || !m.a || !m.b) continue;
        const [w, l] = play(m.a, m.b, out);
        m.done = true;
        put(m.next, w);
        put(m.loserTo, l);
        changed = true;
      }
    }
    const reset = gf === '2' && M.gf && M.gf.a.real && M.gf.b.real ? 1 : 0;
    return { matches: out.m, maxMatches: out.m + reset, waves: out.w, maxWaves: out.w + reset, advance: null };
  }

  /** Một giai đoạn với n người: { matches, maxMatches, waves, advance, rounds?, groups? }. */
  function stage(c, n, last) {
    if (n < 2) return { matches: 0, maxMatches: 0, waves: 0, advance: n };
    if (c.type === 'single') return single(c, n);
    if (c.type === 'double') return double(c, n);
    if (c.type === 'roundrobin') {
      const G = groupCount(c, n), sizes = groupSizes(n, G), meet = [2, 3].includes(Number(c.meetings)) ? Number(c.meetings) : 1;
      const big = sizes[0];
      const matches = meet * sizes.reduce((t, s) => t + (s * (s - 1)) / 2, 0);
      const adv = last ? null : sizes.reduce((t, s) => t + Math.min(c.advance || 0, s), 0);
      return { matches, maxMatches: matches, waves: meet * (big % 2 ? big : big - 1), advance: adv, groups: G, groupSize: big };
    }
    // Thụy Sĩ: 0 vòng = tự động ⌈log₂ n⌉; số vòng bị giới hạn khi ít người
    const rounds = Math.min(c.rounds || Math.max(1, Math.ceil(Math.log2(n))), swissMax(n));
    const matches = rounds * Math.floor(n / 2);
    return { matches, maxMatches: matches, waves: rounds, rounds, advance: last ? null : Math.min(c.advance || 0, n) };
  }

  /** Thời gian trung bình của một ván (phút): giới hạn mỗi nước timeLimit giây, hoặc đồng hồ '5+3'. */
  function gameMinutes(timeLimit, clock) {
    const m = /^(\d+)\+(\d+)$/.exec(String(clock || ''));
    // Ván caro thường ~45 nước cả hai bên; mỗi nước dùng ~45% giới hạn, đồng hồ tổng dùng ~60% thời gian gốc
    if (m) return 2 * (0.6 * Number(m[1]) + (22 * Number(m[2])) / 60);
    return (45 * 0.45 * (Number(timeLimit) || 20)) / 60;
  }

  function estimate({ stages, players, timeLimit, clock }) {
    const list = Array.isArray(stages) ? stages : [];
    let n = Math.max(0, Math.floor(Number(players) || 0));
    const per = gameMinutes(timeLimit, clock);
    const out = { stages: [], matches: 0, maxMatches: 0, waves: 0, minutes: 0 };
    list.forEach((c, i) => {
      const last = i === list.length - 1;
      const s = { ...stage(c, n, last), players: n };
      // Bo riêng chung kết / bán kết (nếu đặt) cho 1–2 lượt cuối của nhánh đấu
      const waves = s.maxWaves || s.waves, g = (bo) => GAMES[bo] || GAMES[c.bestOf] || 1;
      const extra = (waves >= 1 ? g(c.boFinal) - g(c.bestOf) : 0) + (waves >= 2 ? g(c.boSemi) - g(c.bestOf) : 0);
      s.minutes = waves * (g(c.bestOf) * per + BREAK_MIN) + extra * per;
      out.stages.push(s);
      out.matches += s.matches;
      out.maxMatches += s.maxMatches;
      out.waves += s.maxWaves || s.waves;
      out.minutes += s.minutes + (i ? STAGE_BREAK_MIN : 0);
      if (!last) n = s.advance;
    });
    out.minutes = Math.round(out.minutes);
    return out;
  }

  const CaroTourEstimate = { estimate, stage, gameMinutes, groupCount, groupSizes };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroTourEstimate;
  else global.CaroTourEstimate = CaroTourEstimate;
})(typeof window !== 'undefined' ? window : globalThis);
