/* Tìm trận nhanh và sảnh phòng công khai (dùng chung kết nối của online.js). */
(function () {
  'use strict';
  const O = window.CaroOnline;
  if (!O) return;
  const T = window.I18N.t;
  const esc = window.CaroApp.esc;
  const $ = (id) => document.getElementById(id);

  const Q = { searching: false, since: 0, lobby: null };
  let ticker = 0;
  let watching = false;
  // Ý định tìm trận: còn bật từ lúc bấm tìm tới khi người chơi huỷ hoặc máy chủ báo hết tìm (đã ghép /
  // bị bỏ khỏi hàng chờ). Rớt WebSocket là máy chủ bỏ hàng chờ ngay, nên nối lại mà cờ còn bật thì máy
  // khách tự gửi lại yêu cầu tìm — giữ trong bộ nhớ, chỉ cho ca rớt kết nối (không gồm tải lại trang).
  let resumeSearch = false;

  const waited = () => {
    const s = Math.max(0, Math.floor((Date.now() - Q.since) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const statusText = () => T('qm_searching', { t: waited() });

  // ------------------------------------------------------------ Tìm trận nhanh
  // Ô vừa chọn trên lưới "Chơi nhanh" (dùng lại cho nút "Tìm trận khác" trên thẻ kết quả)
  Q.time = -1;
  Q.clock = null; // đồng hồ tổng '3+2' (ô đồng hồ) hoặc null (ô giới hạn mỗi nước)
  function start(time, clock) {
    if (O.roomActive() && !confirm(T('confirm_leave'))) return;
    if (typeof time === 'number') { Q.time = time; Q.clock = clock || null; }
    resumeSearch = true;
    O.send({ t: 'quickMatch', timeLimit: Q.time, clock: Q.clock });
  }
  const tileOn = (b) => Q.searching && Number(b.dataset.time) === Q.time && (b.dataset.clock || null) === Q.clock;
  document.querySelectorAll('#qm-grid .qm-tile[data-time]').forEach((b) => { b.onclick = () => start(Number(b.dataset.time), b.dataset.clock); });
  $('qm-cancel').onclick = () => { resumeSearch = false; O.send({ t: 'quickCancel' }); };
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
  // Đang bị cấm tìm trận (bỏ ván nhiều – server/src/hub/playban.js): máy chủ gửi số ms còn lại trong me.playban.
  // Hiện ngay dưới lưới ô kèm đếm ngược và khoá các ô – trước đây chỉ có một thông báo lúc kết nối, ô vẫn trông như
  // bình thường nên người chơi không biết mình còn bị cấm bao lâu (loi-14).
  let banUntil = 0, banTicker = 0;
  const banLeft = () => Math.max(0, banUntil - Date.now());
  function setBan(me) {
    banUntil = me && me.playban > 0 ? Date.now() + me.playban : 0;
    clearInterval(banTicker);
    if (banUntil) banTicker = setInterval(() => { if (!banLeft()) clearInterval(banTicker); renderBan(); }, 1000);
    renderBan();
  }
  function renderBan() {
    const left = banLeft(), el = $('qm-ban');
    const s = Math.ceil(left / 1000);
    el.hidden = !left;
    el.textContent = left ? T('qm_banned', { t: Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }) : '';
    document.querySelectorAll('#qm-grid .qm-tile[data-time]').forEach((b) => { b.disabled = !!left; });
    $('banner-quick').disabled = Q.searching || !!left;
  }
  O.on('me', (m) => setBan(m.me));

  function renderQuick() {
    document.querySelectorAll('#qm-grid .qm-tile[data-time]').forEach((b) => {
      b.classList.toggle('on', tileOn(b));
      b.setAttribute('aria-pressed', String(tileOn(b)));
    });
    $('qm-grid').classList.toggle('searching', Q.searching);
    $('qm-search').hidden = !Q.searching;
    $('qm-status').textContent = Q.searching ? statusText() : '';
    $('banner-quick').textContent = T(Q.searching ? 'qm_searching_short' : 'qm_again');
    renderBan();
  }

  O.on('queue', (m) => {
    if (m.state === 'searching' && typeof m.timeLimit === 'number') { Q.time = m.timeLimit; Q.clock = m.clock || null; } // ô đang tìm (cả sau khi kết nối lại)
    if (m.state !== 'searching') resumeSearch = false; // máy chủ đã kết thúc tìm: đã ghép, bị bỏ, hoặc đã huỷ
    setSearching(m.state === 'searching');
  });
  O.on('welcome', (m) => {
    setBan(m.me);
    // Rớt kết nối là máy chủ bỏ hàng chờ ngay (wentOffline → dequeue), còn welcome chỉ gửi lại trạng
    // thái hàng chờ khi VẪN còn trong hàng chờ — câu "gửi lại ngay sau đây" trước đây là sai, và đó là
    // gốc của lỗi hàng chờ tự tắt lặng lẽ sau 1–5 phút (buổi kiểm thử 25/10). Đang có ý định tìm trận
    // thì tự gửi lại quickMatch với đúng ô đã chọn (máy chủ giữ nguyên mốc chờ khi trùng ô). Gửi lại
    // mà bị từ chối (đang bị cấm tìm trận…) thì máy chủ trả lỗi hiện thành toast — không lặng lẽ nữa.
    if (resumeSearch && !O.roomActive()) O.send({ t: 'quickMatch', timeLimit: Q.time, clock: Q.clock });
    else { resumeSearch = false; setSearching(false); }
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
          <small>⏱ ${esc(window.I18N.tc(r.timeLimit, r.clock))}${r.opening === 'swap2' ? ' · Swap2' : ''}${esc(window.I18N.ruleTag(r.rule))}${r.host.rating ? '' : ' · ' + esc(T('guest'))}</small></div>
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
