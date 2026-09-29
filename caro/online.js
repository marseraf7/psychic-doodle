/* Chế độ online: kết nối máy chủ, tài khoản, bạn bè, phòng chơi, thách đấu. */
(function () {
  'use strict';
  const App = window.CaroApp;
  const esc = App.esc;
  const T = window.I18N.t;
  /** Dịch thông báo của máy chủ theo mã; chưa có bản dịch thì dùng chữ máy chủ gửi. */
  const srv = (m) => (m.code && T('srv_' + m.code) !== 'srv_' + m.code ? T('srv_' + m.code, m.args || {}) : m.msg || '');
  const secs = (n) => T('per_move', { n });
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

  function connect() {
    if (!wsUrl || noServer || (ws && ws.readyState <= 1)) return;
    clearTimeout(retryTimer);
    S.status = 'connecting';
    render();
    try { ws = new WebSocket(wsUrl); } catch (e) { return scheduleRetry(); }
    ws.onopen = () => {
      retry = 0;
      // Tên khách mặc định theo ngôn ngữ đang chọn (vd. "Guest-3F2A"), nếu chưa tự đặt tên.
      const guestName = LS.get('caro.guestName') || `${T('guest')}-${guestKey.slice(0, 4).toUpperCase()}`;
      ws.send(JSON.stringify({ t: 'hello', token: LS.get('caro.token'), guestKey, guestName }));
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (handlers[m.t]) handlers[m.t](m);
      for (const fn of hooks[m.t] || []) fn(m); // phần mở rộng (social.js)
    };
    ws.onclose = () => {
      ws = null;
      S.status = 'offline';
      render();
      scheduleRetry();
    };
  }

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
    welcome(m) {
      S.status = 'online';
      S.me = m.me;
      S.googleClientId = m.googleClientId || '';
      S.resetEnabled = !!m.resetEnabled;
      if (m.me.guest) S.friends = { friends: [], incoming: [], outgoing: [] };
      setRoom(m.room);
      render();
      checkJoinLink();
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
    me(m) { S.me = m.me; render(); },
    friends(m) { S.friends = m; render(); },
    room(m) { setRoom(m.room); },
    invite(m) { S.invites.set(m.invite.id, m.invite); navigator.vibrate?.(60); renderInvites(); render(); },
    inviteSent(m) { S.sent = m.invite; closeDlg('challenge'); renderInvites(); },
    inviteGone(m) {
      S.invites.delete(m.id);
      if (S.sent && S.sent.id === m.id) S.sent = null;
      renderInvites();
      render();
    },
    toast(m) { toast(srv(m)); },
    error(m) {
      if (m.ctx === 'move') App.resync();
      const target = m.ctx === 'joinRoom' && isOpen('join') ? 'join-err'
        : ['login', 'register'].includes(m.ctx) && isOpen('auth') ? 'auth-err'
          : (window.CaroSocial && window.CaroSocial.errorTarget(m.ctx)) || null;
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
      if (!had && room.players.length < 2) setTimeout(openRoomInfo, 200);
      if (isOpen('room-info')) fillRoomInfo();
      if (!$('banner').hidden) showBanner();
      // Có lời xin hoà mới từ đối thủ
      if (room.drawOffer && room.drawOffer !== S.me.id && (!had || had.drawOffer !== room.drawOffer)) window.CaroSound?.play('notify');
    } else if (!room) {
      App.leaveOnline();
      closeDlg('room-info');
    }
    renderDraw();
    renderInvites();
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

  // ------------------------------------------------------------ Bảng Online
  const statusText = (st) => T('st_' + st);

  function render() {
    // Chấm đỏ trên nút Online khi có lời mời.
    const unread = S.friends.friends.reduce((n, f) => n + (f.unread || 0), 0);
    $('online-badge').hidden = !(S.invites.size || S.friends.incoming.length || unread);
    const conn = $('conn');
    conn.className = 'conn ' + S.status;
    conn.textContent = T(!wsUrl ? 'conn_none' : 'conn_' + S.status);
    renderAccount();
    renderFriends();
  }

  function renderAccount() {
    const el = $('account');
    const me = S.me;
    if (!wsUrl) {
      el.innerHTML = `<p class="hint">${esc(T('no_server_hint'))}</p>`;
      return;
    }
    if (!me) { el.innerHTML = `<p class="hint">${esc(T('connecting_hint'))}</p>`; return; }
    const avatar = `<span class="avatar">${esc((me.name || '?').trim().charAt(0).toUpperCase())}</span>`;
    if (me.guest) {
      el.innerHTML = `
        <div class="who">${avatar}<div><b>${esc(me.name)}</b><small>${esc(T('guest'))} · <a href="#" id="rename">${esc(T('rename'))}</a></small></div></div>
        <div class="row">
          <button type="button" class="primary" id="go-login">${esc(T('login'))}</button>
          <button type="button" class="ghost" id="go-register">${esc(T('register'))}</button>
        </div>
        <p class="hint">${esc(T('account_hint'))}</p>
        <div class="row">${S.status === 'online' ? `<button type="button" class="ghost sm" data-social="leaderboard">🏆 ${esc(T('leaderboard'))}</button>` : ''}</div>`;
      $('go-login').onclick = () => openAuth('login');
      $('go-register').onclick = () => openAuth('register');
    } else {
      const st = me.stats || { wins: 0, losses: 0, draws: 0 };
      el.innerHTML = `
        <div class="who">${avatar}<div><b>${esc(me.name)} <span class="rating">${esc(T('rating_short', { n: me.rating || 1200 }))}</span></b><small>@${esc(me.username)} · ${esc(T('stats3', { w: st.wins, l: st.losses, d: st.draws || 0 }))} · <a href="#" id="rename">${esc(T('rename'))}</a></small></div></div>
        <div class="row">
          <button type="button" class="ghost sm" data-social="history">🕘 ${esc(T('history'))}</button>
          <button type="button" class="ghost sm" data-social="leaderboard">🏆 ${esc(T('leaderboard'))}</button>
          <button type="button" class="ghost sm" data-social="account">⚙ ${esc(T('account_settings'))}</button>
        </div>
        <div class="row">
          ${me.google ? `<span class="tag">${esc(T('google_linked_tag'))}</span>` : googleAvailable() ? `<button type="button" class="ghost" id="link-google">${esc(T('link_google'))}</button>` : ''}
          <button type="button" class="ghost" id="logout">${esc(T('logout'))}</button>
        </div>
        <div id="google-link-btn"></div>`;
      $('logout').onclick = () => {
        if (roomActive() && !confirm(T('confirm_logout'))) return;
        send({ t: 'logout' });
      };
      const lg = $('link-google');
      if (lg) lg.onclick = () => { lg.hidden = true; mountGoogle($('google-link-btn')); };
    }
    el.querySelectorAll('[data-social]').forEach((b) => { b.onclick = () => window.CaroSocial && window.CaroSocial.open(b.dataset.social); });
    $('rename').onclick = (e) => {
      e.preventDefault();
      const name = prompt(T('rename_prompt'), me.name);
      if (name && name.trim()) {
        if (me.guest) LS.set('caro.guestName', name.trim());
        send({ t: 'setName', name: name.trim() });
      }
    };
  }

  function renderFriends() {
    const el = $('friends');
    if (!S.me || S.me.guest) {
      el.innerHTML = `<h3>${esc(T('friends'))}</h3><p class="hint">${esc(T('friends_login_hint'))}</p>`;
      return;
    }
    const f = S.friends;
    const order = { online: 0, playing: 1, offline: 2 };
    const list = [...f.friends].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
    const person = (p, extra) => {
      const h = p.h2h && p.h2h.wins + p.h2h.losses + p.h2h.draws
        ? ` · <span title="${esc(T('h2h_title'))}">${p.h2h.wins}–${p.h2h.losses}–${p.h2h.draws}</span>` : '';
      return `
      <li><span class="st ${p.status}" title="${esc(statusText(p.status))}"></span>
        <div class="pn"><b>${esc(p.name)}${p.rating ? ` <span class="rating">${esc(String(p.rating))}</span>` : ''}</b><small>@${esc(p.username)} · ${esc(statusText(p.status))}${h}</small></div>${extra}</li>`;
    };
    const onlineCount = f.friends.filter((p) => p.status !== 'offline').length;
    el.innerHTML = `
      <h3>${esc(T('friends'))} <small>${esc(T('friends_online', { on: onlineCount, all: f.friends.length }))}</small></h3>
      <form class="row" id="add-friend">
        <input name="u" placeholder="${esc(T('friend_username_ph'))}" autocapitalize="none" spellcheck="false" maxlength="21" required>
        <button class="primary">${esc(T('add_friend'))}</button>
      </form>
      ${f.incoming.length ? `<h4>${esc(T('friend_requests'))}</h4><ul class="people">${f.incoming.map((p) => person(p,
        `<button type="button" class="ghost sm" data-deny="${esc(p.id)}">${esc(T('decline'))}</button><button type="button" class="primary sm" data-accept="${esc(p.id)}">${esc(T('accept'))}</button>`)).join('')}</ul>` : ''}
      <ul class="people">${list.map((p) => person(p,
        `<button type="button" class="ghost sm icon chat-btn" data-chat="${esc(p.id)}" title="${esc(T('chat'))}" aria-label="${esc(T('chat'))}">💬${p.unread ? `<i class="count">${p.unread > 99 ? '99+' : p.unread}</i>` : ''}</button>
         <button type="button" class="primary sm" data-challenge="${esc(p.id)}" ${p.status === 'online' ? '' : 'disabled'}>${esc(T('challenge'))}</button>
         <button type="button" class="ghost sm icon" data-remove="${esc(p.id)}" title="${esc(T('unfriend'))}">✕</button>`)).join('') ||
        `<li class="empty">${esc(T('no_friends'))}</li>`}</ul>
      ${f.outgoing.length ? `<p class="hint">${esc(T('pending_friends', { names: f.outgoing.map((p) => p.name).join(', ') }))}</p>` : ''}`;
    $('add-friend').onsubmit = (e) => {
      e.preventDefault();
      const u = e.target.u.value.trim();
      if (u && send({ t: 'friendAdd', username: u })) e.target.reset();
    };
    el.querySelectorAll('[data-accept]').forEach((b) => { b.onclick = () => send({ t: 'friendRespond', id: b.dataset.accept, accept: true }); });
    el.querySelectorAll('[data-deny]').forEach((b) => { b.onclick = () => send({ t: 'friendRespond', id: b.dataset.deny, accept: false }); });
    el.querySelectorAll('[data-remove]').forEach((b) => {
      b.onclick = () => {
        const p = f.friends.find((x) => x.id === b.dataset.remove);
        if (p && confirm(T('confirm_unfriend', { name: p.name }))) send({ t: 'friendRemove', id: p.id });
      };
    });
    el.querySelectorAll('[data-chat]').forEach((b) => {
      b.onclick = () => window.CaroSocial && window.CaroSocial.openChat(f.friends.find((x) => x.id === b.dataset.chat));
    });
    el.querySelectorAll('[data-challenge]').forEach((b) => {
      b.onclick = () => {
        const p = f.friends.find((x) => x.id === b.dataset.challenge);
        S.challengeTo = p;
        $('ch-title').textContent = T('challenge_title', { name: p.name });
        openDlg('challenge');
      };
    });
  }

  $('challenge-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    if (S.challengeTo) send({ t: 'challenge', to: S.challengeTo.id, bestOf: Number(f.bo.value), first: f.first.value, timeLimit: Number(f.time.value) });
  };

  // ------------------------------------------------------------ Lời thách đấu
  function renderInvites() {
    let box = $('invites');
    if (!box) {
      box = document.createElement('div');
      box.id = 'invites';
      box.className = 'invites';
      document.body.appendChild(box);
    }
    // Thông tin trận: Bo3 · ai đi trước · thời gian mỗi nước
    const details = (inv, first) => [`Bo${inv.bestOf}`, first, inv.timeLimit ? '⏱ ' + secs(inv.timeLimit) : ''].filter(Boolean).join(' · ');
    let html = '';
    for (const inv of S.invites.values()) {
      const first = inv.first === 'random' ? T('first_random') : inv.first === 'me' ? T('first_name', { name: inv.from.name }) : T('first_you');
      html += `<div class="invite"><div><b>${esc(T('invite_from', { name: inv.from.name }))}</b><small>${esc(details(inv, first))}</small></div>
        <button type="button" class="ghost sm" data-no="${esc(inv.id)}">${esc(T('decline'))}</button>
        <button type="button" class="primary sm" data-yes="${esc(inv.id)}">${esc(T('receive'))}</button></div>`;
    }
    if (S.sent) {
      const s = S.sent;
      const first = s.first === 'random' ? T('first_random') : s.first === 'me' ? T('first_you') : T('first_name', { name: s.to.name });
      html += `<div class="invite"><div>${esc(T('waiting_accept', { name: s.to.name }))}<small>${esc(details(s, first))}</small></div>
        <button type="button" class="ghost sm" data-cancel-sent>${esc(T('cancel'))}</button></div>`;
    }
    const r = S.room;
    if (r && S.me && r.drawOffer && r.drawOffer !== S.me.id && !r.winner) {
      const opp = r.players.find((p) => p.id === r.drawOffer);
      html += `<div class="invite"><div><b>🤝 ${esc(T('draw_ask', { name: opp ? opp.name : T('opponent') }))}</b></div>
        <button type="button" class="ghost sm" data-draw="no">${esc(T('decline'))}</button>
        <button type="button" class="primary sm" data-draw="yes">${esc(T('accept'))}</button></div>`;
    }
    // Hiện cả trong bảng Online (hộp thoại đang mở che mất thẻ lời mời phía dưới)
    const inner = $('dlg-invites');
    box.innerHTML = html;
    inner.innerHTML = html;
    inner.hidden = !html;
    const all = (sel) => [...box.querySelectorAll(sel), ...inner.querySelectorAll(sel)];
    all('[data-draw]').forEach((b) => { b.onclick = () => send({ t: 'drawAnswer', accept: b.dataset.draw === 'yes' }); });
    all('[data-yes]').forEach((b) => {
      b.onclick = () => {
        if (roomActive() && !confirm(T('confirm_accept_busy'))) return;
        send({ t: 'challengeRespond', id: b.dataset.yes, accept: true });
      };
    });
    all('[data-no]').forEach((b) => {
      b.onclick = () => { send({ t: 'challengeRespond', id: b.dataset.no, accept: false }); S.invites.delete(b.dataset.no); renderInvites(); render(); };
    });
    all('[data-cancel-sent]').forEach((c) => { c.onclick = () => { send({ t: 'challengeCancel', id: S.sent.id }); S.sent = null; renderInvites(); }; });
  }

  // ------------------------------------------------------------ Đăng nhập / Google
  let authTab = 'login';
  function openAuth(tab) {
    authTab = tab;
    const f = $('auth-form');
    f.classList.toggle('register', tab === 'register');
    f.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('auth-submit').textContent = T(tab === 'login' ? 'login' : 'register');
    f.password.autocomplete = tab === 'login' ? 'current-password' : 'new-password';
    f.password.minLength = tab === 'login' ? 1 : 6;
    $('auth-err').textContent = '';
    const gb = $('google-box');
    gb.hidden = !googleAvailable();
    if (googleAvailable()) mountGoogle($('google-btn'));
    openDlg('auth');
  }
  $('auth-form').querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => openAuth(b.dataset.tab); });
  $('auth-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    $('auth-err').textContent = '';
    const msg = { t: authTab, username: f.username.value.trim().toLowerCase(), password: f.password.value };
    if (authTab === 'register') msg.name = f.name.value.trim();
    send(msg);
  };

  // Thư viện Google chỉ được tải khi máy chủ bật đăng nhập Google.
  let gisPromise = null;
  function loadGoogle() {
    if (!gisPromise) {
      gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => {
          window.google.accounts.id.initialize({
            client_id: S.googleClientId,
            callback: (r) => send({ t: 'google', credential: r.credential }),
          });
          resolve(window.google);
        };
        s.onerror = () => { gisPromise = null; reject(new Error('Không tải được Google')); };
        document.head.appendChild(s);
      });
    }
    return gisPromise;
  }
  // Trong ứng dụng điện thoại: Google chặn đăng nhập trong WebView, nên dùng tài khoản Google
  // trên máy (native.js) – vẫn gửi đúng ID token như bản web, máy chủ xác minh y hệt.
  const nativeApp = !!window.CaroNative;
  const googleAvailable = () => !!S.googleClientId && (!nativeApp || !!window.CaroNative.google);
  function mountGoogle(el) {
    if (nativeApp) return mountNativeGoogle(el);
    loadGoogle().then((g) => {
      el.innerHTML = '';
      g.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', locale: window.I18N.googleLocale, width: 260 });
    }).catch(() => { el.innerHTML = `<p class="hint">${esc(T('google_load_fail'))}</p>`; });
  }
  function mountNativeGoogle(el) {
    el.innerHTML = `<button type="button" class="ghost google-native"><span class="g">G</span> ${esc(T('google_continue'))}</button>`;
    const b = el.querySelector('button');
    b.onclick = async () => {
      b.disabled = true;
      try {
        const credential = await window.CaroNative.google.signIn(S.googleClientId);
        send({ t: 'google', credential });
      } catch (e) {
        // Người dùng tự huỷ thì im lặng; lỗi khác thì báo
        if (!/cancel/i.test(String(e && (e.message || e.code) || e))) toast(T('google_load_fail'));
      } finally { b.disabled = false; }
    };
  }


  // ------------------------------------------------------------ Phòng
  $('btn-online').onclick = () => { connect(); render(); openDlg('online'); };
  $('create-room').onclick = () => {
    const side = document.querySelector('input[name="room-side"]:checked').value;
    const timeLimit = Number(document.querySelector('input[name="room-time"]:checked').value);
    send({ t: 'createRoom', side, timeLimit });
  };
  $('open-join').onclick = () => openJoin('');

  function openJoin(code) {
    const f = $('join-form');
    f.code.value = code || '';
    f.password.value = '';
    $('join-err').textContent = '';
    openDlg('join');
    setTimeout(() => (code ? f.password : f.code).focus(), 50);
  }
  $('join-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    $('join-err').textContent = '';
    send({ t: 'joinRoom', code: f.code.value.trim(), password: f.password.value.trim() });
  };
  // Chỉ cho gõ số.
  ['code', 'password'].forEach((n) => {
    $('join-form')[n].addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
  });

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
    openJoin(code);
  }

  function inviteLink(code) {
    const u = new URL(base ? base + '/' : location.href);
    if (!base) { u.search = ''; u.hash = ''; }
    u.searchParams.set('room', code);
    return u.toString();
  }

  function fillRoomInfo() {
    const r = S.room;
    if (!r) return;
    $('room-title').textContent = r.kind === 'series' ? T('series_title', { n: r.bestOf }) : T('room_title');
    $('ri-time').textContent = '⏱ ' + (r.timeLimit ? secs(r.timeLimit) : T('time_off'));
    $('ri-code').textContent = r.code;
    $('ri-pass').textContent = r.password;
    $('ri-link').value = inviteLink(r.code);
    $('ri-link').closest('.link-row').hidden = r.kind === 'series';
    $('ri-share').hidden = r.kind === 'series' || !navigator.share;
    const friendIds = new Set(S.friends.friends.map((f) => 'u_' + f.id));
    const pending = new Set(S.friends.outgoing.map((f) => 'u_' + f.id));
    $('ri-players').innerHTML = r.players.map((p) => {
      const side = r.seats.x === p.id ? '<b class="x">X</b>' : '<b class="o">O</b>';
      const you = p.id === S.me.id;
      const canFriend = !you && !S.me.guest && p.id.startsWith('u_') && !friendIds.has(p.id);
      return `<li><span class="st ${p.online ? 'online' : 'offline'}"></span>${side}
        <div class="pn"><b>${esc(p.name)}${you ? ' ' + esc(T('you_tag')) : ''}${p.rating ? ` <span class="rating">${esc(String(p.rating))}</span>` : ''}</b><small>${esc(T('won_games', { n: r.score[p.id] || 0 }))}${r.rematch.includes(p.id) ? ' · ' + esc(T('wants_rematch_tag')) : ''}</small></div>
        ${canFriend ? (pending.has(p.id) ? `<small>${esc(T('friend_sent'))}</small>` : `<button type="button" class="ghost sm" data-add="${esc(p.id)}">${esc(T('add_friend'))}</button>`) : ''}
        ${!you && !S.me.guest && p.id.startsWith('u_') ? `<button type="button" class="ghost sm icon" data-report="${esc(p.id)}" title="${esc(T('report'))}" aria-label="${esc(T('report'))}">⚠</button>` : ''}</li>`;
    }).join('') + (r.players.length < 2 ? `<li class="empty">${esc(T('waiting_join'))}</li>` : '');
    // Thành tích đối đầu (tính theo mình)
    const h = r.h2h;
    const meX = r.seats.x === S.me.id;
    $('ri-h2h').textContent = h && (h.wins + h.losses + h.draws)
      ? T('h2h_line', meX ? { w: h.wins, l: h.losses, d: h.draws } : { w: h.losses, l: h.wins, d: h.draws }) : '';
    $('ri-players').querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => send({ t: 'friendAdd', id: b.dataset.add }); });
    $('ri-players').querySelectorAll('[data-report]').forEach((b) => {
      b.onclick = () => window.CaroSocial && window.CaroSocial.openReport(b.dataset.report, r.players.find((p) => p.id === b.dataset.report).name);
    });
  }
  function openRoomInfo() { fillRoomInfo(); openDlg('room-info'); }

  $('ri-copy').onclick = async () => {
    const link = $('ri-link').value;
    try { await navigator.clipboard.writeText(link); }
    catch (e) { $('ri-link').select(); document.execCommand('copy'); }
    toast(T('copied'));
  };
  $('ri-share').onclick = () => {
    navigator.share({ title: T('app_title'), text: T('share_text', { code: S.room.code }), url: inviteLink(S.room.code) }).catch(() => {});
  };

  $('btn-room').onclick = openRoomInfo;
  $('btn-center2').onclick = () => $('btn-center').click();
  $('btn-resign').onclick = () => {
    const r = S.room;
    if (!r || r.players.length < 2 || r.winner) return toast(T('no_game'));
    if (confirm(T('confirm_resign'))) send({ t: 'resign' });
  };
  // Xin hoà: chỉ khi ván đang diễn ra; đã xin thì chờ đối thủ trả lời.
  function renderDraw() {
    const r = S.room;
    const b = $('btn-draw');
    const live = !!(r && S.me && r.players.length === 2 && !r.winner && !(r.kind === 'series' && r.seriesWinner));
    const mine = live && r.drawOffer === S.me.id;
    b.disabled = !live || mine;
    $('btn-draw-label').textContent = T(mine ? 'draw_sent' : 'btn_draw');
  }
  $('btn-draw').onclick = () => {
    const r = S.room;
    if (!r || r.players.length < 2 || r.winner) return toast(T('no_game'));
    send({ t: 'drawOffer' });
  };

  // Đang có ván dở (đã có nước đi) – rời đi sẽ bị xử thua.
  function roomActive() {
    const r = S.room;
    return !!(r && r.players.length === 2 && !r.winner && r.moves.length);
  }

  function leaveRoom() {
    if (roomActive() && !confirm(T('confirm_leave'))) return;
    if (!send({ t: 'leaveRoom' })) {
      // Mất kết nối: vẫn cho quay về chơi cục bộ.
      S.room = null;
      App.leaveOnline();
    }
  }
  $('btn-leave').onclick = leaveRoom;
  $('banner-leave').onclick = leaveRoom;
  $('banner-rematch').onclick = () => send({ t: 'rematch' });

  // ------------------------------------------------------------ Kết thúc ván
  function showBanner() {
    const r = S.room;
    if (!r || !r.winner || !S.me) return;
    const me = S.me.id;
    const draw = r.winner === 3;
    const winnerId = r.winner === 1 ? r.seats.x : r.seats.o;
    const won = winnerId === me;
    const opp = r.players.find((p) => p.id !== me);
    const oppName = opp ? opp.name : T('opponent');
    let title = T(draw ? 'draw_title' : won ? 'you_win' : 'lost');
    let sub = '';
    // Lý do kết thúc khác (đầu hàng, rời phòng, mất kết nối, hết giờ): nói ai là người thua.
    if (draw) sub = T('r_draw');
    else if (r.reason && r.reason !== 'win') sub = won ? T(`r_${r.reason}_opp`, { name: oppName }) : T(`r_${r.reason}_you`);
    const score = `${r.score[me] || 0} – ${opp ? r.score[opp.id] || 0 : 0}`;
    let rematch = true;
    if (r.kind === 'series') {
      if (r.seriesWinner) {
        title = r.seriesWinner === me ? T('series_won', { score }) : T('series_lost', { name: oppName, score });
      } else {
        sub = (sub ? sub + ' · ' : '') + T('score_is', { score }) + ' · ' + T('next_game', { n: r.gameNo + 1 });
        rematch = false;
      }
    } else {
      sub = (sub ? sub + ' · ' : '') + T('score_is', { score });
    }
    if (r.unrated) sub = (sub ? sub + ' · ' : '') + T('unrated');
    if (!opp) { sub = T('opp_left'); rematch = false; }
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    const btn = $('banner-rematch');
    btn.hidden = !rematch;
    const mine = r.rematch.includes(me), theirs = opp && r.rematch.includes(opp.id);
    btn.disabled = mine;
    btn.textContent = T(mine ? 'waiting_rematch' : theirs ? 'accept_rematch' : 'rematch');
    $('banner-share').hidden = !r.share;
    $('banner').hidden = false;
  }
  $('banner-share').onclick = () => {
    const r = S.room;
    if (!r || !r.share) return;
    const x = r.players.find((p) => p.id === r.seats.x), o = r.players.find((p) => p.id === r.seats.o);
    shareReplay({ share: r.share, x: x ? x.name : 'X', o: o ? o.name : 'O' });
  };

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
      return navigator.share({ title: T('app_title'), text: T('replay_share_text', { x: g.x, o: g.o }), url }).catch(() => {});
    }
    try { await navigator.clipboard.writeText(url); } catch (e) { prompt(T('share_game'), url); return; }
    toast(T('replay_copied'));
  }
  /** Tải ván đã lưu từ máy chủ rồi mở chế độ xem lại. */
  async function openReplay(share) {
    if (!base || noServer) return toast(T('replay_offline'));
    if (App.online) return toast(T('replay_leave_room'));
    let data;
    try {
      const r = await fetch(base + '/api/replay/' + encodeURIComponent(share), { cache: 'no-store' });
      if (r.status === 404) return toast(T('replay_not_found'));
      if (!r.ok) throw new Error();
      data = await r.json();
    } catch (e) { return toast(T('replay_offline')); }
    closeDlg('history');
    closeDlg('online');
    App.openReplay(data);
  }

  window.CaroOnline = {
    send, showBanner, shareReplay, openReplay, on, toast, openDlg, closeDlg, isOpen, render, srv, state: S,
    get connected() { return S.status === 'online'; },
  };

  // Đổi ngôn ngữ: vẽ lại các phần do JS tạo ra.
  window.addEventListener('langchange', () => {
    render();
    renderInvites();
    renderDraw();
    if (isOpen('room-info')) fillRoomInfo();
    if (isOpen('challenge') && S.challengeTo) $('ch-title').textContent = T('challenge_title', { name: S.challengeTo.name });
    if (isOpen('auth')) $('auth-submit').textContent = T(authTab === 'login' ? 'login' : 'register');
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
    if (wsUrl && (LS.get('caro.token') || LS.get('caro.inRoom') || pendingLink)) connect();
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
