/*
 * Thao tác phụ trong ván online (học ý tưởng từ Lichess), hiện thành thẻ nổi phía trên thanh dưới:
 *  - Đếm ngược đi nước đầu ở phòng gặp người lạ (quá hạn thì ván tự huỷ).
 *  - +15 giây cho đối thủ (ván có đồng hồ tổng), xin đi lại (phòng riêng / bạn bè), Berserk (giải Arena).
 *  - Lời xin đi lại của đối thủ: đồng ý / từ chối.
 *  - Bị cấm tìm trận vì bỏ ván nhiều: nhắc khi mở trò chơi.
 * Nút "Đầu hàng" tự thành "Huỷ ván" khi ván chưa quá 1 nước (online.js).
 */
(function () {
  'use strict';
  const O = window.CaroOnline;
  if (!O) return;
  const T = window.I18N.t;
  const esc = window.CaroApp.esc;
  const S = O.state;

  let firstAt = null; // hạn đi nước đầu theo đồng hồ máy mình
  let seenRoom = null;
  let ticker = 0;

  const me = () => S.me && S.me.id;
  const live = (r) => !!(r && S.me && r.players.length === 2 && !r.winner && !(r.kind === 'series' && r.seriesWinner));
  const opp = (r) => r.players.find((p) => p.id !== me());

  function canBerserk(r) {
    if (!live(r) || !r.tour || !r.tour.arena || !r.clock || r.phase || (r.berserk || []).includes(me())) return false;
    return r.seats.x === me() ? r.moves.length === 0 : r.moves.length < 2;
  }

  /** Gọi mỗi khi trạng thái phòng đổi (online.js → renderDraw). */
  function render() {
    const r = S.room;
    if (r !== seenRoom) {
      seenRoom = r;
      firstAt = live(r) && typeof r.firstMove === 'number' ? Date.now() + r.firstMove : null;
      clearInterval(ticker);
      if (firstAt) ticker = setInterval(() => { if (!firstAt || Date.now() > firstAt + 1000) clearInterval(ticker); O.renderInvites(); }, 1000);
    }
  }

  const btn = (act, label, cls = 'ghost') => `<button type="button" class="${cls} sm" data-gx="${act}">${esc(label)}</button>`;

  /** Thẻ nổi (online.js chèn vào cùng chỗ với lời mời). */
  function floatHtml() {
    const r = S.room;
    if (!live(r)) return '';
    let html = '';
    const o = opp(r);
    if (r.takebackOffer && r.takebackOffer !== me()) {
      html += `<div class="invite"><div><b>↶ ${esc(T('takeback_ask', { name: o ? o.name : T('opponent') }))}</b></div>
        ${btn('tb-no', T('decline'))}${btn('tb-yes', T('accept'), 'primary')}</div>`;
    }
    if (firstAt && r.moves.length < 2) {
      const n = Math.max(0, Math.ceil((firstAt - Date.now()) / 1000));
      const mine = r.actor === me();
      html += `<div class="invite gx-first${mine ? ' hot' : ''}"><div><b>⏱ ${esc(T(mine ? 'first_move_you' : 'first_move_opp', { n }))}</b>
        <small>${esc(T('first_move_d'))}</small></div></div>`;
    }
    const acts = [];
    if (r.clock && !r.tour) acts.push(btn('more', T('moretime_btn')));
    if (r.takeback && r.moves.length && !r.phase) {
      acts.push(r.takebackOffer === me() ? `<button type="button" class="ghost sm" disabled>${esc(T('takeback_sent'))}</button>` : btn('tb', T('takeback_btn')));
    }
    if (canBerserk(r)) acts.push(btn('berserk', T('berserk_btn'), 'primary'));
    if ((r.berserk || []).length) {
      const names = r.players.filter((p) => r.berserk.includes(p.id)).map((p) => p.name).join(', ');
      acts.unshift(`<small class="gx-berserk">⚡ ${esc(T('berserk_on', { names }))}</small>`);
    }
    if (acts.length) html += `<div class="invite gx-acts">${acts.join('')}</div>`;
    return html;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gx]');
    if (!b) return;
    const act = b.dataset.gx;
    if (act === 'more') O.send({ t: 'moretime' });
    else if (act === 'tb') O.send({ t: 'takeback' });
    else if (act === 'tb-yes' || act === 'tb-no') O.send({ t: 'takebackAnswer', accept: act === 'tb-yes' });
    else if (act === 'berserk' && confirm(T('berserk_confirm'))) O.send({ t: 'berserk' });
  });

  // Đang bị cấm tìm trận (bỏ ván nhiều): nhắc một lần khi kết nối
  let warned = false;
  O.on('welcome', (m) => {
    if (m.me && m.me.playban > 0 && !warned) {
      warned = true;
      O.toast(T('srv_playban', { n: Math.ceil(m.me.playban / 60000) }), 5000);
    }
  });

  window.CaroGameX = { render, floatHtml };
})();
