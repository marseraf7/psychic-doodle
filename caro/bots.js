/*
 * Các "nhân vật" máy: 6 mức sức cờ (Elo ước tính) × 4 lối đánh = 24 nhân vật.
 * Sức cờ được tạo bằng cách pha trộn AI của rules.js (mức cao nhất: engine.js) với các lỗi có chủ đích:
 *   noise     – xác suất đánh 1 nước "cho vui" trong k ô đẹp nhất
 *   missBlock – xác suất quên chặn khi đối thủ sắp thắng
 *   missWin   – xác suất không nhìn thấy nước thắng ngay
 * Lối đánh (style) đổi cách chấm điểm nước đi (xem STYLES và rules.js chooseMove):
 *   atk  – Tấn công chủ động: coi trọng nước của mình, tìm chuỗi ép (VCF) sớm, dồn đối thủ phải chạy theo.
 *   def  – Phòng thủ – phản công: coi trọng chặn thế của đối thủ từ sớm, có chuỗi ép thì tung đòn ngay.
 *   dbl  – Nước đôi / đa tuyến: ưu tiên ô giao điểm tạo thế trên nhiều đường cùng lúc (3-3, 4-3).
 *   trap – Dương đông kích tây: đặt quân cách quãng, tránh đánh sát nước vừa đi của đối thủ, gài thế ẩn.
 * Chạy được trên trình duyệt (window.CaroBots), Web Worker và Node.
 */
