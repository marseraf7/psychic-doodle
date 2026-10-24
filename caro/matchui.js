/*
 * Trang Cài đặt "Giao diện ván đấu" (Issue #128, hạng mục 3): xem trước giao diện ván đấu
 * như khi thi đấu thật và tùy chỉnh trực tiếp trong khung xem trước.
 *   - Thanh công cụ: kéo thả trong khung (snap 4 vị trí như CaroBarPos) hoặc bấm nút chọn
 *     sẵn; vị trí lưu qua CaroBarPos (khóa caro.barpos) nên áp dụng ngay cho ván thật.
 *   - Nút Xin đi lại: kéo thả tự do trong khung; vị trí lưu dạng tỉ lệ khung (khóa
 *     caro.tbpos, cùng định dạng gamex.js đọc) nên áp dụng ngay cho ván thật.
 *   - "Về mặc định": xóa vị trí nút đã lưu, thanh công cụ về ngang dưới.
 * Khung xem trước là mô hình thu nhỏ của màn hình nên tỉ lệ vị trí giữ nguyên khi ra ván thật.
 *
 *   window.CaroMatchUI = { sync() }
 */
(function () {
  'use strict';
  const TB_KEY = 'caro.tbpos';
  const DRAG_MIN = 8;
  const $ = (id) => document.getElementById(id);

  function tbSaved() {
    try {
      const v = JSON.parse(localStorage.getItem(TB_KEY) || 'null');
      if (v && typeof v.fx === 'number' && typeof v.fy === 'number') return v;
    } catch (e) { /* dữ liệu hỏng */ }
    return null;
  }
  function tbSave(pos) {
    try { localStorage.setItem(TB_KEY, JSON.stringify(pos)); } catch (e) { /* chế độ riêng tư */ }
  }

  /** Đặt lại trạng thái xem trước theo giá trị đã lưu (gọi mỗi khi mở trang con). */
  function sync() {
    const bar = $('mu-bar'), tb = $('mu-tb'), prev = $('mu-preview');
    if (!bar || !tb || !prev) return;
    const saved = window.CaroBarPos ? window.CaroBarPos.saved() : 'bottom';
    bar.dataset.pos = saved;
    bar.style.left = ''; bar.style.top = ''; bar.style.transform = ''; bar.style.bottom = '';
    document.querySelectorAll('[data-mu-pos]').forEach((b) => b.classList.toggle('sel', b.dataset.muPos === saved));
    const pos = tbSaved();
    if (pos) {
      const r = prev.getBoundingClientRect();
      tb.style.left = Math.max(0, Math.min(r.width - tb.offsetWidth, pos.fx * r.width)) + 'px';
      tb.style.top = Math.max(0, Math.min(r.height - tb.offsetHeight, pos.fy * r.height)) + 'px';
      tb.style.transform = 'none';
      tb.style.bottom = 'auto';
    } else {
      tb.style.left = ''; tb.style.top = ''; tb.style.transform = ''; tb.style.bottom = '';
    }
  }

  /** Kéo thả chung trong khung xem trước; onDrop(fx, fy) nhận tỉ lệ vị trí thả. */
  function dragInPreview(el, onDrop) {
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      const prev = $('mu-preview');
      if (!prev) return;
      const pr = prev.getBoundingClientRect(), r = el.getBoundingClientRect();
      drag = { x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false, pr };
    });
    const onMove = (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_MIN) return;
      if (!drag.moved) {
        drag.moved = true;
        el.classList.add('dragging');
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* không hỗ trợ */ }
      }
      const left = e.clientX - drag.pr.left - drag.dx, top = e.clientY - drag.pr.top - drag.dy;
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.transform = 'none';
      el.style.bottom = 'auto';
    };
    const onUp = (e) => {
      if (!drag) return;
      const wasDrag = drag.moved, pr = drag.pr;
      drag = null;
      if (!wasDrag) return;
      el.classList.remove('dragging');
      const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); el.removeEventListener('click', stop, true); };
      el.addEventListener('click', stop, true);
      onDrop(Math.max(0, Math.min(1, (e.clientX - pr.left) / pr.width)), Math.max(0, Math.min(1, (e.clientY - pr.top) / pr.height)));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function init() {
    document.querySelectorAll('[data-mu-pos]').forEach((b) => b.addEventListener('click', () => {
      if (window.CaroBarPos) window.CaroBarPos.setSaved(b.dataset.muPos);
      sync();
    }));
    const reset = $('mu-reset');
    if (reset) reset.addEventListener('click', () => {
      try { localStorage.removeItem(TB_KEY); } catch (e) { /* chế độ riêng tư */ }
      if (window.CaroBarPos) window.CaroBarPos.setSaved('bottom');
      sync();
    });
    const bar = $('mu-bar'), tb = $('mu-tb'), prev = $('mu-preview');
    if (bar && prev) dragInPreview(bar, (fx, fy) => {
      if (window.CaroBarPos && window.CaroBarPos.snap) {
        const pr = prev.getBoundingClientRect();
        window.CaroBarPos.setSaved(window.CaroBarPos.snap(fx * pr.width, fy * pr.height, pr.width, pr.height));
      }
      sync();
    });
    if (tb && prev) dragInPreview(tb, (fx, fy) => { tbSave({ fx, fy }); sync(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.CaroMatchUI = { sync };
})();
