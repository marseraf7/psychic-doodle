/*
 * Giải đấu Offline – giao diện giai đoạn "nhánh đồ thị" (type 'graph': Page playoff, Final Eight / Final Ten kiểu AFL, thang
 * leo bậc có trận tặng sẵn, loại kép lai kiểu RLCS, Compass draw 8 – khuôn ở otour-graph.js, máy chủ stages-graph.js).
 * Đăng ký vào registry phía trình duyệt K.kinds.graph (tour-stages.js / tour-stage-edit.js tra registry):
 *   name(c) / html(t, v)            – tên giai đoạn, vẽ các cột trận (mỗi trận ghi "thắng → … · thua → …") và bảng hạng;
 *   def() / edit(i, c, st, last) / change(stages, i, k, el) – ô cấu hình trong form giai đoạn.
 * Nạp sau tour-stages.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc } = K;
  const SHAPES = ['page', 'afl8', 'afl10', 'gauntlet', 'hybrid', 'compass8', 'cross9'];
  const BOS = [1, 3, 5, 7];
  const MAX_STEPS = 7;

  /** Nơi người thắng / thua đi tới: tên trận đích hoặc hạng dừng lại. */
  function toText(to) {
    if (!to) return '';
    const dest = (x, place) => (x ? T(x.tag) : place ? T('gr_place', { n: place }) : '');
    const out = [];
    const w = dest(to.win, to.wp === 1 ? 0 : to.wp);
    if (to.wp === 1) out.push(T('gr_champ'));
    else if (w) out.push(T('gr_win_to', { x: w }));
    const l = dest(to.lose, to.lp);
    if (l) out.push(T('gr_lose_to', { x: l }));
    return out.join(' · ');
  }

  function html(t, v) {
    const key = t.id + ':' + v.index;
    const cols = v.rounds || [];
    // Mỗi cột: tên cột theo khuôn (máy chủ gửi khoá i18n); dưới mỗi trận ghi đường đi
    const colName = (r) => ((v.colNames || [])[r] ? T(v.colNames[r]) : T('r_round', { n: r + 1 }));
    const box = (m) => `<div class="gr-m"><small class="muted">${esc(T(m.tag))}${m.bo ? ` · Bo${m.bo}` : ''}${m.start ? ` · ${esc(T('gr_start', { a: m.start[0], b: m.start[1] }))}` : ''}${m.tie ? ` · ${esc(T('gr_tie'))}` : ''}</small>${K.matchBox(m)}<small class="hint">${esc(toText(m.to))}</small></div>`;
    const grid = `<div class="b-wrap"><div class="bracket gr-bracket">${cols.map((col, r) => `<div class="b-col"><h5>${esc(colName(r))}</h5>${col.map(box).join('')}</div>`).join('')}</div></div>`;
    const rows = (v.table || []).map((x) => `<tr class="${x.uid && K.me && K.me() && x.uid === K.me().uid ? 'me' : ''}"><td>${x.place}</td><td class="l">${esc(x.name)}${x.exit ? ` <span class="pill">${esc(T('gr_exit', { x: x.exit }))}</span>` : ''}</td></tr>`).join('');
    const tab = rows ? `<h5>${esc(T('gr_places'))}</h5><div class="tscroll"><table class="stand gr-tab"><thead><tr><th>#</th><th class="l">${esc(T('col_player'))}</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
    return `<p class="hint">${esc(T('gr_note_' + v.shape))}</p>${grid}${tab}`;
  }

  // ---- Form giai đoạn
  const sel = (i, k, items, v) => `<select data-i="${i}" data-k="${k}">${items.map(([x, l]) => `<option value="${esc(x)}" ${String(x) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;
  const boItems = (none) => [...(none ? [[0, T('bo_same')]] : []), ...BOS.map((b) => [b, 'Bo' + b])];

  /** Các bậc của thang leo (gauntlet): Bo, số trận tặng cho hạt giống cao, hoà loạt thì hạt giống cao đi tiếp. */
  function ladderHtml(i, c) {
    const L = c.ladder || [];
    const steps = Array.from({ length: MAX_STEPS }, (_, j) => j);
    return `<div class="field gr-ladder"><span>${esc(T('gr_ladder'))}</span><small class="hint">${esc(T('gr_ladder_hint'))}</small>
      <table class="mini"><thead><tr><th></th><th>Bo</th><th>${esc(T('gr_gift'))}</th><th>${esc(T('gr_tie'))}</th></tr></thead><tbody>${steps.map((j) => {
      const x = L[j] || {};
      return `<tr><td>${esc(T('gr_step', { n: j + 1 }))}</td><td>${sel(i, 'grBo' + j, [[0, T('bo_same')], ...[1, 2, 3, 4, 5, 6, 7].map((b) => [b, 'Bo' + b])], x.bo || 0)}</td>
        <td>${sel(i, 'grGift' + j, [0, 1, 2].map((n) => [n, String(n)]), (x.start || [0])[0] || 0)}</td><td><input type="checkbox" data-i="${i}" data-k="grTie${j}" ${x.tie ? 'checked' : ''}></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function edit(i, c) {
    const f = [field(T('gr_shape'), sel(i, 'shape', SHAPES.map((s) => [s, T('fmt_graph_' + s)]), c.shape || 'page')),
      `<small class="hint">${esc(T('gr_note_' + (c.shape || 'page')))}</small>`,
      field(T('format_bo'), sel(i, 'bestOf', boItems(false), c.bestOf || 1)),
      field(T('opt_bo_final'), sel(i, 'boFinal', boItems(true), c.boFinal || 0))];
    if (c.shape === 'gauntlet') f.push(ladderHtml(i, c));
    return f;
  }

  /** Ô của form: khuôn, các bậc thang leo. Trả true nếu đã xử lý. */
  function change(stages, i, k, el) {
    const c = stages[i];
    if (k === 'shape') {
      if (!SHAPES.includes(el.value)) return false;
      c.shape = el.value;
      if (c.shape !== 'gauntlet') delete c.ladder;
      return true;
    }
    const m = /^gr(Bo|Gift|Tie)(\d)$/.exec(k);
    if (!m) return false;
    const j = Number(m[2]);
    const L = Array.from({ length: Math.max(j + 1, (c.ladder || []).length) }, (_, x) => ({ ...((c.ladder || [])[x] || {}) }));
    const x = L[j];
    if (m[1] === 'Bo') { const b = Number(el.value) || 0; if (b) x.bo = b; else delete x.bo; }
    else if (m[1] === 'Gift') { const g = Number(el.value) || 0; if (g) x.start = [g, 0]; else delete x.start; }
    else if (el.checked) x.tie = true; else delete x.tie;
    while (L.length && !Object.keys(L[L.length - 1]).length) L.pop();
    if (L.length) c.ladder = L; else delete c.ladder;
    return true;
  }

  // ---- Vòng vớt kiểu Olympic trên loại trực tiếp cuối (cfg.rep – máy chủ stages-repechage.js)
  K.repHtml = (t, v) => {
    const side = (s) => `<h5 class="br-h">${esc(T('rep_side', { name: s.fin ? s.fin.name : '?' }))}</h5>`
      + (s.direct ? `<p class="hint">${esc(T('rep_direct', { name: s.direct.name }))}</p>`
        : K.bracketCols(s.rounds, (r) => T(r === s.rounds.length - 1 ? 'rep_bronze' : 'rep_round', { n: r + 1 }), null, null));
    const rows = (v.table || []).map((x) => `<tr><td>${x.place}</td><td class="l">${esc(x.name)}</td></tr>`).join('');
    return `<h5 class="br-h">${esc(T('rep_title'))}</h5><p class="hint">${esc(T('rep_note_' + ((v.cfg.rep || {}).mode || 'finalist')))}</p>${v.rep.map(side).join('')}`
      + (rows ? `<h5>${esc(T('gr_places'))}</h5><div class="tscroll"><table class="stand gr-tab"><thead><tr><th>#</th><th class="l">${esc(T('col_player'))}</th></tr></thead><tbody>${rows}</tbody></table></div>` : '');
  };
  K.repEdit = {
    html(i, c) {
      const on = !!c.rep;
      const f = [`<label class="check"><input type="checkbox" data-i="${i}" data-k="repOn" ${on ? 'checked' : ''}> <span>${esc(T('opt_rep'))}</span></label>`];
      if (on) f.push(field(T('opt_rep_from'), sel(i, 'repFrom', [['qf', T('r_quarter')], ['r16', T('rep_r16')], ['r32', T('rep_r32')]], c.rep.from || 'qf')),
        field(T('opt_rep_mode'), sel(i, 'repMode', [['finalist', T('rep_mode_finalist')], ['half', T('rep_mode_half')]], c.rep.mode || 'finalist')),
        `<small class="hint">${esc(T('rep_note_' + (c.rep.mode || 'finalist')))}</small>`);
      return f;
    },
    change(c, k, el) {
      if (k === 'repOn') { if (el.checked) { c.rep = { from: 'qf', mode: 'finalist' }; c.thirdPlace = false; delete c.places; c.placement = false; } else delete c.rep; return true; }
      if (k === 'repFrom' && c.rep) { c.rep.from = el.value; return true; }
      if (k === 'repMode' && c.rep) { c.rep.mode = el.value; return true; }
      return false;
    },
  };

  K.kinds = K.kinds || {};
  K.kinds.graph = {
    name: (c) => T('fmt_graph_' + (c.shape || 'page')),
    adv: (c) => (c.advance ? T('adv_n', { n: c.advance }) : ''),
    html,
    def: () => ({ type: 'graph', shape: 'page', bestOf: 1 }),
    edit,
    change,
  };
  K.graphTo = toText;
})();
