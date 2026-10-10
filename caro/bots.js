/*
 * Các "nhân vật" máy – mỗi người một tính cách và một sức cờ ước tính (Elo).
 * Sức cờ được tạo bằng cách pha trộn AI của rules.js với các lỗi có chủ đích:
 *   noise     – xác suất đánh 1 nước "cho vui" trong k ô đẹp nhất
 *   missBlock – xác suất quên chặn khi đối thủ sắp thắng
 *   missWin   – xác suất không nhìn thấy nước thắng ngay
 * Chạy được trên trình duyệt (window.CaroBots), Web Worker và Node.
 */
(function (global) {
  'use strict';
  const C = global.Caro || (typeof require === 'function' ? require('./rules.js') : null);

  // Thứ tự = thứ tự mở khoá. Tên/lời thoại nằm trong i18n (bot.<id>.*); ở đây chỉ có số liệu.
  const BOTS = [
    { id: 'na', elo: 600, level: 1, noise: 0.35, k: 8, missBlock: 0.35, missWin: 0.2, color: '#f59e0b' },
    { id: 'ti', elo: 900, level: 1, noise: 0.15, k: 5, missBlock: 0.15, missWin: 0.05, color: '#22c55e' },
    { id: 'bin', elo: 1200, level: 2, noise: 0.12, k: 4, missBlock: 0.04, color: '#3b82f6' },
    { id: 'mai', elo: 1500, level: 2, color: '#ec4899' },
    { id: 'minh', elo: 1800, level: 3, noise: 0.07, k: 3, vcfMs: 300, color: '#8b5cf6' },
    { id: 'rong', elo: 2100, level: 3, vcfDepth: 7, vcfMs: 900, defDepth: 5, defMs: 400, color: '#ef4444' },
  ];
  const START_UNLOCKED = 3;
  // Mức cũ (1 Dễ / 2 Vừa / 3 Khó) -> nhân vật tương ứng.
  const FROM_LEVEL = { 1: 'ti', 2: 'mai', 3: 'minh' };

  function get(id) { return BOTS.find((b) => b.id === id) || BOTS[1]; }

  function topCells(board, p, k, exclude) {
    const opp = C.other(p);
    return C.candidates(board, 2)
      .filter(([x, y]) => !exclude || !exclude(x, y))
      .map((c) => ({ c, s: C.cellScore(board, c[0], c[1], p) + 0.8 * C.cellScore(board, c[0], c[1], opp) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map((o) => o.c);
  }

  function botMove(board, p, botOrId, rng) {
    const bot = typeof botOrId === 'string' ? get(botOrId) : botOrId;
    rng = rng || Math.random;
    if (board.moves.length === 0) return [0, 0];
    const opp = C.other(p);
    const cands = C.candidates(board, 1);
    const wins = cands.filter(([x, y]) => C.winsIfPlaced(board, x, y, p));
    if (wins.length && !(bot.missWin && rng() < bot.missWin)) return wins[0];
    const winSet = new Set(wins.map(([x, y]) => x + ',' + y));
    const notWin = (x, y) => winSet.has(x + ',' + y);
    const threats = cands.filter(([x, y]) => C.winsIfPlaced(board, x, y, opp));
    if (threats.length && bot.missBlock && rng() < bot.missBlock) {
      const t = new Set(threats.map(([x, y]) => x + ',' + y));
      const pool = topCells(board, p, 4, (x, y) => t.has(x + ',' + y) || notWin(x, y));
      if (pool.length) return pool[Math.floor(rng() * pool.length)];
    }
    if (!threats.length && bot.noise && rng() < bot.noise) {
      const pool = topCells(board, p, bot.k || 5, notWin);
      if (pool.length) return pool[Math.floor(rng() * pool.length)];
    }
    if (wins.length) {
      // Đã "không thấy" nước thắng: chọn nước khác.
      const pool = topCells(board, p, 3, notWin);
      if (pool.length) return pool[0];
    }
    return C.chooseMove(board, p, bot.level, rng, bot);
  }

  const CaroBots = { BOTS, START_UNLOCKED, FROM_LEVEL, get, botMove };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroBots;
  else global.CaroBots = CaroBots;
})(typeof window !== 'undefined' ? window : globalThis);
