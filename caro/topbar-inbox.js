/*
 * Thanh trên: Hộp thư tin nhắn và Thông báo (như Facebook / Lichess) – hai nút giữa ảnh đại diện và bánh răng Cài đặt
 * nhanh, chỉ hiện khi đã đăng nhập tài khoản (khách / ngoại tuyến: ẩn).
 *  - Hộp thư: số tin chưa đọc (cộng từ danh sách bạn bè của máy chủ); bấm mở danh sách bạn bè (người có tin chưa đọc
 *    lên đầu, rồi đang chơi / online) → bấm một người để chat (chat-bubbles.js trên màn rộng, hộp chat toàn màn hình trên
 *    điện thoại). Bong bóng chat đã ẩn thì có nút "Hiện lại bong bóng chat" ở cuối danh sách.
 *  - Thông báo: lời mời kết bạn đang chờ (Chấp nhận / Từ chối ngay tại chỗ), lời thách đấu nhận qua tin nhắn, lời mời
 *    kết bạn của mình vừa được chấp nhận, tin gửi toàn câu lạc bộ (club-manage.js của máy chủ). Lời mời kết bạn lấy từ
 *    máy chủ; các loại sau ghi lại trên máy này (mỗi tài khoản tối đa 30 mục, localStorage) – mở bảng là đánh dấu đã xem.
 *   window.CaroTopInbox = { refresh() }
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  const box = document.getElementById('tb-inbox');
  if (!N || !box) return;
  const T = (k, a) => window.I18N.t(k, a);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = N.state;
  const msgBtn = document.getElementById('tb-msg');
  const bellBtn = document.getElementById('tb-bell');
  const pop = document.getElementById('tb-pop');
  const MAX_LOG = 30;
  const ORDER = { playing: 0, online: 1, offline: 2 };
  let open = null; // 'msg' | 'bell' | null
  let outgoing = null; // id người mình đã gửi lời mời (để biết khi họ chấp nhận)

  const signedIn = () => !!(S.me && !S.me.guest && N.connected);
  const friends = () => (S.friends && S.friends.friends) || [];
  const incoming = () => (S.friends && S.friends.incoming) || [];
  const key = () => 'caro.notif.' + (S.me && (S.me.uid || S.me.id));
  function readLog() { try { return JSON.parse(localStorage.getItem(key()) || '[]'); } catch (e) { return []; } }
  function writeLog(list) { try { localStorage.setItem(key(), JSON.stringify(list.slice(0, MAX_LOG))); } catch (e) { /* chế độ riêng tư */ } }
  function log(item) { writeLog([{ ...item, at: Date.now(), read: false }, ...readLog()]); draw(); }

  const count = (el, n) => { const i = el.querySelector('.tb-count'); i.hidden = !n; i.textContent = n > 99 ? '99+' : String(n); };
  const ago = (ms) => {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return m < 1 ? T('nt_now') : m < 60 ? T('nt_min', { n: m }) : m < 1440 ? T('nt_hour', { n: Math.floor(m / 60) }) : T('nt_day', { n: Math.floor(m / 1440) });
  };
  const avatar = (f) => window.CaroAvatar.html(f, 'sm');

  function msgHtml() {
    const list = [...friends()].sort((a, b) => (b.unread || 0) - (a.unread || 0) || ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
    const hidden = window.CaroChatBubbles && window.CaroChatBubbles.hidden && window.CaroChatBubbles.hidden();
    return `<div class="tb-pop-h"><b>${esc(T('tb_inbox'))}</b></div>
      <ul class="tb-pop-list">${list.map((f) => `<li><button type="button" data-chat="${esc(f.id)}">${avatar(f)}
        <span class="tb-pop-t"><b>${esc(f.name)}</b><small>${esc(window.CaroPresence ? window.CaroPresence.text(f) : T('st_' + f.status))}</small></span>
        ${f.unread ? `<i class="tb-pop-n">${f.unread > 99 ? '99+' : f.unread}</i>` : ''}</button></li>`).join('')
        || `<li class="tb-pop-empty">${esc(T('cb_none'))}</li>`}</ul>
      ${hidden ? `<button type="button" class="tb-pop-foot" data-showcb>${esc(T('cb_show'))}</button>` : ''}`;
  }

  function bellHtml() {
    const req = incoming().map((p) => `<li class="tb-nt unread">${avatar(p)}<span class="tb-pop-t"><b>${esc(T('nt_request', { name: p.name }))}</b>
      <span class="tb-nt-act"><button type="button" class="tb-btn sm" data-accept="${esc(p.id)}">${esc(T('pf_accept'))}</button>
      <button type="button" class="tb-link sm" data-deny="${esc(p.id)}">${esc(T('nt_deny'))}</button></span></span></li>`).join('');
    const items = readLog().map((n, i) => `<li class="tb-nt${n.read ? '' : ' unread'}"><button type="button" data-item="${i}">${n.k === 'club' ? `<span class="tb-club">${esc(n.icon || '♟️')}</span>` : avatar(n)}
      <span class="tb-pop-t"><b>${esc(n.k === 'club' ? T('nt_club', { club: n.name }) : T(n.k === 'invite' ? 'nt_invite' : 'nt_accepted', { name: n.name }))}</b>${n.k === 'club' ? `<span class="tb-nt-text">${esc(n.text)}</span>` : ''}<small>${esc(ago(n.at))}</small></span></button></li>`).join('');
    return `<div class="tb-pop-h"><b>${esc(T('tb_notif'))}</b></div>
      <ul class="tb-pop-list">${req + items || `<li class="tb-pop-empty">${esc(T('nt_none'))}</li>`}</ul>`;
  }

  function draw() {
    const on = signedIn();
    box.hidden = !on;
    if (!on) { if (open) toggle(null); return; }
    const unread = friends().reduce((n, f) => n + (f.unread || 0), 0);
    count(msgBtn, unread);
    count(bellBtn, incoming().length + readLog().filter((n) => !n.read).length);
    msgBtn.setAttribute('aria-label', T('tb_inbox') + (unread ? ` (${unread})` : ''));
    bellBtn.setAttribute('aria-label', T('tb_notif'));
    msgBtn.title = T('tb_inbox');
    bellBtn.title = T('tb_notif');
    if (open) pop.innerHTML = open === 'msg' ? msgHtml() : bellHtml();
  }

  function toggle(which) {
    open = open === which ? null : which;
    pop.hidden = !open;
    msgBtn.classList.toggle('on', open === 'msg');
    bellBtn.classList.toggle('on', open === 'bell');
    msgBtn.setAttribute('aria-expanded', String(open === 'msg'));
    bellBtn.setAttribute('aria-expanded', String(open === 'bell'));
    draw();
    // Mở Thông báo = đã xem các mục ghi lại (lời mời kết bạn vẫn đếm tới khi trả lời)
    if (open === 'bell') { writeLog(readLog().map((n) => ({ ...n, read: true }))); count(bellBtn, incoming().length); }
  }

  msgBtn.onclick = (e) => { e.stopPropagation(); toggle('msg'); };
  bellBtn.onclick = (e) => { e.stopPropagation(); toggle('bell'); };
  pop.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.chat) { toggle(null); return openChat(b.dataset.chat); }
    if (b.hasAttribute('data-showcb')) { window.CaroChatBubbles.setHidden(false); return draw(); }
    if (b.dataset.accept || b.dataset.deny) {
      N.send({ t: 'friendRespond', id: b.dataset.accept || b.dataset.deny, accept: !!b.dataset.accept });
      b.closest('li').remove();
      return;
    }
    if (b.dataset.item != null) {
      const n = readLog()[+b.dataset.item];
      toggle(null);
      if (!n) return;
      if (n.k === 'invite') openChat(n.id);
      else if (n.k === 'club') { if (window.CaroTour && window.CaroTour.openClub) window.CaroTour.openClub(n.id); }
      else if (window.CaroProfile) window.CaroProfile.open(n.id);
    }
  });
  function openChat(id) {
    const f = friends().find((x) => x.id === id);
    if (!f) return;
    if (window.CaroChatBubbles && window.CaroChatBubbles.canOpen()) window.CaroChatBubbles.open(id);
    else if (window.CaroSocial) window.CaroSocial.openChat(f);
  }
  document.addEventListener('click', (e) => { if (open && !box.contains(e.target)) toggle(null); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { const b = open === 'msg' ? msgBtn : bellBtn; toggle(null); b.focus(); } });

  // Lời mời kết bạn mình gửi đi được chấp nhận: người đó rời "đã gửi" và có trong danh sách bạn bè
  N.on('friends', () => {
    const f = S.friends || {};
    const now = new Set((f.outgoing || []).map((p) => p.id));
    if (outgoing) {
      for (const p of friends()) if (outgoing.has(p.id) && !now.has(p.id)) log({ k: 'accepted', id: p.id, name: p.name, av: p.av || 0 });
    }
    outgoing = now;
    draw();
  });
  // Lời thách đấu gửi qua tin nhắn (challenge-msg.js)
  N.on('dm', (m) => {
    if (!S.me || m.msg.sender === S.me.uid || !window.CaroChallengeMsg || !window.CaroChallengeMsg.parse(m.msg.text)) return;
    const f = friends().find((x) => x.id === m.peer) || { id: m.peer, name: '?' };
    log({ k: 'invite', id: f.id, name: f.name, av: f.av || 0 });
  });
  // Tin gửi toàn câu lạc bộ (nhận ngay khi online, hoặc lúc vào lại – máy chủ chỉ gửi mỗi tin một lần)
  N.on('clubMsgs', (m) => {
    for (const x of m.items) writeLog([{ k: 'club', id: x.club.id, name: x.club.name, icon: x.club.icon, text: String(x.msg.text).slice(0, 300), at: x.msg.at, read: false }, ...readLog()]);
    draw();
  });
  N.on('me', draw);
  N.on('close', draw);
  window.addEventListener('caro:online', draw);
  window.addEventListener('langchange', draw);
  window.addEventListener('caro:page', () => { if (open) toggle(null); });
  draw();

  window.CaroTopInbox = { refresh: draw };
})();
