/*
 * Hình bàn cờ 9×9 của phần Học và trình phát "phim minh hoạ" có phụ đề.
 *   svg(step)          – hình tĩnh: quân [x, y, 'x' | 'o', số?], dấu [x, y, 'good' | 'bad' | 'n' | 'win' | 'lose', chữ?]
 *   play(el, id)       – phát phim id (learn-demos.js) trong phần tử el: quân hiện lần lượt, quân mới có vòng sáng,
 *                        phụ đề theo ngôn ngữ đang chọn (i18n-demos.js: demo_<id>_<n>), nút phát lại / tạm dừng.
 *   stop()             – dừng phim đang phát (khi chuyển bước / đóng hộp thoại).
 * Dùng bởi learn.js.
 */
(function () {
  'use strict';
  const T = window.I18N.t;
  const D = window.CaroLearnDemos;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = 9, C = 32, P = 6, W = N * C + P * 2;
  const cx = (x) => P + x * C + C / 2;

  function grid() {
    let g = '';
    for (let i = 0; i <= N; i++) {
      g += `<line x1="${P}" y1="${P + i * C}" x2="${P + N * C}" y2="${P + i * C}"/><line x1="${P + i * C}" y1="${P}" x2="${P + i * C}" y2="${P + N * C}"/>`;
    }
    return `<g class="rgrid">${g}</g>`;
  }
  function stone(x, y, p, n, cls) {
    let s = p === 'x'
      ? `<g class="rx${cls ? ' ' + cls : ''}"><line x1="${cx(x) - 9}" y1="${cx(y) - 9}" x2="${cx(x) + 9}" y2="${cx(y) + 9}"/><line x1="${cx(x) + 9}" y1="${cx(y) - 9}" x2="${cx(x) - 9}" y2="${cx(y) + 9}"/></g>`
      : `<circle class="ro${cls ? ' ' + cls : ''}" cx="${cx(x)}" cy="${cx(y)}" r="9.5"/>`;
    if (n) s += `<text class="rn" x="${cx(x) + 11}" y="${cx(y) - 7}">${n}</text>`;
    return s;
  }
  function mark(x, y, k, label) {
    if (k === 'n') return `<g class="rnum"><circle cx="${cx(x)}" cy="${cx(y)}" r="10"/><text x="${cx(x)}" y="${cx(y) + 4}">${esc(label)}</text></g>`;
    if (k === 'win' || k === 'lose') return `<circle class="r${esc(k)}" cx="${cx(x)}" cy="${cx(y)}" r="8"/>`;
    return k === 'bad'
      ? `<g class="rbad"><rect x="${cx(x) - 14}" y="${cx(y) - 14}" width="28" height="28" rx="6"/><line x1="${cx(x) - 7}" y1="${cx(y) - 7}" x2="${cx(x) + 7}" y2="${cx(y) + 7}"/><line x1="${cx(x) + 7}" y1="${cx(y) - 7}" x2="${cx(x) - 7}" y2="${cx(y) + 7}"/></g>`
      : `<g class="rgood"><rect x="${cx(x) - 14}" y="${cx(y) - 14}" width="28" height="28" rx="6"/><path d="M${cx(x) - 7} ${cx(y)} l5 5 l9 -10"/></g>`;
  }

  /** Hình tĩnh của một bước. */
  function svg(step) {
    let st = '';
    for (const [x, y, p, n] of step.s || []) st += stone(x, y, p, n);
    for (const [x, y, k, label] of step.m || []) st += mark(x, y, k, label);
    if (step.last) st += `<circle class="rlast" cx="${cx(step.last[0])}" cy="${cx(step.last[1])}" r="14"/>`;
    if (step.line) {
      const [[a, b], [c, d]] = step.line;
      st += `<line class="rline" x1="${cx(a)}" y1="${cx(b)}" x2="${cx(c)}" y2="${cx(d)}"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${W}" role="img" aria-hidden="true">${grid()}${st}</svg>`;
  }

  // ---------------------------------------------------------------- Phim minh hoạ
  /** Danh sách khung đã dựng sẵn của phim id: [{ s (cộng dồn), m, last, line, cap }]. */
  function build(id) {
    const d = D.DEMOS[id];
    if (d.kind === 'openings') {
      const o = D.OPENINGS[d.which];
      const names = T('open_names_' + d.which).split('|');
      return o.x3.map(([x, y], i) => {
        const n = i + 1;
        const ev = o.xwin.includes(n) ? T('demo_open_xwin') : o.owin.includes(n) ? T('demo_open_owin') : '';
        return {
          s: [[4, 4, 'x', 1], [o.o2[0], o.o2[1], 'o', 2], [x, y, 'x', 3]],
          last: [x, y],
          cap: `${n}. ${names[i] || ''}${ev ? ' – ' + ev : ''}`,
        };
      });
    }
    const out = [];
    let stones = d.init.map((s) => s.slice());
    d.frames.forEach((f, i) => {
      stones = stones.concat((f.s || []).map((s) => s.slice()));
      const lastS = f.s && f.s.length ? f.s[f.s.length - 1] : null;
      out.push({ s: stones.slice(), m: f.m || [], last: lastS ? [lastS[0], lastS[1]] : null, line: f.line || null, cap: T(`demo_${id}_${i + 1}`) });
    });
    return out;
  }

  let cur = null; // { el, id, frames, i, timer, paused }
  const STEP_MS = 2600;

  function stop() {
    if (cur) clearTimeout(cur.timer);
    cur = null;
  }
  function draw() {
    const c = cur, f = c.frames[c.i];
    const atEnd = c.i >= c.frames.length - 1;
    c.el.innerHTML = `<div class="demo">
      <div class="demo-stage">${svg(f)}<div class="demo-cap" aria-live="polite">${esc(f.cap)}</div></div>
      <div class="demo-ctl">
        <button type="button" class="ghost sm icon" data-demo="${atEnd ? 'replay' : c.paused ? 'play' : 'pause'}" aria-label="${esc(T(atEnd ? 'demo_replay' : c.paused ? 'demo_play' : 'demo_pause'))}">
          <svg class="ico" aria-hidden="true"><use href="#i-${atEnd ? 'retry' : c.paused ? 'play' : 'pause'}"/></svg></button>
        <span class="demo-dots">${c.frames.map((_, k) => `<i class="${k <= c.i ? 'on' : ''}"></i>`).join('')}</span>
        <button type="button" class="ghost sm icon" data-demo="next" aria-label="${esc(T('demo_next'))}"${atEnd ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-next"/></svg></button>
      </div></div>`;
  }
  function tick() {
    const c = cur;
    if (!c || c.paused || c.i >= c.frames.length - 1) return;
    // Phụ đề dài thì dừng lâu hơn một chút
    c.timer = setTimeout(() => {
      if (cur !== c) return;
      c.i++;
      draw();
      tick();
    }, STEP_MS + Math.min(2400, c.frames[c.i].cap.length * 18));
  }
  /** Phát phim id trong phần tử el (thay nội dung el). Đang phát đúng phim đó (vd. vẽ lại khi đổi ngôn ngữ): giữ khung. */
  function play(el, id) {
    if (cur && cur.el === el && cur.id === id && el.querySelector('.demo')) {
      cur.frames = build(id);
      draw();
      return;
    }
    stop();
    cur = { el, id, frames: build(id), i: 0, timer: 0, paused: false };
    draw();
    tick();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-demo]');
    if (!b || !cur || !cur.el.contains(b)) return;
    const a = b.dataset.demo;
    clearTimeout(cur.timer);
    if (a === 'replay') { cur.i = 0; cur.paused = false; }
    else if (a === 'pause') cur.paused = true;
    else if (a === 'play') cur.paused = false;
    else if (a === 'next' && cur.i < cur.frames.length - 1) cur.i++;
    draw();
    tick();
  });
  // Đổi ngôn ngữ giữa chừng: dựng lại phụ đề, giữ khung đang xem
  window.addEventListener('langchange', () => {
    if (!cur || !cur.el.isConnected) return;
    const i = cur.i;
    cur.frames = build(cur.id);
    cur.i = Math.min(i, cur.frames.length - 1);
    draw();
  });

  window.CaroLearnBoard = { svg, play, stop, build };
})();
