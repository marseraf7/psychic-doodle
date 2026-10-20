/*
 * Tự giảm tải cho BOAT chạy Rapfi (boat-rapfi.js · CaroRapfi.load): theo dõi máy căng / nóng và pin để BOAT nghĩ nhẹ đi
 * trước khi trang bị giật (bổ sung cho cách đo khung hình ở rapfi-settings.js – cách đó chỉ biết sau khi đã giật).
 *   - Compute Pressure API (PressureObserver, Chrome / Edge ≥ 125): 'serious' → mức 1, 'critical' → mức 2.
 *   - Battery Status API (navigator.getBattery – Chrome / Edge / Android): không sạc và pin ≤ 20% → mức 1.
 * Mức 1: thôi nghĩ trước, nửa số luồng · mức 2: thôi nghĩ trước, 1 luồng · về 0: như cũ (nghĩ trước tiếp đúng thế đang chờ).
 * Trình duyệt không có API nào: không làm gì.
 *   CaroRapfiLoad.level – mức hiện tại (kiểm thử)
 */
(function (global) {
  'use strict';
  const R = global.CaroRapfi;
  if (!R) return;
  const LOW_BATTERY = 0.2;
  let pressure = 0, battery = 0;
  const apply = () => R.load(Math.max(pressure, battery));

  // Máy căng / nóng: mẫu mỗi 2 giây (đủ nhanh, gần như không tốn gì)
  if (typeof global.PressureObserver === 'function') {
    try {
      const obs = new global.PressureObserver((records) => {
        const s = records.length ? records[records.length - 1].state : 'nominal';
        pressure = s === 'critical' ? 2 : s === 'serious' ? 1 : 0;
        apply();
      });
      const p = obs.observe('cpu', { sampleInterval: 2000 });
      if (p && p.catch) p.catch(() => { /* không được phép / không hỗ trợ nguồn 'cpu' */ });
    } catch (e) { /* trình duyệt cũ */ }
  }

  // Pin yếu mà không sạc
  if (global.navigator && typeof global.navigator.getBattery === 'function') {
    global.navigator.getBattery().then((b) => {
      const f = () => { battery = !b.charging && b.level <= LOW_BATTERY ? 1 : 0; apply(); };
      b.addEventListener('levelchange', f);
      b.addEventListener('chargingchange', f);
      f();
    }).catch(() => { /* không cho đọc pin */ });
  }

  global.CaroRapfiLoad = { get level() { return Math.max(pressure, battery); } };
})(window);
