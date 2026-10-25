/*
 * Phân tích – đi thử (biến thể, như bàn phân tích của Lichess; tự viết lại). Đang xem lại ván với bảng phân tích mở, chạm
 * một ô trống là đi thử nước đó từ thế đang xem; hai bên đi tiếp tuỳ ý. Máy chấm mỗi thế mới trong Web Worker riêng
 * (ai-worker.js, type 'eval' – không tranh với phân tích cả ván): khả năng thắng của hai bên + nước gợi ý (vòng xanh).
 * Thanh dưới (#ext-bar): Lùi · Đi nước gợi ý · Quay về ván. Mượn bàn cờ qua CaroApp.enterExt như "Thử lại".
 *   - "Tìm nước tốt hơn" (goal 'better'): Thử lại cho nước chưa chính xác / sai lầm chấm theo khả năng thắng – nước đầu
 *     của người chơi được so với nước tốt nhất của máy (tụt dưới 5% so với nước gợi ý là đạt), sau đó đi thử tự do.
 *   - line(moves, rule, n): dòng máy gợi ý – hỏi máy liên tiếp n nước tốt nhất từ một thế (study.js vẽ quân đánh số).
 *   window.CaroExplore = { canStart(), start(opts), exit(), line(moves, rule, n), get active, get entering }
 *   opts: { base: các nước tới thế bắt đầu, first: [x, y] (đi thử luôn nước này), backTo: nước quay về khi thoát,
 *           rule, goal: 'better', p: bên tìm nước, best: nước tốt nhất của máy }
 */
