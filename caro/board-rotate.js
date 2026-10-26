/*
 * Quay bàn cờ từng nấc 90° theo chiều kim đồng hồ (menu ☰ – bar-menu.js), như xoay màn hình điện thoại.
 * Quay ở tầng ánh xạ của board-view.js: toScreen / toWorld đi qua rot / unrot nên lưới, quân, đánh dấu và mọi cú
 * bấm, kéo, chụm, lăn chuột đều theo hướng đã quay; quân X / O và chữ vẫn đứng thẳng.
 * Hoạt ảnh: xoay chính khung canvas bằng CSS (GPU lo, không vẽ lại từng khung – mượt cả trên máy yếu, màn hình mật độ
 * cao); xoay xong mới đổi nấc và vẽ lại một lần, ngay trong khung hình bỏ hiệu ứng xoay nên không chớp.
 *
 *   window.CaroBoardRotate.create(canvas, requestDraw) → {
 *     quarter()  – số nấc bàn đang vẽ theo (0…3); target() – số nấc sẽ tới khi quay xong (để menu ghi góc ngay)
 *     turn()     – quay thêm 1 nấc (đang quay dở thì xong ngay nấc cũ rồi quay tiếp)
 *     settle()   – đang quay dở thì xong ngay (chạm bàn giữa chừng: bấm theo đúng hướng mới)
 *     rot(u, v)  – vectơ trên bàn → trên màn hình; unrot(a, b) – ngược lại
 *   }
 */
(function () {
  'use strict';
  const ROT_MS = 220;
  // Hệ số cos / sin của từng nấc (đúng số nguyên – lưới khớp điểm ảnh)
  const CS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function create(canvas, requestDraw) {
    let q = 0;
    let pending = null; // { timer } khi đang xoay khung canvas
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

    // Đổi nấc + bỏ hiệu ứng xoay cùng lúc: requestDraw vẽ ở requestAnimationFrame, chạy trước khi trình duyệt áp kiểu
    // mới và tô, nên khung hình kế tiếp đã là bàn vẽ theo nấc mới, không chớp
    function commit() {
      if (!pending) return;
      clearTimeout(pending.timer);
      pending = null;
      q = (q + 1) % 4;
      canvas.style.transition = '';
      canvas.style.transform = '';
      requestDraw();
    }
    function turn() {
      if (pending) { commit(); void getComputedStyle(canvas).transform; } // đang quay dở: xong nấc cũ, áp kiểu rồi quay tiếp
      if (reduce && reduce.matches) { q = (q + 1) % 4; requestDraw(); return; }
      pending = { timer: setTimeout(commit, ROT_MS + 40) }; // phòng khi transitionend không tới (tab ẩn…)
      canvas.style.transition = `transform ${ROT_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1)`;
      canvas.style.transform = 'rotate(90deg)';
    }
    canvas.addEventListener('transitionend', (e) => { if (e.target === canvas && e.propertyName === 'transform') commit(); });

    return {
      quarter: () => q,
      target: () => (q + (pending ? 1 : 0)) % 4,
      turn,
      settle: commit,
      rot: (u, v) => { const [c, s] = CS[q]; return [u * c - v * s, u * s + v * c]; },
      unrot: (a, b) => { const [c, s] = CS[q]; return [a * c + b * s, b * c - a * s]; },
    };
  }

  window.CaroBoardRotate = { create };
})();
