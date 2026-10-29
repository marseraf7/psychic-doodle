/*
 * Giải đấu – mẫu giải, sao chép giải, giải định kỳ (Đợt 10; máy chủ: tour-tpl.js):
 *  - Form nhanh: hàng "Mẫu của tôi" (chọn mẫu → điền form; xoá mẫu). Trang nâng cao: nút "Lưu thành mẫu".
 *    Mẫu = bản nháp của form (thể thức, giai đoạn, cài đặt) trừ giờ bắt đầu; mỗi người tối đa 10 mẫu.
 *  - Tab Quản lý: "Sao chép giải" – mở trang nâng cao với cài đặt của giải này, giờ đấu lùi 1 ngày.
 *  - Tab Cơ bản của trang nâng cao: "Lặp lại" (không / hằng tuần / hằng tháng).
 *   K.tplRow(), K.tplSaveBtn(), K.cloneHtml(t). Nạp sau tour-form.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K || !K.tourDraft) return;
  const { O, T, esc, $, D, V, open, render, icon } = K;
  const DR = K.tourDraft;
  const P = { list: null, asked: false };

  // ------------------------------------------------------------ Mẫu giải
  K.tplRow = () => {
    if (!P.asked) { P.asked = true; O.send({ t: 'tourTpls' }); }
    if (!P.list || !P.list.length) return '';
    return `<div class="row tpl-row"><label class="field inline"><span>${esc(T('tpl_mine'))}</span><select id="tpl-pick"><option value="">—</option>${P.list.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
      <button type="button" class="ghost sm" data-act="tplUse">${esc(T('tpl_use'))}</button>
      <button type="button" class="ghost sm icon" data-act="tplDel" aria-label="${esc(T('tpl_del'))}" title="${esc(T('tpl_del'))}">${icon('trash')}</button></div>`;
  };
  K.tplSaveBtn = () => `<button type="button" class="ghost sm" data-act="tplSave">${icon('book')}${esc(T('tpl_save'))}</button>`;
  const picked = () => { const s = $('tpl-pick'); return s && P.list ? P.list.find((x) => x.id === s.value) : null; };

  K.acts.tplUse = () => {
    const x = picked();
    if (!x) return;
    const d = x.data || {};
    // Giữ giờ bắt đầu đang có (mẫu không có giờ), còn lại lấy từ mẫu
    DR.F.d = { ...DR.blank(), ...(d.d || {}), start: DR.F.d ? DR.F.d.start : DR.blank().start };
    if (d.preset && DR.PRESETS[d.preset] !== undefined) DR.F.preset = d.preset;
    DR.F.stages = Array.isArray(d.stages) ? d.stages : DR.PRESETS[DR.F.preset] ? DR.PRESETS[DR.F.preset]() : null;
    DR.saveDraft();
    O.toast(T('tpl_used', { name: x.name }));
    render(true);
  };
  K.acts.tplDel = () => {
    const x = picked();
    if (x && confirm(T('tpl_del_q', { name: x.name }))) O.send({ t: 'tourTplDel', id: x.id });
  };
  K.acts.tplSave = () => {
    const form = $('ta') || $('tf');
    if (form) DR.collect(form);
    const name = prompt(T('tpl_name_q'), (DR.F.d && DR.F.d.name) || '');
    if (name == null || !name.trim()) return;
    const { start, closeAt, ...d } = DR.F.d; // giờ không lưu vào mẫu
    P.list = P.list || []; // lưu xong máy chủ gửi danh sách mới: báo "Đã lưu"
    O.send({ t: 'tourTplSave', name: name.trim(), data: { preset: DR.F.preset, stages: DR.F.stages, d } });
  };
  O.on('tourTpls', (m) => {
    const first = P.list === null;
    P.list = m.list;
    if (!first) O.toast(T('saved'));
    if (K.isOpen() && V.page === 'tourNew' && !(document.activeElement && document.activeElement.closest('#tf'))) render();
  });
  O.on('welcome', () => { P.asked = false; P.list = null; }); // đổi tài khoản: tải lại mẫu

  // ------------------------------------------------------------ Sao chép giải
  K.cloneHtml = () => `<section class="mg-sec"><h4>${esc(T('clone_title'))}</h4><p class="hint">${esc(T('clone_hint'))}</p>
    <button type="button" class="ghost sm" data-act="tourClone">${icon('plus')}${esc(T('clone_btn'))}</button></section>`;
  K.acts.tourClone = () => {
    const t = D.tour;
    DR.fromTour(t);
    DR.F.editId = null; // giải mới, không sửa giải cũ
    const d = new Date(Math.max(Date.now(), t.startsAt + (D.skew || 0)) + 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    DR.F.d.start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    DR.F.d.closeAt = '';
    DR.saveDraft();
    open('tourAdv', null);
  };

  // ------------------------------------------------------------ Giải định kỳ
  Object.assign(DR.EXT.defaults, { recur: '' });
  DR.FIELDS.recur = (d) => `<label class="field"><span>${esc(T('recur'))}</span><select name="recur">${[['', 'recur_none'], ['weekly', 'recur_weekly'], ['monthly', 'recur_monthly']]
    .map(([v, k]) => `<option value="${v}" ${(d.recur || '') === v ? 'selected' : ''}>${esc(T(k))}</option>`).join('')}</select><small class="hint">${esc(T('recur_hint'))}</small></label>`;
  DR.EXT.payloads.push((d) => ({ recur: d.recur || null }));
  DR.EXT.fromTour.push((d, t) => { d.recur = t.recur || ''; });
})();
