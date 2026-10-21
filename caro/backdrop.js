/*
 * Ảnh nền của các trang (img/backdrop.webp): bật / tắt trong Cài đặt › Giao diện (ô name="bg") và Cài đặt nhanh
 * (quick-settings.js). Mặc định tắt; lưu lựa chọn trên máy (localStorage). Bàn cờ không có ảnh nền (dễ nhìn quân).
 *   CaroBackdrop = { get on, set(on), onChange(fn) }
 */
(function () {
  'use strict';
  const KEY = 'caro.backdrop';
  const fns = [];
  let on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch (e) { /* riêng tư */ }

  function apply() {
    document.body.classList.toggle('bg-img', on);
    const f = document.getElementById('settings-form');
    if (f && f.bg) f.bg.checked = on;
  }
  function set(v) {
    v = !!v;
    if (v === on) return;
    on = v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* riêng tư */ }
    apply();
    for (const fn of fns) fn(on);
  }
  apply();
  // Ô trong trang Cài đặt
  const f = document.getElementById('settings-form');
  if (f) f.addEventListener('change', (e) => { if (e.target && e.target.name === 'bg') set(e.target.checked); });

  window.CaroBackdrop = { get on() { return on; }, set, onChange: (fn) => fns.push(fn) };
})();
