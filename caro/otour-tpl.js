/*
 * Giải đấu Offline – chọn mẫu giải nổi tiếng ở form tạo giải (dữ liệu: otour-templates.js). Bấm một mẫu: bộ môn, cách ghi
 * kết quả, luật set và các giai đoạn được điền sẵn (vẫn sửa được như thường), kèm mô tả bằng lời và ước tính số trận;
 * nút "Điền N đội mẫu" để thử nhanh; nhập / xuất cấu hình JSON; xem trước bằng lời (otour-spec-io.js – describeSpec).
 * K.otTplHtml(d), K.otDescribe(F) – gọi từ otour.js (pageNew, showEst).
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const TP = window.CaroOTourTemplates;
  const SP = window.CaroOTourSports;
  const IO = window.CaroOTourSpecIO;
  if (!K || !TP || !SP || !IO) return;
  const { T, esc, render, $ } = K;

  K.otTplHtml = (d) => {
    const cards = TP.TEMPLATES.map((x) => `<button type="button" class="tpl-card ${d.tpl === x.id ? 'on' : ''}" data-act="otTpl" data-id="${esc(x.id)}" aria-pressed="${d.tpl === x.id}">
      <span class="ti">${x.icon}</span><b>${esc(T('tpl_' + x.id))}</b><small>${esc(T('tpl_n', { n: x.n }))}</small></button>`).join('');
    const cur = d.tpl && TP.byId(d.tpl);
    const desc = cur ? `<div class="tpl-desc"><p>${esc(T('tpl_' + cur.id + '_d'))}</p>
      <div class="row"><button type="button" class="ghost sm" data-act="otTplTeams">${esc(T('tpl_fill', { n: cur.n }))}</button>
      <button type="button" class="ghost sm" data-act="otTplOff">${esc(T('tpl_off'))}</button></div></div>` : `<small class="hint">${esc(T('tpl_hint'))}</small>`;
    // Nhập / xuất cấu hình JSON (file xuất từ trang giải, hoặc chatbot viết theo /api/otour/schema.json)
    const io = K.fold('otf:io', esc(T('ot_io')), () => `<p class="hint">${esc(T('ot_io_hint'))}</p><textarea id="otf-json" rows="6" spellcheck="false"></textarea>
      <p class="err" id="otf-json-err"></p><div class="row"><button type="button" class="ghost sm" data-act="otIoCopy">${esc(T('ot_io_copy'))}</button>
      <button type="button" class="primary sm" data-act="otIoApply">${esc(T('ot_io_apply'))}</button></div>`, false);
    return `<div class="field ot-tpl"><span>${esc(T('tpl_pick'))}</span><div class="tpl-cards">${cards}</div>${desc}${io}</div>`;
  };

  /** Bản cấu hình đang soạn trong form. */
  const cur = (F) => ({ sport: F.d.sport, result: F.d.result, ...(F.d.result === 'sets' ? { set: F.d.set } : {}), stages: F.stages });
  /** Xem trước bằng lời (gọi mỗi lần form đổi – otour.js showEst). */
  K.otDescribe = (F) => {
    const el = $('otf-desc');
    if (el) el.innerHTML = `<b>${esc(T('ot_desc_title'))}</b><ul>${IO.describeSpec(cur(F), T).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  };
  K.acts.otIoCopy = () => {
    const fm = K.otForm;
    if (!fm) return;
    fm.collect();
    const text = JSON.stringify(cur(fm.F), null, 2);
    $('otf-json').value = text;
    try { navigator.clipboard.writeText(text).catch(() => {}); } catch (e) { /* bộ nhớ tạm bị chặn: vẫn có trong ô */ }
  };
  /** Áp một bản cấu hình (đã qua parseSpec) vào form – dùng chung: nhập JSON, trợ lý AI (otour-ai.js). */
  K.otApplySpec = (spec) => {
    const fm = K.otForm;
    if (!fm) return false;
    fm.collect();
    const sp = SP.SPORTS[spec.sport] || SP.SPORTS.other;
    const result = spec.result || sp.result;
    Object.assign(fm.F.d, { tpl: null, sport: spec.sport, result, set: result === 'sets' ? (spec.set !== undefined ? spec.set : fm.sportSet(spec.sport)) : null, preset: 'custom' });
    fm.F.stages = spec.stages;
    render(true);
    return true;
  };
  K.acts.otIoApply = () => {
    const r = IO.parseSpec($('otf-json').value);
    if (r.error) { $('otf-json-err').textContent = T(r.error); return; }
    if (K.otApplySpec(r.spec)) window.CaroConfirm.info(T('ot_io_ok'));
  };

  K.acts.otTpl = (b) => {
    const tpl = TP.byId(b.dataset.id);
    const fm = K.otForm;
    if (!tpl || !fm) return;
    fm.collect();
    const spec = TP.specOf(tpl, SP.SPORTS);
    Object.assign(fm.F.d, { tpl: tpl.id, sport: spec.sport, result: spec.result, set: spec.result === 'sets' ? fm.sportSet(spec.sport) : null, preset: 'custom' });
    if (!fm.F.d.name.trim()) fm.F.d.name = T('tpl_' + tpl.id);
    fm.F.stages = spec.stages;
    render(true);
  };
  K.acts.otTplTeams = () => {
    const fm = K.otForm, tpl = fm && TP.byId(fm.F.d.tpl);
    if (!tpl) return;
    fm.collect();
    fm.F.d.teams = TP.sampleTeams(tpl, T('tpl_team_word')).join('\n');
    render(true);
  };
  K.acts.otTplOff = () => { const fm = K.otForm; if (!fm) return; fm.collect(); fm.F.d.tpl = null; render(true); };
})();
