/*
 * Cài ứng dụng (PWA – A4): nút "Cài ứng dụng" ở Cài đặt và thẻ nhỏ ở Trang chủ (từ lần mở thứ 2, tắt được).
 *  – Chrome / Edge / Android: sự kiện beforeinstallprompt → nút Cài đặt mở hộp cài của trình duyệt.
 *  – iPhone / iPad (Safari): không có hộp cài → gợi ý "Chia sẻ → Thêm vào MH chính".
 *  – Trình duyệt trong Zalo / Messenger / Facebook / Instagram…: không cài được → gợi ý "Mở bằng trình duyệt" (Android: nút
 *    mở thẳng Chrome; nơi khác: sao chép link).
 *  – Ẩn hẳn: trong app điện thoại (Capacitor – CaroNative), app máy tính (Tauri), đã cài (display-mode standalone).
 * kindOf(env) là hàm thuần (kiểm thử: caro/tests/pwa-install.test.js). window.CaroInstall = { kind, act, render }.
 */
(function () {
  'use strict';
  // Trình duyệt nhúng trong ứng dụng chat / mạng xã hội (không có hộp cài PWA, menu ⋯ có "Mở bằng trình duyệt")
  const IN_APP = /\bZalo\b|FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|\bLine\/|MicroMessenger|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter/i;
  const IOS = /iPhone|iPad|iPod/i;

  /**
   * Cách cài trên máy này. env: { ua, standalone, native, tauri, prompt, touchMac }.
   * → 'none' (ẩn: app / đã cài / không cài được kiểu nào) | 'prompt' | 'ios' | 'inapp'.
   */
  function kindOf(env) {
    if (env.native || env.tauri || env.standalone) return 'none';
    const ua = String(env.ua || '');
    if (IN_APP.test(ua)) return 'inapp';
    if (env.prompt) return 'prompt';
    // iPad đời mới báo là Mac: nhận ra qua màn hình cảm ứng (touchMac). Chrome / Firefox trên iPhone cũng dùng được "Thêm vào MH chính"
    if (IOS.test(ua) || env.touchMac) return 'ios';
    return 'none';
  }
  /** Link mở thẳng Chrome trên Android (intent://) – cho trình duyệt nhúng. */
  function intentUrl(href) {
    const u = new URL(href);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;end`;
  }
  if (typeof window === 'undefined') { module.exports = { kindOf, intentUrl, IN_APP }; return; } // kiểm thử trên Node

  const T = (k, a) => window.I18N.t(k, a);
  const $ = (id) => document.getElementById(id);
  const LS = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* riêng tư */ } },
  };
  let deferred = null, installed = false;

  function env() {
    const mm = (q) => { try { return matchMedia(q).matches; } catch (e) { return false; } };
    return {
      ua: navigator.userAgent,
      standalone: installed || mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)') || navigator.standalone === true,
      native: !!window.CaroNative,
      tauri: !!(window.__TAURI__ || window.__TAURI_INTERNALS__) || location.protocol === 'tauri:' || location.hostname === 'tauri.localhost',
      prompt: !!deferred,
      touchMac: /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1,
    };
  }
  const kind = () => kindOf(env());
  const toast = (m) => window.CaroOnline && window.CaroOnline.toast(m, 4000);

  async function copyLink() {
    const url = location.href.split('#')[0];
    try { await navigator.clipboard.writeText(url); toast(T('inst_copied')); } catch (e) { await window.CaroConfirm.prompt(T('inst_copy'), url, { max: 500 }); }
  }
  /** Bấm "Cài ứng dụng" (Cài đặt / thẻ Trang chủ). */
  async function act() {
    const k = kind();
    if (k === 'prompt') {
      const d = deferred;
      deferred = null; // mỗi sự kiện chỉ dùng được một lần
      try { await d.prompt(); const r = await d.userChoice; if (r && r.outcome === 'accepted') installed = true; } catch (e) { /* trình duyệt từ chối */ }
      render();
      return;
    }
    if (k === 'ios') return window.CaroConfirm.info(T('inst_ios'));
    if (k === 'inapp') {
      if (/Android/i.test(navigator.userAgent)) { location.href = intentUrl(location.href); return; }
      await window.CaroConfirm.info(T('inst_inapp'));
      return copyLink();
    }
  }

  // ------------------------------------------------------------ Hàng ở Cài đặt + thẻ Trang chủ
  function cardEl() {
    let c = $('install-card');
    if (c) return c;
    const home = document.querySelector('#page-home .pg-body');
    if (!home) return null;
    c = document.createElement('div');
    c.id = 'install-card';
    c.className = 'install-card';
    c.hidden = true;
    c.innerHTML = '<span class="ic-t"><b></b><small></small></span>'
      + '<button type="button" class="primary sm ic-go"></button><button type="button" class="ghost sm ic-x">✕</button>';
    c.querySelector('.ic-go').onclick = act;
    c.querySelector('.ic-x').onclick = () => { LS.set('caro.installCard', 'off'); render(); };
    const hero = $('home-hero');
    if (hero && hero.parentNode === home) hero.after(c); else home.prepend(c);
    return c;
  }
  function render() {
    const k = kind();
    const row = $('set-install');
    if (row) {
      row.hidden = k === 'none';
      const v = $('set-install-v');
      if (v) v.textContent = k === 'inapp' ? T('inst_inapp_title') : '';
    }
    const c = cardEl();
    if (!c) return;
    const visits = Number(LS.get('caro.visits')) || 0;
    c.hidden = k === 'none' || visits < 2 || LS.get('caro.installCard') === 'off';
    if (c.hidden) return;
    c.querySelector('b').textContent = T(k === 'inapp' ? 'inst_inapp_title' : 'inst_title');
    c.querySelector('small').textContent = k === 'ios' ? T('inst_ios') : k === 'inapp' ? T('inst_inapp') : T('inst_desc');
    const go = c.querySelector('.ic-go');
    go.hidden = k === 'ios'; // iPhone: chỉ có hướng dẫn, không có nút làm thay được
    go.textContent = T(k === 'inapp' ? (/Android/i.test(navigator.userAgent) ? 'inst_open' : 'inst_copy') : 'inst_btn');
    c.querySelector('.ic-x').setAttribute('aria-label', T('inst_close'));
  }

  // Đếm lần mở app (mỗi phiên một lần): thẻ Trang chủ chỉ hiện từ lần thứ 2 – lần đầu để người mới chơi đã
  try {
    if (!sessionStorage.getItem('caro.visited')) {
      sessionStorage.setItem('caro.visited', '1');
      LS.set('caro.visits', String((Number(LS.get('caro.visits')) || 0) + 1));
    }
  } catch (e) { /* riêng tư */ }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; render(); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; render(); toast(T('inst_done')); });
  window.addEventListener('langchange', render);
  window.addEventListener('caro:page', render);
  const row = $('set-install');
  if (row) row.onclick = act;
  render();

  window.CaroInstall = { kind, act, render };
})();
