/*
 * Trang nhúng (embed.html) – chạy đầu tiên, trước i18n.js và CSS: đọc ?lang= và ?theme= từ địa chỉ.
 * Không ghi vào localStorage (trang nhúng cùng nguồn với app: không được đổi ngôn ngữ / giao diện của người dùng app).
 */
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const lang = q.get('lang');
  if (/^(vi|en|ru|zh)$/.test(lang || '')) window.CARO_LANG = lang; // i18n.js dùng thay cho ngôn ngữ đã lưu
  const theme = q.get('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
})();
