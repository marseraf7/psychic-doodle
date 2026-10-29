/*
 * Biên bản trận đấu để in và ký tay (như MyLeague) – dựng hoàn toàn trên trình duyệt, máy chủ không tạo tệp:
 * trang HTML khổ A4 (mỗi trận một trang) trong khung ẩn rồi mở hộp thoại In của trình duyệt → "Lưu thành PDF".
 * Gồm: tên giải, giai đoạn / vòng, mã trận, hai người chơi (hạt giống), bảng tỉ số từng set (biên bản trắng: ô trống),
 * kết quả phụ, kết quả chung cuộc, ghi chú, ô ký: trọng tài 1, trọng tài 2, ban tổ chức, giám sát, hai người chơi.
 *   window.CaroTourSheet.print(tour, [{ m, v }], { blank }) – m: trận (matchView), v: giai đoạn (stageView)
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Một trang biên bản. */
  function page(t, x, blank, idx, total) {
    const { m, v } = x;
    const bo = m.bo || (t.stages && t.stages[v.index] && t.stages[v.index].bestOf) || 3;
    const filled = !blank && m.sets ? m.sets : [];
    const rows = Math.max(bo, filled.length, 3);
    const name = (p) => (p && p.name ? `${p.seed ? '#' + p.seed + ' ' : ''}${esc(p.name)}` : '');
    const stage = t.stages && t.stages.length > 1 ? T('stage_n', { n: v.index + 1 }) + ' · ' : '';
    const sets = Array.from({ length: rows }, (_, i) => `<tr><td>${esc(T('score_set_n', { n: i + 1 }))}</td><td>${filled[i] ? filled[i][0] : ''}</td><td>${filled[i] ? filled[i][1] : ''}</td></tr>`).join('');
    const res = !blank && m.done ? `${m.wa} – ${m.wb}` : '';
    // Giờ / địa điểm ban tổ chức đặt cho vòng của trận (tour-manage.js)
    const slot = (t.schedule && t.schedule[v.index + ':' + m.round]) || {};
    const slotAt = slot.at ? new Date(slot.at).toLocaleString(document.documentElement.lang || 'vi', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const ex = !blank && m.extra ? m.extra.join(' – ') : '';
    const sign = ['sheet_ref1', 'sheet_ref2', 'sheet_org', 'sheet_sup'].map((k) => `<div class="sg"><span>${esc(T(k))}</span></div>`).join('')
      + `<div class="sg"><span>${esc(T('sheet_player'))} A</span><small>${name(m.a)}</small></div><div class="sg"><span>${esc(T('sheet_player'))} B</span><small>${name(m.b)}</small></div>`;
    return `<section class="pg">
      <header><div><h1>${esc(T('sheet_title'))}</h1><p>${esc(t.name)}</p></div><div class="meta"><b>${esc(stage)}${esc(m.id)}</b><span>${idx + 1} / ${total}</span></div></header>
      <table class="info"><tr><th>${esc(T('sheet_time'))}</th><td>${esc(slotAt)}</td><th>${esc(T('sheet_place'))}</th><td>${esc(slot.place || '')}</td></tr></table>
      <table class="score"><thead><tr><th></th><th>A: ${name(m.a) || '&nbsp;'}</th><th>B: ${name(m.b) || '&nbsp;'}</th></tr></thead>
        <tbody>${sets}<tr class="ex"><td>${esc(T('score_extra_short'))}</td><td colspan="2">${esc(ex)}</td></tr>
        <tr class="res"><td>${esc(T('sheet_result'))}</td><td colspan="2">${esc(res)}</td></tr></tbody></table>
      <div class="note"><b>${esc(T('sheet_note'))}</b></div>
      <div class="signs">${sign}</div>
      <footer>Caro x Gomoku · ${esc(new Date().toLocaleString(document.documentElement.lang || 'vi'))}</footer>
    </section>`;
  }

  const CSS = `@page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; } body { font: 12pt/1.4 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #000; margin: 0; }
    .pg { page-break-after: always; break-after: page; min-height: 260mm; display: flex; flex-direction: column; gap: 6mm; }
    .pg:last-child { page-break-after: auto; break-after: auto; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 3mm; }
    h1 { font-size: 18pt; margin: 0; letter-spacing: 0.04em; } header p { margin: 1mm 0 0; font-size: 13pt; }
    .meta { text-align: right; display: flex; flex-direction: column; font-size: 10pt; }
    table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #000; padding: 2.5mm 3mm; text-align: center; }
    .info th { width: 18%; text-align: left; font-weight: 600; } .info td { height: 10mm; }
    .score thead th { font-size: 12pt; } .score td { height: 11mm; font-size: 14pt; } .score td:first-child { width: 22%; font-size: 11pt; text-align: left; }
    .score .res td { font-weight: 700; height: 13mm; }
    .note { border: 1px solid #000; min-height: 28mm; padding: 2mm 3mm; }
    .signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: auto; }
    .sg { border: 1px solid #000; height: 30mm; padding: 2mm; display: flex; flex-direction: column; justify-content: space-between; }
    .sg span { font-weight: 600; font-size: 10pt; } .sg small { font-size: 9pt; }
    footer { font-size: 8pt; color: #444; text-align: right; }`;

  /** Dựng tài liệu và mở hộp thoại In (khung ẩn; trình duyệt không in được khung thì mở thẻ mới). */
  function print(t, list, opts = {}) {
    const items = list && list.length ? list : [{ m: { id: '—', a: null, b: null }, v: { index: t.stage || 0 } }];
    const html = `<!doctype html><html lang="${esc(document.documentElement.lang || 'vi')}"><head><meta charset="utf-8"><title>${esc(T('sheet_title'))} – ${esc(t.name)}</title>
      <style>${CSS}</style></head><body>${items.map((x, i) => page(t, x, !!opts.blank, i, items.length)).join('')}</body></html>`;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const done = () => setTimeout(() => frame.remove(), 1000);
    frame.onload = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); done(); } catch (e) {
        frame.remove();
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    };
    frame.srcdoc = html;
    return html;
  }

  window.CaroTourSheet = { print, page };
})();
