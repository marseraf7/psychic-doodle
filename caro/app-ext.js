/*
 * Ván – bàn cờ cho module khác điều khiển (giải đố, "Thử lại", bài học: enterExt / extSet / extPlace / exitExt, đánh dấu,
 * toạ độ, khung nhìn), mở phân tích ván vừa chơi, trạng thái ván cho attention.js và 2 thẻ người chơi (player-strips.js).
 * app.js gọi window.CaroAppExt(env) một lần; trả về
 * { enterExt, extSet, extPlace, exitExt, setMarks, setCoords, cellName, fitView, attentionInfo, playersInfo }.
 */
(function () {
  'use strict';
  window.CaroAppExt = function (env) {
    const $ = (id) => document.getElementById(id);
    const T = window.I18N.t;
    const { Board, X, O, other, checkWin } = window.Caro;
    const { state, V, MIN_SIZE, animateCamera, clamp, colName, ensureVisible, requestDraw, hideBanner, renderClock, save, toBoard, updateUI,
      sfx, vibrate, botName, openReplay, seekReplay, stopReplay, restoreLocal } = env;

    // (giải đố, "Thử lại" trong phân tích). ctrl: { moves, canPlay, onMove(x, y), onExit(), render() -> { turn, score } }
    function enterExt(ctrl) {
      if (state.online) return false;
      if (!state.replay && !state.ext) save();
      if (state.replay) stopReplay();
      state.ext = ctrl;
      if (state.clocks && state.clocks.local) state.clocks = null; // đồng hồ ván trên máy đã lưu, khôi phục khi quay lại
      toBoard();
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
      const b = new Board(state.ext && state.ext.rule);
      // Danh sách nước từ bộ điều khiển ngoài có thể trùng/hỏng: bỏ qua nước lỗi (H-E1).
      moves.forEach(([x, y], i) => { try { b.play(x, y, i % 2 ? O : X); } catch (e) { /* bỏ qua nước hỏng */ } });
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
    /** Bật / tắt toạ độ trên bàn: { minX, maxX, minY, maxY } của ván (null: tắt). */
    function setCoords(c) { state.coords = c || null; requestDraw(); }
    /** Tên ô theo toạ độ đang bật, vd. "e7" (cột chữ cái, hàng số đếm từ dưới lên như cờ vua). */
    const cellName = (x, y) => {
      const c = state.coords;
      if (!c || x < c.minX || x > c.maxX || y < c.minY || y > c.maxY) return `${x},${y}`;
      return colName(x - c.minX) + (c.maxY - y + 1);
    };
    /** Khung nhìn vừa đủ các quân. */
    function fitView(moves) {
      if (!moves.length) return animateCamera(0, 0, 36);
      const xs = moves.map((m) => m[0]), ys = moves.map((m) => m[1]);
      const w = Math.max(...xs) - Math.min(...xs) + 5, h = Math.max(...ys) - Math.min(...ys) + 5;
      const size = clamp(Math.min((V.W - 24) / w, (V.H - 220) / h), MIN_SIZE, 48);
      animateCamera((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2 + 40 / size, size);
    }

    /** Mở xem lại ván vừa chơi trên máy (để phân tích). */
    function replayLocal() {
      const moves = state.board.moves.map((m) => [m.x, m.y]);
      const nm = (p) => (state.mode === 'ai' ? (p === state.human ? T('you') : botName(state.bot)) : p === X ? 'X' : 'O');
      return openReplay({ local: true, x: nm(X), o: nm(O), winner: state.winner, reason: state.winReason === 'time' ? 'timeout' : 'win', moves, rule: state.rule });
    }
    // Thanh dưới: Phân tích ván đang chơi (mở xem lại + bảng phân tích), Về giữa
    $('btn-analyze').onclick = () => {
      if (state.online || state.board.moves.length < 2) return;
      if (replayLocal() && window.CaroStudy) window.CaroStudy.analyze();
    };
    $('btn-center-l').onclick = () => $('btn-center').click();
    $('banner-analyze').onclick = () => {
      if (state.online) return;
      if (replayLocal() && window.CaroStudy) window.CaroStudy.analyze();
    };

    /**
     * Trạng thái ván cho attention.js (tiêu đề tab, giữ màn hình sáng):
     * { active: đang có ván dở (không phải xem lại / giải đố), online, myTurn: tới lượt mình (null = 2 người một máy), over }.
     */
    function attentionInfo() {
      if (state.replay || state.ext) return { active: false };
      if (state.online) {
        const { room, side, watch } = state.online;
        const ready = room.players.length >= 2;
        return { online: true, active: !watch && ready && !room.winner, myTurn: !watch && room.turn === side, over: !watch && ready && !!room.winner };
      }
      const started = state.board.moves.length > 0;
      return { active: started && !state.winner, myTurn: state.mode === 'ai' ? state.turn === state.human : null, over: started && !!state.winner };
    }

    /**
     * Hai người chơi cho thẻ trên / dưới bàn cờ (player-strips.js): dưới là mình (hoặc X khi 2 người / xem ván), trên là đối thủ.
     * Mỗi bên: { side, name, me, bot, rating, prov, offline, turn }. null khi bàn cờ đang do giải đố / bài học điều khiển.
     */
    function playersInfo() {
      if (state.ext) return null;
      let bottom, top, turn = 0;
      if (state.online) {
        const { room, me, side, watch } = state.online;
        const bs = watch ? X : side;
        const as = (s) => {
          const p = room.players.find((q) => q.id === (s === X ? room.seats.x : room.seats.o));
          return { side: s, name: p ? p.name : '…', rating: p && p.rating, prov: p && p.prov, offline: !!p && p.online === false, me: !watch && s === side };
        };
        bottom = as(bs);
        top = as(other(bs));
        turn = room.winner || room.players.length < 2 ? 0 : room.turn;
      } else if (state.replay) {
        const d = state.replay.data;
        bottom = { side: X, name: d.x || T('deleted_player') };
        top = { side: O, name: d.o || T('deleted_player') };
      } else {
        if (state.mode === 'ai') {
          bottom = { side: state.human, name: T('you'), me: true };
          top = { side: other(state.human), name: botName(state.bot), bot: state.bot };
        } else {
          bottom = { side: X, name: T('strip_player', { p: 'X' }) };
          top = { side: O, name: T('strip_player', { p: 'O' }) };
        }
        turn = state.winner ? 0 : state.turn;
      }
      bottom.turn = bottom.side === turn;
      top.turn = top.side === turn;
      return { top, bottom, thinking: !state.online && !state.replay && state.thinking };
    }

    return { enterExt, extSet, extPlace, exitExt, setMarks, setCoords, cellName, fitView, attentionInfo, playersInfo };
  };
})();
