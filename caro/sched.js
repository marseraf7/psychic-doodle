/*
 * Chia việc khởi động thành nhiều việc CPU ngắn (A2 – tải lần đầu nhanh hơn trên điện thoại yếu).
 * window.CaroSched:
 *   yield()      – nhường luồng chính cho trình duyệt (vẽ khung hình, nhận chạm) rồi chạy tiếp: scheduler.yield() nếu có,
 *                  không thì MessageChannel (nhanh hơn setTimeout 0 – không bị kẹp tối thiểu 4 ms), cuối cùng setTimeout.
 *   afterPaint(f) – chạy f sau lần vẽ kế tiếp (requestAnimationFrame rồi một việc mới): lúc đó bố cục đã tính xong,
 *                  đọc kích thước / màu không bắt trình duyệt tính lại bố cục giữa chừng (forced sync layout).
 *   idle(f, ms)   – chạy f khi rảnh (requestIdleCallback, chậm nhất sau ms); trình duyệt không có thì setTimeout.
 *   afterLoad(f)  – chạy f khi trang đã tải xong (sự kiện load) và trình duyệt rảnh – vd. đăng ký service worker,
 *                  lưu sẵn file cho chơi offline (sw-boot.js) để không tranh băng thông với lần tải đầu.
 * Dùng chung trình duyệt; không đụng DOM ngoài window / document.
 */
(function () {
  'use strict';
  function yieldNow() {
    try {
      if (window.scheduler && typeof window.scheduler.yield === 'function') return window.scheduler.yield();
    } catch (e) { /* trình duyệt cũ */ }
    return new Promise((done) => {
      if (typeof MessageChannel === 'function') {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => { ch.port1.close(); done(); };
        ch.port2.postMessage(0);
      } else setTimeout(done, 0);
    });
  }
  function afterPaint(f) {
    if (typeof requestAnimationFrame !== 'function' || document.hidden) { setTimeout(f, 0); return; } // thẻ ẩn: rAF không chạy
    requestAnimationFrame(() => setTimeout(f, 0));
  }
  function idle(f, ms = 2000) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => f(), { timeout: ms });
    else setTimeout(f, Math.min(ms, 300));
  }
  function afterLoad(f, ms) {
    if (document.readyState === 'complete') idle(f, ms);
    else window.addEventListener('load', () => idle(f, ms), { once: true });
  }
  window.CaroSched = { yield: yieldNow, afterPaint, idle, afterLoad };
})();