(function () {
  'use strict';
  const App = window.CaroApp;
  const A = window.CaroAnalysis;
  const C = window.Caro;
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  const glyph = (p) => (p === C.X ? '<b class="dot x">X</b>' : '<b class="dot o">O</b>');
  const GOOD = '#5c9e31';
  const EVAL_MS = 500; // mỗi thế đi thử: đủ thấy chuỗi ép ngắn, vẫn trả lời trong chừng nửa giây
  const LINE_MS = 350;
  const BETTER_SLACK = 0.05; // nước người chơi kém nước của máy dưới 5% khả năng thắng thì coi là đạt
  const LOST = 0.05; // nước tốt nhất của máy cũng chỉ còn < 5%: thế đã thua, không chấm

  // ------------------------------------------------------------ Worker chấm thế (riêng cho đi thử / dòng máy)
  let worker = null, seq = 0;
  const waiting = new Map();
  function getWorker() {
    if (worker || location.protocol === 'file:' || !window.Worker) return worker;
    try {
      worker = new Worker('ai-worker.js');
      worker.onmessage = (e) => {
        const fn = waiting.get(e.data.id);
        if (fn) { waiting.delete(e.data.id); fn(e.data.error ? null : e.data.ev); }
      };
      worker.onerror = () => { worker = null; for (const fn of waiting.values()) fn(null); waiting.clear(); };
    } catch (e) { worker = null; }
    return worker;
  }
  /** Chấm thế sau các nước moves: { move, score, mate } cho bên tới lượt, null nếu không chấm được (thế quá rộng…). */
  function evalPos(moves, rule, ms) {
    const w = getWorker();
    if (!w) {
      return new Promise((res) => setTimeout(() => { try { res(A.evaluate(moves, ms, rule)); } catch (e) { res(null); } }, 30));
    }
    const id = 'ex' + ++seq;
    return new Promise((res) => { waiting.set(id, res); w.postMessage({ type: 'eval', id, moves, rule, ms }); });
  }
  const winChance = (ev) => (ev.mate > 0 ? 1 : ev.mate < 0 ? 0 : window.CaroEngine.winChance(ev.score));
  const validMove = (m) => Array.isArray(m) && m.length === 2;

  /** Dòng máy gợi ý: n nước tốt nhất liên tiếp từ thế sau moves (dừng sớm nếu có bên thắng / máy không chấm được). */
  async function line(moves, rule, n) {
    const out = [];
    const b = new C.Board(rule);
    moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? C.O : C.X));
    let cur = moves.slice();
    for (let k = 0; k < n; k++) {
      const ev = await evalPos(cur, rule, LINE_MS);
      if (!ev || !validMove(ev.move) || b.get(ev.move[0], ev.move[1]) !== C.EMPTY) break;
      const p = cur.length % 2 ? C.O : C.X;
      b.play(ev.move[0], ev.move[1], p);
      out.push(ev.move);
      cur = cur.concat([ev.move]);
      if (C.checkWin(b, ev.move[0], ev.move[1], p)) break;
    }
    return out;
  }

  // ------------------------------------------------------------ Đi thử
  let st = null; // { base, line, backTo, rule, goal, p, best, ev, evSeq, msg, msgCls, judged, refAfter, over }
  let entering = false;
  const toMove = () => (st.line.length % 2 ? C.O : C.X);

  /** Chạm bàn lúc này thì vào đi thử được không: đang xem lại, bảng phân tích mở, chưa ở bàn của module khác. */
  function canStart() {
    return !!App.replay && !App.ext && document.body.classList.contains('analysis');
  }

  function start(opts) {
    const base = opts.base.slice();
    st = { base, line: base.slice(), backTo: opts.backTo, rule: opts.rule, goal: opts.goal || null, p: opts.p, best: opts.best,
      ev: null, evSeq: 0, msg: '', msgCls: '', judged: false, refAfter: null, over: false };
    const ctrl = {
      moves: base, rule: st.rule,
      get canPlay() { return !!st; },
      onMove, onExit: () => exit(), render,
    };
    entering = true; // study.js giữ bảng phân tích khi bàn chuyển sang chế độ đi thử
    try { App.enterExt(ctrl); } finally { entering = false; }
    if (st.goal === 'better' && validMove(st.best)) {
      // Mốc so sánh: khả năng thắng của người chơi sau nước tốt nhất của máy
      const mine = st;
      evalPos(st.base.concat([st.best]), st.rule, EVAL_MS).then((ev) => { if (st === mine && ev) { st.refAfter = 1 - winChance(ev); judge(); refresh(); } });
    }
    if (opts.first) onMove(opts.first[0], opts.first[1]);
    else evaluate();
    renderBar();
  }

  function onMove(x, y) {
    if (!st || App.board.get(x, y) !== C.EMPTY) return;
    const p = toMove();
    const fb = C.forbidden(App.board, x, y, p); // Renju: X không được đánh nước cấm
    if (fb) { st.msg = T('forbid_s_' + fb); st.msgCls = 'wrong'; refresh(); return; }
    App.setMarks(null);
    const won = App.extPlace(x, y);
    st.line.push([x, y]);
    if (!(st.goal === 'better' && !st.judged)) { st.msg = ''; st.msgCls = ''; }
    if (won) {
      st.over = true;
      st.ev = { failed: true };
      if (st.goal === 'better' && !st.judged && st.line.length === st.base.length + 1) {
        st.judged = true; // thắng ngay: chắc chắn tốt hơn
        st.msg = T('ex_better_ok', { w: 100 });
        window.CaroSound && window.CaroSound.play('win');
      } else st.msg = T('ex_won', { p: p === C.X ? 'X' : 'O' });
      st.msgCls = 'solved';
      refresh();
      return;
    }
    evaluate();
  }

  /** Chấm thế hiện tại: khả năng thắng + nước gợi ý (vòng xanh). Kết quả cũ (thế đã đổi) bỏ qua. */
  function evaluate() {
    const mine = st, id = ++st.evSeq, at = st.line.slice();
    st.ev = null;
    App.setMarks(null);
    refresh();
    evalPos(at, st.rule, EVAL_MS).then((ev) => {
      if (st !== mine || st.evSeq !== id) return;
      st.ev = ev || { failed: true };
      if (ev && validMove(ev.move) && App.board.get(ev.move[0], ev.move[1]) === C.EMPTY) {
        App.setMarks([{ x: ev.move[0], y: ev.move[1], kind: 'ghost', color: GOOD, p: toMove() }]);
      }
      judge();
      refresh();
    });
  }

  /** "Tìm nước tốt hơn": chấm nước đầu tiên người chơi đi so với nước tốt nhất của máy (một lần). */
  function judge() {
    if (!st || st.goal !== 'better' || st.judged || st.line.length !== st.base.length + 1) return;
    const mv = st.line[st.base.length];
    const same = validMove(st.best) && mv[0] === st.best[0] && mv[1] === st.best[1];
    if (!same && (st.refAfter == null || !st.ev || st.ev.failed)) return; // chờ đủ hai lần chấm
    st.judged = true;
    const after = same ? st.refAfter : 1 - winChance(st.ev);
    const pct = (v) => Math.round((v == null ? 0 : v) * 100);
    if (st.refAfter != null && st.refAfter < LOST && !same) {
      // Cả nước của máy cũng gần như thua: thế đã khó cứu từ trước, không chấm "đạt / chưa đạt"
      st.msg = T('ex_better_lost', { b: pct(st.refAfter) });
      st.msgCls = '';
      return;
    }
    const ok = same || after >= st.refAfter - BETTER_SLACK;
    st.msg = ok ? T('ex_better_ok', { w: pct(after) }) : T('ex_better_no', { w: pct(after), b: pct(st.refAfter) });
    st.msgCls = ok ? 'solved' : 'wrong';
    window.CaroSound && window.CaroSound.play(ok ? 'win' : 'lose');
    if (ok) window.dispatchEvent(new CustomEvent('caro:solved', { detail: { kind: 'better', clean: true } }));
  }

  function evalText() {
    if (!st.ev) return `<span class="thinking">${esc(T('ex_thinking'))}</span>`;
    if (st.ev.failed) return '';
    const p = toMove(), q = C.other(p);
    if (st.ev.mate) {
      const who = st.ev.mate > 0 ? p : q;
      return `<span class="ex-wc">${esc(T('ex_mate', { p: who === C.X ? 'X' : 'O', n: Math.abs(st.ev.mate) }))}</span>`;
    }
    const w = winChance(st.ev);
    const wX = Math.round((p === C.X ? w : 1 - w) * 100);
    let s = `<span class="ex-wc"><b class="x">X</b> ${wX}% · <b class="o">O</b> ${100 - wX}%</span>`;
    if (validMove(st.ev.move)) s += ` <span class="muted">· ${esc(T('ex_suggest', { p: p === C.X ? 'X' : 'O', c: App.cellName(st.ev.move[0], st.ev.move[1]) }))}</span>`;
    return s;
  }

  function render() {
    if (!st) return { turn: '' };
    let turn;
    if (st.msg) turn = `<span class="tr-msg ${esc(st.msgCls)}">${esc(st.msg)}</span>`;
    else if (st.goal === 'better' && !st.judged) turn = `${glyph(st.p)} <span>${esc(T('ex_better_goal'))}</span>`;
    else turn = evalText(); // bên tới lượt nằm trong "Gợi ý cho X/O"; khả năng thắng ghi cả hai bên
    return { turn, score: esc(T(st.goal === 'better' ? 'an_better' : 'ex_explore')) };
  }

  function refresh() {
    if (!st) return;
    const r = render();
    $('turn').innerHTML = r.turn;
    $('score').innerHTML = r.score || '';
    renderBar();
  }

  function renderBar() {
    const bar = $('ext-bar');
    if (!st) return;
    const btn = (act, icon, key, cls, off) => `<button type="button" data-ex="${act}"${cls ? ` class="${esc(cls)}"` : ''}${off ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-${icon}"/></svg><span>${esc(T(key))}</span></button>`;
    const over = st.over;
    const best = st.ev && !st.ev.failed && validMove(st.ev.move) && !over;
    bar.innerHTML = btn('undo', 'undo', 'ex_undo', '', st.line.length <= st.base.length)
      + (st.goal === 'better' && st.msgCls === 'wrong' ? btn('again', 'retry', 'an_retry', 'hl') : '')
      + btn('best', 'bulb', 'ex_play_best', '', !best)
      + btn('exit', 'back', 'ex_return');
  }

  $('ext-bar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ex]');
    if (!b || !st) return;
    const act = b.dataset.ex;
    if (act === 'exit') return exit();
    if (act === 'undo' || act === 'again') {
      const keep = act === 'again' ? st.base.length : st.line.length - 1;
      if (keep < st.base.length) return;
      st.line = st.line.slice(0, keep);
      st.over = false;
      if (st.line.length <= st.base.length) { st.judged = false; st.msg = ''; st.msgCls = ''; }
      App.extSet(st.line);
      evaluate();
    } else if (act === 'best' && st.ev && validMove(st.ev.move)) onMove(st.ev.move[0], st.ev.move[1]);
  });

  function exit() {
    if (!st) return;
    const backTo = st.backTo;
    st = null;
    $('ext-bar').innerHTML = '';
    App.exitExt();
    if (App.replay) {
      App.seek(backTo);
      requestAnimationFrame(() => requestAnimationFrame(() => { App.resize(); App.fitReplayView(); }));
    }
  }

  // Đóng xem lại / mở câu đố, bài học khi đang đi thử: bỏ đi thử (không tự quay lại bàn xem lại)
  window.addEventListener('caro:replayclose', () => { st = null; });
  window.addEventListener('caro:extenter', () => { if (!entering) st = null; });

  window.CaroExplore = {
    canStart, start, line, evalPos,
    exit: () => exit(),
    get active() { return !!st; },
    get entering() { return entering; },
  };
})();
