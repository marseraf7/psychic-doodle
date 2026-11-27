/*
 * Service worker cho chơi offline (sw.js) – đăng ký, lưu sẵn phần còn lại, tải lại khi có bản mới. Tách khỏi app.js (A2).
 *  – Đăng ký SAU khi trang tải xong và trình duyệt rảnh (CaroSched.afterLoad): lần mở đầu tiên không phải chia băng thông
 *    với ~300 file service worker tải về. Lúc cài, sw.js chỉ lưu vỏ tối thiểu (trang, CSS, các khối mã, biểu tượng).
 *  – Rồi, lúc rảnh, nhờ service worker lưu nốt phần còn lại (gói chuỗi dịch – ngôn ngữ đang dùng trước, ảnh, file lẻ…):
 *    tin { t: 'precache', lang }. Mỗi lần mở trang đều nhắc lại (chỉ tải file còn thiếu), nên một lần rớt mạng giữa chừng
 *    thì lần sau tự lưu bù. Xong một lượt đầy đủ thì chơi được khi mất mạng.
 *  – sw.js lấy file từ bộ nhớ đệm trước: bản mới cài xong thì trang đang mở vẫn chạy bản cũ. Đang ở các trang (không giữa
 *    ván online) thì tải lại luôn để dùng bản mới; đang chơi thì để lần mở sau. Lần cài đầu (chưa có bản cũ) không tải lại.
 *    Đang gõ dở (ô đang focus, hoặc ô có chữ – form đăng ký, chat…) thì hoãn tới lần chuyển trang / quay lại app sau.
 * Trong ứng dụng điện thoại (CaroNative) các file đã nằm sẵn trong app: không dùng service worker. Bản cổng game
 * (CARO_PORTAL – CrazyGames / itch.io phục vụ gói từ tên miền của họ) cũng không: tránh bộ đệm trên tên miền lạ. Discord Activity
 * (CARO_HOST 'discord' – trang chạy trên tên miền discordsays.com của Discord, qua proxy của họ) cũng vậy.
 * window.CaroSW.status() – { state: 'none' | 'installing' | 'waiting' | 'active' | 'off', controller, scope } (perf-box.js).
 */
(function () {
  'use strict';
  const SW = navigator.serviceWorker;
  const usable = !!SW && location.protocol.startsWith('http') && !window.CaroNative && !window.CARO_PORTAL && window.CARO_HOST !== 'discord';
  let reg = null;

  /** Nhờ service worker đang chạy lưu nốt các file chưa có. */
  function askPrecache() {
    if (!usable) return;
    window.CaroSched.idle(() => {
      SW.ready.then((r) => {
        const w = r.active;
        if (w) w.postMessage({ t: 'precache', lang: (window.I18N && window.I18N.lang) || window.CARO_PACK || 'vi' });
      }).catch(() => {});
    }, 4000);
  }

  function status() {
    if (!usable) return { state: 'off', controller: false, scope: '' };
    const r = reg;
    const state = !r ? 'none' : r.installing ? 'installing' : r.waiting ? 'waiting' : r.active ? 'active' : 'none';
    return { state, controller: !!SW.controller, scope: r ? r.scope : '' };
  }

  if (usable) {
    const hadCtl = !!SW.controller;
    // Trang đã có bản đăng ký từ lần trước: đọc sẵn để ô số đo (?perf=1) hiện đúng ngay
    if (SW.getRegistration) SW.getRegistration().then((r) => { if (r && !reg) reg = r; }).catch(() => {});
    window.CaroSched.afterLoad(() => {
      SW.register('sw.js').then((r) => { reg = r; askPrecache(); }).catch(() => {});
    }, 3000);

    let updateReady = false;
    const typing = () => {
      const a = document.activeElement;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true;
      return [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea')]
        .some((i) => i.value && i.offsetParent !== null && i.defaultValue !== i.value);
    };
    const tryUpdate = () => {
      const App = window.CaroApp;
      if (!updateReady || (App && App.online) || !(window.CaroShell && window.CaroShell.visible) || typing()) return;
      location.reload();
    };
    SW.addEventListener('controllerchange', () => {
      // Bản mới vừa nhận trang này (hoặc lần cài đầu): bộ đệm mới mới có vỏ – nhờ lưu nốt phần còn lại
      askPrecache();
      if (hadCtl) { updateReady = true; tryUpdate(); }
    });
    window.addEventListener('caro:page', () => setTimeout(tryUpdate, 0));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tryUpdate(); });
  }

  window.CaroSW = { status, askPrecache };
})();
