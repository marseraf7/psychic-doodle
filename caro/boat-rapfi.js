/*
 * BOAT dùng Rapfi (engine vô địch Gomocup, bản WebAssembly – caro/rapfi/, GPL-3) ở luật tự do / tiêu chuẩn / Renju.
 * Luật Việt Nam, trình duyệt không có WebAssembly SIMD, thế cờ không vừa bàn của Rapfi hay Rapfi lỗi → trả null để
 * app.js dùng engine của game như cũ. Rapfi chạy trong Worker riêng (rapfi/worker.js), chỉ nói chuyện qua postMessage.
 *
 * Bàn của game vô hạn, Rapfi cần bàn cố định (tự do 20×20, tiêu chuẩn / Renju 15×15 – đúng cỡ mạng NNUE đã học):
 * mỗi nước đặt khung bao các quân vào giữa bàn Rapfi, chừa ít nhất 1 ô mỗi bên để Rapfi không tưởng mép bàn là quân chặn.
 *
 *   CaroRapfi.handles(botId, rule)      – BOAT + luật có Rapfi + trình duyệt chạy được
 *   CaroRapfi.prepare(botId, rule)      – tải trước mạng (~10 MB, lần đầu) khi bắt đầu ván với BOAT
 *   CaroRapfi.move(board, p, botId)     – Promise<[x, y] | null>; CaroRapfi.stats: số nước Rapfi đi / nhường engine
 * Phát sự kiện window 'caro:rapfi' { state: 'loading' | 'ready' | 'failed', rule, pct }.
 */
(function (global) {
  'use strict';
  const C = global.Caro;
  const SIZE = { free: 20, std: 15, renju: 15 };
  const MB = { free: 10, std: 10, renju: 20 };
  const LOAD_WAIT = 6000; // chờ tải mạng tối đa ngần này cho một nước; quá thì nước đó dùng engine của game
  const T = (k, v) => (global.I18N ? global.I18N.t(k, v) : k);
  const toast = (m, ms) => global.CaroOnline && global.CaroOnline.toast(m, ms);

  let cur = null; // { rule, worker, ready: Promise<bool>, state, pct, toasted }
  const failed = {}; // luật đã lỗi tải trong phiên này → không thử lại cho tới khi tải lại trang
  let seq = 0;

  // Mạng NNUE của Rapfi bắt buộc có WebAssembly SIMD (kiểm bằng một hàm nhỏ dùng lệnh v128 – như wasm-feature-detect)
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
    return typeof WebAssembly === 'object' && !!global.Worker && /^(https?|capacitor):$/.test(global.location.protocol) && hasSimd();
  }
  function botOf(id) { return global.CaroBots && (typeof id === 'string' ? global.CaroBots.get(id) : id); }
  function handles(botId, rule) {
    const bot = botOf(botId);
    return !!(bot && bot.rapfi && SIZE[rule] && supported() && !failed[rule]);
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
    try { worker = new Worker('rapfi/worker.js'); } catch (e) { failed[rule] = true; return null; }
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
          st.state = 'failed'; failed[rule] = true;
          if (cur === st) stop();
          toast(T('rapfi_failed'), 4500);
          emit({ state: 'failed', rule });
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

  function prepare(botId, rule) { if (handles(botId, rule)) ensure(rule); }

  /** Khung đặt các quân vào bàn Rapfi cỡ n: { ox, oy } (toạ độ Rapfi = toạ độ game − o), hoặc null nếu không vừa. */
  function frame(moves, n) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const m of moves) { x0 = Math.min(x0, m.x); x1 = Math.max(x1, m.x); y0 = Math.min(y0, m.y); y1 = Math.max(y1, m.y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w > n - 2 || h > n - 2) return null;
    return { ox: x0 - Math.floor((n - w) / 2), oy: y0 - Math.floor((n - h) / 2) };
  }

  const wait = (ms) => new Promise((r) => setTimeout(() => r(false), ms));

  // Đếm số nước Rapfi đi / phải nhường engine của game (kiểm thử, gỡ lỗi)
  const stats = { rapfi: 0, fallback: 0 };

  async function move(board, p, botId) {
    if (!handles(botOf(botId), board.rule)) return null;
    const m = await think(board, p, botOf(botId));
    stats[m ? 'rapfi' : 'fallback']++;
    return m;
  }

  async function think(board, p, bot) {
    const rule = board.rule;
    const moves = board.moves;
    if (!moves.length) return [0, 0];
    if ((moves.length % 2 === 0 ? C.X : C.O) !== p) return null; // Rapfi tính bên đi theo số quân
    const n = SIZE[rule], f = frame(moves, n);
    if (!f) return null;
    const st = ensure(rule);
    if (!st) return null;
    const ok = st.state === 'ready' || (await Promise.race([st.ready, wait(LOAD_WAIT)]));
    if (!ok || cur !== st) return null;
    const ms = bot.rapfi.ms, id = ++seq;
    const res = await new Promise((resolve) => {
      const timer = setTimeout(() => { st.worker.removeEventListener('message', onMsg); resolve(null); }, ms * 2 + 8000);
      function onMsg(e) {
        if (e.data.type !== 'move' || e.data.id !== id) return;
        clearTimeout(timer);
        st.worker.removeEventListener('message', onMsg);
        resolve(e.data.move);
      }
      st.worker.addEventListener('message', onMsg);
      st.worker.postMessage({ type: 'move', id, size: n, ms, moves: moves.map((m) => [m.x - f.ox, m.y - f.oy]) });
    });
    if (!res) { if (cur === st) stop(); return null; } // treo / lỗi: lần sau dựng Worker mới (mạng lấy lại từ Cache Storage)
    const x = res[0] + f.ox, y = res[1] + f.oy;
    if (res[0] < 0 || res[1] < 0 || res[0] >= n || res[1] >= n || board.get(x, y) !== C.EMPTY) return null;
    if (C.forbidden && C.forbidden(board, x, y, p)) return null; // Renju: Rapfi không đi nước cấm, kiểm lại cho chắc
    return [x, y];
  }

  global.CaroRapfi = { handles, prepare, move, frame, stats, SIZE };
})(window);
