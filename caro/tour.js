/*
 * Giải đấu & câu lạc bộ (dùng chung kết nối của online.js).
 * Một hộp thoại nhiều trang: danh sách giải / chi tiết giải (nhánh đấu hoặc bảng xếp hạng Arena) / tạo giải,
 * danh sách CLB / trang CLB / tạo CLB, và trang duyệt cho quản trị viên.
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
  const D = { tours: null, tour: null, clubs: null, club: null, queue: null, skew: 0, adminCount: 0 };
  let ticker = 0;

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
    const parts = [T(t.format === 'arena' ? 'fmt_arena' : 'fmt_knockout')];
    if (t.format === 'arena') parts.push(T('minutes_n', { n: t.minutes }));
    else parts.push('Bo' + t.bestOf);
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
    if (!$('tour-dlg').open) O.openDlg('tour-dlg');
    load();
    render();
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
  function render() {
    const top3 = ['tours', 'clubs', 'admin'];
    $('tour-back').hidden = !V.stack.length;
    dlg.querySelectorAll('[data-ttab]').forEach((b) => b.classList.toggle('on', b.dataset.ttab === V.page || (b.dataset.ttab === 'tours' && /^tour/.test(V.page)) || (b.dataset.ttab === 'clubs' && /^club/.test(V.page))));
    const adminTab = dlg.querySelector('[data-ttab="admin"]');
    adminTab.hidden = !(me() && me().admin);
    adminTab.innerHTML = esc(T('review_tab')) + (D.adminCount ? ` <i class="count">${D.adminCount}</i>` : '');
    $('tour-tabs').hidden = !top3.includes(V.page);
    const body = $('tour-body');
    if (!O.connected) { body.innerHTML = `<p class="hint">${esc(T('lobby_offline'))}</p>`; setTitle('tours_title'); return; }
    const page = { tours: pageTours, tour: pageTour, tourNew: pageTourNew, clubs: pageClubs, club: pageClub, clubNew: pageClubNew, admin: pageAdmin }[V.page];
    body.innerHTML = page();
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
    if (t.format === 'knockout' && t.status === 'scheduled' && t.checkinEnabled) {
      html += `<p class="hint">${esc(T(t.checkin ? 'checkin_open_hint' : 'checkin_hint', { t: when(t.checkinAt) }))}</p>`;
    }
    html += `<div class="row tactions">${actions(t)}</div>`;
    html += myCard(t);
    if (t.podium && t.podium.length && t.status === 'finished') {
      html += `<div class="podium">${t.podium.map((p, i) => `<div class="pl p${i + 1}"><span>${['🥇', '🥈', '🥉'][i]}</span><b>${esc(p.name)}</b></div>`).join('')}</div>`;
    }
    if (t.format === 'knockout' && t.rounds) html += bracket(t);
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
    const opp = m.a && m.a.uid === me().uid ? m.b : m.a;
    return `<div class="mycard"><b>${esc(opp ? T('tour_next_vs', { name: opp.name }) : T('tour_next_wait'))}</b></div>`;
  }
  function roundName(t, r) {
    const n = t.rounds.length;
    if (r === n - 1) return T('r_final');
    if (r === n - 2) return T('r_semi');
    if (r === n - 3) return T('r_quarter');
    return T('r_round', { n: r + 1 });
  }
  function matchBox(t, m) {
    const uid = me() && me().uid;
    const row = (p, w, isWin) => p
      ? `<div class="b-p ${isWin ? 'win' : ''} ${p.uid === uid ? 'me' : ''}"><span class="seed">${p.seed || ''}</span><span class="nm">${esc(p.name)}</span><b>${m.bye ? '' : w}</b></div>`
      : `<div class="b-p empty"><span class="seed"></span><span class="nm">${esc(m.bye ? T('bye') : '—')}</span><b></b></div>`;
    const extra = [];
    if (m.live) extra.push(`<span class="pill live">● ${esc(T('live'))}</span>`);
    if (m.walkover) extra.push(esc(T('walkover')));
    m.games.forEach((g, i) => extra.push(`<a href="#" data-act="replay" data-share="${esc(g)}">▶${i + 1}</a>`));
    return `<div class="b-match ${m.live ? 'live' : ''}">${row(m.a, m.wa, m.winner && m.a && m.winner === m.a.uid)}${row(m.b, m.wb, m.winner && m.b && m.winner === m.b.uid)}${extra.length ? `<small>${extra.join(' ')}</small>` : ''}</div>`;
  }
  function bracket(t) {
    let html = `<h4>${esc(T('bracket'))}</h4><div class="bracket">`;
    t.rounds.forEach((round, r) => {
      html += `<div class="b-col"><h5>${esc(roundName(t, r))}</h5>${round.map((m) => matchBox(t, m)).join('')}</div>`;
    });
    html += '</div>';
    if (t.third) html += `<h5>${esc(T('third_place'))}</h5><div class="bracket"><div class="b-col">${matchBox(t, t.third)}</div></div>`;
    return html;
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
    const outLabel = (p) => (p.out === 'no_checkin' ? T('out_no_checkin') : p.out === 'kicked' ? T('out_kicked') : p.withdrawn ? T('out_withdrew') : '');
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

  // ---- Tạo giải
  function pageTourNew() {
    setTitle('tour_create');
    if (!me()) return needLogin();
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const officerClubs = (D.myClubs || []).filter((c) => c.status === 'approved' && (c.role === 'owner' || c.role === 'officer'));
    const preClub = V.id;
    const radio = (name, items, val) => `<div class="seg">${items.map(([v, label]) => `<label><input type="radio" name="${name}" value="${v}" ${String(v) === String(val) ? 'checked' : ''}> <span>${esc(label)}</span></label>`).join('')}</div>`;
    return `<form id="tf" class="tform">
      <p class="note">${esc(T('review_note_tour'))}</p>
      <label class="field"><span>${esc(T('tour_name'))}</span><input name="name" maxlength="60" required></label>
      <label class="field"><span>${esc(T('tour_desc'))}</span><textarea name="desc" maxlength="1000" rows="3"></textarea></label>
      <fieldset><legend>${esc(T('format'))}</legend>${radio('format', [['arena', '⚔️ ' + T('fmt_arena')], ['knockout', '🏆 ' + T('fmt_knockout')]], 'arena')}
        <p class="hint" id="tf-fmt-hint">${esc(T('arena_hint'))}</p></fieldset>
      <label class="field"><span>${esc(T('tour_start'))}</span><input name="start" type="datetime-local" value="${local}" required></label>
      <fieldset><legend>${esc(T('time_limit'))}</legend>${radio('time', [[10, secs(10)], [20, secs(20)], [30, secs(30)]], 20)}</fieldset>
      <fieldset class="only-arena"><legend>${esc(T('duration'))}</legend>${radio('minutes', [15, 30, 45, 60, 90, 120].map((n) => [n, T('minutes_n', { n })]), 30)}</fieldset>
      <fieldset class="only-ko" hidden><legend>${esc(T('format_bo'))}</legend>${radio('bo', [[1, 'Bo1'], [3, 'Bo3'], [5, 'Bo5']], 3)}</fieldset>
      <fieldset class="only-ko" hidden><legend>${esc(T('seeding'))}</legend>${radio('seeding', [['rating', T('seed_rating')], ['random', T('seed_random')]], 'rating')}</fieldset>
      <label class="check only-ko" hidden><input type="checkbox" name="third" checked> <span>${esc(T('third_place_opt'))}</span></label>
      <label class="check only-ko" hidden><input type="checkbox" name="checkin" checked> <span>${esc(T('checkin_opt'))}</span></label>
      <label class="check"><input type="checkbox" name="rated" checked> <span>${esc(T('rated_opt'))}</span></label>
      <label class="field short"><span>${esc(T('max_players'))}</span><input name="max" type="number" min="2" max="200" value="32"></label>
      <fieldset><legend>${esc(T('access'))}</legend>${radio('access', [['public', T('acc_public')], ['link', T('acc_link')], ...(officerClubs.length ? [['club', T('acc_club')]] : [])], preClub ? 'club' : 'public')}</fieldset>
      ${officerClubs.length ? `<label class="field only-club" ${preClub ? '' : 'hidden'}><span>${esc(T('club'))}</span><select name="club">${officerClubs.map((c) => `<option value="${esc(c.id)}" ${c.id === preClub ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
      <p class="err" id="tf-err"></p>
      <button class="primary wide">${esc(T('tour_submit'))}</button>
    </form>`;
  }

  // ---- Câu lạc bộ
  function clubItem(c) {
    const tags = [];
    if (c.status !== 'approved') tags.push(`<span class="pill ${c.status === 'pending' ? 'wait' : 'off'}">${esc(T('cst_' + c.status))}</span>`);
    if (c.role) tags.push(`<span class="pill mine">${esc(T('role_' + c.role))}</span>`);
    else if (c.requested) tags.push(`<span class="pill wait">${esc(T('club_requested'))}</span>`);
    return `<li><button type="button" class="titem" data-act="club" data-id="${esc(c.id)}">${logo(c.name)}
      <span class="pn"><b>${esc(c.name)}</b><small>${esc(T('members_n', { n: c.count }))} · ${esc(T('join_' + c.join))}</small>${c.desc ? `<small>${esc(c.desc)}</small>` : ''}</span>
      <span class="tags">${tags.join('')}</span></button></li>`;
  }
  function pageClubs() {
    setTitle('clubs_title');
    let html = `<div class="row"><button type="button" class="primary" data-act="clubNew" ${me() ? '' : 'disabled'}>＋ ${esc(T('club_create'))}</button>
      <input id="club-q" placeholder="${esc(T('club_search'))}" maxlength="40" value="${esc(D.clubQ || '')}"></div>`;
    if (!me()) html += needLogin();
    if (!D.clubs) return html + `<p class="hint">…</p>`;
    if (D.myClubs && D.myClubs.length) html += `<h4>${esc(T('my_clubs'))}</h4><ul class="tlist">${D.myClubs.map(clubItem).join('')}</ul>`;
    html += `<h4>${esc(T('all_clubs'))}</h4><ul class="tlist">${D.clubs.map(clubItem).join('') || `<li class="empty">${esc(T('club_none'))}</li>`}</ul>`;
    return html;
  }
  function pageClub() {
    const c = D.club;
    if (!c) { setTitle('clubs_title'); return `<p class="hint">…</p>`; }
    setTitle(null, c.name);
    const uid = me() && me().uid;
    let html = `<div class="chead">${logo(c.name)}<div class="pn"><b>${esc(c.name)}</b><small>${esc(T('members_n', { n: c.count }))} · ${esc(T('join_' + c.join))} · ${esc(T('club_owner_name', { name: c.owner }))}</small></div></div>`;
    if (c.status === 'pending') html += `<p class="note">${esc(T('club_pending_note'))}</p>`;
    if (c.status === 'rejected') html += `<p class="note bad">${esc(T('club_rejected_note'))}${c.reviewNote ? ': ' + esc(c.reviewNote) : ''}</p>`;
    if (c.announcement) html += `<p class="announce">📌 ${esc(c.announcement)}</p>`;
    if (c.desc) html += `<p class="tdesc">${esc(c.desc)}</p>`;
    const b = [];
    if (me() && c.status === 'approved' && !c.role) {
      if (c.join === 'code') b.push(`<input id="club-code" placeholder="${esc(T('club_code'))}" maxlength="12" autocapitalize="characters">`);
      b.push(c.requested ? `<span class="pill wait">${esc(T('club_requested'))}</span>`
        : `<button type="button" class="primary" data-act="clubJoin">${esc(T(c.join === 'request' ? 'club_request' : 'club_join'))}</button>`);
    }
    if (c.role && c.role !== 'owner') b.push(`<button type="button" class="ghost" data-act="clubLeave">${esc(T('club_leave'))}</button>`);
    if (c.officer && c.status === 'approved') b.push(`<button type="button" class="ghost" data-act="tourNewClub">🏆 ${esc(T('club_new_tour'))}</button>`);
    b.push(`<button type="button" class="ghost" data-act="clubShare">🔗 ${esc(T('share'))}</button>`);
    if (!me()) b.push(`<span class="hint">${esc(T('tour_login_hint'))}</span>`);
    html += `<div class="row tactions">${b.join('')}</div>`;
    if (c.officer) {
      html += `<details class="card" id="club-manage" ${D.manageOpen ? 'open' : ''}><summary>⚙ ${esc(T('club_manage'))}</summary>
        <form id="club-edit" class="tform">
          <label class="field"><span>${esc(T('club_announcement'))}</span><input name="announcement" maxlength="300" value="${esc(c.announcement)}"></label>
          <label class="field"><span>${esc(T('club_desc'))}</span><textarea name="desc" maxlength="500" rows="3">${esc(c.desc)}</textarea></label>
          ${c.isOwner || (me() && me().admin) ? `<label class="field"><span>${esc(T('club_join_policy'))}</span><select name="join">${['open', 'request', 'code'].map((j) => `<option value="${j}" ${c.join === j ? 'selected' : ''}>${esc(T('join_' + j))}</option>`).join('')}</select></label>` : ''}
          <button class="primary">${esc(T('save'))}</button>
        </form>
        ${c.code ? `<p>${esc(T('club_code'))}: <b class="code">${esc(c.code)}</b> <button type="button" class="ghost sm" data-act="clubNewCode">${esc(T('club_new_code'))}</button></p>` : ''}
        ${c.isOwner || (me() && me().admin) ? `<button type="button" class="ghost danger sm" data-act="clubDisband">${esc(T('club_disband'))}</button>` : ''}
      </details>`;
      if (c.requests.length) {
        html += `<h4>${esc(T('club_requests', { n: c.requests.length }))}</h4><ul class="people">${c.requests.map((r) => `
          <li><div class="pn"><b>${esc(r.name)}</b><small>${esc(String(r.rating))}</small></div>
          <button type="button" class="ghost sm" data-act="clubReq" data-uid="${esc(r.id)}" data-v="0">${esc(T('decline'))}</button>
          <button type="button" class="primary sm" data-act="clubReq" data-uid="${esc(r.id)}" data-v="1">${esc(T('accept'))}</button></li>`).join('')}</ul>`;
      }
    }
    if (c.tours && c.tours.length) html += `<h4>${esc(T('club_tours'))}</h4><ul class="tlist">${c.tours.map(tourItem).join('')}</ul>`;
    html += `<h4>${esc(T('club_members_rank'))}</h4><ol class="ranks">${c.members.map((m, i) => {
      const ops = [];
      if (m.id !== uid && m.role !== 'owner') {
        if (c.isOwner) {
          ops.push(`<option value="">⋯</option>`);
          ops.push(m.role === 'officer' ? `<option value="member">${esc(T('make_member'))}</option>` : `<option value="officer">${esc(T('make_officer'))}</option>`);
          ops.push(`<option value="owner">${esc(T('make_owner'))}</option>`);
          ops.push(`<option value="kick">${esc(T('club_kick'))}</option>`);
        } else if (c.officer && m.role === 'member') {
          ops.push(`<option value="">⋯</option><option value="kick">${esc(T('club_kick'))}</option>`);
        }
      }
      return `<li class="${m.id === uid ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="st ${m.status}"></span>
        <div class="pn"><b>${esc(m.name)}${m.role !== 'member' ? ` <span class="role">${esc(T('role_' + m.role))}</span>` : ''}</b><small>@${esc(m.username)}</small></div>
        <span class="pts">${m.rating}</span>${ops.length ? `<select class="mops" data-uid="${esc(m.id)}" data-name="${esc(m.name)}" aria-label="${esc(T('club_manage'))}">${ops.join('')}</select>` : ''}</li>`;
    }).join('')}</ol>`;
    return html;
  }
  function pageClubNew() {
    setTitle('club_create');
    if (!me()) return needLogin();
    return `<form id="cf" class="tform">
      <p class="note">${esc(T('review_note_club'))}</p>
      <label class="field"><span>${esc(T('club_name'))}</span><input name="name" maxlength="40" required></label>
      <label class="field"><span>${esc(T('club_desc'))}</span><textarea name="desc" maxlength="500" rows="3"></textarea></label>
      <fieldset><legend>${esc(T('club_join_policy'))}</legend><div class="seg col">${['open', 'request', 'code'].map((j, i) => `<label><input type="radio" name="join" value="${j}" ${i === 0 ? 'checked' : ''}> <span>${esc(T('join_' + j))} – ${esc(T('join_' + j + '_hint'))}</span></label>`).join('')}</div></fieldset>
      <p class="err" id="cf-err"></p>
      <button class="primary wide">${esc(T('club_submit'))}</button>
    </form>`;
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
      const a = b.dataset.act, t = D.tour, c = D.club;
      if (a === 'tour') open('tour', b.dataset.id);
      else if (a === 'club') open('club', b.dataset.id);
      else if (a === 'tourNew') open('tourNew', null);
      else if (a === 'tourNewClub') open('tourNew', c.id);
      else if (a === 'clubNew') open('clubNew', null);
      else if (a === 'join') O.send({ t: 'tourJoin', id: t.id });
      else if (a === 'checkin') O.send({ t: 'tourCheckin', id: t.id });
      else if (a === 'pause') O.send({ t: 'tourPause', id: t.id, paused: b.dataset.v === '1' });
      else if (a === 'leave') { if (confirm(T(t.status === 'running' ? 'confirm_tour_withdraw_running' : 'confirm_tour_withdraw'))) O.send({ t: 'tourLeave', id: t.id }); }
      else if (a === 'start') { if (confirm(T('confirm_tour_start'))) O.send({ t: 'tourStart', id: t.id }); }
      else if (a === 'cancel') { if (confirm(T('confirm_tour_cancel'))) O.send({ t: 'tourCancel', id: t.id }); }
      else if (a === 'kick') { if (confirm(T('confirm_tour_kick', { name: b.dataset.name }))) O.send({ t: 'tourKick', id: t.id, uid: b.dataset.uid }); }
      else if (a === 'share') share(shareLink('t', t.id), t.name);
      else if (a === 'clubShare') share(shareLink('club', c.id), c.name);
      else if (a === 'toGame') O.closeDlg('tour-dlg');
      else if (a === 'replay') { O.closeDlg('tour-dlg'); O.openReplay(b.dataset.share); }
      else if (a === 'clubJoin') O.send({ t: 'clubJoin', id: c.id, code: ($('club-code') || {}).value });
      else if (a === 'clubLeave') { if (confirm(T('confirm_club_leave', { name: c.name }))) O.send({ t: 'clubLeave', id: c.id }); }
      else if (a === 'clubReq') O.send({ t: 'clubRequest', id: c.id, uid: b.dataset.uid, accept: b.dataset.v === '1' });
      else if (a === 'clubNewCode') O.send({ t: 'clubNewCode', id: c.id });
      else if (a === 'clubDisband') { if (confirm(T('confirm_club_disband', { name: c.name }))) { O.send({ t: 'clubDisband', id: c.id }); back() || top('clubs'); } }
      else if (a === 'review') {
        const approve = b.dataset.v === '1';
        const note = approve ? '' : prompt(T('reject_reason'), '');
        if (note === null) return;
        O.send({ t: 'adminReview', kind: b.dataset.kind, id: b.dataset.id, approve, note });
      }
    };
    body.querySelectorAll('select.mops').forEach((s) => {
      s.onchange = () => {
        const v = s.value, uid = s.dataset.uid, name = s.dataset.name;
        s.value = '';
        if (!v) return;
        if (v === 'kick') { if (confirm(T('confirm_club_kick', { name }))) O.send({ t: 'clubKick', id: D.club.id, uid }); }
        else if (v === 'owner') { if (confirm(T('confirm_club_owner', { name }))) O.send({ t: 'clubRole', id: D.club.id, uid, role: 'owner' }); }
        else O.send({ t: 'clubRole', id: D.club.id, uid, role: v });
      };
    });
    const q = $('club-q');
    if (q) {
      let deb = 0;
      q.oninput = () => { clearTimeout(deb); deb = setTimeout(() => { D.clubQ = q.value; O.send({ t: 'clubList', q: q.value }); }, 300); };
    }
    const tf = $('tf');
    if (tf) {
      const sync = () => {
        const ko = tf.format.value === 'knockout';
        tf.querySelectorAll('.only-ko').forEach((x) => { x.hidden = !ko; });
        tf.querySelectorAll('.only-arena').forEach((x) => { x.hidden = ko; });
        tf.querySelectorAll('.only-club').forEach((x) => { x.hidden = tf.access.value !== 'club'; });
        $('tf-fmt-hint').textContent = T(ko ? 'knockout_hint' : 'arena_hint');
        tf.max.max = ko ? 64 : 200;
        tf.max.min = ko ? 4 : 2;
        if (ko && Number(tf.max.value) > 64) tf.max.value = 16;
      };
      tf.addEventListener('change', sync);
      sync();
      tf.onsubmit = (e) => {
        e.preventDefault();
        $('tf-err').textContent = '';
        const start = new Date(tf.start.value).getTime();
        O.send({
          t: 'tourCreate', name: tf.name.value.trim(), desc: tf.desc.value.trim(), format: tf.format.value, startsAt: start - D.skew,
          timeLimit: Number(tf.time.value), minutes: Number(tf.minutes.value), bestOf: Number(tf.bo.value), seeding: tf.seeding.value,
          thirdPlace: tf.third.checked, checkin: tf.checkin.checked, rated: tf.rated.checked, maxPlayers: Number(tf.max.value),
          access: tf.access.value, club: tf.club ? tf.club.value : null,
        });
      };
    }
    const cf = $('cf');
    if (cf) {
      cf.onsubmit = (e) => {
        e.preventDefault();
        $('cf-err').textContent = '';
        O.send({ t: 'clubCreate', name: cf.name.value.trim(), desc: cf.desc.value.trim(), join: cf.join.value });
      };
    }
    const cm = $('club-manage');
    if (cm) cm.ontoggle = () => { D.manageOpen = cm.open; }; // giữ trạng thái mở khi trang được vẽ lại
    const ce = $('club-edit');
    if (ce) {
      ce.onsubmit = (e) => {
        e.preventDefault();
        O.send({ t: 'clubUpdate', id: D.club.id, desc: ce.desc.value, announcement: ce.announcement.value, join: ce.join ? ce.join.value : undefined });
        O.toast(T('saved'));
      };
    }
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
  O.on('clubList', (m) => {
    D.clubs = m.clubs;
    D.myClubs = m.mine;
    if (isOpen() && (V.page === 'clubs' || V.page === 'tourNew') && !$('tf')) render();
  });
  O.on('club', (m) => {
    if (m.id !== V.id) return;
    D.club = m.club;
    if (!m.club && isOpen() && V.page === 'club') { back() || top('clubs'); return; }
    if (isOpen() && V.page === 'club') {
      // Đang gõ trong form quản lý thì không vẽ lại (tránh mất chữ đang gõ)
      if (document.activeElement && document.activeElement.closest('#club-edit')) return;
      render();
    }
  });
  O.on('clubCreated', (m) => {
    O.toast(T(m.status === 'pending' ? 'club_sent_review' : 'club_created'));
    V.stack = [{ page: 'clubs', id: null }];
    open('club', m.id, false);
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
  window.addEventListener('langchange', () => { if (isOpen()) render(); });
})();
