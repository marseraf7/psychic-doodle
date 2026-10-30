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
    // slug: link riêng; desc: mô tả có định dạng (tour-adv-bracket.js); recur: giải định kỳ (tour-tpl.js)
    { id: 'basic', icon: 'info', keys: ['name', 'slug', 'desc', 'recur'] },
    { id: 'format', icon: 'trophy', keys: ['preset', 'teams'], stages: true }, // teams: Team Battle (club-battle.js)
    // Như Advanced options → Bracket của Challonge (tour-adv-bracket.js)
    { id: 'bracket', icon: 'fork', keys: ['roundLabels', 'hideSeeds', 'hideBracket', 'quickAdvance', 'attachments', 'shareImages', 'placeBy'] },
    { id: 'games', icon: 'clock', keys: ['scoreMode', 'time', 'opening', 'rule', 'rated', 'minutes', 'noshow'] },
    // Đăng ký nâng cao: tour-adv-reg.js ('limits' gồm 4 ô Elo / số ván / tuổi tài khoản)
    { id: 'reg', icon: 'users', keys: ['offline', 'start', 'closeAt', 'max', 'approval', 'waitlist', 'limits', 'code', 'questions', 'checkin', 'checkinMin', 'seeding'],
      alias: ['minRating', 'maxRating', 'minGames', 'minAccountDays'] },
    // Như Advanced options của Challonge: Quyền (tự báo tỉ số, chia sẻ quyền quản trị), Thông báo, Khác – tour-adv-more.js
    { id: 'access', icon: 'lock', keys: ['access', 'selfReport', 'admins'] },
    { id: 'notify', icon: 'bell', keys: ['notifyMatch', 'notifyResults'] },
    { id: 'misc', icon: 'sliders', keys: ['showNews', 'showStandings'] },
  ];

  function pageTourAdv() {
    setTitle(F.editId ? 'tadv_edit_title' : 'tadv_title', null, 'sliders');
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
        <div class="row">${F.editId
          ? `<button type="button" class="ghost" data-act="tourEditCancel">${icon('back')}${esc(T('tadv_back_tour'))}</button>
             <button class="primary">${esc(T('tadv_save_edit'))}</button>`
          : `<button type="button" class="ghost" data-act="tourQuick">${icon('back')}${esc(T('tadv_back_quick'))}</button>
             <button type="button" class="ghost sm" data-act="tourReset">${icon('retry')}${esc(T('draft_reset'))}</button>
             <button type="button" class="ghost" data-act="tourSaveDraft">${esc(T('tadv_save_draft'))}</button>
             ${K.tplSaveBtn ? K.tplSaveBtn() : ''}
             <button class="primary">${esc(T('tour_submit'))}</button>`}
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
  // Sửa cài đặt: bỏ, về trang giải
  K.acts.tourEditCancel = () => {
    const id = F.editId;
    F.editId = null;
    F.d = null;
    K.V.stack = [{ page: 'tours', id: null }];
    open('tour', id, false);
  };
  // Lưu nháp (chưa gửi duyệt): kiểm như khi tạo
  K.acts.tourSaveDraft = () => {
    const form = $('ta');
    DR.collect(form);
    const bad = DR.validate();
    if (bad) { $('ta-err').textContent = bad.msg; return; }
    DR.submit('ta-err', { draft: true });
  };
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
    DR.bindForm(form, { stages: 'ta-stages', hint: 'ta-fmt-hint', est: 'ta-est', err: 'ta-err', full: true }, (key) => {
      const tab = TABS.find((x) => x.keys.includes(key) || (x.alias || []).includes(key));
      if (tab) showTab(form, tab.id);
      DR.focusField(form.elements[key]);
    });
  });
})();
