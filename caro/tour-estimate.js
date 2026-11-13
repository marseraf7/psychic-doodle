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
  // Số ván trung bình của một trận BoN (Bo1 = 1, Bo3 ≈ 2,5, Bo5 ≈ 4…): (3N + 1) / 4
  const gamesOf = (bo) => (bo ? (3 * bo + 1) / 4 : 0);
  const BREAK_MIN = 1; // nghỉ giữa hai lượt đấu (chờ trận chậm nhất, vào phòng)
  const STAGE_BREAK_MIN = 2; // giữa hai giai đoạn

  const log2up = (n) => { let k = 0; while ((1 << k) < n) k++; return k; };
  /** Số bảng vòng tròn (như groupCount ở stages-groups.js). */
  const MAX_BIG = 64; // bảng lớn của giải offline (stages-league.js)
  function groupCount(c, n) {
    if (c.league) return 1;
    if (c.season) return c.season.confs || 1;
    let G = c.groupSize ? Math.ceil(n / c.groupSize) : c.groups || 1;
    G = Math.max(G, Math.ceil(n / (c.big ? MAX_BIG : MAX_GROUP)));
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
    } else if (!c.rep && (Array.isArray(c.places) ? c.places.includes(3) : c.thirdPlace !== false) && size >= 4) play(losers[losers.length - 2][0], losers[losers.length - 2][1], out);
    // Vòng vớt kiểu Olympic (server/src/hub/stages-repechage.js – extraMatches): mỗi phía p người vớt → p trận (thang + tranh đồng)
    if (c.rep && size >= 8) {
      const R = Math.round(Math.log2(size)), from = Math.max(0, R - ({ qf: 3, r16: 4, r32: 5 }[c.rep.from] || 3));
      let p = 0;
      for (let r = from; r < R - 2; r++) p += c.rep.mode === 'half' ? (size >> (r + 1)) / 2 : 1;
      const x = 2 * Math.max(1, p);
      return { matches: out.m + x, maxMatches: out.m + x, waves: out.w + Math.max(1, p), advance: null };
    }
    return { matches: out.m, maxMatches: out.m, waves: out.w, advance: null };
  }
  /**
   * Playoff kiểu nhà nghề Mỹ (server/src/hub/stages-playoff.js): n = số đội mùa giải cho đi tiếp (số miền × need).
   * Mỗi miền một nửa nhánh cỡ lũy thừa 2; play-in: NBA 3 trận / miền (2 lượt), MLS 1 trận / miền.
   */
  function playoff(c, n) {
    const po = c.playoff, PI = { nba: 2, one: 1 };
    const main = po.mode === 'div' ? 8 : Number(po.per) || 8;
    const need = main + (po.mode === 'div' ? 0 : PI[po.playin] || 0);
    const C = Math.max(1, Math.round(n / need));
    const base = single({ ...c, playoff: null }, C * main);
    const size = pow2(C) * pow2(main), lift = Math.log2(size) - Math.log2(pow2(Math.max(2, C * main)));
    const pre = po.mode === 'div' ? 0 : po.playin === 'nba' ? 3 * C : po.playin === 'one' ? C : 0;
    const preW = pre ? (po.playin === 'nba' ? 2 : 1) : 0;
    return { matches: base.matches + pre, maxMatches: base.matches + pre, waves: base.waves + lift + preW, advance: null };
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
    // Loại trực tiếp không phải giai đoạn cuối (giải offline – vòng loại đội thách đấu): đi tiếp theo thứ hạng chung cuộc
    const elimAdv = (s) => (last ? s : { ...s, advance: Math.min(n, Math.max(1, Number(c.advance) || 1)) });
    if (c.type === 'single') return elimAdv(c.playoff ? playoff(c, n) : single(c, n));
    if (c.type === 'double') return elimAdv(double(c, n));
    // Hệ Race (giải offline): mỗi chặng cả đoàn thi một lần
    // Bảng đấu loại kép 4 đội kiểu GSL (giải offline): mỗi bảng 5 trận trong 3 lượt, nhất và nhì bảng đi tiếp
    // (bảng 8 đội: 10 trận, 4 đội đi tiếp)
    if (c.type === 'gsl') { const K = Number(c.size) === 8 ? 8 : 4, G = Math.floor(n / K), per = K === 8 ? 10 : 5; return { matches: per * G, maxMatches: per * G, waves: 3, advance: last ? null : (c.keepAll || c.eliminates === false ? K : K / 2) * G, groups: G, groupSize: K }; }
    // Vòng tranh hạt giống + cơ hội cuối (giải offline – stages-kings.js): mỗi nửa cao gặp thấp, 3/4 số đội đi tiếp
    // Nhánh đồ thị (Page, AFL, thang leo bậc, loại kép lai, Compass – caro/otour-graph.js): số trận theo khuôn
    if (c.type === 'graph') {
      const GR = typeof module !== 'undefined' && module.exports ? require('./otour-graph.js') : global.CaroOTourGraph;
      const x = GR ? GR.count(c.shape, n, c) : null;
      const m = x ? x.matches : 0;
      return { matches: m, maxMatches: m, waves: x ? x.waves : 0, advance: last ? null : Math.min(n, Math.max(1, Number(c.advance) || 1)), ...(x ? {} : { bad: true }) };
    }
    // Pool loại kép xếp tầng (kiểu EVO – server/src/hub/stages-pools.js): mỗi pool đấu tới khi còn `out` người mỗi phía
    if (c.type === 'pools') {
      const pool = [8, 16, 32].includes(Number(c.pool)) ? Number(c.pool) : 16, out = Math.max(1, Number(c.out) || 2), P = Math.max(1, Math.ceil(n / pool));
      let m = 0, w = 0;
      for (let g = 0; g < P; g++) {
        const s = Math.ceil((n - g) / P), size = pow2(Math.max(4, s)), rw = Math.log2(size / out) - 1;
        for (let r = 0; r <= rw; r++) m += size >> (r + 1);
        for (let j = 0; j <= 2 * rw - 1; j++) m += (size / 4) / 2 ** Math.floor(j / 2);
        m -= size - s;
        w = Math.max(w, 2 * rw + 1);
      }
      return { matches: Math.max(0, m), maxMatches: Math.max(0, m), waves: w, advance: last ? null : Math.min(n, 2 * out * P) };
    }
    if (c.type === 'kings') { const m = Math.floor(n / 4) * 2; return { matches: m, maxMatches: m, waves: 1, advance: last ? null : Math.floor(n / 4) * 3 }; }
    // Chia bảng cố định (sinh tồn kiểu PGC): mỗi bảng `events` trận; đi tiếp mỗi bảng. Hệ Circuit: `events` trận × n vòng × days ngày
    // Vòng tuần (PGC 2021): mỗi tuần seats trận Survival + final trận Weekly Final + bottom trận Bottom (trừ tuần cuối)
    const weeklyEvents = (W) => { const w = Number(W.weeks) || 3, s = Number(W.seats) || 16, f = Number(W.final) || 10, b = W.bottom != null ? Number(W.bottom) : 6; return w * (s + f) + (w - 1) * b; };
    if (c.type === 'race') { const G = Number(c.groups) >= 2 ? Number(c.groups) : 1, ci = c.circuit ? (Number(c.circuit.n) || 1) * (Number(c.circuit.days) || 1) : 1, wk = c.weekly ? weeklyEvents(c.weekly) : 0, ev = wk || (Number(c.events) || 1) * G * ci; return { matches: ev, maxMatches: ev, waves: ev, advance: last ? null : Math.min(n, (c.advance || 0) * G), ...(G > 1 ? { groups: G } : {}) }; }
    if (c.type === 'roundrobin' && c.season) {
      // Mùa giải kiểu Mỹ (caro/otour-season.js): số trận chính xác; lịch xếp tham lam dài hơn số trận mỗi đội ~5%
      const SS = typeof module !== 'undefined' && module.exports ? require('./otour-season.js') : global.CaroOTourSeason;
      const info = SS ? SS.seasonInfo(c.season, n) : null;
      const per = info && !info.error ? info.perTeam : 0, matches = info && !info.error ? info.matches : 0;
      const G = (info && info.confs) || 1;
      return { matches, maxMatches: matches, waves: per + Math.ceil(per / 20), advance: last ? null : Math.min(n, (c.advance || 0) * G), groups: G, groupSize: Math.ceil(n / G) };
    }
    if (c.type === 'roundrobin' && c.league) {
      // League phase: mỗi đội gặp `games` đối thủ; lịch xếp tham lam thường dài hơn số trận mỗi đội 1–2 lượt
      const g = Math.min(Number(c.league.games) || 8, n - 1), matches = Math.floor((n * g) / 2);
      return { matches, maxMatches: matches, waves: g + 1, advance: last ? null : Math.min(n, (c.advance || 0) + (c.bestNext || 0)), groups: 1, groupSize: n };
    }
    if (c.type === 'roundrobin') {
      const G = groupCount(c, n), sizes = groupSizes(n, G), meet = [2, 3, 4].includes(Number(c.meetings)) ? Number(c.meetings) : 1;
      const big = sizes[0];
      // meetSmall: bảng ít đội hơn bảng đông nhất gặp nhau meetSmall lần (kiểu MSI 2021–2022)
      const mOf = (s) => (Number(c.meetSmall) >= 1 && s < big ? Number(c.meetSmall) : meet);
      // + playoff từng chặng (cfg.splits – kiểu OWL, server/src/hub/stages-splits.js): mỗi chặng take − 1 trận
      const sp = c.splits && G === 1 ? (Number(c.splits.n) || 4) * Math.max(0, Math.min(16, Number(c.splits.take) || 4) - 1) : 0;
      const matches = sizes.reduce((t, s) => t + mOf(s) * (s * (s - 1)) / 2, 0) + sp;
      // + các đội đứng ngay sau suất đi tiếp tốt nhất (bestNext – mỗi bảng tối đa một đội)
      const adv = last ? null : sizes.reduce((t, s) => t + Math.min(c.advance || 0, s), 0) + Math.min(c.bestNext || 0, sizes.filter((s) => s > (c.advance || 0)).length);
      return { matches, maxMatches: matches, waves: meet * (big % 2 ? big : big - 1), advance: adv, groups: G, groupSize: big };
    }
    if (c.record) return recordSwiss(c, n, last);
    // Thụy Sĩ: 0 vòng = tự động ⌈log₂ n⌉; số vòng bị giới hạn khi ít người
    const rounds = Math.min(c.rounds || Math.max(1, Math.ceil(Math.log2(n))), swissMax(n));
    const matches = rounds * Math.floor(n / 2);
    // Cắt theo số thua (kiểu VGC X-2 – stages-pairing.js): số người qua chỉ biết khi xong; ước tính bằng kỳ vọng khi mỗi trận
    // thắng / thua 50–50 (số thua ~ nhị thức(rounds, ½))
    if (c.advanceMode === 'record' && !last) {
      const X = Math.max(0, Number(c.cutLosses) || 0);
      let p = 0, comb = 1;
      for (let k = 0; k <= Math.min(X, rounds); k++) { p += comb / 2 ** rounds; comb = (comb * (rounds - k)) / (k + 1); }
      return { matches, maxMatches: matches, waves: rounds, rounds, advance: Math.max(2, Math.min(n, Math.round(n * p))), cut: true };
    }
    return { matches, maxMatches: matches, waves: rounds, rounds, advance: last ? null : Math.min(c.advance || 0, n) };
  }

  /**
   * Thụy Sĩ theo số thắng / thua (LoL: 3 thắng đi tiếp, 3 thua bị loại): mô phỏng các nhóm cùng thành tích – mỗi nhóm
   * chia đôi thắng / thua mỗi lượt (lẻ: người dư được miễn đấu, tính thắng).
   */
  function recordSwiss(c, n, last) {
    const win = Number(c.record.win) || 3, lose = Number(c.record.lose) || 3;
    let b = new Map([['0:0', n]]), matches = 0, waves = 0, adv = 0;
    while (b.size && waves < win + lose) {
      const nb = new Map(), add = (w, l, k) => {
        if (!k) return;
        if (w >= win) adv += k; else if (l < lose) nb.set(w + ':' + l, (nb.get(w + ':' + l) || 0) + k);
      };
      for (const [key, k] of b) {
        const [w, l] = key.split(':').map(Number), pairs = Math.floor(k / 2);
        matches += pairs;
        add(w + 1, l, pairs + (k % 2));
        add(w, l + 1, pairs);
      }
      b = nb;
      waves++;
    }
    return { matches, maxMatches: matches, waves, rounds: waves, advance: last ? null : Math.max(2, adv) };
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
    // Giải offline: đội hạt giống vào thẳng giai đoạn sau (cfg.direct) – không đá các giai đoạn trước
    const direct = list.map((c, i) => (i ? Math.max(0, Math.floor(Number(c.direct) || 0)) : 0));
    n = Math.max(0, n - direct.reduce((a, b) => a + b, 0));
    const per = gameMinutes(timeLimit, clock);
    const out = { stages: [], matches: 0, maxMatches: 0, waves: 0, minutes: 0 };
    list.forEach((c, i) => {
      const last = i === list.length - 1;
      const s = { ...stage(c, n, last), players: n };
      // Bo riêng chung kết / bán kết (nếu đặt) cho 1–2 lượt cuối của nhánh đấu
      const waves = s.maxWaves || s.waves, g = (bo) => gamesOf(bo) || gamesOf(c.bestOf) || 1;
      const extra = (waves >= 1 ? g(c.boFinal) - g(c.bestOf) : 0) + (waves >= 2 ? g(c.boSemi) - g(c.bestOf) : 0);
      s.minutes = waves * (g(c.bestOf) * per + BREAK_MIN) + extra * per;
      out.stages.push(s);
      out.matches += s.matches;
      out.maxMatches += s.maxMatches;
      out.waves += s.maxWaves || s.waves;
      out.minutes += s.minutes + (i ? STAGE_BREAK_MIN : 0);
      // cfg.skip: các đội đầu vào thẳng giai đoạn sau nữa (vòng tròn nhiều bảng: mỗi bảng) – không đá giai đoạn kế tiếp
      const sk = Math.max(0, Math.floor(Number(c.skip) || 0));
      if (sk && i + 2 < list.length) {
        const tot = Math.min(sk * (c.type === 'roundrobin' || c.type === 'gsl' || c.type === 'race' ? s.groups || 1 : 1), Math.max(0, n - 1));
        s.skip = tot; direct[i + 2] += tot;
        if (c.type === 'gsl') s.advance = Math.max(0, s.advance - tot); // bảng GSL: số đi tiếp cố định, đội vào thẳng tính trong đó
      }
      // routes: các dải hạng đầu sang giai đoạn `to` (mỗi bảng với vòng tròn / bảng GSL / sinh tồn chia bảng)
      for (const r of Array.isArray(c.routes) ? c.routes : []) {
        if (!(r && r.n > 0 && r.to > i + 1 && r.to < list.length)) continue;
        const per = c.type === 'roundrobin' || c.type === 'gsl' || c.type === 'race' ? s.groups || 1 : 1;
        const tot = Math.min(r.n * per, Math.max(0, n));
        direct[r.to] += tot;
        s.routed = (s.routed || 0) + tot;
        if (c.type === 'gsl') s.advance = Math.max(0, s.advance - tot); // bảng GSL: số đi tiếp cố định, phần chuyển đi tính trong đó
      }
      if (!last) n = s.advance + direct[i + 1];
    });
    out.minutes = Math.round(out.minutes);
    return out;
  }

  const CaroTourEstimate = { estimate, stage, gameMinutes, groupCount, groupSizes };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroTourEstimate;
  else global.CaroTourEstimate = CaroTourEstimate;
})(typeof window !== 'undefined' ? window : globalThis);
