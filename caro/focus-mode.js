/*
 * Chế độ tập trung (Issue #128, hạng mục 4; học ý tưởng từ Lichess zen mode, không chép mã).
 * Vào chế độ: chỉ để lại bàn cờ — ẩn thanh trên, thẻ người chơi, thanh công cụ, nút Về giữa,
 * thẻ nổi (lời mời, Xin đi lại…), bong bóng chat và toast. Thẻ kết quả (.banner) vẫn hiện
 * để hết ván người chơi thấy kết quả. Góc trên bên trái hiện logo trò chơi + nút
 * "CHẾ ĐỘ TẬP TRUNG"; thoát bằng phím Esc hoặc bấm chính nút đó. Chỉ có hiệu lực trong
 * phiên hiện tại, không lưu lại (vào chế độ là hành động chủ động mỗi ván).
 * Điểm vào từ menu 3 gạch (hạng mục 7); module này chỉ lo vào / ra / phím Esc.
 *
 *   window.CaroFocus = { enter(), exit(), toggle(), isOn() }
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function isOn() { return document.body.classList.contains('focus-mode'); }
  function enter() {
    document.body.classList.add('focus-mode');
    const el = $('focus-exit-btn');
    if (el) el.hidden = false;
  }
  function exit() {
    document.body.classList.remove('focus-mode');
    const el = $('focus-exit-btn');
    if (el) el.hidden = true;
  }
  function toggle() { if (isOn()) exit(); else enter(); }

  function init() {
    const btn = $('focus-exit-btn');
    if (btn) btn.addEventListener('click', exit);
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !isOn()) return;
      if (document.querySelector('dialog[open]')) return; // đang mở hộp thoại: Esc để hộp thoại xử lý trước
      exit();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.CaroFocus = { enter, exit, toggle, isOn };
})();
