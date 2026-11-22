/*
 * Nhận biết trang đang chạy ở đâu – chạy trong <head>, đồng bộ, trước mọi mã khác (bản web chính: không làm gì cả).
 *  – Bản cổng game (CrazyGames / itch.io): server/scripts/build-portal.js ghi window.CARO_PORTAL vào portal-config.js, nạp
 *    trước file này → lớp html.portal + html.portal-<tên cổng>, window.CARO_SRC = tên cổng (đo theo nguồn – trường src
 *    của tin hello do phần khác đọc). Phần còn lại của bản cổng: portal.js, portal-crazygames.js, host.css.
 * Hàm thuần (kiểm thử trên Node: caro/tests/host-detect.test.js): window.CaroHostDetect = { PORTALS, portalOf }.
 */
(function (root) {
  'use strict';
  const PORTALS = ['crazygames', 'itch'];
  /** Tên cổng hợp lệ hoặc null. */
  const portalOf = (v) => (PORTALS.includes(v) ? v : null);

  const api = { PORTALS, portalOf };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  const w = root;
  const html = document.documentElement;
  const portal = portalOf(w.CARO_PORTAL);
  w.CARO_PORTAL = portal; // giá trị lạ = không phải bản cổng
  if (portal) {
    html.classList.add('portal', 'portal-' + portal);
    w.CARO_SRC = portal;
  }
  w.CaroHostDetect = api;
})(this);
