/*
 * Menu 3 gạch cuối thanh công cụ trong ván (Issue #128, hạng mục 7).
 * Một nút ☰ gắn cuối mỗi thanh công cụ trong ván (trừ thanh luyện tập #ext-bar do study-trainer.js
 * vẽ lại bằng innerHTML); bấm thì menu bật lên phía trên nút, bấm ngoài thì đóng.
 * - Mỗi mục bật tắt có công tắc bên trái (như Lichess) – trừ Xóa hết quân nháp và Cài đặt nhanh (hành động, không bật tắt).
 * - Quay bàn cờ (icon hình vuông 4 mũi tên): mỗi lần bấm quay thêm 90° theo chiều kim đồng hồ như xoay màn hình điện thoại
 *   (board-rotate.js); công tắc bật khi bàn đang quay khác 0°, bên phải ghi góc hiện tại. Bấm vẫn đúng ô.
 * - Chế độ tập trung: vào focus-mode.js rồi đóng menu.
 * - Quân nháp X / O: bật tắt chế độ nháp (draft-mode.js); Xóa hết quân nháp: xóa lớp phủ nháp.
 * - Cài đặt nhanh: mở bảng cài đặt nhanh (bàn, quân, âm thanh…) nổi ngay trong ván – topbar.js nghe 'caro:quickset'.
 * Các hàng bật tắt (trừ Chế độ tập trung – ẩn cả thanh công cụ) giữ menu mở.
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  let menu = null;
  const ico = (id) => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;

  // Hàng bật tắt: công tắc bên trái (như menu của Lichess) cho dễ thấy đang bật mục nào; icon (nếu có) đứng cạnh chữ
  function sw(act, key, icon) {
    return `<button type="button" role="switch" aria-checked="false" data-act="${act}"><span class="qs-sw"></span>${icon ? ico(icon) : ''}<span class="bm-t" data-k="${key}">${esc(T(key))}</span>${act === 'rotate' ? '<span class="bm-v"></span>' : ''}</button>`;
  }
  // Hàng hành động (không bật tắt): icon đứng ở chỗ công tắc để chữ các hàng thẳng cột
  function action(act, key, icon) {
    return `<button type="button" data-act="${act}"><span class="bm-ic">${ico(icon)}</span><span class="bm-t" data-k="${key}">${esc(T(key))}</span></button>`;
  }
  function build() {
    menu = document.createElement('div');
    menu.id = 'bar-menu';
    menu.hidden = true;
    menu.innerHTML = sw('rotate', 'menu_rotate', 'i-rotate') + sw('focus', 'focus_mode')
      + sw('draftX', 'menu_draft_x') + sw('draftO', 'menu_draft_o')
      + action('clearDrafts', 'menu_draft_clear', 'i-trash')
      + '<div class="bm-sep"></div>' + action('quickset', 'menu_quickset', 'i-sliders');
    document.body.appendChild(menu);
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'rotate') {
        window.CaroApp.rotateBoard(); // thêm 90°, menu vẫn mở để bấm tiếp
        refresh();
        return;
      }
      if (act === 'focus') {
        if (window.CaroFocus) window.CaroFocus.toggle();
        close();
        return;
      }
      if (act === 'draftX' || act === 'draftO') {
        const want = act === 'draftX' ? 'X' : 'O';
        if (window.CaroDraft) {
          if (window.CaroDraft.current() === want) window.CaroDraft.off();
          else window.CaroDraft.setStone(want);
        }
        refresh();
        return;
      }
      if (act === 'clearDrafts' && window.CaroDraft) window.CaroDraft.clear();
      if (act === 'quickset') {
        // Cài đặt nhanh ngay trong ván (như "dasher" của Lichess): topbar.js mở bảng nổi đúng chỗ menu vừa hiện
        const at = { right: menu.style.right, bottom: menu.style.bottom };
        close();
        window.dispatchEvent(new CustomEvent('caro:quickset', { detail: at }));
      }
    });
  }
  function setOn(act, on) {
    const b = menu.querySelector(`[data-act="${act}"]`);
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
    b.querySelector('.qs-sw').classList.toggle('on', on);
  }
  function refresh() {
    if (!menu) return;
    const deg = window.CaroApp.getRotation();
    setOn('rotate', deg !== 0);
    menu.querySelector('[data-act="rotate"] .bm-v').textContent = deg + '°';
    setOn('focus', !!(window.CaroFocus && window.CaroFocus.isOn()));
    const cur = window.CaroDraft ? window.CaroDraft.current() : null;
    setOn('draftX', cur === 'X');
    setOn('draftO', cur === 'O');
    // Nhãn theo ngôn ngữ hiện tại (đổi ngôn ngữ giữa chừng thì menu mở lại vẫn đúng chữ).
    menu.querySelectorAll('.bm-t').forEach((el) => { el.textContent = T(el.dataset.k); });
  }
  function open(btn) {
    if (!menu) build();
    refresh();
    menu.hidden = false;
    const r = btn.getBoundingClientRect();
    menu.style.right = (window.innerWidth - r.right) + 'px';
    menu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
  }
  function close() { if (menu) menu.hidden = true; }
  function isOpen() { return !!menu && !menu.hidden; }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.bar-menu-btn');
    if (btn) {
      if (isOpen()) close();
      else open(btn);
      return;
    }
    if (isOpen() && !menu.contains(e.target)) close();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
  window.addEventListener('caro:page', close);
})();