(function (global) {
  'use strict';
  const C = global.Caro || (typeof require === 'function' ? require('./rules.js') : null);

  // Mức sức cờ (thứ tự = thứ tự mở khoá): thắng 1 nhân vật bất kỳ ở mức trước thì mở khoá cả mức sau.
  const TIERS = [
    { elo: 600, level: 1, noise: 0.35, k: 8, missBlock: 0.35, missWin: 0.2 },
    { elo: 900, level: 1, noise: 0.15, k: 5, missBlock: 0.15, missWin: 0.05 },
    { elo: 1200, level: 2, noise: 0.12, k: 4, missBlock: 0.04 },
    { elo: 1500, level: 2 },
    { elo: 1800, level: 3, noise: 0.07, k: 3, vcfMs: 300 },
    // Mức cao nhất dùng engine.js (Alpha-Beta + chuỗi ép), thắng AI cũ (level 3, chuỗi ép sâu 7) khoảng 80% số ván
    { elo: 2350, level: 3, vcfDepth: 7, vcfMs: 900, defDepth: 5, defMs: 400, engine: { ms: 700 } },
  ];
  const STYLES = ['atk', 'def', 'dbl', 'trap'];
  // Trọng số theo lối đánh: atkW – nước của mình, defW – nhân với trọng số phòng thủ của mức, dbl / trap – điểm thưởng.
  // engine: trọng số của engine (a – thế của mình, d – thế của đối thủ, dbl / trap – thưởng khi xếp thứ tự nước).
  const STYLE_W = {
    atk: { atkW: 1.3, defW: 0.8, vcfEarly: true, engine: { a: 1.2, d: 0.9 } },
    def: { atkW: 0.85, defW: 1.3, engine: { a: 0.9, d: 1.25 } },
    dbl: { atkW: 1, defW: 1, dbl: 1, engine: { a: 1.05, d: 1, dbl: 1 } },
    trap: { atkW: 1, defW: 0.95, trap: 1, engine: { a: 1, d: 1, trap: 1 } },
  };
  // [mức][lối đánh] -> id. Tên / lời thoại nằm trong i18n (bot_<id>*). 6 nhân vật cũ giữ id để không mất lựa chọn đã lưu.
  const IDS = [
    { atk: 'tit', def: 'na', dbl: 'mo', trap: 'bom' },
    { atk: 'ti', def: 'nam', dbl: 'lan', trap: 'cuoi' },
    { atk: 'hung', def: 'tuong', dbl: 'song', trap: 'bin' },
    { atk: 'loc', def: 'da', dbl: 'mai', trap: 'cao' },
    { atk: 'minh', def: 'thanh', dbl: 'kep', trap: 'ninja' },
    { atk: 'rong', def: 'phao', dbl: 'long', trap: 'ao' },
  ];
  const COLORS = {
    tit: '#fb923c', na: '#f59e0b', mo: '#facc15', bom: '#a3e635',
    ti: '#22c55e', nam: '#10b981', lan: '#14b8a6', cuoi: '#84cc16',
    hung: '#f97316', tuong: '#64748b', song: '#06b6d4', bin: '#3b82f6',
    loc: '#0ea5e9', da: '#78716c', mai: '#ec4899', cao: '#d97706',
    minh: '#8b5cf6', thanh: '#b45309', kep: '#6366f1', ninja: '#334155',
    rong: '#ef4444', phao: '#991b1b', long: '#dc2626', ao: '#a855f7',
  };

  const BOTS = [];
  IDS.forEach((row, t) => {
    for (const style of STYLES) {
      const id = row[style];
      BOTS.push({ id, tier: t + 1, style, color: COLORS[id], ...TIERS[t], styleW: STYLE_W[style] });
    }
  });
  const START_UNLOCKED = 3; // số mức mở sẵn
  // Mức cũ (1 Dễ / 2 Vừa / 3 Khó) -> nhân vật tương ứng.
  const FROM_LEVEL = { 1: 'ti', 2: 'mai', 3: 'minh' };

  function get(id) { return BOTS.find((b) => b.id === id) || BOTS.find((b) => b.id === 'ti'); }
  const byTier = (tier) => BOTS.filter((b) => b.tier === tier);
  const of = (tier, style) => BOTS.find((b) => b.tier === tier && b.style === style);

  function topCells(board, p, k, exclude, bot) {
    const opp = C.other(p);
    const w = (bot && bot.styleW) || {};
    return C.legal(board, C.candidates(board, 2), p)
      .filter(([x, y]) => !exclude || !exclude(x, y))
      .map((c) => ({ c, s: (w.atkW || 1) * C.cellScore(board, c[0], c[1], p) + 0.8 * (w.defW || 1) * C.cellScore(board, c[0], c[1], opp) + C.styleBonus(board, c[0], c[1], p, w) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map((o) => o.c);
  }

  function botMove(board, p, botOrId, rng) {
    const bot = typeof botOrId === 'string' ? get(botOrId) : botOrId;
    rng = rng || Math.random;
    if (board.moves.length === 0) return [0, 0];
    const opp = C.other(p);
    const cands = C.legal(board, C.candidates(board, 1), p);
    const wins = cands.filter(([x, y]) => C.winsIfPlaced(board, x, y, p));
    if (wins.length && !(bot.missWin && rng() < bot.missWin)) return wins[0];
    const winSet = new Set(wins.map(([x, y]) => x + ',' + y));
    const notWin = (x, y) => winSet.has(x + ',' + y);
    const threats = C.candidates(board, 1).filter(([x, y]) => C.winsIfPlaced(board, x, y, opp));
    if (threats.length && bot.missBlock && rng() < bot.missBlock) {
      const t = new Set(threats.map(([x, y]) => x + ',' + y));
      const pool = topCells(board, p, 4, (x, y) => t.has(x + ',' + y) || notWin(x, y), bot);
      if (pool.length) return pool[Math.floor(rng() * pool.length)];
    }
    if (!threats.length && bot.noise && rng() < bot.noise) {
      const pool = topCells(board, p, bot.k || 5, notWin, bot);
      if (pool.length) return pool[Math.floor(rng() * pool.length)];
    }
    if (wins.length) {
      // Đã "không thấy" nước thắng: chọn nước khác.
      const pool = topCells(board, p, 3, notWin, bot);
      if (pool.length) return pool[0];
    }
    // Nhân vật dùng engine (nếu đã nạp engine.js): engine tự tính bên tới lượt theo số nước, phải khớp với p
    const EN = bot.engine && (global.CaroEngine || (typeof require === 'function' ? require('./engine.js') : null));
    if (EN && (board.moves.length % 2 === 0 ? C.X : C.O) === p) {
      try {
        return EN.analyse(board.moves.map((m) => [m.x, m.y]), { ...bot.engine, rule: board.rule, style: bot.styleW && bot.styleW.engine }).move;
      } catch (e) { /* dùng AI cũ */ }
    }
    return C.chooseMove(board, p, bot.level, rng, { ...bot, ...(bot.styleW || {}) });
  }

  const CaroBots = { BOTS, TIERS, STYLES, START_UNLOCKED, FROM_LEVEL, get, byTier, of, botMove };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroBots;
  else global.CaroBots = CaroBots;
})(typeof window !== 'undefined' ? window : globalThis);
