/* Chế độ online: kết nối máy chủ, tài khoản, bạn bè, phòng chơi, thách đấu. */
(function () {
  'use strict';
  const App = window.CaroApp;
  const esc = App.esc;
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

  function connect() {
    if (!wsUrl || (ws && ws.readyState <= 1)) return;
    clearTimeout(retryTimer);
    S.status = 'connecting';
    render();
    try { ws = new WebSocket(wsUrl); } catch (e) { return scheduleRetry(); }
    ws.onopen = () => {
      retry = 0;
      ws.send(JSON.stringify({ t: 'hello', token: LS.get('caro.token'), guestKey, guestName: LS.get('caro.guestName') }));
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      (handlers[m.t] || (() => {}))(m);
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
    toast('Chưa kết nối được máy chủ online');
    connect();
    return false;
  }

  // Mở lại app trên điện thoại: kết nối lại ngay, không chờ hẹn giờ.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !ws) { retry = 0; connect(); } });
  window.addEventListener('online', () => { retry = 0; connect(); });

  // ------------------------------------------------------------ Tin nhắn từ máy chủ
  const handlers = {
    welcome(m) {
      S.status = 'online';
      S.me = m.me;
      S.googleClientId = m.googleClientId || '';
      if (m.me.guest) S.friends = { friends: [], incoming: [], outgoing: [] };
      setRoom(m.room);
      render();
      checkJoinLink();
    },
    auth(m) {
      LS.set('caro.token', m.token);
      closeDlg('auth');
      toast('Đăng nhập thành công');
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
    toast(m) { toast(m.msg); },
    error(m) {
      if (m.ctx === 'move') App.resync();
      const target = m.ctx === 'joinRoom' && isOpen('join') ? 'join-err'
        : ['login', 'register'].includes(m.ctx) && isOpen('auth') ? 'auth-err' : null;
      if (target) $(target).textContent = m.msg;
      else toast(m.msg);
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
    } else if (!room) {
      App.leaveOnline();
      closeDlg('room-info');
    }
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
  const STATUS_TEXT = { online: 'Online', playing: 'Đang chơi', offline: 'Offline' };

  function render() {
    // Chấm đỏ trên nút Online khi có lời mời.
    $('online-badge').hidden = !(S.invites.size || S.friends.incoming.length);
    const conn = $('conn');
    conn.className = 'conn ' + S.status;
    conn.textContent = !wsUrl ? 'Không có máy chủ' : S.status === 'online' ? 'Đã kết nối' : S.status === 'connecting' ? 'Đang kết nối…' : 'Mất kết nối';
    renderAccount();
    renderFriends();
  }

  function renderAccount() {
    const el = $('account');
    const me = S.me;
    if (!wsUrl) {
      el.innerHTML = '<p class="hint">Bản này đang mở không qua máy chủ nên chưa chơi online được. Chế độ chơi với máy và 2 người vẫn dùng bình thường.</p>';
      return;
    }
    if (!me) { el.innerHTML = '<p class="hint">Đang kết nối máy chủ…</p>'; return; }
    const avatar = `<span class="avatar">${esc((me.name || '?').trim().charAt(0).toUpperCase())}</span>`;
    if (me.guest) {
      el.innerHTML = `
        <div class="who">${avatar}<div><b>${esc(me.name)}</b><small>Khách · <a href="#" id="rename">đổi tên</a></small></div></div>
        <div class="row">
          <button type="button" class="primary" id="go-login">Đăng nhập</button>
          <button type="button" class="ghost" id="go-register">Tạo tài khoản</button>
        </div>
        <p class="hint">Có tài khoản để kết bạn, xem ai đang online và thách đấu Bo1/Bo3/Bo5.</p>`;
      $('go-login').onclick = () => openAuth('login');
      $('go-register').onclick = () => openAuth('register');
    } else {
      const st = me.stats || { wins: 0, losses: 0 };
      el.innerHTML = `
        <div class="who">${avatar}<div><b>${esc(me.name)}</b><small>@${esc(me.username)} · Thắng ${st.wins} · Thua ${st.losses} · <a href="#" id="rename">đổi tên</a></small></div></div>
        <div class="row">
          ${me.google ? '<span class="tag">✓ Đã liên kết Google</span>' : S.googleClientId ? '<button type="button" class="ghost" id="link-google">Liên kết Google</button>' : ''}
          <button type="button" class="ghost" id="logout">Đăng xuất</button>
        </div>
        <div id="google-link-btn"></div>`;
      $('logout').onclick = () => {
        if (roomActive() && !confirm('Đăng xuất sẽ rời phòng và bị xử thua ván đang đánh. Vẫn đăng xuất?')) return;
        send({ t: 'logout' });
      };
      const lg = $('link-google');
      if (lg) lg.onclick = () => { lg.hidden = true; mountGoogle($('google-link-btn')); };
    }
    $('rename').onclick = (e) => {
      e.preventDefault();
      const name = prompt('Tên hiển thị mới:', me.name);
      if (name && name.trim()) {
        if (me.guest) LS.set('caro.guestName', name.trim());
        send({ t: 'setName', name: name.trim() });
      }
    };
  }

  function renderFriends() {
    const el = $('friends');
    if (!S.me || S.me.guest) {
      el.innerHTML = '<h3>Bạn bè</h3><p class="hint">Đăng nhập để kết bạn và thách đấu bạn bè.</p>';
      return;
    }
    const f = S.friends;
    const order = { online: 0, playing: 1, offline: 2 };
    const list = [...f.friends].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
    const person = (p, extra) => `
      <li><span class="st ${p.status}" title="${STATUS_TEXT[p.status]}"></span>
        <div class="pn"><b>${esc(p.name)}</b><small>@${esc(p.username)} · ${STATUS_TEXT[p.status]}</small></div>${extra}</li>`;
    el.innerHTML = `
      <h3>Bạn bè <small>${f.friends.filter((p) => p.status !== 'offline').length}/${f.friends.length} online</small></h3>
      <form class="row" id="add-friend">
        <input name="u" placeholder="Tên đăng nhập của bạn bè" autocapitalize="none" spellcheck="false" maxlength="21" required>
        <button class="primary">Kết bạn</button>
      </form>
      ${f.incoming.length ? `<h4>Lời mời kết bạn</h4><ul class="people">${f.incoming.map((p) => person(p,
        `<button type="button" class="ghost sm" data-deny="${esc(p.id)}">Từ chối</button><button type="button" class="primary sm" data-accept="${esc(p.id)}">Đồng ý</button>`)).join('')}</ul>` : ''}
      <ul class="people">${list.map((p) => person(p,
        `<button type="button" class="primary sm" data-challenge="${esc(p.id)}" ${p.status === 'online' ? '' : 'disabled'}>Thách đấu</button>
         <button type="button" class="ghost sm icon" data-remove="${esc(p.id)}" title="Huỷ kết bạn">✕</button>`)).join('') ||
        '<li class="empty">Chưa có bạn bè. Nhập tên đăng nhập để kết bạn.</li>'}</ul>
      ${f.outgoing.length ? `<p class="hint">Đang chờ đồng ý: ${f.outgoing.map((p) => esc(p.name)).join(', ')}</p>` : ''}`;
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
        if (p && confirm(`Huỷ kết bạn với ${p.name}?`)) send({ t: 'friendRemove', id: p.id });
      };
    });
    el.querySelectorAll('[data-challenge]').forEach((b) => {
      b.onclick = () => {
        const p = f.friends.find((x) => x.id === b.dataset.challenge);
        S.challengeTo = p;
        $('ch-title').textContent = 'Thách đấu ' + p.name;
        openDlg('challenge');
      };
    });
  }

  $('challenge-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    if (S.challengeTo) send({ t: 'challenge', to: S.challengeTo.id, bestOf: Number(f.bo.value), first: f.first.value });
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
    const firstText = (inv, fromName) => inv.first === 'random' ? 'ngẫu nhiên đi trước'
      : inv.first === 'me' ? `${fromName} đi trước` : 'bạn đi trước';
    let html = '';
    for (const inv of S.invites.values()) {
      html += `<div class="invite"><div><b>${esc(inv.from.name)}</b> thách đấu bạn<small>Bo${inv.bestOf} · ${esc(firstText(inv, inv.from.name))}</small></div>
        <button type="button" class="ghost sm" data-no="${esc(inv.id)}">Từ chối</button>
        <button type="button" class="primary sm" data-yes="${esc(inv.id)}">Nhận</button></div>`;
    }
    if (S.sent) {
      const s = S.sent;
      const ft = s.first === 'random' ? 'ngẫu nhiên đi trước' : s.first === 'me' ? 'bạn đi trước' : `${s.to.name} đi trước`;
      html += `<div class="invite"><div>Đang chờ <b>${esc(s.to.name)}</b> nhận lời…<small>Bo${s.bestOf} · ${esc(ft)}</small></div>
        <button type="button" class="ghost sm" id="cancel-sent">Huỷ</button></div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-yes]').forEach((b) => {
      b.onclick = () => {
        if (roomActive() && !confirm('Nhận lời sẽ rời ván đang đánh và bị xử thua ván đó. Vẫn nhận?')) return;
        send({ t: 'challengeRespond', id: b.dataset.yes, accept: true });
      };
    });
    box.querySelectorAll('[data-no]').forEach((b) => {
      b.onclick = () => { send({ t: 'challengeRespond', id: b.dataset.no, accept: false }); S.invites.delete(b.dataset.no); renderInvites(); render(); };
    });
    const c = $('cancel-sent');
    if (c) c.onclick = () => { send({ t: 'challengeCancel', id: S.sent.id }); S.sent = null; renderInvites(); };
  }

  // ------------------------------------------------------------ Đăng nhập / Google
  let authTab = 'login';
  function openAuth(tab) {
    authTab = tab;
    const f = $('auth-form');
    f.classList.toggle('register', tab === 'register');
    f.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('auth-submit').textContent = tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
    f.password.autocomplete = tab === 'login' ? 'current-password' : 'new-password';
    f.password.minLength = tab === 'login' ? 1 : 6;
    $('auth-err').textContent = '';
    const gb = $('google-box');
    gb.hidden = !S.googleClientId;
    if (S.googleClientId) mountGoogle($('google-btn'));
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
  function mountGoogle(el) {
    loadGoogle().then((g) => {
      el.innerHTML = '';
      g.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', locale: 'vi', width: 260 });
    }).catch(() => { el.innerHTML = '<p class="hint">Không tải được đăng nhập Google trên mạng này. Hãy dùng tài khoản riêng.</p>'; });
  }

  // ------------------------------------------------------------ Phòng
  $('btn-online').onclick = () => { connect(); render(); openDlg('online'); };
  $('create-room').onclick = () => {
    const side = document.querySelector('input[name="room-side"]:checked').value;
    send({ t: 'createRoom', side });
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
    $('room-title').textContent = r.kind === 'series' ? `Thách đấu Bo${r.bestOf}` : 'Phòng chơi';
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
        <div class="pn"><b>${esc(p.name)}${you ? ' (bạn)' : ''}</b><small>Thắng ${r.score[p.id] || 0} ván${r.rematch.includes(p.id) ? ' · muốn tái đấu' : ''}</small></div>
        ${canFriend ? (pending.has(p.id) ? '<small>Đã gửi kết bạn</small>' : `<button type="button" class="ghost sm" data-add="${esc(p.id)}">Kết bạn</button>`) : ''}</li>`;
    }).join('') + (r.players.length < 2 ? '<li class="empty">Đang chờ đối thủ vào phòng…</li>' : '');
    $('ri-players').querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => send({ t: 'friendAdd', id: b.dataset.add }); });
  }
  function openRoomInfo() { fillRoomInfo(); openDlg('room-info'); }

  $('ri-copy').onclick = async () => {
    const link = $('ri-link').value;
    try { await navigator.clipboard.writeText(link); }
    catch (e) { $('ri-link').select(); document.execCommand('copy'); }
    toast('Đã sao chép link mời');
  };
  $('ri-share').onclick = () => {
    navigator.share({ title: 'Cờ Caro', text: `Vào chơi Cờ Caro với mình! Phòng ${S.room.code}`, url: inviteLink(S.room.code) }).catch(() => {});
  };

  $('btn-room').onclick = openRoomInfo;
  $('btn-center2').onclick = () => $('btn-center').click();
  $('btn-resign').onclick = () => {
    const r = S.room;
    if (!r || r.players.length < 2 || r.winner) return toast('Chưa có ván nào đang diễn ra');
    if (confirm('Đầu hàng ván này?')) send({ t: 'resign' });
  };
  // Đang có ván dở (đã có nước đi) – rời đi sẽ bị xử thua.
  function roomActive() {
    const r = S.room;
    return !!(r && r.players.length === 2 && !r.winner && r.moves.length);
  }

  function leaveRoom() {
    if (roomActive() && !confirm('Rời phòng khi đang đánh sẽ bị xử thua. Vẫn rời?')) return;
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
  const REASON = { resign: 'đầu hàng', leave: 'rời phòng', timeout: 'mất kết nối quá lâu' };
  function showBanner() {
    const r = S.room;
    if (!r || !r.winner || !S.me) return;
    const me = S.me.id;
    const winnerId = r.winner === 1 ? r.seats.x : r.seats.o;
    const won = winnerId === me;
    const opp = r.players.find((p) => p.id !== me);
    const oppName = opp ? opp.name : 'Đối thủ';
    let title = won ? '🎉 Bạn thắng!' : 'Bạn thua rồi';
    let sub = '';
    if (r.reason && r.reason !== 'win') sub = won ? `${oppName} ${REASON[r.reason]}` : `Bạn ${REASON[r.reason]}`;
    const score = `${r.score[me] || 0} – ${opp ? r.score[opp.id] || 0 : 0}`;
    let rematch = true;
    if (r.kind === 'series') {
      if (r.seriesWinner) {
        title = r.seriesWinner === me ? `🏆 Bạn thắng chung cuộc ${score}!` : `${oppName} thắng chung cuộc ${score}`;
      } else {
        sub = (sub ? sub + ' · ' : '') + `Tỉ số ${score} · Ván ${r.gameNo + 1} bắt đầu sau vài giây, đổi bên đi trước`;
        rematch = false;
      }
    } else {
      sub = (sub ? sub + ' · ' : '') + `Tỉ số ${score}`;
    }
    if (!opp) { sub = 'Đối thủ đã rời phòng'; rematch = false; }
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    const btn = $('banner-rematch');
    btn.hidden = !rematch;
    const mine = r.rematch.includes(me), theirs = opp && r.rematch.includes(opp.id);
    btn.disabled = mine;
    btn.textContent = mine ? 'Đang chờ đối thủ…' : theirs ? 'Đồng ý tái đấu' : 'Tái đấu';
    $('banner').hidden = false;
  }

  window.CaroOnline = { send, showBanner };

  // Kết nối sẵn khi có tài khoản (để bạn bè thấy mình online), đang ở trong phòng, hoặc mở bằng link mời.
  if (wsUrl && (LS.get('caro.token') || LS.get('caro.inRoom') || pendingLink)) connect();
  render();
})();
