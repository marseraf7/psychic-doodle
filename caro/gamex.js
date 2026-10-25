/*
 * Thao tác phụ trong ván online (học ý tưởng từ Lichess), hiện thành thẻ nổi phía trên thanh dưới:
 *  - Đếm ngược đi nước đầu ở phòng gặp người lạ (quá hạn thì ván tự huỷ).
 *  - +15 giây cho đối thủ (ván có đồng hồ tổng), xin đi lại (phòng riêng / bạn bè), Berserk (giải Arena).
 *  - Lời xin đi lại của đối thủ: đồng ý / từ chối.
 *  - Bị cấm tìm trận vì bỏ ván nhiều: nhắc khi mở trò chơi.
 * Nút "Đầu hàng" tự thành "Huỷ ván" khi ván chưa quá 1 nước (online.js).
 */
(function () {
  'use strict';
  const O = window.CaroOnline;
  if (!O) return;
  const T = window.I18N.t;
  const esc = window.CaroApp.esc;
  const S = O.state;

  let firstAt = null; // hạn đi nước đầu theo đồng hồ máy mình
  let seenRoom = null;
  let ticker = 0;

  const me = () => S.me && S.me.id;
  const live = (r) => !!(r && S.me && r.players.length === 2 && !r.winner && !(r.kind === 'series' && r.seriesWinner));
  const opp = (r) => r.players.find((p) => p.id !== me());

  function canBerserk(r) {
    if (!live(r) || !r.tour || !r.tour.arena || !r.clock || r.phase || (r.berserk || []).includes(me())) return false;
    return r.seats.x === me() ? r.moves.length === 0 : r.moves.length < 2;
  }

  /** Gọi mỗi khi trạng thái phòng đổi (online.js → renderDraw). */
  function render() {
    const r = S.room;
    if (r !== seenRoom) {
      seenRoom = r;
      firstAt = live(r) && typeof r.firstMove === 'number' ? Date.now() + r.firstMove : null;
      clearInterval(ticker);
      if (firstAt) ticker = setInterval(() => { if (!firstAt || Date.now() > firstAt + 1000) clearInterval(ticker); O.renderInvites(); }, 1000);
    }
  }

  const btn = (act, label, cls = 'ghost') => `<button type="button" class="${esc(cls)} sm" data-gx="${act}">${esc(label)}</button>`;

  /* Nút "Xin đi lại" kéo thả (Issue #128, hạng mục 2): nút đứng riêng, không nằm trong thẻ
   * .gx-acts, kéo tự do bằng chuột hoặc cảm ứng, được phép đè lên bàn cờ. Vị trí kéo chỉ
   * lưu trong ván hiện tại (temp, dạng tỉ lệ khung nhìn để đổi kích thước vẫn đúng chỗ);
   * hết ván (không còn live) thì xóa, ván sau về chỗ mặc định. Muốn lưu lâu dài thì vào
   * tùy chỉnh "Giao diện ván đấu" trong Cài đặt (hạng mục 3, khóa localStorage 'caro.tbpos'). */
  const TB_KEY = 'caro.tbpos';
  const TB_DRAG_MIN = 8;
  let tbTemp = null; // { fx, fy } tỉ lệ so với khung nhìn, null = chưa kéo
  function tbSaved() {
    try {
      const v = JSON.parse(localStorage.getItem(TB_KEY) || 'null');
      if (v && typeof v.fx === 'number' && typeof v.fy === 'number') return v;
    } catch (e) { /* dữ liệu hỏng */ }
    return null;
  }
  function tbPos() { return tbTemp || tbSaved(); }
  function tbApply() {
    const el = document.querySelector('.tb-float');
    const pos = tbPos();
    if (!el || !pos) return;
    const vw = window.innerWidth || 0, vh = window.innerHeight || 0;
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(0, Math.min(vw - r.width, pos.fx * vw)) + 'px';
    el.style.top = Math.max(0, Math.min(vh - r.height, pos.fy * vh)) + 'px';
    el.style.transform = 'none';
    el.style.bottom = 'auto';
  }
  function tbDragInit() {
    let drag = null;
    document.addEventListener('pointerdown', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('.tb-float') : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      drag = { el, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    });
    const onMove = (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < TB_DRAG_MIN) return;
      if (!drag.moved) {
        drag.moved = true;
        drag.el.classList.add('dragging');
        try { drag.el.setPointerCapture(e.pointerId); } catch (err) { /* không hỗ trợ */ }
      }
      drag.el.style.left = (e.clientX - drag.dx) + 'px';
      drag.el.style.top = (e.clientY - drag.dy) + 'px';
      drag.el.style.transform = 'none';
      drag.el.style.bottom = 'auto';
    };
    const onUp = (e) => {
      if (!drag) return;
      const wasDrag = drag.moved;
      drag = null;
      if (!wasDrag) return;
      const vw = window.innerWidth || 0, vh = window.innerHeight || 0;
      if (vw > 0 && vh > 0) tbTemp = { fx: Math.max(0, Math.min(1, e.clientX / vw)), fy: Math.max(0, Math.min(1, e.clientY / vh)) };
      const el = document.querySelector('.tb-float');
      if (el) {
        el.classList.remove('dragging');
        // Chặn cú click ngay sau kéo để không gửi nhầm yêu cầu xin đi lại.
        const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); el.removeEventListener('click', stop, true); };
        el.addEventListener('click', stop, true);
        tbApply();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
  tbDragInit();

  /** Thẻ nổi (online.js chèn vào cùng chỗ với lời mời). */
  function floatHtml() {
    const r = S.room;
    if (!live(r)) { tbTemp = null; return ''; }
    let html = '';
    const o = opp(r);
    if (r.takebackOffer && r.takebackOffer !== me()) {
      html += `<div class="invite"><div><b>↶ ${esc(T('takeback_ask', { name: o ? o.name : T('opponent') }))}</b></div>
        ${btn('tb-no', T('decline'))}${btn('tb-yes', T('accept'), 'primary')}</div>`;
    }
    if (firstAt && r.moves.length < 2) {
      const n = Math.max(0, Math.ceil((firstAt - Date.now()) / 1000));
      const mine = r.actor === me();
      html += `<div class="invite gx-first${mine ? ' hot' : ''}"><div><b>⏱ ${esc(T(mine ? 'first_move_you' : 'first_move_opp', { n }))}</b>
        <small>${esc(T('first_move_d'))}</small></div></div>`;
    }
    const acts = [];
    if (r.clock && !r.tour) acts.push(btn('more', T('moretime_btn')));
    if (canBerserk(r)) acts.push(btn('berserk', T('berserk_btn'), 'primary'));
    if ((r.berserk || []).length) {
      const names = r.players.filter((p) => r.berserk.includes(p.id)).map((p) => p.name).join(', ');
      acts.unshift(`<small class="gx-berserk">⚡ ${esc(T('berserk_on', { names }))}</small>`);
    }
    if (acts.length) html += `<div class="invite gx-acts">${acts.join('')}</div>`;
    // Nút Xin đi lại đứng riêng để kéo thả độc lập (không nằm trong thẻ .gx-acts).
    // Trạng thái đã gửi dùng aria-disabled thay cho disabled để vẫn nhận pointerdown kéo thả.
    if (r.takeback && r.moves.length && !r.phase) {
      html += r.takebackOffer === me()
        ? `<button type="button" class="ghost sm tb-float tb-sent" data-gx="tb" aria-disabled="true">${esc(T('takeback_sent'))}</button>`
        : `<button type="button" class="ghost sm tb-float" data-gx="tb">${esc(T('takeback_btn'))}</button>`;
      // Chèn xong (online.js gán innerHTML đồng bộ) mới đặt vị trí kéo đã lưu.
      if (typeof queueMicrotask === 'function') queueMicrotask(tbApply);
    }
    return html;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gx]');
    if (!b) return;
    const act = b.dataset.gx;
    if (act === 'more') O.send({ t: 'moretime' });
    else if (act === 'tb') { if (!b.classList.contains('tb-sent')) O.send({ t: 'takeback' }); }
    else if (act === 'tb-yes' || act === 'tb-no') O.send({ t: 'takebackAnswer', accept: act === 'tb-yes' });
    else if (act === 'berserk') window.CaroConfirm.ask(T('berserk_confirm')).then((ok) => { if (ok) O.send({ t: 'berserk' }); });
  });

  // Đang bị cấm tìm trận (bỏ ván nhiều): nhắc một lần khi kết nối
  let warned = false;
  O.on('welcome', (m) => {
    if (m.me && m.me.playban > 0 && !warned) {
      warned = true;
      O.toast(T('srv_playban', { n: Math.ceil(m.me.playban / 60000) }), 5000);
    }
  });

  window.CaroGameX = { render, floatHtml };
})();
