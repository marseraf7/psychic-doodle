/*
 * Vị trí thanh công cụ ván đấu (Issue #128, hạng mục 1).
 * Bốn vị trí: bottom (mặc định, ngang dưới), top (ngang trên), left (dọc trái), right (dọc phải).
 *
 * Hai cách đổi vị trí, theo quyết định của Minh:
 * - Kéo thả TRỰC TIẾP thanh: vị trí kéo chỉ có hiệu lực trong ván hiện tại. Hết ván
 *   (sự kiện caro:newgame / caro:board / caro:gameover) thì trở về vị trí đã lưu.
 * - Chọn trong trang Cài đặt (ô barPos, trang con Giao diện): lưu lâu dài cho các ván sau.
 *
 * Kéo: pointerdown lên thanh, di chuyển quá 8px thì thành kéo (cú click sau đó bị chặn để
 * không bấm nhầm nút); thả thì thanh snap về cạnh gần nhất. Kéo dùng Pointer Events nên
 * chuột và cảm ứng đều được. Vị trí top được đặt dưới thanh trên (.bar.top) đo thật lúc chạy.
 *
 *   window.CaroBarPos = { POSITIONS, saved(), setSaved(pos), effective(), apply(), snap(cx, cy, vw, vh) }
 */
(function () {
  'use strict';
  const POSITIONS = ['bottom', 'top', 'left', 'right'];
  const KEY = 'caro.barpos';
  const DRAG_MIN = 8;
  let temp = null;

  const valid = (p) => (POSITIONS.includes(p) ? p : 'bottom');

  function saved() {
    try { return valid(localStorage.getItem(KEY)); } catch (e) { return 'bottom'; }
  }
  function setSaved(pos) {
    pos = valid(pos);
    try { localStorage.setItem(KEY, pos); } catch (e) { /* chế độ riêng tư */ }
    temp = null;
    apply();
  }
  function effective() { return temp || saved(); }

  function bars() {
    try { return [...document.querySelectorAll('nav.bar.bottom')]; } catch (e) { return []; }
  }

  /** Cạnh gần nhất với điểm (cx, cy) trong khung (vw, vh); hòa thì ưu tiên trái (xác định). */
  function snap(cx, cy, vw, vh) {
    const d = { left: cx, right: vw - cx, top: cy, bottom: vh - cy };
    let best = 'left';
    for (const p of ['right', 'top', 'bottom']) if (d[p] < d[best]) best = p;
    return best;
  }

  /** Đặt lại vị trí top cho vừa dưới thanh trên (đo thật, vì chiều cao thanh trên thay đổi). */
  function topOffset() {
    try {
      const top = document.querySelector('.bar.top');
      if (!top) return 72;
      return Math.round(top.getBoundingClientRect().bottom) + 8;
    } catch (e) { return 72; }
  }

  function apply() {
    const pos = effective();
    for (const bar of bars()) {
      bar.dataset.pos = pos;
      if (pos === 'top') bar.style.top = topOffset() + 'px';
      else bar.style.top = '';
    }
  }

  function clearTemp() { if (temp !== null) { temp = null; apply(); } }

  function attach(bar) {
    let drag = null;
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      const r = bar.getBoundingClientRect();
      drag = { x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    };
    const onMove = (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_MIN) return;
      if (!drag.moved) {
        drag.moved = true;
        bar.classList.add('dragging');
        try { bar.setPointerCapture(e.pointerId); } catch (err) { /* không hỗ trợ */ }
      }
      bar.style.left = (e.clientX - drag.dx) + 'px';
      bar.style.top = (e.clientY - drag.dy) + 'px';
      bar.style.transform = 'none';
      bar.style.bottom = 'auto';
      bar.style.right = 'auto';
    };
    const onUp = (e) => {
      if (!drag) return;
      const wasDrag = drag.moved;
      drag = null;
      bar.classList.remove('dragging');
      bar.style.left = ''; bar.style.top = ''; bar.style.transform = ''; bar.style.bottom = ''; bar.style.right = '';
      if (!wasDrag) return;
      // Chặn cú click ngay sau kéo để không bấm nhầm nút vừa kéo qua.
      const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); bar.removeEventListener('click', stop, true); };
      bar.addEventListener('click', stop, true);
      const vw = window.innerWidth || 0, vh = window.innerHeight || 0;
      temp = snap(e.clientX, e.clientY, vw, vh);
      apply();
    };
    bar.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function init() {
    for (const bar of bars()) attach(bar);
    for (const ev of ['caro:newgame', 'caro:board', 'caro:gameover']) window.addEventListener(ev, clearTemp);
    window.addEventListener('resize', () => { if (effective() === 'top') apply(); });
    apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.CaroBarPos = { POSITIONS, saved, setSaved, effective, apply, snap };
})();
