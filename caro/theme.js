/* Giao diện Sáng / Tối / Theo hệ thống. Chạy trong <head> để trang không bị nháy màu khi mở. */
(function () {
  'use strict';
  const KEY = 'caro.theme';
  const COLORS = { light: '#f6f3ec', dark: '#16191e' };
  const media = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const listeners = [];

  function get() {
    let v;
    try { v = localStorage.getItem(KEY); } catch (e) { /* riêng tư */ }
    return v === 'light' || v === 'dark' ? v : 'system';
  }

  /** Giao diện thực tế đang hiển thị: 'light' | 'dark'. */
  function effective(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    return media && media.matches ? 'dark' : 'light';
  }

  function apply(mode) {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    // Màu thanh trạng thái trên điện thoại
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', COLORS[mode === 'system' ? (m.media.includes('dark') ? 'dark' : 'light') : mode]);
    });
  }

  function set(mode) {
    if (!['light', 'dark', 'system'].includes(mode)) mode = 'system';
    try { localStorage.setItem(KEY, mode); } catch (e) { /* riêng tư */ }
    apply(mode);
    listeners.forEach((fn) => fn());
  }

  apply(get());
  if (media && media.addEventListener) media.addEventListener('change', () => { if (get() === 'system') listeners.forEach((fn) => fn()); });

  window.CaroTheme = { get, set, effective: () => effective(get()), onChange: (fn) => listeners.push(fn) };
})();
