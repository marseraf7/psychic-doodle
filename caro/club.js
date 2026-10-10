/*
 * Câu lạc bộ (học theo Team của Lichess): danh sách CLB, trang CLB (thông báo, thành viên xếp theo Elo,
 * giải của CLB), tạo CLB, quản lý (duyệt yêu cầu, vai trò, mã mời, giải tán). Nạp sau tour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, V, me, logo, tourItem, setTitle, needLogin, isOpen, open, top, back, render, share, shareLink, icon } = K;

  function clubItem(c) {
    const tags = [];
    if (c.status !== 'approved') tags.push(`<span class="pill ${c.status === 'pending' ? 'wait' : 'off'}">${esc(T('cst_' + c.status))}</span>`);
    if (c.role) tags.push(`<span class="pill mine">${esc(T('role_' + c.role))}</span>`);
    else if (c.requested) tags.push(`<span class="pill wait">${esc(T('club_requested'))}</span>`);
    return `<li><button type="button" class="titem" data-act="club" data-id="${esc(c.id)}">${logo(c.name)}
      <span class="pn"><b>${esc(c.name)}</b><small>${esc(T('members_n', { n: c.count }))} · ${esc(T('join_' + c.join))}</small>${c.desc ? `<small>${esc(c.desc)}</small>` : ''}</span>
      <span class="tags">${tags.join('')}</span></button></li>`;
  }
  function pageClubs() {
    setTitle('clubs_title');
    let html = `<div class="row"><button type="button" class="primary" data-act="clubNew" ${me() ? '' : 'disabled'}>${icon('plus')}${esc(T('club_create'))}</button>
      <input id="club-q" placeholder="${esc(T('club_search'))}" maxlength="40" value="${esc(D.clubQ || '')}"></div>`;
    if (!me()) html += needLogin();
    if (!D.clubs) return html + `<p class="hint">…</p>`;
    if (D.myClubs && D.myClubs.length) html += `<h4>${esc(T('my_clubs'))}</h4><ul class="tlist">${D.myClubs.map(clubItem).join('')}</ul>`;
    html += `<h4>${esc(T('all_clubs'))}</h4><ul class="tlist">${D.clubs.map(clubItem).join('') || `<li class="empty">${esc(T('club_none'))}</li>`}</ul>`;
    return html;
  }
  function pageClub() {
    const c = D.club;
    if (!c) { setTitle('clubs_title'); return `<p class="hint">…</p>`; }
    setTitle(null, c.name);
    const uid = me() && me().uid;
    let html = `<div class="chead">${logo(c.name)}<div class="pn"><b>${esc(c.name)}</b><small>${esc(T('members_n', { n: c.count }))} · ${esc(T('join_' + c.join))} · ${esc(T('club_owner_name', { name: c.owner }))}</small></div></div>`;
    if (c.status === 'pending') html += `<p class="note">${esc(T('club_pending_note'))}</p>`;
    if (c.status === 'rejected') html += `<p class="note bad">${esc(T('club_rejected_note'))}${c.reviewNote ? ': ' + esc(c.reviewNote) : ''}</p>`;
    if (c.announcement) html += `<p class="announce">${icon('pin')}${esc(c.announcement)}</p>`;
    if (c.desc) html += `<p class="tdesc">${esc(c.desc)}</p>`;
    const b = [];
    if (me() && c.status === 'approved' && !c.role) {
      if (c.join === 'code') b.push(`<input id="club-code" placeholder="${esc(T('club_code'))}" maxlength="12" autocapitalize="characters">`);
      b.push(c.requested ? `<span class="pill wait">${esc(T('club_requested'))}</span>`
        : `<button type="button" class="primary" data-act="clubJoin">${esc(T(c.join === 'request' ? 'club_request' : 'club_join'))}</button>`);
    }
    if (c.role && c.role !== 'owner') b.push(`<button type="button" class="ghost" data-act="clubLeave">${esc(T('club_leave'))}</button>`);
    if (c.officer && c.status === 'approved') b.push(`<button type="button" class="ghost" data-act="tourNewClub">${icon('trophy')}${esc(T('club_new_tour'))}</button>`);
    b.push(`<button type="button" class="ghost" data-act="clubShare">${icon('link')}${esc(T('share'))}</button>`);
    if (!me()) b.push(`<span class="hint">${esc(T('tour_login_hint'))}</span>`);
    html += `<div class="row tactions">${b.join('')}</div>`;
    if (c.officer) {
      html += `<details class="card" id="club-manage" ${D.manageOpen ? 'open' : ''}><summary>${icon('gear')}${esc(T('club_manage'))}</summary>
        <form id="club-edit" class="tform">
          <label class="field"><span>${esc(T('club_announcement'))}</span><input name="announcement" maxlength="300" value="${esc(c.announcement)}"></label>
          <label class="field"><span>${esc(T('club_desc'))}</span><textarea name="desc" maxlength="500" rows="3">${esc(c.desc)}</textarea></label>
          ${c.isOwner || (me() && me().admin) ? `<label class="field"><span>${esc(T('club_join_policy'))}</span><select name="join">${['open', 'request', 'code'].map((j) => `<option value="${j}" ${c.join === j ? 'selected' : ''}>${esc(T('join_' + j))}</option>`).join('')}</select></label>` : ''}
          <button class="primary">${esc(T('save'))}</button>
        </form>
        ${c.code ? `<p>${esc(T('club_code'))}: <b class="code">${esc(c.code)}</b> <button type="button" class="ghost sm" data-act="clubNewCode">${esc(T('club_new_code'))}</button></p>` : ''}
        ${c.isOwner || (me() && me().admin) ? `<button type="button" class="ghost danger sm" data-act="clubDisband">${esc(T('club_disband'))}</button>` : ''}
      </details>`;
      if (c.requests.length) {
        html += `<h4>${esc(T('club_requests', { n: c.requests.length }))}</h4><ul class="people">${c.requests.map((r) => `
          <li><div class="pn"><b>${esc(r.name)}</b><small>${esc(String(r.rating))}</small></div>
          <button type="button" class="ghost sm" data-act="clubReq" data-uid="${esc(r.id)}" data-v="0">${esc(T('decline'))}</button>
          <button type="button" class="primary sm" data-act="clubReq" data-uid="${esc(r.id)}" data-v="1">${esc(T('accept'))}</button></li>`).join('')}</ul>`;
      }
    }
    if (c.tours && c.tours.length) html += `<h4>${esc(T('club_tours'))}</h4><ul class="tlist">${c.tours.map(tourItem).join('')}</ul>`;
    html += `<h4>${esc(T('club_members_rank'))}</h4><ol class="ranks">${c.members.map((m, i) => {
      const ops = [];
      if (m.id !== uid && m.role !== 'owner') {
        if (c.isOwner) {
          ops.push(`<option value="">⋯</option>`);
          ops.push(m.role === 'officer' ? `<option value="member">${esc(T('make_member'))}</option>` : `<option value="officer">${esc(T('make_officer'))}</option>`);
          ops.push(`<option value="owner">${esc(T('make_owner'))}</option>`);
          ops.push(`<option value="kick">${esc(T('club_kick'))}</option>`);
        } else if (c.officer && m.role === 'member') {
          ops.push(`<option value="">⋯</option><option value="kick">${esc(T('club_kick'))}</option>`);
        }
      }
      return `<li class="${m.id === uid ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="st ${m.status}"></span>
        <div class="pn"><b>${esc(m.name)}${m.role !== 'member' ? ` <span class="role">${esc(T('role_' + m.role))}</span>` : ''}</b><small>@${esc(m.username)}</small></div>
        <span class="pts">${m.rating}</span>${ops.length ? `<select class="mops" data-uid="${esc(m.id)}" data-name="${esc(m.name)}" aria-label="${esc(T('club_manage'))}">${ops.join('')}</select>` : ''}</li>`;
    }).join('')}</ol>`;
    return html;
  }
  function pageClubNew() {
    setTitle('club_create');
    if (!me()) return needLogin();
    return `<form id="cf" class="tform">
      <p class="note">${esc(T('review_note_club'))}</p>
      <label class="field"><span>${esc(T('club_name'))}</span><input name="name" maxlength="40" required></label>
      <label class="field"><span>${esc(T('club_desc'))}</span><textarea name="desc" maxlength="500" rows="3"></textarea></label>
      <fieldset><legend>${esc(T('club_join_policy'))}</legend><div class="seg col">${['open', 'request', 'code'].map((j, i) => `<label><input type="radio" name="join" value="${j}" ${i === 0 ? 'checked' : ''}> <span>${esc(T('join_' + j))} – ${esc(T('join_' + j + '_hint'))}</span></label>`).join('')}</div></fieldset>
      <p class="err" id="cf-err"></p>
      <button class="primary wide">${esc(T('club_submit'))}</button>
    </form>`;
  }

  K.pages.clubs = pageClubs;
  K.pages.club = pageClub;
  K.pages.clubNew = pageClubNew;

  // ------------------------------------------------------------ Thao tác
  K.acts.club = (b) => { open('club', b.dataset.id); };
  K.acts.tourNewClub = (b) => { open('tourNew', D.club.id); };
  K.acts.clubNew = () => { open('clubNew', null); };
  K.acts.clubShare = (b) => { share(shareLink('club', D.club.id), D.club.name); };
  K.acts.clubJoin = (b) => { O.send({ t: 'clubJoin', id: D.club.id, code: ($('club-code') || {}).value }); };
  K.acts.clubLeave = (b) => { if (confirm(T('confirm_club_leave', { name: D.club.name }))) O.send({ t: 'clubLeave', id: D.club.id }); };
  K.acts.clubReq = (b) => { O.send({ t: 'clubRequest', id: D.club.id, uid: b.dataset.uid, accept: b.dataset.v === '1' }); };
  K.acts.clubNewCode = (b) => { O.send({ t: 'clubNewCode', id: D.club.id }); };
  K.acts.clubDisband = (b) => { if (confirm(T('confirm_club_disband', { name: D.club.name }))) { O.send({ t: 'clubDisband', id: D.club.id }); back() || top('clubs'); } };

  K.binders.push((body) => {
    body.querySelectorAll('select.mops').forEach((s) => {
      s.onchange = () => {
        const v = s.value, uid = s.dataset.uid, name = s.dataset.name;
        s.value = '';
        if (!v) return;
        if (v === 'kick') { if (confirm(T('confirm_club_kick', { name }))) O.send({ t: 'clubKick', id: D.club.id, uid }); }
        else if (v === 'owner') { if (confirm(T('confirm_club_owner', { name }))) O.send({ t: 'clubRole', id: D.club.id, uid, role: 'owner' }); }
        else O.send({ t: 'clubRole', id: D.club.id, uid, role: v });
      };
    });
    const q = $('club-q');
    if (q) {
      let deb = 0;
      q.oninput = () => { clearTimeout(deb); deb = setTimeout(() => { D.clubQ = q.value; O.send({ t: 'clubList', q: q.value }); }, 300); };
    }
    const cf = $('cf');
    if (cf) {
      cf.onsubmit = (e) => {
        e.preventDefault();
        $('cf-err').textContent = '';
        O.send({ t: 'clubCreate', name: cf.name.value.trim(), desc: cf.desc.value.trim(), join: cf.join.value });
      };
    }
    const cm = $('club-manage');
    if (cm) cm.ontoggle = () => { D.manageOpen = cm.open; }; // giữ trạng thái mở khi trang được vẽ lại
    const ce = $('club-edit');
    if (ce) {
      ce.onsubmit = (e) => {
        e.preventDefault();
        O.send({ t: 'clubUpdate', id: D.club.id, desc: ce.desc.value, announcement: ce.announcement.value, join: ce.join ? ce.join.value : undefined });
        O.toast(T('saved'));
      };
    }
  });

  // ------------------------------------------------------------ Tin từ máy chủ
  O.on('clubList', (m) => {
    D.clubs = m.clubs;
    D.myClubs = m.mine;
    if (isOpen() && (V.page === 'clubs' || V.page === 'tourNew') && !$('tf')) render();
  });
  O.on('club', (m) => {
    if (m.id !== V.id) return;
    D.club = m.club;
    if (!m.club && isOpen() && V.page === 'club') { back() || top('clubs'); return; }
    if (isOpen() && V.page === 'club') {
      // Đang gõ trong form quản lý thì không vẽ lại (tránh mất chữ đang gõ)
      if (document.activeElement && document.activeElement.closest('#club-edit')) return;
      render();
    }
  });
  O.on('clubCreated', (m) => {
    O.toast(T(m.status === 'pending' ? 'club_sent_review' : 'club_created'));
    V.stack = [{ page: 'clubs', id: null }];
    open('club', m.id, false);
  });
})();
