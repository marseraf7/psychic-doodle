/*
 * Góc phải dưới Trang chủ (như Lichess): số kỳ thủ đang online và số ván đang đấu – số thật máy chủ đếm
 * (gửi kèm pong mỗi 10 giây – server/src/hub/lobby.js), không thêm bớt. Mất kết nối thì ẩn.
 * Bấm số ván: mở tab Xem (các ván đang đấu).
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const O = window.CaroOnline;
  const el = document.getElementById('online-count');
  if (!O || !el) return;
  let last = null;

  function draw() {
    const n = last;
    el.hidden = !(n && O.connected && typeof n.players === 'number');
    if (el.hidden) return;
    el.innerHTML = '';
    const p = document.createElement('span');
    p.textContent = T('oc_players', { n: n.players.toLocaleString() });
    const g = document.createElement('button');
    g.type = 'button';
    g.className = 'linkish';
    g.textContent = T('oc_games', { n: n.games.toLocaleString() });
    g.onclick = () => { const b = document.querySelector('#tabbar [data-tab="watch"]'); if (b) b.click(); };
    el.append(p, g);
  }

  O.on('pong', (m) => { last = m; draw(); });
  O.on('close', () => { last = null; draw(); });
  window.addEventListener('langchange', draw);
})();
