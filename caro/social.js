/*
 * Tính năng cộng đồng khi chơi online: bảng xếp hạng (Lịch sử đấu: history.js), nhắn tin bạn bè,
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
  const time = (ms) => {
    try { return new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  };

  // ------------------------------------------------------------ Bảng xếp hạng
  let board = null;
  const lbPool = () => (document.querySelector('input[name="lb-pool"]:checked') || {}).value || '';
  function openLeaderboard() {
    board = null;
    renderLeaderboard();
    N.openDlg('leaderboard');
    N.send({ t: 'leaderboard', pool: lbPool() || undefined });
  }
  // Chọn loại thời gian (Siêu chớp / Chớp / Nhanh / Chậm) như Lichess
  document.querySelectorAll('input[name="lb-pool"]').forEach((r) => {
    r.onchange = () => { board = null; renderLeaderboard(); N.send({ t: 'leaderboard', pool: lbPool() || undefined }); };
  });
  function renderLeaderboard() {
    const el = $('lb-list');
    const meUid = S.me && S.me.uid;
    $('lb-me').textContent = board && board.me ? T('lb_you', board.me) : board && board.unranked ? T('lb_unranked', board.unranked) : '';
    if (!board) { el.innerHTML = `<li class="empty">…</li>`; return; }
    if (!board.top.length) { el.innerHTML = `<li class="empty">${esc(T('lb_empty'))}</li>`; return; }
    const medal = ['🥇', '🥈', '🥉'];
    el.innerHTML = board.top.map((u) => `<li class="${u.id === meUid ? 'me' : ''}">
        <span class="rank">${u.rank <= 3 ? medal[u.rank - 1] : '#' + u.rank}</span>
        <div class="pn"><b><a href="#" class="plink" data-profile="${esc(u.id)}">${esc(u.name)}</a></b><small>@${esc(u.username)} · ${esc(T('lb_games', { n: u.games }))}</small></div>
        <b class="pts">${u.rating}</b></li>`).join('');
  }
  N.on('leaderboard', (m) => { if ((m.pool || '') === lbPool()) { board = m; renderLeaderboard(); } });

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
    html += chat.msgs.map((m) => {
      const chId = window.CaroChallengeMsg ? window.CaroChallengeMsg.parse(m.text) : null;
      if (!chId) return `<div class="msg ${m.sender === me ? 'mine' : ''}"><span>${esc(m.text)}</span><time>${esc(time(m.created))}</time></div>`;
      const f = friendById(chat.peer.id) || chat.peer;
      if (m.sender === me) return `<div class="msg mine"><span>🎮 ${esc(T('challenge_sent_chat', { name: f.name }))}</span><time>${esc(time(m.created))}</time></div>`;
      if (!S.invites || !S.invites.has(chId)) return `<div class="msg"><span>🎮 ${esc(T('challenge_gone_chat'))}</span><time>${esc(time(m.created))}</time></div>`;
      return `<div class="msg challenge"><span>🎮 ${esc(T('invite_from', { name: f.name }))}</span><span class="ch-btns"><button type="button" class="primary sm" data-ch-yes="${esc(chId)}">${esc(T('receive'))}</button><button type="button" class="ghost sm" data-ch-no="${esc(chId)}">${esc(T('decline'))}</button></span><time>${esc(time(m.created))}</time></div>`;
    }).join('');
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    el.innerHTML = html;
    el.querySelectorAll('[data-ch-yes]').forEach((b) => { b.onclick = () => {
      const r = S.room;
      if (r && r.players.length === 2 && !r.winner && r.moves.length && !confirm(T('confirm_accept_busy'))) return;
      N.send({ t: 'challengeRespond', id: b.dataset.chYes, accept: true });
    }; });
    el.querySelectorAll('[data-ch-no]').forEach((b) => { b.onclick = () => {
      N.send({ t: 'challengeRespond', id: b.dataset.chNo, accept: false });
      if (S.invites) S.invites.delete(b.dataset.chNo);
      renderChat();
    }; });
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
    // Bong bóng chat (chat-bubbles.js, màn hình rộng): cửa sổ đang mở thì nó tự đánh dấu đã đọc; chưa mở thì hiện chat head
    // kèm số tin – không cần thêm thông báo nhỏ
    const B = window.CaroChatBubbles, bubble = B && B.active();
    if (f && !(bubble && B.isOpen(m.peer))) { f.unread = (f.unread || 0) + 1; N.render(); }
    sfx('chat');
    if (!bubble) {
      const chId = window.CaroChallengeMsg ? window.CaroChallengeMsg.parse(m.msg.text) : null;
      const preview = chId ? T('invite_from', { name: f ? f.name : '?' }) : (m.msg.text.length > 80 ? m.msg.text.slice(0, 80) + '…' : m.msg.text);
      N.toast(`💬 ${f ? f.name : '?'}: ${preview}`, 4500);
    }
  });

  $('chat-form').onsubmit = (e) => {
    e.preventDefault();
    const input = e.target.text;
    const text = input.value.trim();
    if (!text || !chat.peer) return;
    if (N.send({ t: 'dmSend', to: chat.peer.id, text })) input.value = '';
  };
  // Chat nhanh (Issue #128): bấm là gửi, khỏi gõ.
  document.querySelectorAll('.chat-quick [data-qc]').forEach((b) => { b.onclick = () => { if (chat.peer) N.send({ t: 'dmSend', to: chat.peer.id, text: T(b.dataset.qc === 'okee' ? 'qc_okee' : 'qc_bye') }); }; });
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
  // Lời mời biến mất: thẻ chat kèm lời mời vẽ lại thành dòng hết hạn
  N.on('inviteGone', () => { if (chat.peer && N.isOpen('chat')) renderChat(); });

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
    $('delete-form').reset();
    $('delete-err').textContent = '';
    $('email-form').email.value = (S.me && S.me.email) || '';
    $('email-form').password.value = '';
    N.openDlg('account-dlg');
    if (window.CaroDevices) window.CaroDevices.load(); // Thiết bị đang đăng nhập (devices.js)
  }
  function fillAccount() {
    const me = S.me;
    if (!me || me.guest) return;
    const has = me.hasPassword;
    $('pw-title').textContent = T(has ? 'change_password' : 'set_password');
    $('pw-hint').textContent = has ? T('pw_other_devices') : T('set_password_hint');
    $('pw-current').hidden = !has;
    $('email-pw').hidden = !has;
    // Email chỉ dùng để khôi phục mật khẩu: máy chủ không gửi được thư thì ẩn luôn
    $('email-form').hidden = !S.resetEnabled;
    $('email-status').textContent = me.email ? T('email_verified_tag', { email: me.email }) : T('email_none');
    $('email-status').classList.toggle('ok', !!me.email);
    $('email-verify').hidden = !me.pendingEmail;
    $('email-verify-hint').textContent = me.pendingEmail ? T('email_verify_hint', { email: me.pendingEmail }) : '';
    const list = me.blocked || [];
    $('blocked-list').innerHTML = list.length
      ? list.map((b) => `<li><div class="pn"><b>${esc(b.name)}</b></div><button type="button" class="ghost sm" data-unblock="${esc(b.id)}">${esc(T('unblock'))}</button></li>`).join('')
      : `<li class="empty">${esc(T('no_blocked'))}</li>`;
    $('blocked-list').querySelectorAll('[data-unblock]').forEach((b) => { b.onclick = () => N.send({ t: 'unblock', id: b.dataset.unblock }); });
    // Xoá tài khoản: có mật khẩu thì nhập mật khẩu, chỉ có Google thì gõ lại tên đăng nhập
    const secret = $('delete-form').secret;
    $('delete-label').textContent = has ? T('current_password') : T('delete_label_user', { username: me.username });
    secret.type = has ? 'password' : 'text';
    secret.autocomplete = has ? 'current-password' : 'off';
  }
  $('delete-form').onsubmit = (e) => {
    e.preventDefault();
    const me = S.me;
    if (!me || me.guest) return;
    $('delete-err').textContent = '';
    if (!confirm(T('delete_confirm_q'))) return;
    const v = e.target.secret.value;
    N.send(me.hasPassword ? { t: 'deleteAccount', password: v } : { t: 'deleteAccount', confirm: v });
  };
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
    N.send({ t: 'setEmail', email: f.email.value.trim(), password: f.password.value, lang: window.I18N.lang });
  };
  $('email-verify-btn').onclick = () => {
    const code = $('email-form').code.value.trim();
    $('email-err').textContent = '';
    if (code) N.send({ t: 'verifyEmail', code });
  };
  $('email-form').code.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
  $('email-form').code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('email-verify-btn').click(); } });
  $('email-resend').onclick = (e) => {
    e.preventDefault();
    const f = $('email-form');
    $('email-err').textContent = '';
    N.send({ t: 'setEmail', email: S.me.pendingEmail, password: f.password.value, lang: window.I18N.lang });
  };
  N.on('toast', (m) => {
    if (m.code === 'password_changed' && N.isOpen('account-dlg')) $('pw-form').reset();
    if (['email_saved', 'email_verified'].includes(m.code)) { $('email-form').password.value = ''; $('email-form').code.value = ''; }
    if (m.code === 'email_code_sent' && N.isOpen('account-dlg')) setTimeout(() => $('email-form').code.focus(), 50);
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
    // Bong bóng của đối thủ hiện 7 giây (trước đây 3 giây — quá ngắn nên người chơi dễ lỡ, tưởng chat
    // không tới nơi; Issue #141 mục 4). Bong bóng của mình giữ 3 giây vì mình biết mình vừa gửi gì.
    const hold = mine ? 3000 : 7000;
    setTimeout(() => el.classList.add('out'), hold);
    setTimeout(() => el.remove(), hold + 300);
  }
  /** Ghim câu chat nhanh gần nhất của đối thủ lên thẻ người chơi (#pl-top) cho tới nước đi tiếp theo:
   * thẻ được vẽ lại mỗi lần giao diện đổi (nước đi mới, hết ván…) nên ghim tự biến mất, không cần hẹn giờ. */
  function pinQuick(name, text) {
    const top = $('pl-top');
    if (!top || top.hidden) return;
    let el = top.querySelector('.quick-pin');
    if (!el) {
      el = document.createElement('div');
      el.className = 'quick-pin';
      top.appendChild(el);
    }
    el.innerHTML = `<b>${esc(name)}</b> ${esc(text)}`;
  }
  N.on('quick', (m) => {
    const r = S.room;
    const p = r && r.players.find((x) => x.id === m.from);
    if (!QUICK.includes(m.id)) return;
    sfx('chat');
    const name = p ? p.name : T('opponent');
    bubble(name, T('q_' + m.id), false);
    pinQuick(name, T('q_' + m.id));
  });
  N.on('room', (m) => { if (!m.room) menu.hidden = true; });

  // ------------------------------------------------------------ Định tuyến lỗi vào đúng hộp thoại
  function errorTarget(ctx) {
    const map = {
      changePassword: ['account-dlg', 'pw-err'],
      setEmail: ['account-dlg', 'email-err'],
      verifyEmail: ['account-dlg', 'email-err'],
      deleteAccount: ['account-dlg', 'delete-err'],
      forgot: ['forgot', 'forgot-err'],
      reset: ['forgot', 'forgot-err'],
    };
    const t = map[ctx];
    return t && N.isOpen(t[0]) ? t[1] : null;
  }

  function open(what) {
    // Lịch sử đấu mở được cả khi offline: thẻ "Trên máy này" (local-history.js)
    if (what === 'history') return window.CaroHistory.open();
    if (!N.connected) return N.send({ t: 'noop' }); // báo chưa kết nối và thử kết nối lại
    if (what === 'leaderboard') openLeaderboard();
    else if (what === 'account' || what === 'devices') {
      if (!S.me || S.me.guest) return N.toast(T('srv_need_account'));
      openAccount();
      // Hàng "Thiết bị" ở Xem thêm: cuộn tới mục Thiết bị trong Cài đặt tài khoản
      if (what === 'devices') setTimeout(() => $('devices-card').scrollIntoView({ block: 'start' }), 60);
    }
  }

  window.CaroSocial = { open, openChat, openReport, errorTarget };

  window.addEventListener('langchange', () => {
    if (N.isOpen('leaderboard')) renderLeaderboard();
    if (N.isOpen('chat')) renderChat();
    if (N.isOpen('account-dlg')) fillAccount();
    if (N.isOpen('forgot')) renderForgot();
    if (!menu.hidden) renderQuick();
  });
})();
