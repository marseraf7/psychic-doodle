/* Giao diện Sáng / Tối / Theo hệ thống. Chạy trong <head> để trang không bị nháy màu khi mở. */
(function () {
  'use strict';
  const KEY = 'caro.theme';
  const COLORS = { light: '#f6f3ec', dark: '#161512' };
  const media = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const listeners = [];
  let hostMode = null; // giao diện do Telegram / VK báo (host.js) – chỉ dùng khi người chơi chưa tự chọn, không lưu

  const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; /* riêng tư */ } };
  function get() {
    const v = saved();
    // Chưa chọn gì: theo nền tảng chứa game nếu có, không thì nền tối (như Lichess); 'system' = theo máy
    return v === 'light' || v === 'system' || v === 'dark' ? v : hostMode || 'dark';
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

  /** Nền tảng chứa game báo sáng / tối: áp dụng nếu người chơi chưa tự chọn (không lưu). → true nếu đã áp dụng. */
  function setHost(mode) {
    if ((mode !== 'light' && mode !== 'dark') || ['light', 'dark', 'system'].includes(saved())) return false;
    if (hostMode !== mode) { hostMode = mode; apply(mode); listeners.forEach((fn) => fn()); }
    return true;
  }

  window.CaroTheme = { get, set, setHost, effective: () => effective(get()), onChange: (fn) => listeners.push(fn) };
})();
