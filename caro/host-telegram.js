/*
 * Telegram Mini App – MVP (Đợt 1, docs/ke-hoach-tiep-can-toan-cau-21-11-2026.md). Chỉ chạy khi host-detect.js nhận ra Telegram
 * (window.CARO_HOST === 'telegram') và đã chèn thư viện chính thức telegram-web-app.js. Theo core.telegram.org/bots/webapps:
 *  – ready() (sẵn sàng hiển thị), expand() (cao tối đa); disableVerticalSwipes() (Bot API 7.7 – vuốt dọc trên bàn cờ không
 *    đóng Mini App);
 *  – requestFullscreen() (Bot API 8.0) chỉ khi địa chỉ Web App có ?fs=1 và trên điện thoại: ở toàn màn hình Telegram đặt nút
 *    Đóng / menu đè lên mép trên, các thanh cố định của app mới chừa env(safe-area-inset-top), chưa chừa
 *    --tg-content-safe-area-inset-top – bật khi đã kiểm trên máy thật;
 *  – colorScheme → giao diện sáng / tối (nếu người chơi chưa tự chọn), themeParams.button_color → --accent; báo màu nền của
 *    app cho Telegram (setHeaderColor / setBackgroundColor 6.1, setBottomBarColor 7.10) để khung Telegram liền màu;
 *  – BackButton (6.1): hiện khi có bước lùi trong app (CaroHost.canBack), bấm = CaroHost.back();
 *  – đang chơi online: enableClosingConfirmation (6.2) – đóng Mini App phải xác nhận (ván vẫn khôi phục khi mở lại);
 *  – link ra ngoài: openLink (link t.me: openTelegramLink).
 * Đăng nhập bằng Telegram (initData có chữ ký, máy chủ kiểm – Đợt 3): host-auth.js.
 */
(function () {
  'use strict';
  if (window.CARO_HOST !== 'telegram') return;
  const H = window.CaroHost;
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '').trim()) ? String(c).trim() : null);

  function init(W) {
    const ver = (v) => { try { return !!W.isVersionAtLeast && W.isVersionAtLeast(v); } catch (e) { return false; } };
    const call = (fn, ...a) => { try { if (typeof W[fn] === 'function') return W[fn](...a); } catch (e) { /* bản Telegram cũ */ } return undefined; };
    call('ready');
    call('expand');
    if (ver('7.7')) call('disableVerticalSwipes');
    if (ver('8.0') && /[?&]fs=1(&|$)/.test(location.search) && /^(android|ios)$/.test(W.platform)) call('requestFullscreen');

    // Màu: khung Telegram theo nền của app
    const colors = () => {
      const bg = hex(getComputedStyle(document.documentElement).getPropertyValue('--bg'));
      if (!bg) return;
      if (ver('6.1')) { call('setHeaderColor', bg); call('setBackgroundColor', bg); }
      if (ver('7.10')) call('setBottomBarColor', bg);
    };
    const theme = () => {
      H.applyScheme(W.colorScheme);
      const btn = hex(W.themeParams && W.themeParams.button_color);
      if (btn) document.documentElement.style.setProperty('--accent', btn);
      colors();
    };
    theme();
    call('onEvent', 'themeChanged', theme);
    if (window.CaroTheme) window.CaroTheme.onChange(() => setTimeout(colors, 0));

    // Nút Back của Telegram
    const B = W.BackButton;
    if (B && ver('6.1')) {
      let shown = false;
      const sync = () => {
        const want = H.canBack();
        if (want === shown) return;
        shown = want;
        try { if (want) B.show(); else B.hide(); } catch (e) { /* bỏ qua */ }
      };
      B.onClick(() => { H.back(); setTimeout(sync, 0); });
      for (const ev of ['caro:page', 'caro:board', 'caro:replayclose']) window.addEventListener(ev, () => setTimeout(sync, 0));
      setInterval(sync, 400); // hộp thoại mở / đóng không phát sự kiện chung
      sync();
    }

    // Đang chơi online: đóng Mini App phải xác nhận
    if (ver('6.2')) {
      let on = false;
      setInterval(() => {
        const App = window.CaroApp, o = App && App.online;
        const want = !!(o && !o.watch && o.room && !o.room.winner && o.room.players && o.room.players.length === 2);
        if (want !== on) { on = want; call(want ? 'enableClosingConfirmation' : 'disableClosingConfirmation'); }
      }, 1000);
    }

    H.setOpenLink((url) => { if (/^https:\/\/t\.me\//i.test(url) && ver('6.1')) call('openTelegramLink', url); else call('openLink', url); });
    window.CaroTelegram = { webApp: W };
  }

  // Thư viện được chèn đồng bộ trong <head> nên thường đã có; CSP chặn / mạng chậm thì chờ tối đa ~10 giây rồi thôi
  let n = 0;
  (function wait() {
    const W = window.Telegram && window.Telegram.WebApp;
    if (W) init(W);
    else if (++n < 50) setTimeout(wait, 200);
  })();
})();
