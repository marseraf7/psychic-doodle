/*
 * Câu lạc bộ – chat và diễn đàn (Đợt 8; máy chủ: club-talk.js):
 *  - Trang CLB: khung chat (tin mới hiện ngay, chỉ cập nhật khung chat – không vẽ lại cả trang) và danh sách chủ đề.
 *  - Trang chủ đề (clubTopic): các bài theo trang, trả lời, sửa / xoá bài của mình; kiểm duyệt: ghim, khoá, xoá.
 *  - Trang viết chủ đề mới (clubTopicNew).
 * Ai đọc / viết được do máy chủ tính (club.talk); nút kiểm duyệt hiện với quyền 'mod'. Nạp sau club.js.
 *   K.clubTalkHtml(c) – phần chat + diễn đàn đặt vào trang CLB.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, V, me, setTitle, open, back, render, icon } = K;
  const TALK = { chat: null, topics: null, topic: null, topicId: null, loading: null }; // dữ liệu chat / diễn đàn đang xem
  const time = (ms) => new Intl.DateTimeFormat(document.documentElement.lang || 'vi', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(ms);
  const myId = () => me() && me().uid;
  const isMod = () => !!(D.club && (D.club.perms || []).includes('mod'));

  // ------------------------------------------------------------ Chat
  const chatLine = (m) => `<li data-cid="${esc(String(m.id))}"><b>${esc(m.name)}</b> <span>${esc(m.text)}</span> <small class="muted">${esc(time(m.at))}</small>${
    m.uid === myId() || isMod() ? ` <button type="button" class="ghost sm icon cc-del" data-act="ccDel" data-id="${esc(String(m.id))}" aria-label="${esc(T('talk_delete'))}" title="${esc(T('talk_delete'))}">${icon('close')}</button>` : ''}</li>`;
  const chatList = () => (TALK.chat && TALK.chat.id === D.club.id ? TALK.chat.msgs : []);
  function chatHtml(c) {
    const msgs = chatList();
    return `<section class="club-chat"><h4>${esc(T('talk_chat'))}</h4>
      <ul class="cc-log" id="cc-log" aria-live="polite">${msgs.map(chatLine).join('') || `<li class="empty muted">${esc(T('talk_chat_empty'))}</li>`}</ul>
      ${c.talk.chatWrite ? `<form class="row cc-form" id="cc-form"><input id="cc-input" maxlength="300" autocomplete="off" placeholder="${esc(T('talk_chat_ph'))}" aria-label="${esc(T('talk_chat_ph'))}"><button class="primary sm">${esc(T('talk_send'))}</button></form>`
        : `<p class="hint">${esc(T(c.talk.muted ? 'talk_muted_me' : 'talk_chat_readonly'))}</p>`}</section>`;
  }
  /** Chỉ vẽ lại khung chat (giữ chữ đang gõ, cuộn xuống cuối nếu đang ở cuối). */
  function redrawChat() {
    const log = $('cc-log');
    if (!log || !D.club) return;
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.innerHTML = chatList().map(chatLine).join('') || `<li class="empty muted">${esc(T('talk_chat_empty'))}</li>`;
    if (atEnd) log.scrollTop = log.scrollHeight;
  }

  // ------------------------------------------------------------ Diễn đàn: danh sách chủ đề
  const tags = (t) => `${t.pinned ? `<span class="pill">${icon('pin')}${esc(T('talk_pinned'))}</span>` : ''}${t.locked ? `<span class="pill off">${icon('lock')}${esc(T('talk_locked'))}</span>` : ''}`;
  function forumHtml(c) {
    const list = TALK.topics && TALK.topics.id === c.id ? TALK.topics : null;
    if (!list && TALK.loading !== c.id) { TALK.loading = c.id; O.send({ t: 'clubTopics', id: c.id }); }
    const pages = list ? Math.ceil(list.total / 20) : 0;
    return `<section class="club-forum"><div class="row club-mhead"><h4>${esc(T('talk_forum'))}</h4>
        ${c.talk.forumWrite ? `<button type="button" class="ghost sm" data-act="ftNew">${icon('plus')}${esc(T('talk_topic_new'))}</button>` : ''}</div>
      ${!list ? `<p class="hint">…</p>` : list.topics.length ? `<ul class="tlist ft-list">${list.topics.map((t) => `<li><button type="button" class="titem" data-act="ftOpen" data-id="${esc(String(t.id))}">
        <span class="pn"><b>${esc(t.title)}</b><small>${esc(t.name || '?')} · ${esc(T('talk_posts_n', { n: t.posts }))} · ${esc(time(t.last))}</small></span><span class="tags">${tags(t)}</span></button></li>`).join('')}</ul>`
        : `<p class="hint">${esc(T('talk_forum_empty'))}</p>`}
      ${pages > 1 ? pager('ftPage', list.page, pages) : ''}</section>`;
  }
  const pager = (act, page, pages) => `<div class="row pager">${page > 0 ? `<button type="button" class="ghost sm" data-act="${act}" data-p="${page - 1}">‹</button>` : ''}
    <span class="muted">${esc(T('talk_page', { a: page + 1, b: pages }))}</span>${page < pages - 1 ? `<button type="button" class="ghost sm" data-act="${act}" data-p="${page + 1}">›</button>` : ''}</div>`;

  K.clubTalkHtml = (c) => (c.talk && c.talk.chat ? chatHtml(c) : '') + (c.talk && c.talk.forum ? forumHtml(c) : '');

  // ------------------------------------------------------------ Trang một chủ đề
  function pageTopic() {
    const v = TALK.topic;
    if (!v || v.topic.id !== TALK.topicId) { setTitle('talk_forum'); return `<p class="hint">…</p>`; }
    const t = v.topic;
    setTitle(null, t.title);
    let html = `<div class="row">${tags(t)}<span class="muted">${esc(D.club ? D.club.name : '')}</span></div>`;
    if (v.canMod) {
      html += `<div class="row tactions"><button type="button" class="ghost sm" data-act="ftMod" data-k="pinned" data-v="${t.pinned ? 0 : 1}">${icon('pin')}${esc(T(t.pinned ? 'talk_unpin' : 'talk_pin'))}</button>
        <button type="button" class="ghost sm" data-act="ftMod" data-k="locked" data-v="${t.locked ? 0 : 1}">${icon('lock')}${esc(T(t.locked ? 'talk_unlock' : 'talk_lock'))}</button>
        <button type="button" class="ghost sm danger" data-act="ftMod" data-k="del" data-v="1">${esc(T('talk_topic_delete'))}</button></div>`;
    }
    html += `<ol class="ft-posts">${v.posts.map((p) => `<li data-pid="${esc(String(p.id))}"><div class="ft-ph"><b>${esc(p.name || '?')}</b><small class="muted">${esc(time(p.at))}${p.edited ? ' · ' + esc(T('talk_edited')) : ''}</small>
        <span class="ft-ops">${p.uid === myId() ? `<button type="button" class="ghost sm" data-act="fpEdit" data-id="${esc(String(p.id))}">${esc(T('talk_edit'))}</button>` : ''}${
        p.uid === myId() || v.canMod ? `<button type="button" class="ghost sm" data-act="fpDel" data-id="${esc(String(p.id))}">${esc(T('talk_delete'))}</button>` : ''}</span></div>
        <p class="ft-text">${esc(p.text)}</p></li>`).join('')}</ol>`;
    if (v.pages > 1) html += pager('fpPage', v.page, v.pages);
    html += v.canPost ? `<form class="tform" id="fp-form"><label class="field"><span>${esc(T('talk_reply'))}</span><textarea id="fp-text" rows="3" maxlength="4000"></textarea></label>
        <button class="primary">${esc(T('talk_send'))}</button></form>` : `<p class="hint">${esc(T(t.locked ? 'talk_locked_hint' : 'talk_forum_readonly'))}</p>`;
    return html;
  }
  function pageTopicNew() {
    setTitle('talk_topic_new');
    return `<form class="tform" id="ft-form"><label class="field"><span>${esc(T('talk_title'))}</span><input id="ft-title" maxlength="100" required minlength="3"></label>
      <label class="field"><span>${esc(T('talk_content'))}</span><textarea id="ft-text" rows="6" maxlength="4000" required></textarea></label>
      <p class="err" id="ft-err"></p><button class="primary">${esc(T('talk_post'))}</button></form>`;
  }
  K.pages.clubTopic = pageTopic;
  K.pages.clubTopicNew = pageTopicNew;

  const loadTopic = (page) => O.send({ t: 'clubTopic', id: D.club.id, topic: TALK.topicId, page });

  // ------------------------------------------------------------ Thao tác
  K.acts.ccDel = (b) => { O.send({ t: 'clubChatDel', id: D.club.id, msg: Number(b.dataset.id) }); };
  K.acts.ftNew = () => { open('clubTopicNew', D.club.id); };
  K.acts.ftOpen = (b) => { TALK.topicId = Number(b.dataset.id); TALK.topic = null; open('clubTopic', D.club.id); loadTopic(0); };
  K.acts.ftPage = (b) => { O.send({ t: 'clubTopics', id: D.club.id, page: Number(b.dataset.p) }); };
  K.acts.fpPage = (b) => { loadTopic(Number(b.dataset.p)); };
  K.acts.ftMod = (b) => {
    const k = b.dataset.k, on = b.dataset.v === '1';
    if (k === 'del' && !confirm(T('talk_topic_delete_q'))) return;
    O.send({ t: 'clubTopicMod', id: D.club.id, topic: TALK.topicId, [k]: on });
  };
  K.acts.fpDel = (b) => { if (confirm(T('talk_post_delete_q'))) O.send({ t: 'clubPostDel', id: D.club.id, post: Number(b.dataset.id) }); };
  K.acts.fpEdit = (b) => {
    const li = b.closest('li'), p = TALK.topic.posts.find((x) => x.id === Number(b.dataset.id));
    if (!p || li.querySelector('textarea')) return;
    li.querySelector('.ft-text').outerHTML = `<form class="tform fp-edit"><textarea rows="3" maxlength="4000">${esc(p.text)}</textarea><div class="row"><button class="primary sm">${esc(T('save'))}</button></div></form>`;
    const f = li.querySelector('form');
    f.querySelector('textarea').focus();
    f.onsubmit = (e) => { e.preventDefault(); O.send({ t: 'clubPostEdit', id: D.club.id, post: p.id, text: f.querySelector('textarea').value }); };
  };

  K.binders.push((body) => {
    const cf = $('cc-form');
    if (cf) {
      cf.onsubmit = (e) => {
        e.preventDefault();
        const i = $('cc-input'), text = i.value.trim();
        if (!text) return;
        O.send({ t: 'clubChat', id: D.club.id, text });
        i.value = '';
      };
      const log = $('cc-log');
      log.scrollTop = log.scrollHeight;
    }
    const ft = $('ft-form');
    if (ft) {
      ft.onsubmit = (e) => {
        e.preventDefault();
        $('ft-err').textContent = '';
        O.send({ t: 'clubTopicNew', id: D.club.id, title: $('ft-title').value.trim(), text: $('ft-text').value.trim() });
      };
    }
    const fp = $('fp-form');
    if (fp) {
      fp.onsubmit = (e) => {
        e.preventDefault();
        const text = $('fp-text').value.trim();
        if (!text) return;
        TALK.mine = true; // bài của mình: tải xong thì về trang cuối
        O.send({ t: 'clubPost', id: D.club.id, topic: TALK.topicId, text });
        $('fp-text').value = '';
      };
    }
  });

  // ------------------------------------------------------------ Tin từ máy chủ
  const onClubPage = () => K.isOpen() && V.page === 'club' && D.club;
  O.on('clubChatLog', (m) => { TALK.chat = { id: m.id, msgs: m.msgs }; if (onClubPage() && D.club.id === m.id) redrawChat(); });
  O.on('clubChat', (m) => {
    if (!TALK.chat || TALK.chat.id !== m.id) return;
    TALK.chat.msgs.push(m.msg);
    if (TALK.chat.msgs.length > 100) TALK.chat.msgs.shift();
    if (onClubPage()) redrawChat();
  });
  O.on('clubChatDel', (m) => {
    if (!TALK.chat || TALK.chat.id !== m.id) return;
    TALK.chat.msgs = TALK.chat.msgs.filter((x) => x.id !== m.msg);
    if (onClubPage()) redrawChat();
  });
  O.on('clubTopics', (m) => {
    TALK.topics = m;
    TALK.loading = null;
    if (onClubPage() && !(document.activeElement && document.activeElement.closest('#cc-form, #club-msg'))) render();
  });
  O.on('clubTopic', (m) => {
    TALK.topic = m;
    if (K.isOpen() && V.page === 'clubTopic') render(true);
  });
  O.on('clubTopicDirty', (m) => {
    TALK.topics = null; // danh sách chủ đề cần tải lại
    TALK.loading = null;
    // Đang ở trang CLB: vẽ lại – phần diễn đàn tự tải danh sách mới (trừ khi đang gõ)
    if (onClubPage() && D.club.id === m.id && !(document.activeElement && document.activeElement.closest('#cc-form, #club-msg'))) { render(); return; }
    if (m.topic !== TALK.topicId || V.page !== 'clubTopic') return;
    if (m.gone) { back(); return; }
    const mine = TALK.mine;
    TALK.mine = false;
    loadTopic(mine ? -1 : TALK.topic ? TALK.topic.page : 0);
  });
  O.on('clubTopicCreated', (m) => {
    TALK.topics = null;
    TALK.topicId = m.topic;
    TALK.topic = null;
    if (V.page === 'clubTopicNew') open('clubTopic', m.id, false); // thay trang viết bằng trang chủ đề (quay lại: về trang CLB)
    loadTopic(0);
  });
  O.on('clubTopicModDone', (m) => { TALK.topics = null; if (m.del && V.page === 'clubTopic') back(); });
})();
