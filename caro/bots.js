/*
 * Các "nhân vật" máy: 6 mức sức cờ (Elo ước tính) × 5 lối đánh = 30 nhân vật, cộng trùm cuối BOAT (mức 7, Toàn diện).
 * Sức cờ được tạo bằng cách pha trộn AI của rules.js (mức cao nhất: engine.js) với các lỗi có chủ đích:
 *   noise     – xác suất đánh 1 nước "cho vui" trong k ô đẹp nhất
 *   missBlock – xác suất quên chặn khi đối thủ sắp thắng
 *   missWin   – xác suất không nhìn thấy nước thắng ngay
 * Lối đánh (style) đổi cách chấm điểm nước đi (xem STYLES và rules.js chooseMove):
 *   atk  – Tấn công chủ động: coi trọng nước của mình, tìm chuỗi ép (VCF) sớm, dồn đối thủ phải chạy theo.
 *   def  – Phòng thủ – phản công: coi trọng chặn thế của đối thủ từ sớm, có chuỗi ép thì tung đòn ngay.
 *   dbl  – Nước đôi / đa tuyến: ưu tiên ô giao điểm tạo thế trên nhiều đường cùng lúc (3-3, 4-3).
 *   trap – Dương đông kích tây: đặt quân cách quãng, tránh đánh sát nước vừa đi của đối thủ, gài thế ẩn.
 *   uni  – Toàn diện: không thiên lệch lối nào (công – thủ cân bằng, chọn nước theo điểm thuần của engine), ít lỗi hơn và
 *          nghĩ lâu hơn các nhân vật cùng mức (UNI) – mạnh nhất ở mỗi mức.
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
    // Từ mức 4 dùng engine.js (Alpha-Beta + chuỗi ép) với độ sâu / thời gian giới hạn – như các mức Stockfish của Lichess:
    // yếu hơn vì nhìn nông hơn chứ không phải vì đánh bừa. level / vcf… là AI dự phòng khi không nạp được engine.
    { elo: 1500, level: 2, noise: 0.1, k: 3, engine: { ms: 30, maxDepth: 1, vcfDepth: 2, safeRoot: false, vct: false } },
    { elo: 1800, level: 3, vcfMs: 300, engine: { ms: 80, maxDepth: 3, vcfDepth: 5 } },
    { elo: 2350, level: 3, vcfDepth: 7, vcfMs: 900, defDepth: 5, defMs: 400, engine: { ms: 900 }, book: true },
    // Mức trùm cuối: chỉ một nhân vật – BOAT (Best of All Time), lối Toàn diện, nghĩ lâu nhất. Thắng nhân vật mức ~2350 bất
    // kỳ thì mở khoá.
    { elo: 2700, level: 3, vcfDepth: 9, vcfMs: 1500, defDepth: 6, defMs: 600, engine: { ms: 3000, vctDepth: 10 }, book: true, boss: true },
  ];
  const STYLES = ['atk', 'def', 'dbl', 'trap', 'uni'];
  // Lối Toàn diện: ghi đè thông số của mức – ít lỗi hơn, nghĩ lâu / sâu hơn các nhân vật cùng mức
  const UNI = [
    { noise: 0.16, missBlock: 0.14, missWin: 0.06 },
    { noise: 0.08, missBlock: 0.06, missWin: 0.02 },
    { noise: 0.03, missBlock: 0.01, vcfMs: 150 },
    { noise: 0.03, engine: { ms: 60, maxDepth: 3, vcfDepth: 4 } },
    { engine: { ms: 140, maxDepth: 5, vcfDepth: 7 }, book: true },
    { engine: { ms: 1300 } },
  ];
  // Trọng số theo lối đánh: atkW – nước của mình, defW – nhân với trọng số phòng thủ của mức, dbl / trap – điểm thưởng.
  // engine: trọng số của engine (a – thế của mình, d – thế của đối thủ, dbl / trap – thưởng khi xếp thứ tự nước).
  const STYLE_W = {
    atk: { atkW: 1.3, defW: 0.8, vcfEarly: true, engine: { a: 1.2, d: 0.9 } },
    def: { atkW: 0.85, defW: 1.3, engine: { a: 0.9, d: 1.25 } },
    dbl: { atkW: 1, defW: 1, dbl: 1, engine: { a: 1.05, d: 1, dbl: 1 } },
    trap: { atkW: 1, defW: 0.95, trap: 1, engine: { a: 1, d: 1, trap: 1 } },
    uni: { atkW: 1.1, defW: 1.05, vcfEarly: true }, // engine: điểm thuần (không trọng số lối đánh)
  };
  // [mức][lối đánh] -> id. Tên / lời thoại nằm trong i18n (bot_<id>*). 6 nhân vật cũ giữ id để không mất lựa chọn đã lưu.
  const IDS = [
    { atk: 'tit', def: 'na', dbl: 'mo', trap: 'bom', uni: 'trinh' },
    { atk: 'ti', def: 'nam', dbl: 'lan', trap: 'cuoi', uni: 'teliet' },
    { atk: 'hung', def: 'tuong', dbl: 'song', trap: 'bin', uni: 'fifa' },
    { atk: 'loc', def: 'da', dbl: 'mai', trap: 'cao', uni: 'sach' },
    { atk: 'minh', def: 'thanh', dbl: 'kep', trap: 'ninja', uni: 'liems' },
    { atk: 'rong', def: 'phao', dbl: 'long', trap: 'ao', uni: 'goat' },
  ];

  const BOTS = [];
  IDS.forEach((row, t) => {
    for (const style of STYLES) {
      const id = row[style];
      const extra = style === 'uni' ? UNI[t] : {};
      BOTS.push({ id, tier: t + 1, style, ...TIERS[t], ...extra, styleW: STYLE_W[style] }); // ảnh, biểu tượng, màu: bot-looks.js
    }
  });
  // Trùm cuối (mức 7, chỉ lối Toàn diện)
  BOTS.push({ id: 'boat', tier: TIERS.length, style: 'uni', ...TIERS[TIERS.length - 1], styleW: STYLE_W.uni });
  const START_UNLOCKED = 3; // số mức mở sẵn
  // Mức cũ (1 Dễ / 2 Vừa / 3 Khó) -> nhân vật tương ứng.
  const FROM_LEVEL = { 1: 'ti', 2: 'mai', 3: 'minh' };

  function get(id) { return BOTS.find((b) => b.id === id) || BOTS.find((b) => b.id === 'ti'); }
  const byTier = (tier) => BOTS.filter((b) => b.tier === tier);
  // Mức trùm cuối chỉ có một nhân vật: lối nào cũng trả về nhân vật đó
  const of = (tier, style) => BOTS.find((b) => b.tier === tier && b.style === style) || BOTS.find((b) => b.tier === tier);

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

  const book = () => global.CaroBook || (typeof require === 'function' ? (() => { try { return require('./book.js'); } catch (e) { return null; } })() : null);

  /** Nước trong sách khai cuộc (book.js) cho nhân vật có book: true; chỉ khi hai bên đi luân phiên từ X. */
  function bookMove(board, p, bot) {
    const Bk = bot.book && book();
    if (!Bk || board.moves.length > 12) return null;
    if (board.moves.some((m, i) => m.p !== (i % 2 ? C.O : C.X)) || (board.moves.length % 2 ? C.O : C.X) !== p) return null;
    const m = Bk.lookup(board.moves.map((q) => [q.x, q.y]), board.rule);
    if (!m || board.get(m[0], m[1]) !== C.EMPTY || !C.legal(board, [m], p).length) return null;
    return m;
  }

  function botMove(board, p, botOrId, rng) {
    const bot = typeof botOrId === 'string' ? get(botOrId) : botOrId;
    rng = rng || Math.random;
    if (board.moves.length === 0) return [0, 0];
    const bm = bookMove(board, p, bot);
    if (bm) return bm;
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

  const CaroBots = { BOTS, TIERS, STYLES, START_UNLOCKED, FROM_LEVEL, get, byTier, of, botMove, bookMove };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroBots;
  else global.CaroBots = CaroBots;
})(typeof window !== 'undefined' ? window : globalThis);
