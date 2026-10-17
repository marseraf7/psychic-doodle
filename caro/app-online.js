/*
 * Ván – chơi online / xem ván: có được đánh lúc này không, gửi nước đi (hiện ngay, máy chủ xác nhận sau), dựng lại bàn cờ
 * theo phòng từ máy chủ, vào / rời phòng, quay lại ván trên máy, thanh trên (lượt, tỉ số, người xem) khi chơi / xem online.
 * app.js gọi window.CaroAppOnline(env) một lần; trả về
 * { canPlaceNow, playOnline, applyRoom, enterOnline, leaveOnline, restoreLocal, updateOnlineUI }.
 */
(function () {
  'use strict';
  window.CaroAppOnline = function (env) {
    const $ = (id) => document.getElementById(id);
    const T = window.I18N.t;
    const { Board, X, O } = window.Caro;
    const { state, cam, esc, glyph, ruleChip, net, sfx, placeRaw, vibrate, updateUI, requestDraw, ensureVisible, animateCamera, renderClock,
      resetClock, showBanner, hideBanner, closeReplay, exitExt, toBoard, save, load, maybeAI, isAITurn } = env;

    // Người chơi có được đánh lúc này không.
    function canPlaceNow() {
      if (state.ext) return !state.winner && !!state.ext.canPlay;
      if (state.winner || state.thinking || state.replay) return false;
      if (!state.online) return !isAITurn();
      const { room, side, me, watch } = state.online;
      if (watch) return false; // người xem
      if (room.players.length !== 2 || room.seriesWinner) return false;
      // Máy chủ cho biết ai phải hành động (luật Swap2: một người đặt cả quân X lẫn O; lúc chọn bên thì không đặt quân)
      if (room.actor !== undefined) return room.actor === me && !/^choose/.test(room.phase || '');
      return room.turn === side;
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
    function applyRoom(room, me, watch) {
      const prev = state.online && state.online.room;
      const isNewGame = !prev || prev.gameNo !== room.gameNo || room.moves.length < prev.moves.length;
      const b = new Board(room.rule);
      room.moves.forEach(([x, y], i) => b.play(x, y, i % 2 === 0 ? X : O));
      const side = room.seats.x === me ? X : room.seats.o === me ? O : 0;
      state.board = b;
      state.turn = room.turn;
      state.winner = room.winner;
      state.winCells = room.winCells;
      state.pending = null;
      state.thinking = false;
      state.online = { room, me, side: watch ? 0 : side, watch: !!watch };
      state.clock = room.turnLeft != null && !room.winner ? { endsAt: performance.now() + room.turnLeft, local: false } : null;
      state.clocks = room.clocks ? { ...room.clocks, running: room.winner ? 0 : room.clocks.running, at: performance.now() } : null;
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
        setTimeout(() => sfx(room.winner === 3 ? 'draw' : watch || room.winner === side ? 'win' : 'lose'), 150);
        if (!watch) setTimeout(showBanner, 300);
      }
      if (!room.winner) hideBanner();
      updateUI();
      requestDraw();
    }

    /** watch = true: chỉ xem (không phải người chơi). */
    function enterOnline(room, me, watch) {
      if (state.replay) closeReplay(true);
      if (state.ext) exitExt(true);
      const was = state.online;
      if (!was) {
        save();
        document.body.classList.add('online');
        hideBanner();
        animateCamera(0, 0, Math.max(cam.size, 32));
      }
      if (was && !!was.watch !== !!watch) { state.online = null; hideBanner(); } // đổi giữa xem và chơi: coi như phòng mới
      document.body.classList.toggle('watching', !!watch);
      applyRoom(room, me, watch);
      if (!was || !!was.watch !== !!watch) toBoard();
    }

    function leaveOnline() {
      if (!state.online) return;
      state.online = null;
      state.clocks = null;
      document.body.classList.remove('online', 'watching');
      restoreLocal();
    }

    /** Quay lại ván chơi trên máy (sau khi rời phòng online hoặc thoát xem lại). */
    function restoreLocal() {
      state.clocks = null; // load() khôi phục đồng hồ tổng đã lưu
      state.board = new Board(state.rule);
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


    const rated = (p) => (p && p.rating ? ` <span class="rating">${p.rating}${p.prov ? '?' : ''}</span>` : '');

    function updateOnlineUI() {
      const { room, me, side, watch } = state.online;
      if (watch) return updateWatchUI(room);
      const opp = room.players.find((p) => p.id !== me);
      const t = $('turn');
      const myTurn = room.actor !== undefined ? room.actor === me : room.turn === side;
      if (room.phase && !room.winner && opp) {
        // Luật Swap2: đang đặt quân khai cuộc / chọn bên
        t.innerHTML = myTurn ? `${esc(T('swap_' + room.phase + '_you'))} ${glyph(room.turn)}`
          : `${esc(T('swap_wait', { name: opp.name }))}`;
      } else if (!opp) {
        t.innerHTML = `${esc(T('waiting_opp'))} <span class="thinking">${esc(T('room_code', { code: room.code }))}</span>`;
      } else if (room.winner === 3) {
        t.innerHTML = `🤝 ${esc(T('draw_short'))}`;
      } else if (room.winner) {
        t.innerHTML = room.winner === side ? `${glyph(side)} ${esc(T('you_won_short'))}` : `${glyph(room.winner)} ${esc(T('you_lost_short'))}`;
      } else if (myTurn) {
        t.innerHTML = `${esc(T('your_turn'))} ${glyph(side)}`;
      } else {
        t.innerHTML = esc(T('turn_of', { name: '\u0000' })).replace('\u0000', `<span class="name" title="${esc(opp.name)}">${esc(opp.name)}</span>`) +
          ` ${glyph(room.turn)}` + (opp.online ? '' : ` <span class="thinking">${esc(T('disconnected'))}</span>`);
      }
      const oppScore = opp ? room.score[opp.id] || 0 : 0;
      $('score').innerHTML = ruleChip(room.rule) + `${esc(T('you'))} ${room.score[me] || 0} : ${oppScore} <span class="name" title="${esc(opp ? opp.name : '')}">${esc(opp ? opp.name : '?')}</span>` +
        (room.kind === 'series' ? ` · Bo${room.bestOf}` : '') + watchers(room);
    }

    const watchers = (room) => (room.watchers ? ` <span class="watchers" title="${esc(T('watchers', { n: room.watchers }))}"><svg class="ico i-in" aria-hidden="true"><use href="#i-eye"/></svg>${room.watchers}</span>` : '');

    /** Người xem: tên 2 bên (kèm điểm), kết quả khi ván xong. */
    function updateWatchUI(room) {
      const who = (s) => {
        const p = room.players.find((q) => q.id === (s === X ? room.seats.x : room.seats.o));
        return `${glyph(s)} <span class="name" title="${esc(p ? p.name : '?')}">${esc(p ? p.name : '?')}</span>${rated(p)}`;
      };
      const t = $('turn');
      if (room.winner === 3) t.innerHTML = `${who(X)} <span class="thinking">½–½</span> ${who(O)}`;
      else if (room.winner) t.innerHTML = `${who(X)} <span class="thinking">${room.winner === X ? '1–0' : '0–1'}</span> ${who(O)}`;
      else t.innerHTML = `${who(X)} <span class="thinking">–</span> ${who(O)}`;
      let sub = room.winner ? T(room.winner === 3 ? 'draw_short' : 'p_wins_plain', { p: room.winner === X ? 'X' : 'O' })
        : room.phase ? T('swap_phase_' + room.phase) : T('watching_tag');
      if (room.tour) sub = room.tour.name + ' · ' + sub;
      $('score').innerHTML = ruleChip(room.rule) + `${esc(sub)} · ${esc(T('n_moves', { n: room.moves.length }))}` + watchers(room);
    }

    return { canPlaceNow, playOnline, applyRoom, enterOnline, leaveOnline, restoreLocal, updateOnlineUI };
  };
})();
