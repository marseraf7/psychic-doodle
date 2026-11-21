/*
 * Bảng xếp hạng Puzzle Storm tuần (A5) ở tab Câu đố: 10 người điểm cao nhất tuần này (tuần ISO, đổi lúc 00:00 thứ Hai giờ
 * Việt Nam – progress-merge.js weekKey) + hạng của mình. Đang kết nối: hỏi máy chủ qua WebSocket (stormBoard – mới nhất,
 * kèm hạng của mình); không thì đọc API công khai /api/storm/leaderboard (giữ 60 giây). Không có máy chủ: ẩn.
 * Vẽ lại khi mở tab Câu đố, đổi ngôn ngữ, và sau mỗi lượt Storm có kiểm (caro:stormresult – storm.js).
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const $ = (id) => document.getElementById(id);
  const N = window.CaroOnline;
  const esc = window.CaroApp.esc;
  const TOP = 10;
  let data = null;

  function render() {
    const el = $('storm-board');
    if (!el) return;
    if (!data) { el.hidden = true; return; }
    const S = N && N.state;
    const guest = !(S && S.me && !S.me.guest);
    const rows = data.players.slice(0, TOP).map((p) => `<li${S && S.me && p.username === S.me.username ? ' class="me"' : ''}>
      <span class="sb-rank">${p.rank}</span><span class="sb-name ellip" role="button" tabindex="0" data-pf-name="${esc(p.username)}">${esc(p.name)}</span>
      <b class="sb-score">${esc(T('sb_score', { n: p.score }))}</b></li>`).join('');
    const me = data.me;
    const mine = guest ? T('sb_guest') : me && me.rank ? T('sb_me', { n: me.score, rank: me.rank }) : T('sb_me_none');
    el.innerHTML = `<h3><svg class="ico i-in" aria-hidden="true"><use href="#i-bolt"/></svg><span class="ellip">${esc(T('sb_title'))}</span></h3>
      <p class="hint">${esc(T('sb_week', { w: data.week.replace(/^\d{4}-W/, '') }))}</p>
      ${rows ? `<ol class="sb-list">${rows}</ol>` : `<p class="hint">${esc(T('sb_empty'))}</p>`}
      <p class="sb-me">${esc(mine)}</p>`;
    el.hidden = false;
  }

  // Máy chủ giới hạn 1 lần / giây: gọi dồn (mở tab ngay sau lượt Storm) thì gom thành một lần hỏi
  let lastAsk = 0, later = 0;
  async function load() {
    if (!N || !N.base) return;
    if (N.connected) {
      const wait = lastAsk + 1300 - Date.now();
      clearTimeout(later);
      if (wait > 0) { later = setTimeout(load, wait); return; }
      lastAsk = Date.now();
      N.send({ t: 'stormBoard' }); // trả 'stormBoard' (bên dưới)
      return;
    }
    try {
      const r = await fetch(N.base + '/api/storm/leaderboard', { cache: 'no-store' });
      if (!r.ok) return;
      data = { ...(await r.json()), me: null };
      render();
    } catch (e) { /* không có máy chủ / mất mạng: giữ nguyên */ }
  }

  if (N) N.on('stormBoard', (m) => { data = { week: m.week, players: m.players || [], me: m.me }; render(); });
  // Tên trong bảng: mở hồ sơ theo tên đăng nhập (profile.js)
  function openName(a) {
    if (!window.CaroProfile) return;
    if (!N.connected) { N.toast(T('not_connected')); return; }
    window.CaroProfile.openName(a.dataset.pfName);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('#storm-board [data-pf-name]');
    if (a) openName(a);
  });
  // span role="button": bàn phím (Enter / Space) cũng mở được như nút thật
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const a = e.target.closest && e.target.closest('#storm-board [data-pf-name]');
    if (!a) return;
    e.preventDefault(); // Space: không cuộn trang
    openName(a);
  });
  window.addEventListener('caro:page', (e) => { if (e.detail.id === 'puzzles') load(); });
  window.addEventListener('caro:stormresult', () => load());
  window.addEventListener('langchange', render);
  window.CaroStormBoard = { load, render, get data() { return data; } };
})();
