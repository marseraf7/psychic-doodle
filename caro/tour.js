/*
 * Giải đấu & câu lạc bộ (dùng chung kết nối của online.js).
 * Một hộp thoại nhiều trang. File này là phần lõi: điều hướng, vẽ trang, danh sách giải, chi tiết giải
 * (thông tin, nút thao tác, người chơi, bảng xếp hạng Arena), tin từ máy chủ.
 * Các phần khác nạp sau và cắm vào window.CaroTourKit:
 *   tour-stages.js – vẽ các giai đoạn: nhánh đấu, nhánh thắng – thua, bảng vòng tròn, Thụy Sĩ
 *   tour-form.js   – form tạo giải nhanh: mẫu có sẵn + trình ghép giai đoạn, bản nháp chung
 *   tour-adv.js    – trang Cài đặt nâng cao khi tạo giải (các nhóm cài đặt theo tab)
 *   club.js        – câu lạc bộ: danh sách, trang CLB, tạo CLB, quản lý
 *   tour-admin.js  – trang Duyệt của quản trị viên (hàng chờ duyệt, số liệu máy chủ)
 *   tour-players.js – danh sách người chơi, bảng xếp hạng / ván gần đây của Arena
 * Link mở thẳng: ?t=<mã giải>, ?club=<mã CLB>.
 */
