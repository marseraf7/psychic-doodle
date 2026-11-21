/*
 * Lớp học / Nghiên cứu (C2) – danh sách + tạo bài: Xem thêm › "Lớp học" mở hộp #cls-dlg: Bài của tôi · Lớp của CLB ·
 * Bài công khai; form tạo bài (tiêu đề, quyền xem; chủ / quản lý CLB chọn được "Lớp của CLB"). Mở bài: class-view.js.
 * Link chia sẻ /?cls=<mã> tự mở bài khi đã kết nối máy chủ. Máy chủ: server/src/hub/classroom.js.
 *   window.CaroClassroom = { openList(), open(id) }
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  const App = window.CaroApp;
  if (!N || !App) return;
  const T = (k, a) => window.I18N.t(k, a);
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  let list = null; // { mine, pub, club, myClubs }
  const signedIn = () => !!(N.state.me && !N.state.me.guest);

  function dlg() {
    let d = $('cls-dlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'cls-dlg'; d.className = 'wide-dlg'; document.body.appendChild(d); }
    return d;
  }
  const VIS = ['public', 'unlisted', 'private'];
  function row(s) {
    const meta = [T('cls_vis_' + s.vis), T('cls_chapters_n', { n: s.chapters }), s.clubName ? s.clubName : s.ownerName].filter(Boolean).join(' · ');
    return `<li><button type="button" class="cls-row" data-cls="${esc(s.id)}"><span class="ellip"><b>${esc(s.title)}</b></span><small class="ellip">${esc(meta)}</small></button></li>`;
  }
  function body() {
    if (!list) return `<p class="hint">…</p>`;
    const sec = (k, arr) => `<h3 class="list-h">${esc(T(k))}</h3>` + (arr.length ? `<ul class="cls-list">${arr.map(row).join('')}</ul>` : `<p class="hint">${esc(T('cls_none'))}</p>`);
    const pub = list.pub.filter((s) => !list.mine.some((m) => m.id === s.id));
    return (signedIn() ? sec('cls_mine', list.mine) : '') + (list.club.length ? sec('cls_club_list', list.club) : '') + sec('cls_public', pub);
  }
  function draw() {
    const d = $('cls-dlg');
    if (!d || !d.open) return;
    d.querySelector('.cls-body').innerHTML = body();
    const sel = d.querySelector('select[name=club]');
    if (sel && list) {
      sel.closest('label').hidden = !list.myClubs.length;
      const cur = sel.value;
      sel.innerHTML = `<option value="">${esc(T('cls_no_club'))}</option>` + list.myClubs.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
      sel.value = cur;
    }
  }
  function openList() {
    const d = dlg();
    const form = signedIn() ? `<form class="cls-form" autocomplete="off">
        <label class="cls-f"><span>${esc(T('cls_title_f'))}</span><input name="title" required minlength="3" maxlength="80"></label>
        <label class="cls-f"><span>${esc(T('cls_vis'))}</span><select name="vis">${VIS.map((v) => `<option value="${v}"${v === 'unlisted' ? ' selected' : ''}>${esc(T('cls_vis_' + v))}</option>`).join('')}</select></label>
        <label class="cls-f" hidden><span>${esc(T('cls_club'))}</span><select name="club"></select></label>
        <button type="submit" class="primary">${esc(T('cls_create'))}</button></form>` : `<p class="hint">${esc(T('cls_need_account'))}</p>`;
    d.innerHTML = `<div class="dlg"><h2>${esc(T('cls_title'))}</h2><p class="hint">${esc(T('cls_sub'))}</p>${form}<div class="cls-body"></div>
      <div class="row"><button type="button" class="ghost" data-close>${esc(T('close'))}</button></div></div>`;
    const f = d.querySelector('form');
    if (f) f.onsubmit = (e) => { e.preventDefault(); N.send({ t: 'clsCreate', title: f.title.value.trim(), vis: f.vis.value, club: f.club.value || null }); };
    d.querySelector('[data-close]').onclick = () => d.close();
    if (!d.open) d.showModal();
    draw();
    N.send({ t: 'clsList' });
  }
  dlg().addEventListener('click', (e) => {
    const b = e.target.closest('[data-cls]');
    if (!b) return;
    dlg().close();
    open(b.dataset.cls);
  });
  function open(id) { N.send({ t: 'clsOpen', id }); }

  N.on('clsList', (m) => { list = m; draw(); });
  N.on('clsCreated', (m) => { const d = $('cls-dlg'); if (d && d.open) d.close(); open(m.id); });
  // Link /?cls=<mã>: mở bài khi đã kết nối (khách cũng xem được bài công khai / có link)
  let pending = new URLSearchParams(location.search).get('cls');
  if (pending && !/^[0-9a-f]{12}$/.test(pending)) pending = null;
  N.on('welcome', () => {
    if (!pending) return;
    const id = pending;
    pending = null;
    const u = new URL(location.href);
    u.searchParams.delete('cls');
    history.replaceState(null, '', u);
    open(id);
  });
  if (pending) N.connect();
  window.addEventListener('langchange', draw);
  const more = $('more-cls');
  if (more) more.onclick = openList;

  window.CaroClassroom = { openList, open };
})();
