/*
 * Menu 3 gạch cuối thanh công cụ trong ván (Issue #128, hạng mục 7).
 * Một nút ☰ gắn cuối mỗi thanh công cụ trong ván (trừ thanh luyện tập #ext-bar do study-trainer.js
 * vẽ lại bằng innerHTML); bấm thì menu bật lên phía trên nút, bấm ngoài thì đóng.
 * - Lật bàn ngang / dọc: bật tắt, có dấu ✓, lật ở tầng ánh xạ của board-view.js nên bấm vẫn đúng ô.
 * - Chế độ tập trung: vào focus-mode.js rồi đóng menu.
 * - Quân nháp X / O: bật tắt chế độ nháp (draft-mode.js); Xóa hết quân nháp: xóa lớp phủ nháp.
 * Các hàng bật tắt giữ menu mở để kết hợp (ví dụ lật cả ngang lẫn dọc = xoay 180°).
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  let menu = null;

  function row(act, key) {
    return `<button type="button" data-act="${act}"><span class="tick">✓</span><span>${esc(T(key))}</span></button>`;
  }
  function build() {
    menu = document.createElement('div');
    menu.id = 'bar-menu';
    menu.hidden = true;
    menu.innerHTML = row('flipH', 'menu_flip_h') + row('flipV', 'menu_flip_v')
      + `<button type="button" data-act="focus"><span>${esc(T('focus_mode'))}</span></button>`
      + row('draftX', 'menu_draft_x') + row('draftO', 'menu_draft_o')
      + `<button type="button" data-act="clearDrafts"><span>${esc(T('menu_draft_clear'))}</span></button>`;
    document.body.appendChild(menu);
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'flipH' || act === 'flipV') {
        const f = window.CaroApp.getFlip();
        window.CaroApp.setFlip(act === 'flipH' ? !f.h : f.h, act === 'flipV' ? !f.v : f.v);
        refresh();
        return;
      }
      if (act === 'focus') {
        if (window.CaroFocus) window.CaroFocus.enter();
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
    });
  }
  function refresh() {
    if (!menu) return;
    const f = window.CaroApp.getFlip();
    menu.querySelector('[data-act="flipH"]').classList.toggle('on', f.h);
    menu.querySelector('[data-act="flipV"]').classList.toggle('on', f.v);
    const cur = window.CaroDraft ? window.CaroDraft.current() : null;
    menu.querySelector('[data-act="draftX"]').classList.toggle('on', cur === 'X');
    menu.querySelector('[data-act="draftO"]').classList.toggle('on', cur === 'O');
    // Nhãn theo ngôn ngữ hiện tại (đổi ngôn ngữ giữa chừng thì menu mở lại vẫn đúng chữ).
    menu.querySelector('[data-act="flipH"] span:last-child').textContent = T('menu_flip_h');
    menu.querySelector('[data-act="flipV"] span:last-child').textContent = T('menu_flip_v');
    menu.querySelector('[data-act="focus"] span').textContent = T('focus_mode');
    menu.querySelector('[data-act="draftX"] span:last-child').textContent = T('menu_draft_x');
    menu.querySelector('[data-act="draftO"] span:last-child').textContent = T('menu_draft_o');
    menu.querySelector('[data-act="clearDrafts"] span').textContent = T('menu_draft_clear');
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
