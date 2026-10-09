/*
 * Giải đấu & câu lạc bộ (dùng chung kết nối của online.js).
 * Một hộp thoại nhiều trang. File này là phần lõi: điều hướng, vẽ trang, danh sách giải, chi tiết giải
 * (thông tin, nút thao tác, người chơi, bảng xếp hạng Arena), trang duyệt của quản trị viên, tin từ máy chủ.
 * Các phần khác nạp sau và cắm vào window.CaroTourKit:
 *   tour-stages.js – vẽ các giai đoạn: nhánh đấu, nhánh thắng – thua, bảng vòng tròn, Thụy Sĩ
 *   tour-form.js   – form tạo giải: mẫu có sẵn + trình ghép giai đoạn
 *   club.js        – câu lạc bộ: danh sách, trang CLB, tạo CLB, quản lý
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
  const logo = (name) => {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return `<span class="club-logo" style="background:hsl(${h} 55% 45%)">${esc((String(name).trim()[0] || '?').toUpperCase())}</span>`;
  };
  const fmtIcon = (f) => (f === 'arena' ? '⚔️' : '🏆');
  function tourMeta(t) {
    const parts = [];
    if (t.format === 'arena') parts.push(T('fmt_arena'), T('minutes_n', { n: t.minutes }));
    else {
      const st = t.stages || [];
      parts.push(st.map(K.stageName).join(' → '));
      if (st.length === 1) parts.push('Bo' + st[0].bestOf);
    }
    parts.push('⏱ ' + secs(t.timeLimit));
    if (!t.rated) parts.push(T('unrated_short'));
    parts.push(T('players_n', { n: t.count, max: t.maxPlayers }));
    return parts.join(' · ');
  }
  function statusTag(t) {
    const cls = { running: 'live', scheduled: 'soon', pending: 'wait', finished: 'done', cancelled: 'off', rejected: 'off' }[t.status];
    const label = t.status === 'scheduled' && t.checkin ? T('st_checkin') : T('tst_' + t.status);
    return `<span class="pill ${cls}">${esc(label)}</span>`;
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
    else if (V.page === 'clubs' || V.page === 'tourNew') O.send({ t: 'clubList' });
    else if (V.page === 'club') { D.club = D.club && D.club.id === V.id ? D.club : null; O.send({ t: 'clubGet', id: V.id }); }
    else if (V.page === 'admin') O.send({ t: 'adminQueue' });
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
  /** Vẽ lại trang. Form tạo giải đang mở thì chỉ vẽ lại khi bắt buộc (không mất chữ đang gõ). */
  function render(force) {
    if (!force && V.page === 'tourNew' && $('tf') && O.connected) return;
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
  function setTitle(key, text) { $('tour-title').textContent = text != null ? text : T(key); }
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
    let html = `<div class="row"><button type="button" class="primary" data-act="tourNew" ${me() ? '' : 'disabled'}>＋ ${esc(T('tour_create'))}</button></div>`;
    if (!me()) html += needLogin();
    if (!list) return html + `<p class="hint">…</p>`;
    const groups = [['running', 'tg_running'], ['scheduled', 'tg_scheduled'], ['pending', 'tg_pending'], ['done', 'tg_done']];
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
      <span class="pn"><b>${esc(t.name)}</b><small>${esc(tourMeta(t))}</small><small>${timeLine(t)}${t.winner ? ' · 🥇 ' + esc(t.winner) : ''}</small></span>
      <span class="tags">${tags.join('')}</span></button></li>`;
  }

  // ---- Chi tiết giải
  function pageTour() {
    const t = D.tour;
    if (!t) { setTitle('tours_title'); return `<p class="hint">…</p>`; }
    setTitle(null, `${fmtIcon(t.format)} ${t.name}`);
    let html = `<div class="thead">${statusTag(t)} <span class="muted">${esc(tourMeta(t))}</span></div>
      <p class="muted">${timeLine(t)}${t.club ? ` · <a href="#" data-act="club" data-id="${esc(t.club.id)}">${esc(t.club.name)}</a>` : ''} · ${esc(T('organizer', { name: t.creator }))}</p>`;
    if (t.desc) html += `<p class="tdesc">${esc(t.desc)}</p>`;
    if (t.status === 'pending') html += `<p class="note">${esc(T('tour_pending_note'))}</p>`;
    if (t.status === 'rejected') html += `<p class="note bad">${esc(T('tour_rejected_note'))}${t.reviewNote ? ': ' + esc(t.reviewNote) : ''}</p>`;
    if (t.status === 'cancelled') html += `<p class="note bad">${esc(T('tour_cancelled_note'))}${t.cancelReason ? ' – ' + esc(T('cancel_' + t.cancelReason)) : ''}</p>`;
    if (t.format === 'bracket' && t.status === 'scheduled' && t.checkinEnabled) {
      html += `<p class="hint">${esc(T(t.checkin ? 'checkin_open_hint' : 'checkin_hint', { t: when(t.checkinAt) }))}</p>`;
    }
    html += `<div class="row tactions">${actions(t)}</div>`;
    html += myCard(t);
    if (t.podium && t.podium.length && t.status === 'finished') {
      html += `<div class="podium">${t.podium.map((p, i) => `<div class="pl p${i + 1}"><span>${['🥇', '🥈', '🥉'][i]}</span><b>${esc(p.name)}</b></div>`).join('')}</div>`;
    }
    if (t.format === 'bracket') html += K.stagesHtml(t);
    html += t.format === 'arena' ? standings(t) : playerList(t);
    if (t.format === 'arena' && t.games && t.games.length) html += recentGames(t);
    return html;
  }
  function actions(t) {
    const b = [];
    const mine = t.joined;
    if (t.canJoin) b.push(`<button type="button" class="primary" data-act="join">${esc(T('tour_join'))}</button>`);
    if (mine && t.status === 'scheduled' && t.checkin && t.me && !t.me.checkedIn) b.push(`<button type="button" class="primary" data-act="checkin">✔ ${esc(T('tour_checkin'))}</button>`);
    if (mine && t.status === 'scheduled' && t.me && t.me.checkedIn && t.checkin) b.push(`<span class="pill mine">✔ ${esc(T('checked_in'))}</span>`);
    if (mine && t.format === 'arena' && t.status === 'running') {
      b.push(`<button type="button" class="ghost" data-act="pause" data-v="${t.me && t.me.paused ? 0 : 1}">${esc(T(t.me && t.me.paused ? 'tour_resume' : 'tour_pause'))}</button>`);
    }
    if (mine && (t.status === 'scheduled' || t.status === 'running')) b.push(`<button type="button" class="ghost" data-act="leave">${esc(T('tour_withdraw'))}</button>`);
    if (t.status !== 'pending' && t.status !== 'rejected') b.push(`<button type="button" class="ghost" data-act="share">🔗 ${esc(T('share'))}</button>`);
    if (t.canManage && t.status === 'scheduled') b.push(`<button type="button" class="ghost" data-act="start">▶ ${esc(T('tour_start_now'))}</button>`);
    if (t.canManage && ['pending', 'scheduled', 'running'].includes(t.status)) b.push(`<button type="button" class="ghost danger" data-act="cancel">${esc(T('tour_cancel'))}</button>`);
    if (!me() && (t.status === 'scheduled' || t.status === 'running')) b.push(`<span class="hint">${esc(T('tour_login_hint'))}</span>`);
    return b.join('');
  }
  /** Thẻ "của tôi": đang đánh / chờ ghép / trận sắp tới. */
  function myCard(t) {
    if (!t.joined || t.status !== 'running' || !t.me) return '';
    const r = S.room;
    if (r && r.tour && r.tour.id === t.id && !r.winner) {
      return `<div class="mycard live"><b>⚔ ${esc(T('tour_playing'))}</b><button type="button" class="primary sm" data-act="toGame">${esc(T('tour_to_game'))}</button></div>`;
    }
    if (t.format === 'arena') {
      return `<div class="mycard"><span class="spinner" aria-hidden="true"></span><b>${esc(T(t.me.paused ? 'tour_paused_note' : 'tour_waiting_pair'))}</b></div>`;
    }
    const m = t.myMatch;
    if (!m) return t.me.out ? `<div class="mycard"><b>${esc(T('tour_out'))}</b></div>` : '';
    const opp = [m.a, m.b].find((p) => p && p.uid && p.uid !== me().uid);
    return `<div class="mycard"><b>${esc(opp ? T('tour_next_vs', { name: opp.name }) : T('tour_next_wait'))}</b></div>`;
  }
  const dot = (p) => `<span class="st ${p.playing ? 'playing' : p.online ? 'online' : 'offline'}" title="${esc(T(p.playing ? 'st_playing' : p.online ? 'st_online' : 'st_offline'))}"></span>`;
  function kick(t, p) {
    return t.canManage && !p.withdrawn && (t.status === 'scheduled' || t.status === 'running') && p.uid !== (me() && me().uid)
      ? `<button type="button" class="ghost sm icon" data-act="kick" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}" title="${esc(T('tour_kick'))}">✕</button>` : '';
  }
  function standings(t) {
    if (!t.players.length) return `<p class="hint">${esc(T('tour_no_players'))}</p>`;
    return `<h4>${esc(T('standings'))}</h4><ol class="ranks tstand">${t.players.map((p, i) => `
      <li class="${me() && p.uid === me().uid ? 'me' : ''}"><span class="rank">${i + 1}</span>${dot(p)}
        <div class="pn"><b>${esc(p.name)}${p.fire ? ' 🔥' : ''}${p.paused ? ' ⏸' : ''}${p.withdrawn ? ' ✕' : ''}</b><small>${esc(T('wdl', { w: p.wins, d: p.draws, l: p.losses }))} · ${esc(String(p.rating))}</small></div>
        <span class="pts">${p.score}</span>${kick(t, p)}</li>`).join('')}</ol>
      <p class="hint">${esc(T('arena_rules'))}</p>`;
  }
  function playerList(t) {
    if (!t.players.length) return `<p class="hint">${esc(T('tour_no_players'))}</p>`;
    const OUT = { no_checkin: 'out_no_checkin', kicked: 'out_kicked', lost: 'out_lost', not_advanced: 'out_not_advanced' };
    const outLabel = (p) => (OUT[p.out] ? T(OUT[p.out]) : p.withdrawn ? T('out_withdrew') : '');
    return `<h4>${esc(T('players_title', { n: t.players.length }))}</h4><ul class="people">${t.players.map((p) => `
      <li>${dot(p)}<div class="pn"><b>${p.seed ? '#' + p.seed + ' ' : ''}${esc(p.name)}</b><small>${esc(String(p.rating))}${t.status === 'scheduled' && t.checkinEnabled ? ' · ' + esc(T(p.checkedIn ? 'checked_in' : 'not_checked_in')) : ''}${outLabel(p) ? ' · ' + esc(outLabel(p)) : ''}</small></div>${kick(t, p)}</li>`).join('')}</ul>`;
  }
  function recentGames(t) {
    return `<h4>${esc(T('recent_games'))}</h4><ul class="people tgames">${t.games.slice(0, 15).map((g) => {
      const x = g.x ? g.x.name : '?', o = g.o ? g.o.name : '?';
      const res = !g.w ? '½–½' : g.x && g.w === g.x.uid ? '1–0' : '0–1';
      return `<li><div class="pn"><b>${esc(x)} <span class="muted">${res}</span> ${esc(o)}</b><small>+${g.px} / +${g.po}</small></div>${g.share ? `<a href="#" data-act="replay" data-share="${esc(g.share)}">▶</a>` : ''}</li>`;
    }).join('')}</ul>`;
  }
  // ---- Duyệt (quản trị viên)
  function pageAdmin() {
    setTitle('review_title');
    const q = D.queue;
    if (!q) return `<p class="hint">…</p>`;
    if (!q.clubs.length && !q.tours.length) return `<p class="hint">${esc(T('review_empty'))}</p>`;
    const item = (kind, x, body) => `<li class="rv"><div class="pn"><b>${esc(x.name)}</b><small>${esc(T('by_user', { name: x.owner.name, u: x.owner.username }))} · ${esc(when(x.created))}</small>${body}${x.desc ? `<p class="tdesc">${esc(x.desc)}</p>` : ''}</div>
      <div class="row"><button type="button" class="ghost sm danger" data-act="review" data-kind="${kind}" data-id="${esc(x.id)}" data-v="0">${esc(T('reject'))}</button>
      <button type="button" class="primary sm" data-act="review" data-kind="${kind}" data-id="${esc(x.id)}" data-v="1">${esc(T('approve'))}</button></div></li>`;
    let html = '';
    if (q.tours.length) html += `<h4>${esc(T('tours_title'))}</h4><ul class="tlist">${q.tours.map((t) => item('tour', t, `<small>${fmtIcon(t.format)} ${esc(tourMeta(t))}</small><small>${esc(when(t.startsAt))}${t.club ? ' · ' + esc(t.club.name) : ''} · ${esc(T('acc_' + t.access))}</small>`)).join('')}</ul>`;
    if (q.clubs.length) html += `<h4>${esc(T('clubs_title'))}</h4><ul class="tlist">${q.clubs.map((c) => item('club', c, `<small>${esc(T('join_' + c.join))}</small>`)).join('')}</ul>`;
    return html;
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
    body.querySelectorAll('details.fold').forEach((d) => { d.ontoggle = () => { D.open[d.dataset.k] = d.open; }; });
    for (const f of K.binders) f(body);
  }

  // ------------------------------------------------------------ Tin từ máy chủ
  const isOpen = () => dlg.open;
  O.on('tourList', (m) => { D.tours = m.items; D.skew = m.now - Date.now(); if (isOpen() && V.page === 'tours') render(); });
  O.on('tour', (m) => {
    if (m.id !== V.id) return;
    D.tour = m.tour;
    if (m.tour) D.skew = m.tour.now - Date.now();
    if (!m.tour && isOpen() && V.page === 'tour') { O.toast(T('srv_tour_not_found')); back() || top('tours'); return; }
    if (isOpen() && V.page === 'tour') render();
  });
  O.on('tourCreated', (m) => {
    O.toast(T(m.status === 'pending' ? 'tour_sent_review' : 'tour_created'));
    V.stack = [{ page: 'tours', id: null }];
    open('tour', m.id, false);
  });
  O.on('adminQueue', (m) => { D.queue = m; D.adminCount = m.clubs.length + m.tours.length; updateBadge(); if (isOpen() && V.page === 'admin') render(); });
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
    const el = $('tour-badge');
    if (el) { el.hidden = !n; el.textContent = n; }
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
  K.pages.admin = pageAdmin;
  Object.assign(K, {
    O, T, esc, $, S, D, V, secs, me, when, logo, tourItem, setTitle, needLogin, isOpen,
    open, top, back, render, share, shareLink,
  });

  window.CaroTour = {
    /** Lỗi khi tạo giải / CLB hiện ngay trong form (online.js gọi). */
    errorTarget(ctx) {
      if (ctx === 'tourCreate' && $('tf-err') && isOpen()) return 'tf-err';
      if (ctx === 'clubCreate' && $('cf-err') && isOpen()) return 'cf-err';
      return null;
    },
    open: (id) => { V.stack = [{ page: 'tours', id: null }]; open('tour', id, false); },
    get pendingLink() { return !!pending; },
  };
  window.addEventListener('langchange', () => { if (isOpen()) render(true); });
})();
