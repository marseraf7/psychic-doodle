/*
 * Trang nhúng (embed.html) – chạy đầu tiên, trước i18n.js và CSS: đọc ?lang= và ?theme= từ địa chỉ.
 * Không ghi vào localStorage (trang nhúng cùng nguồn với app: không được đổi ngôn ngữ / giao diện của người dùng app).
 */
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const lang = q.get('lang');
  // i18n.js dùng thay cho ngôn ngữ đã lưu; mã không có trong langs.js (vd. 'fr') thì i18n.js bỏ qua
  if (/^[A-Za-z]{2}(-[A-Za-z]{4})?$/.test(lang || '')) window.CARO_LANG = lang;
  const theme = q.get('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
})();
