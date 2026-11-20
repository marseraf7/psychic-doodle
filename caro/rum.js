/*
 * Đo tốc độ trên máy người chơi (bước 2 của docs/nghien-cuu-viet-lai-rust-17-11-2026.md): mỗi lượt mở trang gửi một lần
 * vài con số về máy chủ (server/src/rum.js, POST /api/rum) khi trang bị ẩn / đóng – để biết trang chậm ở đâu trên điện
 * thoại thật, trong Zalo / Messenger (CrUX của Google không có số của trình duyệt trong app).
 *   ttfb, fcp, dcl, load – mốc tải trang; lcp – lần vẽ phần lớn nhất; cls – độ xô lệch bố cục;
 *   inp – lần tương tác (chạm / bấm / gõ) phản hồi chậm nhất; loaf – số khung hình bị trễ > 50 ms; longest – khung trễ nhất.
 * Không gửi tên, tài khoản, nội dung ván hay địa chỉ trang. Xem privacy.html ("Số đo tốc độ tải trang").
 */
(function () {
  'use strict';
  const m = { inp: 0, cls: 0, lcp: 0, loaf: 0, longest: 0 };
  const watch = (type, fn, opts) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...opts }); } catch (e) { /* không hỗ trợ */ } };
  watch('largest-contentful-paint', (e) => { m.lcp = e.startTime; });
  watch('layout-shift', (e) => { if (!e.hadRecentInput) m.cls += e.value; });
  watch('event', (e) => { if (e.interactionId) m.inp = Math.max(m.inp, e.duration); }, { durationThreshold: 16 });
  watch('long-animation-frame', (e) => { m.loaf++; m.longest = Math.max(m.longest, e.duration); });

  let sent = false;
  function send() {
    if (sent || !navigator.sendBeacon) return;
    sent = true;
    const n = performance.getEntriesByType('navigation')[0] || {};
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const body = {
      ttfb: n.responseStart, fcp: fcp && fcp.startTime, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd,
      lcp: m.lcp, cls: Math.round(m.cls * 1000) / 1000, inp: m.inp, loaf: m.loaf, longest: m.longest,
      bundle: !!window.CARO_PACKS, app: !!window.CARO_APP_VERSION && !window.CARO_DESKTOP, desktop: !!window.CARO_DESKTOP,
    };
    for (const k of Object.keys(body)) if (typeof body[k] === 'number') body[k] = Math.round(body[k] * 1000) / 1000;
    try {
      navigator.sendBeacon((window.CARO_SERVER || '') + '/api/rum', new Blob([JSON.stringify(body)], { type: 'text/plain' }));
    } catch (e) { /* mất mạng / bị chặn: thôi */ }
  }
  // Trang bị ẩn (chuyển app, khoá máy) là lúc chắc chắn nhất trên điện thoại – pagehide có thể không đến
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(); });
  window.addEventListener('pagehide', send);
  window.CaroRum = { metrics: () => ({ ...m }), send };
})();
