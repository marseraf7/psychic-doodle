/*
 * Học chơi có hướng dẫn (như "Learn" của Lichess): 6 bài ngắn, mỗi bài là một thế cờ có giải thích,
 * người chơi tự đặt quân, máy kiểm tra. Dùng bộ luyện tập Trainer của study.js.
 * Người mới mở game lần đầu thấy thẻ "Bạn chơi Caro tới đâu?" để chọn điểm khởi đầu (như chess.com).
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
  }
  function openLearn() {
    renderList();
    N.closeDlg('puzzle-dlg');
    N.openDlg('learn-dlg');
  }
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

  window.addEventListener('langchange', () => { if (N.isOpen('learn-dlg')) renderList(); });
  window.CaroLearn = { open: openLearn, start: startLesson, LESSONS, doneCount: () => doneSet().size };
  welcome();
})();
