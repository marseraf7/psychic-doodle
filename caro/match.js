/* Tìm trận nhanh và sảnh phòng công khai (dùng chung kết nối của online.js). */
(function () {
  'use strict';
  const O = window.CaroOnline;
  if (!O) return;
  const T = window.I18N.t;
  const esc = window.CaroApp.esc;
  const $ = (id) => document.getElementById(id);
  const secs = (n) => T('per_move', { n });

  const Q = { searching: false, since: 0, lobby: null };
  let ticker = 0;
  let watching = false;

  const waited = () => {
    const s = Math.max(0, Math.floor((Date.now() - Q.since) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const statusText = () => T('qm_searching', { t: waited() });

  // ------------------------------------------------------------ Tìm trận nhanh
  // Ô vừa chọn trên lưới "Chơi nhanh" (dùng lại cho nút "Tìm trận khác" trên thẻ kết quả)
  Q.time = -1;
  function start(time) {
    if (O.roomActive() && !confirm(T('confirm_leave'))) return;
    if (typeof time === 'number') Q.time = time;
    O.send({ t: 'quickMatch', timeLimit: Q.time });
  }
  document.querySelectorAll('#qm-grid .qm-tile').forEach((b) => { b.onclick = () => start(Number(b.dataset.time)); });
  $('qm-cancel').onclick = () => O.send({ t: 'quickCancel' });
  $('banner-quick').onclick = () => start();

  function setSearching(on) {
    if (on && !Q.searching) Q.since = Date.now(); // tính giờ theo máy mình (đồng hồ máy chủ có thể lệch)
    Q.searching = on;
    clearInterval(ticker);
    if (on) ticker = setInterval(tick, 1000);
    renderQuick();
    O.renderInvites();
  }
  function tick() {
    $('qm-status').textContent = statusText();
    document.querySelectorAll('.qm-time').forEach((el) => { el.textContent = statusText(); });
  }
  function renderQuick() {
    document.querySelectorAll('#qm-grid .qm-tile').forEach((b) => {
      b.classList.toggle('on', Q.searching && Number(b.dataset.time) === Q.time);
      b.setAttribute('aria-pressed', String(Q.searching && Number(b.dataset.time) === Q.time));
    });
    $('qm-grid').classList.toggle('searching', Q.searching);
    $('qm-search').hidden = !Q.searching;
    $('qm-status').textContent = Q.searching ? statusText() : '';
    $('banner-quick').disabled = Q.searching;
    $('banner-quick').textContent = T(Q.searching ? 'qm_searching_short' : 'qm_again');
  }

  O.on('queue', (m) => {
    if (m.state === 'searching' && typeof m.timeLimit === 'number') Q.time = m.timeLimit; // ô đang tìm (cả sau khi kết nối lại)
    setSearching(m.state === 'searching');
  });
  O.on('welcome', () => {
    setSearching(false); // máy chủ gửi lại trạng thái hàng chờ ngay sau đây nếu vẫn đang tìm
    if ($('online').open) watch(true);
  });
  O.on('close', () => {
    if (Q.searching) setSearching(false);
    watching = false;
    Q.lobby = null;
    renderLobby();
  });
  O.on('toast', (m) => {
    if (m.code !== 'match_found') return;
    window.CaroSound?.play('notify');
    navigator.vibrate?.(80);
  });

  // ------------------------------------------------------------ Sảnh phòng công khai
  function watch(on) {
    if (on === watching || !O.connected) return;
    watching = on;
    O.send({ t: 'lobbyWatch', on });
  }
  // Chỉ nhận danh sách khi bảng Online đang mở
  const dlg = $('online');
  new MutationObserver(() => watch(dlg.open)).observe(dlg, { attributes: true, attributeFilter: ['open'] });
  dlg.addEventListener('close', () => watch(false));

  O.on('lobby', (m) => { Q.lobby = m.rooms; renderLobby(); });

  function renderLobby() {
    const el = $('lobby-list');
    if (!O.connected || !Q.lobby) { el.innerHTML = `<li class="empty">${esc(T('lobby_offline'))}</li>`; return; }
    if (!Q.lobby.length) { el.innerHTML = `<li class="empty">${esc(T('lobby_empty'))}</li>`; return; }
    el.innerHTML = Q.lobby.map((r) => `
      <li><span class="st online"></span>
        <div class="pn"><b>${esc(r.host.name)}${r.host.rating ? ` <span class="rating">${esc(String(r.host.rating))}</span>` : ''}</b>
          <small>⏱ ${esc(r.timeLimit ? secs(r.timeLimit) : T('time_off'))}${r.host.rating ? '' : ' · ' + esc(T('guest'))}</small></div>
        <button type="button" class="primary sm" data-lobby-join="${esc(r.code)}">${esc(T('lobby_join'))}</button></li>`).join('');
    el.querySelectorAll('[data-lobby-join]').forEach((b) => {
      b.onclick = () => {
        if (O.roomActive() && !confirm(T('confirm_leave'))) return;
        O.send({ t: 'joinRoom', code: b.dataset.lobbyJoin });
      };
    });
  }

  window.CaroMatch = {
    /** Thẻ "đang tìm trận" nổi trên màn chơi (khi bảng Online đã đóng). */
    floatHtml() {
      if (!Q.searching) return '';
      return `<div class="invite qm-float"><span class="spinner" aria-hidden="true"></span>
        <div><b class="qm-time">${esc(statusText())}</b></div>
        <button type="button" class="ghost sm" data-qm-open>${esc(T('btn_online'))}</button>
        <button type="button" class="ghost sm" data-qm-cancel>${esc(T('cancel'))}</button></div>`;
    },
    get searching() { return Q.searching; },
  };

  window.addEventListener('langchange', () => { renderQuick(); renderLobby(); });
  renderQuick();
  renderLobby();
})();
