/*
 * Lớp "chạy trong ứng dụng khác" dùng chung cho Telegram Mini App (host-telegram.js) và VK Mini App (host-vk.js).
 * window.CARO_HOST do host-detect.js đặt (trong <head>); bản web chính: CaroHost.on = false và không làm gì.
 * window.CaroHost = {
 *   name, on,
 *   canBack()          – có bước lùi trong app không (menu chat nhanh / hộp thoại đang mở, trang con, đang ở bàn cờ);
 *                        ở Trang chủ thì không (nút đóng của nền tảng thoát Mini App),
 *   back()             – lùi một bước như nút Back của Android (native.js): đóng menu / hộp thoại trên cùng, lùi trang,
 *                        thoát xem lại, bàn cờ → trang đang xem dở; → true nếu đã lùi,
 *   applyScheme(mode)  – giao diện sáng / tối của nền tảng, chỉ khi người chơi chưa tự chọn (CaroTheme.setHost, không lưu),
 *   setOpenLink(fn)    – nền tảng mở link ra ngoài bằng API của nó (Telegram.WebApp.openLink); link http(s) khác nguồn được
 *                        bấm trong app đi qua fn thay vì mở trong khung của nền tảng,
 *   isExternal(href)
 * }
 */
(function () {
  'use strict';
  const name = window.CARO_HOST || null;
  const $ = (id) => document.getElementById(id);
  let opener = null;

  function isExternal(href) {
    try {
      const u = new URL(String(href), location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== location.origin;
    } catch (e) { return false; }
  }

  /** Hộp thoại mở sau cùng (hộp thoại đã thành trang của shell.js không tính). */
  function topDialog() {
    const open = [...document.querySelectorAll('dialog[open]:not(.proxied)')];
    open.sort((a, b) => Number(a.dataset.openedAt || 0) - Number(b.dataset.openedAt || 0));
    return open[open.length - 1] || null;
  }

  function canBack() {
    const menu = $('quick-menu');
    if ((menu && !menu.hidden) || topDialog()) return true;
    const Sh = window.CaroShell;
    if (!Sh) return false;
    return !Sh.visible || Sh.current !== 'home';
  }

  function back() {
    const menu = $('quick-menu');
    if (menu && !menu.hidden) { menu.hidden = true; return true; }
    const d = topDialog();
    if (d) {
      if (typeof d.onBack === 'function' && d.onBack()) return true; // hộp thoại nhiều trang: về trang trước
      if (d.close) d.close(); else d.removeAttribute('open');
      return true;
    }
    const Sh = window.CaroShell, App = window.CaroApp;
    if (Sh && Sh.visible) return Sh.current !== 'home' && Sh.back();
    if (App && App.replay) { App.closeReplay(); return true; }
    if (Sh) { Sh.show(); return true; } // bàn cờ → trang đang xem dở (ván vẫn giữ, quay lại bằng thẻ Tiếp tục)
    return false;
  }

  const applyScheme = (mode) => !!(window.CaroTheme && window.CaroTheme.setHost && window.CaroTheme.setHost(mode));
  const setOpenLink = (fn) => { opener = typeof fn === 'function' ? fn : null; };

  window.CaroHost = { name, on: !!name, canBack, back, applyScheme, setOpenLink, isExternal };
  if (!name) return;

  document.addEventListener('click', (e) => {
    if (!opener || e.defaultPrevented) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !isExternal(a.href)) return;
    e.preventDefault();
    opener(a.href);
  });
})();
