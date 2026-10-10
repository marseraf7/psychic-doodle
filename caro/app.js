/* Giao diện Cờ Caro: bàn cờ vô hạn vẽ bằng canvas, hỗ trợ chuột, cảm ứng, bàn phím. */
(function () {
  'use strict';
  const { Board, X, O, EMPTY, checkWin, other } = window.Caro;
  const Bots = window.CaroBots;
  const T = window.I18N.t;
  const sfx = (name) => window.CaroSound && window.CaroSound.play(name);
  const TIME_LIMITS = [0, 10, 20, 30];

  const STORE = 'caro.v1';
  const MIN_SIZE = 14, MAX_SIZE = 96;

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');

  // ------------------------------------------------------------ Trạng thái
  const state = {
    board: new Board(),
    turn: X,
    winner: null, // X | O | null
    winCells: null,
    mode: 'ai', // 'ai' | 'pvp'
    human: X,
    bot: 'ti', // nhân vật máy (bots.js); người mới bắt đầu với Tí
    confirm: matchMedia('(pointer: coarse)').matches,
    score: { 1: 0, 2: 0 },
    pending: null, // ô đang chờ xác nhận [x, y]
    hover: null,
    thinking: false,
    lastPlacedAt: 0,
    online: null, // { room, me, side } khi đang chơi online
    replay: null, // { data, idx, timer } khi đang xem lại một ván đã lưu
    timeLimit: 0, // giây mỗi nước khi chơi offline, 0 = không giới hạn
    allowUndo: true, // cho phép "Đi lại" khi chơi offline
    winReason: null, // 'time' khi thắng vì đối phương hết giờ
    clock: null, // { endsAt (performance.now), local } – đồng hồ lượt hiện tại
    ext: null, // bàn cờ đang do module khác điều khiển (giải đố, thử lại nước đi) – xem enterExt
    marks: null, // đánh dấu thêm trên bàn: [{ x, y, kind: 'badge' | 'ghost' | 'bad', color, text }]
  };
  const cam = { x: 0, y: 0, size: 36 };
  let W = 0, H = 0, dpr = 1;
  let colors = {};

  // ------------------------------------------------------------ Nhân vật máy: mở khoá dần
  const BOT_STORE = 'caro.bots';
  function unlockedCount() {
    try { return Math.max(Bots.START_UNLOCKED, Math.min(Bots.BOTS.length, JSON.parse(localStorage.getItem(BOT_STORE) || '{}').unlocked || 0)); } catch (e) { return Bots.START_UNLOCKED; }
  }
  const botIndex = (id) => Bots.BOTS.findIndex((b) => b.id === id);
  const botAllowed = (id) => botIndex(id) >= 0 && botIndex(id) < unlockedCount();
  const botName = (id) => T('bot_' + id);
  /** Thắng nhân vật thứ i thì mở khoá nhân vật i+1. Trả về id vừa mở (nếu có). */
  function unlockAfter(id) {
    const next = botIndex(id) + 1;
    if (next < unlockedCount() || next >= Bots.BOTS.length) return null;
    try { localStorage.setItem(BOT_STORE, JSON.stringify({ unlocked: next + 1 })); } catch (e) { /* riêng tư */ }
    return Bots.BOTS[next].id;
  }
  const toast = (msg, ms) => window.CaroOnline && window.CaroOnline.toast(msg, ms);

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!s) return;
      // Bản cũ lưu mức 1/2/3: chuyển sang nhân vật tương ứng và giữ quyền chơi nhân vật đó.
      if (!s.bot && Bots.FROM_LEVEL[s.level]) {
        s.bot = Bots.FROM_LEVEL[s.level];
        if (!botAllowed(s.bot)) try { localStorage.setItem(BOT_STORE, JSON.stringify({ unlocked: botIndex(s.bot) + 1 })); } catch (e) { /* riêng tư */ }
      }
      Object.assign(state, {
        mode: s.mode === 'pvp' ? 'pvp' : 'ai',
        human: s.human === O ? O : X,
        bot: botAllowed(s.bot) ? s.bot : 'ti',
        confirm: !!s.confirm,
        score: s.score || state.score,
        timeLimit: TIME_LIMITS.includes(s.timeLimit) ? s.timeLimit : 0,
        allowUndo: s.allowUndo !== false,
      });
      for (const [x, y] of s.moves || []) placeRaw(x, y);
      if (s.timeout && !state.winner) { state.winner = s.timeout; state.winReason = 'time'; }
      if (s.cam) Object.assign(cam, s.cam);
    } catch (e) { /* bỏ qua dữ liệu hỏng */ }
  }
  function save() {
    if (state.online || state.replay || state.ext) return; // ván online / xem lại / giải đố: không ghi đè ván cục bộ
    try {
      localStorage.setItem(STORE, JSON.stringify({
        mode: state.mode, human: state.human, bot: state.bot,
        confirm: state.confirm, score: state.score, timeLimit: state.timeLimit, allowUndo: state.allowUndo,
        moves: state.board.moves.map((m) => [m.x, m.y]),
        timeout: state.winReason === 'time' ? state.winner : null,
        cam: { x: cam.x, y: cam.y, size: cam.size },
      }));
    } catch (e) { /* chế độ riêng tư */ }
  }

  // ------------------------------------------------------------ Luật chơi
  function placeRaw(x, y) {
    const p = state.turn;
    state.board.play(x, y, p);
    const win = checkWin(state.board, x, y, p);
    if (win) { state.winner = p; state.winCells = win; state.winReason = null; }
    else state.turn = other(p);
    return win;
  }

  function play(x, y) {
    if (state.winner || state.board.get(x, y) !== EMPTY) return;
    state.pending = null;
    if (state.ext) { if (state.ext.canPlay) state.ext.onMove(x, y); return; }
    if (state.online) return playOnline(x, y);
    const mover = state.turn;
    const win = placeRaw(x, y);
    state.lastPlacedAt = performance.now();
    sfx(mover === X ? 'placeX' : 'placeO');
    if (win) {
      state.score[state.winner]++;
      state.winAt = performance.now();
      vibrate(40);
      setTimeout(() => sfx(state.mode === 'ai' && state.winner !== state.human ? 'lose' : 'win'), 150);
      botGameOver();
      setTimeout(showBanner, 250);
    } else vibrate(8);
    save();
    updateUI();
    requestDraw();
    ensureVisible(x, y);
    maybeAI();
    resetClock();
  }

  const isAITurn = () => !state.online && !state.replay && !state.ext && state.mode === 'ai' && !state.winner && state.turn !== state.human;

  /** Hết ván với máy: người thắng thì mở khoá nhân vật kế tiếp. */
  function botGameOver() {
    if (state.mode !== 'ai' || state.winner !== state.human) return;
    const id = unlockAfter(state.bot);
    if (id) setTimeout(() => toast(T('bot_unlocked', { name: botName(id) }), 4500), 900);
  }

  // AI chạy trong Web Worker để bàn cờ và đồng hồ không bị khựng khi máy suy nghĩ lâu (mức Khó).
  // Trình duyệt không hỗ trợ (vd. mở file trực tiếp) thì tính ngay trên luồng chính.
  let aiWorker = null, aiSeq = 0;
  try { if (window.Worker && location.protocol.startsWith('http')) aiWorker = new Worker('ai-worker.js'); } catch (e) { aiWorker = null; }

  function askAI(p, bot) {
    const moves = state.board.moves.map((m) => [m.x, m.y, m.p]);
    if (!aiWorker) return new Promise((resolve) => setTimeout(() => resolve(Bots.botMove(state.board, p, bot)), 30));
    const id = ++aiSeq;
    return new Promise((resolve) => {
      const onMsg = (e) => {
        if (e.data.id !== id) return;
        aiWorker.removeEventListener('message', onMsg);
        resolve(e.data.move);
      };
      aiWorker.addEventListener('message', onMsg);
      aiWorker.postMessage({ id, moves, p, bot });
    });
  }

  function maybeAI() {
    if (!isAITurn() || state.thinking) return;
    state.thinking = true;
    updateUI();
    const started = performance.now();
    const board = state.board, count = board.moves.length;
    askAI(state.turn, state.bot).then(([x, y]) => {
      const wait = Math.max(0, 250 - (performance.now() - started));
      setTimeout(() => {
        // Trong lúc máy nghĩ mà người chơi đã đi lại / ván mới thì bỏ kết quả cũ.
        if (state.board !== board || board.moves.length !== count) return;
        state.thinking = false;
        if (isAITurn()) play(x, y);
        else updateUI();
      }, wait);
    });
  }

  function undo() {
    if (state.thinking || state.online || state.replay || state.ext || !state.allowUndo) return;
    const b = state.board;
    if (state.winReason === 'time') {
      // Thua vì hết giờ: "Đi lại" chỉ huỷ kết quả, cho đánh tiếp lượt đó.
      state.score[state.winner] = Math.max(0, state.score[state.winner] - 1);
      state.winner = null;
      state.winReason = null;
      hideBanner();
      save();
      updateUI();
      resetClock();
      return;
    }
    if (!b.moves.length) return;
    if (state.winner) state.score[state.winner] = Math.max(0, state.score[state.winner] - 1);
    const undoOne = () => {
      const m = b.undo();
      if (m) state.turn = m.p;
    };
    undoOne();
    if (state.mode === 'ai') while (b.moves.length && state.turn !== state.human) undoOne();
    state.winner = null;
    state.winCells = null;
    state.pending = null;
    hideBanner();
    save();
    updateUI();
    requestDraw();
    maybeAI();
    resetClock();
  }

  function newGame() {
    if (state.online || state.replay || state.ext) return;
    state.board = new Board();
    state.turn = X;
    state.winner = null;
    state.winReason = null;
    state.winCells = null;
    state.pending = null;
    state.thinking = false;
    hideBanner();
    animateCamera(0, 0, Math.max(cam.size, 32));
    save();
    updateUI();
    requestDraw();
    maybeAI();
    resetClock();
    if (state.mode === 'ai') toast(`${botName(state.bot)}: ${T('bot_' + state.bot + '_hi')}`, 3500);
  }

  // ------------------------------------------------------------ Đồng hồ mỗi nước
  // Offline: đếm trên máy, tạm dừng khi mở hộp thoại hoặc chuyển sang app khác.
  // Online: máy chủ quyết định hết giờ, ở đây chỉ hiển thị thời gian còn lại.
  let clockLast = performance.now();
  const clockPaused = () => document.hidden || !!document.querySelector('dialog[open]');

  function resetClock() {
    if (state.online || state.replay || state.ext) return;
    const needs = state.timeLimit && !state.winner && !state.thinking && !isAITurn();
    state.clock = needs ? { endsAt: performance.now() + state.timeLimit * 1000, local: true } : null;
    renderClock();
  }

  function renderClock() {
    const el = $('clock');
    const c = state.clock;
    if (!c || state.winner) { el.hidden = true; return; }
    const left = Math.max(0, Math.ceil((c.endsAt - performance.now()) / 1000));
    el.hidden = false;
    $('clock-n').textContent = left;
    el.classList.toggle('low', left <= 5);
    const mine = c.local || (state.online && state.online.room.turn === state.online.side);
    if (left <= 5 && left > 0 && left !== c.lastTick && mine) sfx('tick');
    c.lastTick = left;
  }

  function tickClock() {
    const now = performance.now();
    const dt = now - clockLast;
    clockLast = now;
    const c = state.clock;
    if (c && c.local) {
      if (clockPaused()) c.endsAt += dt;
      else if (!state.winner && now >= c.endsAt) return timeUp();
    }
    renderClock();
  }
  setInterval(tickClock, 200);

  /** Hết giờ khi chơi offline: người đang tới lượt thua. */
  function timeUp() {
    state.clock = null;
    state.winner = other(state.turn);
    state.winReason = 'time';
    state.winCells = null;
    state.pending = null;
    state.score[state.winner]++;
    vibrate(60);
    sfx(state.mode === 'ai' && state.winner !== state.human ? 'lose' : 'win');
    botGameOver();
    save();
    updateUI();
    renderClock();
    requestDraw();
    setTimeout(showBanner, 200);
  }

  // ------------------------------------------------------------ Online
  const net = () => window.CaroOnline;

  // Người chơi có được đánh lúc này không.
  function canPlaceNow() {
    if (state.ext) return !state.winner && !!state.ext.canPlay;
    if (state.winner || state.thinking || state.replay) return false;
    if (!state.online) return !isAITurn();
    const { room, side } = state.online;
    return room.players.length === 2 && !room.seriesWinner && room.turn === side;
  }

  function playOnline(x, y) {
    if (!canPlaceNow()) return;
    // Hiện ngay nước đi (máy chủ sẽ xác nhận lại).
    sfx(state.turn === X ? 'placeX' : 'placeO');
    placeRaw(x, y);
    state.optimistic = [x, y];
    state.lastPlacedAt = performance.now();
    vibrate(8);
    updateUI();
    requestDraw();
    ensureVisible(x, y);
    net().send({ t: 'move', x, y });
  }

  /** Dựng lại bàn cờ theo trạng thái phòng từ máy chủ. */
  function applyRoom(room, me) {
    const prev = state.online && state.online.room;
    const isNewGame = !prev || prev.gameNo !== room.gameNo || room.moves.length < prev.moves.length;
    const b = new Board();
    room.moves.forEach(([x, y], i) => b.play(x, y, i % 2 === 0 ? X : O));
    const side = room.seats.x === me ? X : room.seats.o === me ? O : 0;
    state.board = b;
    state.turn = room.turn;
    state.winner = room.winner;
    state.winCells = room.winCells;
    state.pending = null;
    state.thinking = false;
    state.online = { room, me, side };
    state.clock = room.turnLeft != null && !room.winner ? { endsAt: performance.now() + room.turnLeft, local: false } : null;
    renderClock();
    const last = b.moves[b.moves.length - 1];
    const grew = prev && !isNewGame && room.moves.length > prev.moves.length;
    if (isNewGame && prev) animateCamera(0, 0, Math.max(cam.size, 32));
    if (last && grew) {
      const mine = state.optimistic && state.optimistic[0] === last.x && state.optimistic[1] === last.y;
      if (!mine) {
        state.lastPlacedAt = performance.now();
        ensureVisible(last.x, last.y);
        vibrate(15);
        sfx(last.p === X ? 'placeX' : 'placeO');
      }
    }
    state.optimistic = null;
    if (room.winner && (!prev || !prev.winner || isNewGame)) {
      state.winAt = performance.now();
      vibrate(40);
      setTimeout(() => sfx(room.winner === 3 ? 'draw' : room.winner === side ? 'win' : 'lose'), 150);
      setTimeout(showBanner, 300);
    }
    if (!room.winner) hideBanner();
    updateUI();
    requestDraw();
  }

  function enterOnline(room, me) {
    if (state.replay) closeReplay(true);
    if (!state.online) {
      save();
      document.body.classList.add('online');
      hideBanner();
      animateCamera(0, 0, Math.max(cam.size, 32));
    }
    applyRoom(room, me);
  }

  function leaveOnline() {
    if (!state.online) return;
    state.online = null;
    document.body.classList.remove('online');
    restoreLocal();
  }

  /** Quay lại ván chơi trên máy (sau khi rời phòng online hoặc thoát xem lại). */
  function restoreLocal() {
    state.board = new Board();
    state.turn = X;
    state.winner = null;
    state.winReason = null;
    state.winCells = null;
    state.pending = null;
    state.clock = null;
    hideBanner();
    load();
    updateUI();
    requestDraw();
    maybeAI();
    resetClock();
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function updateOnlineUI() {
    const { room, me, side } = state.online;
    const opp = room.players.find((p) => p.id !== me);
    const t = $('turn');
    if (!opp) {
      t.innerHTML = `${esc(T('waiting_opp'))} <span class="thinking">${esc(T('room_code', { code: room.code }))}</span>`;
    } else if (room.winner === 3) {
      t.innerHTML = `🤝 ${esc(T('draw_short'))}`;
    } else if (room.winner) {
      t.innerHTML = room.winner === side ? `${glyph(side)} ${esc(T('you_won_short'))}` : `${glyph(room.winner)} ${esc(T('you_lost_short'))}`;
    } else if (room.turn === side) {
      t.innerHTML = `${esc(T('your_turn'))} ${glyph(side)}`;
    } else {
      t.innerHTML = esc(T('turn_of', { name: '\u0000' })).replace('\u0000', `<span class="name" title="${esc(opp.name)}">${esc(opp.name)}</span>`) +
        ` ${glyph(room.turn)}` + (opp.online ? '' : ` <span class="thinking">${esc(T('disconnected'))}</span>`);
    }
    const oppScore = opp ? room.score[opp.id] || 0 : 0;
    $('score').innerHTML = `${esc(T('you'))} ${room.score[me] || 0} : ${oppScore} <span class="name" title="${esc(opp ? opp.name : '')}">${esc(opp ? opp.name : '?')}</span>` +
      (room.kind === 'series' ? ` · Bo${room.bestOf}` : '');
  }

  // ------------------------------------------------------------ Giao diện
  const glyph = (p) => (p === X ? '<b class="dot x">X</b>' : '<b class="dot o">O</b>');

  function updateUI() {
    const t = $('turn');
    if (state.online) return updateOnlineUI();
    if (state.ext) {
      const r = state.ext.render();
      t.innerHTML = r.turn;
      $('score').innerHTML = r.score || '';
      return;
    }
    if (state.replay) return updateReplayUI();
    if (state.winner) {
      t.innerHTML = T('p_wins', { p: glyph(state.winner) });
    } else {
      let who = '';
      if (state.mode === 'ai') who = ' ' + (state.turn === state.human ? esc(T('you_tag')) : `<span class="bot-tag">(${esc(botName(state.bot))})</span>`);
      t.innerHTML = T('turn', { p: glyph(state.turn) }) + who +
        (state.thinking ? ` <span class="thinking">${esc(T('thinking'))}</span>` : '');
    }
    $('score').innerHTML = `<span class="x">X</span> ${state.score[X]} : ${state.score[O]} <span class="o">O</span>`;
    $('btn-undo').hidden = !state.allowUndo;
    $('btn-undo').disabled = !state.board.moves.length || state.thinking;
  }

  // ------------------------------------------------------------ Xem lại ván đã lưu
  /** data: { share, x, o, winner, reason, moves: [[x, y], ...] } (từ máy chủ). */
  function openReplay(data) {
    if (state.online) return false;
    if (!state.replay) save();
    stopReplay();
    state.replay = { data, idx: 0, timer: 0 };
    state.thinking = false;
    state.pending = null;
    state.clock = null;
    renderClock();
    hideBanner();
    document.body.classList.add('replay');
    seekReplay(data.moves.length, true);
    // Khung nhìn vừa đủ toàn bộ quân cờ
    const xs = data.moves.map((m) => m[0]), ys = data.moves.map((m) => m[1]);
    if (xs.length) {
      const w = Math.max(...xs) - Math.min(...xs) + 4, h = Math.max(...ys) - Math.min(...ys) + 4;
      const size = Math.max(MIN_SIZE, Math.min(48, (W - 24) / w, (H - 160) / h));
      animateCamera((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, size);
    }
    return true;
  }

  function seekReplay(i, quiet) {
    const r = state.replay;
    if (!r) return;
    const moves = r.data.moves;
    i = Math.max(0, Math.min(moves.length, i));
    const forward = i === r.idx + 1;
    r.idx = i;
    const b = new Board();
    for (let k = 0; k < i; k++) b.play(moves[k][0], moves[k][1], k % 2 ? O : X);
    state.board = b;
    state.turn = i % 2 ? O : X;
    state.winner = null;
    state.winCells = null;
    const last = b.moves[b.moves.length - 1];
    if (i === moves.length && r.data.reason === 'win' && last) {
      state.winCells = checkWin(b, last.x, last.y, last.p);
      state.winAt = performance.now();
    }
    if (last && !quiet) {
      state.lastPlacedAt = forward ? performance.now() : 0;
      if (forward) { sfx(last.p === X ? 'placeX' : 'placeO'); ensureVisible(last.x, last.y); }
    }
    if (i === moves.length) stopReplay();
    updateUI();
    requestDraw();
    window.dispatchEvent(new CustomEvent('caro:seek', { detail: { idx: i } }));
  }

  function stopReplay() {
    const r = state.replay;
    if (r && r.timer) { clearInterval(r.timer); r.timer = 0; }
    renderReplayPlay();
  }

  function toggleReplayPlay() {
    const r = state.replay;
    if (!r) return;
    if (r.timer) return stopReplay();
    if (r.idx >= r.data.moves.length) seekReplay(0, true);
    r.timer = setInterval(() => seekReplay(r.idx + 1), 700);
    renderReplayPlay();
  }

  function renderReplayPlay() {
    const playing = !!(state.replay && state.replay.timer);
    $('rp-play-ico').firstElementChild.setAttribute('href', playing ? '#i-pause' : '#i-play');
    $('rp-play-label').textContent = T(playing ? 'rp_pause' : 'rp_play');
  }

  function closeReplay(silent) {
    if (!state.replay) return;
    if (state.ext) exitExt(true);
    stopReplay();
    state.replay = null;
    state.marks = null;
    document.body.classList.remove('replay');
    window.dispatchEvent(new CustomEvent('caro:replayclose'));
    if (silent) return; // sắp vào phòng online: không cần dựng lại ván cục bộ
    restoreLocal();
  }

  function updateReplayUI() {
    const { data, idx } = state.replay;
    const n = data.moves.length;
    const nm = (s) => s || T('deleted_player'); // người chơi đã xoá tài khoản
    const who = (p, name) => `${glyph(p)} <span class="name" title="${esc(nm(name))}">${esc(nm(name))}</span>`;
    $('turn').innerHTML = `${who(X, data.x)} <span class="thinking">–</span> ${who(O, data.o)}`;
    let result = '';
    if (idx === n) {
      result = data.winner === 3 ? T('draw_short') : T('replay_wins', { name: nm(data.winner === X ? data.x : data.o) });
      if (data.reason && !['win', 'draw'].includes(data.reason)) result += ' · ' + T('end_' + data.reason);
    }
    $('score').innerHTML = `${idx}/${n}` + (result ? ` · ${esc(result)}` : '');
    $('rp-first').disabled = $('rp-prev').disabled = idx === 0;
    $('rp-next').disabled = idx === n;
    $('rp-share').hidden = !data.share;
    renderReplayPlay();
  }

  $('rp-first').onclick = () => { stopReplay(); seekReplay(0, true); };
  $('rp-prev').onclick = () => { stopReplay(); seekReplay(state.replay.idx - 1, true); };
  $('rp-next').onclick = () => { stopReplay(); seekReplay(state.replay.idx + 1); };
  $('rp-play').onclick = toggleReplayPlay;
  $('rp-close').onclick = () => closeReplay();
  $('rp-share').onclick = () => net() && net().shareReplay(state.replay.data);

  function showBanner() {
    if (!state.winner) return;
    if (state.online) return net().showBanner();
    const name = (p) => (p === X ? 'X' : 'O');
    let text, sub = '';
    if (state.mode === 'ai') {
      const won = state.winner === state.human;
      text = T(won ? 'you_win' : 'bot_wins', { name: botName(state.bot) });
      sub = `${botName(state.bot)}: “${T('bot_' + state.bot + (won ? '_lose' : '_win'))}”`;
    } else text = T('p_wins', { p: name(state.winner) });
    if (state.winReason === 'time') {
      const loser = other(state.winner);
      sub = state.mode === 'ai' && loser === state.human ? T('you_timeout') : T('p_timeout', { p: name(loser) });
      $('banner-analyze').hidden = true;
    }
    if (state.winReason !== 'time') $('banner-analyze').hidden = state.board.moves.length < 6;
    $('banner-title').textContent = text;
    $('banner-sub').textContent = sub;
    $('banner').hidden = false;
  }
  function hideBanner() { $('banner').hidden = true; }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* không hỗ trợ */ }
  }

  // ------------------------------------------------------------ Vẽ
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['bg', 'grid', 'grid-strong', 'x', 'o', 'last', 'win', 'muted']) {
      colors[k] = cs.getPropertyValue('--' + k).trim();
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    requestDraw();
  }

  const toScreen = (wx, wy) => [(wx - cam.x) * cam.size + W / 2, (wy - cam.y) * cam.size + H / 2];
  const toCell = (sx, sy) => [
    Math.round((sx - W / 2) / cam.size + cam.x),
    Math.round((sy - H / 2) / cam.size + cam.y),
  ];

  let drawQueued = false;
  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(draw);
  }

  function drawStone(p, sx, sy, s, alpha) {
    const r = s * 0.32;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.lineCap = 'round';
    if (p === X) {
      ctx.strokeStyle = colors.x;
      ctx.beginPath();
      ctx.moveTo(sx - r, sy - r); ctx.lineTo(sx + r, sy + r);
      ctx.moveTo(sx + r, sy - r); ctx.lineTo(sx - r, sy + r);
      ctx.stroke();
    } else {
      ctx.strokeStyle = colors.o;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 1.05, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawQueued = false;
    const now = performance.now();
    let again = false;
    const s = cam.size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    // Lưới: đường kẻ nằm giữa các ô (toạ độ nửa nguyên).
    const x0 = Math.floor(cam.x - W / 2 / s) - 1, x1 = Math.ceil(cam.x + W / 2 / s) + 1;
    const y0 = Math.floor(cam.y - H / 2 / s) - 1, y1 = Math.ceil(cam.y + H / 2 / s) + 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    for (let i = x0; i <= x1; i++) {
      const sx = Math.round(toScreen(i + 0.5, 0)[0]) + 0.5;
      ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
    }
    for (let j = y0; j <= y1; j++) {
      const sy = Math.round(toScreen(0, j + 0.5)[1]) + 0.5;
      ctx.moveTo(0, sy); ctx.lineTo(W, sy);
    }
    ctx.stroke();

    // Đánh dấu gốc toạ độ để dễ định hướng.
    const [ox, oy] = toScreen(0, 0);
    ctx.fillStyle = colors['grid-strong'];
    ctx.beginPath();
    ctx.arc(ox, oy, Math.max(1.5, s * 0.05), 0, Math.PI * 2);
    ctx.fill();

    const moves = state.board.moves;
    const last = moves[moves.length - 1];
    if (last) {
      const [sx, sy] = toScreen(last.x - 0.5, last.y - 0.5);
      ctx.fillStyle = colors.last;
      ctx.fillRect(sx + 1, sy + 1, s - 1, s - 1);
      // Chấm nhỏ màu của người vừa đánh ở góc ô
      ctx.fillStyle = last.p === X ? colors.x : colors.o;
      ctx.beginPath();
      ctx.arc(sx + s - s * 0.14, sy + s * 0.14, Math.max(2, s * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }

    // Quân cờ (chỉ vẽ các quân trong khung nhìn).
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) continue;
      const [sx, sy] = toScreen(m.x, m.y);
      let scale = 1;
      if (m === last) {
        const t = Math.min(1, (now - state.lastPlacedAt) / 160);
        if (t < 1) again = true;
        scale = 0.5 + 0.5 * (1 - Math.pow(1 - t, 3));
      }
      drawStone(m.p, sx, sy, s * scale, 1);
    }

    if (state.marks) drawMarks(s, x0, x1, y0, y1);

    // Quân mờ: chờ xác nhận hoặc rê chuột.
    const ghost = state.pending || state.hover;
    if (ghost && canPlaceNow() && state.board.get(ghost[0], ghost[1]) === EMPTY) {
      const [sx, sy] = toScreen(ghost[0], ghost[1]);
      if (state.pending) {
        ctx.strokeStyle = state.turn === X ? colors.x : colors.o;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(sx - s / 2 + 2, sy - s / 2 + 2, s - 4, s - 4);
        ctx.setLineDash([]);
      }
      drawStone(state.turn, sx, sy, s, state.pending ? 0.55 : 0.3);
    }

    // Đường thắng.
    if (state.winCells) {
      const a = state.winCells[0], b = state.winCells[state.winCells.length - 1];
      const [ax, ay] = toScreen(a[0], a[1]);
      const [bx, by] = toScreen(b[0], b[1]);
      // Vẽ dần từ đầu tới cuối trong ~0,45 giây
      const t = Math.min(1, (now - (state.winAt || 0)) / 450);
      if (t < 1) again = true;
      const e = 1 - Math.pow(1 - t, 3);
      ctx.strokeStyle = colors.win;
      ctx.lineWidth = Math.max(3, s * 0.12);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(ax + (bx - ax) * e, ay + (by - ay) * e);
      ctx.stroke();
    }

    if (camAnim || inertia) again = true;
    if (again) requestDraw();
    stepAnimations(now);
  }

  /** Đánh dấu của phân tích / giải đố: huy hiệu loại nước, nước gợi ý (vòng nét đứt), nước sai. */
  function drawMarks(s, x0, x1, y0, y1) {
    for (const m of state.marks) {
      if (m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) continue;
      const [sx, sy] = toScreen(m.x, m.y);
      if (m.kind === 'ghost') {
        ctx.strokeStyle = m.color;
        ctx.lineWidth = Math.max(2, s * 0.08);
        ctx.setLineDash([Math.max(3, s * 0.12), Math.max(3, s * 0.1)]);
        ctx.beginPath();
        ctx.arc(sx, sy, s * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (m.p) drawStone(m.p, sx, sy, s, 0.35);
      } else if (m.kind === 'bad') {
        ctx.fillStyle = m.color;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(sx - s / 2 + 1, sy - s / 2 + 1, s - 1, s - 1);
        ctx.globalAlpha = 1;
      }
      if (m.text) {
        // Huy hiệu tròn ở góc trên bên phải ô
        const r = Math.max(7, s * 0.2);
        const bx = sx + s * 0.38, by = sy - s * 0.38;
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = colors.bg;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(r * (m.text.length > 1 ? 1.05 : 1.3))}px ${getComputedStyle(document.body).fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.text, bx, by + 0.5);
      }
    }
  }

  // ------------------------------------------------------------ Camera
  let camAnim = null;
  function animateCamera(x, y, size) {
    camAnim = { from: { ...cam }, to: { x, y, size: size || cam.size }, t0: performance.now(), dur: 320 };
    requestDraw();
  }
  let inertia = null;

  function stepAnimations(now) {
    if (camAnim) {
      const t = Math.min(1, (now - camAnim.t0) / camAnim.dur);
      const e = 1 - Math.pow(1 - t, 3);
      const { from, to } = camAnim;
      cam.x = from.x + (to.x - from.x) * e;
      cam.y = from.y + (to.y - from.y) * e;
      cam.size = from.size + (to.size - from.size) * e;
      if (t >= 1) { camAnim = null; saveSoon(); }
    }
    if (inertia) {
      const dt = Math.min(40, now - inertia.t);
      inertia.t = now;
      cam.x -= (inertia.vx * dt) / cam.size;
      cam.y -= (inertia.vy * dt) / cam.size;
      const k = Math.pow(0.994, dt);
      inertia.vx *= k;
      inertia.vy *= k;
      if (Math.hypot(inertia.vx, inertia.vy) < 0.02) { inertia = null; saveSoon(); }
    }
  }

  function ensureVisible(x, y) {
    const [sx, sy] = toScreen(x, y);
    const m = cam.size * 1.5;
    const top = 70, bottom = 90;
    if (sx < m || sx > W - m || sy < top + m || sy > H - bottom - m) {
      animateCamera(x, y - (top - bottom) / 2 / cam.size);
    }
  }

  function centerView() {
    const moves = state.board.moves;
    if (!moves.length) return animateCamera(0, 0, 36);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const m of moves) {
      minX = Math.min(minX, m.x); maxX = Math.max(maxX, m.x);
      minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y);
    }
    const w = maxX - minX + 5, h = maxY - minY + 5;
    const size = clamp(Math.min(W / w, (H - 160) / h), MIN_SIZE, 48);
    animateCamera((minX + maxX) / 2, (minY + maxY) / 2, size);
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function zoomAt(sx, sy, newSize) {
    newSize = clamp(newSize, MIN_SIZE, MAX_SIZE);
    const wx = (sx - W / 2) / cam.size + cam.x;
    const wy = (sy - H / 2) / cam.size + cam.y;
    cam.size = newSize;
    cam.x = wx - (sx - W / 2) / newSize;
    cam.y = wy - (sy - H / 2) / newSize;
    requestDraw();
    saveSoon();
  }

  let saveTimer = 0;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  // ------------------------------------------------------------ Nhập liệu
  const pointers = new Map();
  let gesture = null;

  function tap(sx, sy) {
    if (state.winner) { if (!state.ext) showBanner(); return; }
    if (!canPlaceNow()) return;
    const [x, y] = toCell(sx, sy);
    if (state.board.get(x, y) !== EMPTY) return;
    if (state.confirm) {
      if (state.pending && state.pending[0] === x && state.pending[1] === y) play(x, y);
      else { state.pending = [x, y]; vibrate(5); requestDraw(); }
    } else play(x, y);
  }

  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    return {
      type: 'pinch',
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      size: cam.size,
      wx: (mx - W / 2) / cam.size + cam.x,
      wy: (my - H / 2) / cam.size + cam.y,
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    inertia = null;
    camAnim = null;
    if (pointers.size === 1) {
      gesture = { type: 'tap', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, vx: 0, vy: 0, mouse: e.pointerType === 'mouse', button: e.button };
    } else if (pointers.size === 2) {
      gesture = startPinch();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') {
        const c = toCell(e.clientX, e.clientY);
        if (!state.hover || state.hover[0] !== c[0] || state.hover[1] !== c[1]) { state.hover = c; requestDraw(); }
      }
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;

    if (gesture.type === 'tap') {
      const d = Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy);
      if (d > (gesture.mouse ? 5 : 10)) { gesture.type = 'pan'; canvas.classList.add('grabbing'); }
    }
    if (gesture.type === 'pan') {
      const dx = e.clientX - gesture.lx, dy = e.clientY - gesture.ly;
      const dt = Math.max(1, e.timeStamp - gesture.lt);
      cam.x -= dx / cam.size;
      cam.y -= dy / cam.size;
      gesture.vx = 0.7 * (dx / dt) + 0.3 * gesture.vx;
      gesture.vy = 0.7 * (dy / dt) + 0.3 * gesture.vy;
      gesture.lx = e.clientX; gesture.ly = e.clientY; gesture.lt = e.timeStamp;
      state.hover = null;
      requestDraw();
    } else if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.size = clamp(gesture.size * (d / gesture.dist), MIN_SIZE, MAX_SIZE);
      cam.x = gesture.wx - (mx - W / 2) / cam.size;
      cam.y = gesture.wy - (my - H / 2) / cam.size;
      requestDraw();
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    canvas.classList.remove('grabbing');
    if (!gesture) return;
    if (gesture.type === 'tap' && pointers.size === 0) {
      if (e.type === 'pointerup' && (!gesture.mouse || gesture.button === 0)) tap(e.clientX, e.clientY);
      gesture = null;
    } else if (gesture.type === 'pan' && pointers.size === 0) {
      const idle = e.timeStamp - gesture.lt;
      if (idle < 60 && Math.hypot(gesture.vx, gesture.vy) > 0.15) {
        inertia = { vx: gesture.vx, vy: gesture.vy, t: performance.now() };
        requestDraw();
      }
      gesture = null;
      saveSoon();
    } else if (gesture.type === 'pinch') {
      if (pointers.size === 1) {
        // Nhấc 1 ngón: chuyển sang kéo bằng ngón còn lại (không đặt quân).
        const p = [...pointers.values()][0];
        gesture = { type: 'pan', lx: p.x, ly: p.y, lt: e.timeStamp, vx: 0, vy: 0 };
      } else if (pointers.size === 0) gesture = null;
      saveSoon();
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && state.hover) { state.hover = null; requestDraw(); }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camAnim = null;
    if (e.ctrlKey || e.deltaMode !== 0 || Math.abs(e.deltaY) >= 40 && e.deltaX === 0) {
      // Bánh xe chuột / chụm trên touchpad: phóng to thu nhỏ.
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015) * (e.deltaMode === 1 ? 30 : 1));
      zoomAt(e.clientX, e.clientY, cam.size * f);
    } else {
      // Vuốt 2 ngón trên touchpad: di chuyển.
      cam.x += e.deltaX / cam.size;
      cam.y += e.deltaY / cam.size;
      requestDraw();
      saveSoon();
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const step = 3;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (state.ext) {
      if (e.key === 'Escape') { e.preventDefault(); state.ext.onExit(); return; }
    } else if (state.replay) {
      // Xem lại: ← → từng nước, Home/End về đầu/cuối, Space phát/dừng, Esc thoát.
      const r = state.replay;
      const act = { ArrowLeft: () => seekReplay(r.idx - 1, true), ArrowRight: () => seekReplay(r.idx + 1),
        Home: () => seekReplay(0, true), End: () => seekReplay(r.data.moves.length, true), ' ': toggleReplayPlay, Escape: () => closeReplay() }[e.key];
      if (act) { e.preventDefault(); if (e.key !== ' ') stopReplay(); act(); return; }
    }
    switch (e.key) {
      case 'ArrowLeft': cam.x -= step; break;
      case 'ArrowRight': cam.x += step; break;
      case 'ArrowUp': cam.y -= step; break;
      case 'ArrowDown': cam.y += step; break;
      case '+': case '=': zoomAt(W / 2, H / 2, cam.size * 1.2); return;
      case '-': case '_': zoomAt(W / 2, H / 2, cam.size / 1.2); return;
      case 'c': case 'C': centerView(); return;
      case 'n': case 'N': if (!state.replay && !state.ext) openNewGame(); return;
      default: return;
    }
    requestDraw();
    saveSoon();
  });

  // ------------------------------------------------------------ Nút & cài đặt
  $('btn-new').onclick = () => openNewGame();

  // Bảng chọn nhanh khi bấm "Ván mới": chế độ, cầm quân, độ khó, thời gian – rồi bắt đầu ngay.
  const ngDlg = $('newgame');
  const ngForm = $('newgame-form');
  function openNewGame() {
    if (state.online) return;
    ngForm.mode.value = state.mode;
    ngForm.human.value = String(state.human);
    renderBotPicker();
    ngForm.timeLimit.value = String(state.timeLimit);
    ngForm.classList.toggle('pvp', state.mode === 'pvp');
    if (ngDlg.showModal) ngDlg.showModal(); else ngDlg.setAttribute('open', '');
  }
  ngForm.addEventListener('change', () => { ngForm.classList.toggle('pvp', ngForm.mode.value === 'pvp'); renderBotSay(); });
  ngForm.addEventListener('submit', () => {
    state.mode = ngForm.mode.value;
    state.human = Number(ngForm.human.value);
    if (botAllowed(ngForm.bot.value)) state.bot = ngForm.bot.value;
    state.timeLimit = Number(ngForm.timeLimit.value) || 0;
    newGame();
  });
  // Lưới chọn nhân vật: ảnh đại diện, tên, Elo ước tính; nhân vật chưa mở khoá thì mờ đi.
  const avatar = (b) => `<span class="bot-av" style="--c:${b.color}">${esc([...botName(b.id).split(' ').pop()][0])}</span>`;
  function renderBotPicker() {
    const n = unlockedCount();
    $('ng-bots').innerHTML = Bots.BOTS.map((b, i) => {
      const locked = i >= n;
      return `<label class="bot-card${locked ? ' locked' : ''}" title="${esc(locked ? T('bot_locked', { name: botName(Bots.BOTS[i - 1].id) }) : '')}">
        <input type="radio" name="bot" value="${b.id}"${locked ? ' disabled' : ''}${b.id === state.bot ? ' checked' : ''}>
        ${avatar(b)}<b>${esc(botName(b.id))}</b><small>${locked ? '<svg class="ico i-in" aria-hidden="true"><use href="#i-lock"/></svg>' : '~' + b.elo}</small></label>`;
    }).join('');
    renderBotSay();
  }
  function renderBotSay() {
    const id = ngForm.bot && ngForm.bot.value;
    const el = $('ng-bot-say');
    if (!id) { el.textContent = ''; return; }
    const b = Bots.get(id);
    el.innerHTML = `<b>${esc(botName(id))}</b> · ~${b.elo} Elo — ${esc(T('bot_' + id + '_desc'))}`;
  }
  function renderBotSelect() {
    const n = unlockedCount();
    form.bot.innerHTML = Bots.BOTS.map((b, i) => `<option value="${b.id}"${i >= n ? ' disabled' : ''}>${esc(botName(b.id))} (~${b.elo})${i >= n ? ' 🔒' : ''}</option>`).join('');
  }

  $('btn-undo').onclick = undo;
  $('btn-center').onclick = centerView;
  $('banner-new').onclick = newGame;
  $('banner-view').onclick = hideBanner;

  const dlg = $('settings');
  const form = $('settings-form');
  form.elements.lang.innerHTML = window.I18N.LANGS.map(([code, label]) => `<option value="${code}">${label}</option>`).join('');
  function fillForm() {
    form.mode.value = state.mode;
    form.human.value = String(state.human);
    renderBotSelect();
    form.bot.value = state.bot;
    form.timeLimit.value = String(state.timeLimit);
    form.allowUndo.value = state.allowUndo ? 'yes' : 'no';
    form.sound.value = window.CaroSound.enabled ? 'on' : 'off';
    form.theme.value = window.CaroTheme.get();
    form.elements.lang.value = window.I18N.lang;
    form.confirm.checked = state.confirm;
    form.classList.toggle('pvp', state.mode === 'pvp');
  }
  $('btn-settings').onclick = () => {
    fillForm();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  };
  form.addEventListener('change', () => {
    const prevMode = state.mode, prevHuman = state.human, prevTime = state.timeLimit;
    state.mode = form.mode.value;
    state.human = Number(form.human.value);
    if (botAllowed(form.bot.value)) state.bot = form.bot.value;
    state.timeLimit = Number(form.timeLimit.value) || 0;
    state.allowUndo = form.allowUndo.value !== 'no';
    window.CaroSound.enabled = form.sound.value !== 'off';
    state.confirm = form.confirm.checked;
    window.CaroTheme.set(form.theme.value);
    window.I18N.setLang(form.elements.lang.value);
    if (prevTime !== state.timeLimit) resetClock();
    state.pending = null;
    form.classList.toggle('pvp', state.mode === 'pvp');
    const changedSides = prevMode !== state.mode || prevHuman !== state.human;
    save();
    updateUI();
    requestDraw();
    if (changedSides && state.board.moves.length && !state.winner) newGame();
  });
  dlg.addEventListener('close', () => { updateUI(); maybeAI(); if (!state.clock) resetClock(); });
  $('reset-score').onclick = () => {
    state.score = { 1: 0, 2: 0 };
    save();
    updateUI();
  };

  // ------------------------------------------------------------ Bàn cờ do module khác điều khiển
  // (giải đố, "Thử lại" trong phân tích). ctrl: { moves, canPlay, onMove(x, y), onExit(), render() -> { turn, score } }
  function enterExt(ctrl) {
    if (state.online) return false;
    if (!state.replay && !state.ext) save();
    if (state.replay) stopReplay();
    state.ext = ctrl;
    state.thinking = false;
    state.pending = null;
    state.clock = null;
    renderClock();
    hideBanner();
    document.body.classList.add('ext');
    extSet(ctrl.moves || []);
    fitView(ctrl.moves || []);
    return true;
  }
  /** Dựng lại bàn cờ từ danh sách nước (X đi trước). */
  function extSet(moves) {
    const b = new Board();
    moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? O : X));
    state.board = b;
    state.turn = moves.length % 2 ? O : X;
    state.winner = null;
    state.winCells = null;
    state.pending = null;
    updateUI();
    requestDraw();
  }
  /** Đặt 1 quân cho bên tới lượt (có âm thanh, hiệu ứng). Trả về true nếu thắng. */
  function extPlace(x, y) {
    const p = state.turn;
    state.board.play(x, y, p);
    state.lastPlacedAt = performance.now();
    sfx(p === X ? 'placeX' : 'placeO');
    const win = checkWin(state.board, x, y, p);
    if (win) { state.winner = p; state.winCells = win; state.winAt = performance.now(); vibrate(40); }
    else { state.turn = other(p); vibrate(8); }
    updateUI();
    requestDraw();
    ensureVisible(x, y);
    return !!win;
  }
  function exitExt(silent) {
    if (!state.ext) return;
    state.ext = null;
    state.marks = null;
    document.body.classList.remove('ext');
    if (silent) return;
    if (state.replay) seekReplay(state.replay.idx, true);
    else restoreLocal();
  }
  function setMarks(marks) { state.marks = marks && marks.length ? marks : null; requestDraw(); }
  /** Khung nhìn vừa đủ các quân. */
  function fitView(moves) {
    if (!moves.length) return animateCamera(0, 0, 36);
    const xs = moves.map((m) => m[0]), ys = moves.map((m) => m[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 5, h = Math.max(...ys) - Math.min(...ys) + 5;
    const size = clamp(Math.min((W - 24) / w, (H - 220) / h), MIN_SIZE, 48);
    animateCamera((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2 + 40 / size, size);
  }

  /** Mở xem lại ván vừa chơi trên máy (để phân tích). */
  function replayLocal() {
    const moves = state.board.moves.map((m) => [m.x, m.y]);
    const nm = (p) => (state.mode === 'ai' ? (p === state.human ? T('you') : botName(state.bot)) : p === X ? 'X' : 'O');
    return openReplay({ local: true, x: nm(X), o: nm(O), winner: state.winner, reason: state.winReason === 'time' ? 'timeout' : 'win', moves });
  }
  $('banner-analyze').onclick = () => {
    if (state.online) return;
    if (replayLocal() && window.CaroStudy) window.CaroStudy.analyze();
  };

  window.CaroApp = {
    enterExt,
    exitExt,
    extSet,
    extPlace,
    setMarks,
    fitView,
    seek: (i) => { stopReplay(); seekReplay(i, true); },
    get board() { return state.board; },
    get turn() { return state.turn; },
    get ext() { return state.ext; },
    enterOnline,
    applyRoom: (room, me) => (state.online ? applyRoom(room, me) : enterOnline(room, me)),
    leaveOnline,
    resync: () => { if (state.online) applyRoom(state.online.room, state.online.me); },
    get online() { return state.online; },
    get replay() { return state.replay; },
    openReplay,
    closeReplay,
    hideBanner,
    esc,
  };

  // ------------------------------------------------------------ Khởi động
  window.CaroTheme.onChange(() => { readColors(); requestDraw(); });
  window.addEventListener('langchange', () => {
    updateUI();
    if (!$('banner').hidden) showBanner();
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  window.I18N.apply();
  readColors();
  load();
  resize();
  updateUI();
  if (state.winner) setTimeout(showBanner, 300);
  maybeAI();
  resetClock();

  // Chạy offline (chỉ khi được phục vụ qua http/https).
  // (Trong ứng dụng điện thoại các file đã nằm sẵn trong app, không cần service worker.)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.CaroNative) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
