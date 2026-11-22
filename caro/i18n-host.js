/*
 * Chuỗi giao diện khi game chạy trong nền tảng khác: bản cổng game (portal.js – CrazyGames / itch.io), Telegram / VK
 * (host-*.js). Đủ 4 ngôn ngữ (docs/van-phong-4-ngon-ngu.md).
 */
(function () {
  'use strict';
  const I = window.I18N;
  I.extend('vi', {
    portal_no_login: 'Bản này không có đăng nhập. Bạn đang chơi với tư cách khách.',
  });
  I.extend('en', {
    portal_no_login: 'Sign-in is not available in this version. You are playing as a guest.',
  });
  I.extend('ru', {
    portal_no_login: 'В этой версии вход недоступен. Вы играете как гость.',
  });
  I.extend('zh', {
    portal_no_login: '此版本不支持登录。你正在以游客身份游戏。',
  });
})();
