/*
 * Tính năng cộng đồng khi chơi online: lịch sử & xem lại ván, bảng xếp hạng, nhắn tin bạn bè,
 * chặn / báo cáo, tài khoản (mật khẩu, email, quên mật khẩu) và chat nhanh trong phòng.
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  const App = window.CaroApp;
  const esc = App.esc;
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  const S = N.state;
  const sfx = (name) => window.CaroSound && window.CaroSound.play(name);
  const QUICK = ['hello', 'nice', 'gg', 'rematch', 'hurry', 'oops', 'thanks', 'wow'];

  const locale = () => ({ vi: 'vi-VN', en: 'en-GB', ru: 'ru-RU', zh: 'zh-CN' }[window.I18N.lang]);
  const when = (ms) => {
    try { return new Date(ms).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return new Date(ms).toLocaleString(); }
  };
  const time = (ms) => {
    try { return new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  };

  // ------------------------------------------------------------ Lịch sử
  let games = null;
  function openHistory() {
    games = null;
    renderHistory();
    N.openDlg('history');
    N.send({ t: 'history' });
  }
  function renderHistory() {
    const el = $('history-list');
    if (!games) { el.innerHTML = `<li class="empty">…</li>`; return; }
    if (!games.length) { el.innerHTML = `<li class="empty">${esc(T('no_history'))}</li>`; return; }
    el.innerHTML = games.map((g, i) => {
      const how = g.reason && !['win', 'draw'].includes(g.reason) ? ' · ' + T('end_' + g.reason) : '';
      return `<li>
        <span class="res ${g.result}">${esc(T('res_' + g.result))}</span>
        <div class="pn"><b>${esc(T('vs', { name: g.opponent }))}</b>
          <small>${esc(when(g.created))} · ${esc(T('n_moves', { n: g.moves }))}${esc(how)}</small></div>
        <button type="button" class="ghost sm icon" data-share="${i}" title="${esc(T('share_game'))}" aria-label="${esc(T('share_game'))}">↗</button>
        <button type="button" class="primary sm" data-replay="${i}">▶ ${esc(T('replay'))}</button>
      </li>`;
    }).join('');
    const names = (g) => (g.mySide === 1 ? { x: S.me.name, o: g.opponent } : { x: g.opponent, o: S.me.name });
    el.querySelectorAll('[data-replay]').forEach((b) => { b.onclick = () => N.openReplay(games[b.dataset.replay].share); });
    el.querySelectorAll('[data-share]').forEach((b) => {
      b.onclick = () => { const g = games[b.dataset.share]; N.shareReplay({ share: g.share, ...names(g) }); };
    });
  }
  N.on('history', (m) => { games = m.games; renderHistory(); });

  // ------------------------------------------------------------ Bảng xếp hạng
  let board = null;
  function openLeaderboard() {
    board = null;
    renderLeaderboard();
    N.openDlg('leaderboard');
    N.send({ t: 'leaderboard' });
  }
  function renderLeaderboard() {
    const el = $('lb-list');
    const meUid = S.me && S.me.uid;
    $('lb-me').textContent = board && board.me ? T('lb_you', board.me) : '';
    if (!board) { el.innerHTML = `<li class="empty">…</li>`; return; }
    if (!board.top.length) { el.innerHTML = `<li class="empty">${esc(T('lb_empty'))}</li>`; return; }
    const medal = ['🥇', '🥈', '🥉'];
    el.innerHTML = board.top.map((u) => `<li class="${u.id === meUid ? 'me' : ''}">
        <span class="rank">${u.rank <= 3 ? medal[u.rank - 1] : '#' + u.rank}</span>
        <div class="pn"><b>${esc(u.name)}</b><small>@${esc(u.username)} · ${esc(T('lb_games', { n: u.games }))}</small></div>
        <b class="pts">${u.rating}</b></li>`).join('');
  }
  N.on('leaderboard', (m) => { board = m; renderLeaderboard(); });

  // ------------------------------------------------------------ Nhắn tin bạn bè
  const chat = { peer: null, msgs: [], more: false };
  const friendById = (id) => S.friends.friends.find((f) => f.id === id);

  function openChat(friend) {
    if (!friend) return;
    chat.peer = friend;
    chat.msgs = [];
    chat.more = false;
    chat.loading = true;
    renderChat();
    N.openDlg('chat');
    N.send({ t: 'dmHistory', peer: friend.id });
    setTimeout(() => $('chat-form').text.focus(), 50);
  }

  function renderChatHead() {
    const f = friendById(chat.peer.id) || chat.peer;
    $('chat-name').textContent = f.name;
    const h = f.h2h;
    $('chat-sub').textContent = [`@${f.username}`, T('st_' + (f.status || 'offline')),
      h && h.wins + h.losses + h.draws ? T('h2h_line', { w: h.wins, l: h.losses, d: h.draws }) : ''].filter(Boolean).join(' · ');
  }

  function renderChat() {
    if (!chat.peer) return;
    renderChatHead();
    const el = $('chat-msgs');
    const me = S.me && S.me.uid;
    let html = chat.more ? `<button type="button" class="ghost sm older" id="chat-older">${esc(T('older'))}</button>` : '';
    if (!chat.msgs.length && !chat.loading) html += `<p class="hint center">${esc(T('no_msgs'))}</p>`;
    html += chat.msgs.map((m) => `<div class="msg ${m.sender === me ? 'mine' : ''}"><span>${esc(m.text)}</span><time>${esc(time(m.created))}</time></div>`).join('');
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    el.innerHTML = html;
    if (atBottom || chat.stick) el.scrollTop = el.scrollHeight;
    chat.stick = false;
    const older = $('chat-older');
    if (older) older.onclick = () => N.send({ t: 'dmHistory', peer: chat.peer.id, before: chat.msgs[0].id });
  }

  function markRead() {
    const last = chat.msgs[chat.msgs.length - 1];
    if (!last || !chat.peer) return;
    N.send({ t: 'dmRead', peer: chat.peer.id, lastId: last.id });
    const f = friendById(chat.peer.id);
    if (f && f.unread) { f.unread = 0; N.render(); }
  }

  N.on('dmHistory', (m) => {
    if (!chat.peer || m.peer !== chat.peer.id) return;
    const first = chat.loading;
    chat.loading = false;
    const known = new Set(chat.msgs.map((x) => x.id));
    chat.msgs = [...m.msgs.filter((x) => !known.has(x.id)), ...chat.msgs];
    chat.more = m.more;
    chat.stick = first;
    renderChat();
    if (first) markRead();
  });

  N.on('dm', (m) => {
    const mine = S.me && m.msg.sender === S.me.uid;
    if (chat.peer && m.peer === chat.peer.id && N.isOpen('chat')) {
      chat.msgs.push(m.msg);
      chat.stick = true;
      renderChat();
      if (!mine) { markRead(); sfx('chat'); }
      return;
    }
    if (mine) return;
    const f = friendById(m.peer);
    if (f) { f.unread = (f.unread || 0) + 1; N.render(); }
    sfx('chat');
    N.toast(`💬 ${f ? f.name : '?'}: ${m.msg.text.length > 80 ? m.msg.text.slice(0, 80) + '…' : m.msg.text}`, 4500);
  });

  $('chat-form').onsubmit = (e) => {
    e.preventDefault();
    const input = e.target.text;
    const text = input.value.trim();
    if (!text || !chat.peer) return;
    if (N.send({ t: 'dmSend', to: chat.peer.id, text })) input.value = '';
  };
  $('chat-block').onclick = () => {
    const f = chat.peer;
    if (f && confirm(T('confirm_block', { name: f.name }))) {
      N.send({ t: 'block', id: f.id });
      N.closeDlg('chat');
    }
  };
  $('chat-report').onclick = () => chat.peer && openReport(chat.peer.id, chat.peer.name);
  $('chat').addEventListener('close', () => { chat.peer = null; });
  // Bạn bè đổi trạng thái / hết là bạn: cập nhật đầu hộp chat
  N.on('friends', () => {
    if (!chat.peer || !N.isOpen('chat')) return;
    if (!friendById(chat.peer.id)) N.closeDlg('chat');
    else renderChatHead();
  });

  // ------------------------------------------------------------ Báo cáo
  let reportTarget = null;
  function openReport(id, name) {
    reportTarget = id;
    $('report-title').textContent = T('report_title', { name });
    $('report-form').reset();
    N.openDlg('report');
  }
  $('report-form').onsubmit = (e) => {
    e.preventDefault();
    if (reportTarget && N.send({ t: 'report', id: reportTarget, reason: e.target.reason.value })) N.closeDlg('report');
  };

  // ------------------------------------------------------------ Tài khoản
  function openAccount() {
    fillAccount();
    ['pw-err', 'email-err'].forEach((id) => { $(id).textContent = ''; });
    $('pw-form').reset();
    $('email-form').email.value = (S.me && S.me.email) || '';
    $('email-form').password.value = '';
    N.openDlg('account-dlg');
  }
  function fillAccount() {
    const me = S.me;
    if (!me || me.guest) return;
    const has = me.hasPassword;
    $('pw-title').textContent = T(has ? 'change_password' : 'set_password');
    $('pw-hint').textContent = has ? T('pw_other_devices') : T('set_password_hint');
    $('pw-current').hidden = !has;
    $('email-pw').hidden = !has;
    const list = me.blocked || [];
    $('blocked-list').innerHTML = list.length
      ? list.map((b) => `<li><div class="pn"><b>${esc(b.name)}</b></div><button type="button" class="ghost sm" data-unblock="${esc(b.id)}">${esc(T('unblock'))}</button></li>`).join('')
      : `<li class="empty">${esc(T('no_blocked'))}</li>`;
    $('blocked-list').querySelectorAll('[data-unblock]').forEach((b) => { b.onclick = () => N.send({ t: 'unblock', id: b.dataset.unblock }); });
  }
  $('pw-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    $('pw-err').textContent = '';
    if (f.next.value !== f.again.value) { $('pw-err').textContent = T('password_mismatch'); return; }
    N.send({ t: 'changePassword', current: f.current.value, next: f.next.value });
  };
  $('email-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    $('email-err').textContent = '';
    N.send({ t: 'setEmail', email: f.email.value.trim(), password: f.password.value });
  };
  N.on('toast', (m) => {
    if (m.code === 'password_changed' && N.isOpen('account-dlg')) $('pw-form').reset();
    if (m.code === 'email_saved') $('email-form').password.value = '';
  });
  N.on('me', () => { if (N.isOpen('account-dlg')) fillAccount(); });

  // ------------------------------------------------------------ Quên mật khẩu
  let forgotStep = 1;
  function openForgot() {
    forgotStep = 1;
    const f = $('forgot-form');
    f.reset();
    f.login.value = $('auth-form').username.value.trim();
    renderForgot();
    N.closeDlg('auth');
    N.openDlg('forgot');
  }
  function renderForgot() {
    const f = $('forgot-form');
    $('forgot-step2').hidden = forgotStep !== 2;
    $('forgot-hint').textContent = T(forgotStep === 2 ? 'forgot_sent' : 'forgot_hint');
    $('forgot-submit').textContent = T(forgotStep === 2 ? 'reset_submit' : 'forgot_send');
    f.code.required = f.password.required = forgotStep === 2;
    $('forgot-err').textContent = '';
  }
  $('forgot-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    $('forgot-err').textContent = '';
    const login = f.login.value.trim().toLowerCase();
    if (forgotStep === 1) N.send({ t: 'forgot', login, lang: window.I18N.lang });
    else N.send({ t: 'reset', login, code: f.code.value.trim(), password: f.password.value });
  };
  $('forgot-form').code.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
  N.on('forgotSent', () => {
    forgotStep = 2;
    renderForgot();
    setTimeout(() => $('forgot-form').code.focus(), 50);
  });
  N.on('auth', () => N.closeDlg('forgot'));
  $('go-forgot').onclick = (e) => { e.preventDefault(); openForgot(); };
  // Link "Quên mật khẩu?" chỉ hiện khi máy chủ bật gửi email
  const syncForgotLink = () => { $('go-forgot').hidden = !S.resetEnabled; };
  N.on('welcome', syncForgotLink);

  // ------------------------------------------------------------ Chat nhanh trong phòng
  const menu = $('quick-menu');
  function renderQuick() {
    menu.innerHTML = QUICK.map((id) => `<button type="button" data-q="${id}">${esc(T('q_' + id))}</button>`).join('');
    menu.querySelectorAll('[data-q]').forEach((b) => {
      b.onclick = () => {
        menu.hidden = true;
        if (N.send({ t: 'quick', id: b.dataset.q })) bubble(T('you'), T('q_' + b.dataset.q), true);
      };
    });
  }
  $('quick-btn').onclick = (e) => {
    e.stopPropagation();
    if (menu.hidden) renderQuick();
    menu.hidden = !menu.hidden;
  };
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== $('quick-btn')) menu.hidden = true;
  });
  function bubble(name, text, mine) {
    const el = document.createElement('div');
    el.className = 'toast bubble' + (mine ? ' mine' : '');
    el.innerHTML = `<b>${esc(name)}</b> ${esc(text)}`;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3000);
    setTimeout(() => el.remove(), 3300);
  }
  N.on('quick', (m) => {
    const r = S.room;
    const p = r && r.players.find((x) => x.id === m.from);
    if (!QUICK.includes(m.id)) return;
    sfx('chat');
    bubble(p ? p.name : T('opponent'), T('q_' + m.id), false);
  });
  N.on('room', (m) => { if (!m.room) menu.hidden = true; });

  // ------------------------------------------------------------ Định tuyến lỗi vào đúng hộp thoại
  function errorTarget(ctx) {
    const map = {
      changePassword: ['account-dlg', 'pw-err'],
      setEmail: ['account-dlg', 'email-err'],
      forgot: ['forgot', 'forgot-err'],
      reset: ['forgot', 'forgot-err'],
    };
    const t = map[ctx];
    return t && N.isOpen(t[0]) ? t[1] : null;
  }

  function open(what) {
    if (!N.connected) return N.send({ t: 'noop' }); // báo chưa kết nối và thử kết nối lại
    if (what === 'history') openHistory();
    else if (what === 'leaderboard') openLeaderboard();
    else if (what === 'account') openAccount();
  }

  window.CaroSocial = { open, openChat, openReport, errorTarget };

  window.addEventListener('langchange', () => {
    if (N.isOpen('history')) renderHistory();
    if (N.isOpen('leaderboard')) renderLeaderboard();
    if (N.isOpen('chat')) renderChat();
    if (N.isOpen('account-dlg')) fillAccount();
    if (N.isOpen('forgot')) renderForgot();
    if (!menu.hidden) renderQuick();
  });
})();
