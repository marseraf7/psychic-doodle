/*
 * Hồ sơ người chơi – mục "Giới thiệu" (mô tả bản thân có định dạng như Challonge: đậm, nghiêng, danh sách, link, ảnh,
 * căn lề… – rich-text.js). Ai cũng xem được; chính chủ có nút Sửa → trình soạn + Lưu / Huỷ.
 * Máy chủ: server/src/hub/profile.js (on_setBio, tối đa 2000 ký tự, che từ tục). profile.js gọi html(p) / bind(...).
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  const R = window.CaroRich;
  if (!N || !R) return;
  const T = window.I18N.t;
  const esc = R.esc;
  let editing = false, draft = null, rerender = null;

  function html(p) {
    if (!p.self) editing = false;
    if (!p.bio && !p.self) return '';
    const head = `<div class="pf-bio-h"><h3>${esc(T('bio_title'))}</h3>${p.self && !editing ? `<button type="button" class="ghost sm" data-bio="edit">${esc(T('bio_edit'))}</button>` : ''}</div>`;
    if (editing) {
      return `<section class="pf-bio">${head}<form id="bio-form">${R.editor('bio', draft != null ? draft : p.bio, { rows: 6, max: 2000 })}
        <p class="err" id="bio-err"></p>
        <div class="row"><button type="button" class="ghost sm" data-bio="cancel">${esc(T('cancel'))}</button><button class="primary sm">${esc(T('bio_save'))}</button></div></form></section>`;
    }
    const body = p.bio ? `<div class="rich">${R.render(p.bio)}</div>` : `<p class="hint">${esc(T('bio_empty'))}</p>`;
    return `<section class="pf-bio">${head}${body}</section>`;
  }

  /** Gắn sự kiện sau mỗi lần vẽ hồ sơ; again() vẽ lại hồ sơ. */
  function bind(body, p, again) {
    rerender = again;
    body.querySelectorAll('[data-bio]').forEach((b) => {
      b.onclick = () => {
        editing = b.dataset.bio === 'edit';
        draft = null;
        again();
        if (editing) { const ta = body.querySelector('#bio-form textarea'); if (ta) ta.focus(); }
      };
    });
    const f = body.querySelector('#bio-form');
    if (!f) return;
    f.addEventListener('input', () => { draft = f.elements.bio.value; }); // giữ chữ đang gõ khi hồ sơ vẽ lại
    f.onsubmit = (e) => {
      e.preventDefault();
      if (!N.send({ t: 'setBio', bio: f.elements.bio.value })) body.querySelector('#bio-err').textContent = T('not_connected');
    };
  }

  // Lưu xong: thoát chế độ sửa, cập nhật hồ sơ đang mở
  N.on('bioSaved', (m) => {
    editing = false;
    draft = null;
    N.toast(T('bio_saved'));
    if (rerender) rerender(m.bio);
  });

  window.CaroProfileBio = { html, bind };
})();
