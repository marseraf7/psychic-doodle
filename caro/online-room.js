/*
 * Online – phòng chơi: tạo phòng, vào phòng bằng mã, hộp thoại thông tin phòng (mã, mật khẩu, link mời, người chơi,
 * đối đầu), đầu hàng / huỷ ván, xin hoà, rời phòng, thẻ kết thúc ván (tái đấu, chia sẻ, giải đấu).
 * online.js gọi window.CaroOnlineRoom(ctx) một lần; trả về
 * { openJoin, inviteLink, fillRoomInfo, openRoomInfo, renderDraw, roomActive, leaveRoom, showBanner }.
 */
(function () {
  'use strict';
  window.CaroOnlineRoom = function (ctx) {
    const App = window.CaroApp;
    const esc = App.esc;
    const T = window.I18N.t;
    const $ = (id) => document.getElementById(id);
    const parseTc = (v) => window.CaroTimeCtl.fromValue(v); // 't20' / 'c5+3' (bộ chọn thời gian, tc-picker.js)
    const { S, send, toast, openDlg, closeDlg } = ctx;

    // ------------------------------------------------------------ Phòng
    $('create-room').onclick = async () => {
      // Đang có ván dở: tạo phòng mới là rời ván cũ và bị xử thua — hỏi trước (Issue #141 mục 1)
      if (roomActive() && !(await window.CaroConfirm.ask(T('confirm_leave')))) return;
      const side = document.querySelector('input[name="room-side"]:checked').value;
      send({ t: 'createRoom', side, ...parseTc($('room-tc').value), opening: $('room-opening').value, rule: $('room-rule').value, public: $('room-public').checked });
    };
    // Chọn Swap2 thì hiện lời giải thích luật ngay dưới (ô chọn chỉ ghi ngắn "Swap2" để không bị cắt chữ)
    $('room-opening').onchange = () => { $('room-opening-hint').hidden = $('room-opening').value !== 'swap2'; };
    $('open-join').onclick = () => openJoin('');

    // priv = mở từ link mời của phòng riêng: hiện sẵn dòng nhắc "cần mật khẩu" thay vì im lặng.
    function openJoin(code, priv) {
      const f = $('join-form');
      f.code.value = code || '';
      f.password.value = '';
      $('join-err').textContent = priv ? T('join_private_hint') : '';
      openDlg('join');
      setTimeout(() => (code ? f.password : f.code).focus(), 50);
    }
    $('join-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      // Vào phòng khác cũng là bỏ ván dở (bị xử thua) — hỏi trước như khi tạo phòng (Issue #141 mục 1)
      if (roomActive() && !(await window.CaroConfirm.ask(T('confirm_leave')))) return;
      $('join-err').textContent = '';
      send({ t: 'joinRoom', code: f.code.value.trim(), password: f.password.value.trim() });
    };
    // Chỉ cho gõ số.
    ['code', 'password'].forEach((n) => {
      $('join-form')[n].addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
    });

    function inviteLink(code) {
      const u = new URL(ctx.base ? ctx.base + '/' : location.href);
      if (!ctx.base) { u.search = ''; u.hash = ''; }
      u.searchParams.set('room', code);
      return u.toString();
    }

    function fillRoomInfo() {
      const r = S.room;
      if (!r) return;
      $('room-title').innerHTML = r.tour ? '<svg class="ico i-in" aria-hidden="true"><use href="#i-trophy"/></svg>' + esc(r.tour.name)
        : esc(r.kind === 'series' ? T('series_title', { n: r.bestOf }) : T('room_title'));
      // Phòng của giải đấu: không có mã / mật khẩu / link mời
      document.querySelector('#room-info .codes').hidden = !!r.tour;
      $('ri-time').textContent = '⏱ ' + window.I18N.tc(r.timeLimit, r.clock) + (r.opening === 'swap2' ? ' · ' + T('opening_swap2') : '') + window.I18N.ruleTag(r.rule);
      $('ri-code').textContent = r.code;
      $('ri-pass').textContent = r.password;
      $('ri-hint').textContent = r.tour ? T('room_info_hint_tour') : T(r.public ? 'room_info_hint_public' : 'room_info_hint');
      $('ri-pass').parentElement.hidden = !!r.public; // phòng công khai: vào không cần mật khẩu
      if (r.public) $('ri-time').textContent += ' · 🌐 ' + T('public_tag');
      $('ri-link').value = inviteLink(r.code);
      $('ri-link').closest('.link-row').hidden = r.kind === 'series' || !!r.tour;
      $('ri-share').hidden = r.kind === 'series' || !!r.tour || !navigator.share;
      $('ri-tour').hidden = !r.tour;
      const friendIds = new Set(S.friends.friends.map((f) => 'u_' + f.id));
      const pending = new Set(S.friends.outgoing.map((f) => 'u_' + f.id));
      $('ri-players').innerHTML = r.players.map((p) => {
        const side = r.seats.x === p.id ? '<b class="x">X</b>' : '<b class="o">O</b>';
        const you = p.id === S.me.id;
        const canFriend = !you && !S.me.guest && p.id.startsWith('u_') && !friendIds.has(p.id);
        return `<li><span class="st ${p.online ? 'online' : 'offline'}"></span>${side}
          <div class="pn"><b>${p.id.startsWith('u_') ? `<a href="#" class="plink" data-profile="${esc(p.id)}">${esc(p.name)}</a>` : esc(p.name)}${you ? ' ' + esc(T('you_tag')) : ''}${p.rating ? ` <span class="rating">${esc(String(p.rating))}${p.prov ? '?' : ''}</span>` : ''}</b><small>${esc(T('won_games', { n: r.score[p.id] || 0 }))}${r.rematch.includes(p.id) ? ' · ' + esc(T('wants_rematch_tag')) : ''}</small></div>
          ${canFriend ? (pending.has(p.id) ? `<small>${esc(T('friend_sent'))}</small>` : `<button type="button" class="ghost sm" data-add="${esc(p.id)}">${esc(T('add_friend'))}</button>`) : ''}
          ${!you && !S.me.guest && p.id.startsWith('u_') ? `<button type="button" class="ghost sm icon" data-report="${esc(p.id)}" title="${esc(T('report'))}" aria-label="${esc(T('report'))}">⚠</button>` : ''}</li>`;
      }).join('') + (r.players.length < 2 ? `<li class="empty">${esc(T('waiting_join'))}</li>` : '');
      // Thành tích đối đầu (tính theo mình)
      const h = r.h2h;
      const meX = r.seats.x === S.me.id;
      $('ri-h2h').textContent = h && (h.wins + h.losses + h.draws)
        ? T('h2h_line', meX ? { w: h.wins, l: h.losses, d: h.draws } : { w: h.losses, l: h.wins, d: h.draws }) : '';
      $('ri-players').querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => send({ t: 'friendAdd', id: b.dataset.add }); });
      $('ri-players').querySelectorAll('[data-report]').forEach((b) => {
        b.onclick = () => window.CaroSocial && window.CaroSocial.openReport(b.dataset.report, r.players.find((p) => p.id === b.dataset.report).name);
      });
    }
    function openRoomInfo() { fillRoomInfo(); openDlg('room-info'); }

    // Ô link phòng hẹp nên chữ bị cắt, không thấy phần ?room=…: bấm vào (hoặc Tab tới) là chọn hết
    // chữ để thấy/kéo chọn được cả link, thay vì chỉ đoạn giữa bị cắt (Issue #141 mục 10, loi-05)
    $('ri-link').addEventListener('click', (e) => e.target.select());
    $('ri-link').addEventListener('focus', (e) => e.target.select());

    $('ri-copy').onclick = async () => {
      const link = $('ri-link').value;
      try { await navigator.clipboard.writeText(link); }
      catch (e) { $('ri-link').select(); document.execCommand('copy'); }
      toast(T('copied'));
    };
    $('ri-share').onclick = () => {
      navigator.share({ title: T('app_title'), text: T('share_text', { code: S.room.code }), url: inviteLink(S.room.code) }).catch(() => {});
    };

    $('btn-room').onclick = openRoomInfo;
    // Phòng của giải: mở trang giải (bảng xếp hạng / nhánh đấu) ngay trong lúc chơi
    $('ri-tour').onclick = () => { if (S.room && S.room.tour && window.CaroTour) { closeDlg('room-info'); window.CaroTour.open(S.room.tour.id); } };
    $('btn-center2').onclick = () => $('btn-center').click();
    $('btn-resign').onclick = async () => {
      const r = S.room;
      if (!r || r.players.length < 2 || r.winner) return toast(T('no_game'));
      if (r.abortable) return send({ t: 'abort' }); // chưa quá 1 nước: huỷ ván (không thắng thua)
      if (await window.CaroConfirm.ask(T('confirm_resign'))) send({ t: 'resign' });
    };
    // Xin hoà: chỉ khi ván đang diễn ra; đã xin thì chờ đối thủ trả lời.
    function renderDraw() {
      const r = S.room;
      const b = $('btn-draw');
      const live = !!(r && S.me && r.players.length === 2 && !r.winner && !(r.kind === 'series' && r.seriesWinner));
      const mine = live && r.drawOffer === S.me.id;
      b.disabled = !live || mine;
      $('btn-draw-label').textContent = T(mine ? 'draw_sent' : 'btn_draw');
      // Ván chưa quá 1 nước: nút đầu hàng thành nút huỷ ván
      $('btn-resign-label').textContent = T(live && r.abortable ? 'btn_abort' : 'btn_resign');
      window.CaroGameX?.render();
    }
    $('btn-draw').onclick = () => {
      const r = S.room;
      if (!r || r.players.length < 2 || r.winner) return toast(T('no_game'));
      send({ t: 'drawOffer' });
    };

    // Đang có ván dở (đã có nước đi) – rời đi sẽ bị xử thua.
    function roomActive() {
      const r = S.room;
      return !!(r && r.players.length === 2 && !r.winner && r.moves.length);
    }

    /** Về Trang chủ, thẻ Phòng chờ (sau khi rời phòng lúc ván chưa kết thúc). */
    function goLobby() {
      if (window.CaroHome) { window.CaroHome.open(); window.CaroHome.pane('lobby'); }
    }

    async function leaveRoom() {
      if (roomActive() && !(await window.CaroConfirm.ask(T('confirm_leave')))) return;
      const r = S.room;
      // Ván chưa kết thúc (đang chờ đối thủ hoặc đang đánh dở): rời xong về sảnh, không mở lại ván
      // với máy đang dở — ván đó vẫn hiện thành thẻ "Tiếp tục ván" ở Trang chủ (Issue #141 mục 2).
      // Ván đã kết thúc (nút ở thẻ kết quả) giữ hành vi cũ: về bàn cờ trên máy.
      const toLobby = !!r && !r.winner;
      // Rời ván đang đánh dở (quá nước huỷ được) = xử thua: báo lại sau khi rời, không chỉ trong hộp hỏi (#155)
      const forfeit = roomActive() && !r.abortable;
      if (!send({ t: 'leaveRoom' })) {
        // Mất kết nối: vẫn cho quay về chơi cục bộ.
        S.room = null;
        App.leaveOnline();
        if (toLobby) goLobby();
      } else {
        if (toLobby) S.toLobby = true; // online.js (setRoom) đưa về sảnh khi máy chủ xác nhận đã rời phòng
        if (forfeit) toast(T('left_forfeit'), 4000);
      }
    }
    $('btn-leave').onclick = leaveRoom;
    $('banner-leave').onclick = leaveRoom;
    $('banner-rematch').onclick = () => send({ t: 'rematch' });

    // ------------------------------------------------------------ Kết thúc ván
    function showBanner() {
      const r = S.room;
      if (!r || !r.winner || !S.me) return;
      const me = S.me.id;
      const draw = r.winner === 3;
      const winnerId = r.winner === 1 ? r.seats.x : r.seats.o;
      const won = winnerId === me;
      const opp = r.players.find((p) => p.id !== me);
      const oppName = opp ? opp.name : T('opponent');
      let title = T(draw ? 'draw_title' : won ? 'you_win' : 'lost');
      let sub = '';
      // Lý do kết thúc khác (đầu hàng, rời phòng, mất kết nối, hết giờ): nói ai là người thua.
      if (r.reason === 'abort') { title = T('aborted_title'); sub = ''; } // ván bị huỷ: không ai thắng
      else if (r.reason === 'abandoned') { title = T('abandoned_title'); sub = T('abandoned_sub'); } // cả hai mất kết nối (#140): huỷ ván, nói rõ để người vào lại không tưởng là hoà thường
      else if (draw) sub = T('r_draw');
      else if (r.reason && r.reason !== 'win') sub = won ? T(`r_${r.reason}_opp`, { name: oppName }) : T(`r_${r.reason}_you`);
      const score = `${r.score[me] || 0} – ${opp ? r.score[opp.id] || 0 : 0}`;
      let rematch = true;
      if (r.kind === 'series') {
        if (r.seriesWinner) {
          title = r.seriesWinner === me ? T('series_won', { score }) : T('series_lost', { name: oppName, score });
        } else {
          sub = (sub ? sub + ' · ' : '') + T('score_is', { score }) + ' · ' + T('next_game', { n: r.gameNo + 1 });
          rematch = false;
        }
      } else {
        sub = (sub ? sub + ' · ' : '') + T('score_is', { score });
      }
      if (r.unrated) sub = (sub ? sub + ' · ' : '') + T('unrated');
      if (r.delta && typeof r.delta[me] === 'number') {
        const d = r.delta[me];
        sub = (sub ? sub + ' · ' : '') + T('rating_delta', { d: (d >= 0 ? '+' : '') + d, pool: T('pool_' + (r.pool || 'rapid')) });
        // Điểm còn tạm (RD cao): giải thích ngay vì sao điểm nhảy nhiều (vd. ±162 ở ván đầu) — loi-08
        const meP = r.players.find((p) => p.id === me);
        if (meP && meP.prov) sub = (sub ? sub + ' · ' : '') + T('rating_prov_note');
      }
      if (!opp && !r.tour) { sub = T('opp_left'); rematch = false; } // giải: đối thủ đã sang trận khác, vẫn hiện kết quả
      // Ván của giải đấu: không tái đấu; Arena tự ghép ván sau
      if (r.tour) {
        rematch = false;
        if (r.tour.arena) sub = (sub ? sub + ' · ' : '') + T('tour_next_auto');
      }
      $('banner-tour').hidden = !r.tour;
      $('banner-title').textContent = title;
      $('banner-sub').textContent = sub;
      const btn = $('banner-rematch');
      btn.hidden = !rematch;
      const mine = r.rematch.includes(me), theirs = opp && r.rematch.includes(opp.id);
      btn.disabled = mine;
      btn.textContent = T(mine ? 'waiting_rematch' : theirs ? 'accept_rematch' : 'rematch');
      $('banner-share').hidden = !r.share;
      $('banner-quick').hidden = !r.quick; // phòng do tìm trận nhanh: tìm đối thủ mới ngay
      $('banner').hidden = false;
    }
    $('banner-tour').onclick = () => { if (S.room && S.room.tour && window.CaroTour) { $('banner').hidden = true; window.CaroTour.open(S.room.tour.id); } };
    $('banner-share').onclick = () => {
      const r = S.room;
      if (!r || !r.share) return;
      const x = r.players.find((p) => p.id === r.seats.x), o = r.players.find((p) => p.id === r.seats.o);
      ctx.shareReplay({ share: r.share, x: x ? x.name : 'X', o: o ? o.name : 'O' });
    };

    return { openJoin, inviteLink, fillRoomInfo, openRoomInfo, renderDraw, roomActive, leaveRoom, showBanner };
  };
})();
