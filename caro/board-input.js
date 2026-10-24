/*
 * Bàn cờ – nhập liệu: chạm / chuột (đặt quân, chế độ chạm 2 lần, chạm lần đầu phóng to khi ô quá nhỏ), kéo, chụm
 * 2 ngón, quán tính, lăn chuột / touchpad, phím tắt (mũi tên, +/-, C, N, Ctrl+Z; xem lại: ← → Home End Space Esc).
 * app.js gọi window.CaroBoardInput(env) một lần (gắn sự kiện lên canvas và window); không trả về gì.
 */
(function () {
  'use strict';
  window.CaroBoardInput = function (env) {
    const { EMPTY, X, O } = window.Caro;
    const { canvas, cam, state, V, MIN_SIZE, MAX_SIZE, canPlaceNow, play, showBanner, vibrate, shellOn, undo, openNewGame,
      seekReplay, toggleReplayPlay, closeReplay, stopReplay } = env;
    const { toCell, toWorld, animateCamera, requestDraw, zoomAt, clamp, saveSoon, centerView, getFlip } = V;

    // ------------------------------------------------------------ Nhập liệu
    const pointers = new Map();
    let gesture = null;

    // Quân người vẽ đang cầm (draw-lines.js): online thì bên của mình (xem ván thì lấy lượt hiện tại),
    // đánh máy thì quân người chơi, 2 người một máy thì lượt hiện tại.
    function myStone() {
      if (state.online) return state.online.side || state.turn;
      if (state.mode === 'ai') return state.human;
      return state.turn;
    }

    /** Ô nhỏ hơn mức này (px) thì ngón tay dễ chạm nhầm ô bên cạnh: chạm lần đầu chỉ phóng to tới chỗ đó. */
    const TOUCH_MIN = 26, TOUCH_ZOOM = 36;
    function tap(sx, sy, mouse) {
      // Chế độ nháp (draft-mode.js, Issue #128): mọi cú chạm thành đặt / gỡ quân nháp, không đánh nước thật.
      if (window.CaroDraft && window.CaroDraft.active()) {
        const [x, y] = toCell(sx, sy);
        if (state.board.get(x, y) === EMPTY) window.CaroDraft.place(x, y);
        return;
      }
      if (state.winner) { if (!state.ext) showBanner(); return; }
      if (!canPlaceNow()) return;
      const [x, y] = toCell(sx, sy);
      if (state.board.get(x, y) !== EMPTY) return;
      if (!mouse && cam.size < TOUCH_MIN) {
        animateCamera(x, y, TOUCH_ZOOM);
        // Chế độ chạm 2 lần: ô vừa chạm thành ô chờ xác nhận, chạm lần nữa là đặt quân (không tốn thêm lượt chạm)
        if (state.confirm) state.pending = [x, y];
        vibrate(5);
        return;
      }
      if (state.confirm) {
        if (state.pending && state.pending[0] === x && state.pending[1] === y) play(x, y);
        else { state.pending = [x, y]; vibrate(5); requestDraw(); }
      } else play(x, y);
    }

    function startPinch() {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const [wx, wy] = toWorld(mx, my); // không làm tròn; đúng cả khi lật bàn
      return {
        type: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        size: cam.size,
        wx, wy,
      };
    }

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      V.stopMotion();
      if (pointers.size === 1) {
        if (e.pointerType === 'mouse' && e.button === 2 && window.CaroDraw) {
          // Chuột phải (chỉ máy tính): bắt đầu kéo vẽ đường, không phải chạm đặt quân / kéo bàn cờ.
          const [x, y] = toCell(e.clientX, e.clientY);
          window.CaroDraw.begin(x, y, myStone());
          gesture = { type: 'draw' };
        } else {
          gesture = { type: 'tap', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, vx: 0, vy: 0, mouse: e.pointerType === 'mouse', button: e.button };
        }
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

      if (gesture.type === 'draw') {
        const c = toCell(e.clientX, e.clientY);
        window.CaroDraw.move(c[0], c[1]);
        return;
      }

      if (gesture.type === 'tap') {
        const d = Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy);
        if (d > (gesture.mouse ? 5 : 10)) { gesture.type = 'pan'; canvas.classList.add('grabbing'); }
      }
      if (gesture.type === 'pan') {
        const dx = e.clientX - gesture.lx, dy = e.clientY - gesture.ly;
        const dt = Math.max(1, e.timeStamp - gesture.lt);
        const fl = getFlip(); // lật bàn: kéo phải thì camera đi ngược dấu để nội dung vẫn bám theo ngón tay
        cam.x -= (fl.h ? -dx : dx) / cam.size;
        cam.y -= (fl.v ? -dy : dy) / cam.size;
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
        const fl = getFlip(); // neo điểm chụm đúng cả khi lật bàn (cùng công thức với zoomAt)
        cam.x = gesture.wx - (fl.h ? -(mx - V.W / 2) : (mx - V.W / 2)) / cam.size;
        cam.y = gesture.wy - (fl.v ? -(my - V.H / 2) : (my - V.H / 2)) / cam.size;
        requestDraw();
      }
    });

    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      canvas.classList.remove('grabbing');
      if (!gesture) return;
      if (gesture.type === 'draw') {
        // Thả phải thì chốt đường; hủy giữa chừng (mất focus...) thì bỏ đường đang kéo.
        if (e.type === 'pointerup') window.CaroDraw.end();
        else window.CaroDraw.cancel();
        gesture = null;
        return;
      }
      if (gesture.type === 'tap' && pointers.size === 0) {
        if (e.type === 'pointerup' && (!gesture.mouse || gesture.button === 0)) tap(e.clientX, e.clientY, gesture.mouse);
        gesture = null;
      } else if (gesture.type === 'pan' && pointers.size === 0) {
        const idle = e.timeStamp - gesture.lt;
        if (idle < 60 && Math.hypot(gesture.vx, gesture.vy) > 0.15) {
          V.fling(gesture.vx, gesture.vy);
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
      V.stopAnim();
      if (e.ctrlKey || e.deltaMode !== 0 || Math.abs(e.deltaY) >= 40 && e.deltaX === 0) {
        // Bánh xe chuột / chụm trên touchpad: phóng to thu nhỏ.
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015) * (e.deltaMode === 1 ? 30 : 1));
        zoomAt(e.clientX, e.clientY, cam.size * f);
      } else {
        // Vuốt 2 ngón trên touchpad: di chuyển (lật bàn thì đổi dấu để nội dung cuộn cùng hướng).
        const fl = getFlip();
        cam.x += (fl.h ? -e.deltaX : e.deltaX) / cam.size;
        cam.y += (fl.v ? -e.deltaY : e.deltaY) / cam.size;
        requestDraw();
        saveSoon();
      }
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (shellOn() || document.querySelector('dialog[open]') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
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
        case '+': case '=': zoomAt(V.W / 2, V.H / 2, cam.size * 1.2); return;
        case '-': case '_': zoomAt(V.W / 2, V.H / 2, cam.size / 1.2); return;
        case 'c': case 'C': centerView(); return;
        case 'n': case 'N': if (!state.replay && !state.ext) openNewGame(); return;
        default: return;
      }
      requestDraw();
      saveSoon();
    });
  };
})();
