/*
 * Hồ sơ người chơi: điểm Glicko-2 từng loại thời gian + biểu đồ, thắng/thua/hoà, chuỗi thắng, giải đấu, ván gần đây,
 * thống kê sâu theo loại (điểm cao / thấp nhất, thắng đẹp nhất, thua tệ nhất, chuỗi dài nhất) và hoạt động 30 ngày.
 * Máy chủ: server/src/hub/profile.js. Phần tử có data-profile="<id>" ở bất kỳ đâu mở hồ sơ người đó.
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
  const POOLS = ['bullet', 'blitz', 'rapid', 'classical'];

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

  /** Thống kê sâu của loại thời gian đang chọn (như trang "perf" của Lichess). */
  function perfHtml(p) {
    const f = p.perf && p.perf[chartPool];
    if (!f || !f.hi) return '';
    const line = (g) => `<li><b>${g.r}</b> <span>${esc(g.name || T('deleted_player'))}</span> <small>${esc(date(g.at))}</small>
      ${g.share ? `<button type="button" class="ghost sm" data-replay="${esc(g.share)}">${esc(T('replay'))}</button>` : ''}</li>`;
    return `<div class="pf-perf">
      <div class="pf-stats">
        <div><b class="win">${f.hi.r}</b><small>${esc(T('perf_hi'))} · ${esc(date(f.hi.at))}</small></div>
        <div><b class="loss">${f.lo.r}</b><small>${esc(T('perf_lo'))} · ${esc(date(f.lo.at))}</small></div>
        <div><b>${f.win.max}</b><small>${esc(T('perf_win_streak'))}${f.win.cur ? ' · ' + esc(T('perf_now', { n: f.win.cur })) : ''}</small></div>
        <div><b>${f.loss.max}</b><small>${esc(T('perf_loss_streak'))}${f.loss.cur ? ' · ' + esc(T('perf_now', { n: f.loss.cur })) : ''}</small></div>
      </div>
      ${f.best.length ? `<h4>${esc(T('perf_best'))}</h4><ul class="pf-list">${f.best.map(line).join('')}</ul>` : ''}
      ${f.worst.length ? `<h4>${esc(T('perf_worst'))}</h4><ul class="pf-list">${f.worst.map(line).join('')}</ul>` : ''}
    </div>`;
  }

  /** Hoạt động 30 ngày gần nhất: mỗi ngày số ván thắng / thua / hoà và điểm thay đổi. */
  function activityHtml(p) {
    const act = p.activity || [];
    if (!act.length) return '';
    const rows = act.map((d) => {
      const n = d.w + d.l + d.d;
      const delta = Object.entries(d.r || {}).map(([k, v]) => `<span class="${v >= 0 ? 'up' : 'down'}">${esc(T('pool_' + k))} ${v >= 0 ? '+' : ''}${v}</span>`).join(' ');
      const bar = ['w', 'd', 'l'].map((k) => (d[k] ? `<i class="${k}" style="flex:${d[k]}"></i>` : '')).join('');
      return `<li><small>${esc(date(Date.parse(d.day + 'T12:00:00Z'), { day: '2-digit', month: '2-digit' }))}</small>
        <span>${esc(T('act_games', { n, w: d.w, l: d.l, d: d.d }))}</span><span class="act-bar">${bar}</span><span class="act-d">${delta}</span></li>`;
    }).join('');
    return `<h3>${esc(T('act_title'))}</h3><ul class="pf-act-feed">${rows}</ul>`;
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
      ${perfHtml(p)}
      ${activityHtml(p)}
      <h3>${esc(T('profile_recent'))}</h3>
      <ul class="games">${recent || `<li class="empty">${esc(T('no_history'))}</li>`}</ul>`;
    const body = $('profile-body');
    bindChart(body);
    body.querySelectorAll('[data-pool]').forEach((b) => { b.onclick = () => { chartPool = b.dataset.pool; renderProfile(); }; });
    body.querySelectorAll('[data-replay]').forEach((b) => { b.onclick = () => { N.closeDlg('profile-dlg'); N.openReplay(b.dataset.replay); }; });
    body.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { N.send({ t: 'friendAdd', id: b.dataset.add }); b.disabled = true; }; });
  }

  document.addEventListener('click', (e) => {
    const pf = e.target.closest('[data-profile]');
    if (!pf) return;
    e.preventDefault();
    if (!N.connected) return N.toast(T('not_connected'));
    openProfile(pf.dataset.profile);
  });

  window.addEventListener('langchange', () => { if (N.isOpen('profile-dlg')) renderProfile(); });
  window.CaroProfile = { open: openProfile };
})();
