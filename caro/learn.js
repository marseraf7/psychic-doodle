/*
 * Học chơi có hướng dẫn (như "Learn" của Lichess): 6 bài ngắn, mỗi bài là một thế cờ có giải thích,
 * người chơi tự đặt quân, máy kiểm tra. Dùng bộ luyện tập Trainer của study.js.
 * Người mới mở game lần đầu thấy thẻ "Bạn chơi Caro tới đâu?" để chọn điểm khởi đầu (như chess.com).
 * Mục "Luật chơi": giải thích luật khai cuộc Swap2 (có trong game) và luật Renju (luật thi đấu quốc tế, so sánh với
 * luật của game) – từng bước, mỗi bước một hình bàn cờ nhỏ.
 */
(function () {
  'use strict';
  const T = window.I18N.t;
  const C = window.Caro;
  const A = window.CaroAnalysis;
  const App = window.CaroApp;
  const N = window.CaroOnline;
  const esc = App.esc;
  const $ = (id) => document.getElementById(id);
  const STORE = 'caro.learn';

  /** Thế cờ từ danh sách quân X và O (X đi trước, quân xen kẽ). */
  function pos(xs, os) {
    const out = [];
    for (let i = 0; i < Math.max(xs.length, os.length); i++) {
      if (xs[i]) out.push(xs[i]);
      if (os[i]) out.push(os[i]);
    }
    return out;
  }
  const winNow = (board, x, y, p) => C.winsIfPlaced(board, x, y, p);

  const LESSONS = [
    { id: 'five', moves: pos([[0, 0], [1, 0], [2, 0], [3, 0]], [[-1, 0], [1, 1], [3, 1], [1, 3]]), check: winNow, sol: [4, 0] },
    { id: 'blocked', moves: pos([[0, 0], [1, 0], [2, 0], [3, 0], [2, 3]], [[-1, 0], [1, 1], [3, 1], [1, 3]]), goal: 'save', sol: [4, 0] },
    { id: 'open4', moves: pos([[0, 0], [1, 0], [2, 0]], [[0, 2], [2, 2], [-3, 3]]), check: winNow, sol: [3, 0] },
    { id: 'open3', moves: pos([[0, 0], [1, 0], [2, 0], [5, 5]], [[0, 2], [2, 2], [-3, 3]]), goal: 'save', sol: [3, 0] },
    { id: 'double', moves: pos([[0, 0], [1, 0], [2, 1], [2, 2]], [[5, 5], [-3, 3], [6, -4], [-4, -3]]), goal: 'win', left: 2, sol: [2, 0] },
    { id: 'vcf', puzzle: 3 },
  ];

  // ---------------------------------------------------------------- Giải thích luật
  // Mỗi bước: chữ (i18n "rule_<luật>_<n>") + hình bàn cờ 9×9: quân [x, y, 'x' | 'o' | số thứ tự], dấu [x, y, 'bad' | 'good']
  const RULES = {
    swap2: [
      { s: [] },
      { s: [[3, 4, 'x', 1], [5, 3, 'o', 2], [4, 4, 'x', 3]] },
      { s: [[3, 4, 'x'], [5, 3, 'o'], [4, 4, 'x']], m: [[4, 5, 'good']] },
      { s: [[3, 4, 'x'], [5, 3, 'o'], [4, 4, 'x'], [3, 5, 'o', 4], [5, 5, 'x', 5]] },
      { s: [[3, 4, 'x'], [5, 3, 'o'], [4, 4, 'x'], [3, 5, 'o'], [5, 5, 'x']], m: [[4, 3, 'good']] },
      { s: [[3, 4, 'x'], [5, 3, 'o'], [4, 4, 'x']] },
    ],
    renju: [
      { s: [] },
      { s: [[2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [6, 4, 'x'], [1, 4, 'o'], [3, 6, 'o'], [5, 2, 'o']] },
      { s: [[3, 4, 'x'], [4, 4, 'x'], [5, 2, 'x'], [5, 3, 'x'], [2, 6, 'o'], [7, 1, 'o']], m: [[5, 4, 'bad']] },
      { s: [[2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 1, 'x'], [5, 2, 'x'], [5, 3, 'x'], [1, 4, 'o'], [5, 0, 'o']], m: [[5, 4, 'bad']] },
      { s: [[1, 4, 'x'], [2, 4, 'x'], [3, 4, 'x'], [5, 4, 'x'], [6, 4, 'x'], [4, 6, 'o'], [2, 2, 'o']], m: [[4, 4, 'bad']] },
      { s: [[2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 2, 'x'], [5, 3, 'x'], [1, 4, 'o'], [7, 6, 'o']], m: [[5, 4, 'good']] },
      { s: [[1, 4, 'o'], [2, 4, 'o'], [3, 4, 'o'], [5, 4, 'o'], [6, 4, 'o'], [3, 2, 'x'], [5, 6, 'x']], m: [[4, 4, 'good']] },
      { s: [[2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [2, 6, 'x'], [3, 6, 'x'], [4, 6, 'x'], [5, 6, 'x'], [6, 6, 'x'], [1, 6, 'o'], [7, 6, 'o'], [4, 2, 'o']] },
    ],
  };

  /** Hình bàn cờ 9×9 (SVG): lưới, quân X / O (có số thứ tự nếu có), dấu ✕ đỏ (cấm) / ✓ xanh (được đi). */
  function boardSvg(step) {
    const N = 9, C = 32, P = 6, W = N * C + P * 2;
    let g = '';
    for (let i = 0; i <= N; i++) {
      g += `<line x1="${P}" y1="${P + i * C}" x2="${P + N * C}" y2="${P + i * C}"/><line x1="${P + i * C}" y1="${P}" x2="${P + i * C}" y2="${P + N * C}"/>`;
    }
    const cx = (x) => P + x * C + C / 2;
    let st = '';
    for (const [x, y, p, n] of step.s || []) {
      if (p === 'x') st += `<g class="rx"><line x1="${cx(x) - 9}" y1="${cx(y) - 9}" x2="${cx(x) + 9}" y2="${cx(y) + 9}"/><line x1="${cx(x) + 9}" y1="${cx(y) - 9}" x2="${cx(x) - 9}" y2="${cx(y) + 9}"/></g>`;
      else st += `<circle class="ro" cx="${cx(x)}" cy="${cx(y)}" r="9.5"/>`;
      if (n) st += `<text class="rn" x="${cx(x) + 11}" y="${cx(y) - 7}">${n}</text>`;
    }
    for (const [x, y, k] of step.m || []) {
      st += k === 'bad'
        ? `<g class="rbad"><rect x="${cx(x) - 14}" y="${cx(y) - 14}" width="28" height="28" rx="6"/><line x1="${cx(x) - 7}" y1="${cx(y) - 7}" x2="${cx(x) + 7}" y2="${cx(y) + 7}"/><line x1="${cx(x) + 7}" y1="${cx(y) - 7}" x2="${cx(x) - 7}" y2="${cx(y) + 7}"/></g>`
        : `<g class="rgood"><rect x="${cx(x) - 14}" y="${cx(y) - 14}" width="28" height="28" rx="6"/><path d="M${cx(x) - 7} ${cx(y)} l5 5 l9 -10"/></g>`;
    }
    return `<svg viewBox="0 0 ${W} ${W}" role="img" aria-hidden="true"><g class="rgrid">${g}</g>${st}</svg>`;
  }

  const rv = { id: null, i: 0 };
  function renderRule() {
    const steps = RULES[rv.id];
    const step = steps[rv.i];
    $('rule-name').textContent = T('rule_' + rv.id);
    $('rule-step').textContent = T('rule_step', { n: rv.i + 1, total: steps.length });
    const board = $('rule-board');
    board.hidden = !(step.s && step.s.length);
    board.innerHTML = board.hidden ? '' : boardSvg(step);
    $('rule-text').textContent = T(`rule_${rv.id}_${rv.i + 1}`);
    $('rule-prev').disabled = rv.i === 0;
    $('rule-next').textContent = T(rv.i === steps.length - 1 ? 'rule_done' : 'rule_next');
  }
  function openRule(id) {
    rv.id = id;
    rv.i = 0;
    renderRule();
    N.openDlg('rule-dlg');
  }
  $('rule-prev').onclick = () => { if (rv.i > 0) { rv.i--; renderRule(); } };
  $('rule-next').onclick = () => {
    if (rv.i < RULES[rv.id].length - 1) { rv.i++; renderRule(); return; }
    N.closeDlg('rule-dlg');
    const d = load();
    d.rules = [...new Set([...(d.rules || []), rv.id])];
    save(d);
    renderList();
  };
  // Nút Back (Android): lùi một bước, ở bước đầu thì đóng
  $('rule-dlg').onBack = () => { if (rv.i > 0) { rv.i--; renderRule(); return true; } return false; };

  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (e) { /* riêng tư */ } }
  const doneSet = () => new Set(load().done || []);

  function markDone(id) {
    const d = load();
    d.done = [...new Set([...(d.done || []), id])];
    save(d);
    window.dispatchEvent(new CustomEvent('caro:lesson', { detail: { id, all: d.done.length >= LESSONS.length } }));
  }

  async function startLesson(i) {
    const L = LESSONS[i];
    let moves = L.moves, goal = L.goal || 'place', left = L.left || 1, sol = L.sol;
    if (L.puzzle) {
      // Bài cuối: một bài đố chuỗi ép thật (3 nước)
      try {
        const list = window.CaroStudy.puzzles || await (await fetch('puzzles.json')).json();
        const q = list.find((z) => z.len === L.puzzle) || list[0];
        moves = q.m; goal = 'win'; left = q.len; sol = q.sol;
      } catch (e) { N.toast(T('pz_load_fail')); return; }
    }
    N.closeDlg('learn-dlg');
    const p = moves.length % 2 ? C.O : C.X;
    const last = i === LESSONS.length - 1;
    window.CaroStudy.Trainer.start({
      moves, p, goal, left, sol, kind: 'lesson',
      check: L.check || null,
      prompt: T('learn_' + L.id + '_task'),
      card: `<b>${esc(T('learn_n', { n: i + 1, total: LESSONS.length }))} · ${esc(T('learn_' + L.id))}</b><small>${esc(T('learn_' + L.id + '_card'))}</small>`,
      title: T('learn_title'),
      onSolved: () => markDone(L.id),
      next: last ? null : () => startLesson(i + 1),
      nextLabel: 'learn_next',
      exitLabel: 'tr_exit',
    });
  }

  function renderList() {
    const done = doneSet();
    $('learn-list').innerHTML = LESSONS.map((L, i) => `<li>
      <span class="ln-n ${done.has(L.id) ? 'done' : ''}">${done.has(L.id) ? '<svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>' : i + 1}</span>
      <div class="pn"><b>${esc(T('learn_' + L.id))}</b><small>${esc(T('learn_' + L.id + '_sub'))}</small></div>
      <button type="button" class="${done.has(L.id) ? 'ghost' : 'primary'} sm" data-lesson="${i}">${esc(T(done.has(L.id) ? 'learn_again' : 'learn_start'))}</button></li>`).join('');
    $('learn-progress').textContent = T('learn_progress', { n: done.size, total: LESSONS.length });
    const read = new Set(load().rules || []);
    $('rules-list').innerHTML = Object.keys(RULES).map((id) => `<li>
      <span class="ln-n ${read.has(id) ? 'done' : ''}">${read.has(id) ? '<svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>' : '§'}</span>
      <div class="pn"><b>${esc(T('rule_' + id))}</b><small>${esc(T('rule_' + id + '_sub'))}</small></div>
      <button type="button" class="${read.has(id) ? 'ghost' : 'primary'} sm" data-rule="${id}">${esc(T('rule_read'))}</button></li>`).join('');
  }
  function openLearn() {
    renderList();
    N.closeDlg('puzzle-dlg');
    N.openDlg('learn-dlg');
  }
  $('rules-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rule]');
    if (b) openRule(b.dataset.rule);
  });
  $('learn-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lesson]');
    if (b) startLesson(Number(b.dataset.lesson));
  });

  // ---------------------------------------------------------------- Người mới: chọn trình độ
  function welcome() {
    let seen = false, fresh = true;
    try { seen = !!localStorage.getItem('caro.welcomed'); fresh = !localStorage.getItem('caro.v1'); } catch (e) { return; }
    if (seen || !fresh || navigator.webdriver || location.search) return; // đã chọn / người dùng cũ / mở bằng link / kiểm thử tự động
    const el = $('welcome-card');
    el.hidden = false;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-level]');
      if (!b) return;
      try { localStorage.setItem('caro.welcomed', b.dataset.level); } catch (er) { /* riêng tư */ }
      el.hidden = true;
      const lv = b.dataset.level;
      if (lv === 'new') { App.setBot('na'); openLearn(); }
      else if (lv === 'know') App.setBot('ti');
      else if (lv === 'good') App.setBot('mai', 4);
    });
  }

  window.addEventListener('langchange', () => { if (N.isOpen('learn-dlg')) renderList(); if (N.isOpen('rule-dlg')) renderRule(); });
  window.CaroLearn = { open: openLearn, start: startLesson, LESSONS, RULES, openRule, doneCount: () => doneSet().size };
  welcome();
})();
