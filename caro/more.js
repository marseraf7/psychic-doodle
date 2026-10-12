/*
 * Trang "Xem thêm" (như tab Xem thêm của app Lichess): thẻ tài khoản (online.js vẽ vào #account), các khối
 * Chơi (giải đấu, câu lạc bộ, vào phòng bằng mã) · Công cụ (lịch sử, xếp hạng, thành tích, học chơi) ·
 * Cộng đồng (bạn bè – online.js vẽ vào #friends) · Cài đặt.
 * Hàng có data-fwd="<id>" bấm hộ nút gốc (nút gốc nằm ở Trang chủ và giữ nguyên mã xử lý cũ).
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const N = window.CaroOnline;
  const page = $('page-more');

  page.addEventListener('click', (e) => {
    const f = e.target.closest('[data-fwd]');
    if (f) { $(f.dataset.fwd).click(); return; }
    const s = e.target.closest('.list [data-social]');
    if (s && window.CaroSocial) window.CaroSocial.open(s.dataset.social);
  });
  $('more-settings').onclick = () => $('btn-settings').click();

  // Mở trang: kết nối để thẻ tài khoản / bạn bè có dữ liệu
  window.addEventListener('caro:page', (e) => {
    if (e.detail.id !== 'more' || !N || document.body.classList.contains('no-online')) return;
    N.connect();
    N.render();
  });
})();
