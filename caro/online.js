/*
 * Chế độ online – lõi: kết nối máy chủ (WebSocket, ping, kết nối lại), tin nhắn từ máy chủ, hộp thoại / toast chung,
 * bảng Online, link mời / link xem lại, window.CaroOnline. Tài khoản, bạn bè + lời mời, phòng chơi nằm ở
 * online-auth.js, online-friends.js, online-room.js (nạp trước file này; gọi một lần ở mục "Các phần").
 */
(function () {
  'use strict';
  const App = window.CaroApp;
  const esc = App.esc;
  const T = window.I18N.t;
  /** Dịch thông báo của máy chủ theo mã; chưa có bản dịch thì dùng chữ máy chủ gửi. */
  const srv = (m) => (m.code && T('srv_' + m.code) !== 'srv_' + m.code ? T('srv_' + m.code, m.args || {}) : m.msg || '');
  const $ = (id) => document.getElementById(id);

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* riêng tư */ } },
  };

  function randomKey() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let guestKey = LS.get('caro.guestKey');
  if (!guestKey) { guestKey = randomKey(); LS.set('caro.guestKey', guestKey); }

  const base = (window.CARO_SERVER || (location.protocol.startsWith('http') ? location.origin : '')).replace(/\/+$/, '');
  const wsUrl = base ? base.replace(/^http/, 'ws') + '/ws' : '';

  const S = {
    status: 'offline', // 'connecting' | 'online' | 'offline'
    me: null,
    googleClientId: '',
    friends: { friends: [], incoming: [], outgoing: [] },
    room: null,
    invites: new Map(), // lời thách đấu nhận được
    sent: null, // lời thách đấu mình gửi đang chờ
    challengeTo: null,
  };

  // ------------------------------------------------------------ Kết nối
  let ws = null, retry = 0, retryTimer = 0;
  let noServer = false; // true khi chạy trên hosting tĩnh, không có máy chủ game
  let serverChecked = false; // đã hỏi xong máy chủ (start() đã chạy)
  let outdated = null; // app điện thoại quá cũ: { min, url } – không kết nối online nữa, vẫn chơi offline

  function connect() {
    if (!wsUrl || noServer || outdated || (ws && ws.readyState <= 1)) return;
    clearTimeout(retryTimer);
    S.status = 'connecting';
    render();
    try { ws = new WebSocket(wsUrl); } catch (e) { return scheduleRetry(); }
    ws.onopen = () => {
      retry = 0;
      misses = 0;
      noPing = false; // kết nối mới: máy chủ có thể đã được cập nhật
      // Mở được kết nối mà quá 10 giây chưa có "welcome" (tin hello bị mất): kết nối lại
      const w = ws;
      setTimeout(() => { if (ws === w && S.status !== 'online') dropped(1000); }, 10000);
      // Tên khách mặc định theo ngôn ngữ đang chọn (vd. "Guest-3F2A"), nếu chưa tự đặt tên.
      const guestName = LS.get('caro.guestName') || `${T('guest')}-${guestKey.slice(0, 4).toUpperCase()}`;
      // Bản app điện thoại gửi kèm phiên bản để máy chủ báo khi cần cập nhật
      const client = { platform: (window.CaroNative && window.CaroNative.platform) || 'web', version: window.CARO_APP_VERSION || null, tz: -new Date().getTimezoneOffset() };
      ws.send(JSON.stringify({ t: 'hello', token: LS.get('caro.token'), guestKey, guestName, client }));
    };
    ws.onmessage = (e) => {
      lastHeard = Date.now();
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (handlers[m.t]) handlers[m.t](m);
      for (const fn of hooks[m.t] || []) fn(m); // phần mở rộng (social.js)
    };
    ws.onclose = () => dropped(0);
  }

  /** Mất kết nối (máy chủ đóng, hoặc ping không được trả lời): báo offline, hẹn kết nối lại. */
  function dropped(delay) {
    if (!ws) return;
    const old = ws;
    ws = null;
    old.onopen = old.onmessage = old.onclose = old.onerror = null;
    try { old.close(); } catch (e) { /* đã đóng */ }
    S.status = 'offline';
    for (const fn of hooks.close || []) fn();
    render();
    if (delay === 0) scheduleRetry();
    else { retry = 0; clearTimeout(retryTimer); retryTimer = setTimeout(connect, delay); }
  }

  // Kết nối "chết lặng" (đổi Wi-Fi ↔ 4G, mạng chập chờn): WebSocket vẫn coi là mở nhưng không còn tin nào qua lại.
  // Như Lichess: ping định kỳ, không nghe gì từ máy chủ thì chủ động kết nối lại (thay vì chờ hàng phút).
  // Chỉ ngắt khi trượt 2 lần liên tiếp, và bỏ qua lần mà hẹn giờ chạy trễ (máy chậm / luồng chính bận: tin pong
  // có thể đang xếp hàng phía sau) – tránh cắt nhầm kết nối vẫn tốt.
  const PING_MS = 10000, PONG_MS = 6000, LATE_MS = 2000;
  let lastHeard = 0, misses = 0, lastPing = 0, noPing = false, pingOut = 0; // pingOut: lần ping đang chờ pong (đo PING)
  function ping() {
    if (noPing || !ws || ws.readyState !== 1 || S.status !== 'online' || document.hidden) return;
    const sent = lastPing = pingOut = Date.now();
    try { ws.send('{"t":"ping"}'); } catch (e) { return dropped(100); }
    const w = ws;
    setTimeout(() => {
      if (ws !== w) return;
      if (lastHeard >= sent || Date.now() - sent > PONG_MS + LATE_MS) { misses = 0; return; }
      if (++misses >= 2) { misses = 0; dropped(100); }
    }, PONG_MS);
  }
  setInterval(ping, PING_MS);

  function scheduleRetry() {
    clearTimeout(retryTimer);
    const delay = Math.min(15000, 1000 * Math.pow(2, retry++));
    retryTimer = setTimeout(connect, delay);
  }

  function send(m) {
    if (ws && ws.readyState === 1 && S.status === 'online') { ws.send(JSON.stringify(m)); return true; }
    toast(T('not_connected'));
    connect();
    return false;
  }

  // Mở lại app trên điện thoại: kết nối lại ngay, không chờ hẹn giờ.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !ws) { retry = 0; connect(); } });
  window.addEventListener('online', () => { retry = 0; connect(); });

  // ------------------------------------------------------------ Tin nhắn từ máy chủ
  const hooks = {};
  const on = (t, fn) => { (hooks[t] = hooks[t] || []).push(fn); };
  const handlers = {
    // Biết kết nối còn sống (lastHeard); kèm PING (rtt) và số liệu máy chủ cho Cài đặt nhanh / số người online (topbar.js)
    pong(m) { m.rtt = pingOut ? Date.now() - pingOut : S.net && S.net.rtt; pingOut = 0; S.net = m; },
    welcome(m) {
      S.status = 'online';
      S.me = m.me;
      S.googleClientId = m.googleClientId || '';
      S.resetEnabled = !!m.resetEnabled;
      if (m.me.guest) S.friends = { friends: [], incoming: [], outgoing: [] };
      setRoom(m.room);
      render();
      checkJoinLink();
      setTimeout(ping, 300); // số liệu sảnh, PING có ngay (không chờ 10 giây)
    },
    auth(m) {
      LS.set('caro.token', m.token);
      closeDlg('auth');
      toast(T('login_ok'));
    },
    loggedOut() {
      LS.set('caro.token', null);
      S.me = null;
      S.invites.clear();
      if (ws) ws.close(); // kết nối lại với tư cách khách
    },
    accountDeleted() {
      handlers.loggedOut();
      S.friends = { friends: [], incoming: [], outgoing: [] };
      ['account-dlg', 'chat', 'history', 'report'].forEach(closeDlg);
      toast(T('account_deleted'), 5000);
    },
    updateRequired(m) {
      // Chỉ nhận link https (L-F2): máy chủ lạ / bị chiếm không đẩy được javascript: hay data: vào nút "Cập nhật"
      let url = '';
      try { const u = new URL(String(m.url || '')); if (u.protocol === 'https:') url = u.href; } catch (e) { /* không phải link */ }
      outdated = { min: m.min, url };
      S.status = 'offline';
      if (ws) ws.close();
      render();
      toast(T('update_required'), 6000);
    },
    me(m) { S.me = m.me; render(); },
    friends(m) { S.friends = m; render(); },
    room(m) {
      if (m.watch) return; // phòng đang xem: watch.js xử lý
      probing = null;
      setRoom(m.room);
    },
    invite(m) { S.invites.set(m.invite.id, m.invite); navigator.vibrate?.(60); ctx.renderInvites(); render(); },
    inviteSent(m) { S.sent = m.invite; closeDlg('challenge'); ctx.renderInvites(); },
    inviteGone(m) {
      S.invites.delete(m.id);
      if (S.sent && S.sent.id === m.id) S.sent = null;
      ctx.renderInvites();
      render();
    },
    toast(m) { toast(srv(m)); },
    error(m) {
      // Máy chủ cũ (chưa có lệnh ping – bản web được cập nhật trước máy chủ): thôi ping, không báo lỗi cho người chơi.
      // Máy chủ cũ không gửi kèm ctx nên nhận ra bằng thời điểm: lỗi "unsupported" ngay sau một lần ping.
      if (m.code === 'unsupported' && (m.ctx === 'ping' || (!m.ctx && Date.now() - lastPing < PONG_MS))) { noPing = true; return; }
      if (m.ctx === 'move') App.resync();
      if (m.code === 'too_fast' && ['watch', 'profile'].includes(m.ctx)) return; // bấm dồn: bỏ qua lần thừa
      if (m.ctx === 'evalGet' || m.ctx === 'evalPut') return; // bộ nhớ điểm dùng chung (eval-cloud.js) chạy ngầm: không báo
      // Mở bằng link mời: phòng công khai vào thẳng, phòng riêng (sai/thiếu mật khẩu) thì hỏi mật khẩu
      if (m.ctx === 'joinRoom' && probing) {
        const code = probing;
        probing = null;
        if (m.code === 'wrong_room_password') return openJoin(code);
      }
      const target = m.ctx === 'joinRoom' && isOpen('join') ? 'join-err'
        : ['login', 'register'].includes(m.ctx) && isOpen('auth') ? 'auth-err'
          : (window.CaroSocial && window.CaroSocial.errorTarget(m.ctx)) || (window.CaroTour && window.CaroTour.errorTarget(m.ctx)) || null;
      if (target) $(target).textContent = srv(m);
      else toast(srv(m));
    },
  };

  function setRoom(room) {
    const had = S.room;
    S.room = room;
    LS.set('caro.inRoom', room ? '1' : null); // tải lại trang thì tự vào lại phòng
    if (room && S.me) {
      App.applyRoom(room, S.me.id);
      closeDlg('online');
      closeDlg('join');
      if (!had && room.players.length < 2) setTimeout(ctx.openRoomInfo, 200);
      if (isOpen('room-info')) ctx.fillRoomInfo();
      if (!$('banner').hidden) ctx.showBanner();
      // Có lời xin hoà mới từ đối thủ
      if (room.drawOffer && room.drawOffer !== S.me.id && (!had || had.drawOffer !== room.drawOffer)) window.CaroSound?.play('notify');
    } else if (!room) {
      App.leaveOnline();
      closeDlg('room-info');
    }
    ctx.renderDraw();
    ctx.renderInvites();
  }

  // ------------------------------------------------------------ Hộp thoại
  const isOpen = (id) => $(id).open;
  function openDlg(id) {
    const d = $(id);
    if (d.open) return;
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function closeDlg(id) {
    const d = $(id);
    if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); }
  }
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closeDlg(b.closest('dialog').id); });
  // Chạm ra ngoài hộp thoại để đóng.
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) closeDlg(d.id); }));

  function toast(msg, ms = 3200) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 300);
  }

  // ------------------------------------------------------------ Các phần trong file riêng
  // online-auth.js (tài khoản, đăng nhập), online-friends.js (bạn bè, thách đấu, lời mời), online-room.js (phòng, kết thúc
  // ván). Mỗi phần nhận ctx: trạng thái + hàm chung; hàm các phần trả về được gắn thêm vào ctx để gọi chéo nhau.
  const ctx = {
    S, LS, base, wsUrl, send, toast, openDlg, closeDlg, isOpen, render, shareReplay,
    get outdated() { return outdated; },
  };
  Object.assign(ctx, window.CaroOnlineAuth(ctx), window.CaroOnlineFriends(ctx), window.CaroOnlineRoom(ctx));

  // ------------------------------------------------------------ Bảng Online
  function render() {
    // Chấm đỏ trên nút Online khi có lời mời.
    const unread = S.friends.friends.reduce((n, f) => n + (f.unread || 0), 0);
    $('online-badge').hidden = !(S.invites.size || S.friends.incoming.length || unread);
    const conn = $('conn');
    conn.className = 'conn ' + S.status;
    conn.textContent = T(!wsUrl ? 'conn_none' : outdated ? 'conn_outdated' : 'conn_' + S.status);
    $('create-room').disabled = $('open-join').disabled = !!outdated;
    document.querySelectorAll('#qm-grid .qm-tile').forEach((b) => { b.disabled = !!outdated; });
    ctx.renderAccount();
    ctx.renderFriends();
    window.dispatchEvent(new CustomEvent('caro:online')); // thanh trên (topbar.js): đăng nhập / ảnh đại diện
  }

  $('btn-online').onclick = () => { connect(); render(); openDlg('online'); };

  // Mở bằng link mời: ?room=123456 -> hỏi mật khẩu.
  let pendingLink = new URLSearchParams(location.search).get('room');
  function checkJoinLink() {
    if (!pendingLink) return;
    const code = pendingLink.replace(/\D/g, '').slice(0, 6);
    pendingLink = null;
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
    if (S.room && S.room.code === code) return;
    probing = code;
    send({ t: 'joinRoom', code }); // không gửi mật khẩu: phòng công khai thì vào luôn
  }
  let probing = null;

  // ------------------------------------------------------------ Link xem lại ván
  function replayLink(share) {
    const u = new URL(base ? base + '/' : location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('replay', share);
    return u.toString();
  }
  async function shareReplay(g) {
    const url = replayLink(g.share);
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      return navigator.share({ title: T('app_title'), text: T('replay_share_text', { x: g.x || T('deleted_player'), o: g.o || T('deleted_player') }), url }).catch(() => {});
    }
    try { await navigator.clipboard.writeText(url); } catch (e) { prompt(T('share_game'), url); return; }
    toast(T('replay_copied'));
  }
  /** Ván đã lưu trên máy chủ: dữ liệu, 'missing' (không còn) hoặc null (lỗi mạng). Dùng cả cho "Lưu về máy" (history.js). */
  async function fetchReplay(share) {
    if (!base || noServer) return null;
    try {
      const r = await fetch(base + '/api/replay/' + encodeURIComponent(share), { cache: 'no-store' });
      if (r.status === 404) return 'missing';
      if (!r.ok) throw new Error();
      return await r.json();
    } catch (e) { return null; }
  }
  /** Tải ván đã lưu từ máy chủ rồi mở chế độ xem lại. */
  async function openReplay(share) {
    if (!base || noServer) return toast(T('replay_offline'));
    if (App.online) return toast(T('replay_leave_room'));
    const data = await fetchReplay(share);
    if (data === 'missing') return toast(T('replay_not_found'));
    if (!data) return toast(T('replay_offline'));
    closeDlg('history');
    closeDlg('online');
    return App.openReplay(data);
  }

  // Chính sách quyền riêng tư: trong app mở trang trên máy chủ (trình duyệt), trên web mở trang cùng thư mục
  const privacyUrl = window.CaroNative && base ? base + '/privacy.html' : 'privacy.html';
  document.querySelectorAll('.privacy-link').forEach((a) => { a.href = privacyUrl; });
  // Trang giấy phép mã nguồn mở (Rapfi GPL-3 …): như trang quyền riêng tư, app mở bản trên máy chủ
  document.querySelectorAll('.licenses-link').forEach((a) => { a.href = privacyUrl.replace('privacy.html', 'licenses.html'); });

  window.CaroOnline = {
    send, base, openAuth: ctx.openAuth, showBanner: ctx.showBanner, shareReplay, renderInvites: ctx.renderInvites, roomActive: ctx.roomActive, openReplay, fetchReplay, on, toast, openDlg, closeDlg, isOpen, render, srv, state: S,
    /** Kết nối (khi mở Trang chủ / Xem) – chỉ sau khi đã biết có máy chủ game. */
    connect: () => { if (serverChecked) connect(); },
    get connected() { return S.status === 'online'; },
  };

  // Đổi ngôn ngữ: vẽ lại các phần do JS tạo ra.
  window.addEventListener('langchange', () => {
    render();
    ctx.renderInvites();
    ctx.renderDraw();
    if (isOpen('room-info')) ctx.fillRoomInfo();
    if (isOpen('challenge') && S.challengeTo) $('ch-title').textContent = T('challenge_title', { name: S.challengeTo.name });
    ctx.authLabel();
  });

  // Mở bằng link xem lại: ?replay=<mã>
  let pendingReplay = new URLSearchParams(location.search).get('replay');
  function checkReplayLink() {
    if (!pendingReplay) return;
    const share = pendingReplay;
    pendingReplay = null;
    const url = new URL(location.href);
    url.searchParams.delete('replay');
    history.replaceState(null, '', url);
    if (noServer) toast(T('replay_offline'));
    else openReplay(share);
  }

  // Kết nối sẵn khi có tài khoản (để bạn bè thấy mình online), đang ở trong phòng, hoặc mở bằng link mời.
  function start() {
    serverChecked = true;
    // (?t= / ?club=: link giải đấu / câu lạc bộ; đang ở Trang chủ / Xem: cần danh sách trận, sảnh)
    const page = window.CaroShell && window.CaroShell.current;
    if (wsUrl && (LS.get('caro.token') || LS.get('caro.inRoom') || pendingLink || /[?&](t|club)=/.test(location.search) || page === 'home' || page === 'watch')) connect();
    render();
    checkReplayLink();
  }

  // Bản chỉ có file tĩnh (GitHub Pages, mở file trực tiếp): không có máy chủ -> ẩn chế độ online.
  function offlineOnly() {
    noServer = true;
    document.body.classList.add('no-online');
    if (pendingLink) toast(T('offline_only_link'));
    checkReplayLink();
  }

  if (!wsUrl) offlineOnly();
  else if (window.CARO_SERVER) start();
  else {
    // Chỉ máy chủ của game mới trả lời /healthz. Nhận 404 = đang chạy trên hosting tĩnh.
    // Lỗi mạng (máy chủ tạm sập) thì vẫn giữ chế độ online.
    fetch(base + '/healthz', { cache: 'no-store' })
      .then((r) => (r.status === 404 ? offlineOnly() : start()))
      .catch(start);
  }
})();
