/*
 * Ván – đồng hồ: đồng hồ mỗi nước và đồng hồ tổng 2 bên. Offline đếm trên máy, tạm dừng khi mở hộp thoại / chuyển app,
 * hết giờ thì bên tới lượt thua; online chỉ hiển thị thời gian máy chủ gửi. app.js gọi window.CaroAppClock(env) một lần
 * (bắt đầu đếm 200 ms một lần); trả về { resetClock, syncTotalClock, fmtClock, renderClocks, renderClock, tickClock, timeUp }.
 */
(function () {
  'use strict';
  window.CaroAppClock = function (env) {
    const $ = (id) => document.getElementById(id);
    const LC = window.CaroLocalClock; // đồng hồ tổng khi chơi trên máy (local-clock.js)
    const { X, O, other } = window.Caro;
    const { state, sfx, shellOn, isAITurn, botGameOver, save, updateUI, requestDraw, showBanner, vibrate } = env;

    // Online: máy chủ quyết định hết giờ, ở đây chỉ hiển thị thời gian còn lại.
    let clockLast = performance.now();
    const clockPaused = () => document.hidden || shellOn() || !!document.querySelector('dialog[open]');

    function resetClock() {
      if (state.online || state.replay || state.ext) return;
      syncTotalClock();
      const needs = !state.clockSpec && state.timeLimit && !state.winner && !state.thinking && !isAITurn();
      state.clock = needs ? { endsAt: performance.now() + state.timeLimit * 1000, local: true } : null;
      renderClock();
    }

    /** Đồng hồ tổng offline: tạo khi cần, cho bên tới lượt chạy (chưa chạy trước nước đầu và khi ván đã xong). */
    function syncTotalClock() {
      const now = performance.now();
      if (!state.clockSpec) { if (state.clocks && state.clocks.local) state.clocks = null; return; }
      if (!state.clocks || !state.clocks.local || state.clocks.spec !== state.clockSpec) state.clocks = LC.create(state.clockSpec, now);
      LC.run(state.clocks, state.winner || !state.board.moves.length ? 0 : state.turn, now);
    }

    /** 125000 ms -> '2:05'; dưới 10 giây hiện thêm phần mười: '7.4'. */
    const fmtClock = (ms) => {
      ms = Math.max(0, ms);
      if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1);
      const s = Math.ceil(ms / 1000);
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };

    /** Đồng hồ tổng 2 bên (ván online có đồng hồ, như cờ vua 3+2). */
    function renderClocks() {
      const box = $('clocks');
      const c = state.clocks;
      if (!c) { box.hidden = true; return; }
      box.hidden = false;
      const el = performance.now() - c.at;
      for (const [k, p] of [['x', X], ['o', O]]) {
        const run = c.running === p;
        const ms = c[k] - (run ? el : 0);
        const node = $('ck-' + k);
        node.textContent = fmtClock(ms);
        node.classList.toggle('run', run);
        node.classList.toggle('low', run && ms < 10000);
        const mine = state.online ? state.online.side === p : !(state.mode === 'ai' && p !== state.human);
        if (run && ms < 10000 && ms > 0 && mine) {
          const sec = Math.ceil(ms / 1000);
          if (sec !== c.lastTick) { c.lastTick = sec; if (sec <= 5) sfx('tick'); }
        }
      }
    }

    function renderClock() {
      const el = $('clock');
      const c = state.clock;
      renderClocks();
      if (!c || state.winner || state.clocks) { el.hidden = true; return; }
      const left = Math.max(0, Math.ceil((c.endsAt - performance.now()) / 1000));
      el.hidden = false;
      $('clock-n').textContent = left;
      el.classList.toggle('low', left <= 5);
      const mine = c.local || (state.online && state.online.room.actor === state.online.me);
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
      const t = state.clocks;
      if (t && t.local && !state.online && !state.replay && !state.ext) {
        if (clockPaused()) LC.pause(t, dt);
        else if (!state.winner && t.running && LC.left(t, t.running, now) <= 0) return timeUp();
      }
      renderClock();
    }
    setInterval(tickClock, 200);

    /** Hết giờ khi chơi offline: người đang tới lượt thua. */
    function timeUp() {
      state.clock = null;
      if (state.clocks && state.clocks.local) LC.run(state.clocks, 0, performance.now());
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

    return { resetClock, syncTotalClock, fmtClock, renderClocks, renderClock, tickClock, timeUp };
  };
})();
