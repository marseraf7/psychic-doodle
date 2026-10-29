/*
 * Câu lạc bộ (học theo Team của Lichess): danh sách CLB, trang CLB (biểu tượng, giới thiệu, mô tả + phần chỉ thành viên
 * thấy, thông báo ghim, tin gửi toàn CLB, thành viên xếp theo Elo – lọc người đang online, ngày vào; giải của CLB),
 * tạo CLB, gửi yêu cầu vào kèm lời nhắn. Trang Quản lý CLB (cài đặt, phân quyền, duyệt, chặn, gửi tin): club-admin.js.
 * Nạp sau tour.js.
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
    return `<li><button type="button" class="titem" data-act="club" data-id="${esc(c.id)}">${logo(c.name, c.icon)}
      <span class="pn"><b>${esc(c.name)}</b><small>${esc(T('members_n', { n: c.count }))} · ${esc(T('join_' + c.join))}</small>${c.intro ? `<small>${esc(c.intro)}</small>` : ''}</span>
      <span class="tags">${tags.join('')}</span></button></li>`;
  }
  function pageClubs() {
    setTitle('clubs_title');
    let html = `<div class="row"><button type="button" class="primary" data-act="clubNew" ${me() ? '' : 'disabled'}>${icon('plus')}${esc(T('club_create'))}</button>
      <button type="button" class="ghost" data-act="clubRanking">${icon('trophy')}${esc(T('cr_title'))}</button>
      <input id="club-q" placeholder="${esc(T('club_search'))}" maxlength="40" value="${esc(D.clubQ || '')}"></div>`;
    if (!me()) html += needLogin();
    if (!D.clubs) return html + `<p class="hint">…</p>`;
    if (D.myClubs && D.myClubs.length) html += `<h4>${esc(T('my_clubs'))}</h4><ul class="tlist">${D.myClubs.map(clubItem).join('')}</ul>`;
    html += `<h4>${esc(T('all_clubs'))}</h4><ul class="tlist">${D.clubs.map(clubItem).join('') || `<li class="empty">${esc(T('club_none'))}</li>`}</ul>`;
    return html;
  }
  const day = (ms) => new Intl.DateTimeFormat(document.documentElement.lang || 'vi', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(ms);
  function pageClub() {
    const c = D.club;
    if (!c) { setTitle('clubs_title'); return `<p class="hint">…</p>`; }
    setTitle(null, c.name);
    const uid = me() && me().uid;
    const can = (p) => (c.perms || []).includes(p);
    let html = `<div class="chead">${logo(c.name, c.icon)}<div class="pn"><b>${esc(c.name)}</b><small>${esc(T('members_n', { n: c.count }))} · ${esc(T('join_' + c.join))} · ${esc(T('club_owner_name', { name: c.owner }))}</small>${c.intro ? `<small>${esc(c.intro)}</small>` : ''}</div></div>`;
    if (c.status === 'pending') html += `<p class="note">${esc(T('club_pending_note'))}</p>`;
    if (c.status === 'rejected') html += `<p class="note bad">${esc(T('club_rejected_note'))}${c.reviewNote ? ': ' + esc(c.reviewNote) : ''}</p>`;
    if (c.announcement) html += `<p class="announce">${icon('pin')}${esc(c.announcement)}</p>`;
    if (c.desc) html += `<p class="tdesc">${esc(c.desc)}</p>`;
    if (c.privDesc) html += `<div class="note priv">${icon('lock')}<p>${esc(c.privDesc)}</p></div>`; // chỉ thành viên thấy
    const b = [];
    if (me() && c.status === 'approved' && !c.role) {
      if (c.join === 'code') b.push(`<input id="club-code" placeholder="${esc(T('club_code'))}" maxlength="12" autocapitalize="characters">`);
      if (c.join === 'request' && !c.requested) b.push(`<textarea id="club-msg" rows="2" maxlength="300" placeholder="${esc(T('club_req_msg_ph'))}"></textarea>`);
      b.push(c.requested ? `<span class="pill wait">${esc(T('club_requested'))}</span>`
        : `<button type="button" class="primary" data-act="clubJoin">${esc(T(c.join === 'request' ? 'club_request' : 'club_join'))}</button>`);
    }
    if (c.role && c.role !== 'owner') b.push(`<button type="button" class="ghost" data-act="clubLeave">${esc(T('club_leave'))}</button>`);
    if (can('tours') && c.status === 'approved') b.push(`<button type="button" class="ghost" data-act="tourNewClub">${icon('trophy')}${esc(T('club_new_tour'))}</button>`);
    if (c.officer) b.push(`<button type="button" class="ghost" data-act="clubAdmin">${icon('gear')}${esc(T('club_manage'))}${c.requests.length ? ` <i class="count">${c.requests.length}</i>` : ''}</button>`);
    b.push(`<button type="button" class="ghost" data-act="clubShare">${icon('link')}${esc(T('share'))}</button>`);
    if (!me()) b.push(`<span class="hint">${esc(T('tour_login_hint'))}</span>`);
    html += `<div class="row tactions">${b.join('')}</div>`;
    // Tin gửi toàn CLB (thành viên): mới nhất trước; tự tắt / bật nhận tin
    if (c.role) {
      html += `<h4>${esc(T('club_msgs'))}</h4>${c.msgs.length ? `<ul class="club-msgs">${c.msgs.slice(0, 3).map((m) => `<li><p>${esc(m.text)}</p><small class="muted">${esc(m.by)} · ${esc(day(m.at))}</small></li>`).join('')}</ul>` : `<p class="hint">${esc(T('club_msgs_none'))}</p>`}
        <label class="check"><input type="checkbox" data-act="clubMute" ${c.muted ? '' : 'checked'}> <span>${esc(T('club_msgs_receive'))}</span></label>`;
    }
    if (K.clubTalkHtml) html += K.clubTalkHtml(c); // chat + diễn đàn (club-talk.js)
    if (K.clubCupHtml && c.status === 'approved') html += K.clubCupHtml(c); // tủ cúp, thách đấu, xếp hạng CLB (club-match.js)
    if (c.tours && c.tours.length) html += `<h4>${esc(T('club_tours'))}</h4><ul class="tlist">${c.tours.map(tourItem).join('')}</ul>`;
    // Thành viên: lọc tất cả / đang online
    const list = D.clubFilter === 'online' ? c.members.filter((m) => m.status !== 'offline') : c.members;
    html += `<div class="row club-mhead"><h4>${esc(T('club_members_rank'))}</h4>${c.membersHidden ? '' : `<div class="seg sm">${['all', 'online'].map((k) => `<label><input type="radio" name="clubfilter" data-act="clubFilter" value="${k}" ${(D.clubFilter || 'all') === k ? 'checked' : ''}> <span>${esc(T('club_filter_' + k))}</span></label>`).join('')}</div>`}</div>`;
    if (c.membersHidden) html += `<p class="hint">${esc(T('club_members_hidden'))}</p>`;
    html += `<ol class="ranks">${list.map((m, i) => {
      const ops = memberOps(c, m, uid);
      return `<li class="${m.id === uid ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="st ${esc(m.status)}"></span>
        <div class="pn"><b>${esc(m.name)}${m.role !== 'member' ? ` <span class="role">${esc(T('role_' + m.role))}</span>` : ''}</b><small>@${esc(m.username)} · ${esc(T('club_joined_at', { d: day(m.joined) }))}</small></div>
        <span class="pts">${m.rating}</span>${ops ? `<select class="mops" data-uid="${esc(m.id)}" data-name="${esc(m.name)}" aria-label="${esc(T('club_manage'))}"><option value="">⋯</option>${ops}</select>` : ''}</li>`;
    }).join('') || `<li class="empty">${esc(T('club_filter_none'))}</li>`}</ol>`;
    return html;
  }
  /** Thao tác với một thành viên theo quyền của mình (máy chủ kiểm lại). */
  function memberOps(c, m, uid) {
    if (!uid || m.id === uid || m.role === 'owner') return '';
    const can = (p) => (c.perms || []).includes(p);
    const ops = [];
    // Đổi vai trò: chủ CLB; quản lý có quyền admin (không đổi được quản lý cũng có quyền admin)
    const setRole = c.isOwner || (can('admin') && !(m.role === 'officer' && (m.perms || []).includes('admin')));
    if (setRole) ops.push(m.role === 'officer' ? `<option value="member">${esc(T('make_member'))}</option>` : `<option value="officer">${esc(T('make_officer'))}</option>`);
    if (c.isOwner) ops.push(`<option value="owner">${esc(T('make_owner'))}</option>`);
    // Cấm nói ở chat / diễn đàn (quyền Kiểm duyệt; máy chủ không cho cấm người cũng có quyền này)
    if (can('mod') && !(m.role === 'officer' && (m.perms || []).includes('mod'))) {
      ops.push((c.talkMuted || []).includes(m.id) ? `<option value="talkon">${esc(T('talk_unmute'))}</option>` : `<option value="talkoff">${esc(T('talk_mute'))}</option>`);
    }
    if (can('kick') && (m.role === 'member' || c.isOwner)) ops.push(`<option value="kick">${esc(T('club_kick'))}</option><option value="ban">${esc(T('club_kick_ban'))}</option>`);
    return ops.join('');
  }
  function pageClubNew() {
    setTitle('club_create');
    if (!me()) return needLogin();
    return `<form id="cf" class="tform">
      <p class="note">${esc(T('review_note_club'))}</p>
      <label class="field"><span>${esc(T('club_name'))}</span><input name="name" maxlength="40" required></label>
      <label class="field"><span>${esc(T('club_intro'))}</span><input name="intro" maxlength="200" placeholder="${esc(T('club_intro_ph'))}"></label>
      ${K.clubIconPicker ? K.clubIconPicker('') : ''}
      <label class="field"><span>${esc(T('club_desc'))}</span><textarea name="desc" maxlength="2000" rows="3"></textarea></label>
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
  K.acts.tourNewClub = () => { if (K.tourDraft) K.tourDraft.begin(D.club.id); open('tourNew', D.club.id); };
  K.acts.clubNew = () => { open('clubNew', null); };
  K.acts.clubShare = (b) => { share(shareLink('club', D.club.id), D.club.name); };
  K.acts.clubJoin = (b) => { O.send({ t: 'clubJoin', id: D.club.id, code: ($('club-code') || {}).value, msg: ($('club-msg') || {}).value }); };
  K.acts.clubAdmin = () => { open('clubAdmin', D.club.id); };
  K.acts.clubMute = (b) => { O.send({ t: 'clubMute', id: D.club.id, mute: !b.checked }); };
  K.acts.clubFilter = (b) => { D.clubFilter = b.value; render(true); };
  K.acts.clubLeave = (b) => { if (confirm(T('confirm_club_leave', { name: D.club.name }))) O.send({ t: 'clubLeave', id: D.club.id }); };
  K.acts.clubReq = (b) => { O.send({ t: 'clubRequest', id: D.club.id, uid: b.dataset.uid, accept: b.dataset.v === '1' }); };

  K.binders.push((body) => {
    body.querySelectorAll('select.mops').forEach((s) => {
      s.onchange = () => {
        const v = s.value, uid = s.dataset.uid, name = s.dataset.name;
        s.value = '';
        if (!v) return;
        if (v === 'kick' || v === 'ban') { if (confirm(T(v === 'ban' ? 'confirm_club_ban' : 'confirm_club_kick', { name }))) O.send({ t: 'clubKick', id: D.club.id, uid, ban: v === 'ban' }); }
        else if (v === 'talkoff' || v === 'talkon') O.send({ t: 'clubTalkMute', id: D.club.id, uid, mute: v === 'talkoff' });
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
        O.send({ t: 'clubCreate', name: cf.name.value.trim(), intro: cf.intro.value.trim(), icon: cf.icon ? cf.icon.value : '', desc: cf.desc.value.trim(), join: cf.join.value });
      };
    }
  });

  // ------------------------------------------------------------ Tin từ máy chủ
  O.on('clubList', (m) => {
    D.clubs = m.clubs;
    D.myClubs = m.mine;
    if (isOpen() && (V.page === 'clubs' || V.page === 'tourNew' || V.page === 'tourAdv')) render(); // form đang mở: render() tự bỏ qua
  });
  O.on('club', (m) => {
    if (m.id !== V.id) return;
    D.club = m.club;
    if (!m.club && isOpen() && /^club/.test(V.page)) { V.stack = []; top('clubs'); return; }
    if (isOpen() && (V.page === 'club' || V.page === 'clubAdmin')) {
      // Đang gõ (lời nhắn, cài đặt, tin gửi) thì không vẽ lại – tránh mất chữ đang gõ
      if (document.activeElement && document.activeElement.closest('#club-msg, #club-set, #club-bc, #cc-form, #fp-form, #ft-form, .fp-edit')) return;
      render();
    }
  });
  O.on('clubCreated', (m) => {
    O.toast(T(m.status === 'pending' ? 'club_sent_review' : 'club_created'));
    V.stack = [{ page: 'clubs', id: null }];
    open('club', m.id, false);
  });
})();
