/*
 * VK Mini App – MVP (Đợt 1, docs/ke-hoach-tiep-can-toan-cau-21-11-2026.md). Chỉ chạy khi host-detect.js nhận ra VK
 * (window.CARO_HOST === 'vk' – có tham số khởi chạy vk_app_id + sign) và đã chèn VK Bridge (vendor/vk-bridge.js,
 * @vkontakte/vk-bridge 3.0.2, MIT – global vkBridge).
 *  – vkBridge.send('VKWebAppInit') – báo VK app đã sẵn sàng;
 *  – giao diện sáng / tối theo VK: VKWebAppGetConfig lúc mở + sự kiện VKWebAppUpdateConfig (data.appearance 'light' | 'dark'),
 *    chỉ khi người chơi chưa tự chọn (CaroHost.applyScheme – không lưu).
 * Đăng nhập bằng VK (Đợt 3): host-auth.js gửi tham số khởi chạy có chữ ký (host-detect.js đã chép vào sessionStorage),
 * máy chủ kiểm sign bằng khoá bí mật của app (server/src/host-auth.js) – không bao giờ tin vk_user_id khi chưa kiểm.
 */
(function () {
  'use strict';
  if (window.CARO_HOST !== 'vk') return;
  const H = window.CaroHost;
  const B = window.vkBridge;
  if (!B || typeof B.send !== 'function') return; // thư viện không nạp được: game vẫn chạy như web
  const scheme = (d) => { if (d && d.appearance) H.applyScheme(d.appearance); };
  B.subscribe((e) => {
    const d = e && e.detail;
    if (d && d.type === 'VKWebAppUpdateConfig') scheme(d.data);
  });
  B.send('VKWebAppInit').catch(() => {});
  B.send('VKWebAppGetConfig').then(scheme).catch(() => {});
  window.CaroVK = { bridge: B };
})();
