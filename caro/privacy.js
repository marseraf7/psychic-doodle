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
