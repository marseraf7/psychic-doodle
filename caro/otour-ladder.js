/*
 * Giải đấu Offline – "thang ván" của một trận (dùng chung trình duyệt + máy chủ; chỉ mô phỏng thể thức):
 *   cfg.ladder = [{ games, tc, arm?, bid?, white?, black?, minBid?, maxBid?, tieBid? }, …] – các cấp lần lượt; cấp sau chỉ
 *   mở khi cấp trước hoà. Cấp nhiều ván (2 ván tiêu chuẩn, 2 ván rapid…) chốt khi một bên không thể bị đuổi kịp hoặc đã đủ
 *   số ván mà không hoà; cấp Armageddon (arm) 1 ván, hoà thì Đen thắng; cấp đấu giá (bid): hai bên ra giá thời gian để cầm
 *   Đen, giá thấp hơn cầm Đen với đúng thời gian đó (bằng giá: tieBid 'higherSeed' – ô trên cầm Đen / 'rebid' – ra giá lại).
 *   Màu quân: ván 1 cấp k – ô trên cầm Trắng ở cấp chẵn, đổi ở cấp lẻ (alt; tắt alt: ô trên luôn Trắng ván 1 – Norway Chess
 *   giữ màu ván tiêu chuẩn cho Armageddon); trong cấp các ván đổi màu.
 * Mẫu: FIDE World Cup (2 tiêu chuẩn → 2 rapid 25+10 → 2 rapid 10+10 → 2 blitz 5+3 → Armageddon 5/4 phút); Norway Chess
 * (1 ván tiêu chuẩn → Armageddon 10/7 phút; điểm 3 / 1,5 / 1 / 0 qua points.w / wx / lx).
 * evaluate(levels, games, bids) – games: [{ lv, r }] theo thứ tự (r: 1 ô trên thắng, −1 ô dưới thắng, 0 hoà);
 * bids: [giá ô trên, giá ô dưới] (giây). Trả { done, winner: 'a' | 'b', at, pts: [a, b], levels: [{ sa, sb, n, black }] }
 * hoặc { error: mã lỗi i18n, args }.
 */