(function () {
  'use strict';
  const O = window.CaroOnline;
  if (!O) return;
  const T = window.I18N.t;
  const esc = window.CaroApp.esc;
  const $ = (id) => document.getElementById(id);
  const S = O.state;
  const secs = (n) => T('per_move', { n });

  const V = { page: 'tours', id: null, stack: [] }; // trang hiện tại và các trang trước (để quay lại)
  const D = { tours: null, tour: null, clubs: null, club: null, queue: null, skew: 0, adminCount: 0, open: {} };
  let ticker = 0;
  // Các phần khác (tour-stages.js, tour-form.js, club.js) cắm trang / thao tác của mình vào đây
  const K = window.CaroTourKit = { pages: {}, acts: {}, binders: [], enter: {} };

  // ------------------------------------------------------------ Tiện ích
  const locale = () => document.documentElement.lang || 'vi';
  const when = (ms) => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
  const serverNow = () => Date.now() + D.skew;
  function left(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    if (d) return T('cd_days', { d, h });
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }
  const me = () => S.me && !S.me.guest ? S.me : null;
  /**
   * Người xem có quyền ban tổ chức perm không ('owner' = chủ giải; bỏ trống = bất kỳ quyền nào). Đồng ban tổ chức chỉ
   * thấy nút / khu của việc được giao (máy chủ kiểm lại: tournaments.js canManageTour).
   */
  const can = (t, perm) => {
    const p = t && t.canManage ? t.perms || 'owner' : null;
    if (!p) return false;
    if (p === 'owner' || !perm) return true;
    return perm !== 'owner' && (p.includes('all') || p.includes(perm));
  };
  const logo = (name) => {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return `<span class="club-logo" style="background:hsl(${h} 55% 45%)">${esc((String(name).trim()[0] || '?').toUpperCase())}</span>`;
  };
  /** Biểu tượng SVG (index.html, #i-…) đặt cạnh chữ. */
  const icon = (name, cls = '') => `<svg class="ico i-in ${esc(cls)}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const fmtIcon = (f) => icon(f === 'arena' ? 'swords' : 'trophy');
  const CLOCK = '\u0001'; // chỗ đặt biểu tượng đồng hồ trong tourMeta (chuỗi chữ thường, thay khi chuyển sang HTML)
  /** tourMeta đã escape, kèm biểu tượng đồng hồ. */
  const metaHtml = (t) => esc(tourMeta(t)).replace(CLOCK, icon('clock'));
  function tourMeta(t) {
    const parts = [];
    if (t.format === 'arena') parts.push(T('fmt_arena'), T('minutes_n', { n: t.minutes }));
    else {
      const st = t.stages || [];
      parts.push(st.map(K.stageName).join(' → '));
      if (st.length === 1) parts.push('Bo' + st[0].bestOf);
    }
    if (!t.offline) parts.push(CLOCK + (t.clock ? window.I18N.tc(0, t.clock) : secs(t.timeLimit))); // giải offline: không có giờ mỗi nước
    if (t.opening === 'swap2') parts.push('Swap2');
    if (t.rule && t.rule !== 'vn') parts.push(T('grule_s_' + t.rule));
    if (t.offline) parts.push(T('tag_offline'));
    else if (!t.rated) parts.push(T('unrated_short'));
    parts.push(T('players_n', { n: t.count, max: t.maxPlayers }));
    return parts.join(' · ');
  }
  function statusTag(t) {
    const cls = { running: 'live', scheduled: 'soon', pending: 'wait', draft: 'wait', finished: 'done', cancelled: 'off', rejected: 'off' }[t.status];
    const label = t.status === 'scheduled' && t.checkin ? T('st_checkin') : T('tst_' + t.status);
    return `<span class="pill ${esc(cls)}">${esc(label)}</span>`;
  }
  const cd = (at, prefix) => `<span class="cd" data-at="${at}" data-prefix="${esc(prefix)}">${esc(T(prefix, { t: left(at - serverNow()) }))}</span>`;
  function timeLine(t) {
    if (t.status === 'running' && t.endsAt) return cd(t.endsAt, 'ends_in');
    if (t.status === 'scheduled' || t.status === 'pending') return `${esc(when(t.startsAt))} · ${cd(t.startsAt, 'starts_in')}`;
    return esc(when(t.startsAt));
  }

  // ------------------------------------------------------------ Điều hướng
  function open(page, id, push) {
    if (push !== false && (V.page !== page || V.id !== id)) V.stack.push({ page: V.page, id: V.id });
    if (V.page === 'tour' && page !== 'tour') O.send({ t: 'tourUnwatch' });
    if (V.page === 'club' && page !== 'club') O.send({ t: 'clubUnwatch' });
    V.page = page;
    V.id = id || null;
    if (K.enter[page]) K.enter[page]();
    if (!$('tour-dlg').open) O.openDlg('tour-dlg');
    load();
    render(true);
  }
  function top(page) {
    V.stack = [];
    open(page, null, false);
  }
  function back() {
    const prev = V.stack.pop();
    if (!prev) return false;
    open(prev.page, prev.id, false);
    return true;
  }
  /** Tải dữ liệu cho trang hiện tại. */
  function load() {
    if (!O.connected) return;
    if (V.page === 'tours') O.send({ t: 'tourList' });
    else if (V.page === 'tour') { D.tour = D.tour && D.tour.id === V.id ? D.tour : null; O.send({ t: 'tourGet', id: V.id }); }
    else if (V.page === 'clubs' || V.page === 'tourNew' || V.page === 'tourAdv') O.send({ t: 'clubList' });
    else if (V.page === 'club') { D.club = D.club && D.club.id === V.id ? D.club : null; O.send({ t: 'clubGet', id: V.id }); }
    else if (V.page === 'admin') { O.send({ t: 'adminQueue' }); O.send({ t: 'adminStats' }); }
  }

  const dlg = $('tour-dlg');
  dlg.onBack = back; // nút Back của Android: về trang trước trong hộp thoại
  dlg.addEventListener('close', () => {
    if (O.connected) { O.send({ t: 'tourUnwatch' }); O.send({ t: 'clubUnwatch' }); }
    clearInterval(ticker);
    ticker = 0;
  });
  $('tour-back').onclick = back;
  dlg.querySelectorAll('[data-ttab]').forEach((b) => { b.onclick = () => top(b.dataset.ttab); });

  // ------------------------------------------------------------ Vẽ
  /** Form tạo giải (nhanh / nâng cao) đang mở trên màn hình. */
  const formOpen = () => (V.page === 'tourNew' && !!$('tf')) || (V.page === 'tourAdv' && !!$('ta'))
    || (V.page === 'tour' && !!(K.isEditing && K.isEditing())); // đang gõ dở trong tab Quản lý (tour-manage.js)
  /** Vẽ lại trang. Form tạo giải đang mở thì chỉ vẽ lại khi bắt buộc (không mất chữ đang gõ). */
  function render(force) {
    if (!force && formOpen() && O.connected) return;
    const top3 = ['tours', 'clubs', 'admin'];
    $('tour-back').hidden = !V.stack.length;
    dlg.querySelectorAll('[data-ttab]').forEach((b) => b.classList.toggle('on', b.dataset.ttab === V.page || (b.dataset.ttab === 'tours' && /^tour/.test(V.page)) || (b.dataset.ttab === 'clubs' && /^club/.test(V.page))));
    const adminTab = dlg.querySelector('[data-ttab="admin"]');
    adminTab.hidden = !(me() && me().admin);
    adminTab.innerHTML = esc(T('review_tab')) + (D.adminCount ? ` <i class="count">${D.adminCount}</i>` : '');
    $('tour-tabs').hidden = !top3.includes(V.page);
    const body = $('tour-body');
    if (!O.connected) { body.innerHTML = `<p class="hint">${esc(T('lobby_offline'))}</p>`; setTitle('tours_title'); return; }
    body.innerHTML = K.pages[V.page]();
    bind(body);
    if (!ticker) ticker = setInterval(tick, 1000);
  }
  /** Tiêu đề hộp thoại; iconName: biểu tượng đặt trước (tuỳ chọn). */
  function setTitle(key, text, iconName) {
    $('tour-title').innerHTML = (iconName ? icon(iconName) : '') + esc(text != null ? text : T(key));
  }
  function tick() {
    document.querySelectorAll('#tour-body .cd').forEach((el) => {
      el.textContent = T(el.dataset.prefix, { t: left(Number(el.dataset.at) - serverNow()) });
    });
  }
  const needLogin = () => `<p class="hint">${esc(T('tour_login_hint'))}</p>`;

  // ---- Danh sách giải
  function pageTours() {
    setTitle('tours_title');
    const list = D.tours;
    let html = `<div class="row"><button type="button" class="primary" data-act="tourNew" ${me() ? '' : 'disabled'}>${icon('plus')}${esc(T('tour_create'))}</button></div>`;
    if (!me()) html += needLogin();
    if (!list) return html + `<p class="hint">…</p>`;
    const groups = [['running', 'tg_running'], ['scheduled', 'tg_scheduled'], ['pending', 'tg_pending'], ['draft', 'tg_draft'], ['done', 'tg_done']];
    for (const [st, key] of groups) {
      const items = list.filter((t) => (st === 'done' ? ['finished', 'cancelled', 'rejected'].includes(t.status) : t.status === st));
      if (!items.length) continue;
      html += `<h4>${esc(T(key))}</h4><ul class="tlist">${items.map(tourItem).join('')}</ul>`;
    }
    if (!list.length) html += `<p class="hint">${esc(T('tour_none'))}</p>`;
    return html;
  }
  function tourItem(t) {
    const tags = [statusTag(t)];
    if (t.joined) tags.push(`<span class="pill mine">${esc(T('tour_joined_tag'))}</span>`);
    if (t.club) tags.push(`<span class="pill club">${esc(t.club.name)}</span>`);
    return `<li><button type="button" class="titem" data-act="tour" data-id="${esc(t.id)}">
      <span class="ticon">${fmtIcon(t.format)}</span>
      <span class="pn"><b>${esc(t.name)}</b><small>${metaHtml(t)}</small><small>${timeLine(t)}${t.winner ? ' · ' + icon('medal', 'm1') + esc(t.winner) : ''}</small></span>
      <span class="tags">${tags.join('')}</span></button></li>`;
  }

  // ---- Chi tiết giải
  function pageTour() {
    const t = D.tour;
    if (!t) { setTitle('tours_title'); return `<p class="hint">…</p>`; }
    setTitle(null, t.name, t.format === 'arena' ? 'swords' : 'trophy');
    let html = `<div class="thead">${statusTag(t)} <span class="muted">${metaHtml(t)}</span></div>
      <p class="muted">${timeLine(t)}${t.club ? ` · <a href="#" data-act="club" data-id="${esc(t.club.id)}">${esc(t.club.name)}</a>` : ''} · ${esc(T('organizer', { name: t.creator }))}</p>`;
    if (t.desc) html += `<p class="tdesc">${esc(t.desc)}</p>`;
    if (t.status === 'pending') html += `<p class="note">${esc(T('tour_pending_note'))}</p>`;
    if (t.status === 'rejected') html += `<p class="note bad">${esc(T('tour_rejected_note'))}${t.reviewNote ? ': ' + esc(t.reviewNote) : ''}</p>`;
    if (t.status === 'cancelled') html += `<p class="note bad">${esc(T('tour_cancelled_note'))}${t.cancelReason ? ' – ' + esc(T('cancel_' + t.cancelReason)) : ''}</p>`;
    if (t.format === 'bracket' && t.noShowMin && (t.status === 'scheduled' || t.status === 'running')) html += `<p class="hint">${esc(T('noshow_info', { n: t.noShowMin }))}</p>`;
    if (t.format === 'bracket' && t.status === 'scheduled' && t.checkinEnabled) {
      html += `<p class="hint">${esc(T(t.checkin ? 'checkin_open_hint' : 'checkin_hint', { t: when(t.checkinAt) }))}</p>`;
    }
    html += `<div class="row tactions">${actions(t)}</div>`;
    if (K.newsHtml) html += K.newsHtml(t); // nháp / tạm dừng / thông báo ghim (tour-manage.js)
    // Ban tổ chức: tab Tổng quan / Quản lý (checklist, hạt giống, lịch, thông báo, nhật ký, cài đặt – tour-manage.js)
    if (K.tourTabs) html += K.tourTabs(t);
    if (K.isManageTab && K.isManageTab(t)) return html + K.manageHtml(t);
    if (K.regHtml) html += K.regHtml(t); // điều kiện đăng ký, form mã / câu hỏi, hàng chờ, duyệt + Bulk Add (tour-reg.js)
    if (K.scoreHtml) html += K.scoreHtml(t); // nhập tỉ số / xử thắng, in biên bản (tour-score.js)
    html += myCard(t);
    if (K.disputesHtml) html += K.disputesHtml(t); // ván mất kết nối (tour-disputes.js)
    if (t.podium && t.podium.length && t.status === 'finished') {
      html += `<div class="podium">${t.podium.map((p, i) => `<div class="pl p${i + 1}"><span>${icon('medal', 'm' + (i + 1))}</span><b>${esc(p.name)}</b></div>`).join('')}</div>`;
    }
    if (t.format === 'bracket') html += (K.statsHtml ? K.statsHtml(t) : '') + (K.groupsHtml ? K.groupsHtml(t) : '') + K.stagesHtml(t);
    html += t.format === 'arena' ? K.standings(t) : K.playerList(t); // tour-players.js
    if (t.format === 'arena' && t.games && t.games.length) html += K.recentGames(t);
    return html;
  }
  function actions(t) {
    const b = [];
    const mine = t.joined;
    if (t.canJoin) b.push(`<button type="button" class="primary" data-act="join">${esc(T('tour_join'))}</button>`);
    if (mine && t.status === 'scheduled' && t.checkin && t.me && !t.me.checkedIn) b.push(`<button type="button" class="primary" data-act="checkin">${icon('check')}${esc(T('tour_checkin'))}</button>`);
    if (mine && t.status === 'scheduled' && t.me && t.me.checkedIn && t.checkin) b.push(`<span class="pill mine">${icon('check')}${esc(T('checked_in'))}</span>`);
    if (mine && t.format === 'arena' && t.status === 'running') {
      b.push(`<button type="button" class="ghost" data-act="pause" data-v="${t.me && t.me.paused ? 0 : 1}">${esc(T(t.me && t.me.paused ? 'tour_resume' : 'tour_pause'))}</button>`);
    }
    if (mine && (t.status === 'scheduled' || t.status === 'running')) b.push(`<button type="button" class="ghost" data-act="leave">${esc(T('tour_withdraw'))}</button>`);
    if (t.status !== 'pending' && t.status !== 'rejected') b.push(`<button type="button" class="ghost" data-act="share">${icon('link')}${esc(T('share'))}</button>`);
    if (can(t, 'owner') && t.status === 'scheduled') b.push(`<button type="button" class="ghost" data-act="start">${icon('play')}${esc(T('tour_start_now'))}</button>`);
    if (can(t, 'owner') && ['draft', 'pending', 'scheduled', 'running'].includes(t.status)) b.push(`<button type="button" class="ghost danger" data-act="cancel">${esc(T('tour_cancel'))}</button>`);
    if (!me() && (t.status === 'scheduled' || t.status === 'running')) b.push(`<span class="hint">${esc(T('tour_login_hint'))}</span>`);
    return b.join('');
  }
  /** Thẻ "của tôi": đang đánh / chờ ghép / trận sắp tới. */
  function myCard(t) {
    if (!t.joined || t.status !== 'running' || !t.me) return '';
    const r = S.room;
    if (r && r.tour && r.tour.id === t.id && !r.winner) {
      return `<div class="mycard live"><b>${icon('swords')}${esc(T('tour_playing'))}</b><button type="button" class="primary sm" data-act="toGame">${esc(T('tour_to_game'))}</button></div>`;
    }
    if (t.format === 'arena') {
      return `<div class="mycard"><span class="spinner" aria-hidden="true"></span><b>${esc(T(t.me.paused ? 'tour_paused_note' : 'tour_waiting_pair'))}</b></div>`;
    }
    const m = t.myMatch;
    if (!m) return t.me.out ? `<div class="mycard"><b>${esc(T('tour_out'))}</b></div>` : '';
    const opp = [m.a, m.b].find((p) => p && p.uid && p.uid !== me().uid);
    return `<div class="mycard"><b>${esc(opp ? T('tour_next_vs', { name: opp.name }) : T('tour_next_wait'))}</b></div>`;
  }
  // ------------------------------------------------------------ Thao tác
  function shareLink(param, id) {
    const base = (window.CARO_SERVER || location.origin).replace(/\/+$/, '');
    const u = new URL(base + '/');
    u.searchParams.set(param, id);
    return u.toString();
  }
  async function share(url, title) {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) return navigator.share({ title, url }).catch(() => {});
    try { await navigator.clipboard.writeText(url); O.toast(T('copied')); } catch (e) { prompt(T('share'), url); }
  }
  function bind(body) {
    body.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      e.preventDefault();
      const a = b.dataset.act, t = D.tour;
      if (K.acts[a]) K.acts[a](b);
      else if (a === 'adminStats') O.send({ t: 'adminStats' });
      else if (a === 'tour') open('tour', b.dataset.id);
      else if (a === 'join') O.send({ t: 'tourJoin', id: t.id });
      else if (a === 'checkin') O.send({ t: 'tourCheckin', id: t.id });
      else if (a === 'pause') O.send({ t: 'tourPause', id: t.id, paused: b.dataset.v === '1' });
      else if (a === 'leave') { if (confirm(T(t.status === 'running' ? 'confirm_tour_withdraw_running' : 'confirm_tour_withdraw'))) O.send({ t: 'tourLeave', id: t.id }); }
      else if (a === 'start') { if (confirm(T('confirm_tour_start'))) O.send({ t: 'tourStart', id: t.id }); }
      else if (a === 'cancel') { if (confirm(T('confirm_tour_cancel'))) O.send({ t: 'tourCancel', id: t.id }); }
      else if (a === 'kick') { if (confirm(T('confirm_tour_kick', { name: b.dataset.name }))) O.send({ t: 'tourKick', id: t.id, uid: b.dataset.uid }); }
      else if (a === 'share') share(shareLink('t', t.id), t.name);
      else if (a === 'toGame') O.closeDlg('tour-dlg');
      else if (a === 'replay') { O.closeDlg('tour-dlg'); O.openReplay(b.dataset.share); }
      else if (a === 'review') {
        const approve = b.dataset.v === '1';
        const note = approve ? '' : prompt(T('reject_reason'), '');
        if (note === null) return;
        O.send({ t: 'adminReview', kind: b.dataset.kind, id: b.dataset.id, approve, note });
      }
    };
    body.querySelectorAll('details.fold').forEach((d) => {
      d.ontoggle = () => {
        D.open[d.dataset.k] = d.open;
        if (d.open && d.dataset.lazy) render(true); // khối chỉ dựng nội dung khi mở
      };
    });
    for (const f of K.binders) f(body);
    if (window.CaroDt) window.CaroDt.bind(body); // ô ngày giờ 29/10/2026 · 09:00 (dt-field.js)
  }

  // ------------------------------------------------------------ Tin từ máy chủ
  const isOpen = () => dlg.open;
  O.on('tourList', (m) => { D.tours = m.items; D.skew = m.now - Date.now(); if (isOpen() && V.page === 'tours') render(); });
  O.on('tour', (m) => {
    if (m.id !== V.id) return;
    // Bản cập nhật gồm phần chung (giống mọi người xem) + phần riêng của mình (mine)
    D.tour = m.tour && m.mine ? { ...m.tour, ...m.mine } : m.tour;
    if (m.tour) D.skew = m.tour.now - Date.now();
    if (!m.tour && isOpen() && V.page === 'tour') { O.toast(T('srv_tour_not_found')); back() || top('tours'); return; }
    if (isOpen() && V.page === 'tour') render();
  });
  // Bản vá (chỉ phần đổi) cho trang giải đang xem; thiếu dữ liệu thì tải lại cả trang
  O.on('tourPatch', (m) => {
    if (m.id !== V.id || !D.tour || D.tour.id !== m.id) return;
    if (!window.CaroTourPatch.apply(D.tour, m.patch)) { O.send({ t: 'tourGet', id: m.id }); return; }
    Object.assign(D.tour, m.mine);
    D.skew = D.tour.now - Date.now();
    if (isOpen() && V.page === 'tour') render();
  });
  O.on('tourCreated', (m) => {
    O.toast(T(m.status === 'pending' ? 'tour_sent_review' : 'tour_created'));
    V.stack = [{ page: 'tours', id: null }];
    open('tour', m.id, false);
  });
  O.on('adminQueue', (m) => { D.queue = m; D.adminCount = m.clubs.length + m.tours.length; updateBadge(); if (isOpen() && V.page === 'admin') render(); });
  O.on('adminStats', (m) => { D.stats = m.stats; if (isOpen() && V.page === 'admin') render(); });
  O.on('adminCount', (m) => { D.adminCount = m.n; updateBadge(); if (isOpen()) render(); });
  O.on('welcome', () => { if (isOpen()) { load(); render(); } updateBadge(); checkLink(); });
  O.on('close', () => { if (isOpen()) render(); });
  O.on('me', () => { if (isOpen()) render(); });
  // Ván mới của giải bắt đầu: đóng hộp thoại để vào bàn cờ ngay; còn lại thì cập nhật thẻ "của tôi"
  let lastRoom = null;
  O.on('room', (m) => {
    const r = m.room;
    const fresh = r && r.tour && !r.winner && r.code !== lastRoom;
    lastRoom = r ? r.code : null;
    if (fresh && isOpen()) O.closeDlg('tour-dlg');
    else if (isOpen() && V.page === 'tour') render();
  });

  function updateBadge() {
    const n = me() && me().admin ? D.adminCount : 0;
    // Nút Giải đấu ở Trang chủ (#tour-badge) và hàng Giải đấu ở Xem thêm (.tour-badge)
    document.querySelectorAll('#tour-badge, .tour-badge').forEach((el) => { el.hidden = !n; el.textContent = n; });
  }

  // ------------------------------------------------------------ Lối vào
  $('open-tours').onclick = () => top('tours');
  $('open-clubs').onclick = () => top('clubs');

  // Link ?t=<mã> / ?club=<mã>
  const params = new URLSearchParams(location.search);
  let pending = params.get('t') ? ['tour', params.get('t')] : params.get('club') ? ['club', params.get('club')] : null;
  function checkLink() {
    if (!pending) return;
    const [page, id] = pending;
    pending = null;
    const url = new URL(location.href);
    url.searchParams.delete('t');
    url.searchParams.delete('club');
    history.replaceState(null, '', url);
    V.stack = [{ page: page === 'tour' ? 'tours' : 'clubs', id: null }];
    V.page = page === 'tour' ? 'tours' : 'clubs';
    open(page, String(id).replace(/[^\w-]/g, '').slice(0, 20), false);
  }
  K.pages.tours = pageTours;
  K.pages.tour = pageTour;
  Object.assign(K, {
    O, T, esc, $, S, D, V, secs, me, can, when, logo, tourItem, setTitle, needLogin, isOpen, icon, fmtIcon, metaHtml,
    open, top, back, render, share, shareLink,
  });

  window.CaroTour = {
    /** Lỗi khi tạo giải / CLB hiện ngay trong form (online.js gọi). */
    errorTarget(ctx) {
      // Không mở được giải (không có / riêng tư / hết quyền): rời trang chờ "…", về trang trước hoặc danh sách giải
      // (chỉ khi trang đang chờ tải – giải khác đã mở xong thì không bị đẩy ra vì lỗi trễ của giải trước)
      if (ctx === 'tourGet' && isOpen() && V.page === 'tour' && (!D.tour || D.tour.id !== V.id)) {
        setTimeout(() => { if (V.page === 'tour' && (!D.tour || D.tour.id !== V.id)) back() || top('tours'); }, 0);
      }
      if (ctx === 'tourCreate' && $('tf-err') && isOpen()) return 'tf-err';
      if (ctx === 'tourCreate' && $('ta-err') && isOpen()) return 'ta-err';
      if (ctx === 'tourJoin' && $('rf-err') && isOpen()) return 'rf-err';
      if (ctx === 'tourScore' && $('sp-err') && isOpen()) return 'sp-err';
      if (ctx === 'clubCreate' && $('cf-err') && isOpen()) return 'cf-err';
      return null;
    },
    open: (id) => { V.stack = [{ page: 'tours', id: null }]; open('tour', id, false); },
    page: (p) => top(p), // mở thẳng một trang (vd. 'admin')
    get pendingLink() { return !!pending; },
  };
  window.addEventListener('langchange', () => { if (isOpen()) render(true); });
})();
