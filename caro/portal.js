/*
 * Bản cổng game (CrazyGames / itch.io – window.CARO_PORTAL do server/scripts/build-portal.js đặt lúc đóng gói, không phải
 * tham số người dùng gõ). Bản web chính: file này chỉ khai báo window.CaroPortal = { on: false } rồi thôi.
 * Theo yêu cầu cổng (docs.crazygames.com – Account integration mức Basic, Technical requirements):
 *  – chơi khách mặc định, không đăng nhập / đăng ký: mọi chỗ mở hộp đăng nhập (online-auth.js · openAuth) gọi noLogin() –
 *    báo "bản này không có đăng nhập"; nút Đăng nhập / Đăng ký ẩn bằng host.css;
 *  – không link ra ngoài (trang chính, mạng xã hội, cửa hàng ứng dụng): link http(s) khác nguồn ẩn bằng host.css, bấm vào
 *    link ra ngoài (kể cả link vẽ sau) hay window.open ra ngoài đều bị chặn ở đây;
 *  – chat tự do (bạn bè, CLB) ẩn bằng host.css – chỉ còn chat nhanh có sẵn (câu mẫu) trong phòng;
 *  – không service worker (sw-boot.js), không gợi ý cài ứng dụng (pwa-install.js), tiếng Anh mặc định (i18n.js · CARO_LANG0).
 * window.CaroPortal = { on, mode, noLogin(), isExternal(href) }
 */
(function () {
  'use strict';
  const mode = window.CARO_PORTAL || null;
  const T = (k, a) => window.I18N.t(k, a);

  /** Link dẫn ra khỏi gói game: http(s) khác nguồn, mailto:, tel:, intent:… (link tương đối trong gói thì không). */
  function isExternal(href) {
    let u;
    try { u = new URL(String(href), location.href); } catch (e) { return false; }
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin !== location.origin;
    return !['javascript:', 'blob:', 'data:', 'about:'].includes(u.protocol) && u.origin !== location.origin;
  }

  /** Thay hộp đăng nhập / đăng ký: báo một dòng, người chơi vẫn chơi khách như cũ. */
  function noLogin() {
    if (window.CaroConfirm) window.CaroConfirm.info(T('portal_no_login'));
  }

  window.CaroPortal = { on: !!mode, mode, noLogin, isExternal };
  if (!mode) return;

  // Link ra ngoài: chặn ở pha bắt (trước mọi xử lý khác); link trong gói (privacy.html, licenses.html) vẫn mở được
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && isExternal(a.href)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  const open0 = window.open;
  window.open = function (url) {
    if (url && isExternal(url)) return null;
    return open0.apply(window, arguments);
  };
})();
