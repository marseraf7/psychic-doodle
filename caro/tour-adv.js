/*
 * Giải đấu – trang "Cài đặt nâng cao" khi tạo giải (như trang tạo giải của Challonge): các nhóm cài đặt chia theo tab
 * (màn rộng: cột tab bên trái; điện thoại: dải tab cuộn ngang ở trên), thanh tóm tắt dính đáy trang
 * (chuỗi giai đoạn, số trận / lượt đấu / thời gian ước tính) với nút về form nhanh và nút Tạo giải.
 * Dùng chung bản nháp với form nhanh (tour-form.js, K.tourDraft) nên chuyển qua lại không mất dữ liệu.
 * Mở bằng nút "Cài đặt nâng cao" dưới ô Thể thức khi chọn Tuỳ chỉnh. Nạp sau tour-form.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K || !K.tourDraft) return;
  const { T, esc, $, me, setTitle, needLogin, back, open, icon } = K;
  const DR = K.tourDraft;
  const { F } = DR;

  // Các tab: tên, biểu tượng, các ô của bản nháp (thêm ô mới ở các đợt sau chỉ cần thêm vào đây)
  const TABS = [
    { id: 'basic', icon: 'info', keys: ['name', 'desc'] },
    { id: 'format', icon: 'trophy', keys: ['preset'], stages: true },
    { id: 'games', icon: 'clock', keys: ['time', 'opening', 'rule', 'rated', 'minutes'] },
    { id: 'reg', icon: 'users', keys: ['start', 'max', 'checkin', 'seeding'] },
    { id: 'access', icon: 'lock', keys: ['access'] },
  ];

  function pageTourAdv() {
    setTitle('tadv_title', null, 'sliders');
    if (!me()) return needLogin();
    if (!F.d) DR.begin(null);
    if (!TABS.some((x) => x.id === F.tab)) F.tab = 'basic';
    const nav = TABS.map((x) => `<button type="button" role="tab" class="ta-tab ${x.id === F.tab ? 'on' : ''}" data-tab="${x.id}" aria-selected="${x.id === F.tab}">${icon(x.icon)}<span>${esc(T('tadv_tab_' + x.id))}</span></button>`).join('');
    const panes = TABS.map((x) => `<section class="ta-pane" data-pane="${x.id}" role="tabpanel" ${x.id === F.tab ? '' : 'hidden'}>
      <h4>${esc(T('tadv_tab_' + x.id))}</h4><p class="hint">${esc(T('tadv_help_' + x.id))}</p>
      ${DR.fields(x.keys)}
      ${x.stages ? `<p class="hint" id="ta-fmt-hint"></p><div id="ta-stages" class="only-ko" hidden></div>` : ''}
    </section>`).join('');
    // novalidate: ô bắt buộc có thể nằm ở tab đang ẩn – tự kiểm và chuyển tới tab có lỗi
    return `<form id="ta" class="tform tadv" novalidate>
      <nav class="ta-tabs" role="tablist" aria-label="${esc(T('tadv_title'))}">${nav}</nav>
      <div class="ta-main">${panes}</div>
      <div class="ta-foot">
        <p class="est" id="ta-est" aria-live="polite"></p>
        <p class="err" id="ta-err"></p>
        <div class="row">
          <button type="button" class="ghost" data-act="tourQuick">${icon('back')}${esc(T('tadv_back_quick'))}</button>
          <button type="button" class="ghost sm" data-act="tourReset">${icon('retry')}${esc(T('draft_reset'))}</button>
          <button class="primary">${esc(T('tour_submit'))}</button>
        </div>
      </div>
    </form>`;
  }

  /** Chuyển tab (giữ nguyên các ô của tab khác – chỉ ẩn đi). */
  function showTab(form, id) {
    F.tab = id;
    form.querySelectorAll('.ta-tab').forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    form.querySelectorAll('.ta-pane').forEach((p) => { p.hidden = p.dataset.pane !== id; });
    const cur = form.querySelector(`.ta-tab[data-tab="${id}"]`);
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  K.pages.tourAdv = pageTourAdv;
  // Về form nhanh: lưu các ô đang sửa vào nháp rồi quay lại (nếu vừa từ form nhanh sang thì dùng nút Quay lại)
  K.acts.tourQuick = () => {
    DR.collect($('ta'));
    const prev = K.V.stack[K.V.stack.length - 1];
    if (prev && prev.page === 'tourNew') back();
    else open('tourNew', null);
  };
  K.binders.push(() => {
    const form = $('ta');
    if (!form) return;
    form.querySelector('.ta-tabs').onclick = (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) showTab(form, b.dataset.tab);
    };
    // Mũi tên trái / phải trên dải tab (như tablist chuẩn)
    form.querySelector('.ta-tabs').onkeydown = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const i = TABS.findIndex((x) => x.id === F.tab);
      const next = TABS[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? TABS.length - 1 : 1)) % TABS.length].id;
      e.preventDefault();
      showTab(form, next);
      form.querySelector(`.ta-tab[data-tab="${next}"]`).focus();
    };
    // Ô lỗi nằm ở tab đang ẩn (form novalidate): chuyển tới tab chứa ô đó
    DR.bindForm(form, { stages: 'ta-stages', hint: 'ta-fmt-hint', est: 'ta-est', err: 'ta-err' }, (key) => {
      const tab = TABS.find((x) => x.keys.includes(key));
      if (tab) showTab(form, tab.id);
      const el = form.elements[key];
      if (el && el.focus) el.focus();
    });
  });
})();
