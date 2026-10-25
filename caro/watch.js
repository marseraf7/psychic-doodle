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
  // Tên người chơi đã thấy trong phòng đang xem: ván xong, một bên rời phòng thì bản tin phòng thiếu
  // người đó — giữ tên cũ để thanh trên không hiện '?' và thẻ kết quả vẫn ghi đúng tên người thắng.
  const knownNames = new Map();
  function withKnownNames(room) {
    for (const p of room.players) if (p.name) knownNames.set(p.id, p.name);
    const have = new Set(room.players.map((p) => p.id));
    const missing = [room.seats.x, room.seats.o].filter((id) => id && !have.has(id) && knownNames.has(id));
    return missing.length ? { ...room, players: [...room.players, ...missing.map((id) => ({ id, name: knownNames.get(id) }))] } : room;
  }

  // Thẻ kết quả cho khán giả (mục Xem): ván đang xem kết thúc / bị huỷ thì hiện thẻ rõ ràng ngay trên
  // bàn cờ — trước đây chỉ có tiêu đề đổi mập mờ (lúc thành "Hoà", lúc giữ "Đang xem trực tiếp").
  function showWatchResult(room) {
    const nameOf = (sideWon) => {
      const id = sideWon === 1 ? room.seats.x : room.seats.o;
      const p = room.players.find((q) => q.id === id);
      return (p && p.name) || knownNames.get(id) || '?';
    };
    let sub;
    if (room.winner === 3) {
      sub = room.reason === 'abort' ? T(room.noPlay ? 'watch_result_noplay' : 'watch_result_aborted') : T('draw_short');
    } else {
      sub = T('watch_result_win', { name: nameOf(room.winner) });
      const why = room.reason === 'resign' ? 'watch_win_resign' : room.reason === 'time' ? 'watch_win_time'
        : ['leave', 'forfeit', 'disconnect'].includes(room.reason) ? 'watch_win_left' : null;
      if (why) sub += ' · ' + T(why);
    }
    $('wt-result-title').textContent = T('watch_over');
    $('wt-result-sub').textContent = sub;
    $('wt-result').hidden = false;
  }
  let resultFor = null; // mã phòng đang hiện thẻ kết quả (ván đã xong, chờ khán giả rời / ván mới bắt đầu)
  function hideWatchResult() { $('wt-result').hidden = true; resultFor = null; }

  N.on('room', (m) => {
    if (!m.watch) { if (m.room) { watchCode = null; hideWatchResult(); } return; } // đã vào ván của mình: máy chủ tự thôi cho xem
    if (!m.room) {
      // Phòng đóng / thôi xem
      if (App.watching) { App.leaveOnline(); if (watchCode) N.toast(T('watch_ended')); }
      watchCode = null;
      hideWatchResult();
      return;
    }
    if (!watchCode) { N.closeDlg('online'); N.closeDlg('profile-dlg'); window.CaroTour && N.closeDlg('tour-dlg'); }
    const room = withKnownNames(m.room);
    watchCode = room.code;
    // Ván vừa xong, một người chơi rời phòng: máy chủ tái chế phòng thành phòng chờ (xoá winner,
    // xoá bàn cờ, trống một ghế). Không áp bản tin đó cho khán giả — giữ thẻ kết quả và bàn cờ cuối,
    // tránh cảnh tiêu đề nhảy về "đang xem" với tên '?'. Ván mới thật (đủ hai ghế) thì xem tiếp bình thường.
    if (!room.winner && resultFor === room.code && room.moves.length === 0 && !(room.seats.x && room.seats.o)) return;
    App.watchRoom(room, S.me ? S.me.id : null);
    if (room.winner) { showWatchResult(room); resultFor = room.code; } else hideWatchResult();
  });
  N.on('close', () => { if (App.watching) { App.leaveOnline(); watchCode = null; hideWatchResult(); } });

  function watch(opts) {
    if (N.roomActive()) return N.toast(T('busy_in_game_short'));
    N.send({ t: 'watch', ...opts });
  }
  function stopWatching() {
    watchCode = null;
    hideWatchResult();
    N.send({ t: 'unwatch' });
    if (App.watching) App.leaveOnline();
  }
  // "Thôi xem" về mục Xem (trước đây rơi về ván với máy trên bàn cờ).
  $('wt-leave').onclick = () => { stopWatching(); window.CaroShell.open('watch'); };
  $('wt-result-more').onclick = () => { stopWatching(); window.CaroShell.open('watch'); };
  $('wt-center').onclick = () => $('btn-center').click();
  $('wt-tv').onclick = () => { stopWatching(); window.CaroShell.open('watch'); };

  // Danh sách ván đang diễn ra
  let tvList = null;
  function loadTv() { if (N.connected) N.send({ t: 'tv' }); }
  N.on('tv', (m) => { tvList = m.games; renderTv(); });
  const onWatchPage = () => window.CaroShell && window.CaroShell.current === 'watch';
  N.on('welcome', () => { if (onWatchPage()) loadTv(); });
  // Mở tab Xem: kết nối rồi tải danh sách ván đang diễn ra
  window.addEventListener('caro:page', (e) => { if (e.detail.id === 'watch') { N.connect(); renderTv(); loadTv(); } });
  $('tv-refresh').onclick = loadTv;
  const rated = (p) => (p.rating ? ` <span class="rating">${p.rating}${p.prov ? '?' : ''}</span>` : '');
  function renderTv() {
    const el = $('tv-list');
    if (!N.connected || !tvList) { el.innerHTML = `<li class="empty">${esc(T('lobby_offline'))}</li>`; return; }
    if (!tvList.length) { el.innerHTML = `<li class="empty">${esc(T('tv_empty'))}</li>`; return; }
    el.innerHTML = tvList.map((g) => `<li>
        <div class="pn"><b>${glyph(1)} ${esc(g.x.name)}${rated(g.x)} <span class="vs">–</span> ${glyph(2)} ${esc(g.o.name)}${rated(g.o)}</b>
          <small>⏱ ${esc(window.I18N.tc(g.timeLimit, g.clock))}${g.opening === 'swap2' ? ' · Swap2' : ''}${esc(window.I18N.ruleTag(g.rule))} · ${esc(T('n_moves', { n: g.moves }))}${g.tour ? ' · ' + esc(g.tour) : ''}${g.watchers ? ` · ${ico('eye')}${g.watchers}` : ''}</small></div>
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
