/*
 * Giải đấu Offline – phần "playoff kiểu nhà nghề Mỹ" trong form giai đoạn loại trực tiếp đứng sau một mùa giải
 * (tour-stage-edit.js gọi qua móc; máy chủ: server/src/hub/stages-playoff.js):
 *   K.playoffEdit.need(po)               → số đội mỗi miền mùa giải phải cho đi tiếp (per + đội play-in; NHL 8)
 *   K.playoffEdit.html(i, c, prev, ctx)  → mảng HTML các ô (bật / tắt, cách xếp nhánh, số đội, nhất bảng con, play-in,
 *                                          Bo play-in, xếp lại cặp, Bo từng vòng, dòng nhắc / lỗi)
 *   K.playoffEdit.change(stages, i, k, el) → true nếu đã xử lý ô k ('playoff', 'po…', 'boRounds'); tự đặt số đội đi tiếp
 *                                          của mùa giải (giai đoạn i − 1) cho khớp
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc } = K;
  const PLAYIN = { none: 0, nba: 2, one: 1 }; // như PLAYIN của máy chủ
  const BOS = [1, 3, 5, 7];
  const need = (po) => (!po ? 0 : po.mode === 'div' ? 8 : (Number(po.per) || 8) + (PLAYIN[po.playin] || 0));
  /** Số đội mỗi miền của mùa giải trước (null nếu chưa biết số đội / cấu hình lỗi). */
  function confSize(prev, n) {
    const SS = window.CaroOTourSeason;
    if (!SS || !n || !prev || !prev.season) return null;
    const info = SS.seasonInfo(SS.cleanSeason(prev.season), n);
    return info.error ? null : info.confSize;
  }

  function html(i, c, prev, ctx) {
    const chk = (k, v, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${v ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
    const sel = (k, items, v) => `<select data-i="${i}" data-k="${k}">${items.map(([x, l]) => `<option value="${x}" ${String(x) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;
    const po = c.playoff;
    const out = [chk('playoff', !!po, T('opt_po'))];
    if (!po) return out;
    const mode = po.mode === 'div' ? 'div' : 'seed';
    out.push(field(T('opt_po_mode'), sel('poMode', [['seed', T('po_mode_seed')], ['div', T('po_mode_div')]], mode)));
    if (mode === 'seed') {
      const p = Number(po.per) || 8;
      out.push(field(T('opt_po_per'), `<input type="number" data-i="${i}" data-k="poPer" value="${p}" min="2" max="16">`));
      if (prev && prev.season && prev.season.divs > 1) out.push(chk('poDivWin', po.divWin, T('opt_po_divwin')));
      out.push(field(T('opt_po_playin'), sel('poPlayin', [['none', T('po_pi_none')], ['nba', T('po_pi_nba', { a: p - 1, b: p + 2 })], ['one', T('po_pi_one', { a: p, b: p + 1 })]], po.playin || 'none')));
      if (po.playin && po.playin !== 'none') out.push(field(T('opt_po_playin_bo'), sel('poPlayinBo', BOS.map((n) => [n, 'Bo' + n]), po.playinBo || 1)));
    }
    out.push(chk('poReseed', po.reseed, T('opt_po_reseed')));
    out.push(`<label class="field"><span>${esc(T('opt_bo_rounds'))}</span><input data-i="${i}" data-k="boRounds" value="${esc((c.boRounds || []).join(', '))}" inputmode="numeric" placeholder="3, 5, 7, 7"><small class="hint">${esc(T('opt_bo_rounds_hint'))}</small></label>`);
    const k = need(po), cs = confSize(prev, ctx && ctx.n);
    if (cs != null && (cs < k || (mode === 'div' && prev.season.divs !== 2))) out.push(`<p class="err po-err">${esc(T('po_err_size', { cs, n: k }))}</p>`);
    else out.push(`<p class="hint po-need">${esc(T('po_need', { n: k }))}</p>`);
    out.push(`<small class="hint">${esc(T('po_hint'))}</small>`);
    return out;
  }

  function change(stages, i, k, el) {
    if (k !== 'playoff' && k !== 'boRounds' && !/^po[A-Z]/.test(k)) return false;
    const c = stages[i];
    if (k === 'playoff') {
      if (el.checked) c.playoff = { mode: 'seed', per: 8, playin: 'none' };
      else { delete c.playoff; delete c.boRounds; }
    } else if (k === 'boRounds') {
      const list = String(el.value).split(/[\s,;]+/).filter(Boolean).map((x) => Math.floor(Number(x))).filter((n) => n >= 1 && n <= 99 && n % 2 === 1).slice(0, 8);
      if (list.length) c.boRounds = list; else delete c.boRounds;
    } else {
      const po = c.playoff;
      if (!po) return false;
      if (k === 'poMode') po.mode = el.value === 'div' ? 'div' : 'seed';
      else if (k === 'poPer') po.per = Math.max(2, Math.min(16, Math.floor(Number(el.value)) || 8));
      else if (k === 'poPlayin') po.playin = PLAYIN[el.value] != null ? el.value : 'none';
      else if (k === 'poPlayinBo') po.playinBo = BOS.includes(Number(el.value)) ? Number(el.value) : 1;
      else if (k === 'poDivWin') po.divWin = el.checked;
      else if (k === 'poReseed') po.reseed = el.checked;
      else return false;
    }
    // Mùa giải trước cho đúng số đội mỗi miền đi tiếp
    const prev = stages[i - 1];
    if (c.playoff && prev && prev.season) prev.advance = need(c.playoff);
    return true;
  }

  K.playoffEdit = { need, html, change };
})();
