/*
 * Ô nhập không cắt chữ gợi ý (chuẩn giao diện – docs/chuan-giao-dien.md, mục "Chữ không bị cắt"): sau mỗi lần vẽ,
 * ô nhập nào có placeholder dài hơn bề rộng ô (và hộp chọn có lựa chọn đang chọn dài hơn hộp) (do bề rộng cố định theo em / cột hẹp, chữ dài hơn ở tiếng Việt / Nga…) thì
 * được nới min-width vừa đủ chữ – đo bằng đúng font của ô. Bảng nhập nằm trong khung cuộn ngang (.tscroll) nên nới không vỡ
 * bố cục. Lỗi gốc: kiểm thử 12–13/11/2026 (L6 "Hạng" → "Hạ", N1 "Cộng / trừ điểm" → "Cộng / trừ đ").
 * window.CaroFit.fit(root) – tour.js gọi sau các binder của trang giải.
 */
(function () {
  'use strict';
  let cv = null;
  /** Bề rộng (px) của chữ theo font của phần tử. */
  function textWidth(el, text) {
    cv = cv || document.createElement('canvas').getContext('2d');
    const s = getComputedStyle(el);
    cv.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    return cv.measureText(text).width;
  }
  function fit(root) {
    if (!root || !root.querySelectorAll) return;
    for (const el of root.querySelectorAll('input[placeholder]:not([type=checkbox]):not([type=radio])')) {
      if (!el.placeholder || !el.offsetWidth) continue;
      const s = getComputedStyle(el);
      const pad = parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth);
      // Ô số: chừa chỗ cho nút tăng / giảm của trình duyệt
      const need = Math.ceil(textWidth(el, el.placeholder) + pad + (el.type === 'number' ? 20 : 4));
      if (need > el.offsetWidth) el.style.minWidth = need + 'px';
    }
    // Hộp chọn: lựa chọn đang chọn không bị cắt (L7, ô luật treo giò / phần nhúng trên điện thoại) – nới tới vừa chữ + mũi tên,
    // không quá bề rộng khung chứa (min(…, 100%)); khung flex-wrap tự xuống hàng
    for (const el of root.querySelectorAll('select')) {
      const opt = el.options[el.selectedIndex];
      if (!opt || !el.offsetWidth) continue;
      const s = getComputedStyle(el);
      const need = Math.ceil(textWidth(el, opt.text) + parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth) + 28);
      // Trần: bề rộng khối nội dung gần nhất (không theo % của nhãn flex – vòng tròn, vẫn cắt)
      const box = el.closest('.ot-tab, section, form, .pg-body, dialog') || document.body;
      const cap = box.clientWidth - 8;
      if (need > el.offsetWidth) el.style.minWidth = Math.min(need, cap) + 'px';
    }
  }
  // Đổi lựa chọn sang chữ dài hơn: đo lại hộp vừa đổi
  document.addEventListener('change', (e) => { if (e.target && e.target.tagName === 'SELECT' && e.target.parentElement) fit(e.target.parentElement); }, true);
  // Khối thu gọn vừa mở (ô nhập trước đó chưa có kích thước nên chưa đo được): đo lại phần vừa hiện
  document.addEventListener('toggle', (e) => { if (e.target && e.target.open) fit(e.target); }, true);
  window.CaroFit = { fit, textWidth };
})();
