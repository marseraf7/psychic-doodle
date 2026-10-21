/*
 * Bong bóng chat như Messenger: nút tròn ở góc phải dưới (số tin chưa đọc) → danh sách bạn bè kèm trạng thái
 * (presence.js: đang online / đang chơi chế độ nào / hoạt động x phút trước) → bấm một người để chat.
 *   - Màn hình rộng: cửa sổ chat gắn ở đáy màn hình (tối đa 2 cửa sổ), thu nhỏ thành ảnh tròn (chat head) xếp trên nút.
 *     Có tin mới từ người chưa mở cửa sổ: tự hiện chat head kèm số tin.
 *   - Điện thoại: mở hộp chat sẵn có (social.js – toàn màn hình, hợp bàn phím ảo).
 * Dùng lại các lệnh nhắn tin bạn bè của máy chủ (dmHistory, dmSend, dmRead, tin 'dm'). Chỉ hiện khi đã đăng nhập.
 *   CaroChatBubbles = { open(friendId), active(), isOpen(peerId) } – social.js dùng active / isOpen để không báo trùng
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  if (!N) return;
  const T = (k, a) => window.I18N.t(k, a);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = N.state;
  const wide = matchMedia('(min-width: 700px)');
  const MAX_WINS = 2, MAX_HEADS = 4;
  const ORDER = { playing: 0, online: 1, offline: 2 };

  const root = document.createElement('div');
  root.className = 'cb';
  root.id = 'cb';
  root.innerHTML = `<div class="cb-wins"></div>
    <div class="cb-side"><div class="cb-heads"></div>
      <div class="cb-panel" hidden></div>
      <button type="button" class="cb-launch" aria-haspopup="true" aria-expanded="false"><svg class="ico" aria-hidden="true"><use href="#i-chat"/></svg><i class="count" hidden></i></button></div>`;
  document.body.appendChild(root);
  const $ = (sel) => root.querySelector(sel);
  const wins = []; // { id, open (false = thu nhỏ thành chat head), msgs, more, loading, unread, draft }
  let panelOpen = false;

  const friends = () => (S.friends && S.friends.friends) || [];
  const friend = (id) => friends().find((f) => f.id === id);
  const signedIn = () => !!(S.me && !S.me.guest && N.connected);
  const locale = () => ({ vi: 'vi-VN', en: 'en-GB', ru: 'ru-RU', zh: 'zh-CN' }[window.I18N.lang] || 'vi-VN');
  const time = (ms) => { try { return new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const status = (f) => (window.CaroPresence ? window.CaroPresence.text(f) : T('st_' + f.status));
  const avatar = (f, cls) => `<span class="av-st">${window.CaroAvatar.html(f, cls)}<span class="st ${esc(f.status)}"></span></span>`;

  // ------------------------------------------------------------ Vẽ
  function draw() {
    const show = signedIn() && (wide.matches || !document.getElementById('shell').hidden);
    root.hidden = !show;
    if (!show) return;
    const unread = friends().reduce((n, f) => n + (f.unread || 0), 0);
    const badge = $('.cb-launch .count');
    badge.hidden = !unread;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    $('.cb-launch').setAttribute('aria-label', T('cb_title'));
    $('.cb-launch').setAttribute('aria-expanded', String(panelOpen));
    drawPanel();
    drawHeads();
    drawWins();
  }

  function drawPanel() {
    const p = $('.cb-panel');
    p.hidden = !panelOpen;
    if (!panelOpen) return;
    const list = [...friends()].sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.unread || 0) - (a.unread || 0)
      || (b.seen || 0) - (a.seen || 0) || a.name.localeCompare(b.name));
    const on = list.filter((f) => f.status !== 'offline').length;
    p.innerHTML = `<div class="cb-ph"><b>${esc(T('cb_title'))}</b><small>${esc(T('cb_online_n', { n: on, all: list.length }))}</small></div>
      <ul class="cb-list">${list.map((f) => `<li><button type="button" data-open="${esc(f.id)}">${avatar(f, 'sm')}
        <span class="cb-t"><b>${esc(f.name)}</b><small class="${f.status}">${esc(status(f))}</small></span>
        ${f.unread ? `<i class="count">${f.unread > 99 ? '99+' : f.unread}</i>` : ''}</button></li>`).join('')
        || `<li class="cb-empty">${esc(T('cb_none'))}</li>`}</ul>`;
  }

  function drawHeads() {
    const heads = wins.filter((w) => !w.open).slice(-MAX_HEADS);
    $('.cb-heads').innerHTML = heads.map((w) => {
      const f = friend(w.id) || { id: w.id, name: '?', status: 'offline' };
      return `<button type="button" class="cb-head" data-open="${esc(w.id)}" title="${esc(f.name)} · ${esc(status(f))}">${avatar(f, '')}
        ${w.unread ? `<i class="count">${w.unread > 99 ? '99+' : w.unread}</i>` : ''}<span class="cb-x" data-close="${esc(w.id)}" aria-label="${esc(T('cb_close'))}">×</span></button>`;
    }).join('');
  }

  function drawWins() {
    const box = $('.cb-wins');
    const open = wins.filter((w) => w.open);
    // Giữ nguyên cửa sổ đang có (không mất chữ đang gõ / vị trí cuộn), chỉ thêm / bớt / cập nhật
    for (const el of [...box.children]) if (!open.some((w) => w.id === el.dataset.id)) el.remove();
    for (const w of open) {
      let el = box.querySelector(`.cb-win[data-id="${CSS.escape(w.id)}"]`);
      if (!el) {
        el = document.createElement('section');
        el.className = 'cb-win';
        el.dataset.id = w.id;
        el.innerHTML = `<header></header><div class="cb-msgs"></div>
          <form class="cb-form"><input name="text" maxlength="500" autocomplete="off"><button class="primary sm" type="submit"></button></form>`;
        box.appendChild(el);
        el.querySelector('form').onsubmit = (e) => {
          e.preventDefault();
          const inp = e.target.text, text = inp.value.trim();
          if (text && N.send({ t: 'dmSend', to: w.id, text })) inp.value = '';
        };
        el.querySelector('input').addEventListener('focus', () => markRead(w));
      }
      const f = friend(w.id) || { id: w.id, name: '?', status: 'offline' };
      el.querySelector('header').innerHTML = `${avatar(f, 'sm')}<span class="cb-t"><a href="#" data-profile="${esc(f.id)}"><b>${esc(f.name)}</b></a><small class="${f.status}">${esc(status(f))}</small></span>
        <button type="button" class="cb-ic" data-min="${esc(w.id)}" aria-label="${esc(T('cb_min'))}">–</button><button type="button" class="cb-ic" data-close="${esc(w.id)}" aria-label="${esc(T('cb_close'))}">×</button>`;
      el.querySelector('input').placeholder = T('cb_placeholder');
      el.querySelector('button[type=submit]').textContent = T('cb_send');
      drawMsgs(el, w);
    }
  }

  function drawMsgs(el, w) {
    const box = el.querySelector('.cb-msgs');
    const me = S.me && S.me.uid;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    let html = w.more ? `<button type="button" class="ghost sm cb-older" data-older="${esc(w.id)}">${esc(T('older'))}</button>` : '';
    if (!w.msgs.length && !w.loading) html += `<p class="hint center">${esc(T('no_msgs'))}</p>`;
    html += w.msgs.map((m) => `<div class="msg ${m.sender === me ? 'mine' : ''}"><span>${esc(m.text)}</span><time>${esc(time(m.created))}</time></div>`).join('');
    if (box.dataset.html === html) return; // không đổi: khỏi vẽ lại (giữ vị trí cuộn)
    box.dataset.html = html;
    box.innerHTML = html;
    if (atBottom || w.stick) box.scrollTop = box.scrollHeight;
    w.stick = false;
  }

  // ------------------------------------------------------------ Mở / thu nhỏ / đóng
  function open(id) {
    const f = friend(id);
    if (!f) return;
    panelOpen = false;
    // Điện thoại: hộp chat toàn màn hình sẵn có (social.js)
    if (!wide.matches) { draw(); return window.CaroSocial && window.CaroSocial.openChat(f); }
    let w = wins.find((x) => x.id === id);
    if (!w) {
      w = { id, open: true, msgs: [], more: false, loading: true, unread: 0 };
      wins.push(w);
      N.send({ t: 'dmHistory', peer: id });
    } else if (!w.open) { w.open = true; wins.splice(wins.indexOf(w), 1); wins.push(w); }
    // Quá MAX_WINS cửa sổ: cửa sổ mở lâu nhất thu nhỏ thành chat head
    const opened = wins.filter((x) => x.open);
    for (const x of opened.slice(0, Math.max(0, opened.length - MAX_WINS))) x.open = false;
    w.stick = true;
    draw();
    markRead(w);
    const inp = root.querySelector(`.cb-win[data-id="${CSS.escape(id)}"] input`);
    if (inp) setTimeout(() => inp.focus(), 30);
  }
  function minimize(id) { const w = wins.find((x) => x.id === id); if (w) { w.open = false; draw(); } }
  function close(id) { const i = wins.findIndex((x) => x.id === id); if (i >= 0) { wins.splice(i, 1); draw(); } }

  function markRead(w) {
    const last = w.msgs[w.msgs.length - 1];
    w.unread = 0;
    const f = friend(w.id);
    if (f && f.unread) { f.unread = 0; N.render(); }
    if (last && last.sender !== (S.me && S.me.uid)) N.send({ t: 'dmRead', peer: w.id, lastId: last.id });
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close],[data-min],[data-open],[data-older],.cb-launch');
    if (!t) return;
    if (t.dataset.close) { e.stopPropagation(); return close(t.dataset.close); }
    if (t.dataset.min) return minimize(t.dataset.min);
    if (t.dataset.open) return open(t.dataset.open);
    if (t.dataset.older) {
      const w = wins.find((x) => x.id === t.dataset.older);
      if (w && w.msgs.length) N.send({ t: 'dmHistory', peer: w.id, before: w.msgs[0].id });
      return;
    }
    panelOpen = !panelOpen;
    draw();
  });
  // Bấm ra ngoài / Esc: đóng danh sách bạn bè
  document.addEventListener('click', (e) => { if (panelOpen && !root.contains(e.target)) { panelOpen = false; draw(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelOpen) { panelOpen = false; draw(); } });

  // ------------------------------------------------------------ Tin nhắn từ máy chủ
  N.on('dmHistory', (m) => {
    const w = wins.find((x) => x.id === m.peer);
    if (!w) return;
    const first = w.loading;
    w.loading = false;
    const known = new Set(w.msgs.map((x) => x.id));
    w.msgs = [...m.msgs.filter((x) => !known.has(x.id)), ...w.msgs];
    w.more = m.more;
    w.stick = first;
    draw();
    if (first && w.open) markRead(w);
  });

  N.on('dm', (m) => {
    if (!wide.matches) return; // điện thoại: social.js báo như cũ
    const mine = S.me && m.msg.sender === S.me.uid;
    let w = wins.find((x) => x.id === m.peer);
    if (!w && mine) return;
    if (!w) { // tin mới từ người chưa mở: hiện chat head (như Messenger)
      w = { id: m.peer, open: false, msgs: [], more: false, loading: true, unread: 0 };
      wins.push(w);
      N.send({ t: 'dmHistory', peer: m.peer });
    } else if (!w.loading && !w.msgs.some((x) => x.id === m.msg.id)) w.msgs.push(m.msg);
    if (mine) { w.stick = true; draw(); return; }
    if (w.open && document.activeElement && root.contains(document.activeElement)) markRead(w);
    else w.unread++;
    w.stick = w.open;
    draw();
  });

  N.on('friends', draw);
  N.on('close', draw);
  window.addEventListener('caro:online', draw);
  window.addEventListener('caro:page', draw);
  window.addEventListener('caro:board', () => setTimeout(draw, 0));
  window.addEventListener('langchange', draw);
  wide.addEventListener('change', draw);
  setInterval(() => { if (!root.hidden && (panelOpen || wins.length)) draw(); }, 30000); // "x phút trước"
  draw();

  window.CaroChatBubbles = {
    open,
    /** Bong bóng đang dùng (màn hình rộng, đã đăng nhập): tin mới hiện ở chat head – social.js khỏi báo thông báo nhỏ. */
    active: () => wide.matches && signedIn(),
    /** Cửa sổ chat với người này đang mở (không thu nhỏ). */
    isOpen: (id) => wins.some((w) => w.id === id && w.open),
  };
})();
