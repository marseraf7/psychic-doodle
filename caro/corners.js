/*
 * Bo tròn góc (như Lichess: Giao diện → Bo tròn): 0–20 px cho thẻ, ô, nút lớn, hộp thoại. Chạy trong <head> để trang
 * không nháy khi mở. Chưa chỉnh lần nào thì giữ dáng mặc định (không đặt data-corner). Chỉnh trong Cài đặt nhanh
 * (quick-settings.js) và Cài đặt → Giao diện (ô name="corner").
 *   CaroCorners = { get value, MIN, MAX, DEFAULT, set(px), onChange(fn) }
 */
(function () {
  'use strict';
  const KEY = 'caro.corner';
  const MIN = 0, MAX = 20, DEFAULT = 10;
  const fns = [];
  let v = null; // null = mặc định của từng phần tử
  try { const s = localStorage.getItem(KEY); if (s !== null && !isNaN(+s)) v = Math.max(MIN, Math.min(MAX, Math.round(+s))); } catch (e) { /* riêng tư */ }

  function apply() {
    const r = document.documentElement;
    if (v === null) { r.removeAttribute('data-corner'); r.style.removeProperty('--corner'); return; }
    r.setAttribute('data-corner', '');
    r.style.setProperty('--corner', v + 'px');
    const f = document.getElementById('settings-form');
    if (f && f.corner) f.corner.value = v;
  }
  function set(px) {
    const n = Math.max(MIN, Math.min(MAX, Math.round(+px)));
    if (isNaN(n) || n === v) return;
    v = n;
    try { localStorage.setItem(KEY, String(n)); } catch (e) { /* riêng tư */ }
    apply();
    for (const fn of fns) fn(v);
  }
  apply();
  // Ô trong trang Cài đặt (có sau khi trang dựng xong)
  document.addEventListener('DOMContentLoaded', () => {
    const f = document.getElementById('settings-form');
    if (!f || !f.corner) return;
    f.corner.value = v === null ? DEFAULT : v;
    f.corner.addEventListener('input', () => set(f.corner.value));
  });

  window.CaroCorners = { get value() { return v === null ? DEFAULT : v; }, MIN, MAX, DEFAULT, set, onChange: (fn) => fns.push(fn) };
})();