(function (global) {
  'use strict';
  const MAX_LEVELS = 6;
  const MAX_GAMES = 4;
  const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  const TCS = ['classical', 'rapid', 'blitz', 'armageddon'];
  const PRESETS = {
    fide: [{ games: 2, tc: 'classical' }, { games: 2, tc: 'rapid', base: 1500, inc: 10 }, { games: 2, tc: 'rapid', base: 600, inc: 10 },
      { games: 2, tc: 'blitz', base: 300, inc: 3 }, { games: 1, tc: 'armageddon', arm: true, white: 300, black: 240 }],
    norway: [{ games: 1, tc: 'classical' }, { games: 1, tc: 'armageddon', arm: true, white: 600, black: 420, inc: 1 }],
    bid: [{ games: 2, tc: 'classical' }, { games: 2, tc: 'rapid', base: 600, inc: 5 }, { games: 1, tc: 'armageddon', arm: true, bid: true, white: 300, minBid: 60, maxBid: 300, tieBid: 'rebid' }],
  };

  /** Chuẩn hoá thang (null nếu không có / sai). */
  function normalize(x) {
    if (!Array.isArray(x) || !x.length) return null;
    const out = x.slice(0, MAX_LEVELS).map((l) => {
      const arm = !!(l && (l.arm === true || l.tc === 'armageddon'));
      const y = { games: arm ? 1 : int(l && l.games, 1, MAX_GAMES, 2), tc: TCS.includes(l && l.tc) ? l.tc : arm ? 'armageddon' : 'classical' };
      for (const k of ['base', 'inc', 'white', 'black']) if (l && l[k] != null) y[k] = int(l[k], 0, 36000, 0);
      if (arm) y.arm = true;
      if (arm && l.bid === true) {
        y.bid = true;
        y.white = int(l.white, 10, 36000, 300);
        y.minBid = int(l.minBid, 0, y.white, 60);
        y.maxBid = int(l.maxBid, y.minBid, y.white, y.white);
        y.tieBid = l.tieBid === 'higherSeed' ? 'higherSeed' : 'rebid';
      }
      return y;
    });
    // Sau cấp Armageddon không còn cấp nào (luôn có người thắng)
    const k = out.findIndex((l) => l.arm);
    return k >= 0 ? out.slice(0, k + 1) : out;
  }

  /** Ô trên ('a') hay ô dưới ('b') cầm Trắng ở ván i (0-based) của cấp lv. */
  function whiteOf(lv, i, alt = true) { const first = !alt || lv % 2 === 0 ? 'a' : 'b'; return i % 2 === 0 ? first : first === 'a' ? 'b' : 'a'; }

  /** Ai cầm Đen ở cấp đấu giá: giá thấp hơn; bằng giá theo tieBid (null = phải ra giá lại). */
  function bidBlack(l, bids) {
    if (!bids || bids[0] == null || bids[1] == null) return null;
    if (bids[0] !== bids[1]) return bids[0] < bids[1] ? 'a' : 'b';
    return l.tieBid === 'higherSeed' ? 'a' : null;
  }
  /** Lỗi giá thầu (ngoài khoảng). */
  function bidError(l, v) { return !Number.isInteger(v) || v < l.minBid || v > l.maxBid ? { error: 'ot_bid_range', args: { a: l.minBid, b: l.maxBid } } : null; }

  function evaluate(levels, games, bids, alt = true) {
    if (!Array.isArray(levels) || !levels.length) return { error: 'tour_score_bad' };
    const list = Array.isArray(games) ? games : [];
    let pa = 0, pb = 0, idx = 0;
    const out = [];
    for (let lv = 0; lv < levels.length; lv++) {
      const l = levels[lv];
      const mine = [];
      while (idx < list.length && list[idx].lv === lv) mine.push(list[idx++]);
      if (idx < list.length && list[idx].lv < lv) return { error: 'ot_lad_order' };
      let sa = 0, sb = 0, n = 0, black = null;
      if (l.arm) {
        black = l.bid ? bidBlack(l, bids) : whiteOf(lv, 0, alt) === 'a' ? 'b' : 'a';
        if (l.bid && mine.length && black === null) return { error: bids && bids[0] != null && bids[1] != null ? 'ot_bid_rebid' : 'ot_bid_need' };
      }
      for (const g of mine) {
        if (![1, 0, -1].includes(g.r)) return { error: 'tour_score_bad' };
        // Cấp đã đủ ván, hoặc đã ngã ngũ (một bên không thể bị đuổi kịp) mà vẫn còn ván
        if (n >= l.games || (n > 0 && Math.abs(sa - sb) > l.games - n)) return { error: 'ot_lad_extra', args: { n: lv + 1 } };
        n++;
        // Armageddon: hoà thì Đen thắng
        const r = l.arm && g.r === 0 ? (black === 'a' ? 1 : -1) : g.r;
        if (r > 0) sa += 1; else if (r < 0) sb += 1; else { sa += 0.5; sb += 0.5; }
      }
      pa += sa; pb += sb;
      out.push({ sa, sb, n, ...(black ? { black } : {}) });
      const rem = l.games - n;
      if (Math.abs(sa - sb) > rem || (n === l.games && sa !== sb)) {
        if (idx < list.length) return { error: 'ot_lad_extra', args: { n: lv + 2 } };
        return { done: true, winner: sa > sb ? 'a' : 'b', at: lv, pts: [pa, pb], levels: out };
      }
      if (n < l.games) {
        if (idx < list.length) return { error: 'ot_lad_order' };
        return { done: false, at: lv, pts: [pa, pb], levels: out, error: 'ot_lad_short', args: { n: lv + 1 } };
      }
      // Cấp hoà đủ ván: sang cấp sau
    }
    return { error: 'ot_lad_short', args: { n: levels.length } };
  }

  const api = { MAX_LEVELS, TCS, PRESETS, normalize, whiteOf, bidBlack, bidError, evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourLadder = api;
})(typeof window !== 'undefined' ? window : globalThis);
