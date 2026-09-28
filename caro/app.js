/* Giao diện Cờ Caro: bàn cờ vô hạn vẽ bằng canvas, hỗ trợ chuột, cảm ứng, bàn phím. */
(function () {
  'use strict';
  const { Board, X, O, EMPTY, checkWin, chooseMove, other } = window.Caro;

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
    level: 2,
    confirm: matchMedia('(pointer: coarse)').matches,
    score: { 1: 0, 2: 0 },
    pending: null, // ô đang chờ xác nhận [x, y]
    hover: null,
    thinking: false,
    lastPlacedAt: 0,
    online: null, // { room, me, side } khi đang chơi online
  };
  const cam = { x: 0, y: 0, size: 36 };
  let W = 0, H = 0, dpr = 1;
  let colors = {};

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!s) return;
      Object.assign(state, {
        mode: s.mode === 'pvp' ? 'pvp' : 'ai',
        human: s.human === O ? O : X,
        level: [1, 2, 3].includes(s.level) ? s.level : 2,
        confirm: !!s.confirm,
        score: s.score || state.score,
      });
      for (const [x, y] of s.moves || []) placeRaw(x, y);
      if (s.cam) Object.assign(cam, s.cam);
    } catch (e) { /* bỏ qua dữ liệu hỏng */ }
  }
  function save() {
    if (state.online) return; // ván online do máy chủ giữ, không ghi đè ván cục bộ
    try {
      localStorage.setItem(STORE, JSON.stringify({
        mode: state.mode, human: state.human, level: state.level,
        confirm: state.confirm, score: state.score,
        moves: state.board.moves.map((m) => [m.x, m.y]),
        cam: { x: cam.x, y: cam.y, size: cam.size },
      }));
    } catch (e) { /* chế độ riêng tư */ }
  }

  // ------------------------------------------------------------ Luật chơi
  function placeRaw(x, y) {
    const p = state.turn;
    state.board.play(x, y, p);
    const win = checkWin(state.board, x, y, p);
    if (win) { state.winner = p; state.winCells = win; }
    else state.turn = other(p);
    return win;
  }

  function play(x, y) {
    if (state.winner || state.board.get(x, y) !== EMPTY) return;
    state.pending = null;
    if (state.online) return playOnline(x, y);
    const win = placeRaw(x, y);
    state.lastPlacedAt = performance.now();
    if (win) {
      state.score[state.winner]++;
      vibrate(40);
      setTimeout(showBanner, 250);
    } else vibrate(8);
    save();
    updateUI();
    requestDraw();
    ensureVisible(x, y);
    maybeAI();
  }

  const isAITurn = () => !state.online && state.mode === 'ai' && !state.winner && state.turn !== state.human;

  function maybeAI() {
    if (!isAITurn() || state.thinking) return;
    state.thinking = true;
    updateUI();
    const started = performance.now();
    // Để trình duyệt vẽ xong nước của người chơi trước khi máy tính toán.
    setTimeout(() => {
      const [x, y] = chooseMove(state.board, state.turn, state.level);
      const wait = Math.max(0, 250 - (performance.now() - started));
      setTimeout(() => {
        state.thinking = false;
        if (isAITurn()) play(x, y);
        else updateUI();
      }, wait);
    }, 30);
  }

  function undo() {
    if (state.thinking || state.online) return;
    const b = state.board;
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
  }

  function newGame() {
    if (state.online) return;
    state.board = new Board();
    state.turn = X;
    state.winner = null;
    state.winCells = null;
    state.pending = null;
    state.thinking = false;
    hideBanner();
    animateCamera(0, 0, Math.max(cam.size, 32));
    save();
    updateUI();
    requestDraw();
    maybeAI();
  }

  // ------------------------------------------------------------ Online
  const net = () => window.CaroOnline;

  // Người chơi có được đánh lúc này không.
  function canPlaceNow() {
    if (state.winner || state.thinking) return false;
    if (!state.online) return !isAITurn();
    const { room, side } = state.online;
    return room.players.length === 2 && !room.seriesWinner && room.turn === side;
  }

  function playOnline(x, y) {
    if (!canPlaceNow()) return;
    // Hiện ngay nước đi (máy chủ sẽ xác nhận lại).
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
    const last = b.moves[b.moves.length - 1];
    const grew = prev && !isNewGame && room.moves.length > prev.moves.length;
    if (isNewGame && prev) animateCamera(0, 0, Math.max(cam.size, 32));
    if (last && grew) {
      const mine = state.optimistic && state.optimistic[0] === last.x && state.optimistic[1] === last.y;
      if (!mine) {
        state.lastPlacedAt = performance.now();
        ensureVisible(last.x, last.y);
        vibrate(15);
      }
    }
    state.optimistic = null;
    if (room.winner && (!prev || !prev.winner || isNewGame)) {
      vibrate(40);
      setTimeout(showBanner, 300);
    }
    if (!room.winner) hideBanner();
    updateUI();
    requestDraw();
  }

  function enterOnline(room, me) {
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
    state.board = new Board();
    state.turn = X;
    state.winner = null;
    state.winCells = null;
    state.pending = null;
    hideBanner();
    load();
    updateUI();
    requestDraw();
    maybeAI();
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function updateOnlineUI() {
    const { room, me, side } = state.online;
    const opp = room.players.find((p) => p.id !== me);
    const t = $('turn');
    if (!opp) {
      t.innerHTML = `Chờ đối thủ… <span class="thinking">Phòng ${esc(room.code)}</span>`;
    } else if (room.winner) {
      t.innerHTML = room.winner === side ? `${glyph(side)} Bạn thắng!` : `${glyph(room.winner)} Bạn thua`;
    } else if (room.turn === side) {
      t.innerHTML = `Lượt bạn ${glyph(side)}`;
    } else {
      t.innerHTML = `Lượt <span class="name">${esc(opp.name)}</span> ${glyph(room.turn)}` +
        (opp.online ? '' : ' <span class="thinking">mất kết nối</span>');
    }
    const oppScore = opp ? room.score[opp.id] || 0 : 0;
    $('score').innerHTML = `Bạn ${room.score[me] || 0} : ${oppScore} <span class="name">${esc(opp ? opp.name : '?')}</span>` +
      (room.kind === 'series' ? ` · Bo${room.bestOf}` : '');
  }

  // ------------------------------------------------------------ Giao diện
  const glyph = (p) => (p === X ? '<b class="dot x">X</b>' : '<b class="dot o">O</b>');

  function updateUI() {
    const t = $('turn');
    if (state.online) return updateOnlineUI();
    if (state.winner) {
      t.innerHTML = `${glyph(state.winner)} thắng!`;
    } else {
      let who = '';
      if (state.mode === 'ai') who = state.turn === state.human ? ' (bạn)' : ' (máy)';
      t.innerHTML = `Lượt ${glyph(state.turn)}${who}` +
        (state.thinking ? ' <span class="thinking">đang nghĩ…</span>' : '');
    }
    $('score').innerHTML = `<span class="x">X</span> ${state.score[X]} : ${state.score[O]} <span class="o">O</span>`;
    $('btn-undo').disabled = !state.board.moves.length || state.thinking;
  }

  function showBanner() {
    if (!state.winner) return;
    if (state.online) return net().showBanner();
    let text;
    if (state.mode === 'ai') text = state.winner === state.human ? '🎉 Bạn thắng!' : 'Máy thắng rồi!';
    else text = `${state.winner === X ? 'X' : 'O'} thắng!`;
    $('banner-title').innerHTML = text;
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
      ctx.strokeStyle = colors.win;
      ctx.lineWidth = Math.max(3, s * 0.12);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      ctx.stroke();
    }

    if (camAnim || inertia) again = true;
    if (again) requestDraw();
    stepAnimations(now);
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
    if (state.winner) { showBanner(); return; }
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
    switch (e.key) {
      case 'ArrowLeft': cam.x -= step; break;
      case 'ArrowRight': cam.x += step; break;
      case 'ArrowUp': cam.y -= step; break;
      case 'ArrowDown': cam.y += step; break;
      case '+': case '=': zoomAt(W / 2, H / 2, cam.size * 1.2); return;
      case '-': case '_': zoomAt(W / 2, H / 2, cam.size / 1.2); return;
      case 'c': case 'C': centerView(); return;
      case 'n': case 'N': newGame(); return;
      default: return;
    }
    requestDraw();
    saveSoon();
  });

  // ------------------------------------------------------------ Nút & cài đặt
  $('btn-new').onclick = newGame;
  $('btn-undo').onclick = undo;
  $('btn-center').onclick = centerView;
  $('banner-new').onclick = newGame;
  $('banner-view').onclick = hideBanner;

  const dlg = $('settings');
  const form = $('settings-form');
  function fillForm() {
    form.mode.value = state.mode;
    form.human.value = String(state.human);
    form.level.value = String(state.level);
    form.confirm.checked = state.confirm;
    form.classList.toggle('pvp', state.mode === 'pvp');
  }
  $('btn-settings').onclick = () => {
    fillForm();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  };
  form.addEventListener('change', () => {
    const prevMode = state.mode, prevHuman = state.human;
    state.mode = form.mode.value;
    state.human = Number(form.human.value);
    state.level = Number(form.level.value);
    state.confirm = form.confirm.checked;
    state.pending = null;
    form.classList.toggle('pvp', state.mode === 'pvp');
    const changedSides = prevMode !== state.mode || prevHuman !== state.human;
    save();
    updateUI();
    requestDraw();
    if (changedSides && state.board.moves.length && !state.winner) newGame();
  });
  dlg.addEventListener('close', () => { updateUI(); maybeAI(); });
  $('reset-score').onclick = () => {
    state.score = { 1: 0, 2: 0 };
    save();
    updateUI();
  };

  window.CaroApp = {
    enterOnline,
    applyRoom: (room, me) => (state.online ? applyRoom(room, me) : enterOnline(room, me)),
    leaveOnline,
    resync: () => { if (state.online) applyRoom(state.online.room, state.online.me); },
    get online() { return state.online; },
    hideBanner,
    esc,
  };

  // ------------------------------------------------------------ Khởi động
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { readColors(); requestDraw(); });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  readColors();
  load();
  resize();
  updateUI();
  if (state.winner) setTimeout(showBanner, 300);
  maybeAI();

  // Chạy offline (chỉ khi được phục vụ qua http/https).
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
