/*
 * Ván – máy đánh: tới lượt máy thì hỏi nước (Web Worker ai-worker.js, BOAT qua Rapfi ở boat-rapfi.js), Worker hỏng / quá
 * hạn thì tính trên luồng chính; hết ván với máy thì phát caro:gameover và mở khoá nhân vật kế tiếp. app.js gọi
 * window.CaroAppAI(env) một lần; trả về { isAITurn, botGameOver, maybeAI }.
 */
(function () {
  'use strict';
  window.CaroAppAI = function (env) {
    const Bots = window.CaroBots;
    const T = window.I18N.t;
    const { state, toast, unlockAfter, updateUI, play } = env;

    const isAITurn = () => !state.online && !state.replay && !state.ext && state.mode === 'ai' && !state.winner && state.turn !== state.human;

    /** Hết ván với máy: người thắng thì mở khoá nhân vật kế tiếp. */
    function botGameOver() {
      // Chuỗi ngày chơi / thành tích (habits.js); record: ván vừa xong cho Lịch sử đấu trên máy (local-save.js)
      window.dispatchEvent(new CustomEvent('caro:gameover', { detail: { mode: state.mode, won: state.mode === 'ai' && state.winner === state.human, bot: state.bot, record: localRecord() } }));
      if (state.mode !== 'ai' || state.winner !== state.human) return;
      const t = unlockAfter(state.bot);
      if (t) setTimeout(() => toast(T(t.boss ? 'boss_unlocked' : 'tier_unlocked', { elo: t.elo }), 4500), 900);
    }

    /** Ván trên máy vừa kết thúc → bản ghi cho Lịch sử đấu trên máy (local-games.js). Tên bot / "Bạn" dịch lúc hiển thị. */
    function localRecord() {
      const ai = state.mode === 'ai';
      return {
        at: Date.now(), kind: ai ? 'bot' : 'pvp', bot: ai ? state.bot : null, me: ai ? state.human : 0, x: '', o: '',
        winner: state.winner, reason: state.winReason === 'time' ? 'timeout' : 'win', rule: state.rule,
        timeLimit: state.timeLimit || 0, clock: state.clockSpec || null, moves: state.board.moves.map((m) => [m.x, m.y]),
      };
    }

    // AI chạy trong Web Worker để bàn cờ và đồng hồ không bị khựng khi máy suy nghĩ lâu (mức Khó).
    // Trình duyệt không hỗ trợ (vd. mở file trực tiếp) thì tính ngay trên luồng chính.
    let aiWorker = null, aiSeq = 0;
    // Worker ở mọi giao thức trừ file: – app iOS chạy ở capacitor:// (M-A4: trước đây chỉ http(s) nên bot tính trên luồng giao diện, đơ vài giây)
    try { if (window.Worker && location.protocol !== 'file:') aiWorker = new Worker('ai-worker.js'); } catch (e) { aiWorker = null; }

    function askAI(p, bot) {
      // BOAT ở luật tự do / tiêu chuẩn / Renju: Rapfi (boat-rapfi.js); không chạy được thì engine của game như mọi bot
      const R = window.CaroRapfi;
      if (R && R.handles(bot, state.board.rule)) return R.move(state.board, p, bot).then((m) => m || askEngine(p, bot));
      return askEngine(p, bot);
    }

    // Worker không nạp được (vd. giao thức capacitor:// của iOS không cho) hoặc chết: bỏ Worker, các lần hỏi đang chờ và
    // về sau tính trên luồng chính như khi không có Worker – chậm hơn nhưng bot vẫn đi, không treo "đang nghĩ" mãi.
    const AI_TIMEOUT_MS = 20000; // nước khó nhất ~3 giây (bots.js) + VCF: quá mức này coi như Worker hỏng
    const aiWaiting = new Set(); // hàm chuyển sang luồng chính của các lần hỏi đang chờ
    function dropWorker() {
      if (!aiWorker) return;
      try { aiWorker.terminate(); } catch (e) { /* đã chết */ }
      aiWorker = null;
      for (const fallback of [...aiWaiting]) fallback();
    }
    if (aiWorker) aiWorker.addEventListener('error', dropWorker);

    function askEngine(p, bot) {
      const moves = state.board.moves.map((m) => [m.x, m.y, m.p]);
      const local = () => new Promise((resolve) => setTimeout(() => resolve(Bots.botMove(state.board, p, bot)), 30));
      if (!aiWorker) return local();
      const id = ++aiSeq;
      return new Promise((resolve) => {
        const w = aiWorker;
        let timer = 0;
        const done = () => { clearTimeout(timer); w.removeEventListener('message', onMsg); aiWaiting.delete(fallback); };
        const onMsg = (e) => {
          if (e.data.id !== id) return;
          done();
          // C3: Worker báo lỗi (vd. ván trải quá rộng) → null để maybeAI thôi chờ, thay vì treo "đang nghĩ" mãi
          resolve(e.data.error ? null : e.data.move);
        };
        const fallback = () => { done(); resolve(local()); };
        aiWaiting.add(fallback);
        timer = setTimeout(dropWorker, AI_TIMEOUT_MS);
        w.addEventListener('message', onMsg);
        w.postMessage({ id, moves, p, bot, rule: state.board.rule });
      });
    }

    function maybeAI() {
      if (!isAITurn() || state.thinking) return;
      state.thinking = true;
      updateUI();
      const started = performance.now();
      const board = state.board, count = board.moves.length;
      askAI(state.turn, state.bot).then((mv) => {
        if (!mv) { state.thinking = false; updateUI(); return; } // C3: máy không tính được (Worker báo lỗi) — nhả lượt chờ, đừng khoá ván
        const [x, y] = mv;
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

    return { isAITurn, botGameOver, maybeAI };
  };
})();
