/*
 * Giải đấu Offline – treo giò tự động trên trang giải (máy chủ tính: server/src/hub/otour-disc.js, gửi t.susp):
 *   K.otDiscHtml(t)  – mục "Treo giò" ở tab Thống kê: án sắp tới (cầu thủ, đội, trận phải ngồi ngoài, lý do), án đã chấp
 *                      hành (thu gọn), cảnh báo cho ban tổ chức (cầu thủ đang bị treo giò vẫn có tên trong trận); ban tổ
 *                      chức đổi luật: số thẻ vàng tích luỹ, số trận do thẻ đỏ, xoá thẻ vàng khi sang giai đoạn mới.
 *   K.otSuspOf(t, m) – nhãn "Treo giò trận này" trong khung trận (otour-league.js).
 * Chỉ hiện với các môn có thẻ phạt (kết quả kiểu tỉ số, không phải hệ Race) hoặc khi đã có án.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const SP = window.CaroOTourSports;
  if (!K) return;
  const { O, T, esc, $, D } = K;
  const DEF = { y: 2, red: 1, reset: false }; // giống DEFAULT ở máy chủ
  const cardSport = (t) => { const s = SP && SP.SPORTS[t.sport]; return !!s && s.result === 'score' && !s.preset && t.sport !== 'chess'; };
  const why = (w) => T('ot_susp_why_' + w);

  function row(x) {
    const where = x.match ? T('ot_susp_vs', { name: x.vs || '?' }) : T('ot_susp_tbd');
    return `<li><b>${esc(x.who)}</b> <small class="muted">${esc(x.name)}</small> · ${esc(where)} <small class="muted">(${esc(why(x.why))})</small></li>`;
  }
  function rules(t) {
    const r = { ...DEF, ...(t.disc || {}) };
    const opt = (n, v, label) => `<option value="${n}" ${n === v ? 'selected' : ''}>${esc(label)}</option>`;
    return `<form id="ot-disc" class="row ot-disc">
      <label class="field inline"><span>${esc(T('ot_susp_y'))}</span><select name="y">${opt(0, r.y, T('ot_susp_y0'))}${[2, 3, 4, 5].map((n) => opt(n, r.y, String(n))).join('')}</select></label>
      <label class="field inline"><span>${esc(T('ot_susp_red'))}</span><select name="red">${[1, 2, 3].map((n) => opt(n, r.red, String(n))).join('')}</select></label>
      <label class="check"><input type="checkbox" name="reset" ${r.reset ? 'checked' : ''}> <span>${esc(T('ot_susp_reset'))}</span></label>
      <button class="ghost sm">${esc(T('ot_info_save'))}</button></form>`;
  }

  /** Luật bằng lời cho người xem: "Đủ 2 thẻ vàng: nghỉ 1 trận. Thẻ đỏ: nghỉ 1 trận." */
  const ruleText = (t) => { const r = { ...DEF, ...(t.disc || {}) }; return T(r.y ? 'ot_susp_rule_t' : 'ot_susp_rule_t0', r) + (r.reset ? ' ' + T('ot_susp_reset') + '.' : ''); };

  K.otDiscHtml = (t) => {
    const s = t.susp;
    if (!s && !(t.canManage && cardSport(t) && t.status !== 'draft')) return '';
    const next = s ? s.list.filter((x) => !x.served) : [];
    const done = s ? s.list.filter((x) => x.served) : [];
    const warn = t.canManage && s && s.warn.length ? `<div class="ot-warn"><b>⚠ ${esc(T('ot_susp_warn'))}</b><ul>${s.warn.map((w) => `<li>${esc(w.who)} <small class="muted">${esc(w.name)}</small></li>`).join('')}</ul></div>` : '';
    return `<section class="ot-sec ot-susp" data-k="ot:${esc(t.id)}:susp"><h4>🟥 ${esc(T('ot_susp'))}</h4>${warn}
      ${next.length ? `<h5>${esc(T('ot_susp_next'))}</h5><ul class="ot-susp-list">${next.map(row).join('')}</ul>` : `<p class="hint">${esc(T('ot_susp_none'))}</p>`}
      ${done.length ? `<details><summary>${esc(T('ot_susp_done'))} (${done.length})</summary><ul class="ot-susp-list">${done.map(row).join('')}</ul></details>` : ''}
      ${t.canManage ? `<h5>${esc(T('ot_susp_rule'))}</h5>${rules(t)}` : `<p class="hint">${esc(ruleText(t))}</p>`}</section>`;
  };

  /** Treo giò ở trận m (cả án đã chấp hành): nhãn trong khung trận. */
  K.otSuspOf = (t, m) => {
    const list = t.susp ? t.susp.list.filter((x) => x.match === m.id) : [];
    return list.length ? `<p class="ot-susp-m">🟥 <b>${esc(T('ot_susp_match'))}:</b> ${list.map((x) => `${esc(x.who)} <small class="muted">(${esc(x.name)})</small>`).join(', ')}</p>` : '';
  };

  K.binders.push(() => {
    const f = $('ot-disc');
    if (!f || !D.ot) return;
    f.onsubmit = (e) => {
      e.preventDefault();
      O.send({ t: 'otDisc', id: D.ot.id, y: Number(f.elements.y.value), red: Number(f.elements.red.value), reset: f.elements.reset.checked });
    };
  });
})();
