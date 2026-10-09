/*
 * Giải đấu – xếp bảng (như Challonge): trước khi giải bắt đầu, ban tổ chức xem các bảng dự kiến của vòng bảng
 * và tự chuyển người chơi giữa các bảng (kéo thả trên máy tính, hoặc chọn bảng ở cuối dòng trên điện thoại).
 * Bấm Lưu thì máy chủ giữ cách xếp này khi bốc thăm; người đăng ký sau tự vào bảng ít người nhất.
 * Dữ liệu: tourView().groupDraft (chỉ gửi cho ban tổ chức). Nạp sau tour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, D, render } = K;

  // Bản nháp đang sửa (chưa lưu) của giải đang xem
  // hold: bản nháp của máy chủ lúc vừa bấm Lưu; còn nhận đúng bản đó thì vẫn hiện cách xếp vừa lưu
  const G = { id: null, groups: null, dirty: false, hold: null };
  const groupName = (g) => (g < 26 ? '' : String.fromCharCode(64 + Math.floor(g / 26))) + String.fromCharCode(65 + (g % 26));

  /** Lấy bản nháp: giữ chỗ đang sửa, nhưng bỏ người đã rút và thêm người mới đăng ký (vào bảng ít người nhất). */
  function draft(t) {
    const src = t.groupDraft.groups;
    if (G.id === t.id && G.hold === t.groupDraft) return G.groups;
    G.hold = null;
    if (G.id !== t.id || !G.dirty) {
      G.id = t.id;
      G.groups = src.map((g) => g.map((p) => ({ ...p })));
      G.dirty = false;
      return G.groups;
    }
    const all = new Map(src.flat().map((p) => [p.uid, p]));
    G.groups = G.groups.map((g) => g.filter((p) => all.has(p.uid)));
    const placed = new Set(G.groups.flat().map((p) => p.uid));
    for (const p of all.values()) {
      if (placed.has(p.uid)) continue;
      G.groups.reduce((a, b) => (b.length < a.length ? b : a), G.groups[0]).push({ ...p });
    }
    return G.groups;
  }

  function groupsHtml(t) {
    if (!t.canManage || !t.groupDraft) return '';
    const groups = draft(t);
    const max = t.groupDraft.max;
    const warn = [];
    groups.forEach((g, i) => {
      if (g.length > max) warn.push(T('group_too_big', { name: groupName(i), n: max }));
      else if (g.length === 1) warn.push(T('group_too_small', { name: groupName(i) }));
    });
    const opts = (i) => groups.map((_, j) => (j === i ? '' : `<option value="${j}">${esc(T('group_name', { name: groupName(j) }))}</option>`)).join('')
      + `<option value="new">${esc(T('group_new'))}</option>`;
    const cards = groups.map((g, i) => `<div class="grp-card ${g.length > max ? 'bad' : ''}" data-grp="${i}">
        <h5>${esc(T('group_name', { name: groupName(i) }))} <span class="muted">(${g.length})</span></h5>
        <ul class="grp-list">${g.map((p) => `<li draggable="true" data-uid="${esc(p.uid)}"><span class="grip" aria-hidden="true">⋮⋮</span><span class="nm">${esc(p.name)}</span>
          <select class="grp-move" data-uid="${esc(p.uid)}" aria-label="${esc(T('group_move'))}"><option value="">→</option>${opts(i)}</select></li>`).join('')
          || `<li class="empty muted">—</li>`}</ul></div>`).join('');
    const hint = T(t.groupDraft.manual ? 'groups_hint_manual' : 'groups_hint_auto') + (t.seeding === 'random' && !t.groupDraft.manual ? ' ' + T('groups_random_note') : '');
    const body = `<p class="hint">${esc(hint)}</p><p class="hint">${esc(T('groups_drag_hint'))}</p>
      <div class="grp-grid">${cards}</div>
      ${warn.length ? `<p class="note bad">${warn.map(esc).join('<br>')}</p>` : ''}
      <div class="row tactions">
        <button type="button" class="ghost sm" data-act="grpAdd">＋ ${esc(T('group_add'))}</button>
        ${G.dirty ? `<button type="button" class="ghost sm" data-act="grpDiscard">${esc(T('groups_discard'))}</button>` : ''}
        ${t.groupDraft.manual ? `<button type="button" class="ghost sm" data-act="grpAuto">${esc(T('groups_auto'))}</button>` : ''}
        <button type="button" class="primary sm" data-act="grpSave" ${G.dirty && !groups.some((g) => g.length > max) ? '' : 'disabled'}>${esc(T('groups_save'))}</button>
      </div>`;
    const title = `<b>${esc(T('groups_title'))}</b> <span class="muted">${esc(T('groups_n', { n: groups.length }))}${G.dirty ? ' · ' + esc(T('unsaved')) : ''}</span>`;
    return K.fold(t.id + ':grp', title, body, true);
  }

  /** Chuyển một người sang bảng khác (to = số thứ tự bảng, hoặc 'new' = bảng mới). */
  function move(uid, to) {
    const from = G.groups.findIndex((g) => g.some((p) => p.uid === uid));
    if (from < 0) return;
    const p = G.groups[from].find((x) => x.uid === uid);
    if (to === 'new') { G.groups.push([]); to = G.groups.length - 1; }
    to = Number(to);
    if (!G.groups[to] || to === from) return;
    G.groups[from] = G.groups[from].filter((x) => x.uid !== uid);
    G.groups[to].push(p);
    G.dirty = true;
    render(true);
  }

  K.groupsHtml = groupsHtml;
  K.acts.grpAdd = () => { G.groups.push([]); G.dirty = true; render(true); };
  K.acts.grpDiscard = () => { G.dirty = false; render(true); };
  K.acts.grpAuto = () => { G.dirty = false; O.send({ t: 'tourGroups', id: D.tour.id, groups: null }); };
  K.acts.grpSave = () => {
    O.send({ t: 'tourGroups', id: D.tour.id, groups: G.groups.filter((g) => g.length).map((g) => g.map((p) => p.uid)) });
    G.dirty = false;
    G.hold = D.tour.groupDraft;
    O.toast(T('groups_saved'));
  };
  K.binders.push((body) => {
    body.querySelectorAll('select.grp-move').forEach((s) => { s.onchange = () => { if (s.value) move(s.dataset.uid, s.value); }; });
    // Kéo thả (máy tính)
    body.querySelectorAll('.grp-list li[draggable]').forEach((li) => {
      li.ondragstart = (e) => { e.dataTransfer.setData('text/plain', li.dataset.uid); e.dataTransfer.effectAllowed = 'move'; };
    });
    body.querySelectorAll('.grp-card').forEach((card) => {
      card.ondragover = (e) => { e.preventDefault(); card.classList.add('over'); };
      card.ondragleave = () => card.classList.remove('over');
      card.ondrop = (e) => {
        e.preventDefault();
        card.classList.remove('over');
        move(e.dataTransfer.getData('text/plain'), card.dataset.grp);
      };
    });
  });
})();
