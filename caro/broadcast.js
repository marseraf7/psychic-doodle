/*
 * Trang Tường thuật giải đấu (broadcast.html – C3): lưới bàn nhỏ các ván đang đấu (bấm để xem ván), bảng xếp hạng, kết quả
 * gần đây, nhãn vòng. Hỏi /api/v1/broadcast/<key> mỗi POLL_MS khi trang đang hiện → vòng mới tự hiện, không cần tải lại.
 * Giải Offline: hiện trang nhúng sẵn có (embed.html) trong khung – bảng / nhánh đấu do ban tổ chức nhập kết quả.
 * Địa chỉ: /?bc=<mã giải> hoặc /?bc=o.<mã giải Offline> (máy chủ trả trang này kèm thẻ xem trước og – web.js),
 * hoặc /broadcast.html?bc=… (nhúng iframe được). &lang=vi|en|ru|zh &theme=light|dark như trang nhúng (embed-boot.js).
 * Máy chủ: window.CARO_SERVER (config.js) – trong app (Capacitor) trang này nằm trong máy, phải hỏi đúng máy chủ chứ không
 * phải đường dẫn tương đối; trên web để trống = cùng máy chủ.
 * miniSvg(moves, opts) dùng chung được (Node: module.exports) – kiểm thử ở caro/tests/broadcast.test.js.
 */
