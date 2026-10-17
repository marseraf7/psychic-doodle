/*
 * Bàn cờ – xem lại ván đã lưu (từ máy chủ, Lịch sử đấu trên máy, ván vừa chơi): tua từng nước, tự phát, chia sẻ,
 * thanh xem lại (nút ⏮ ◀ ▶ ▶▶ ✕), khung nhìn vừa đủ ván.
 * app.js gọi window.CaroBoardReplay(env) một lần; trả về
 * { openReplay, fitReplayView, seekReplay, stopReplay, toggleReplayPlay, closeReplay, updateReplayUI }.
 */
(function () {
  'use strict';
  window.CaroBoardReplay = function (env) {
    const { Board, X, O, checkWin } = window.Caro;
    const T = window.I18N.t;
    const $ = (id) => document.getElementById(id);
    const { state, V, MIN_SIZE, save, toBoard, renderClock, hideBanner, updateUI, exitExt, restoreLocal, glyph, esc, ruleChip, net, sfx } = env;
    const { requestDraw, ensureVisible, animateCamera } = V;

    // ------------------------------------------------------------ Xem lại ván đã lưu
    /** data: { share, x, o, winner, reason, moves: [[x, y], ...] } (từ máy chủ). */
    function openReplay(data) {
      if (state.online) return false;
      if (!state.replay) save();
      stopReplay();
      state.replay = { data, idx: 0, timer: 0 };
      if (state.clocks && state.clocks.local) state.clocks = null; // đồng hồ ván trên máy đã lưu, khôi phục khi quay lại
      toBoard();
      state.thinking = false;
      state.pending = null;
      state.clock = null;
      renderClock();
      hideBanner();
      document.body.classList.add('replay');
      seekReplay(data.moves.length, true);
      fitReplayView();
      return true;
    }

    /** Khung nhìn vừa đủ toàn bộ quân của ván đang xem lại (gọi lại khi bàn cờ đổi kích thước, vd. mở bảng phân tích). */
    function fitReplayView() {
      const r = state.replay;
      if (!r) return;
      const xs = r.data.moves.map((m) => m[0]), ys = r.data.moves.map((m) => m[1]);
      if (!xs.length) return;
      // Phân tích: thanh dưới nằm trong bảng (máy tính) hoặc ngoài bàn cờ (điện thoại) nên chỉ chừa chỗ cho thanh trên
      const padY = document.body.classList.contains('analysis') ? 110 : 160;
      const w = Math.max(...xs) - Math.min(...xs) + 4, h = Math.max(...ys) - Math.min(...ys) + 4;
      const size = Math.max(MIN_SIZE, Math.min(48, (V.W - 24) / w, (V.H - padY) / h));
      animateCamera((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2 + (padY === 110 ? 20 / size : 0), size);
    }

    function seekReplay(i, quiet) {
      const r = state.replay;
      if (!r) return;
      const moves = r.data.moves;
      i = Math.max(0, Math.min(moves.length, i));
      const forward = i === r.idx + 1;
      r.idx = i;
      const b = new Board(r.data.rule);
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
      state.coords = null;
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
      $('score').innerHTML = ruleChip(data.rule) + `${idx}/${n}` + (result ? ` · ${esc(result)}` : '');
      $('rp-first').disabled = $('rp-prev').disabled = idx === 0;
      $('rp-next').disabled = idx === n;
      renderReplayPlay();
    }

    $('rp-first').onclick = () => { stopReplay(); seekReplay(0, true); };
    $('rp-prev').onclick = () => { stopReplay(); seekReplay(state.replay.idx - 1, true); };
    $('rp-next').onclick = () => { stopReplay(); seekReplay(state.replay.idx + 1); };
    $('rp-play').onclick = toggleReplayPlay;
    $('rp-close').onclick = () => closeReplay();
    // Chia sẻ: ảnh PNG / GIF động (share.js), và link xem lại nếu là ván đã lưu trên máy chủ
    $('rp-share').onclick = () => {
      const d = state.replay.data;
      const nm = (v) => v || T('deleted_player');
      let result = d.winner === 3 ? T('draw_short') : d.winner ? T('replay_wins', { name: nm(d.winner === X ? d.x : d.o) }) : '';
      if (d.reason && !['win', 'draw'].includes(d.reason) && result) result += ' · ' + T('end_' + d.reason);
      window.CaroShare.open({ moves: d.moves, x: nm(d.x), o: nm(d.o), result, rule: d.rule }, d.share && net() ? () => net().shareReplay(d) : null);
    };

    return { openReplay, fitReplayView, seekReplay, stopReplay, toggleReplayPlay, closeReplay, updateReplayUI };
  };
})();
