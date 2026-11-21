/*
 * Khung dùng chung cho các trang tính năng mở dạng hộp (Thống kê, Hạng đấu tuần, Thang nhân vật máy, Tổng kết, Soát
 * chơi đẹp…): tạo <dialog> lúc cần (không phải thêm HTML vào index.html), thêm hàng vào danh sách "Công cụ" ở tab Xem
 * thêm, và vẽ biểu đồ SVG gọn theo kiểu svg.chart sẵn có (style-extras.css).
 *   CaroFeat.dialog(id, titleKey, icon) → { el, body, open(), close(), isOpen() }
 *   CaroFeat.row(id, titleKey, icon, onClick, { online })  – hàng trong tab Xem thêm (online: chỉ hiện khi có mạng)
 *   CaroFeat.bars(rows, opts)  – thanh ngang thắng / hoà / thua: rows [{ label, w, d, l }]
 *   CaroFeat.line(points, opts) – đường một chuỗi: points [[x, y]] (y: 0…100)
 *   CaroFeat.esc(s)
 */
(function () {
  'use strict';
  const T = window.I18N.t;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id) => `<svg class="ico i-in" aria-hidden="true"><use href="#i-${esc(id)}"/></svg>`;

  function dialog(id, titleKey, icon) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('dialog');
      el.id = id;
      el.className = 'wide-dlg feat-dlg';
      el.innerHTML = `<div class="dlg"><div class="dlg-head">
        <h2 tabindex="-1" autofocus>${icon ? ico(icon) : ''}<span data-i18n="${esc(titleKey)}">${esc(T(titleKey))}</span></h2>
        <button type="button" class="x-close" data-i18n-aria="close" aria-label="${esc(T('close'))}">✕</button></div>
        <div class="feat-body" id="${esc(id)}-body"></div></div>`;
      document.body.appendChild(el);
      el.querySelector('.x-close').onclick = () => api.close();
    }
    const api = {
      el,
      body: el.querySelector('.feat-body'),
      open() { if (!el.open) { if (el.showModal) el.showModal(); else el.setAttribute('open', ''); } },
      close() { if (el.open) { if (el.close) el.close(); else el.removeAttribute('open'); } },
      isOpen: () => !!el.open,
    };
    return api;
  }

  /** Hàng trong danh sách "Công cụ" ở tab Xem thêm (more.js). */
  function row(id, titleKey, icon, onClick, opts) {
    opts = opts || {};
    const head = document.querySelector('#page-more h3[data-i18n="more_tools"]');
    const list = head && head.nextElementSibling;
    if (!list || document.getElementById(id)) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'li' + (opts.online ? ' online-need' : '');
    b.innerHTML = `<svg class="ico li-ic" aria-hidden="true"><use href="#i-${esc(icon)}"/></svg><span class="li-t" data-i18n="${esc(titleKey)}">${esc(T(titleKey))}</span><svg class="ico chev" aria-hidden="true"><use href="#i-chev"/></svg>`;
    b.onclick = onClick;
    list.appendChild(b);
    return b;
  }

  /**
   * Thanh ngang thắng / hoà / thua cho từng mục (nhãn bên trái, tỉ lệ thắng bên phải). opts: { label: 'mô tả cho
   * trình đọc màn hình' }. Mục không có ván thì bỏ.
   */
  function bars(rows, opts) {
    opts = opts || {};
    rows = (rows || []).filter((r) => r.w + r.d + r.l > 0);
    if (!rows.length) return `<p class="hint">${esc(T('ins_none'))}</p>`;
    const W = 400, L = 112, Rg = 58, H = 24, pad = 4;
    const max = Math.max(...rows.map((r) => r.w + r.d + r.l));
    let y = 0;
    const out = rows.map((r) => {
      const n = r.w + r.d + r.l, span = ((W - L - Rg) * n) / max;
      let x = L;
      const seg = ['w', 'd', 'l'].map((k) => {
        const w = (span * r[k]) / n;
        const s = r[k] ? `<rect class="b-${k}" x="${x.toFixed(1)}" y="${y + pad}" width="${Math.max(0, w - 1).toFixed(1)}" height="${H - 2 * pad}" rx="3"><title>${esc(T('ins_wdl', { w: r.w, d: r.d, l: r.l }))}</title></rect>` : '';
        x += w;
        return s;
      }).join('');
      const pct = Math.round(((r.w + r.d / 2) / n) * 100);
      const row = `<text class="ax" x="${L - 8}" y="${y + H / 2 + 4}" text-anchor="end">${esc(r.label)}</text>${seg}
        <text class="ax" x="${W - 4}" y="${y + H / 2 + 4}" text-anchor="end">${pct}% · ${n}</text>`;
      y += H;
      return row;
    }).join('');
    return `<svg class="chart bars" viewBox="0 0 ${W} ${y}" role="img" aria-label="${esc(opts.label || '')}">${out}</svg>`;
  }

  /** Đường một chuỗi (y: 0…100) – độ chính xác theo thời gian. */
  function line(points, opts) {
    opts = opts || {};
    if (!points || points.length < 2) return `<p class="hint">${esc(opts.empty || T('ins_acc_few'))}</p>`;
    const W = 560, H = 160, L = 34, Rg = 10, Tp = 10, B = 20;
    const X = (i) => L + (i / (points.length - 1)) * (W - L - Rg);
    const Y = (v) => Tp + (1 - v / 100) * (H - Tp - B);
    let grid = '';
    for (const v of [0, 50, 100]) grid += `<line x1="${L}" x2="${W - Rg}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    const dots = points.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3" class="dt"><title>${esc(p[1] + '%')}</title></circle>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || '')}">${grid}<path d="${d}" class="ln"/>${dots}</svg>`;
  }

  window.CaroFeat = { dialog, row, bars, line, esc, ico };
})();
