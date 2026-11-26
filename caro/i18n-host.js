/*
 * Chuỗi giao diện khi game chạy trong nền tảng khác: bản cổng game (portal.js – CrazyGames / itch.io), Telegram / VK
 * (host-*.js), Discord Activity (host-discord.js). Đủ 4 ngôn ngữ (docs/van-phong-4-ngon-ngu.md).
 */
(function () {
  'use strict';
  const I = window.I18N;
  I.extend('vi', {
    portal_no_login: 'Bản này không có đăng nhập. Bạn đang chơi với tư cách khách.',
    discord_invite: 'Mời bạn trên Discord',
    discord_room_hint: 'Người trong cuộc gọi mở Caro, chọn "Vào phòng bằng mã" rồi nhập mã phòng và mật khẩu ở trên.',
  });
  I.extend('en', {
    portal_no_login: 'Sign-in is not available in this version. You are playing as a guest.',
    discord_invite: 'Invite on Discord',
    discord_room_hint: 'Others in the call open Caro, tap "Join with code", then enter the room code and password above.',
  });
  I.extend('ru', {
    portal_no_login: 'В этой версии вход недоступен. Вы играете как гость.',
    discord_invite: 'Пригласить в Discord',
    discord_room_hint: 'Участники звонка открывают Caro, нажимают «Войти по коду» и вводят код комнаты и пароль выше.',
  });
  I.extend('zh', {
    portal_no_login: '此版本不支持登录。你正在以游客身份游戏。',
    discord_invite: '在 Discord 中邀请',
    discord_room_hint: '通话中的其他人打开 Caro，点“输入房间号加入”，再输入上面的房间号和密码。',
  });
})();
