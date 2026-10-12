/*
 * Bộ chọn thời gian ván đấu (như hộp "Thiết lập ván đấu" của Lichess), dùng chung cho Ván mới, Cài đặt, Tạo phòng, Thách đấu:
 *   3 thẻ: Không giới hạn · Mỗi nước · Đồng hồ
 *   Mỗi nước: thanh trượt số giây (5 … 120) + ô chọn nhanh
 *   Đồng hồ:  "Số phút mỗi bên [5] + [3] Giây cộng mỗi nước", hai thanh trượt cạnh nhau + ô chọn nhanh (1+0 … 30+20)
 * Giá trị nằm trong một ô ẩn <input type="hidden"> ('t0' | 't20' | 'c5+3' – caro/timectl.js); đổi giá trị thì ô ẩn
 * phát sự kiện 'change' (nổi lên form), nên form cũ đọc .value như với ô chọn trước đây.
 *
 * Trong HTML: <div class="tcp" data-tcp data-name="tc" data-id="room-tc" data-value="t0"></div> – tự dựng khi trang mở.
 * API: window.CaroTcPicker = { mount(el), set(el, value), get(el) }
 */
(function () {
  'use strict';
  const TC = window.CaroTimeCtl;
  const T = window.I18N.t;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const near = (list, v) => list.reduce((b, x, i) => (Math.abs(x - v) < Math.abs(list[b] - v) ? i : b), 0);
  const state = new WeakMap(); // el -> { mode, move, min, inc } (lưu cả mức của thẻ đang ẩn để chuyển thẻ không mất)

  function readValue(v) {
    const { timeLimit, clock } = TC.fromValue(v);
    const st = { mode: clock ? 'clock' : timeLimit ? 'move' : 'none', move: timeLimit || 20, min: 5, inc: 3 };
    if (clock) [st.min, st.inc] = clock.split('+').map(Number);
    return st;
  }
  const valueOf = (st) => (st.mode === 'clock' ? `c${st.min}+${st.inc}` : st.mode === 'move' ? `t${st.move}` : 't0');

  /** Dựng bộ chọn trong el (một lần). */
  function mount(el) {
    if (state.has(el)) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    if (el.dataset.name) input.name = el.dataset.name;
    if (el.dataset.id) input.id = el.dataset.id;
    el.classList.add('tcp');
    el.innerHTML = '';
    el.appendChild(input);
    const body = document.createElement('div');
    el.appendChild(body);
    state.set(el, readValue(el.dataset.value || 't0'));
    input.value = valueOf(state.get(el));
    // Đặt giá trị từ mã khác: input.value = 'c5+3' rồi phát 'input' (hoặc gọi set())
    input.addEventListener('tcp:set', () => { state.set(el, readValue(input.value)); render(el); });
    render(el);
  }

  function render(el) {
    const st = state.get(el);
    const body = el.lastElementChild;
    const tab = (m, key) => `<button type="button" role="tab" data-tcm="${m}" class="${st.mode === m ? 'on' : ''}" aria-selected="${st.mode === m}">${esc(T(key))}</button>`;
    let html = `<div class="tcp-tabs" role="tablist">${tab('none', 'time_off')}${tab('move', 'tc_move')}${tab('clock', 'tc_clock')}</div>`;
    if (st.mode === 'move') {
      html += `<div class="tcp-head"><span>${esc(T('tc_secs'))}</span><b class="tcp-num">${st.move}</b></div>
        <input type="range" class="tcp-range" data-k="move" min="0" max="${TC.PER_MOVE.length - 1}" value="${near(TC.PER_MOVE, st.move)}" aria-label="${esc(T('tc_secs'))}">
        <div class="tcp-chips">${TC.MOVE_PRESETS.map((n) => `<button type="button" data-chip="t${n}" class="${st.move === n ? 'on' : ''}">${esc(T('seconds', { n }))}</button>`).join('')}</div>`;
    } else if (st.mode === 'clock') {
      const cur = `${st.min}+${st.inc}`;
      html += `<div class="tcp-head"><b class="tcp-num">${st.min}</b><i>+</i><b class="tcp-num">${st.inc}</b></div>
        <div class="tcp-two">
          <label><span>${esc(T('tc_minutes'))}</span><input type="range" class="tcp-range" data-k="min" min="0" max="${TC.MINUTES.length - 1}" value="${near(TC.MINUTES, st.min)}"></label>
          <label><span>${esc(T('tc_inc'))}</span><input type="range" class="tcp-range" data-k="inc" min="0" max="${TC.INCS.length - 1}" value="${near(TC.INCS, st.inc)}"></label>
        </div>
        <div class="tcp-chips">${TC.CLOCK_PRESETS.map((c) => `<button type="button" data-chip="c${c}" class="${cur === c ? 'on' : ''}">${c}</button>`).join('')}</div>
        <p class="tcp-pool">${esc(T('pool_' + TC.poolOfClock(cur)))}</p>`;
    }
    body.innerHTML = html;
    body.querySelectorAll('.tcp-range').forEach(paintRange);
  }
  /** Phần thanh trượt bên trái nút kéo tô màu nhấn (như Lichess). */
  function paintRange(r) { r.style.setProperty('--p', (100 * r.value / (r.max || 1)) + '%'); }

  function commit(el, rerender) {
    const input = el.querySelector('input[type=hidden]');
    const v = valueOf(state.get(el));
    if (rerender) render(el);
    if (input.value === v) return;
    input.value = v;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('.tcp');
    if (!el || !state.has(el)) return;
    const st = state.get(el);
    const m = e.target.closest('[data-tcm]');
    if (m) { st.mode = m.dataset.tcm; commit(el, true); return; }
    const c = e.target.closest('[data-chip]');
    if (c) { Object.assign(st, readValue(c.dataset.chip)); commit(el, true); }
  });
  // Kéo thanh trượt: đổi số ngay, chỉ vẽ lại các ô chọn nhanh khi thả tay (giữ thanh đang kéo)
  document.addEventListener('input', (e) => {
    const r = e.target.closest('.tcp-range');
    if (!r) return;
    const el = r.closest('.tcp'), st = state.get(el);
    const list = { move: TC.PER_MOVE, min: TC.MINUTES, inc: TC.INCS }[r.dataset.k];
    st[r.dataset.k] = list[Number(r.value)];
    paintRange(r);
    const nums = el.querySelectorAll('.tcp-num');
    if (r.dataset.k === 'move') nums[0].textContent = st.move;
    else { nums[0].textContent = st.min; nums[1].textContent = st.inc; }
    commit(el, false);
  });
  document.addEventListener('change', (e) => {
    const r = e.target.closest && e.target.closest('.tcp-range');
    if (r) { e.stopPropagation(); render(r.closest('.tcp')); } // ô ẩn đã báo 'change' cho form rồi
  }, true);

  function set(el, value) {
    mount(el);
    state.set(el, readValue(value));
    el.querySelector('input[type=hidden]').value = valueOf(state.get(el));
    render(el);
  }
  const get = (el) => el.querySelector('input[type=hidden]').value;

  document.querySelectorAll('[data-tcp]').forEach(mount);
  window.addEventListener('langchange', () => document.querySelectorAll('.tcp').forEach((el) => state.has(el) && render(el)));

  window.CaroTcPicker = { mount, set, get };
})();
