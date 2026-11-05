/*
 * Giải đấu Offline – chọn mẫu giải nổi tiếng ở form tạo giải (dữ liệu: otour-templates.js). Bấm một mẫu: bộ môn, cách ghi
 * kết quả, luật set và các giai đoạn được điền sẵn (vẫn sửa được như thường), kèm mô tả bằng lời và ước tính số trận;
 * nút "Điền N đội mẫu" để thử nhanh. K.otTplHtml(d) – gọi từ otour.js (pageNew).
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const TP = window.CaroOTourTemplates;
  const SP = window.CaroOTourSports;
  if (!K || !TP || !SP) return;
  const { T, esc, render } = K;

  K.otTplHtml = (d) => {
    const cards = TP.TEMPLATES.map((x) => `<button type="button" class="tpl-card ${d.tpl === x.id ? 'on' : ''}" data-act="otTpl" data-id="${esc(x.id)}" aria-pressed="${d.tpl === x.id}">
      <span class="ti">${x.icon}</span><b>${esc(T('tpl_' + x.id))}</b><small>${esc(T('tpl_n', { n: x.n }))}</small></button>`).join('');
    const cur = d.tpl && TP.byId(d.tpl);
    const desc = cur ? `<div class="tpl-desc"><p>${esc(T('tpl_' + cur.id + '_d'))}</p>
      <div class="row"><button type="button" class="ghost sm" data-act="otTplTeams">${esc(T('tpl_fill', { n: cur.n }))}</button>
      <button type="button" class="ghost sm" data-act="otTplOff">${esc(T('tpl_off'))}</button></div></div>` : `<small class="hint">${esc(T('tpl_hint'))}</small>`;
    return `<div class="field ot-tpl"><span>${esc(T('tpl_pick'))}</span><div class="tpl-cards">${cards}</div>${desc}</div>`;
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
