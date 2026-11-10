/*
 * Giải đấu Offline – golf đấu gậy kiểu The Masters (hệ Race, cách tính 'golf'; máy chủ: server/src/hub/stages-golf.js).
 * K.golfHtml(t, v) – otour-race.js gọi khi v.cfg.score === 'golf':
 *   - Bảng dẫn đầu: vị trí (đồng hạng "T3"), so với par, vòng đang đánh + "đã đánh tới lỗ", điểm từng vòng, tổng gậy;
 *     vạch cắt, người bị cắt (MC), rút lui (WD); vòng thấp nhất; thống kê từng lỗ (khi nhập từng lỗ).
 *   - Đấu phụ đột tử khi bằng điểm ở hạng nhất: ban tổ chức ghi người thắng + số lỗ đấu phụ.
 *   - Từng vòng: ban tổ chức nhập tổng gậy (mặc định) hoặc từng lỗ, lưu được khi vòng đang dở (bảng dẫn đầu trực tiếp);
 *     dán nhanh cả danh sách; chỉ huỷ được vòng nhập sau cùng.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const RU = window.CaroOTourRules;
  if (!K || !RU) return;
  const { O, T, esc, D, icon } = K;
  const S = { draft: {}, err: {}, paste: {} }; // nháp theo "mã giải:giai đoạn:vòng" → uid → { s, h: [], wd }

  const dkey = (t, v, i) => `${t.id}:${v.index}:golf${i}`;
  const par = (n) => (n == null ? '–' : RU.fmtPar(n));
  const parCls = (n) => (n == null ? '' : n < 0 ? 'under' : n > 0 ? 'over' : 'even');
  const H = (v) => v.cfg.par.length;

  /** Bảng dẫn đầu. */
  function board(v) {
    const n = v.events.length, g = v.golf || {};
    const head = ['#', '', T('golf_topar'), T('golf_today'), T('golf_thru'), ...v.events.map((e) => T('golf_r_n', { n: e.i + 1 })), T('golf_total')];
    let cutShown = false;
    const rows = v.table.map((x) => {
      let line = '';
      if (!cutShown && (x.cut || x.wd) && g.cutDone) { cutShown = true; if (g.cutLine != null) line = `<tr class="golf-cut"><td colspan="${6 + n}">${esc(T('golf_cut_line', { p: par(g.cutLine) }))}</td></tr>`; }
      const pos = x.wd ? T('golf_wd') : x.cut ? T('golf_mc') : x.toPar == null ? '' : (x.tie ? 'T' : '') + x.rank; // chưa đánh: chưa có hạng
      return `${line}<tr class="${x.adv ? 'adv' : ''}${x.cut || x.wd ? ' dnf' : ''}"><td>${esc(pos)}</td><td class="nm">${esc(x.name)}${x.po ? ` <small class="pill">${esc(T('golf_po_tag'))}</small>` : ''}</td>
        <td><b class="golf-par ${esc(parCls(x.toPar))}">${esc(par(x.toPar))}</b></td><td>${x.today != null ? esc(par(x.today)) : ''}</td><td>${x.thru != null ? esc(String(x.thru)) : ''}</td>
        ${x.rounds.map((s) => `<td>${s != null ? s : ''}</td>`).join('')}<td>${x.total != null ? x.total : ''}</td></tr>`;
    }).join('');
    return `<div class="tscroll"><table class="stand golf-board"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /** Đấu phụ: chờ ban tổ chức ghi người thắng, hoặc kết quả. */
  function playoff(t, v, can) {
    const po = v.golf && v.golf.playoff;
    if (!po) return '';
    if (po.winner) {
      const w = po.leaders.find((p) => p.uid === po.winner);
      return `<p class="golf-po">${icon('check', 'ok')} ${esc(T('golf_po_won', { name: w ? w.name : '?', n: po.holes || 1 }))}</p>`;
    }
    const hint = `<p class="hint">${esc(T('golf_po_hint', { names: po.leaders.map((p) => p.name).join(', '), holes: (v.cfg.po || []).join(', ') }))}</p>`;
    if (!can) return `<div class="golf-po">${hint}</div>`;
    return `<form class="golf-po golf-po-form">${hint}<div class="row"><label class="field inline"><span>${esc(T('golf_po_winner'))}</span><select name="winner">${
      po.leaders.map((p) => `<option value="${esc(p.uid)}">${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field inline"><span>${esc(T('golf_po_holes'))}</span><input name="holes" type="number" min="1" max="30" value="1"></label>
      <button class="primary">${esc(T('golf_po_save'))}</button></div></form>`;
  }

  /** Thống kê từng lỗ (nhập từng lỗ). */
  function holeStats(v) {
    const hs = v.golf && v.golf.holes;
    if (!hs || !hs.some((h) => h.n)) return '';
    const cols = ['golf_hole', 'golf_par', 'golf_avg', 'golf_eagle', 'golf_birdie', 'golf_par0', 'golf_bogey', 'golf_dbl'];
    const hard = [...hs].filter((h) => h.n).sort((a, b) => b.sum / b.n - b.par - (a.sum / a.n - a.par))[0];
    const body = () => `<div class="tscroll"><table class="stand"><thead><tr>${cols.map((c) => `<th>${esc(T(c))}</th>`).join('')}</tr></thead><tbody>${hs.map((h) => `<tr class="${h === hard ? 'adv' : ''}">
      <td>${h.h}</td><td>${h.par}</td><td>${h.n ? (h.sum / h.n).toFixed(2) : '–'}</td><td>${h.eagle}</td><td>${h.birdie}</td><td>${h.par0}</td><td>${h.bogey}</td><td>${h.dbl}</td></tr>`).join('')}</tbody></table></div>
      ${hard ? `<p class="hint">${esc(T('golf_hardest', { h: hard.h, d: (hard.sum / hard.n - hard.par).toFixed(2) }))}</p>` : ''}`;
    return K.fold(`golfh:${v.index}`, `<b>${esc(T('golf_holes'))}</b>`, body, false);
  }

  /** Giá trị đã lưu của vòng (để sửa tiếp khi vòng đang dở). */
  function saved(v, i) {
    const out = {};
    for (const x of (v.events[i] && v.events[i].rows) || []) out[x.uid] = { s: x.s != null ? String(x.s) : '', h: (x.h || []).map((s) => (s == null ? '' : String(s))), wd: !!x.wd };
    return out;
  }

  /** Khung nhập vòng i. */
  function roundForm(t, v, i) {
    const key = dkey(t, v, i), d = S.draft[key] || saved(v, i), hole = v.cfg.input === 'hole', n = H(v);
    const players = v.entrants.filter((p) => !p.out);
    const rows = players.map((p) => {
      const x = d[p.uid] || {};
      const cells = hole
        ? Array.from({ length: n }, (_, k) => `<td><input class="g-h" data-k="${k}" type="number" min="1" max="20" inputmode="numeric" aria-label="${esc(T('golf_hole_n', { n: k + 1 }))}" value="${esc((x.h || [])[k] || '')}"></td>`).join('')
        : `<td><input class="g-s" type="number" min="${n}" max="${n * 20}" inputmode="numeric" placeholder="${esc(T('golf_strokes'))}" value="${esc(x.s || '')}"></td>`;
      return `<tr data-uid="${esc(p.uid)}" data-name="${esc(p.name.toLowerCase())}"><td class="nm">${esc(p.name)}</td>${cells}
        <td><label class="check"><input type="checkbox" class="g-wd" ${x.wd ? 'checked' : ''}> <span>${esc(T('golf_wd'))}</span></label></td></tr>`;
    }).join('');
    const head = hole ? `<thead><tr><th></th>${v.cfg.par.map((p, k) => `<th title="${esc(T('golf_par'))} ${p}">${k + 1}<br><small class="muted">${p}</small></th>`).join('')}<th></th></tr></thead>` : '';
    return `<form class="golf-form" data-key="${esc(key)}" data-ev="${i}">
      <p class="hint">${esc(T(hole ? 'golf_form_hint_hole' : 'golf_form_hint_round'))}</p>
      <details class="gt-paste"><summary>${esc(T('golf_paste'))}</summary><p class="hint">${esc(T(hole ? 'golf_paste_hint_hole' : 'golf_paste_hint'))}</p>
        <textarea rows="5" class="g-paste" placeholder="${esc(T(hole ? 'golf_paste_ph_hole' : 'golf_paste_ph'))}">${esc(S.paste[key] || '')}</textarea>
        <button type="button" class="ghost sm" data-act="otGolfPaste">${esc(T('gt_paste_apply'))}</button></details>
      <div class="tscroll"><table class="stand race-in golf-in${hole ? ' holes' : ''}">${head}<tbody>${rows}</tbody></table></div>
      <p class="err">${esc(S.err[key] || '')}</p><div class="row"><button class="primary">${esc(T('golf_save'))}</button></div></form>`;
  }

  K.golfHtml = (t, v) => {
    const can = t.canManage && t.status === 'running' && v.index === (t.stage || 0);
    const cur = v.events.findIndex((e) => !e.done);
    const last = v.events.map((e) => e.done || !!e.rows).lastIndexOf(true);
    const g = v.golf || {};
    const info = [`${T('golf_par_total', { p: g.par })}`, v.cfg.cut ? T('golf_cut_rule', { r: v.cfg.cut.after, n: v.cfg.cut.top }) : '', g.low ? T('golf_low', { name: g.low.name, s: g.low.strokes, r: g.low.round }) : '']
      .filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join(' · ');
    const rounds = v.events.map((ev) => {
      const state = ev.done ? icon('check', 'ok') : ev.rows ? `<span class="pill">${esc(T('golf_live'))}</span>` : `<span class="muted">${esc(T('race_pending'))}</span>`;
      const undo = can && ev.i === last ? `<div class="row"><button type="button" class="ghost sm danger" data-act="otRaceUndo" data-ev="${ev.i}">${esc(T('golf_undo'))}</button></div>` : '';
      const body = () => (can && ev.i === cur ? roundForm(t, v, ev.i) + undo : ev.done ? `<p class="hint">${esc(T('golf_round_done'))}</p>${undo}` : `<p class="hint">${esc(T(can ? 'golf_wait_prev' : 'race_wait'))}</p>`);
      return K.fold(`${t.id}:r${v.index}:${ev.i}`, `<b>${esc(T('golf_round_n', { n: ev.i + 1 }))}</b> ${state}`, body, can && ev.i === cur);
    }).join('');
    return `<p class="golf-info muted">${info}</p>${playoff(t, v, can)}${board(v)}${holeStats(v)}<h5>${esc(T('golf_rounds'))}</h5>${rounds}`;
  };

  // ------------------------------------------------------------ Thao tác
  function read(form) {
    const d = {};
    form.querySelectorAll('tr[data-uid]').forEach((tr) => {
      const s = tr.querySelector('.g-s');
      d[tr.dataset.uid] = { s: s ? s.value.trim() : '', h: [...tr.querySelectorAll('.g-h')].map((x) => x.value.trim()), wd: tr.querySelector('.g-wd').checked };
    });
    S.draft[form.dataset.key] = d;
    const p = form.querySelector('.g-paste');
    if (p) S.paste[form.dataset.key] = p.value;
    return d;
  }

  /** Nháp → các dòng gửi máy chủ (trống = chưa đánh). */
  function toRows(d, hole) {
    const rows = [];
    for (const [uid, x] of Object.entries(d)) {
      if (x.wd) { rows.push({ uid, wd: true }); continue; }
      if (hole) {
        if (!x.h.some((s) => s !== '')) continue;
        rows.push({ uid, h: x.h.map((s) => (s === '' ? null : Number(s))) });
      } else if (x.s !== '') rows.push({ uid, s: Number(x.s) });
    }
    return rows;
  }

  /** Dán: mỗi dòng "Tên | 70" (tổng vòng) hoặc "Tên | 4 5 3 …" (từng lỗ); "WD" = rút lui. */
  K.acts.otGolfPaste = (b) => {
    const form = b.closest('form'), key = form.dataset.key;
    const trs = new Map([...form.querySelectorAll('tr[data-uid]')].map((tr) => [tr.dataset.name, tr]));
    const bad = [];
    for (const line of form.querySelector('.g-paste').value.split(/\r?\n/)) {
      const [name, rest = ''] = line.split(/\t|\|/).map((x) => x.trim());
      if (!name) continue;
      const tr = trs.get(name.replace(/^\d+[.)]\s*/, '').toLowerCase());
      if (!tr) { bad.push(name); continue; }
      const wd = /^(wd|rút lui|снялся|退赛)$/i.test(rest);
      tr.querySelector('.g-wd').checked = wd;
      if (wd) continue;
      const nums = rest.split(/[\s,;]+/).filter(Boolean);
      const s = tr.querySelector('.g-s');
      if (s) s.value = nums[0] || '';
      tr.querySelectorAll('.g-h').forEach((x, k) => { x.value = nums[k] || ''; });
    }
    read(form);
    S.err[key] = bad.length ? T('gt_paste_bad', { names: bad.slice(0, 5).join(', ') + (bad.length > 5 ? '…' : '') }) : '';
    form.querySelector('.err').textContent = S.err[key];
  };

  K.binders.push((body) => {
    body.querySelectorAll('.golf-form').forEach((form) => {
      form.addEventListener('input', () => read(form));
      form.addEventListener('change', () => read(form));
      form.onsubmit = (e) => {
        e.preventDefault();
        const key = form.dataset.key, rows = toRows(read(form), !!form.querySelector('.g-h'));
        S.err[key] = rows.length ? '' : T('srv_ot_race_empty');
        form.querySelector('.err').textContent = S.err[key];
        if (!rows.length) return;
        S.last = key;
        O.send({ t: 'otRace', id: D.ot.id, event: Number(form.dataset.ev), rows });
      };
    });
    body.querySelectorAll('.golf-po-form').forEach((form) => {
      form.onsubmit = (e) => {
        e.preventDefault();
        O.send({ t: 'otGolfPlayoff', id: D.ot.id, winner: form.elements.winner.value, holes: Number(form.elements.holes.value) || 1 });
      };
    });
  });
  if (!O) return;
  O.on('otPatch', () => { if (S.last) { delete S.draft[S.last]; delete S.paste[S.last]; S.last = null; } });
  O.on('error', (m) => {
    if (m.ctx !== 'otRace' || !S.last) return;
    S.err[S.last] = T('srv_' + m.code, m.args || {});
    const f = document.querySelector(`.golf-form[data-key="${S.last}"] .err`);
    if (f) f.textContent = S.err[S.last];
  });
})();
