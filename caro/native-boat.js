/*
 * BOAT dùng Rapfi gốc của app desktop (Tauri – desktop/www-extra/native-engine.js: window.CaroNativeEngine, Rapfi chạy
 * như tiến trình riêng, nhanh hơn bản WebAssembly ×3,35 mỗi luồng – docs/thi-diem-desktop-tauri.md). boat-rapfi.js hỏi
 * module này trước; trả null thì đi tiếp đường Worker WASM như cũ. Ngoài app desktop (web, Android, iOS) không có
 * CaroNativeEngine nên on() luôn false và module không làm gì.
 *
 *   CaroNativeBoat.on(rule)               – có Rapfi gốc cho luật này (app desktop, không lỗi trong RETRY_MS vừa qua)
 *   CaroNativeBoat.ask(rule, moves, ms, o) – moves: [[x, y], …] toạ độ game (X đi trước); o: { place(rule, moves) → khung
 *                                           { ox, oy, margin } (rapfi-board.js), live() → thế vẫn là thế đang chờ nước }
 *     → Promise<{ move: [x, y] toạ độ game, margin, used } | { stale: true } | null>
 *       null: lỗi / quá hạn / trả nước ngoài bàn → boat-rapfi.js dùng WASM; từ đó RETRY_MS không hỏi bản gốc nữa
 *       stale: đã có lượt hỏi mới, ván mới (cancel) hay người chơi đã đi lại trong lúc Rapfi nghĩ → bỏ câu trả lời
 *   CaroNativeBoat.fail(why)              – boat-rapfi.js báo nước bản gốc trả không dùng được (ô có quân / cấm)
 *   CaroNativeBoat.cancel()               – bỏ mọi câu trả lời đang chờ (ván mới)
 *   CaroNativeBoat.cfg                    – { slack, retryMs } (kiểm thử đặt nhỏ lại) · stats – đếm (kiểm thử, tự kiểm)
 */
(function (global) {
  'use strict';
  const SIZE = { free: 20, std: 15, renju: 15, vn: 20 }; // như rapfi-board.js và Rule::board_size (desktop/src-tauri/rapfi)
  // Quá hạn = 2 × thời gian nghĩ + slack: đủ cho lần đầu (chạy tiến trình, nạp mạng NNUE) và cho lượt cũ còn đang nghĩ
  // trong Rust (một tiến trình mỗi luật, hỏi lần lượt) khi người chơi vừa đi lại; quá thì WASM đi nước này
  const cfg = { slack: 5000, retryMs: 60000 };
  const stats = { native: 0, fail: 0, timeout: 0, stale: 0, ms: 0, last: '' };
  let seq = 0, failedAt = 0;

  const engine = () => {
    const E = global.CaroNativeEngine;
    return E && E.available === true && typeof E.bestMove === 'function' ? E : null;
  };
  const on = (rule) => !!(SIZE[rule] && engine() && !(failedAt && Date.now() - failedAt < cfg.retryMs));

  function fail(why) {
    failedAt = Date.now();
    stats.fail++;
    stats.last = String(why || '');
  }

  async function ask(rule, moves, ms, o) {
    const E = engine(), n = SIZE[rule];
    if (!E || !on(rule)) return null;
    const f = o.place(rule, moves);
    if (!f) return null; // không vừa bàn Rapfi: boat-rapfi.js tự lo (như WASM)
    const id = ++seq, t0 = Date.now();
    let timer = 0;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), ms * 2 + cfg.slack); });
    let r;
    try {
      r = await Promise.race([E.bestMove(moves.map(([x, y]) => [x - f.ox, y - f.oy]), rule, ms), late]);
    } catch (e) {
      r = e instanceof Error ? e : new Error(String(e)); // lệnh Tauri báo lỗi bằng chuỗi
    } finally {
      clearTimeout(timer);
    }
    // Trong lúc chờ: lượt hỏi mới / ván mới / người chơi đi lại → câu trả lời này thuộc thế cũ
    if (id !== seq || (o.live && !o.live())) { stats.stale++; return { stale: true }; }
    if (r === 'timeout') { stats.timeout++; fail('quá hạn'); return null; }
    if (r instanceof Error) { fail(r.message); return null; }
    const [rx, ry] = Array.isArray(r) ? r : [];
    if (!(Number.isInteger(rx) && Number.isInteger(ry) && rx >= 0 && ry >= 0 && rx < n && ry < n)) { fail('nước ngoài bàn: ' + r); return null; }
    stats.native++;
    stats.ms = Date.now() - t0;
    return { move: [rx + f.ox, ry + f.oy], margin: f.margin, used: stats.ms };
  }

  function cancel() { seq++; }

  global.CaroNativeBoat = { on, ask, fail, cancel, cfg, stats, SIZE };
})(window);
