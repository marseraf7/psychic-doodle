/*
 * Giải đấu – tab "Quản lý" của ban tổ chức trên trang giải (như MyLeague "Tuỳ chỉnh", Challonge "Settings / Log"):
 *  - Checklist: mô tả / điều lệ, đủ người, hạt giống & cặp vòng đầu, lịch, đã duyệt → mở giải.
 *  - Hạt giống & cặp đấu vòng 1 (thể thức có nhánh đấu, trước khi bắt đầu): đổi thứ tự bằng nút ↑ ↓ hoặc kéo thả,
 *    xáo ngẫu nhiên (bốc thăm), về theo Elo; xem trước cặp vòng 1 (hạt giống 1 gặp hạt giống cuối…).
 *  - Lịch theo vòng: giờ + địa điểm (hiện trên trang giải và biên bản).
 *  - Thông báo: đăng / xoá (gửi tới mọi người chơi). Nhật ký: ai làm gì, lúc nào.
 *  - Cài đặt: trước giờ đấu mở trang Cài đặt nâng cao để sửa; đang / đã đấu chỉ sửa tên và mô tả.
 *  - Tạm dừng / chơi tiếp, Đặt lại, Xoá giải (gõ đúng tên). Nháp: Gửi duyệt.
 * Phần cho mọi người xem: thông báo ghim, dòng "đang tạm dừng", giờ / địa điểm của từng vòng (K.newsHtml, K.slotOf).
 * Máy chủ: server/src/hub/tour-manage.js. Nạp sau tour.js, tour-stages.js, tour-form.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, when, icon, render, open } = K;
  // tab đang xem theo giải; hạt giống đang sửa (chưa lưu); typing: đang gõ dở trong tab Quản lý (giữ trang, không vẽ lại)
  const M = { tab: {}, order: null, orderFor: null, flash: 0, typing: false };

  const isManage = (t) => t.canManage && M.tab[t.id] === 'manage';
  const preStart = (t) => ['draft', 'pending', 'scheduled'].includes(t.status);
  const seedOrder = (size) => { let o = [1]; while (o.length < size) { const n = o.length * 2; o = o.flatMap((s) => [s, n + 1 - s]); } return o; };
  const pow2 = (n) => { let s = 2; while (s < n) s *= 2; return s; };

  // ------------------------------------------------------------ Cho mọi người: thông báo, tạm dừng, lịch
  K.newsHtml = (t) => {
    let html = '';
    if (t.status === 'draft' && t.canManage) html += `<div class="note">${esc(T('mg_draft_note'))} <button type="button" class="primary sm" data-act="mgSubmit">${esc(T('mg_submit'))}</button></div>`;
    if (t.held) html += `<p class="note">${icon('pause')}${esc(T('mg_held_note'))}</p>`;
    // Tắt "Hiện mục Thông báo" (tab Khác của trang nâng cao): chỉ ban tổ chức thấy
    if (t.showNews !== false || t.canManage) for (const n of (t.news || []).slice(0, 3)) html += `<div class="news">${icon('pin')}<div><p>${esc(n.text)}</p><small class="muted">${esc(n.by)} · ${esc(when(n.at))}</small></div></div>`;
    return html;
  };
  /** Nhãn vòng ban tổ chức đặt (vd. "Vòng loại") – thay tên vòng mặc định; "" nếu chưa đặt. */
  K.roundLabel = (t, stage, round) => { const s = t && t.schedule && t.schedule[stage + ':' + round]; return (s && s.label) || ''; };
  /** Giờ / địa điểm của một vòng ("0:2" = giai đoạn 1, vòng 3) – "15:00 · Phòng 2". */
  K.slotOf = (t, stage, round) => {
    const s = t && t.schedule && t.schedule[stage + ':' + round];
    return s ? [s.at ? when(s.at) : '', s.place || ''].filter(Boolean).join(' · ') : '';
  };

  // ------------------------------------------------------------ Tab Quản lý
  K.tourTabs = (t) => (t.canManage ? `<div class="seg tour-seg" role="tablist">${['view', 'manage'].map((k) => `<label><input type="radio" name="tourtab" data-act="tourTab" value="${k}" ${(M.tab[t.id] || 'view') === k ? 'checked' : ''}> <span>${esc(T('mg_tab_' + k))}</span></label>`).join('')}</div>` : '');
  K.isManageTab = isManage;

  function checklist(t) {
    const n = t.players.filter((p) => !p.withdrawn).length;
    const items = [
      [!!(t.desc && t.desc.trim()), 'mg_ck_desc', 'mgSettings'],
      [n >= 2, 'mg_ck_players', null],
      [t.format !== 'bracket' || !!t.seedPlan || t.seeding !== 'list' || t.offline, 'mg_ck_seeds', null],
      [Object.keys(t.schedule || {}).length > 0, 'mg_ck_schedule', null],
      [!['draft', 'pending'].includes(t.status), 'mg_ck_review', t.status === 'draft' ? 'mgSubmit' : null],
      [['running', 'finished'].includes(t.status), 'mg_ck_start', t.status === 'scheduled' ? 'start' : null],
    ];
    // Nút "Làm ngay" chỉ hiện khi người xem có quyền làm việc đó
    const allowed = (act) => act && K.can(t, act === 'mgSettings' ? 'config' : 'owner');
    return `<ol class="checklist">${items.map(([ok, k, act]) => `<li class="${ok ? 'ok' : ''}">${icon(ok ? 'check' : 'clock')}<span>${esc(T(k))}</span>${!ok && allowed(act) ? `<button type="button" class="ghost sm" data-act="${esc(act)}">${esc(T('mg_do'))}</button>` : ''}</li>`).join('')}</ol>`;
  }

  /** Thứ tự hạt giống đang sửa: bản đã lưu, không thì theo cách xếp của giải (Elo / danh sách). */
  function currentOrder(t) {
    const live = t.players.filter((p) => !p.withdrawn);
    if (M.orderFor === t.id && M.order) {
      const set = new Set(live.map((p) => p.uid));
      const kept = M.order.filter((u) => set.has(u));
      return [...kept, ...live.map((p) => p.uid).filter((u) => !kept.includes(u))];
    }
    // Như máy chủ khi bốc thăm: hạt giống xếp tay (bỏ người đã rút), không thì theo thứ tự đăng ký ('list') hoặc Elo
    const ids = new Set(live.map((p) => p.uid));
    const base = t.seedPlan && t.seedPlan.length ? t.seedPlan.filter((u) => ids.has(u))
      : (t.seeding === 'list' ? [...live].sort((a, b) => (a.joined || 0) - (b.joined || 0)) : [...live].sort((a, b) => b.rating - a.rating)).map((p) => p.uid);
    return [...base, ...live.map((p) => p.uid).filter((u) => !base.includes(u))];
  }

  function seedsHtml(t) {
    if (t.format !== 'bracket' || !preStart(t)) return '';
    const order = currentOrder(t);
    if (order.length < 2) return '';
    const name = (u) => (t.players.find((p) => p.uid === u) || {}).name || '?';
    const rows = order.map((u, i) => `<li draggable="true" data-uid="${esc(u)}" class="${M.flash ? 'flash' : ''}"><span class="seed">${i + 1}</span><b>${esc(name(u))}</b>
      <span class="row"><button type="button" class="ghost sm icon" data-act="seedMove" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="${esc(T('mg_up'))}">↑</button>
      <button type="button" class="ghost sm icon" data-act="seedMove" data-i="${i}" data-d="1" ${i < order.length - 1 ? '' : 'disabled'} aria-label="${esc(T('mg_down'))}">↓</button></span></li>`).join('');
    // Cặp vòng 1 của nhánh đấu: theo bảng hạt giống chuẩn (1 gặp cuối, 2 gặp áp chót…)
    const first = t.stages && t.stages[0];
    let pairs = '';
    if (first && (first.type === 'single' || first.type === 'double')) {
      const size = pow2(order.length), so = seedOrder(size);
      const cell = (s) => (s <= order.length ? `${s}. ${esc(name(order[s - 1]))}` : `<span class="muted">${esc(T('bye'))}</span>`);
      pairs = `<h5>${esc(T('mg_pairs'))}</h5><ul class="pairs">${Array.from({ length: size / 2 }, (_, i) => `<li>${cell(so[2 * i])} <span class="muted">vs</span> ${cell(so[2 * i + 1])}</li>`).join('')}</ul>`;
    }
    const dirty = !!(M.orderFor === t.id && M.order);
    const randomNote = t.seeding === 'random' && !t.seedPlan ? `<p class="hint">${esc(T('mg_random_note'))}</p>` : '';
    return `<section class="mg-sec"><h4>${esc(T('mg_seeds'))}</h4><p class="hint">${esc(T('mg_seeds_hint'))}</p>${randomNote}
      <ol class="seed-list" id="seed-list">${rows}</ol>
      <div class="row"><button type="button" class="ghost sm" data-act="seedShuffle">${icon('retry')}${esc(T('mg_shuffle'))}</button>
        ${t.offline ? '' : `<button type="button" class="ghost sm" data-act="seedRating">${esc(T('mg_by_rating'))}</button>`}
        ${t.seedPlan ? `<button type="button" class="ghost sm" data-act="seedAuto">${esc(T('mg_seed_auto'))}</button>` : ''}
        <button type="button" class="primary sm" data-act="seedSave" ${dirty ? '' : 'disabled'}>${esc(T('mg_save'))}</button></div>
      ${pairs}</section>`;
  }

  /** Số vòng của giai đoạn đầu (đã bốc thăm: theo nhánh đấu thật; chưa: theo ước tính). */
  function roundsOf(t) {
    const out = [];
    (t.stages || []).forEach((c, si) => {
      const v = (t.stageViews || [])[si];
      let n = v ? (v.rounds ? v.rounds.length : v.groups ? Math.max(...v.groups.map((g) => g.rounds.length)) : 0) : 0;
      if (!n && window.CaroTourEstimate && si === 0) n = window.CaroTourEstimate.stage(c, Math.max(2, t.count || 2), (t.stages || []).length === 1).waves;
      for (let r = 0; r < n; r++) out.push([si, r]);
    });
    return out.slice(0, 40);
  }
  const localInput = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  function scheduleHtml(t) {
    if (t.format !== 'bracket' || ['finished', 'cancelled'].includes(t.status)) return '';
    const rows = roundsOf(t).map(([s, r]) => {
      const cur = (t.schedule || {})[s + ':' + r] || {};
      return `<li class="sched-row" data-key="${s}:${r}"><b>${esc((t.stages.length > 1 ? T('stage_n', { n: s + 1 }) + ' · ' : '') + T('r_round', { n: r + 1 }))}</b>
        ${window.CaroDt.html('', cur.at ? localInput(cur.at) : '', { attrs: 'data-f="at"' })}
        <input data-f="place" maxlength="80" value="${esc(cur.place || '')}" placeholder="${esc(T('sheet_place'))}" aria-label="${esc(T('sheet_place'))}">
        <input data-f="label" maxlength="30" value="${esc(cur.label || '')}" placeholder="${esc(T('mg_round_label'))}" aria-label="${esc(T('mg_round_label'))}">
        <button type="button" class="ghost sm" data-act="schedSave">${esc(T('mg_save'))}</button></li>`;
    }).join('');
    return rows ? `<section class="mg-sec"><h4>${esc(T('mg_schedule'))}</h4><p class="hint">${esc(T('mg_schedule_hint'))}</p><ul class="sched">${rows}</ul></section>` : '';
  }

  function newsAdmin(t) {
    return `<section class="mg-sec"><h4>${esc(T('mg_news'))}</h4>
      <textarea id="news-text" rows="2" maxlength="1000" placeholder="${esc(T('mg_news_ph'))}"></textarea>
      <div class="row"><button type="button" class="primary sm" data-act="newsPost">${esc(T('mg_news_post'))}</button></div>
      ${(t.news || []).length ? `<ul class="people">${t.news.map((n) => `<li><div class="pn"><b>${esc(n.text)}</b><small>${esc(n.by)} · ${esc(when(n.at))}</small></div>
        <button type="button" class="ghost sm icon" data-act="newsDel" data-nid="${esc(n.id)}" aria-label="${esc(T('mg_delete'))}">${icon('trash')}</button></li>`).join('')}</ul>` : ''}</section>`;
  }

  /** Một dòng nhật ký: "boss · 15:02 · Nhập tỉ số An – Bình: 21-15 21-18". */
  function logLine(x) {
    const label = T('log_' + x.act, { name: x.name || '', n: x.n || '', a: x.a || '', b: x.b || '', s: x.s || '', w: x.w || '', key: x.key || '' });
    return `<li><small class="muted">${esc(when(x.at))}${x.by ? ' · ' + esc(x.by) : ''}</small> ${esc(label)}</li>`;
  }

  function settingsHtml(t) {
    const locked = ['running', 'finished', 'cancelled', 'rejected'].includes(t.status);
    const edit = locked
      ? `<form id="mg-name" class="tform"><p class="hint">${esc(T('mg_locked_hint'))}</p>
          <label class="field"><span>${esc(T('tour_name'))}</span><input name="name" maxlength="60" value="${esc(t.name)}" required></label>
          ${window.CaroRich ? `<div class="field"><span>${esc(T('tour_desc'))}</span>${window.CaroRich.editor('desc', t.desc || '', { rows: 5, max: 4000 })}</div>`
            : `<label class="field"><span>${esc(T('tour_desc'))}</span><textarea name="desc" maxlength="4000" rows="3">${esc(t.desc || '')}</textarea></label>`}
          <div class="row"><button class="primary sm">${esc(T('mg_save'))}</button></div></form>`
      : `<div class="row"><button type="button" class="ghost" data-act="mgSettings">${icon('sliders')}${esc(T('mg_edit_settings'))}</button></div>`;
    const danger = [];
    if (t.status === 'running') {
      danger.push(`<button type="button" class="ghost" data-act="mgHold" data-v="${t.held ? 0 : 1}">${icon(t.held ? 'play' : 'pause')}${esc(T(t.held ? 'mg_resume' : 'mg_hold'))}</button>`);
      if (K.can(t, 'owner')) danger.push(`<button type="button" class="ghost danger" data-act="mgReset">${icon('retry')}${esc(T('mg_reset'))}</button>`);
    }
    if (t.status !== 'running' && K.can(t, 'owner')) danger.push(`<button type="button" class="ghost danger" data-act="mgDelete">${icon('trash')}${esc(T('mg_delete_tour'))}</button>`);
    return `<section class="mg-sec"><h4>${esc(T('mg_settings'))}</h4>${edit}</section>
      ${danger.length ? `<section class="mg-sec danger-zone"><h4>${esc(T('mg_danger'))}</h4><div class="row">${danger.join('')}</div></section>` : ''}`;
  }

  // Đồng ban tổ chức (chỉ chủ giải): thêm theo tên đăng nhập, tick quyền (như MyLeague "Phân quyền")
  const PERMS = ['all', 'config', 'players', 'reg', 'results', 'disputes', 'news'];
  const permBoxes = (sel, uid) => `<span class="perm-list">${PERMS.map((p) => `<label class="check"><input type="checkbox" data-perm="${p}" ${uid ? `data-uid="${esc(uid)}"` : ''} ${sel.includes(p) ? 'checked' : ''}> <span>${esc(T('perm_' + p))}</span></label>`).join('')}</span>`;
  function staffHtml(t) {
    const rows = (t.staff || []).map((x) => `<li class="staff-row"><div class="pn"><b>${esc(x.name)}</b><small>@${esc(x.username)}</small></div>${permBoxes(x.perms, x.uid)}
      <button type="button" class="ghost sm icon" data-act="staffDel" data-uid="${esc(x.uid)}" aria-label="${esc(T('mg_delete'))}">${icon('trash')}</button></li>`).join('');
    return `<section class="mg-sec"><h4>${esc(T('mg_staff'))}</h4><p class="hint">${esc(T('mg_staff_hint'))}</p>
      ${rows ? `<ul class="people staff">${rows}</ul>` : ''}
      <div class="staff-add"><input id="staff-user" maxlength="40" placeholder="${esc(T('mg_staff_ph'))}" autocomplete="off">${permBoxes(['results'], '')}
      <button type="button" class="primary sm" data-act="staffAdd">${esc(T('mg_staff_add'))}</button></div></section>`;
  }

  // Mỗi khu chỉ hiện với người có quyền tương ứng (chủ giải thấy hết; đồng ban tổ chức theo quyền được giao)
  K.manageHtml = (t) => `<section class="mg-sec"><h4>${esc(T('mg_checklist'))}</h4>${checklist(t)}</section>
    ${K.can(t, 'players') ? seedsHtml(t) : ''}${K.can(t, 'config') ? scheduleHtml(t) : ''}${K.can(t, 'news') ? newsAdmin(t) : ''}
    ${K.can(t, 'config') ? settingsHtml(t) : ''}${K.can(t, 'owner') ? staffHtml(t) : ''}${K.embedHtml ? K.embedHtml(t) : ''}${K.cloneHtml && K.can(t, 'config') ? K.cloneHtml(t) : ''}
    <section class="mg-sec"><h4>${esc(T('mg_log'))}</h4>${(t.log || []).length ? `<ul class="mg-log">${t.log.map(logLine).join('')}</ul>` : `<p class="hint">${esc(T('mg_log_empty'))}</p>`}</section>`;

  // ------------------------------------------------------------ Thao tác
  const tour = () => D.tour;
  // Đổi tab: bỏ thứ tự hạt giống đang sửa mà chưa lưu
  K.acts.tourTab = (b) => { M.tab[tour().id] = b.value; M.order = null; M.typing = false; render(true); };
  /** Đang gõ dở trong tab Quản lý (thông báo / lịch / tên): tour.js không vẽ lại trang khi có cập nhật. */
  K.isEditing = () => M.typing && !!document.querySelector('#tour-body .mg-sec');
  K.acts.mgSubmit = () => O.send({ t: 'tourSubmit', id: tour().id });
  K.acts.mgSettings = () => { K.tourDraft.fromTour(tour()); open('tourAdv', null); };
  K.acts.mgHold = (b) => O.send({ t: 'tourHold', id: tour().id, hold: b.dataset.v === '1' });
  K.acts.mgReset = () => window.CaroConfirm.ask(T('mg_reset_confirm')).then((ok) => { if (ok) O.send({ t: 'tourReset', id: tour().id }); });
  K.acts.mgDelete = () => {
    const t = tour();
    const typed = prompt(T('mg_delete_prompt', { name: t.name }), '');
    if (typed == null) return;
    O.send({ t: 'tourDelete', id: t.id, confirm: typed.trim() });
  };
  const setOrder = (t, order) => { M.order = order; M.orderFor = t.id; render(true); };
  K.acts.seedMove = (b) => {
    const t = tour(), order = currentOrder(t), i = Number(b.dataset.i), j = i + Number(b.dataset.d);
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setOrder(t, order);
  };
  // Bốc thăm: xáo ngẫu nhiên (crypto) với hiệu ứng nháy
  K.acts.seedShuffle = () => {
    const t = tour(), order = currentOrder(t);
    for (let i = order.length - 1; i > 0; i--) {
      const r = new Uint32Array(1);
      crypto.getRandomValues(r);
      const j = r[0] % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    M.flash = 1;
    setOrder(t, order);
    setTimeout(() => { M.flash = 0; }, 600);
  };
  K.acts.seedRating = () => { const t = tour(); setOrder(t, [...t.players.filter((p) => !p.withdrawn)].sort((a, b) => b.rating - a.rating).map((p) => p.uid)); };
  K.acts.seedAuto = () => { M.order = null; O.send({ t: 'tourSeeds', id: tour().id, order: null }); };
  K.acts.seedSave = () => { const t = tour(); O.send({ t: 'tourSeeds', id: t.id, order: currentOrder(t) }); M.order = null; };
  K.acts.schedSave = (b) => {
    M.typing = false;
    const row = b.closest('.sched-row');
    const at = row.querySelector('[data-f="at"]').value;
    // Lịch chỉ để hiển thị: giữ đúng giờ ban tổ chức gõ (không bù lệch đồng hồ máy chủ như giờ bắt đầu giải)
    O.send({ t: 'tourSchedule', id: tour().id, key: row.dataset.key, at: at ? new Date(at).getTime() : null, place: row.querySelector('[data-f="place"]').value, label: row.querySelector('[data-f="label"]').value });
    O.toast(T('mg_saved'));
  };
  K.acts.newsPost = () => {
    M.typing = false;
    const box = $('news-text');
    if (!box || !box.value.trim()) return;
    O.send({ t: 'tourNews', id: tour().id, text: box.value });
    box.value = '';
  };
  K.acts.newsDel = (b) => O.send({ t: 'tourNewsDel', id: tour().id, news: b.dataset.nid });
  K.acts.staffAdd = () => {
    const box = $('staff-user');
    const perms = [...document.querySelectorAll('.staff-add [data-perm]')].filter((x) => x.checked).map((x) => x.dataset.perm);
    if (!box || !box.value.trim() || !perms.length) return;
    O.send({ t: 'tourStaff', id: tour().id, username: box.value.trim(), perms });
    box.value = '';
  };
  K.acts.staffDel = (b) => window.CaroConfirm.ask(T('mg_staff_del_confirm')).then((ok) => { if (ok) O.send({ t: 'tourStaffDel', id: tour().id, uid: b.dataset.uid }); });

  K.binders.push(() => {
    const f = $('mg-name');
    if (f) {
      f.onsubmit = (e) => {
        e.preventDefault();
        const t = tour();
        M.typing = false;
        O.send({ t: 'tourEdit', id: t.id, name: f.elements.name.value, desc: f.elements.desc.value });
      };
    }
    // Gõ trong các ô của tab Quản lý: đánh dấu đang sửa (giữ chữ khi có cập nhật từ máy chủ)
    const body = document.getElementById('tour-body');
    if (body && body.querySelector('.mg-sec')) {
      // Gõ chữ (không tính tick ô chọn) = đang sửa; bấm một nút của tab Quản lý = xong (cho phép vẽ lại khi có cập nhật)
      body.oninput = (e) => { if (e.target.closest('.mg-sec') && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') M.typing = true; };
      // Gắn một lần cho #tour-body (phần tử cố định – binder chạy lại mỗi lần vẽ)
      if (!body.dataset.mgClick) {
        body.dataset.mgClick = '1';
        body.addEventListener('click', (e) => { if (e.target.closest('.mg-sec button')) M.typing = false; });
      }
    }
    // Đổi quyền của một đồng ban tổ chức: gửi ngay danh sách quyền mới
    document.querySelectorAll('.staff-row [data-perm]').forEach((cb) => {
      cb.onchange = () => {
        const row = cb.closest('.staff-row');
        const perms = [...row.querySelectorAll('[data-perm]')].filter((x) => x.checked).map((x) => x.dataset.perm);
        const t = tour(), x = (t.staff || []).find((s) => s.uid === cb.dataset.uid);
        if (!x) return;
        if (perms.length) { O.send({ t: 'tourStaff', id: t.id, username: x.username, perms }); return; }
        // Bỏ hết quyền = gỡ khỏi ban tổ chức (hỏi lại); không đồng ý thì trả các ô về như cũ
        window.CaroConfirm.ask(T('mg_staff_del_confirm')).then((ok) => { if (ok) O.send({ t: 'tourStaffDel', id: t.id, uid: x.uid }); else render(true); });
      };
    });
    // Kéo thả hạt giống (máy tính)
    const list = $('seed-list');
    if (!list) return;
    let drag = null;
    list.addEventListener('dragstart', (e) => { const li = e.target.closest('li'); drag = li && li.dataset.uid; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
    list.addEventListener('dragover', (e) => { if (drag) e.preventDefault(); });
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const li = e.target.closest('li');
      if (!drag || !li || li.dataset.uid === drag) return;
      const t = tour(), order = currentOrder(t);
      order.splice(order.indexOf(drag), 1);
      order.splice(order.indexOf(li.dataset.uid), 0, drag);
      drag = null;
      setOrder(t, order);
    });
  });
  O.on('tourDeleted', () => { O.toast(T('mg_deleted')); K.top('tours'); });
  // Nháp đã gửi duyệt (không dùng tourCreated – sẽ xoá nháp tạo giải đang soạn trong máy)
  O.on('tourSubmitted', (m) => { O.toast(T(m.status === 'pending' ? 'tour_sent_review' : 'tour_created')); });
})();
