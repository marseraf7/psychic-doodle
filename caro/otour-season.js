/*
 * Giải đấu Offline – mùa giải kiểu nhà nghề Mỹ (NBA, NFL, MLB, NHL, MLS): dùng chung trình duyệt + máy chủ
 * (server/src/hub/stages-season.js dựng trận; caro/tour-stage-edit.js – form; caro/tour-estimate.js – ước tính).
 * Cấu hình giai đoạn vòng tròn: season = { confs, divs, div: {m, x}, conf: {m, x}, inter: {m, x} }
 *   confs – số miền (conference / league), divs – số bảng con (division) mỗi miền. Đội chia theo thứ tự danh sách:
 *           miền 1 = bảng con 1, 2…; rồi miền 2…
 *   div   – gặp đội cùng bảng con, conf – gặp đội cùng miền khác bảng con, inter – gặp đội miền khác.
 *           m = số lần gặp MỌI đối thủ ở mức đó; x = số đối thủ ở mức đó được gặp THÊM một lần (lịch không đều, như NBA:
 *           6 trong 10 đội cùng miền khác bảng con gặp 4 lần, 4 đội còn lại 3 lần → conf = { m: 3, x: 6 }).
 *   Số trận mỗi đội = Σ m × số đối thủ ở mức đó + x.
 *   seasonInfo(season, n) → { confs, divs, confSize, divSize, levels: { div, conf, inter: { m, x, opp } }, perTeam, matches,
 *                             error: { code, args } | null }
 */
(function (global) {
  'use strict';
  const LEVELS = ['div', 'conf', 'inter'];
  const MAX_CONFS = 8, MAX_DIVS = 8, MAX_MEET = 30, MAX_PER_TEAM = 200;
  const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

  /** Chuẩn hoá cấu hình (giá trị lạ → mặc định trong khoảng cho phép). */
  function cleanSeason(s) {
    s = s && typeof s === 'object' ? s : {};
    const out = { confs: int(s.confs, 1, MAX_CONFS, 2), divs: int(s.divs, 1, MAX_DIVS, 1) };
    for (const k of LEVELS) {
      const v = s[k] && typeof s[k] === 'object' ? s[k] : {};
      out[k] = { m: int(v.m, 0, MAX_MEET, k === 'inter' ? 1 : 2), x: int(v.x, 0, 999, 0) };
    }
    return out;
  }

  /**
   * Cách chọn "đối thủ gặp thêm" để mọi đội có đúng d đối thủ: N vị trí chia D phần bằng nhau (hai đội cùng phần không
   * gặp nhau ở mức này). Trả { kind, steps } hoặc null nếu không dựng được:
   *   'bip'  (D = 2): hai phía A, B mỗi phía h đội – bước o: A[i] gặp B[(i + o) mod h]; luôn được khi d ≤ h.
   *   'circ' (D ≠ 2): vị trí p thuộc phần p mod D, bước xoay o (không chia hết cho D) cho mỗi đội 2 đối thủ p ± o;
   *          d lẻ cần thêm bước N/2 (mỗi đội 1 đối thủ).
   */
  function regularPlan(N, D, d) {
    if (!d) return { kind: 'none', steps: [] };
    if (D === 2) {
      const h = N / 2;
      return d <= h ? { kind: 'bip', steps: Array.from({ length: d }, (_, o) => o) } : null;
    }
    const ok = (o) => D === 1 || o % D !== 0;
    const steps = [];
    if (d % 2) {
      if (N % 2 || !ok(N / 2)) return null;
      steps.push(N / 2);
    }
    const want = (d % 2) + Math.floor(d / 2);
    for (let o = 1; o <= Math.floor((N - 1) / 2) && steps.length < want; o++) if (ok(o)) steps.push(o);
    return steps.length === want ? { kind: 'circ', steps } : null;
  }

  function seasonInfo(season, n) {
    const s = cleanSeason(season);
    const err = (code, args) => ({ ...base, error: { code, args: args || {} } });
    const C = s.confs, D = s.divs;
    const base = { confs: C, divs: D, confSize: 0, divSize: 0, levels: {}, perTeam: 0, matches: 0, error: null };
    if (!n || n % (C * D) || n / (C * D) < 1 || (C * D === 1 && n < 2)) return err('ot_season_split', { c: C, d: D, n });
    const divSize = n / (C * D), confSize = divSize * D;
    Object.assign(base, { confSize, divSize });
    // Số đối thủ ở mỗi mức và cách dựng phần "gặp thêm" (N vị trí, D phần)
    const geo = {
      div: { opp: divSize - 1, N: divSize, D: 1 },
      conf: { opp: (D - 1) * divSize, N: confSize, D },
      inter: { opp: (C - 1) * confSize, N: n, D: C },
    };
    let perTeam = 0;
    for (const k of LEVELS) {
      const g = geo[k];
      let { m, x } = s[k];
      if (!g.opp) { m = 0; x = 0; }
      if (x === g.opp && x) { m++; x = 0; } // gặp thêm mọi đối thủ = tăng m
      if (x > g.opp) return err('ot_season_extra', { level: k, max: g.opp });
      if (x && !regularPlan(g.N, g.D, x)) return err('ot_season_extra', { level: k, max: g.opp });
      base.levels[k] = { m, x, opp: g.opp, N: g.N, D: g.D };
      perTeam += m * g.opp + x;
    }
    if (!perTeam) return err('ot_season_none');
    if (perTeam > MAX_PER_TEAM) return err('ot_season_many', { n: MAX_PER_TEAM });
    return { ...base, perTeam, matches: (n * perTeam) / 2 };
  }

  const api = { LEVELS, MAX_CONFS, MAX_DIVS, MAX_MEET, MAX_PER_TEAM, cleanSeason, seasonInfo, regularPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourSeason = api;
})(typeof window !== 'undefined' ? window : globalThis);
