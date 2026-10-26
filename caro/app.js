/*
 * Giao diện Cờ Caro – điều phối: trạng thái ván, luật, máy đánh, đồng hồ, chơi online / xem ván, thanh trên, kết quả,
 * Ván mới / Cài đặt, bàn cờ cho module khác (enterExt), window.CaroApp. Phần bàn cờ ở file riêng (nạp trước file này):
 * board-view.js (vẽ canvas + camera), board-replay.js (xem lại ván), board-input.js (chuột, cảm ứng, bàn phím).
 * Phần ván: app-clock.js (đồng hồ), app-online.js (chơi / xem online), app-dialogs.js (Ván mới, Cài đặt),
 * app-ext.js (bàn cờ cho module khác, thông tin thẻ người chơi), app-ai.js (máy đánh, Worker, mở khoá nhân vật),
 * app-status.js (dòng lượt / tỉ số, báo tới lượt, thẻ kết quả ván).
 */
(function () {
  'use strict';
  const { Board, X, O, EMPTY, checkWin, other, forbidden, ruleOf } = window.Caro;
  const Bots = window.CaroBots;
  const T = window.I18N.t;
  const sfx = (name) => window.CaroSound && window.CaroSound.play(name);
  const TC = window.CaroTimeCtl; // các mức thời gian (timectl.js)
  const LC = window.CaroLocalClock; // đồng hồ tổng khi chơi trên máy (local-clock.js)

  const STORE = 'caro.v1';
  const MIN_SIZE = 14, MAX_SIZE = 96;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const glyph = (p) => (p === X ? '<b class="dot x">X</b>' : '<b class="dot o">O</b>');
  /** Nhãn nhỏ cho luật khác luật Việt Nam (cạnh tỉ số). */
  const ruleChip = (rule) => (rule && rule !== 'vn' ? `<span class="rule-chip" title="${esc(T('grule_' + rule))}">${esc(T('grule_s_' + rule))}</span> ` : '');
  const net = () => window.CaroOnline;
  const canvas = $('board');

  // ------------------------------------------------------------ Trạng thái
  const state = {
    board: new Board(),
    turn: X,
    winner: null, // X | O | null
    winCells: null,
    mode: 'ai', // 'ai' | 'pvp'
    rule: 'vn', // luật thắng: 'vn' | 'free' | 'std' | 'renju' (rules.js)
    human: X,
    bot: 'ti', // nhân vật máy (bots.js); người mới bắt đầu với Anh Độ
    confirm: matchMedia('(pointer: coarse)').matches,
    score: { 1: 0, 2: 0 },
    pending: null, // ô đang chờ xác nhận [x, y]
    hover: null,
    thinking: false,
    lastPlacedAt: 0,
    online: null, // { room, me, side } khi đang chơi online
    replay: null, // { data, idx, timer } khi đang xem lại một ván đã lưu
    timeLimit: 0, // giây mỗi nước khi chơi offline, 0 = không giới hạn
    clockSpec: null, // đồng hồ tổng khi chơi offline, vd. '5+3' (thay cho timeLimit)
    sidePick: '1', // lựa chọn bên trong hộp Thiết lập ván đấu: '1' X · '2' O · 'r' ngẫu nhiên
    allowUndo: true, // cho phép "Đi lại" khi chơi offline
    winReason: null, // 'time' khi thắng vì đối phương hết giờ
    clock: null, // { endsAt (performance.now), local } – đồng hồ lượt hiện tại
    ext: null, // bàn cờ đang do module khác điều khiển (giải đố, thử lại nước đi) – xem enterExt
    marks: null, // đánh dấu thêm trên bàn: [{ x, y, kind: 'badge' | 'ghost' | 'bad', color, text }]
  };
  const cam = { x: 0, y: 0, size: 36 };

  // Vẽ + camera (board-view.js): kích thước bàn cờ đọc qua V.W, V.H
  const V = window.CaroBoardView({ canvas, cam, state, canPlaceNow: () => canPlaceNow(), save, MIN_SIZE, MAX_SIZE }); // canPlaceNow: app-online.js
  const { readColors, resize, requestDraw, animateCamera, ensureVisible, centerView, clamp, colName } = V;

  // ------------------------------------------------------------ Nhân vật máy: mở khoá dần theo mức sức cờ
  // caro.bots.unlocked = số mức đã mở (bản cũ: số nhân vật đã mở – mỗi nhân vật cũ đúng một mức nên vẫn khớp).
  const BOT_STORE = 'caro.bots';
  const TIER_N = Bots.TIERS.length;
  function unlockedCount() {
    try { return Math.max(Bots.START_UNLOCKED, Math.min(TIER_N, JSON.parse(localStorage.getItem(BOT_STORE) || '{}').unlocked || 0)); } catch (e) { return Bots.START_UNLOCKED; }
  }
  /** Chỉ số mức (0…6, 6 = trùm cuối BOAT) của nhân vật, -1 nếu không có. */
  const botIndex = (id) => { const b = Bots.BOTS.find((o) => o.id === id); return b ? b.tier - 1 : -1; };
  const botAllowed = (id) => botIndex(id) >= 0 && botIndex(id) < unlockedCount();
  const botName = (id) => T('bot_' + id);
  /** Thắng một nhân vật ở mức i thì mở khoá cả mức i+1. Trả về mức vừa mở (bots.js TIERS – có elo, boss) nếu có. */
  function unlockAfter(id) {
    const next = botIndex(id) + 1;
    if (next < unlockedCount() || next >= TIER_N) return null;
    try { localStorage.setItem(BOT_STORE, JSON.stringify({ unlocked: next + 1 })); } catch (e) { /* riêng tư */ }
    return Bots.TIERS[next];
  }
  const toast = (msg, ms) => window.CaroOnline && window.CaroOnline.toast(msg, ms);
  /** Báo khung trang (shell.js): người chơi vào bàn cờ → ẩn các trang. */
  const toBoard = () => window.dispatchEvent(new Event('caro:board'));
  const shellOn = () => document.body.classList.contains('shell-on');

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
        timeLimit: TC.isTimeLimit(s.timeLimit) ? s.timeLimit : 0,
        clockSpec: TC.isClock(s.clockSpec) ? s.clockSpec : null,
        sidePick: ['1', '2', 'r'].includes(s.sidePick) ? s.sidePick : String(s.human === O ? O : X),
        allowUndo: s.allowUndo !== false,
        rule: ruleOf(s.rule),
      });
      state.board = new Board(state.rule);
      for (const [x, y] of s.moves || []) placeRaw(x, y);
      if (s.timeout && !state.winner) { state.winner = s.timeout; state.winReason = 'time'; }
      // Đồng hồ tổng: thời gian còn lại của 2 bên lúc lưu
      state.clocks = state.clockSpec && s.lclock && s.lclock.spec === state.clockSpec ? LC.create(state.clockSpec, performance.now(), s.lclock) : null;
      if (s.cam) Object.assign(cam, s.cam);
    } catch (e) { /* bỏ qua dữ liệu hỏng */ }
  }
  function save() {
    if (state.online) {
      // Ván online: không ghi đè ván cục bộ, chỉ nhớ mức phóng bàn cờ của chế độ online (Issue #141 mục 3)
      try { localStorage.setItem('caro.zoomOnline', String(cam.size)); } catch (e) { /* chế độ riêng tư */ }
      return;
    }
    if (state.replay || state.ext) return; // xem lại / giải đố: không ghi đè ván cục bộ
    try {
      localStorage.setItem(STORE, JSON.stringify({
        mode: state.mode, human: state.human, bot: state.bot, rule: state.rule,
        confirm: state.confirm, score: state.score, timeLimit: state.timeLimit, clockSpec: state.clockSpec, sidePick: state.sidePick, allowUndo: state.allowUndo,
        lclock: state.clocks && state.clocks.local ? LC.snapshot(state.clocks, performance.now()) : null,
        moves: state.board.moves.map((m) => [m.x, m.y]),
        timeout: state.winReason === 'time' ? state.winner : null,
        cam: { x: cam.x, y: cam.y, size: cam.size },
      }));
    } catch (e) { /* chế độ riêng tư */ }
  }

  // ------------------------------------------------------------ Luật chơi
  function placeRaw(x, y) {
    const p = state.turn;
    if (window.CaroDraft) window.CaroDraft.onRealMove(); // nước thật làm quân nháp cũ hết hạn (Issue #128)
    if (window.CaroDraw) window.CaroDraw.onRealMove(); // nước thật xóa hết đường vẽ chuột phải
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
    // Renju: X không được đánh nước cấm (3-3, 4-4, quá năm)
    const fb = forbidden(state.board, x, y, state.turn);
    if (fb) { toast(T('forbid_' + fb), 3000); vibrate(30); requestDraw(); return; }
    if (state.online) return playOnline(x, y);
    const mover = state.turn;
    if (state.clocks && state.clocks.local) LC.press(state.clocks, mover, performance.now());
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

  // ------------------------------------------------------------ Hiển thị trạng thái, kết quả ván (app-status.js)
  // Ba hàm sau tạo ở phía dưới (app-online.js, board-replay.js, app-ext.js): chỉ gọi lúc vẽ, khi đó đã có
  const { updateUI, showBanner, hideBanner } = window.CaroAppStatus({
    state, esc, glyph, ruleChip, botName, net,
    updateOnlineUI: () => updateOnlineUI(), updateReplayUI: () => updateReplayUI(), attentionInfo: () => attentionInfo(),
  });

  // ------------------------------------------------------------ Máy đánh (app-ai.js)
  const { isAITurn, botGameOver, maybeAI } = window.CaroAppAI({ state, toast, unlockAfter, updateUI, play: (x, y) => play(x, y) });

  function undo() {
    if (state.thinking || state.online || state.replay || state.ext || !state.allowUndo) return;
    const b = state.board;
    // Ván đã xong mà đi lại: kết quả bị huỷ – Lịch sử đấu trên máy bỏ ván vừa ghi (local-save.js)
    if (state.winner) window.dispatchEvent(new Event('caro:resultundo'));
    if (state.winReason === 'time') {
      // Thua vì hết giờ: "Đi lại" chỉ huỷ kết quả, cho đánh tiếp lượt đó.
      state.score[state.winner] = Math.max(0, state.score[state.winner] - 1);
      state.winner = null;
      state.winReason = null;
      if (state.clocks && state.clocks.local) state.clocks = null; // đồng hồ tổng: bắt đầu lại từ đầu
      hideBanner();
      save();
      updateUI();
      resetClock();
      return;
    }
    if (!b.moves.length) return;
    if (state.winner) state.score[state.winner] = Math.max(0, state.score[state.winner] - 1);
    if (window.CaroDraft) window.CaroDraft.clear(); // đi lại đổi thế cờ: quân nháp cũ hết hạn
    if (window.CaroDraw) window.CaroDraw.clear(); // đi lại xóa hết đường vẽ
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
    window.dispatchEvent(new Event('caro:newgame')); // rời ván cũ: local-save.js hỏi lưu ván vừa xong
    // Hộp hỏi "Lưu lịch sử đấu?" đang mở thì CHỜ trả lời xong mới tạo ván mới — trước đây ván mới
    // tạo ngay rồi hộp hỏi mới bật lên che bàn mới (Issue #141 mục 11, loi-06)
    const ask = $('lh-ask');
    if (ask && ask.open) {
      ask.addEventListener('close', () => startNewGame(), { once: true });
      return;
    }
    startNewGame();
  }

  function startNewGame() {
    if (state.online || state.replay || state.ext) return;
    state.board = new Board(state.rule);
    state.turn = X;
    state.winner = null;
    state.winReason = null;
    state.winCells = null;
    state.pending = null;
    state.thinking = false;
    if (state.clocks && state.clocks.local) state.clocks = null;
    hideBanner();
    animateCamera(0, 0, Math.max(cam.size, 32));
    save();
    updateUI();
    requestDraw();
    maybeAI();
    resetClock();
    if (state.mode === 'ai') toast(`${botName(state.bot)}: ${T('bot_' + state.bot + '_hi')}`, 3500);
    if (state.mode === 'ai' && window.CaroRapfi) window.CaroRapfi.prepare(state.bot, state.rule); // tải trước mạng của BOAT
  }

  // ------------------------------------------------------------ Đồng hồ mỗi nước (app-clock.js)
  const { resetClock, fmtClock, renderClock } = window.CaroAppClock({
    state, sfx, shellOn, isAITurn, botGameOver, save, updateUI, requestDraw, showBanner, vibrate,
  });

  // ------------------------------------------------------------ Online / xem ván (app-online.js)
  const { canPlaceNow, playOnline, applyRoom, enterOnline, leaveOnline, restoreLocal, updateOnlineUI } = window.CaroAppOnline({
    state, cam, esc, glyph, ruleChip, net, sfx, placeRaw, vibrate, updateUI, requestDraw, ensureVisible, animateCamera, renderClock,
    resetClock, showBanner, hideBanner, toBoard, save, load, maybeAI, isAITurn, toast,
    closeReplay: (silent) => closeReplay(silent), exitExt: (silent) => exitExt(silent), // tạo ở phía dưới
  });
  // Đặt trước nước đi khi đối thủ đang nghĩ (premove.js)
  window.CaroPremove.init({ state, canPlaceNow, play, requestDraw, vibrate });

  // ------------------------------------------------------------ Xem lại ván đã lưu (board-replay.js)
  const { openReplay, fitReplayView, seekReplay, stopReplay, toggleReplayPlay, closeReplay, updateReplayUI } = window.CaroBoardReplay({
    state, V, MIN_SIZE, save, toBoard, renderClock, hideBanner, updateUI, exitExt: (silent) => exitExt(silent), restoreLocal, glyph, esc, ruleChip, net, sfx,
  });


  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* không hỗ trợ */ }
  }


  // ------------------------------------------------------------ Nhập liệu (board-input.js)
  window.CaroBoardInput({
    canvas, cam, state, V, MIN_SIZE, MAX_SIZE, canPlaceNow, play, showBanner, vibrate, shellOn, undo, openNewGame: () => openNewGame(),
    seekReplay, toggleReplayPlay, closeReplay, stopReplay,
  });

  // ------------------------------------------------------------ Ván mới & Cài đặt (app-dialogs.js)
  const { openNewGame, setSetting } = window.CaroAppDialogs({ state, botAllowed, newGame, toBoard, save, updateUI, requestDraw, resetClock, maybeAI });

  $('btn-undo').onclick = undo;
  $('btn-center').onclick = centerView;
  $('banner-new').onclick = newGame;
  $('banner-view').onclick = hideBanner;

  // ------------------------------------------------------------ Bàn cờ do module khác điều khiển (app-ext.js)
  const { enterExt, extSet, extPlace, exitExt, setMarks, setCoords, cellName, fitView, attentionInfo, playersInfo } = window.CaroAppExt({
    state, V, MIN_SIZE, animateCamera, clamp, colName, ensureVisible, requestDraw, hideBanner, renderClock, save, toBoard, updateUI,
    sfx, vibrate, botName, openReplay, seekReplay, stopReplay, restoreLocal,
  });

  window.CaroApp = {
    enterExt,
    exitExt,
    extSet,
    extPlace,
    setMarks,
    setCoords,
    rotateBoard: () => V.rotation.turn(), // bar-menu.js: quay bàn thêm 90° (board-rotate.js)
    getRotation: () => V.rotation.target() * 90,
    setDrafts: (list) => V.setDrafts(list), // draft-mode.js: quân nháp
    setDrawLines: (list, prev) => V.setDrawLines(list, prev), // draw-lines.js: đường vẽ chuột phải
    cellName,
    fitReplayView,
    resize,
    fitView,
    seek: (i) => { stopReplay(); seekReplay(i, true); },
    get board() { return state.board; },
    /** Toạ độ màn hình của ô (x, y) – dùng cho kiểm thử bấm bàn cờ thật. */
    screenOf: (x, y) => V.toScreen(x, y), // qua toScreen để đúng cả khi lật bàn
    /** Chọn nhân vật máy (nếu đã mở khoá); unlockTo: mở khoá tới nhân vật thứ n (người chơi tự nhận là đã giỏi). */
    /**
     * Ván mới, bày sẵn vài nước đầu (luyện khai cuộc – learn-practice.js; ô chơi nhanh ở Trang chủ – home.js).
     * opts: { rule, moves: [[x, y], …] (X đi trước), human: X | O, mode: 'ai' (mặc định) | 'pvp', bot }.
     */
    startPreset(opts) {
      if (state.online) return false;
      if (state.replay) closeReplay(true);
      if (state.ext) exitExt(true);
      state.mode = opts.mode === 'pvp' ? 'pvp' : 'ai';
      state.rule = ruleOf(opts.rule);
      if (opts.human) state.human = opts.human;
      if (opts.bot && botAllowed(opts.bot)) state.bot = opts.bot;
      toBoard();
      newGame();
      for (const [x, y] of opts.moves || []) if (!state.winner) placeRaw(x, y);
      state.lastPlacedAt = performance.now();
      save();
      updateUI();
      requestDraw();
      maybeAI();
      return true;
    },
    /** Mở bảng "Ván mới" (chọn chế độ, đối thủ, luật, thời gian). */
    openNewGame,
    /** Đổi một mục Cài đặt (sound, soundStyle, theme, board, pieces, lang…) như khi đổi trong bảng Cài đặt. */
    setSetting,
    /** Ván cục bộ hiện tại (Trang chủ hiện thẻ "Tiếp tục ván"): { mode, bot, rule, moves, winner }. */
    get local() { return { mode: state.mode, bot: state.bot, rule: state.rule, moves: state.board.moves.length, winner: state.winner }; },
    /** Về bàn cờ (đóng các trang). */
    toBoard,
    /** Số mức nhân vật máy đã mở khoá (bot-picker.js). */
    unlockedTiers: () => unlockedCount(),
    setBot(id, unlockTo) {
      if (unlockTo && unlockTo > unlockedCount()) try { localStorage.setItem(BOT_STORE, JSON.stringify({ unlocked: Math.min(TIER_N, unlockTo) })); } catch (e) { /* riêng tư */ }
      if (botAllowed(id)) { state.bot = id; state.mode = 'ai'; save(); updateUI(); }
    },
    get turn() { return state.turn; },
    get players() { return playersInfo(); },
    get ext() { return state.ext; },
    get marks() { return state.marks; }, // dấu thêm trên bàn (test)
    enterOnline,
    applyRoom: (room, me) => {
      if (!state.online || state.online.watch) return enterOnline(room, me);
      // Phòng khác (ghép trận nhanh, cặp đấu của giải…) hoặc ván mới vừa bắt đầu trong phòng: vào bàn cờ ngay, kể cả
      // khi đang xem trang khác của khung. Máy chủ không báo "rời phòng" cho phòng cũ đã xong, nên state.online còn giữ
      // phòng trước và trước đây chỉ cập nhật ngầm – người chơi đứng ở Trang chủ, quá hạn nước đầu thì ván bị huỷ (loi-13).
      const prev = state.online.room;
      const fresh = prev.code !== room.code || (prev.gameNo !== room.gameNo && room.players.length === 2);
      applyRoom(room, me);
      window.CaroPremove.afterRoom(); // tới lượt mình: đánh ngay ô đã đặt trước
      if (fresh && shellOn()) toBoard();
    },
    /** Xem ván của người khác (chỉ đọc). */
    watchRoom: (room, me) => (state.online && state.online.watch && state.online.room.code === room.code ? applyRoom(room, me, true) : enterOnline(room, me, true)),
    get watching() { return !!(state.online && state.online.watch); },
    fmtClock: (ms) => fmtClock(ms),
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
  window.CaroStyle.onChange(() => { readColors(); requestDraw(); });
  window.addEventListener('langchange', () => {
    updateUI();
    if (!$('banner').hidden) showBanner();
  });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas);
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
    // sw.js lấy file từ bộ nhớ đệm trước: bản mới cài xong thì trang đang mở vẫn chạy bản cũ. Đang ở các trang (không giữa
    // ván online) thì tải lại luôn để dùng bản mới; đang chơi thì để lần mở sau. Lần cài đầu (chưa có bản cũ) không tải lại.
    // Đang gõ dở (ô đang focus, hoặc ô có chữ – form đăng ký, chat…) thì hoãn tới lần chuyển trang / quay lại app sau.
    const hadCtl = !!navigator.serviceWorker.controller;
    let updateReady = false;
    const typing = () => {
      const a = document.activeElement;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true;
      return [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea')]
        .some((i) => i.value && i.offsetParent !== null && i.defaultValue !== i.value);
    };
    const tryUpdate = () => {
      if (!updateReady || state.online || !(window.CaroShell && window.CaroShell.visible) || typing()) return;
      location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadCtl) { updateReady = true; tryUpdate(); } });
    window.addEventListener('caro:page', () => setTimeout(tryUpdate, 0));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tryUpdate(); });
  }
})();
