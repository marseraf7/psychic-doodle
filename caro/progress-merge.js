/*
 * Tiến độ người chơi lưu cả trên máy lẫn trong tài khoản (A5): Giải đố (caro.puzzles), Puzzle Storm (caro.storm),
 * chuỗi ngày chơi + huy hiệu (caro.habits). Dùng chung trình duyệt (progress-sync.js) và máy chủ (hub/progress.js).
 *   clean(raw)        – chỉ giữ trường hợp lệ, cắt độ dài (dữ liệu từ máy người chơi: không tin)
 *   merge(a, b)       – gộp hai bản, KHÔNG BAO GIỜ làm mất tiến độ: số lớn nhất, hợp các tập (ngày chơi, huy hiệu,
 *                       nhân vật đã thắng), điểm giải đố lấy theo bên đã giải nhiều bài hơn
 *   streakOf(days, today) – chuỗi ngày chơi liên tiếp tính lùi từ hôm nay (hoặc hôm qua nếu hôm nay chưa chơi)
 *   weekKey(at)       – tuần ISO tính theo giờ Việt Nam (UTC+7, đổi tuần lúc 00:00 thứ Hai) – bảng xếp hạng Storm tuần
 *   BADGE_IDS         – mã huy hiệu (đúng như habits.js – bài thử kiểm khớp)
 * Viết dạng UMD (window.CaroProgress / module.exports), không đụng DOM.
 */
(function (global) {
  'use strict';
  const BADGE_IDS = ['first_game', 'first_win', 'beat_bin', 'beat_mai', 'beat_minh', 'beat_rong', 'beat_boat', 'beat_boat_rapfi', 'learn_all',
    'puzzles_10', 'puzzles_50', 'pz_streak_10', 'daily_3', 'daily_7', 'daily_30', 'online_10', 'online_100', 'win_streak_5', 'rating_1500',
    'rating_1800', 'tour_win'];
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const MAX_DAYS = 400;
  const int = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  function clean(raw) {
    const r = isObj(raw) ? raw : {};
    const pz = isObj(r.pz) ? r.pz : {}, st = isObj(r.storm) ? r.storm : {}, h = isObj(r.habits) ? r.habits : {};
    const daily = isObj(pz.daily) && DAY.test(pz.daily.d) ? { d: pz.daily.d, ok: !!pz.daily.ok } : null;
    const days = [...new Set((Array.isArray(h.days) ? h.days : []).filter((d) => typeof d === 'string' && DAY.test(d)))].sort().slice(-MAX_DAYS);
    const bots = {};
    if (isObj(h.bots)) for (const k of Object.keys(h.bots).slice(0, 60)) if (/^[a-z0-9_]{1,20}$/.test(k) && h.bots[k]) bots[k] = true;
    const earned = {};
    if (isObj(h.earned)) for (const id of BADGE_IDS) if (typeof h.earned[id] === 'string' && DAY.test(h.earned[id])) earned[id] = h.earned[id];
    return {
      pz: {
        r: int(pz.r, 4000) || 1000, n: int(pz.n, 1e7), ok: int(pz.ok, 1e7), best: int(pz.best, 1e5), daily,
        recent: (Array.isArray(pz.recent) ? pz.recent : []).map((x) => int(x, 1e6)).filter(Boolean).slice(-40),
        diff: [-600, -300, 0, 300, 600].includes(Number(pz.diff)) ? Number(pz.diff) : 0,
      },
      storm: { best: int(st.best, 1000), runs: int(st.runs, 1e6), last: int(st.last, 1000) },
      habits: { days, best: int(h.best, 1e5), games: int(h.games, 1e7), bots, earned, boatRapfi: !!h.boatRapfi },
    };
  }

  function merge(a, b) {
    const x = clean(a), y = clean(b);
    // Điểm giải đố: bên đã làm nhiều bài hơn (điểm không cộng dồn được); bằng nhau thì lấy điểm cao hơn
    const pzMore = y.pz.n > x.pz.n || (y.pz.n === x.pz.n && y.pz.r > x.pz.r) ? y.pz : x.pz;
    const dl = [x.pz.daily, y.pz.daily].filter(Boolean).sort((p, q) => (p.d < q.d ? -1 : p.d > q.d ? 1 : (p.ok ? 1 : 0) - (q.ok ? 1 : 0))).pop() || null;
    const earned = { ...y.habits.earned };
    for (const [k, d] of Object.entries(x.habits.earned)) if (!earned[k] || d < earned[k]) earned[k] = d; // giữ ngày đạt sớm nhất
    const days = [...new Set([...x.habits.days, ...y.habits.days])].sort().slice(-MAX_DAYS);
    return {
      pz: {
        r: pzMore.r, n: Math.max(x.pz.n, y.pz.n), ok: Math.max(x.pz.ok, y.pz.ok), best: Math.max(x.pz.best, y.pz.best), daily: dl,
        recent: [...new Set([...x.pz.recent, ...y.pz.recent])].slice(-40), diff: x.pz.diff,
      },
      storm: {
        best: Math.max(x.storm.best, y.storm.best), runs: Math.max(x.storm.runs, y.storm.runs),
        last: y.storm.runs > x.storm.runs ? y.storm.last : x.storm.last,
      },
      habits: {
        days, best: Math.max(x.habits.best, y.habits.best, longest(days)), games: Math.max(x.habits.games, y.habits.games),
        bots: { ...x.habits.bots, ...y.habits.bots }, earned, boatRapfi: x.habits.boatRapfi || y.habits.boatRapfi,
      },
    };
  }

  const toDate = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  /** Chuỗi dài nhất trong danh sách ngày (đã sắp xếp). */
  function longest(days) {
    let best = 0, cur = 0, prev = null;
    for (const d of days) {
      const t = toDate(d);
      cur = prev !== null && t - prev === 86400000 ? cur + 1 : 1;
      best = Math.max(best, cur);
      prev = t;
    }
    return best;
  }
  function streakOf(days, today) {
    const set = new Set(days || []);
    let t = toDate(today);
    if (!set.has(today)) t -= 86400000;
    let n = 0;
    while (set.has(keyOf(t))) { n++; t -= 86400000; }
    return n;
  }

  /** Tuần ISO theo giờ Việt Nam: '2026-W47'. Thứ Hai 00:00 UTC+7 sang tuần mới. */
  function weekKey(at) {
    const d = new Date((at == null ? Date.now() : at) + 7 * 3600000);
    const day = d.getUTCDay() || 7; // thứ Hai = 1 … Chủ nhật = 7
    const thu = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day); // thứ Năm cùng tuần quyết định năm
    const y = new Date(thu).getUTCFullYear();
    const w = Math.floor((thu - Date.UTC(y, 0, 1)) / 86400000 / 7) + 1;
    return `${y}-W${String(w).padStart(2, '0')}`;
  }

  const P = { clean, merge, streakOf, longest, weekKey, BADGE_IDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else global.CaroProgress = P;
})(typeof window !== 'undefined' ? window : globalThis);
