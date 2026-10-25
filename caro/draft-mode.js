/*
 * Quân nháp (Issue #128, hạng mục 7): đặt trước quân X / O để xem thế cờ, không phải nước thật.
 * - Bật từ menu 3 gạch (bar-menu.js): chọn X hoặc O, rồi bấm ô trống trên bàn cờ để đặt quân nháp;
 *   bấm lại quân nháp cùng loại thì gỡ. Dùng được cả lượt mình và lượt đối phương (không chặn nước thật:
 *   muốn đánh thật thì tắt chế độ nháp rồi đánh).
 * - Quân nháp chỉ là lớp phủ máy khách: không gửi máy chủ, không đổi trạng thái ván. Nước thật
 *   (placeRaw) hoặc đi lại (undo) hoặc ván mới làm quân nháp cũ hết hạn → tự xóa.
 * - Vẽ qua board-view.js (setDrafts): quân mờ viền chấm, X / O ứng với 2 màu quân thật.
 *
 *   window.CaroDraft = { active(), current(), setStone('X'|'O'), off(), place(x, y), clear(), onRealMove() }
 */
(function () {
  'use strict';
  const drafts = new Map(); // "x,y" -> 'X' | 'O'
  let stone = null; // loại quân nháp đang chọn (null = tắt)

  function active() { return stone !== null; }
  function current() { return stone; }
  function setStone(s) { stone = (s === 'O' ? 'O' : 'X'); sync(); }
  function off() { stone = null; sync(); }
  function place(x, y) {
    if (!stone) return;
    const k = x + ',' + y;
    if (drafts.get(k) === stone) drafts.delete(k);
    else drafts.set(k, stone);
    sync();
  }
  function clear() { if (drafts.size) { drafts.clear(); sync(); } }
  function onRealMove() { clear(); }
  function sync() {
    if (window.CaroApp && window.CaroApp.setDrafts) {
      // Đẩy quân dạng SỐ như nước thật (rules.js: X = 1, O = 2) vì board-view
      // vẽ qua CaroStyle.drawStone, trong đó p === 1 mới là X, còn lại là O.
      // Đẩy chuỗi 'X'/'O' sẽ khiến mọi quân nháp đều vẽ thành O (lỗi 25/10/2026:
      // chọn nháp X vẫn ra O).
      const C = window.Caro || { X: 1, O: 2 };
      window.CaroApp.setDrafts([...drafts.entries()].map(([k, p]) => {
        const [x, y] = k.split(',').map(Number);
        return [x, y, p === 'X' ? C.X : C.O];
      }));
    }
    // Nút ☰ sáng lên khi đang ở chế độ nháp để người chơi biết chạm bàn cờ sẽ đặt quân nháp.
    document.querySelectorAll('.bar-menu-btn').forEach((b) => b.classList.toggle('draft-on', active()));
  }

  window.addEventListener('caro:newgame', () => { clear(); });

  window.CaroDraft = { active, current, setStone, off, place, clear, onRealMove };
})();
