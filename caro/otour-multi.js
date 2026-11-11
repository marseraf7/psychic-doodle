/*
 * Giải đấu Offline – "giải tổng" gom nhiều giải con kiểu Esports World Cup (đợt 5; máy chủ: hub/otour-multi.js):
 *   K.otMultiHtml(t)  – trang tổng: bảng điểm câu lạc bộ (điểm theo thứ hạng ở từng giải con), các giải con (trạng thái,
 *                        nhà vô địch, mở), lịch thi đấu gộp; ban tổ chức: thêm giải con, gắn giải có sẵn, gỡ, sửa bảng điểm.
 *   K.otParentTag(t)  – trang giải con: liên kết về giải tổng.
 *   K.otMultiForm(d)  – form tạo giải tổng từ mẫu (otour-templates.js – tpl.multi): chọn các giải con sẽ tạo kèm, bảng
 *                        điểm theo hạng, có điền câu lạc bộ mẫu hay không. K.otMultiPick(tpl) – bấm thẻ mẫu.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const TP = window.CaroOTourTemplates;
  const SP = window.CaroOTourSports;
  if (!K || !TP || !SP) return;
  const { O, T, esc, D, icon, render } = K;
  const R = window.CaroRich;
  const $ = (id) => document.getElementById(id);
  const sportIcon = (s) => (SP.SPORTS[s] || SP.SPORTS.other).icon;
  const when = (ms) => new Date(ms).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  K.otParentTag = (t) => (t.parent ? `<p class="ot-parent"><button type="button" class="ghost sm" data-act="otOpenSeason" data-id="${esc(t.parent.id)}">← ${esc(T('multi_parent', { name: t.parent.name }))}</button></p>` : '');

  function clubTable(t) {
    const m = t.multi, kids = m.children.filter((c) => c.status === 'finished');
    if (!m.clubs.length) return `<p class="hint">${esc(T('multi_clubs_none'))}</p>`;
    const cols = kids.length <= 8 ? kids : []; // nhiều giải con quá thì bỏ các cột từng giải
    const head = ['#', T('multi_club'), T('race_pts'), T('multi_wins'), ...cols.map((c) => c.name)];
    const rows = m.clubs.map((c) => `<tr class="${c.inel ? 'dnf' : ''}"><td>${c.inel ? '–' : c.rank}</td><td class="nm">${esc(c.name)}${c.inel ? ` <small class="pill">${esc(T('multi_inel', { n: m.minTop }))}</small>` : ''}</td><td><b>${c.pts}</b></td><td>${c.wins}</td>${cols.map((k) => {
      const r = c.res[k.id];
      return `<td>${r ? `${r.pts} <small class="muted">${esc(T('multi_place', { n: r.place }))}</small>` : ''}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="tscroll"><table class="stand multi-clubs"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function childList(t) {
    const m = t.multi;
    if (!m.children.length) return `<p class="hint">${esc(T('multi_children_none'))}</p>`;
    return `<ul class="multi-kids">${m.children.map((c) => `<li><button type="button" class="ghost multi-kid" data-act="otOpenSeason" data-id="${esc(c.id)}">
      <span class="ti">${sportIcon(c.sport)}</span><b>${esc(c.name)}</b><span class="pill ${esc(c.status)}">${esc(T('ot_st_' + c.status))}</span>
      <small class="muted">${esc(T('ot_n_teams', { n: c.n }))}${c.champ ? ' · ' + esc(T('multi_champ', { name: c.champ })) : ''}</small></button>
      ${t.canManage ? `<button type="button" class="ghost sm icon" data-act="otMultiDetach" data-id="${esc(c.id)}" aria-label="${esc(T('multi_detach'))}" title="${esc(T('multi_detach'))}">${icon('close')}</button>` : ''}</li>`).join('')}</ul>`;
  }

  K.otMultiHtml = (t) => {
    const m = t.multi;
    if (!m) return '';
    const sec = (title, body) => `<section class="ot-sec"><h4>${esc(title)}</h4>${body}</section>`;
    const rules = [T('multi_table_is', { table: m.table.join(' – ') }), m.minTop > 1 ? T('multi_rule_min', { n: m.minTop }) : '', m.needWin ? T('multi_rule_win') : ''].filter(Boolean).join(' ');
    let html = sec(T('multi_clubs'), `<p class="hint">${esc(rules)}</p>${clubTable(t)}`);
    let kids = childList(t);
    if (t.canManage) {
      kids += `${m.hidden ? `<p class="hint">${esc(T('multi_hidden', { n: m.hidden }))}</p>` : ''}<div class="row"><button type="button" class="primary" data-act="otMultiNew">${icon('plus')}${esc(T('multi_add'))}</button></div>
        ${K.fold('multi:cfg:' + t.id, esc(T('multi_manage')), () => `<label class="field"><span>${esc(T('multi_attach'))}</span><input id="multi-attach" placeholder="${esc(T('multi_attach_ph'))}"></label>
          <button type="button" class="ghost sm" data-act="otMultiAttach">${esc(T('multi_attach_btn'))}</button>
          <label class="field"><span>${esc(T('multi_table'))}</span><input id="multi-table" inputmode="numeric" value="${esc(m.table.join(' '))}"><small class="hint">${esc(T('multi_table_hint'))}</small></label>
          <label class="field inline"><span>${esc(T('multi_min_top'))}</span><input id="multi-min" type="number" min="1" max="30" value="${m.minTop || 1}"></label>
          <label class="check"><input type="checkbox" id="multi-win" ${m.needWin ? 'checked' : ''}> <span>${esc(T('multi_need_win'))}</span></label>
          <button type="button" class="ghost sm" data-act="otMultiCfg">${esc(T('multi_table_save'))}</button><p class="err" id="multi-err"></p>`, false)}`;
    }
    html += sec(`${T('multi_children')} (${m.children.length})`, kids);
    if (m.sched.length) {
      html += sec(T('multi_sched'), `<ul class="multi-sched">${m.sched.map((x) => `<li><small class="muted">${esc(when(x.when))}${x.venue ? ' · ' + esc(x.venue) : ''}</small>
        <b>${esc(x.a)}</b> – <b>${esc(x.b)}</b> <button type="button" class="ghost sm" data-act="otOpenSeason" data-id="${esc(x.id)}">${esc(x.game)}</button></li>`).join('')}</ul>`);
    }
    return html;
  };

  // ------------------------------------------------------------ Thao tác ở trang tổng
  K.acts.otMultiNew = () => { // form tạo giải thường, gắn sẵn vào giải tổng này
    const parent = { id: D.ot.id, name: D.ot.name };
    K.acts.otNew();
    if (K.otForm && K.otForm.F.d) { K.otForm.F.d.parent = parent; render(true); }
  };
  K.acts.otMultiDetach = (b) => window.CaroConfirm.ask(T('multi_detach_confirm')).then((ok) => { if (ok) O.send({ t: 'otMultiDetach', id: D.ot.id, child: b.dataset.id }); });
  K.acts.otMultiCfg = () => O.send({ t: 'otMultiCfg', id: D.ot.id, table: $('multi-table').value, minTop: Number($('multi-min').value) || 1, needWin: $('multi-win').checked });
  K.acts.otMultiAttach = () => {
    // Nhận mã giải, link riêng hoặc cả đường dẫn ?o=…
    const raw = $('multi-attach').value.trim(), mt = /[?&]o=([^&#]+)/.exec(raw);
    const key = mt ? decodeURIComponent(mt[1]) : raw;
    if (key) O.send({ t: 'otMultiAttach', id: D.ot.id, child: key });
  };

  // ------------------------------------------------------------ Form tạo giải tổng từ mẫu
  /** Bấm thẻ mẫu có tpl.multi (otour-tpl.js): chuyển form sang chế độ giải tổng. */
  K.otMultiPick = (tpl) => {
    const fm = K.otForm;
    if (!fm) return;
    fm.collect();
    Object.assign(fm.F.d, { tpl: tpl.id, multi: { table: [...tpl.multi.table], minTop: tpl.multi.minTop || 1, needWin: !!tpl.multi.needWin, off: {}, sample: true } });
    if (!fm.F.d.name.trim()) fm.F.d.name = T('tpl_' + tpl.id);
    render(true);
  };
  K.otMultiForm = (d) => {
    const tpl = TP.byId(d.tpl), mu = d.multi;
    const games = tpl.multi.games.map((g) => `<li><label class="check"><input type="checkbox" name="g_${esc(g.key)}" ${mu.off[g.key] ? '' : 'checked'}>
      <span>${sportIcon(g.sport)} <b>${esc(T('ewc_g_' + g.key))}</b> <small class="muted">${esc(T('ewc_g_' + g.key + '_d'))}</small></span></label></li>`).join('');
    return `<form id="otmf" class="tform">
      <div class="tpl-desc"><p>${esc(T('tpl_' + tpl.id + '_d'))}</p><div class="row"><button type="button" class="ghost sm" data-act="otMultiOff">${esc(T('tpl_off'))}</button></div></div>
      <label class="field"><span>${esc(T('tour_name'))}</span><input name="name" maxlength="60" required value="${esc(d.name)}"></label>
      ${K.slugKit ? K.slugKit.field(d.slug, 'o') : ''}
      <div class="field"><span>${esc(T('tour_desc'))}</span>${R ? R.editor('desc', d.desc, { rows: 4, max: 4000 }) : `<textarea name="desc" rows="3" maxlength="4000">${esc(d.desc)}</textarea>`}</div>
      <fieldset><legend>${esc(T('multi_games'))}</legend><ul class="multi-games">${games}</ul><small class="hint">${esc(T('multi_games_hint'))}</small></fieldset>
      <label class="field"><span>${esc(T('multi_table'))}</span><input name="table" inputmode="numeric" value="${esc(mu.table.join(' '))}"><small class="hint">${esc(T('multi_table_hint'))}</small></label>
      <label class="field inline"><span>${esc(T('multi_min_top'))}</span><input name="minTop" type="number" min="1" max="30" value="${mu.minTop || 1}"></label>
      <label class="check"><input type="checkbox" name="needWin" ${mu.needWin ? 'checked' : ''}> <span>${esc(T('multi_need_win'))}</span></label>
      <label class="check"><input type="checkbox" name="sample" ${mu.sample ? 'checked' : ''}> <span>${esc(T('multi_sample'))}</span></label>
      <fieldset><legend>${esc(T('ot_access'))}</legend><div class="seg">${['public', 'link', 'private'].map((k) => `<label><input type="radio" name="access" value="${k}" ${d.access === k ? 'checked' : ''}> <span>${esc(T('ot_acc_' + k))}</span></label>`).join('')}</div></fieldset>
      <p class="err" id="otf-err"></p>
      <button class="primary wide">${esc(T('multi_create'))}</button></form>`;
  };
  /** Đọc form giải tổng vào bản nháp. */
  function collect(f, d) {
    for (const k of ['name', 'slug', 'desc']) if (f.elements[k]) d[k] = f.elements[k].value;
    d.access = (f.querySelector('input[name=access]:checked') || {}).value || 'public';
    const tpl = TP.byId(d.tpl);
    d.multi.table = String(f.elements.table.value).split(/[\s,;]+/).filter(Boolean).map((x) => Math.max(0, Math.floor(Number(x)) || 0));
    d.multi.sample = f.elements.sample.checked;
    d.multi.minTop = Math.max(1, Math.floor(Number(f.elements.minTop.value)) || 1);
    d.multi.needWin = f.elements.needWin.checked;
    d.multi.off = Object.fromEntries(tpl.multi.games.filter((g) => !f.elements['g_' + g.key].checked).map((g) => [g.key, true]));
  }
  K.acts.otMultiOff = () => { const fm = K.otForm; if (!fm) return; Object.assign(fm.F.d, { tpl: null, multi: null }); render(true); };

  K.binders.push(() => {
    const f = $('otmf'), fm = K.otForm;
    if (!f || !fm || !fm.F.d || !fm.F.d.multi) return;
    const d = fm.F.d;
    f.addEventListener('input', () => collect(f, d));
    f.addEventListener('change', () => collect(f, d));
    f.onsubmit = (e) => {
      e.preventDefault();
      collect(f, d);
      if (d.name.trim().length < 3) { $('otf-err').textContent = T('srv_tour_name_short'); return; }
      const tpl = TP.byId(d.tpl);
      const games = tpl.multi.games.filter((g) => !d.multi.off[g.key]).map((g) => ({ name: T('ewc_g_' + g.key), spec: TP.specOf(g, SP.SPORTS),
        teams: d.multi.sample ? Array.from({ length: g.n }, (_, i) => `${T('multi_club_word')} ${i + 1}`) : [] }));
      O.send({ t: 'otCreate', name: d.name.trim(), slug: d.slug.trim().toLowerCase(), desc: d.desc, access: d.access,
        spec: TP.specOf(tpl, SP.SPORTS), teams: [], multi: { table: d.multi.table, minTop: d.multi.minTop, needWin: d.multi.needWin, games } });
    };
  });
  if (!O) return;
  O.on('error', (m) => { if (/^otMulti/.test(m.ctx || '') && $('multi-err')) $('multi-err').textContent = T('srv_' + m.code, m.args || {}); });
})();
