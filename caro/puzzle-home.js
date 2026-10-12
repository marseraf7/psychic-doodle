/*
 * Đầu tab Câu đố (như Lichess): thẻ "Câu đố hôm nay" với bàn cờ thu nhỏ của bài trong ngày, bên đi, số nước,
 * độ khó và nút Giải ngay. Bài lấy từ study.js (dailyPuzzle – giống nhau cho mọi người trong ngày).
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = window.I18N.t;
  const S = window.CaroStudy;
  const esc = window.CaroApp.esc;

  /** Bàn cờ thu nhỏ (SVG) vừa khít các quân, thêm 1 ô viền. */
  function miniBoard(moves) {
    const xs = moves.map((m) => m[0]), ys = moves.map((m) => m[1]);
    const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1;
    const n = Math.max(7, Math.max(...xs) - x0 + 2, Math.max(...ys) - y0 + 2);
    const C = 20, W = n * C;
    let g = '';
    for (let i = 0; i <= n; i++) g += `<line x1="0" y1="${i * C}" x2="${W}" y2="${i * C}"/><line x1="${i * C}" y1="0" x2="${i * C}" y2="${W}"/>`;
    let st = '';
    moves.forEach(([x, y], i) => {
      const cx = (x - x0) * C + C / 2, cy = (y - y0) * C + C / 2;
      st += i % 2 === 0
        ? `<g class="rx"><line x1="${cx - 6}" y1="${cy - 6}" x2="${cx + 6}" y2="${cy + 6}"/><line x1="${cx + 6}" y1="${cy - 6}" x2="${cx - 6}" y2="${cy + 6}"/></g>`
        : `<circle class="ro" cx="${cx}" cy="${cy}" r="6.5"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${W}" role="img" aria-hidden="true"><g class="rgrid">${g}</g>${st}</svg>`;
  }

  async function render() {
    const el = $('pz-today');
    let list;
    try { list = await S.loadPuzzles(); } catch (e) { el.hidden = true; return; }
    const q = S.dailyPuzzle(list.filter((z) => !z.rule));
    const p = q.m.length % 2 ? 'O' : 'X';
    el.hidden = false;
    el.innerHTML = `<div class="pzt-board">${miniBoard(q.m)}</div>
      <div class="pzt-info"><h3>${esc(T('pz_daily'))}</h3>
        <p><b class="${p.toLowerCase()}">${p}</b> ${esc(T('tr_find_win'))} ${esc(T('tr_in_n', { n: q.len }))}</p>
        <small>${esc(T('pz_rating_n', { n: q.r }))} · ${esc($('pz-daily-sub').textContent)}</small>
        <button type="button" class="primary" data-pz-today>${esc(T('pz_go'))}</button></div>`;
  }
  $('pz-today').addEventListener('click', (e) => { if (e.target.closest('[data-pz-today]')) S.startMode('daily'); });
  window.addEventListener('caro:page', (e) => { if (e.detail.id === 'puzzles') render(); });
  window.addEventListener('langchange', () => { if (window.CaroShell.current === 'puzzles') render(); });
})();
