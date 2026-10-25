/*
 * Ván – hiển thị trạng thái: dòng "Lượt…" + tỉ số ở thanh trên, báo tới lượt mình (viền nhấn, trình đọc màn hình),
 * thẻ kết quả ván trên máy. Online / xem lại / bàn cờ của module khác thì nhường cho phần tương ứng.
 * app.js gọi window.CaroAppStatus(env) một lần; trả về { updateUI, showBanner, hideBanner }.
 */
(function () {
  'use strict';
  window.CaroAppStatus = function (env) {
    const $ = (id) => document.getElementById(id);
    const T = window.I18N.t;
    const { X, O, other } = window.Caro;
    const { state, esc, glyph, ruleChip, botName, net, updateOnlineUI, updateReplayUI, attentionInfo } = env;

    function updateUI() {
      drawStatus();
      turnCue();
      if (window.CaroStrips) window.CaroStrips.render();
      // Phân tích ngầm ván đang chơi (live-analysis.js); xem lại / giải đố không phải ván đang chơi
      if (window.CaroLive && !state.replay && !state.ext) window.CaroLive.sync(state.board, { busy: state.thinking, over: !!state.winCells });
      if (window.CaroAttention) window.CaroAttention.update(attentionInfo());
    }

    /**
     * Tới lượt mình: thanh trên viền màu nhấn + nảy nhẹ một lần (thấy ngay mà không cần đọc chữ).
     * Trình đọc màn hình: chỉ đọc khi tới lượt mình và khi ván kết thúc (dòng "Lượt…" không tự đọc mỗi nước đi nữa).
     */
    let cueMine = false, cueKey = '';
    function turnCue() {
      const o = state.online;
      let mine = false, over = false;
      if (o && !o.watch) {
        const r = o.room;
        over = !!r.winner;
        const opp = r.players.some((p) => p.id !== o.me);
        mine = !over && opp && (r.actor !== undefined ? r.actor === o.me : r.turn === o.side);
      } else if (o) {
        over = !!o.room.winner;
      } else if (!state.ext && !state.replay) {
        over = !!state.winner;
        mine = !over && !state.thinking && (state.mode === 'pvp' || state.turn === state.human);
      }
      // 2 người cùng máy: lượt nào cũng là "của mình" nên không tô (chỉ đọc cho trình đọc màn hình)
      const show = mine && !(!o && state.mode === 'pvp');
      const bar = document.querySelector('.bar.top');
      bar.classList.toggle('my-turn', show);
      if (show && !cueMine) { bar.classList.remove('turn-pulse'); void bar.offsetWidth; bar.classList.add('turn-pulse'); }
      cueMine = show;
      const n = o ? o.room.moves.length : state.board.moves.length;
      const key = over ? 'end' + n : mine ? 'turn' + n : '';
      if (key && key !== cueKey) $('sr-live').textContent = $('turn').textContent.replace(/\s+/g, ' ').trim();
      cueKey = key;
    }

    function drawStatus() {
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
      $('score').innerHTML = ruleChip(state.rule) + `<span class="x">X</span> ${state.score[X]} : ${state.score[O]} <span class="o">O</span>`;
      $('btn-undo').hidden = !state.allowUndo;
      $('btn-undo').disabled = !state.board.moves.length || state.thinking;
      $('btn-analyze').disabled = state.board.moves.length < 2 || state.thinking;
    }

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
      // Đấu với máy: ảnh đại diện nhỏ của nhân vật cạnh dòng kết quả
      const av = state.mode === 'ai' && window.CaroBotPicker ? window.CaroBotPicker.avatarHtml(state.bot, 'sm') + ' ' : '';
      $('banner-title').innerHTML = av + esc(text);
      $('banner-sub').textContent = sub;
      $('banner').hidden = false;
    }
    function hideBanner() { $('banner').hidden = true; }

    return { updateUI, showBanner, hideBanner };
  };
})();
