/*
 * Cầu nối THÍ ĐIỂM tới Rapfi gốc của app desktop (Tauri): Rapfi chạy như tiến trình riêng (sidecar), JS chỉ gọi hai lệnh
 * Tauri engine_bench / engine_best_move (desktop/src-tauri/src/engine.rs). BOAT đi nước qua đây (caro/native-boat.js,
 * lỗi / quá hạn thì về Worker WASM); nghĩ trước và phân tích vẫn dùng bản WebAssembly. Thử trong DevTools của app:
 *   await CaroNativeEngine.bench()                        → { nodesPerSec, nodes, timeMs, hash } (~25 giây, 1 luồng)
 *   await CaroNativeEngine.bestMove([[7, 7]], 'std', 500)  → [x, y]
 * moves: [[x, y], …] toạ độ 0..size-1, quân đen đi trước; rule: 'free' | 'std' | 'renju' | 'vn' (cỡ bàn 20 / 15 / 15 / 20,
 * như caro/rapfi/worker.js); ms: thời gian nghĩ (40 ms – 10 phút). Ngoài app desktop: available = false, các hàm báo lỗi.
 */
(function () {
  'use strict';
  const core = window.__TAURI__ && window.__TAURI__.core;
  const invoke = core && typeof core.invoke === 'function' ? core.invoke : null;
  const missing = () => Promise.reject(new Error('Rapfi gốc chỉ có trong app desktop'));
  window.CaroNativeEngine = {
    available: !!invoke,
    bench: () => (invoke ? invoke('engine_bench') : missing()),
    bestMove: (moves, rule, ms) => (invoke
      ? invoke('engine_best_move', { moves, rule, timeMs: Math.round(ms) }).then((s) => s.split(',').map(Number))
      : missing()),
  };
})();
