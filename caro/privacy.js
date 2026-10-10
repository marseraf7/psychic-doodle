/* Trang chính sách quyền riêng tư (file riêng: CSP của máy chủ chặn script nội tuyến). */
'use strict';
// Bấm giữ chuột rồi kéo lên / xuống để cuộn (như vuốt trên điện thoại, như kéo bàn cờ trong game).
// Kéo ngang vẫn bôi đen chữ được; bấm vào link không bị ảnh hưởng.
(function () {
  let drag = null;
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('a, button, input, select, textarea')) return;
    drag = { x: e.clientX, y: e.clientY, top: scrollY, on: false };
  });
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!(e.buttons & 1)) { end(); return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.hypot(dx, dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy)) { drag = null; return; } // kéo ngang: để bôi đen chữ
      drag.on = true;
      document.documentElement.classList.add('dragging');
      getSelection().removeAllRanges();
    }
    scrollTo(0, drag.top - dy);
  });
  function end() { if (drag && drag.on) document.documentElement.classList.remove('dragging'); drag = null; }
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
})();

// Mỗi lần chỉ hiện một ngôn ngữ (không chạy được JS thì hiện cả 4, như trước).
// Chọn theo: link có #mục (vd. #delete-en từ cửa hàng ứng dụng) → ngôn ngữ đang dùng trong game → ngôn ngữ trình duyệt.
(function () {
  const secs = [...document.querySelectorAll('main > section[lang]')];
  const links = [...document.querySelectorAll('.langs a')];
  const byId = (id) => secs.find((s) => s.id === id);
  function fromHash() {
    let t = null;
    try { t = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) { /* # lạ */ }
    return t ? t.closest('section[lang]') : null;
  }
  function show(sec) {
    secs.forEach((s) => { s.hidden = s !== sec; });
    links.forEach((a) => a.setAttribute('aria-current', a.hash === '#' + sec.id ? 'true' : 'false'));
    document.documentElement.lang = sec.lang;
    document.title = sec.dataset.title;
    document.getElementById('back-label').textContent = sec.dataset.back;
    document.getElementById('brand-label').textContent = sec.dataset.brand;
    document.getElementById('foot-brand').textContent = sec.dataset.brand;
  }
  let saved = null;
  try { saved = localStorage.getItem('caro.lang'); } catch (e) { /* riêng tư */ }
  const start = fromHash() || byId(saved) || byId((navigator.language || '').slice(0, 2)) || secs[0];
  show(start);
  // Mở bằng link tới một mục (#delete…): cuộn tới mục đó sau khi ẩn các ngôn ngữ khác
  const target = location.hash && start.querySelector(location.hash.replace(/[^#\w-]/g, ''));
  if (target) target.scrollIntoView();
  links.forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    show(byId(a.hash.slice(1)));
    history.replaceState(null, '', a.hash);
    scrollTo(0, 0);
  }));
  addEventListener('hashchange', () => { const s = fromHash(); if (s) show(s); });
})();
