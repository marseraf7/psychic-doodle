/*
 * Câu lạc bộ – trang Quản lý (như Team của Lichess): mỗi khu chỉ hiện với người có quyền tương ứng (máy chủ kiểm lại):
 *  - Cài đặt (settings): biểu tượng, giới thiệu ngắn, mô tả, mô tả chỉ thành viên thấy, thông báo ghim, cách vào + mã
 *    mời, ẩn danh sách thành viên, ai dùng chat / diễn đàn CLB.
 *  - Gửi tin toàn CLB (broadcast): 1 tin / 12 giờ, vào chuông thông báo của thành viên.
 *  - Yêu cầu vào kèm lời nhắn + danh sách đã từ chối (requests); danh sách bị chặn (kick).
 *  - Phân quyền quản lý: 8 quyền tick riêng (chủ CLB / quyền admin).
 *  - Giải tán (chủ CLB).
 *   K.clubIconPicker(cur) – ô chọn biểu tượng (dùng cả ở form tạo CLB). Nạp sau club.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, setTitle, needLogin, me, top } = K;
  const PERMS = ['public', 'settings', 'tours', 'mod', 'requests', 'broadcast', 'kick', 'admin'];
  const ICONS = ['♟️', '🏆', '⚔️', '🔥', '⭐', '🐉', '🦁', '🐯', '🦅', '🐺', '🦊', '🐼', '🌸', '🍀', '⚡', '🌙', '☀️', '🌊', '🎯', '🎓', '🏫', '🏰', '🚀', '💎'];
  const day = (ms) => new Intl.DateTimeFormat(document.documentElement.lang || 'vi', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(ms);

  K.clubIconPicker = (cur) => `<fieldset class="icon-pick"><legend>${esc(T('club_icon'))}</legend>
      <label><input type="radio" name="icon" value="" ${cur ? '' : 'checked'}> <span class="ip-none">${esc(T('club_icon_none'))}</span></label>
      ${ICONS.map((x) => `<label><input type="radio" name="icon" value="${esc(x)}" ${cur === x ? 'checked' : ''}> <span>${esc(x)}</span></label>`).join('')}</fieldset>`;

  const sel = (name, list, cur, prefix) => `<label class="field"><span>${esc(T(prefix))}</span><select name="${name}">${list.map((v) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(T(prefix + '_' + v))}</option>`).join('')}</select></label>`;

  function settingsHtml(c) {
    return `<section class="mg-sec"><h4>${esc(T('club_settings'))}</h4><form id="club-set" class="tform">
      ${K.clubIconPicker(c.icon)}
      <label class="field"><span>${esc(T('club_intro'))}</span><input name="intro" maxlength="200" value="${esc(c.intro)}" placeholder="${esc(T('club_intro_ph'))}"></label>
      <label class="field"><span>${esc(T('club_desc'))}</span><textarea name="desc" maxlength="2000" rows="4">${esc(c.desc)}</textarea></label>
      <label class="field"><span>${esc(T('club_priv_desc'))}</span><textarea name="privDesc" maxlength="1000" rows="2" placeholder="${esc(T('club_priv_desc_ph'))}">${esc(c.privDesc)}</textarea></label>
      <label class="field"><span>${esc(T('club_announcement'))}</span><input name="announcement" maxlength="300" value="${esc(c.announcement)}"></label>
      <label class="field"><span>${esc(T('club_join_policy'))}</span><select name="join">${['open', 'request', 'code'].map((j) => `<option value="${j}" ${c.join === j ? 'selected' : ''}>${esc(T('join_' + j))}</option>`).join('')}</select></label>
      ${c.code ? `<p>${esc(T('club_code'))}: <b class="code">${esc(c.code)}</b> <button type="button" class="ghost sm" data-act="clubNewCode">${esc(T('club_new_code'))}</button></p>` : ''}
      <label class="check"><input type="checkbox" name="hideMembers" ${c.hideMembers ? 'checked' : ''}> <span>${esc(T('club_hide_members'))}</span></label>
      ${sel('chat', ['off', 'officers', 'members'], c.chat, 'club_chat')}
      ${sel('forum', ['off', 'officers', 'members', 'everyone'], c.forum, 'club_forum')}
      <button class="primary">${esc(T('save'))}</button></form></section>`;
  }

  function broadcastHtml(c) {
    const h = Math.ceil((c.msgWait || 0) / 3600000);
    return `<section class="mg-sec"><h4>${esc(T('club_bc'))}</h4><p class="hint">${esc(T('club_bc_hint'))}</p>
      <textarea id="club-bc" rows="3" maxlength="1000" placeholder="${esc(T('club_bc_ph'))}" ${h && !(me() && me().admin) ? 'disabled' : ''}></textarea>
      ${h && !(me() && me().admin) ? `<p class="hint">${esc(T('club_bc_wait', { h }))}</p>` : `<button type="button" class="primary sm" data-act="clubBroadcast">${esc(T('club_bc_send'))}</button>`}</section>`;
  }

  function requestsHtml(c) {
    const reqs = c.requests.map((r) => `<li><div class="pn"><b>${esc(r.name)}</b><small>${esc(String(r.rating))}</small>${r.msg ? `<p class="req-msg">“${esc(r.msg)}”</p>` : ''}</div>
      <button type="button" class="ghost sm" data-act="clubReq" data-uid="${esc(r.id)}" data-v="0">${esc(T('decline'))}</button>
      <button type="button" class="primary sm" data-act="clubReq" data-uid="${esc(r.id)}" data-v="1">${esc(T('accept'))}</button></li>`).join('');
    const declined = c.declined.map((r) => `<li><div class="pn"><b>${esc(r.name)}</b><small>${esc(day(r.at))}</small>${r.msg ? `<p class="req-msg">“${esc(r.msg)}”</p>` : ''}</div>
      <button type="button" class="ghost sm" data-act="clubRecon" data-uid="${esc(r.id)}" data-v="0" title="${esc(T('club_declined_clear_t'))}">${esc(T('club_declined_clear'))}</button>
      <button type="button" class="primary sm" data-act="clubRecon" data-uid="${esc(r.id)}" data-v="1">${esc(T('accept'))}</button></li>`).join('');
    return `<section class="mg-sec"><h4>${esc(T('club_requests', { n: c.requests.length }))}</h4>
      ${reqs ? `<ul class="people">${reqs}</ul>` : `<p class="hint">${esc(T('club_requests_none'))}</p>`}
      ${declined ? `<details class="fold"><summary>${esc(T('club_declined', { n: c.declined.length }))}</summary><ul class="people">${declined}</ul></details>` : ''}</section>`;
  }

  function bannedHtml(c) {
    if (!c.banned.length) return '';
    return `<section class="mg-sec"><h4>${esc(T('club_banned', { n: c.banned.length }))}</h4><ul class="people">${c.banned.map((x) => `<li><div class="pn"><b>${esc(x.name)}</b><small>${esc(day(x.at))}</small></div>
      <button type="button" class="ghost sm" data-act="clubUnban" data-uid="${esc(x.id)}">${esc(T('club_unban'))}</button></li>`).join('')}</ul></section>`;
  }

  /** Phân quyền: mỗi quản lý một hàng 8 ô tick. Quyền admin chỉ chủ CLB tick được; quản lý có admin chỉ chủ CLB sửa. */
  function officersHtml(c) {
    const offs = c.members.filter((m) => m.role === 'officer' && m.perms);
    const rows = offs.map((m) => {
      const locked = !c.isOwner && m.perms.includes('admin');
      return `<li class="staff-row"><div class="pn"><b>${esc(m.name)}</b><small>@${esc(m.username)}</small></div>
        <div class="perm-list">${PERMS.map((p) => `<label class="check" title="${esc(T('cperm_' + p + '_t'))}"><input type="checkbox" data-cperm="${p}" data-uid="${esc(m.id)}" ${m.perms.includes(p) ? 'checked' : ''} ${locked || (p === 'admin' && !c.isOwner) ? 'disabled' : ''}> <span>${esc(T('cperm_' + p))}</span></label>`).join('')}</div></li>`;
    }).join('');
    return `<section class="mg-sec"><h4>${esc(T('club_officers'))}</h4><p class="hint">${esc(T('club_officers_hint'))}</p>
      ${rows ? `<ul class="people staff">${rows}</ul>` : `<p class="hint">${esc(T('club_officers_none'))}</p>`}</section>`;
  }

  function pageClubAdmin() {
    const c = D.club;
    if (!me()) return needLogin();
    if (!c) { setTitle('clubs_title'); return `<p class="hint">…</p>`; }
    setTitle(null, T('club_manage') + ' · ' + c.name, 'gear');
    const can = (p) => (c.perms || []).includes(p);
    if (!c.officer) return `<p class="hint">${esc(T('srv_club_officers_only'))}</p>`;
    let html = '';
    if (can('requests')) html += requestsHtml(c);
    if (can('broadcast') && c.status === 'approved') html += broadcastHtml(c);
    if (can('settings')) html += settingsHtml(c);
    if (can('admin')) html += officersHtml(c);
    if (can('kick')) html += bannedHtml(c);
    if (c.isOwner || (me() && me().admin)) {
      html += `<section class="mg-sec danger-zone"><h4>${esc(T('mg_danger'))}</h4><p class="hint">${esc(T('club_transfer_hint'))}</p>
        <button type="button" class="ghost danger sm" data-act="clubDisband">${esc(T('club_disband'))}</button></section>`;
    }
    return html;
  }
  K.pages.clubAdmin = pageClubAdmin;

  // ------------------------------------------------------------ Thao tác
  const club = () => D.club;
  K.acts.clubReq = (b) => { O.send({ t: 'clubRequest', id: club().id, uid: b.dataset.uid, accept: b.dataset.v === '1' }); };
  K.acts.clubRecon = (b) => { O.send({ t: 'clubReconsider', id: club().id, uid: b.dataset.uid, accept: b.dataset.v === '1' }); };
  K.acts.clubUnban = (b) => { O.send({ t: 'clubUnban', id: club().id, uid: b.dataset.uid }); };
  K.acts.clubNewCode = () => { O.send({ t: 'clubNewCode', id: club().id }); };
  K.acts.clubBroadcast = () => {
    const box = $('club-bc');
    const text = box.value.trim();
    if (!text) return box.focus();
    if (!confirm(T('club_bc_confirm', { n: club().count }))) return;
    O.send({ t: 'clubBroadcast', id: club().id, text });
    box.value = '';
    O.toast(T('club_bc_sent'));
  };
  K.acts.clubDisband = () => {
    if (!confirm(T('confirm_club_disband', { name: club().name }))) return;
    O.send({ t: 'clubDisband', id: club().id });
    K.V.stack = [];
    top('clubs');
  };

  K.binders.push((body) => {
    const f = $('club-set');
    if (f) {
      f.onsubmit = (e) => {
        e.preventDefault();
        O.send({
          t: 'clubUpdate', id: club().id, icon: f.icon.value, intro: f.intro.value, desc: f.desc.value, privDesc: f.privDesc.value,
          announcement: f.announcement.value, join: f.join.value, hideMembers: f.hideMembers.checked, chat: f.chat.value, forum: f.forum.value,
        });
        document.activeElement.blur(); // để bản mới của máy chủ vẽ lại trang
        O.toast(T('saved'));
      };
    }
    body.querySelectorAll('[data-cperm]').forEach((x) => {
      x.onchange = () => {
        const uid = x.dataset.uid;
        const perms = [...body.querySelectorAll(`[data-cperm][data-uid="${CSS.escape(uid)}"]`)].filter((y) => y.checked).map((y) => y.dataset.cperm);
        O.send({ t: 'clubPerms', id: club().id, uid, perms });
      };
    });
  });

  // Tin gửi toàn CLB tới: thông báo nhỏ + chuông (topbar-inbox.js ghi lại)
  O.on('clubMsgs', (m) => {
    const last = m.items[m.items.length - 1];
    if (last && m.items.length === 1) O.toast(T('club_bc_in', { club: last.club.name }));
    if (D.club && m.items.some((x) => x.club.id === D.club.id) && /^club/.test(K.V.page)) O.send({ t: 'clubGet', id: D.club.id });
  });
})();
