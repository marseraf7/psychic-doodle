/*
 * Phần chơi online mở rộng (đợt B/C):
 *  - Luật khai cuộc Swap2: thẻ chọn bên.
 *  - Xem trực tiếp: danh sách "Đang diễn ra" (như Lichess TV), xem ván của bạn bè / trận trong giải.
 *  - Hồ sơ người chơi: điểm Glicko-2 theo loại thời gian + biểu đồ, thành tích, chuỗi thắng, giải đấu, ván gần đây.
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  if (!N) return;
  const App = window.CaroApp;
  const T = window.I18N.t;
  const esc = App.esc;
  const $ = (id) => document.getElementById(id);
  const S = N.state;
  const glyph = (p) => (p === 1 ? '<b class="x">X</b>' : '<b class="o">O</b>');
  const ico = (id) => `<svg class="ico i-in" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const POOLS = ['bullet', 'blitz', 'rapid', 'classical'];

  // ================================================================ Swap2: chọn bên
  function renderSwap() {
    const box = $('swap-card');
    const r = S.room;
    const me = S.me && S.me.id;
    const show = r && me && r.opening === 'swap2' && r.phase && !r.winner && r.players.length === 2 && !App.watching;
    if (!show) { box.hidden = true; return; }
    const mine = r.actor === me;
    let html = '';
    if (r.phase === 'place3' || r.phase === 'place2') {
      const total = r.phase === 'place3' ? 3 : 5;
      html = `<b>${esc(T(mine ? 'swap_' + r.phase + '_you' : 'swap_phase_' + r.phase))}</b>
        <small>${esc(T('swap_progress', { n: r.moves.length, total }))}</small>`;
    } else if (mine) {
      html = `<b>${esc(T('swap_choose_title'))}</b><small>${esc(T(r.phase === 'choose1' ? 'swap_choose1_hint' : 'swap_choose2_hint'))}</small>
        <div class="row">
          <button type="button" class="primary sm" data-swap="x">${esc(T('swap_take'))} ${glyph(1)}</button>
          <button type="button" class="primary sm" data-swap="o">${esc(T('swap_take'))} ${glyph(2)}</button>
          ${r.phase === 'choose1' ? `<button type="button" class="ghost sm" data-swap="place2">${esc(T('swap_place2'))}</button>` : ''}
        </div>`;
    } else {
      const opp = r.players.find((p) => p.id === r.actor);
      html = `<b>${esc(T('swap_wait', { name: opp ? opp.name : T('opponent') }))}</b>`;
    }
    box.innerHTML = html;
    box.hidden = false;
    box.querySelectorAll('[data-swap]').forEach((b) => { b.onclick = () => N.send({ t: 'swap', choice: b.dataset.swap }); });
  }
  N.on('room', renderSwap);
  N.on('close', () => { $('swap-card').hidden = true; });

  // ================================================================ Xem trực tiếp
  let watchCode = null;
  N.on('room', (m) => {
    if (!m.watch) return;
    if (!m.room) {
      // Phòng đóng / thôi xem
      if (App.watching) { App.leaveOnline(); if (watchCode) N.toast(T('watch_ended')); }
      watchCode = null;
      return;
    }
    if (!watchCode) { N.closeDlg('online'); N.closeDlg('profile-dlg'); window.CaroTour && N.closeDlg('tour-dlg'); }
    watchCode = m.room.code;
    App.watchRoom(m.room, S.me ? S.me.id : null);
  });
  N.on('close', () => { if (App.watching) { App.leaveOnline(); watchCode = null; } });

  function watch(opts) {
    if (N.roomActive()) return N.toast(T('busy_in_game_short'));
    N.send({ t: 'watch', ...opts });
  }
  function stopWatching() {
    watchCode = null;
    N.send({ t: 'unwatch' });
    if (App.watching) App.leaveOnline();
  }
  $('wt-leave').onclick = stopWatching;
  $('wt-center').onclick = () => $('btn-center').click();
  $('wt-tv').onclick = () => { stopWatching(); $('btn-online').click(); };

  // Danh sách ván đang diễn ra
  let tvList = null;
  function loadTv() { if (N.connected) N.send({ t: 'tv' }); }
  N.on('tv', (m) => { tvList = m.games; renderTv(); });
  N.on('welcome', () => { if (N.isOpen('online')) loadTv(); });
  $('tv-refresh').onclick = loadTv;
  new MutationObserver(() => { if ($('online').open) loadTv(); }).observe($('online'), { attributes: true, attributeFilter: ['open'] });
  const rated = (p) => (p.rating ? ` <span class="rating">${p.rating}${p.prov ? '?' : ''}</span>` : '');
  function renderTv() {
    const el = $('tv-list');
    if (!N.connected || !tvList) { el.innerHTML = `<li class="empty">${esc(T('lobby_offline'))}</li>`; return; }
    if (!tvList.length) { el.innerHTML = `<li class="empty">${esc(T('tv_empty'))}</li>`; return; }
    el.innerHTML = tvList.map((g) => `<li>
        <div class="pn"><b>${glyph(1)} ${esc(g.x.name)}${rated(g.x)} <span class="vs">–</span> ${glyph(2)} ${esc(g.o.name)}${rated(g.o)}</b>
          <small>⏱ ${esc(window.I18N.tc(g.timeLimit, g.clock))}${g.opening === 'swap2' ? ' · Swap2' : ''} · ${esc(T('n_moves', { n: g.moves }))}${g.tour ? ' · ' + esc(g.tour) : ''}${g.watchers ? ` · ${ico('eye')}${g.watchers}` : ''}</small></div>
        <button type="button" class="primary sm" data-watch="${esc(g.code)}">${esc(T('watch'))}</button></li>`).join('');
  }

  // ================================================================ Hồ sơ người chơi
  let profile = null, chartPool = null;
  function openProfile(id) {
    profile = null;
    $('profile-body').innerHTML = '<p class="hint">…</p>';
    N.openDlg('profile-dlg');
    N.send({ t: 'profile', id });
  }
  N.on('profile', (m) => {
    profile = m.profile;
    // Biểu đồ: loại thời gian chơi nhiều nhất có dữ liệu
    chartPool = POOLS.filter((p) => (profile.history[p] || []).length).sort((a, b) => profile.pools[b].n - profile.pools[a].n)[0] || profile.main;
    renderProfile();
  });
  const locale = () => ({ vi: 'vi-VN', en: 'en-GB', ru: 'ru-RU', zh: 'zh-CN' }[window.I18N.lang]);
  const date = (ms, opts) => { try { return new Date(ms).toLocaleDateString(locale(), opts || { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return ''; } };

  /** Biểu đồ đường 1 chuỗi (điểm theo thời gian): lưới mờ, nét 2px, chạm/rê để xem giá trị. */
  function chartSvg(points) {
    const W = 560, H = 180, L = 40, R = 10, Tp = 12, B = 24;
    if (!points || points.length < 2) return `<p class="hint">${esc(T('profile_chart_empty'))}</p>`;
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(20, (y1 - y0) * 0.15);
    y0 = Math.floor((y0 - pad) / 50) * 50; y1 = Math.ceil((y1 + pad) / 50) * 50;
    const X = (v) => L + ((v - x0) / Math.max(1, x1 - x0)) * (W - L - R);
    const Y = (v) => Tp + (1 - (v - y0) / Math.max(1, y1 - y0)) * (H - Tp - B);
    const step = (y1 - y0) / 4;
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = Math.round(y0 + step * i);
      grid += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
    }
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    const last = points[points.length - 1];
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('profile_chart'))}" data-pts='${JSON.stringify(points.map((p) => [Math.round(X(p[0])), Math.round(Y(p[1])), p[0], p[1]]))}'>
      ${grid}
      <text x="${L}" y="${H - 6}" class="ax">${esc(date(x0, { day: '2-digit', month: '2-digit' }))}</text>
      <text x="${W - R}" y="${H - 6}" class="ax" text-anchor="end">${esc(date(x1, { day: '2-digit', month: '2-digit' }))}</text>
      <path d="${d}" class="ln"/>
      <circle cx="${X(last[0])}" cy="${Y(last[1])}" r="4" class="dt"/>
      <g class="hover" visibility="hidden"><line class="cross" y1="${Tp}" y2="${H - B}"/><circle r="5" class="dt"/></g>
    </svg><div class="chart-tip" hidden></div>`;
  }
  function bindChart(root) {
    const svg = root.querySelector('svg.chart');
    if (!svg) return;
    const pts = JSON.parse(svg.dataset.pts);
    const tip = root.querySelector('.chart-tip');
    const g = svg.querySelector('.hover');
    const move = (e) => {
      const box = svg.getBoundingClientRect();
      const vx = ((e.clientX - box.left) / box.width) * svg.viewBox.baseVal.width;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p[0] - vx) < Math.abs(best[0] - vx)) best = p;
      g.setAttribute('visibility', 'visible');
      g.querySelector('line').setAttribute('x1', best[0]); g.querySelector('line').setAttribute('x2', best[0]);
      g.querySelector('circle').setAttribute('cx', best[0]); g.querySelector('circle').setAttribute('cy', best[1]);
      tip.hidden = false;
      tip.innerHTML = `<b>${best[3]}</b> · ${esc(date(best[2]))}`;
      tip.style.left = Math.min(box.width - 110, Math.max(0, (best[0] / svg.viewBox.baseVal.width) * box.width - 50)) + 'px';
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', () => { g.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  }

  function renderProfile() {
    const p = profile;
    if (!p) return;
    const st = p.stats || { wins: 0, losses: 0, draws: 0 };
    const total = st.wins + st.losses + (st.draws || 0);
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    const pools = POOLS.map((k) => {
      const x = p.pools[k];
      return `<button type="button" class="pf-pool${k === chartPool ? ' on' : ''}" data-pool="${k}">
        <small>${esc(T('pool_' + k))}</small><b>${x.r}${x.prov ? '?' : ''}</b><small>${esc(T('lb_games', { n: x.n }))}</small></button>`;
    }).join('');
    const recent = (p.recent || []).map((g) => `<li>
        <span class="res ${g.result}">${esc(T('res_' + g.result))}</span>
        <div class="pn"><b>${esc(T('vs', { name: g.opponent || T('deleted_player') }))}</b>
          <small>${esc(date(g.created))} · ${esc(window.I18N.tc(g.timeLimit, g.clock))} · ${esc(T('n_moves', { n: g.moves }))}</small></div>
        <button type="button" class="primary sm" data-replay="${esc(g.share)}">${esc(T('replay'))}</button></li>`).join('');
    const h = p.h2h;
    const actions = [];
    if (!p.self && S.me && !S.me.guest && !p.friend) actions.push(`<button type="button" class="ghost sm" data-add="${esc(p.id)}">${esc(T('add_friend'))}</button>`);
    const sameRoom = S.room && S.room.players.some((q) => q.id === 'u_' + p.id); // đang đấu với chính mình
    if (!p.self && p.status === 'playing' && !sameRoom) actions.push(`<button type="button" class="primary sm" data-watch-uid="${esc(p.id)}">${esc(T('watch'))}</button>`);
    $('profile-body').innerHTML = `
      <div class="who pf-who"><span class="avatar">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>
        <div><b>${esc(p.name)}</b><small><span class="st ${p.status}"></span> @${esc(p.username)}${p.created ? ' · ' + esc(T('member_since', { d: date(p.created) })) : ''}</small></div>
        <div class="row pf-act">${actions.join('')}</div></div>
      <div class="pf-pools">${pools}</div>
      <div class="pf-chart">${chartSvg(p.history[chartPool])}</div>
      <div class="pf-stats">
        <div><b>${total}</b><small>${esc(T('profile_games'))}</small></div>
        <div><b class="win">${st.wins}</b><small>${esc(T('res_win'))} · ${pct(st.wins)}%</small></div>
        <div><b class="loss">${st.losses}</b><small>${esc(T('res_loss'))} · ${pct(st.losses)}%</small></div>
        <div><b>${st.draws || 0}</b><small>${esc(T('res_draw'))}</small></div>
        <div><b>${p.streak ? p.streak.best : 0}</b><small>${esc(T('profile_best_streak'))}</small></div>
        <div><b>${p.tours ? p.tours.won : 0}<span class="muted">/${p.tours ? p.tours.played : 0}</span></b><small>${esc(T('profile_tours'))}</small></div>
      </div>
      ${h && h.wins + h.losses + h.draws ? `<p class="hint">${esc(T('h2h_line', { w: h.wins, l: h.losses, d: h.draws }))}</p>` : ''}
      <h3>${esc(T('profile_recent'))}</h3>
      <ul class="games">${recent || `<li class="empty">${esc(T('no_history'))}</li>`}</ul>`;
    const body = $('profile-body');
    bindChart(body);
    body.querySelectorAll('[data-pool]').forEach((b) => { b.onclick = () => { chartPool = b.dataset.pool; renderProfile(); }; });
    body.querySelectorAll('[data-replay]').forEach((b) => { b.onclick = () => { N.closeDlg('profile-dlg'); N.openReplay(b.dataset.replay); }; });
    body.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { N.send({ t: 'friendAdd', id: b.dataset.add }); b.disabled = true; }; });
  }

  // Bấm tên người chơi ở bất kỳ đâu (bạn bè, bảng xếp hạng, phòng, giải) để mở hồ sơ; nút "Xem" để xem ván
  document.addEventListener('click', (e) => {
    const pf = e.target.closest('[data-profile]');
    if (pf) {
      e.preventDefault();
      if (!N.connected) return N.toast(T('not_connected'));
      openProfile(pf.dataset.profile);
      return;
    }
    const w = e.target.closest('[data-watch], [data-watch-uid]');
    if (w) {
      e.preventDefault();
      watch(w.dataset.watch ? { code: w.dataset.watch } : { uid: w.dataset.watchUid });
    }
  });

  window.addEventListener('langchange', () => { renderSwap(); renderTv(); if (N.isOpen('profile-dlg')) renderProfile(); });
  window.CaroPlay = { openProfile, watch, stopWatching };
})();
