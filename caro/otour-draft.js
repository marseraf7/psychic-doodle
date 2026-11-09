/*
 * Giải đấu Offline – Esports: cấm chọn (draft), Fearless, chi tiết từng ván, thống kê tướng. Dùng chung trình duyệt +
 * máy chủ (server/src/hub/otour-games.js kiểm và lưu; caro/otour-games-ui.js – khung nhập, biểu đồ vàng, thống kê).
 * Cấu hình của giải (t.esports):
 *   { draft: 'lol' | 'custom' | 'off', bans, picks (kịch bản tự chọn: số cấm / chọn mỗi đội), fearless: 'hard' | 'soft' |
 *     'off', scope: 'series' | 'stage', stats: ['kills', 'gold', …, hoặc nhãn tự đặt], players: true = nhập K/D/A từng
 *     người, pool: ['Tên tướng', …] gợi ý (gõ tự do vẫn được) }
 *   Fearless cứng: tướng đã được chọn (pick) ở ván trước – bởi bất kỳ đội nào – không ai được chọn lại; mềm: chỉ đội đã
 *   chọn không được chọn lại. Phạm vi 'series': trong một loạt (như giải chuyên nghiệp); 'stage': tính cả các trận vòng
 *   trước của hai đội trong giai đoạn. Tướng bị cấm (ban) không bị khoá.
 * Chi tiết một ván (m.esp[i] – ván i của loạt; không dùng m.games – đó là mã ván cờ để xem lại của giải Caro, người thắng lấy từ tỉ số m.sets[i]):
 *   { blue: 'a' | 'b' (đội ô trên / dưới đứng bên xanh), dur: giây, draft: { blue: { bans, picks }, red: { bans, picks } },
 *     st: { blue: { kills: 12, … }, red: { … } }, mvp, players: { blue: [{ n, c, k, d, a }], red: […] },
 *     gold: [[phút, vàng bên xanh, vàng bên đỏ], …] }
 */
