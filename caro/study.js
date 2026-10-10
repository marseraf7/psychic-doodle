/*
 * Học cờ: phân tích ván (trong chế độ xem lại), "Thử lại" nước sai, và Giải đố (xếp hạng / chuỗi đúng / bài của ngày).
 * Bàn cờ được mượn từ app.js qua CaroApp.enterExt (chế độ "ext"); phần tính toán nằm ở analysis.js.
 */
(function () {
  'use strict';
  const App = window.CaroApp;
  const A = window.CaroAnalysis;
  const C = window.Caro;
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  const toast = (m, ms) => window.CaroOnline && window.CaroOnline.toast(m, ms);
  const glyph = (p) => (p === C.X ? '<b class="dot x">X</b>' : '<b class="dot o">O</b>');
  const ico = (id) => `<svg class="ico i-in" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  // Loại nước: màu + ký hiệu trên huy hiệu (giống chess.com: !! xuất sắc, ? sai lầm, ?? nước hỏng…)
  const CLS = {
    great: { color: '#1baca6', text: '!!' },
    best: { color: '#5c9e31', text: '!' },
    good: { color: '#8aa572', text: '' },
    miss: { color: '#e5664f', text: '×' },
    mistake: { color: '#e9a01d', text: '?' },
    blunder: { color: '#ca3431', text: '??' },
    lost: { color: '#8b8b8b', text: '' },
  };
  const ORDER = ['great', 'best', 'miss', 'mistake', 'blunder'];
  const GOOD = '#5c9e31';

  // ================================================================ Phân tích ván
  let worker = null;
  function getWorker() {
    if (worker || location.protocol === 'file:' || !window.Worker) return worker;
    try { worker = new Worker('ai-worker.js'); } catch (e) { worker = null; }
    return worker;
  }
  const cache = new Map(); // khoá: chuỗi nước đi -> kết quả
  const an = { result: null, running: false, collapsed: false, seq: 0 };

  function runAnalysis(moves, onProgress) {
    const w = getWorker();
    if (!w) {
      // Không có Web Worker: tính trên luồng chính (sau 1 khung hình để kịp vẽ thanh tiến trình).
      return new Promise((res) => setTimeout(() => res(A.analyzeGame(moves)), 30));
    }
    const id = 'an' + ++an.seq;
    return new Promise((res) => {
      const onMsg = (e) => {
        if (e.data.id !== id) return;
        if (e.data.progress != null) return onProgress(e.data.progress);
        w.removeEventListener('message', onMsg);
        res(e.data.result);
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ id, type: 'analyze', moves });
    });
  }

  async function analyze() {
    const r = App.replay;
    if (!r) return;
    const moves = r.data.moves;
    const panel = $('an-panel');
    panel.hidden = false;
    an.collapsed = false;
    panel.classList.remove('collapsed');
    document.body.classList.add('analysis');
    const key = JSON.stringify(moves);
    if (cache.has(key)) { an.result = cache.get(key); renderPanel(); return; }
    if (an.running) return;
    an.running = true;
    an.result = null;
    renderProgress(0);
    const res = await runAnalysis(moves, renderProgress);
    an.running = false;
    cache.set(key, res);
    // Người dùng đã đóng xem lại / mở ván khác trong lúc chờ
    if (!App.replay || App.replay.data.moves !== moves) return;
    an.result = res;
    renderPanel();
  }

  function renderProgress(f) {
    $('an-acc-mini').textContent = '';
    $('an-body').innerHTML = `<div class="an-prog"><i style="width:${Math.round(f * 100)}%"></i></div>
      <p class="muted">${esc(T('an_running', { p: Math.round(f * 100) }))}</p>`;
  }

  const nameOf = (p) => {
    const d = App.replay && App.replay.data;
    const n = d && (p === C.X ? d.x : d.o);
    return n || T('deleted_player');
  };

  function renderPanel() {
    const res = an.result;
    if (!res || !App.replay) return;
    const chips = (p) => ORDER.filter((c) => res.counts[p][c])
      .map((c) => `<span class="an-chip" style="--c:${CLS[c].color}" title="${esc(T('cls_' + c))}"><i>${CLS[c].text || '•'}</i>${res.counts[p][c]}</span>`).join('');
    const player = (p) => `<div class="an-player">${glyph(p)}<span class="name">${esc(nameOf(p))}</span>
      <b class="an-acc" title="${esc(T('an_acc'))}">${res.acc[p]}%</b><span class="an-chips">${chips(p)}</span></div>`;
    const idx = App.replay.idx;
    const timeline = res.moves.map((m, i) => `<button type="button" class="an-tl${i === idx - 1 ? ' cur' : ''}" data-i="${i + 1}" style="--c:${CLS[m.cls].color}" title="${esc(T('an_move', { n: i + 1 }) + ' · ' + T('cls_' + m.cls))}"></button>`).join('');
    const keys = A.keyMoments(res);
    const keyList = keys.length
      ? keys.map((m) => `<li><span class="an-badge" style="--c:${CLS[m.cls].color}">${CLS[m.cls].text}</span>
          <span>${esc(T('an_move', { n: m.i + 1 }))} ${glyph(m.p)} ${esc(T('cls_' + m.cls))}</span>
          <button type="button" class="link" data-view="${m.i + 1}">${esc(T('an_view'))}</button>
          ${m.cls !== 'great' ? `<button type="button" class="link" data-retry="${m.i}">${esc(T('an_retry'))}</button>` : ''}</li>`).join('')
      : `<li class="muted">${esc(T('an_none'))}</li>`;
    $('an-acc-mini').innerHTML = `<span class="x">${res.acc[C.X]}%</span> · <span class="o">${res.acc[C.O]}%</span>`;
    $('an-body').innerHTML = `<div class="an-players">${player(C.X)}${player(C.O)}</div>
      <div class="an-timeline">${timeline}</div>
      <div class="an-now" id="an-now"></div>
      <details class="an-keys"${keys.length && keys.length <= 4 ? ' open' : ''}><summary>${esc(T('an_key'))} (${keys.length})</summary><ul>${keyList}</ul></details>`;
    renderNow();
  }

  /** Nhận xét cho nước vừa xem + đánh dấu trên bàn. */
  function renderNow() {
    const res = an.result;
    const r = App.replay;
    if (!res || !r || App.ext) return;
    const idx = r.idx;
    document.querySelectorAll('.an-tl').forEach((b) => b.classList.toggle('cur', +b.dataset.i === idx));
    const cur = document.querySelector('.an-tl.cur');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const m = res.moves[idx - 1];
    const el = $('an-now');
    if (!m) { App.setMarks(null); if (el) el.innerHTML = `<span class="muted">${esc(T('an_start'))}</span>`; return; }
    const meta = CLS[m.cls];
    const marks = [{ x: m.x, y: m.y, kind: 'badge', color: meta.color, text: meta.text || (m.cls === 'good' ? '' : '') }];
    if (m.best) marks.push({ x: m.best[0], y: m.best[1], kind: 'ghost', color: GOOD, p: m.p });
    App.setMarks(marks.filter((k) => k.text || k.kind === 'ghost'));
    if (!el) return;
    let text = T('ex_' + m.cls, { len: m.len });
    if (m.cls === 'miss' && m.len === 1) text = T('ex_miss1');
    if (m.best) text += ' ' + T('ex_bestmove');
    const canRetry = ['miss', 'mistake', 'blunder'].includes(m.cls);
    el.innerHTML = `<span class="an-badge" style="--c:${meta.color}">${meta.text || '•'}</span>
      <span><b>${esc(T('an_move', { n: idx }))} ${glyph(m.p)} ${esc(T('cls_' + m.cls))}</b> — ${esc(text)}</span>
      ${canRetry ? `<button type="button" class="primary sm" data-retry="${idx - 1}">${ico('retry')} ${esc(T('an_retry'))}</button>` : ''}`;
  }

  function closePanel() {
    $('an-panel').hidden = true;
    document.body.classList.remove('analysis');
    App.setMarks(null);
  }

  $('an-close').onclick = closePanel;
  $('an-toggle').onclick = () => {
    an.collapsed = !an.collapsed;
    $('an-panel').classList.toggle('collapsed', an.collapsed);
  };
  $('an-body').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.i) App.seek(+b.dataset.i);
    else if (b.dataset.view) App.seek(+b.dataset.view);
    else if (b.dataset.retry != null) retry(+b.dataset.retry);
  });
  $('rp-analyze').onclick = () => {
    if (!$('an-panel').hidden && !an.running) return closePanel();
    analyze();
  };
  window.addEventListener('caro:seek', renderNow);
  window.addEventListener('caro:replayclose', () => { closePanel(); an.result = null; });

  /** "Thử lại": đặt lại thế cờ trước nước i, cho người chơi tìm nước tốt hơn. */
  function retry(i) {
    const res = an.result;
    const r = App.replay;
    if (!res || !r) return;
    const m = res.moves[i];
    const moves = r.data.moves.slice(0, i);
    const backTo = r.idx;
    const goal = m.cls === 'miss' ? 'win' : 'save';
    Trainer.start({
      moves, p: m.p, goal, left: m.len || 0, sol: m.best,
      title: T('an_retry'),
      exitLabel: 'tr_back',
      onExit: () => { App.exitExt(); App.seek(backTo); },
    });
  }

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
      if (t.check) ok = t.check(board, x, y, p); // bài học: điều kiện riêng
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
        t.msg = T('tr_wrong');
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
      if (t.status === 'play') parts.push(btn('hint', 'bulb', 'tr_hint'));
      if (t.status === 'wrong') parts.push(btn('reset', 'retry', 'an_retry', 'hl'));
      if (t.status !== 'solved') parts.push(btn('solution', 'eye', 'tr_solution'));
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
      refresh,
      get active() { return !!t; },
      refreshCard: () => renderCard(),
    };
  })();

  // ================================================================ Giải đố
  const PZ_STORE = 'caro.puzzles';
  let puzzles = null;
  let pz = loadPz();
  let session = null; // { mode, streak, used:Set, current }

  function loadPz() {
    try {
      const s = JSON.parse(localStorage.getItem(PZ_STORE) || '{}');
      return { r: +s.r || 1000, n: +s.n || 0, ok: +s.ok || 0, best: +s.best || 0, daily: s.daily || null, recent: Array.isArray(s.recent) ? s.recent.slice(-40) : [] };
    } catch (e) { return { r: 1000, n: 0, ok: 0, best: 0, daily: null, recent: [] }; }
  }
  function savePz() { try { localStorage.setItem(PZ_STORE, JSON.stringify(pz)); } catch (e) { /* riêng tư */ } }

  async function loadPuzzles() {
    if (puzzles) return puzzles;
    const r = await fetch('puzzles.json');
    if (!r.ok) throw new Error('puzzles');
    puzzles = await r.json();
    return puzzles;
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function dailyPuzzle(list) {
    const pool = list.filter((q) => q.r >= 800 && q.r <= 1600);
    const src = pool.length ? pool : list;
    let h = 2166136261;
    for (const ch of today()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return src[h % src.length];
  }
  function pickNear(list, target, avoid) {
    const cand = list.filter((q) => !avoid.has(q.id));
    const src = cand.length ? cand : list;
    const sorted = src.slice().sort((a, b) => Math.abs(a.r - target) - Math.abs(b.r - target));
    const top = sorted.slice(0, 6);
    return top[Math.floor(Math.random() * top.length)];
  }

  function renderPzStats() {
    const dailyDone = pz.daily && pz.daily.d === today();
    $('pz-stats').innerHTML = `<div><b>${pz.r}</b><small>${esc(T('pz_rating'))}</small></div>
      <div><b>${pz.ok}/${pz.n}</b><small>${esc(T('pz_solved'))}</small></div>
      <div><b>${pz.best}</b><small>${esc(T('pz_best'))}</small></div>`;
    $('pz-daily-sub').textContent = dailyDone ? T(pz.daily.ok ? 'pz_daily_done' : 'pz_daily_tried') : T('pz_daily_d');
  }

  function openPuzzles() {
    if (App.online) return;
    renderPzStats();
    const d = $('puzzle-dlg');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    loadPuzzles().catch(() => {});
  }

  async function startMode(mode) {
    let list;
    try { list = await loadPuzzles(); } catch (e) { toast(T('pz_load_fail')); return; }
    const d = $('puzzle-dlg');
    if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); }
    session = { mode, streak: 0, used: new Set() };
    nextPuzzle(list);
  }

  function nextPuzzle(list) {
    list = list || puzzles;
    const s = session;
    let q;
    if (s.mode === 'daily') q = dailyPuzzle(list);
    else if (s.mode === 'streak') q = pickNear(list, 600 + s.streak * 70, s.used);
    else q = pickNear(list, pz.r, new Set([...pz.recent, ...s.used]));
    s.used.add(q.id);
    s.current = q;
    s.delta = null;
    const p = q.m.length % 2 ? C.O : C.X;
    Trainer.start({
      moves: q.m, p, goal: 'win', left: q.len, sol: q.sol, kind: 'puzzle',
      score: scoreLine,
      onFirst: (ok) => firstResult(q, ok),
      next: s.mode === 'daily' ? null : () => { if (s.over) { s.over = false; s.streak = 0; s.used = new Set(); } nextPuzzle(); },
      nextOnFail: s.mode !== 'daily',
      nextLabel: () => (s.over ? 'pz_streak_again' : 'tr_next'),
    });
  }

  function scoreLine() {
    const s = session;
    if (!s) return '';
    const q = s.current;
    if (s.mode === 'streak') return `${ico('fire')} ${esc(T('pz_streak_n', { n: s.streak }))}`;
    if (s.mode === 'daily') return `${ico('cal')} ${esc(T('pz_daily'))}`;
    const d = s.delta;
    const delta = d == null ? '' : ` <span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</span>`;
    return `${ico('puzzle')} ${pz.r}${delta} <span class="thinking wide-only">#${q.id} · ${q.r}</span>`;
  }

  function firstResult(q, ok) {
    const s = session;
    if (!s) return;
    pz.n++;
    if (ok) pz.ok++;
    if (s.mode === 'rated') {
      const e = 1 / (1 + Math.pow(10, (q.r - pz.r) / 400));
      const k = pz.n <= 20 ? 40 : 20;
      const d = Math.round(k * ((ok ? 1 : 0) - e));
      pz.r = Math.max(100, pz.r + d);
      s.delta = d;
      pz.recent = [...pz.recent, q.id].slice(-40);
    } else if (s.mode === 'streak') {
      if (ok) {
        s.streak++;
        if (s.streak > pz.best) pz.best = s.streak;
      } else {
        s.over = true;
        const best = s.streak > 0 && s.streak === pz.best;
        toast(T('pz_streak_over', { n: s.streak }) + (best ? ' ' + T('pz_new_best') : ''), 4500);
      }
    } else if (s.mode === 'daily') {
      pz.daily = { d: today(), ok };
    }
    savePz();
    Trainer.refresh();
  }

  $('btn-puzzle').onclick = openPuzzles;
  document.querySelectorAll('.pz-mode').forEach((b) => { b.onclick = () => startMode(b.dataset.pz); });
  window.addEventListener('langchange', () => { if (an.result) renderPanel(); if (Trainer.active) Trainer.refresh(); });

  window.CaroStudy = { analyze, openPuzzles, startMode, Trainer, get puzzles() { return puzzles; } };
})();
