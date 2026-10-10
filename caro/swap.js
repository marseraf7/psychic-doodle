/* Luật khai cuộc Swap2: thẻ hướng dẫn đặt quân và nút chọn bên (máy chủ: server/src/room-swap2.js). */
(function () {
  'use strict';
  const N = window.CaroOnline;
  if (!N) return;
  const App = window.CaroApp;
  const T = window.I18N.t;
  const esc = App.esc;
  const $ = (id) => document.getElementById(id);
  const S = N.state;
  const glyph = (p) => (p === 1 ? '<b class="x">X</b>' : '<b class="o">O</b>');

  function renderSwap() {
    const box = $('swap-card');
    const r = S.room;
    const me = S.me && S.me.id;
    const show = r && me && r.opening === 'swap2' && r.phase && !r.winner && r.players.length === 2 && !App.watching;
    if (!show) { box.hidden = true; return; }
    const mine = r.actor === me;
    let html = '';
    if (r.phase === 'place3' || r.phase === 'place2') {
      const total = r.phase === 'place3' ? 3 : 5;
      html = `<b>${esc(T(mine ? 'swap_' + r.phase + '_you' : 'swap_phase_' + r.phase))}</b>
        <small>${esc(T('swap_progress', { n: r.moves.length, total }))}</small>`;
    } else if (mine) {
      html = `<b>${esc(T('swap_choose_title'))}</b><small>${esc(T(r.phase === 'choose1' ? 'swap_choose1_hint' : 'swap_choose2_hint'))}</small>
        <div class="row">
          <button type="button" class="primary sm" data-swap="x">${esc(T('swap_take'))} ${glyph(1)}</button>
          <button type="button" class="primary sm" data-swap="o">${esc(T('swap_take'))} ${glyph(2)}</button>
          ${r.phase === 'choose1' ? `<button type="button" class="ghost sm" data-swap="place2">${esc(T('swap_place2'))}</button>` : ''}
        </div>`;
    } else {
      const opp = r.players.find((p) => p.id === r.actor);
      html = `<b>${esc(T('swap_wait', { name: opp ? opp.name : T('opponent') }))}</b>`;
    }
    box.innerHTML = html;
    box.hidden = false;
    box.querySelectorAll('[data-swap]').forEach((b) => { b.onclick = () => N.send({ t: 'swap', choice: b.dataset.swap }); });
  }
  N.on('room', renderSwap);
  N.on('close', () => { $('swap-card').hidden = true; });

  window.addEventListener('langchange', renderSwap);
})();
