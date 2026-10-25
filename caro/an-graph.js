/*
 * Phân tích – biểu đồ lợi thế và "Khoảnh khắc quyết định" (study.js vẽ bảng, gọi các hàm ở đây):
 *   svg(res, idx)    – biểu đồ như Lichess: trên vạch giữa là X hơn, dưới là O hơn; vạch dọc là nước đang xem; vạch màu
 *                      ở nước sai.
 *   moments(res)     – tối đa 3 nước quyết định (nước sai nặng nhất, nước lật cán cân ≥ 15%), theo thứ tự trong ván; bấm để tới.
 *   bind(wrap, getRes) – kéo / rê trên biểu đồ để tua (chuột, cảm ứng): bàn cờ chạy theo, nhãn nổi ghi số nước và khả năng
 *                      thắng; bấm một điểm là nhảy tới nước đó.
 *   window.CaroAnGraph = { svg, moments, bind }
 */
(function () {
  'use strict';
  const App = window.CaroApp;
  const T = window.I18N.t;
  const esc = App.esc;
  const BAD = ['blunder', 'mistake', 'miss', 'inacc'];
  const SWING = 0.3; // e là −1…+1: 0,3 = khả năng thắng đổi 15%
  const TOP = 3;

  function svg(res, idx, CLS) {
    const n = res.moves.length;
    if (!n) return '';
    const pts = [[0, 50]].concat(res.moves.map((m, k) => [k + 1, 50 - m.e * 46]));
    const line = pts.map(([x, y]) => `${x},${y.toFixed(1)}`).join(' ');
    const area = `0,50 ${line} ${n},50`;
    const ticks = res.moves.map((m, k) => (BAD.includes(m.cls)
      ? `<line x1="${k + 1}" x2="${k + 1}" y1="0" y2="100" stroke="${CLS[m.cls].color}" stroke-width="1.5" vector-effect="non-scaling-stroke" opacity="0.55"/>` : '')).join('');
    return `<svg class="an-graph" viewBox="0 0 ${n} 100" preserveAspectRatio="none" role="img" aria-label="${esc(T('an_graph'))}">
      <title>${esc(T('an_graph'))}</title>
      <defs><clipPath id="an-top"><rect x="0" y="0" width="${n}" height="50"/></clipPath><clipPath id="an-bot"><rect x="0" y="50" width="${n}" height="50"/></clipPath></defs>
      ${ticks}
      <polygon points="${area}" class="an-ga-x" clip-path="url(#an-top)"/>
      <polygon points="${area}" class="an-ga-o" clip-path="url(#an-bot)"/>
      <line x1="0" x2="${n}" y1="50" y2="50" class="an-mid" vector-effect="non-scaling-stroke"/>
      <polyline points="${line}" class="an-gl-x" clip-path="url(#an-top)" vector-effect="non-scaling-stroke"/>
      <polyline points="${line}" class="an-gl-o" clip-path="url(#an-bot)" vector-effect="non-scaling-stroke"/>
      <line id="an-cur" x1="${idx}" x2="${idx}" y1="0" y2="100" class="an-cur" vector-effect="non-scaling-stroke"/>
    </svg><div class="an-tip" id="an-tip" hidden></div>`;
  }

  // Mức nặng của nước sai: thế đang nghiêng hẳn một bên thì sai lầm nặng (để thua chắc) có khi chỉ làm cán cân đổi ít,
  // nên xếp theo loại nước trước rồi mới theo độ lật cán cân
  const WEIGHT = { blunder: 3, miss: 3, mistake: 2, inacc: 1 };
  /** Các nước quyết định: nước sai + nước lật cán cân ≥ 15% (trừ thế đã thua): [{ i (số nước, 1…), m, swing }], tối đa
   *  3 nước, theo thứ tự trong ván. */
  function pick(res) {
    const list = res.moves.map((m, k) => {
      const prev = k ? res.moves[k - 1].e : 0;
      return { i: k + 1, m, swing: Math.abs(m.e - prev) };
    }).filter((x) => x.m.cls !== 'lost' && (WEIGHT[x.m.cls] || x.swing >= SWING));
    const rank = (x) => (WEIGHT[x.m.cls] || 0) * 10 + x.swing;
    return list.sort((a, b) => rank(b) - rank(a)).slice(0, TOP).sort((a, b) => a.i - b.i);
  }

  function moments(res, CLS, glyph) {
    const top = pick(res);
    if (!top.length) return '';
    const item = ({ i, m, swing }) => {
      const meta = CLS[m.cls];
      // Đổi khả năng thắng theo phía người vừa đi: + là có lợi cho người đi, − là tự làm hỏng
      const gain = Math.round((m.p === 1 ? 1 : -1) * (m.e - (i > 1 ? res.moves[i - 2].e : 0)) * 50);
      return `<button type="button" class="an-km" data-i="${i}" title="${esc(T('an_move', { n: i }) + ' · ' + T('cls_' + m.cls))}">
        <span class="an-km-n">${i}.</span>${glyph(m.p)}<span>${esc(App.cellName(m.x, m.y))}</span>${meta.text ? `<b style="color:${meta.color}">${meta.text}</b>` : ''}
        ${Math.abs(gain) >= 5 ? `<span class="an-km-d ${gain >= 0 ? 'up' : 'down'}">${gain >= 0 ? '+' : '−'}${Math.abs(gain)}%</span>` : ''}</button>`; // thế đã ngã ngũ: đổi rất ít, không ghi số dễ hiểu lầm
    };
    return `<div class="an-kms"><span class="an-km-h">${esc(T('an_key'))}</span>${top.map(item).join('')}</div>`;
  }

  /** Kéo / rê trên biểu đồ để tua. wrap: khung cố định chứa biểu đồ (#an-body – biểu đồ bên trong được vẽ lại mỗi lần
   *  renderPanel); chỉ bắt đầu kéo khi bấm trúng biểu đồ, các nút khác trong khung giữ nguyên. */
  function bind(wrap, getRes) {
    let drag = false;
    const at = (e) => {
      const g = wrap.querySelector('.an-graph');
      const res = getRes();
      if (!g || !res) return null;
      const r = g.getBoundingClientRect();
      const n = res.moves.length;
      const i = Math.max(0, Math.min(n, Math.round(((e.clientX - r.left) / r.width) * n)));
      return { i, r, n, res };
    };
    const tip = (p, show) => {
      const el = wrap.querySelector('#an-tip');
      if (!el) return;
      if (!show || !p) { el.hidden = true; return; }
      const e = p.i ? p.res.moves[p.i - 1].e : 0;
      const wX = Math.round(50 * (1 + e));
      el.textContent = T('an_tip', { n: p.i, w: wX });
      el.hidden = false;
      const x = (p.i / Math.max(1, p.n)) * p.r.width;
      el.style.left = Math.max(0, Math.min(p.r.width - el.offsetWidth, x - el.offsetWidth / 2)) + 'px';
    };
    wrap.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.an-gwrap')) return;
      const p = at(e);
      if (!p) return;
      drag = true;
      try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* trình duyệt cũ */ }
      if (App.replay && p.i !== App.replay.idx) App.seek(p.i);
      tip(p, true);
      e.preventDefault();
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!drag && !e.target.closest('.an-gwrap')) return tip(null, false);
      const p = at(e);
      if (!p) return;
      if (drag && App.replay && p.i !== App.replay.idx) App.seek(p.i);
      tip(p, drag || e.pointerType === 'mouse');
    });
    const end = () => { if (drag) { drag = false; tip(null, false); } };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
    wrap.addEventListener('pointerleave', () => { if (!drag) tip(null, false); });
    // Bàn phím: biểu đồ không bắt phím; ←/→ của chế độ xem lại (board-input.js) vẫn tua như cũ
  }

  window.CaroAnGraph = { svg, moments, bind, pick };
})();