(function (global) {
  'use strict';
  /** Bàn nhỏ dạng SVG: khung bao các quân (+2 ô), tối thiểu 9×9, đánh dấu nước cuối. */
  function miniSvg(moves, { size = 180, winner = null } = {}) {
    const xs = moves.map((m) => m[0]), ys = moves.map((m) => m[1]);
    let x0 = Math.min(0, ...xs) - 2, x1 = Math.max(0, ...xs) + 2, y0 = Math.min(0, ...ys) - 2, y1 = Math.max(0, ...ys) + 2;
    if (!moves.length) { x0 = -4; x1 = 4; y0 = -4; y1 = 4; }
    const n = Math.max(9, x1 - x0 + 1, y1 - y0 + 1);
    // Giữ hình vuông, căn giữa phần dư
    x0 -= Math.floor((n - (x1 - x0 + 1)) / 2); y0 -= Math.floor((n - (y1 - y0 + 1)) / 2);
    const c = size / n;
    const lines = [];
    for (let i = 0; i <= n; i++) {
      const p = (i * c).toFixed(1);
      lines.push(`M${p} 0V${size}M0 ${p}H${size}`);
    }
    const stones = moves.map(([x, y], i) => {
      const cx = ((x - x0 + 0.5) * c).toFixed(1), cy = ((y - y0 + 0.5) * c).toFixed(1), r = (c * 0.36).toFixed(1);
      const last = i === moves.length - 1 ? `<rect class="bc-last" x="${((x - x0) * c).toFixed(1)}" y="${((y - y0) * c).toFixed(1)}" width="${c.toFixed(1)}" height="${c.toFixed(1)}"/>` : '';
      return last + (i % 2 ? `<circle class="bc-o" cx="${cx}" cy="${cy}" r="${r}"/>`
        : `<path class="bc-x" d="M${cx - r} ${cy - r}L${+cx + +r} ${+cy + +r}M${+cx + +r} ${cy - r}L${cx - r} ${+cy + +r}"/>`);
    }).join('');
    return `<svg class="bc-svg${winner ? ' done' : ''}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">`
      + `<path class="bc-grid-l" d="${lines.join('')}"/>${stones}</svg>`;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { miniSvg }; return; }

  const T = (k, a) => global.I18N.t(k, a);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 5000;
  const base = () => String(global.CARO_SERVER || '').replace(/\/+$/, ''); // '' = cùng máy chủ với trang
  const q = new URLSearchParams(location.search);
  const key = (q.get('bc') || q.get('t') || (q.get('o') ? 'o.' + q.get('o') : '')).replace(/[^\w.-]/g, '').slice(0, 42);
  let data = null, timer = 0, frameSet = false;

  const status = (s) => T(['scheduled', 'running', 'finished'].includes(s) ? 'bc_status_' + s : 'bc_status_other');
  const res = (w) => (w === 'x' ? '1 – 0' : w === 'o' ? '0 – 1' : '½ – ½');
  function board(b) {
    const done = b.winner ? (b.winner === 3 ? T('bc_draw') : (b.winner === 1 ? b.x : b.o) + ' ✓') : T('bc_to_move', { p: b.turn === 2 ? 'O' : 'X' });
    return `<a class="bc-board" href="/?room=${esc(b.code)}" target="_top" aria-label="${esc(T('bc_watch', { x: b.x, o: b.o }))}">
      <span class="bc-p"><span class="ellip"><b class="bc-xs">X</b> ${esc(b.x)}</span></span>
      ${miniSvg(b.moves, { winner: b.winner })}
      <span class="bc-p"><span class="ellip"><b class="bc-os">O</b> ${esc(b.o)}</span></span>
      <small>${esc(T('bc_moves', { n: b.moves.length }))} · ${esc(done)}</small></a>`;
  }
  let said = ''; // câu đã đọc lần trước (#bc-say)
  /** Báo cho trình đọc màn hình khi trạng thái / vòng / số bàn đang đấu đổi (không đọc lại cả trang mỗi lần hỏi lại). */
  function say() {
    const el = $('bc-say');
    if (!el || !data) return;
    const live = data.kind === 'tour' ? data.boards.filter((b) => !b.winner).length : 0;
    const text = [data.name, status(data.status), data.round ? T('bc_round', { n: data.round }) : '', live ? T('bc_moves_live', { n: live }) : ''].filter(Boolean).join(' · ');
    if (text !== said) el.textContent = said = text;
  }
  function draw() {
    const main = $('bc');
    if (!data) { main.innerHTML = `<p class="hint">${esc(T('bc_not_found'))}</p>`; return; }
    document.title = data.name + ' – ' + T('bc_title');
    const head = `<header class="bc-head"><h1><span class="ellip">${esc(data.name)}</span></h1>
      <p class="bc-sub"><span class="bc-live${data.status === 'running' ? ' on' : ''}">${esc(status(data.status))}</span>${data.round ? ' · ' + esc(T('bc_round', { n: data.round })) : ''}${data.podium && data.podium[0] ? ' · ' + esc(T('bc_champion', { name: data.podium[0] })) : ''}</p>
      <a class="bc-link" href="${esc(data.url)}" target="_top">${esc(T('bc_to_tour'))}</a></header>`;
    if (data.kind === 'otour') {
      if (!frameSet) {
        main.innerHTML = head + `<iframe class="bc-frame" title="${esc(data.name)}" src="${esc(base() + data.embed)}&view=standings"></iframe>`;
        frameSet = true;
      }
      return;
    }
    const boards = data.boards.length ? `<div class="bc-grid">${data.boards.map(board).join('')}</div>` : `<p class="hint">${esc(T('bc_no_boards'))}</p>`;
    const table = data.standings.length ? `<table class="bc-table"><tbody>${data.standings.map((p) => `<tr><td>${p.rank}</td><td><span class="ellip">${esc(p.name)}</span></td><td>${esc(p.score)}</td><td><small>${p.wins}-${p.draws}-${p.losses}</small></td></tr>`).join('')}</tbody></table>` : `<p class="hint">${esc(T('bc_no_results'))}</p>`;
    const results = data.results.length ? `<ul class="bc-res">${data.results.map((r) => `<li>${r.share ? `<a href="/?replay=${esc(r.share)}" target="_top">` : '<span>'}<span class="ellip">${esc(r.x)} – ${esc(r.o)}</span><b>${esc(res(r.winner))}</b>${r.share ? '</a>' : '</span>'}</li>`).join('')}</ul>` : `<p class="hint">${esc(T('bc_no_results'))}</p>`;
    const at = new Date(data.now || Date.now()).toLocaleTimeString(document.documentElement.lang || 'vi', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    main.innerHTML = head + `<section><h2>${esc(T('bc_boards'))}</h2>${boards}</section>
      <div class="bc-cols"><section><h2>${esc(T('bc_standings'))}</h2>${table}</section><section><h2>${esc(T('bc_results'))}</h2>${results}</section></div>
      <p class="hint bc-upd">${esc(T('bc_updated', { t: at }))}</p>`;
  }
  async function poll() {
    clearTimeout(timer);
    if (!key) { data = null; draw(); return; }
    if (!document.hidden) {
      try {
        const r = await fetch(base() + '/api/v1/broadcast/' + encodeURIComponent(key), { cache: 'no-cache' });
        data = r.ok ? await r.json() : r.status === 404 ? null : data;
      } catch (e) { /* mất mạng: giữ bản cũ, thử lại sau */ }
      draw();
      say();
    }
    if (!data || data.kind !== 'otour') timer = setTimeout(poll, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  global.CaroBroadcast = { poll, get data() { return data; }, miniSvg };
  poll();
})(typeof window !== 'undefined' ? window : globalThis);
