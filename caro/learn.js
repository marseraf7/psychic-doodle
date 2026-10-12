/*
 * Học chơi có hướng dẫn (như "Learn" của Lichess): 6 bài ngắn, mỗi bài là một thế cờ có giải thích,
 * người chơi tự đặt quân, máy kiểm tra. Dùng bộ luyện tập Trainer của study.js.
 * Người mới mở game lần đầu thấy thẻ "Bạn chơi Caro tới đâu?" để chọn điểm khởi đầu (như chess.com).
 * Các mục giải thích từng bước (mỗi bước một hình bàn cờ nhỏ):
 *  - Luật chơi: Caro Việt Nam, Gomoku tự do, Gomoku tiêu chuẩn, Renju (đều chơi được trong game), luật khai cuộc Swap2.
 *  - Khai cuộc: 26 thế khai cuộc chuẩn (Renju), Hoa Nguyệt & Phố Nguyệt, thế Nón lá.
 *  - Chiến thuật: VCF (chuỗi nước bốn), VCT (chuỗi đe doạ), 4 lối đánh của nhân vật máy.
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
    // Chuỗi nước bốn thuần (luật Gomoku tự do: chỉ nước bốn mới buộc đối thủ chặn)
    { id: 'vcf', puzzle: { t: 'vcf', rule: 'free', len: 3 } },
    // Chuỗi đe doạ (luật Việt Nam: nước ba mở cũng là đe doạ thắng)
    { id: 'vct', puzzle: { t: 'vct', rule: 'vn', len: 3 } },
    // Thế nón lá (luật tự do): đối thủ chỉ chặn hai ngọn nón; X thắng bằng chuỗi nước bốn từ hai góc đáy rồi giữa đáy
    { id: 'nonla', rule: 'free', moves: pos([[4, 1], [3, 2], [5, 2], [2, 3], [6, 3], [3, 4], [5, 4]], [[5, 0], [3, 0], [0, 0], [8, 0], [0, 8], [8, 8], [8, 6]]),
      goal: 'win', left: 4, sol: [1, 4] },
    // Renju: X tìm nước 4-3 (được phép) thay vì ô 3-3 (cấm)
    { id: 'renju43', rule: 'renju', moves: pos([[1, 4], [2, 4], [3, 4], [4, 2], [4, 3], [7, 7], [8, 7], [6, 8], [6, 9]], [[0, 4], [8, 0], [0, 8], [2, 0], [0, 1], [8, 2], [1, 9], [3, 9], [9, 4]]),
      goal: 'win', left: 3, sol: [4, 4] },
  ];

  // ---------------------------------------------------------------- Giải thích luật
  // Mỗi bước: chữ (i18n "rule_<luật>_<n>") + hình bàn cờ 9×9: quân [x, y, 'x' | 'o' | số thứ tự], dấu [x, y, 'bad' | 'good']
  // Toạ độ trên hình 9×9: tâm (4, 4); y tăng xuống dưới. Dấu [x, y, 'n', chữ] = số / chữ trên ô trống.
  const C0 = [4, 4, 'x', 1];
  const DIRECT = [[4, 2], [5, 2], [6, 2], [5, 3], [6, 3], [5, 4], [6, 4], [4, 5], [5, 5], [6, 5], [4, 6], [5, 6], [6, 6]];
  const INDIRECT = [[6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [5, 4], [5, 5], [5, 6], [4, 5], [4, 6], [3, 5], [3, 6], [2, 6]];
  const RULES = {
    vn: [
      { s: [] },
      { s: [[2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [5, 2, 'o'], [3, 6, 'o'], [6, 6, 'o']] },
      { s: [[1, 4, 'o'], [2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [6, 4, 'x'], [3, 6, 'o'], [5, 2, 'o']] },
      { s: [[1, 4, 'o'], [2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [6, 4, 'x'], [7, 4, 'o'], [4, 6, 'o']], m: [[4, 2, 'bad']] },
      { s: [[3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [4, 6, 'o'], [6, 2, 'o']], m: [[2, 4, 'good'], [6, 4, 'good']] },
    ],
    free: [
      { s: [] },
      { s: [[1, 4, 'o'], [2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [6, 4, 'x'], [7, 4, 'o'], [4, 6, 'o']] },
      { s: [[1, 4, 'x'], [2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [6, 4, 'x'], [2, 6, 'o'], [5, 2, 'o'], [7, 6, 'o']] },
      { s: [[2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [3, 6, 'o'], [6, 2, 'o']], m: [[1, 4, 'good'], [6, 4, 'good']] },
      { s: [[3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [4, 6, 'o'], [6, 2, 'o']], m: [[2, 4, 'good'], [6, 4, 'good']] },
    ],
    std: [
      { s: [] },
      { s: [[1, 4, 'x'], [2, 4, 'x'], [3, 4, 'x'], [5, 4, 'x'], [6, 4, 'x'], [3, 6, 'o'], [5, 2, 'o'], [7, 6, 'o']], m: [[4, 4, 'bad']] },
      { s: [[1, 4, 'x'], [2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [6, 4, 'x'], [3, 6, 'o'], [5, 2, 'o'], [7, 6, 'o'], [2, 2, 'o']], m: [[5, 4, 'bad'], [0, 4, 'good']] },
    ],
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
    // 26 thế khai cuộc: X1 ở tâm, O2 sát cạnh (trực chỉ) hoặc sát chéo (gián chỉ), X3 trong ô 5×5 quanh tâm
    open26: [
      { s: [] },
      { s: [C0, [4, 3, 'o', 2]], m: DIRECT.map(([x, y], i) => [x, y, 'n', i + 1]) },
      { s: [C0, [5, 3, 'o', 2]], m: INDIRECT.map(([x, y], i) => [x, y, 'n', i + 1]) },
      { s: [C0, [4, 3, 'o', 2]], m: [[4, 2, 'win'], [5, 2, 'win'], [5, 3, 'win'], [5, 4, 'win'], [6, 4, 'win'], [6, 6, 'lose']] },
      { s: [C0, [5, 3, 'o', 2]], m: [[6, 3, 'win'], [6, 4, 'win'], [6, 5, 'win'], [5, 4, 'win'], [5, 5, 'win'], [5, 6, 'win'], [4, 6, 'win'], [2, 6, 'lose']] },
      { s: [] },
    ],
    // Hoa Nguyệt (花月, trực chỉ số 4) và Phố Nguyệt (浦月, gián chỉ số 7)
    moon: [
      { s: [C0, [4, 3, 'o', 2], [5, 3, 'x', 3]] },
      { s: [C0, [5, 3, 'o', 2], [5, 5, 'x', 3]] },
      { s: [C0, [4, 3, 'o', 2], [5, 3, 'x', 3]] },
      { s: [] },
    ],
    // Thế nón lá: các quân xếp thành tam giác cân (đỉnh nón ở trên, hai cạnh là hai đường chéo, đáy là hàng ngang)
    nonla: [
      { s: [[4, 1, 'x'], [3, 2, 'x'], [5, 2, 'x'], [2, 3, 'x'], [6, 3, 'x']], m: [[1, 4, 'good'], [4, 4, 'good'], [7, 4, 'good']] },
      { s: [[4, 1, 'x'], [3, 2, 'x'], [5, 2, 'x'], [2, 3, 'x'], [6, 3, 'x'], [3, 4, 'x'], [5, 4, 'x'], [5, 0, 'o'], [3, 0, 'o']], m: [[1, 4, 'good'], [7, 4, 'good'], [4, 4, 'good']] },
      { s: [] },
    ],
    vcf: [
      { s: [] },
      { s: [[2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [1, 4, 'o'], [5, 2, 'x'], [5, 3, 'x'], [5, 1, 'o']], m: [[5, 4, 'good']] },
      { s: [] },
    ],
    vct: [
      { s: [] },
      { s: [[2, 4, 'x'], [3, 4, 'x'], [4, 2, 'x'], [4, 3, 'x'], [2, 6, 'o'], [6, 6, 'o'], [7, 1, 'o']], m: [[4, 4, 'good']] },
      { s: [] },
    ],
    styles: [
      { s: [] },
      { s: [] },
      { s: [] },
      { s: [] },
      { s: [] },
    ],
  };
  const GROUPS = [['rules-list', ['vn', 'free', 'std', 'renju', 'swap2']], ['open-list', ['open26', 'moon', 'nonla']], ['tactic-list', ['vcf', 'vct', 'styles']]];
  // Bước cuối của một số mục có nút "Luyện ngay": mở bài thực hành / bài đố theo chủ đề
  const PRACTICE = {
    renju: () => startLesson(LESSONS.findIndex((L) => L.id === 'renju43')),
    vcf: () => window.CaroStudy.startMode('vcf'),
    vct: () => window.CaroStudy.startMode('vct'),
    nonla: () => { const i = LESSONS.findIndex((L) => L.id === 'nonla'); if (i >= 0) startLesson(i); },
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
    for (const [x, y, k, label] of step.m || []) {
      if (k === 'n') { st += `<g class="rnum"><circle cx="${cx(x)}" cy="${cx(y)}" r="10"/><text x="${cx(x)}" y="${cx(y) + 4}">${label}</text></g>`; continue; }
      if (k === 'win' || k === 'lose') { st += `<circle class="r${k}" cx="${cx(x)}" cy="${cx(y)}" r="8"/>`; continue; }
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
    $('rule-try').hidden = !(rv.i === steps.length - 1 && PRACTICE[rv.id] && (rv.id !== 'nonla' || LESSONS.some((L) => L.id === 'nonla')));
  }
  $('rule-try').onclick = () => { const id = rv.id; markRead(id); N.closeDlg('rule-dlg'); PRACTICE[id](); };
  function markRead(id) {
    const d = load();
    d.rules = [...new Set([...(d.rules || []), id])];
    save(d);
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
    markRead(rv.id);
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
    let moves = L.moves, goal = L.goal || 'place', left = L.left || 1, sol = L.sol, rule = L.rule || 'vn';
    if (L.puzzle) {
      // Bài đố chuỗi ép thật (3 nước) theo chủ đề: VCF (luật tự do) hoặc VCT (luật Việt Nam)
      try {
        const list = await window.CaroStudy.loadPuzzles();
        const P = L.puzzle;
        const q = list.find((z) => z.len === P.len && (z.t || 'vct') === P.t && (z.rule || 'vn') === P.rule) || list.find((z) => z.len === P.len) || list[0];
        moves = q.m; goal = 'win'; left = q.len; sol = q.sol; rule = q.rule || 'vn';
      } catch (e) { N.toast(T('pz_load_fail')); return; }
    }
    N.closeDlg('learn-dlg');
    const p = moves.length % 2 ? C.O : C.X;
    const last = i === LESSONS.length - 1;
    window.CaroStudy.Trainer.start({
      moves, p, goal, left, sol, kind: 'lesson', rule,
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
    for (const [list, ids] of GROUPS) {
      $(list).innerHTML = ids.map((id) => `<li>
        <span class="ln-n ${read.has(id) ? 'done' : ''}">${read.has(id) ? '<svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>' : '§'}</span>
        <div class="pn"><b>${esc(T('rule_' + id))}</b><small>${esc(T('rule_' + id + '_sub'))}</small></div>
        <button type="button" class="${read.has(id) ? 'ghost' : 'primary'} sm" data-rule="${id}">${esc(T('rule_read'))}</button></li>`).join('');
    }
  }
  function openLearn() {
    renderList();
    N.closeDlg('puzzle-dlg');
    N.openDlg('learn-dlg');
  }
  for (const [list] of GROUPS) {
    $(list).addEventListener('click', (e) => {
      const b = e.target.closest('[data-rule]');
      if (b) openRule(b.dataset.rule);
    });
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

  window.addEventListener('langchange', () => { if (N.isOpen('learn-dlg')) renderList(); if (N.isOpen('rule-dlg')) renderRule(); });
  window.CaroLearn = { open: openLearn, start: startLesson, LESSONS, RULES, openRule, doneCount: () => doneSet().size };
  welcome();
})();
