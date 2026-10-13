/*
 * Cầu nối tới Rapfi (engine vô địch Gomocup, bản WebAssembly – caro/rapfi/, GPL-3) cho luật tự do / tiêu chuẩn / Renju,
 * và Rapfi-CARO (Rapfi thêm luật Việt Nam chặn hai đầu – caro/rapfi/SOURCE.md) cho luật Việt Nam: BOAT đi nước (move) và
 * phân tích ván chấm thế (ask – rapfi-analysis.js). Rapfi chạy trong Worker riêng (rapfi/worker.js), chỉ nói chuyện qua
 * postMessage. Bản iOS (CARO_NO_RAPFI – điều khoản App Store xung khắc với GPL), trình duyệt không có WebAssembly SIMD,
 * thế cờ không vừa bàn của Rapfi hay Rapfi lỗi → trả null để app.js / phân tích dùng engine của game.
 *
 * Bàn của game vô hạn, Rapfi cần bàn cố định (tự do / Việt Nam 20×20, tiêu chuẩn / Renju 15×15 – đúng cỡ mạng đã học): mỗi
 * lần đặt khung bao các quân vào giữa bàn Rapfi. Rapfi coi mép bàn là tường chặn, nên khi quân cách mép < 4 ô (chuỗi năm
 * kéo ra ngoài mép, thế ba "chết" vì mép mà thật ra còn sống) thì engine của game – hiểu đúng bàn vô hạn – kiểm lại
 * chuỗi ép thắng của cả hai bên (check). Cách mép < 1 ô: không dùng Rapfi.
 *
 *   CaroRapfi.handles(botId, rule)   – BOAT + luật có Rapfi + trình duyệt chạy được
 *   CaroRapfi.available(rule)        – luật có Rapfi + trình duyệt chạy được (phân tích)
 *   CaroRapfi.prepare(botId, rule)   – tải trước mạng (~10 MB, lần đầu) khi bắt đầu ván với BOAT
 *   CaroRapfi.ready(rule, wait)      – Promise<bool>: Rapfi của luật đã sẵn sàng (chờ tối đa wait ms)
 *   CaroRapfi.move(board, p, botId)  – Promise<[x, y] | null>
 *   CaroRapfi.ask(rule, moves, ms)   – Promise<{ move, ev: { cp, mate }, margin } | null>, moves: [[x, y], …] toạ độ game
 *   CaroRapfi.check(rule, moves, ms) – engine của game chấm thế (Worker riêng): Promise<{ move, score, mate } | null>
 *   CaroRapfi.stats                  – số nước Rapfi đi / nhường engine / engine sửa nước Rapfi sát mép
 *   CaroRapfi.game                   – như stats nhưng chỉ ván hiện tại (đếm lại ở prepare – mỗi ván mới)
 * Phát sự kiện window 'caro:rapfi' { state: 'loading' | 'ready' | 'failed', rule, pct }.
 */
