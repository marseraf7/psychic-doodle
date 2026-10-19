/*
 * Nghĩ trước của BOAT (boat-rapfi.js – GPL-3 cùng Rapfi): sau nước của BOAT, Rapfi nghĩ tiếp trên thế người chơi tới lượt,
 * không giới hạn thời gian (dừng khi người chơi đi, hết ván, ván mới) – bảng băm giữ sang nước sau của BOAT
 * (rapfi/worker.js). Giữ thế trong held: tạm dừng (ứng dụng chạy nền / người chơi bỏ máy IDLE.ms / máy căng – load)
 * rồi nghĩ tiếp đúng thế đó khi người chơi quay lại.
 *
 *   CaroRapfiPonder.create(o) – o: { cur() Worker chính, place(rule, moves), blocked() đang tự giảm tải, nextId(), stats }
 *     → { start(rule, moves), stop(), drop(), pause(), resume(), IDLE }
 *       start: nghĩ trước trên thế moves · stop: thôi hẳn · drop: bỏ thế đang giữ (người chơi đã đi – tin 'move' tự dừng
 *       lượt nghĩ trước trong Worker) · pause / resume: tạm dừng giữ thế / nghĩ tiếp · IDLE.ms: giới hạn bỏ máy
 */
(function (global) {
  'use strict';

  function create(o) {
    const IDLE = { ms: 600000 }; // giới hạn an toàn cho nghĩ trước không giới hạn: bỏ máy 10 phút thì thôi (pin, máy nóng)
    let held = null, paused = false, lastInput = Date.now(), idleTimer = 0;

    function start(rule, moves) {
      held = { rule, moves };
      paused = false;
      run();
    }
    function run() {
      const st = o.cur(), { rule, moves } = held;
      if (!st || st.state !== 'ready' || st.rule !== rule || global.document.hidden || o.blocked()) { paused = true; return; }
      armIdle();
      const f = o.place(rule, moves);
      if (paused || !f) return; // người chơi đã bỏ máy quá IDLE.ms: chờ họ quay lại
      const id = o.nextId();
      o.stats.ponder++;
      st.busy++; // đang chạy WebAssembly: retire() chờ xong lát hiện tại mới terminate()
      const onMsg = (e) => {
        if (e.data.type !== 'pondered' || e.data.id !== id) return;
        st.busy--;
        st.worker.removeEventListener('message', onMsg);
      };
      st.worker.addEventListener('message', onMsg);
      // ms: 0 – không giới hạn: người chơi nghĩ càng lâu, BOAT càng xét nhiều kịch bản (dừng khi người chơi đi, hết ván,
      // ván mới, ứng dụng chạy nền)
      st.worker.postMessage({ type: 'ponder', id, ms: 0, moves: moves.map(([x, y]) => [x - f.ox, y - f.oy]) });
    }
    function halt() {
      const st = o.cur();
      if (st && st.state === 'ready') try { st.worker.postMessage({ type: 'stop' }); } catch (e) { /* đã dừng */ }
    }
    function drop() {
      held = null;
      clearTimeout(idleTimer);
    }
    function stop() {
      drop();
      paused = false;
      halt();
    }
    /** Tạm dừng nghĩ trước, giữ thế để nghĩ tiếp (resume). */
    function pause() {
      if (!held || paused) return;
      paused = true;
      clearTimeout(idleTimer);
      halt();
    }
    function resume() {
      if (held && paused && !global.document.hidden) { paused = false; run(); }
    }
    function armIdle() {
      clearTimeout(idleTimer);
      const left = IDLE.ms - (Date.now() - lastInput);
      if (left <= 0) { o.stats.idle++; pause(); } else idleTimer = setTimeout(armIdle, left);
    }
    // Người chơi còn ở đây (chạm, bấm phím, cuộn): tính lại giờ bỏ máy; đang tạm dừng vì bỏ máy thì nghĩ tiếp
    const touched = () => {
      lastInput = Date.now();
      if (paused) resume(); else if (held) armIdle();
    };
    for (const t of ['pointerdown', 'keydown', 'touchstart', 'wheel']) global.addEventListener(t, touched, { capture: true, passive: true });
    // Ứng dụng chạy nền: tạm dừng (đỡ pin); quay lại thì nghĩ tiếp
    global.document.addEventListener('visibilitychange', () => { if (global.document.hidden) pause(); else touched(); });

    return { start, stop, drop, pause, resume, IDLE };
  }

  global.CaroRapfiPonder = { create };
})(window);