(function (global) {
  'use strict';
  const STATS = ['kills', 'gold', 'towers', 'dragons', 'barons', 'heralds', 'inhibitors'];
  const LOL_STATS = ['kills', 'gold', 'towers', 'dragons', 'barons'];
  const MAX_POOL = 400, MAX_NAME = 30, MAX_STATS = 8, MAX_PLAYERS = 10, MAX_GOLD = 120, MAX_DUR = 4 * 3600;
  // Thứ tự cấm chọn chuẩn của LoL thi đấu (20 bước): cấm 3–3, chọn B1 R1 R2 B2 B3 R3, cấm R4 B4 R5 B5, chọn R4 B4 B5 R5
  const LOL = [['ban', 'blue'], ['ban', 'red'], ['ban', 'blue'], ['ban', 'red'], ['ban', 'blue'], ['ban', 'red'],
    ['pick', 'blue'], ['pick', 'red'], ['pick', 'red'], ['pick', 'blue'], ['pick', 'blue'], ['pick', 'red'],
    ['ban', 'red'], ['ban', 'blue'], ['ban', 'red'], ['ban', 'blue'],
    ['pick', 'red'], ['pick', 'blue'], ['pick', 'blue'], ['pick', 'red']];
  const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  const name = (s, n = MAX_NAME) => String(s == null ? '' : s).replace(/[<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  const key = (s) => name(s).toLowerCase();
  const list = (v) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\n,;]+/));

  function cleanEsports(o) {
    o = o && typeof o === 'object' ? o : {};
    const seen = new Set(), pool = [];
    for (const x of list(o.pool)) { const s = name(x); if (s && !seen.has(s.toLowerCase()) && pool.length < MAX_POOL) { seen.add(s.toLowerCase()); pool.push(s); } }
    // Nhãn chỉ số tự đặt dùng làm khoá đối tượng: bỏ các tên đặc biệt của JavaScript
    const st = [...new Set(list(o.stats).map((x) => name(x, 20)).filter((x) => x && !['__proto__', 'constructor', 'prototype'].includes(x)))].slice(0, MAX_STATS);
    return {
      draft: ['lol', 'custom', 'off'].includes(o.draft) ? o.draft : 'lol',
      bans: int(o.bans, 0, 10, 5), picks: int(o.picks, 1, 10, 5),
      fearless: ['hard', 'soft', 'off'].includes(o.fearless) ? o.fearless : 'hard',
      scope: o.scope === 'stage' ? 'stage' : 'series',
      stats: Array.isArray(o.stats) || typeof o.stats === 'string' ? st : [...LOL_STATS],
      players: o.players === true,
      pool,
    };
  }

  /** Các bước cấm chọn: [['ban' | 'pick', 'blue' | 'red'], …]. Tự chọn: cấm xen kẽ, rồi chọn kiểu rắn (B R R B B R…). */
  function script(cfg) {
    if (!cfg || cfg.draft === 'off') return [];
    if (cfg.draft === 'lol') return LOL;
    const out = [];
    for (let i = 0; i < cfg.bans * 2; i++) out.push(['ban', i % 2 ? 'red' : 'blue']);
    for (let i = 0; i < cfg.picks * 2; i++) out.push(['pick', ((i + 1) >> 1) % 2 ? 'red' : 'blue']);
    return out;
  }
  /** Số lượt cấm / chọn mỗi bên theo kịch bản. */
  const counts = (cfg) => script(cfg).reduce((c, [k, s]) => { c[s][k]++; return c; }, { blue: { ban: 0, pick: 0 }, red: { ban: 0, pick: 0 } });
  /** Đội (a | b) đứng ở bên side của ván g. */
  const teamOf = (g, side) => (side === 'blue' ? g.blue : g.blue === 'a' ? 'b' : 'a');

  /**
   * Tướng đã chọn trước ván i: { a: Map tên thường → { n: số ván (0 = trận trước trong giai đoạn), c: tên gốc }, b: … }
   * của hai đội trận m.
   * others: các trận vòng trước của giai đoạn (phạm vi 'stage') – [{ a, b, esp }] (uid đội).
   */
  function priorPicks(m, i, cfg, others = []) {
    const out = { a: new Map(), b: new Map() };
    if (!cfg || cfg.fearless === 'off') return out;
    const add = (who, g, n) => { if (!g || !g.draft) return; for (const side of ['blue', 'red']) if (teamOf(g, side) === who.k) for (const c of g.draft[side].picks) if (c && !out[who.to].has(key(c))) out[who.to].set(key(c), { n, c }); };
    if (cfg.scope === 'stage') {
      for (const x of others) {
        for (const to of ['a', 'b']) {
          const k = x.a === m[to] ? 'a' : x.b === m[to] ? 'b' : null;
          if (k) for (const g of x.esp || []) add({ k, to }, g, 0);
        }
      }
    }
    for (let j = 0; j < i; j++) { const g = (m.esp || [])[j]; for (const to of ['a', 'b']) add({ k: to, to }, g, j + 1); }
    return out;
  }

  /** Tướng bị khoá với đội who (a | b) ở ván đang nhập: Map tên thường → { n: số ván đã dùng, c: tên gốc }. */
  function locked(prior, who, cfg) {
    if (!cfg || cfg.fearless === 'off') return new Map();
    if (cfg.fearless === 'soft') return prior[who];
    return new Map([...prior.b, ...prior.a]);
  }

  /** Kiểm và chuẩn hoá chi tiết một ván. prior: priorPicks(…). Trả { game } hoặc { code, args }. */
  function cleanGame(g, cfg, prior = { a: new Map(), b: new Map() }) {
    g = g && typeof g === 'object' ? g : {};
    if (g.blue !== 'a' && g.blue !== 'b') return { code: 'ot_g_side' };
    const out = { blue: g.blue };
    if (g.dur != null && g.dur !== '') { const d = Math.floor(Number(g.dur)); if (!(d > 0 && d <= MAX_DUR)) return { code: 'ot_g_dur' }; out.dur = d; }
    const cnt = counts(cfg);
    if (cfg.draft !== 'off') {
      const seen = new Set(), dr = {};
      for (const side of ['blue', 'red']) {
        const x = (g.draft && g.draft[side]) || {};
        const bans = (Array.isArray(x.bans) ? x.bans : []).map((c) => name(c));
        const picks = (Array.isArray(x.picks) ? x.picks : []).map((c) => name(c));
        if (bans.length > cnt[side].ban || picks.length > cnt[side].pick) return { code: 'ot_g_many' };
        while (bans.length < cnt[side].ban) bans.push('');
        while (picks.length < cnt[side].pick) picks.push('');
        for (const c of [...bans, ...picks]) { if (!c) continue; if (seen.has(key(c))) return { code: 'ot_g_dup', args: { c } }; seen.add(key(c)); }
        const lock = locked(prior, teamOf(g, side), cfg);
        for (const c of picks) if (c && lock.has(key(c))) { const n = lock.get(key(c)).n; return { code: n ? 'ot_g_fearless' : 'ot_g_fearless_stage', args: { c, n } }; }
        dr[side] = { bans, picks };
      }
      if ([...dr.blue.bans, ...dr.blue.picks, ...dr.red.bans, ...dr.red.picks].some(Boolean)) out.draft = dr;
    }
    // Chỉ số đội: bắt buộc đủ mọi chỉ số đã chọn cho cả hai bên
    if (cfg.stats.length) {
      out.st = {};
      for (const side of ['blue', 'red']) {
        const x = (g.st && g.st[side]) || {};
        out.st[side] = {};
        for (const k of cfg.stats) {
          const v = x[k];
          const n = v === '' || v == null ? NaN : Math.floor(Number(v));
          if (!(n >= 0 && n <= 10000000)) return { code: 'ot_g_stats', args: { k } };
          out.st[side][k] = n;
        }
      }
    }
    const mvp = name(g.mvp, 40);
    if (mvp) out.mvp = mvp;
    if (cfg.players && g.players) {
      const pl = {};
      for (const side of ['blue', 'red']) {
        pl[side] = (Array.isArray(g.players[side]) ? g.players[side] : []).slice(0, MAX_PLAYERS)
          .map((p) => ({ n: name(p && p.n, 40), c: name(p && p.c), k: int(p && p.k, 0, 999, 0), d: int(p && p.d, 0, 999, 0), a: int(p && p.a, 0, 999, 0) }))
          .filter((p) => p.n || p.c);
      }
      if (pl.blue.length || pl.red.length) out.players = pl;
    }
    if (Array.isArray(g.gold) && g.gold.length) {
      const pts = [];
      let last = -1;
      for (const r of g.gold.slice(0, MAX_GOLD)) {
        if (!Array.isArray(r) || r.length !== 3) return { code: 'ot_g_gold' };
        const [mi, b, rd] = r.map(Number);
        if (!(mi >= 0 && mi <= 300 && mi > last && b >= 0 && b <= 1e6 && rd >= 0 && rd <= 1e6)) return { code: 'ot_g_gold' };
        last = mi;
        pts.push([Math.round(mi * 10) / 10, Math.round(b), Math.round(rd)]);
      }
      out.gold = pts;
    }
    return { game: out };
  }

  /**
   * Đọc bảng vàng dán vào: mỗi dòng "phút vàng_xanh vàng_đỏ" (vd. "10 18500 17200", "15: 26.4k 24.9k") → [[phút, b, r]].
   * Dòng sai → null (kèm số dòng).
   */
  function parseGold(text) {
    const out = [];
    const lines = String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const p = lines[i].replace(/[:;,]/g, ' ').split(/\s+/).filter(Boolean).map((x) => (/k$/i.test(x) ? Number(x.slice(0, -1)) * 1000 : Number(x)));
      if (p.length !== 3 || p.some((x) => !Number.isFinite(x))) return { error: i + 1 };
      out.push(p);
    }
    return { gold: out };
  }

  /**
   * Thống kê esports của cả giải từ các trận [{ a, b, sets, esp }] (người thắng ván i theo tỉ số sets[i]):
   * { games, avgDur, blueWins, champs: [{ c, pick, ban, win }], mvp: [{ who, n }] }.
   */
  function stats(matches) {
    const C = new Map(), M = new Map();
    let games = 0, dur = 0, durN = 0, blueWins = 0, decided = 0;
    const ch = (c) => { const k = key(c); if (!C.has(k)) C.set(k, { c, pick: 0, ban: 0, win: 0 }); return C.get(k); };
    for (const m of matches) {
      (m.esp || []).forEach((g, i) => {
        if (!g) return;
        games++;
        if (g.dur) { dur += g.dur; durN++; }
        const s = (m.sets || [])[i];
        const win = s && s[0] !== s[1] ? (s[0] > s[1] ? 'a' : 'b') : null;
        if (win) { decided++; if (g.blue === win) blueWins++; }
        if (g.draft) {
          for (const side of ['blue', 'red']) {
            for (const c of g.draft[side].bans) if (c) ch(c).ban++;
            for (const c of g.draft[side].picks) if (c) { const x = ch(c); x.pick++; if (win && teamOf(g, side) === win) x.win++; }
          }
        }
        if (g.mvp) { const k = key(g.mvp); M.set(k, { who: (M.get(k) || {}).who || g.mvp, n: ((M.get(k) || {}).n || 0) + 1 }); }
      });
    }
    const champs = [...C.values()].sort((x, y) => (y.pick + y.ban) - (x.pick + x.ban) || y.pick - x.pick || x.c.localeCompare(y.c)).slice(0, 200);
    return { games, decided, avgDur: durN ? Math.round(dur / durN) : 0, blueWins, champs, mvp: [...M.values()].sort((x, y) => y.n - x.n || x.who.localeCompare(y.who)).slice(0, 20) };
  }

  const fmtDur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  /** "32:15" / "32" (phút) → giây; sai → null. */
  function parseDur(s) {
    const m = /^\s*(\d{1,3})(?::([0-5]\d))?\s*$/.exec(String(s || ''));
    return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null;
  }

  const api = { STATS, LOL_STATS, LOL, MAX_POOL, cleanEsports, script, counts, teamOf, priorPicks, locked, cleanGame, parseGold, stats, fmtDur, parseDur };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourDraft = api;
})(typeof window !== 'undefined' ? window : globalThis);
