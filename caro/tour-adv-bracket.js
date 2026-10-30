/*
 * Giải đấu – các ô của trang Cài đặt nâng cao như trang tạo giải của Challonge (cắm vào bản nháp qua K.tourDraft.EXT):
 *  - Thông tin cơ bản: URL (link riêng …/?t=<url>, nút đổi ngẫu nhiên) và mô tả có định dạng (thanh công cụ như
 *    Challonge – rich-text.js; dùng cả ở form nhanh).
 *  - Tab "Nhánh đấu" (Advanced options → Bracket): hiện nhãn vòng tự đặt, ẩn số hạt giống, ẩn nhánh xem trước với người
 *    xem, Quick advance (chỉ báo người thắng – giải offline), cho phép đính kèm trận, ảnh chia sẻ kết quả trận, cách xếp
 *    người vào nhánh (luật hạt giống / thứ tự danh sách), dừng giữa hai giai đoạn để kéo thả xếp nhánh.
 * Máy chủ: tour-opts.js. Nạp sau tour-form.js, rich-text.js; trước tour-adv.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K || !K.tourDraft) return;
  const { T, esc, icon, $ } = K;
  const DR = K.tourDraft;
  const R = window.CaroRich;

  const SLUG_RE = /^[a-z0-9][a-z0-9_-]{2,19}$/; // như máy chủ
  const randSlug = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  const linkBase = () => (window.CARO_SERVER || location.origin).replace(/\/+$/, '').replace(/^https?:\/\//, '') + '/?t=';
  const chk = (name, v, label, hint, cls = '') => `<label class="check ${esc(cls)}"><input type="checkbox" name="${name}" ${v ? 'checked' : ''}> <span>${esc(label)}${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</span></label>`;

  Object.assign(DR.EXT.defaults, {
    slug: '', roundLabels: true, hideBracket: false, quickAdvance: false, attachments: false, shareImages: true, placeBy: 'seed', arrangeNext: false,
  });
  // Giải mới: gợi ý sẵn một link ngẫu nhiên (như Challonge), sửa được
  DR.EXT.loaders.push((d) => { if (!d.slug && !DR.F.editId) d.slug = randSlug(); });

  Object.assign(DR.FIELDS, {
    slug: (d) => `<div class="field slug-field"><span>${esc(T('adv_url'))}</span><div class="slug-row"><span class="slug-pre">${esc(linkBase())}</span>
      <input name="slug" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(d.slug || '')}" aria-label="${esc(T('adv_url'))}">
      <button type="button" class="ghost sm icon" data-act="slugShuffle" title="${esc(T('adv_url_shuffle'))}" aria-label="${esc(T('adv_url_shuffle'))}">${icon('retry')}</button></div>
      <small class="hint">${esc(T('adv_url_hint'))}</small></div>`,
    // Mô tả có định dạng (thay ô chữ thường của tour-form.js)
    desc: (d) => (R ? `<div class="field"><span>${esc(T('tour_desc'))}</span>${R.editor('desc', d.desc, { rows: 5, max: 4000 })}</div>`
      : `<label class="field"><span>${esc(T('tour_desc'))}</span><textarea name="desc" maxlength="4000" rows="3">${esc(d.desc)}</textarea></label>`),
    roundLabels: (d) => chk('roundLabels', d.roundLabels, T('adv_round_labels'), T('adv_round_labels_hint')),
    hideBracket: (d) => chk('hideBracket', d.hideBracket, T('adv_hide_bracket'), T('adv_hide_bracket_hint'), 'only-ko'),
    quickAdvance: (d) => chk('quickAdvance', d.quickAdvance, T('adv_quick'), T('adv_quick_hint'), 'only-offline'),
    attachments: (d) => chk('attachments', d.attachments, T('adv_attach'), T('adv_attach_hint'), 'only-ko'),
    shareImages: (d) => chk('shareImages', d.shareImages, T('adv_share_img'), T('adv_share_img_hint'), 'only-ko'),
    // Dừng giữa hai giai đoạn để kéo thả xếp nhánh loại trực tiếp (tour-arrange.js)
    arrangeNext: (d) => chk('arrangeNext', d.arrangeNext, T('adv_arrange'), T('adv_arrange_hint'), 'only-ko'),
    placeBy: (d) => `<label class="field only-ko"><span>${esc(T('adv_place_by'))}</span><select name="placeBy">${['seed', 'list'].map((v) => `<option value="${v}" ${v === d.placeBy ? 'selected' : ''}>${esc(T('adv_place_' + v))}</option>`).join('')}</select>
      <small class="hint">${esc(T('adv_place_hint'))}</small></label>`,
  });

  DR.EXT.validators.push((d) => (d.slug && !SLUG_RE.test(d.slug) ? { key: 'slug', msg: T('srv_tour_slug_bad') } : null));
  DR.EXT.payloads.push((d, { ko }) => ({
    slug: String(d.slug || '').trim().toLowerCase(), roundLabels: !!d.roundLabels, hideBracket: ko && !!d.hideBracket,
    quickAdvance: ko && !!d.offline && !!d.quickAdvance, attachments: ko && !!d.attachments, shareImages: !!d.shareImages,
    placeBy: d.placeBy === 'list' ? 'list' : 'seed', arrangeNext: ko && !!d.arrangeNext,
  }));
  DR.EXT.fromTour.push((d, t) => {
    Object.assign(d, { slug: t.slug || '', roundLabels: t.roundLabels !== false, hideBracket: !!t.hideBracket, quickAdvance: !!t.quickAdvance,
      attachments: !!t.attachments, shareImages: t.shareImages !== false, placeBy: t.placeBy || 'seed', arrangeNext: !!t.arrangeNext });
  });

  K.acts.slugShuffle = () => {
    const f = $('ta') || $('tf');
    if (!f || !f.elements.slug) return;
    f.elements.slug.value = randSlug();
    DR.collect(f);
  };
  // Gõ link: chữ thường, bỏ ký tự không dùng được
  document.addEventListener('input', (e) => {
    if (e.target.name !== 'slug' || !e.target.closest('.slug-field')) return;
    const v = e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
    if (v !== e.target.value) e.target.value = v;
    const f = e.target.form;
    if (f) DR.collect(f, true);
  });
})();
