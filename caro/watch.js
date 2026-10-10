/*
 * Xem trực tiếp (như Lichess TV): danh sách "Đang diễn ra", xem ván của bạn bè đang chơi / trận trong giải.
 * Máy chủ: server/src/hub/watch.js. Nút có data-watch="<mã phòng>" hoặc data-watch-uid="<id người chơi>" ở bất kỳ đâu.
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

  let watchCode = null;
  N.on('room', (m) => {
    if (!m.watch) { if (m.room) watchCode = null; return; } // đã vào ván của mình: máy chủ tự thôi cho xem
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

  document.addEventListener('click', (e) => {
    const w = e.target.closest('[data-watch], [data-watch-uid]');
    if (!w) return;
    e.preventDefault();
    watch(w.dataset.watch ? { code: w.dataset.watch } : { uid: w.dataset.watchUid });
  });

  window.addEventListener('langchange', renderTv);
  window.CaroWatch = { watch, stopWatching };
})();
