/*
 * Trang chuyển ở tên miền CŨ (máy chủ trả khi đặt MOVED_TO – server/src/domain-move.js; trang này không phải app):
 *  1. Gỡ service worker + xoá bộ nhớ đệm của tên cũ (không để bản app cũ chạy tiếp từ bộ nhớ).
 *  2. Đọc các khoá caro.* trong localStorage – đăng nhập, khoá khách, cài đặt, tiến độ, ván lưu trên máy – theo thứ tự ưu
 *     tiên, tổng ≤ ~500 KB (ván lưu trên máy mới nhất trước; danh sách ván chỉ giữ ván đã gửi kèm).
 *  3. POST /api/migrate → mã dùng một lần (10 phút) → sang https://tên-mới/<cùng đường dẫn + tham số>&mig=<mã>
 *     (caro/migrate-in.js khôi phục ở tên mới). Lỗi / không có dữ liệu / quá 8 giây: vẫn sang tên mới, không kèm mã.
 * Dữ liệu ở tên cũ không bị xoá.
 */
(function () {
  'use strict';
  const to = document.documentElement.getAttribute('data-to') || '';
  if (!/^https?:\/\/[a-z0-9.:[\]-]+$/i.test(to)) return;
  const MAX = 500 * 1024; // byte (UTF-8) của cả gói – máy chủ nhận tối đa 512 KB
  const SKIP = ['caro.inRoom', 'caro.launchUrl', 'caro.heroE2E']; // trạng thái tạm của lần mở trước
  const FIRST = ['caro.token', 'caro.guestKey', 'caro.guestName', 'caro.lang', 'caro.ref', 'caro.progressOwner', 'caro.puzzles',
    'caro.storm', 'caro.learn', 'caro.ladder', 'caro.bots', 'caro.habits', 'caro.v1', 'caro.visits', 'caro.welcomed'];
  const LG = 'caro.lg.';
  let gone = false;

  function go(code) {
    if (gone) return;
    gone = true;
    const u = new URL(location.pathname + location.search + location.hash, to);
    u.searchParams.delete('mig');
    if (code) u.searchParams.set('mig', code);
    location.replace(u.href);
  }

  const bytes = (s) => (window.TextEncoder ? new TextEncoder().encode(s).length : s.length * 3);

  /** Các khoá caro.* theo thứ tự ưu tiên, gói không quá MAX byte. → { khoá: chuỗi } hoặc null. */
  function collect() {
    let ls;
    try { ls = window.localStorage; } catch (e) { return null; }
    const all = {};
    try {
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (/^caro\.[\w.-]{1,80}$/.test(k) && !SKIP.includes(k)) all[k] = ls.getItem(k);
      }
    } catch (e) { return null; }
    const out = {};
    let used = 20;
    const add = (k) => {
      const v = all[k];
      if (typeof v !== 'string' || k in out) return false;
      const n = bytes(JSON.stringify(k) + JSON.stringify(v)) + 2;
      if (used + n > MAX) return false;
      out[k] = v;
      used += n;
      return true;
    };
    for (const k of FIRST) add(k);
    const rest = Object.keys(all).filter((k) => !k.startsWith(LG)).sort();
    for (const k of rest) add(k);
    // Ván lưu trên máy (local-games.js): cài đặt, ván chờ, rồi từng ván mới nhất trước; danh sách chỉ giữ ván đã gửi
    add(LG + 'set');
    add(LG + 'pending');
    let index = null;
    try { index = JSON.parse(all[LG + 'index'] || 'null'); } catch (e) { index = null; }
    if (Array.isArray(index)) {
      used += bytes(all[LG + 'index']) + 40; // chỗ cho danh sách
      const kept = index.filter((g) => g && g.id && add(LG + 'g.' + g.id));
      out[LG + 'index'] = JSON.stringify(kept);
    }
    return Object.keys(out).length ? out : null;
  }

  /** Gỡ service worker + bộ nhớ đệm của tên cũ (tối đa 1,5 giây). */
  function cleanup() {
    const jobs = [];
    try { if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister())))); } catch (e) { /* không có */ }
    try { if (window.caches) jobs.push(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))); } catch (e) { /* không có */ }
    return Promise.race([Promise.all(jobs).catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  }

  setTimeout(() => go(''), 8000);
  cleanup().then(() => {
    const keys = collect();
    if (!keys) return go('');
    return fetch('/api/migrate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v: 1, keys }), credentials: 'omit', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => go(j && /^[A-Za-z0-9_-]{22}$/.test(j.code) ? j.code : ''), () => go(''));
  });
})();
