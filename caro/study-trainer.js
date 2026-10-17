/*
 * Luyện tập trên một thế cờ (dùng chung cho "Thử lại" nước sai, Giải đố, bài học): người chơi tìm nước thắng / nước cứu,
 * máy chặn lại, gợi ý, xem lời giải, thanh nút dưới bàn cờ (#ext-bar). Mượn bàn cờ qua CaroApp.enterExt.
 * Gắn window.CaroTrainer; study.js, puzzles.js dùng lại (CaroStudy.Trainer là cùng đối tượng).
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
  const ico = (id) => `<svg class="ico i-in" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const GOOD = '#5c9e31';

  // ================================================================ Luyện tập trên 1 thế cờ
  // opts: { moves, p, goal: 'win' | 'save', left, sol, title, onFirst(ok), onSolved(), next, exitLabel, onExit, score() }
  const Trainer = (() => {
    let t = null;
    let timer = 0;

    const busyDelay = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };

    function start(opts) {
      clearTimeout(timer);
      t = { ...opts, line: opts.moves.slice(), status: 'play', msg: '', first: true, failed: false };
      const ctrl = {
        moves: t.moves,
        rule: t.rule,
        get canPlay() { return t && t.status === 'play'; },
        onMove,
        onExit: () => exit(),
        render,
      };
      App.enterExt(ctrl); // đang ở bài khác thì chỉ thay bài, không lưu đè ván đang chơi
      renderCard();
      renderBar();
    }

    /** Thẻ giải thích của bài học (opts.card) phía trên bàn cờ. */
    function renderCard() {
      const el = $('lesson-card');
      if (!t || !t.card) { el.hidden = true; return; }
      el.innerHTML = t.card;
      el.hidden = false;
    }

    function exit() {
      clearTimeout(timer);
      const o = t;
      t = null;
      renderCard();
      if (o && o.onExit) o.onExit();
      else App.exitExt();
    }

    function render() {
      if (!t) return { turn: '' };
      const goalText = t.prompt || T(t.goal === 'win' ? 'tr_find_win' : 'tr_find_save');
      let turn = `${glyph(t.p)} <span>${esc(goalText)}</span>`;
      if (t.goal === 'win' && t.left > 1 && t.status === 'play' && t.first) turn += ` <span class="thinking">${esc(T('tr_in_n', { n: t.left }))}</span>`;
      if (t.msg) turn = `<span class="tr-msg ${t.status}">${t.status === 'solved' ? ico('check') : t.status === 'wrong' ? ico('close') : ''} ${esc(t.msg)}</span>`;
      return { turn, score: t.score ? t.score() : esc(t.title || '') };
    }

    function refresh() {
      if (!t) return;
      // render() được app.js gọi trong updateUI; đổi trạng thái thì vẽ lại bằng cách đặt lại cùng thế cờ không cần thiết
      const r = render();
      $('turn').innerHTML = r.turn;
      $('score').innerHTML = r.score || '';
      renderBar();
    }

    function onMove(x, y) {
      if (!t || t.status !== 'play') return;
      const board = App.board;
      const p = t.p, q = C.other(p);
      App.setMarks(null);
      let ok;
      const fb = C.forbidden(board, x, y, p); // Renju: X đánh vào ô cấm
      if (fb) ok = false;
      else if (t.check) ok = t.check(board, x, y, p); // bài học: điều kiện riêng
      else if (t.goal === 'win') {
        ok = C.winsIfPlaced(board, x, y, p) || A.winningMove(board, p, [x, y], Math.max(2, t.left + 1), { deadline: Date.now() + 700 });
      } else {
        board.put(x, y, p);
        ok = A.immediateWins(board, q).length === 0 && !A.forced(board, q, 4, { deadline: Date.now() + 700 });
        board.remove(x, y);
      }
      if (!ok) {
        App.setMarks([{ x, y, kind: 'bad', color: '#ca3431', text: '?' }]);
        t.status = 'wrong';
        t.msg = fb ? T('forbid_s_' + fb) : T('tr_wrong');
        if (t.first) { t.first = false; t.failed = true; if (t.onFirst) t.onFirst(false); }
        window.CaroSound && window.CaroSound.play('lose');
        refresh();
        return;
      }
      const won = App.extPlace(x, y);
      t.line.push([x, y]);
      if (won || t.goal === 'save' || t.check) return solved();
      // Máy chặn, rồi tới lượt người chơi tiếp tục chuỗi ép.
      t.status = 'busy';
      t.msg = T('tr_good_move');
      refresh();
      busyDelay(() => {
        if (!t) return;
        const b = App.board;
        const reply = A.bestBlock(b, q, [x, y]) || C.chooseMove(b, q, 2);
        App.extPlace(reply[0], reply[1]);
        t.line.push(reply);
        const f = A.forced(b, p, 6, { deadline: Date.now() + 600 });
        t.left = f ? f.len : Math.max(1, t.left - 1);
        t.sol = f ? f.move : null;
        t.status = 'play';
        t.msg = '';
        refresh();
      }, 450);
    }

    function solved() {
      t.status = 'solved';
      t.msg = T(t.failed ? 'tr_solved_after' : 'tr_correct');
      window.CaroSound && window.CaroSound.play('win');
      if (t.first) { t.first = false; if (t.onFirst) t.onFirst(true); }
      if (t.onSolved) t.onSolved(!t.failed);
      window.dispatchEvent(new CustomEvent('caro:solved', { detail: { kind: t.kind || 'retry', clean: !t.failed } }));
      refresh();
    }

    /** Bày lại từ đầu thế cờ (sau khi đi sai). */
    function reset() {
      if (!t) return;
      clearTimeout(timer);
      t.line = t.moves.slice();
      t.status = 'play';
      t.msg = '';
      t.left = t.left0 != null ? t.left0 : t.left;
      App.setMarks(null);
      App.extSet(t.moves);
      if (t.sol0) t.sol = t.sol0;
      refresh();
    }

    function currentSol() {
      const b = App.board;
      if (t.goal === 'win') {
        const f = A.forced(b, t.p, 6, { deadline: Date.now() + 600 });
        return f ? f.move : t.sol;
      }
      return t.sol;
    }

    function hint() {
      if (!t || t.status !== 'play') return;
      const s = currentSol();
      if (!s) return;
      if (t.first) { t.first = false; t.failed = true; if (t.onFirst) t.onFirst(false); }
      App.setMarks([{ x: s[0], y: s[1], kind: 'ghost', color: GOOD }]);
    }

    /** Đi hết lời giải tự động. */
    function showSolution() {
      if (!t) return;
      if (t.status === 'wrong') { reset(); }
      if (t.first) { t.first = false; t.failed = true; if (t.onFirst) t.onFirst(false); }
      t.status = 'busy';
      t.msg = T('tr_showing');
      refresh();
      const step = () => {
        if (!t) return;
        const b = App.board;
        const s = currentSol();
        if (!s || b.get(s[0], s[1]) !== C.EMPTY) { t.status = 'solved'; t.msg = T('tr_solution_done'); refresh(); return; }
        App.setMarks([{ x: s[0], y: s[1], kind: 'ghost', color: GOOD }]);
        busyDelay(() => {
          if (!t) return;
          App.setMarks(null);
          const won = App.extPlace(s[0], s[1]);
          if (won || t.goal === 'save') { t.status = 'solved'; t.msg = T('tr_solution_done'); refresh(); return; }
          busyDelay(() => {
            if (!t) return;
            const reply = A.bestBlock(App.board, C.other(t.p), s) || C.chooseMove(App.board, C.other(t.p), 2);
            App.extPlace(reply[0], reply[1]);
            busyDelay(step, 350);
          }, 450);
        }, 450);
      };
      step();
    }

    function renderBar() {
      const bar = $('ext-bar');
      if (!t) { bar.innerHTML = ''; return; }
      const btn = (act, icon, key, cls) => `<button type="button" data-act="${act}"${cls ? ` class="${cls}"` : ''}><svg class="ico" aria-hidden="true"><use href="#i-${icon}"/></svg><span>${esc(T(key))}</span></button>`;
      const parts = [];
      const nextKey = typeof t.nextLabel === 'function' ? t.nextLabel() : t.nextLabel || 'tr_next';
      if (t.status === 'play' && !t.noHelp) parts.push(btn('hint', 'bulb', 'tr_hint'));
      if (t.status === 'wrong' && !t.noHelp) parts.push(btn('reset', 'retry', 'an_retry', 'hl'));
      if (t.status !== 'solved' && !t.noHelp) parts.push(btn('solution', 'eye', 'tr_solution'));
      if (t.status === 'solved' && t.next) parts.push(btn('next', 'next', nextKey, 'hl'));
      if (t.status === 'wrong' && t.next && t.nextOnFail) parts.push(btn('next', 'next', nextKey));
      if (t.status === 'solved' && !t.next) parts.push(btn('reset', 'retry', 'an_retry'));
      parts.push(btn('exit', t.exitLabel === 'tr_back' ? 'back' : 'exit', t.exitLabel || 'tr_exit'));
      bar.innerHTML = parts.join('');
    }

    $('ext-bar').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b || !t) return;
      const act = b.dataset.act;
      if (act === 'hint') hint();
      else if (act === 'reset') reset();
      else if (act === 'solution') showSolution();
      else if (act === 'next') t.next();
      else if (act === 'exit') exit();
    });

    return {
      start: (o) => start({ ...o, left0: o.left, sol0: o.sol }),
      exit: () => { if (t) exit(); },
      refresh,
      get active() { return !!t; },
      refreshCard: () => renderCard(),
    };
  })();

  window.CaroTrainer = Trainer;
})();