(function (global) {
  'use strict';
  const C = global.Caro;
  const SIZE = { free: 20, std: 15, renju: 15, vn: 20 };
  const MB = { free: 10, std: 10, renju: 20, vn: 1 }; // luật Việt Nam: chỉ bản dựng ~1,3 MB, không mạng NNUE
  const SAFE_EDGE = 4; // cách mép ≥ 4 ô: mép bàn không ảnh hưởng chuỗi năm nào qua các quân → tin Rapfi hoàn toàn
  const FIRST_WAIT = 1500; // mạng chưa sẵn sàng: chờ ngần này (đủ cho lần nạp từ bộ nhớ đệm), quá thì nước này dùng engine
  const RETRY_MS = 60000; // tải lỗi (mạng chập chờn): sau 1 phút cho thử lại
  const CHECK_MS = 400; // thời gian engine của game kiểm một thế sát mép
  const BOOK_PLY = 12; // luật Việt Nam: tra sách khai cuộc 'vn-rapfi' (book-data.js – Rapfi-CARO nghĩ 10 giây / thế) tới nước này
  const T = (k, v) => (global.I18N ? global.I18N.t(k, v) : k);
  const toast = (m, ms) => global.CaroOnline && global.CaroOnline.toast(m, ms);

  let cur = null; // { rule, worker, ready: Promise<bool>, state, pct, toasted }
  const failedAt = {}; // luật → thời điểm tải lỗi gần nhất
  let seq = 0;

  // Rapfi dựng với WebAssembly SIMD – mạng NNUE bắt buộc có (kiểm bằng một hàm nhỏ dùng lệnh v128 – như wasm-feature-detect)
  let simd = null;
  function hasSimd() {
    if (simd === null) {
      try {
        simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
      } catch (e) { simd = false; }
    }
    return simd;
  }
  function supported() {
    return !global.CARO_NO_RAPFI && typeof WebAssembly === 'object' && !!global.Worker &&
      /^(https?|capacitor):$/.test(global.location.protocol) && hasSimd();
  }
  function botOf(id) { return global.CaroBots && (typeof id === 'string' ? global.CaroBots.get(id) : id); }
  function available(rule) {
    return !!(SIZE[rule] && supported() && !(failedAt[rule] && Date.now() - failedAt[rule] < RETRY_MS));
  }
  function handles(botId, rule) {
    const bot = botOf(botId);
    return !!(bot && bot.rapfi && available(rule));
  }
  const emit = (detail) => global.dispatchEvent(new CustomEvent('caro:rapfi', { detail }));

  function stop() {
    if (cur) { try { cur.worker.terminate(); } catch (e) { /* đã dừng */ } }
    cur = null;
  }

  /** Worker cho luật `rule` (mỗi Worker một luật: đổi luật thì dựng lại). */
  function ensure(rule) {
    if (cur && cur.rule === rule) return cur;
    stop();
    let worker;
    try { worker = new Worker('rapfi/worker.js'); } catch (e) { failedAt[rule] = Date.now(); return null; }
    const st = { rule, worker, state: 'loading', pct: 0, toasted: false };
    // Chỉ báo "đang tải" khi chưa xong sau 0,7 giây (mạng đã có trong Cache Storage thì nạp gần như tức thì)
    const slow = setTimeout(() => {
      if (st.state === 'loading' && cur === st) { st.toasted = true; toast(T('rapfi_loading', { mb: MB[rule] }), 5000); }
    }, 700);
    st.ready = new Promise((resolve) => {
      const onMsg = (e) => {
        const d = e.data;
        if (d.type === 'progress') {
          st.pct = d.pct;
          emit({ state: 'loading', rule, pct: d.pct });
        } else if (d.type === 'ready') {
          clearTimeout(slow);
          worker.removeEventListener('message', onMsg);
          st.state = 'ready';
          if (st.toasted) toast(T('rapfi_ready'), 3500);
          emit({ state: 'ready', rule, pct: 100 });
          resolve(true);
        } else if (d.type === 'error') {
          clearTimeout(slow);
          worker.removeEventListener('message', onMsg);
          if (st.state === 'loading') { // lỗi khi đang tải / khởi động
            failedAt[rule] = Date.now();
            toast(T('rapfi_failed'), 4500);
            emit({ state: 'failed', rule });
          }
          st.state = 'failed';
          if (cur === st) stop();
          resolve(false);
        }
      };
      worker.addEventListener('message', onMsg);
      worker.addEventListener('error', () => onMsg({ data: { type: 'error', msg: 'worker' } }));
    });
    worker.postMessage({ type: 'init', rule });
    cur = st;
    return st;
  }

  // Ván hiện tại: số nước Rapfi đi / nhường engine (huy hiệu "Đánh chìm BOAT–Rapfi" – habits.js); ván mới thì đếm lại
  const game = { rapfi: 0, fallback: 0 };
  function prepare(botId, rule) {
    game.rapfi = game.fallback = 0;
    if (handles(botId, rule)) ensure(rule);
  }

  const wait = (ms) => new Promise((r) => setTimeout(() => r(false), ms));
  /** Rapfi của luật đã sẵn sàng chưa (bắt đầu tải nếu chưa) – chờ tối đa `ms`. */
  async function ready(rule, ms) {
    if (!available(rule)) return false;
    const st = ensure(rule);
    if (!st) return false;
    const ok = st.state === 'ready' || (await Promise.race([st.ready, wait(ms)]));
    return !!ok && cur === st;
  }

  /**
   * Khung đặt các quân vào bàn Rapfi cỡ n: { ox, oy, margin } (toạ độ Rapfi = toạ độ game − o; margin = số ô trống ít
   * nhất giữa quân ngoài cùng và mép), hoặc null nếu không vừa (cách mép < 1 ô).
   */
  function frame(moves, n) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of moves) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w > n - 2 || h > n - 2) return null;
    const lx = Math.floor((n - w) / 2), ly = Math.floor((n - h) / 2);
    return { ox: x0 - lx, oy: y0 - ly, margin: Math.min(lx, n - w - lx, ly, n - h - ly) };
  }

  /** Hỏi Rapfi một thế (moves: [[x, y], …] toạ độ game, X đi trước). Chưa sẵn sàng / lỗi / không vừa bàn → null. */
  async function ask(rule, moves, ms) {
    if (!moves.length) return { move: [0, 0], ev: { cp: 0, mate: 0 }, margin: SIZE[rule] >> 1 };
    const n = SIZE[rule], f = frame(moves, n);
    if (!f || !(await ready(rule, 0))) return null;
    const st = cur, id = ++seq;
    const res = await new Promise((resolve) => {
      const timer = setTimeout(() => { st.worker.removeEventListener('message', onMsg); resolve(null); }, ms * 2 + 8000);
      function onMsg(e) {
        if (e.data.type !== 'move' || e.data.id !== id) return;
        clearTimeout(timer);
        st.worker.removeEventListener('message', onMsg);
        resolve(e.data);
      }
      st.worker.addEventListener('message', onMsg);
      st.worker.postMessage({ type: 'move', id, size: n, ms, moves: moves.map(([x, y]) => [x - f.ox, y - f.oy]) });
    });
    if (!res || !res.move) { if (cur === st && !res) stop(); return null; } // treo: lần sau dựng Worker mới
    const [rx, ry] = res.move;
    if (rx < 0 || ry < 0 || rx >= n || ry >= n) return null;
    return { move: [rx + f.ox, ry + f.oy], ev: res.ev, margin: f.margin };
  }

  // Engine của game (ai-worker.js) trong Worker riêng để kiểm thế sát mép – không tranh với Worker máy đánh của app.js
  let checker = null;
  function check(rule, moves, ms) {
    if (!checker) { try { checker = new Worker('ai-worker.js'); } catch (e) { return Promise.resolve(null); } }
    const w = checker, id = 'rchk' + ++seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { w.removeEventListener('message', onMsg); resolve(null); }, ms * 4 + 5000);
      function onMsg(e) {
        if (e.data.id !== id) return;
        clearTimeout(timer);
        w.removeEventListener('message', onMsg);
        resolve(e.data.ev || null);
      }
      w.addEventListener('message', onMsg);
      w.postMessage({ type: 'eval', id, gid: 'rapfi-check-' + rule, rule, ms, moves });
    });
  }

  // Đếm số nước Rapfi đi / phải nhường engine của game / engine sửa nước Rapfi sát mép (kiểm thử, gỡ lỗi)
  const stats = { rapfi: 0, fallback: 0, fixed: 0 };

  async function move(board, p, botId) {
    const bot = botOf(botId);
    if (!handles(bot, board.rule)) return null;
    const m = await think(board, p, bot);
    stats[m ? 'rapfi' : 'fallback']++;
    game[m ? 'rapfi' : 'fallback']++;
    return m;
  }

  async function think(board, p, bot) {
    const rule = board.rule, moves = board.moves.map((m) => [m.x, m.y]);
    if (!moves.length) return [0, 0];
    if ((moves.length % 2 === 0 ? C.X : C.O) !== p) return null; // Rapfi tính bên đi theo số quân
    // Luật Việt Nam: nước đầu ván lấy từ sách (Rapfi-CARO nghĩ 10 giây mỗi thế – hơn nghĩ 2,5 giây trên điện thoại)
    if (rule === 'vn' && moves.length <= BOOK_PLY && global.CaroBook) {
      const m = global.CaroBook.lookup(moves, 'vn-rapfi');
      if (m && board.get(m[0], m[1]) === C.EMPTY) return m;
    }
    const f = frame(moves, SIZE[rule]);
    if (!f || !(await ready(rule, FIRST_WAIT))) return null;
    const near = f.margin < SAFE_EDGE;
    // Sát mép: chừa thời gian cho engine kiểm lại (tổng vẫn ≈ thời gian nghĩ của BOAT)
    const r = await ask(rule, moves, near ? Math.max(800, bot.rapfi.ms - 2 * CHECK_MS) : bot.rapfi.ms);
    if (!r) return null;
    let [x, y] = r.move;
    if (board.get(x, y) !== C.EMPTY || (C.forbidden && C.forbidden(board, x, y, p))) return null;
    if (r.margin < SAFE_EDGE) {
      const [mine, after] = await Promise.all([check(rule, moves, CHECK_MS), check(rule, moves.concat([[x, y]]), CHECK_MS)]);
      const keeps = after && after.mate < 0; // sau nước Rapfi, đối thủ thua chắc
      const ok = (m) => m && board.get(m[0], m[1]) === C.EMPTY && !(C.forbidden && C.forbidden(board, m[0], m[1], p));
      // Engine thấy ta có chuỗi thắng mà nước Rapfi không giữ được / nước Rapfi để đối thủ có chuỗi thắng trong khi
      // engine chưa thấy ta thua: đi nước của engine (Rapfi đọc sai vì mép bàn)
      if (mine && ok(mine.move) && ((mine.mate > 0 && !keeps) || (after && after.mate > 0 && !(mine.mate < 0)))) {
        if (mine.move[0] !== x || mine.move[1] !== y) { stats.fixed++; [x, y] = mine.move; }
      }
    }
    return [x, y];
  }

  global.CaroRapfi = { handles, available, prepare, ready, move, ask, check, frame, stats, game, SIZE, SAFE_EDGE };
})(window);
