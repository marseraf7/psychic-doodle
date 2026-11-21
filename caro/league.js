/*
 * Hạng đấu tuần (hộp "Hạng đấu tuần" – tab Xem thêm): bậc hiện tại, nhóm tuần này (điểm, vùng lên / xuống bậc), thời gian
 * còn lại của tuần (giờ Việt Nam), cách tính điểm + luật chống cày điểm, kết quả các tuần trước. Thông báo chốt tuần
 * (máy chủ gửi 'notes' k = 'league') hiện thành toast. Máy chủ: server/src/hub/league.js.
 * API: window.CaroLeague = { open(), divName(i) }
 */
(function () {
  'use strict';
  const F = window.CaroFeat;
  const N = window.CaroOnline;
  if (!N) return;
  const T = window.I18N.t;
  const esc = F.esc;
  const DIVS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'];
  const COLORS = ['#b0703a', '#9aa4ad', '#d9a521', '#4fb3bf', '#5b8def', '#a35bd6'];
  const dlg = F.dialog('league-dlg', 'lg_title', 'trophy');
  const body = dlg.body;
  let cur = null;

  const divName = (i) => T('lg_div_' + (DIVS[i] || DIVS[0]));
  const emblem = (i) => `<span class="lg-emb" style="--c:${COLORS[i] || COLORS[0]}" aria-hidden="true">${i + 1}</span>`;

  function open() {
    dlg.open();
    if (!N.state.me || N.state.me.guest) { body.innerHTML = `<p class="hint">${esc(T('lg_need_account'))}</p>`; return; }
    body.innerHTML = '<p class="hint">…</p>';
    N.connect();
    N.send({ t: 'league' });
  }
  N.on('league', (m) => { cur = m; if (dlg.isOpen()) render(); });

  function left(ms) {
    const h = Math.max(0, Math.floor(ms / 3600000));
    return T('lg_ends', { d: Math.floor(h / 24), h: h % 24 });
  }

  function render() {
    const m = cur;
    if (!m) return;
    const rows = m.group.map((g) => {
      const zone = g.rank <= m.up && g.pts > 0 ? 'up' : g.rank > m.group.length - m.down ? 'down' : '';
      return `<li class="${esc(zone + (g.me ? ' me' : ''))}"><span class="rk">${g.rank}</span>
        <span class="nm"><b>${esc(g.name)}</b><small>${esc(T('lg_games', { n: g.games }))}${zone ? ' · ' + esc(T(zone === 'up' ? 'lg_zone_up' : 'lg_zone_down')) : ''}</small></span>
        <span class="pt"><b>${g.pts}</b></span></li>`;
    }).join('');
    const hist = (m.hist || []).map((h) => `<li><span class="rk">${h.rank}/${h.size}</span><span class="nm"><b>${esc(h.week)} · ${esc(divName(h.div))}</b></span>
      <span class="pt"><span class="feat-tag ${h.outcome === 'stay' ? '' : esc(h.outcome)}">${esc(T('lg_out_' + h.outcome))}</span></span></li>`).join('');
    body.innerHTML = `<div class="lg-head">${emblem(m.div)}<div><b>${esc(divName(m.div))}</b>
        <small>${esc(T('lg_week', { w: m.week }))} · ${esc(left(m.ends - Date.now()))}</small>
        ${m.best > m.div ? `<small>${esc(T('lg_best', { div: divName(m.best) }))}</small>` : ''}</div></div>
      ${m.me ? `<p class="hint">${esc(m.up || m.down ? T('lg_zones', { up: m.up, down: m.down }) : T('lg_zones_few'))}</p><ol class="feat-list">${rows}</ol>`
        : `<p class="hint">${esc(T('lg_join_hint'))}</p>`}
      <h3>${esc(T('lg_rules'))}</h3>
      <ul class="lg-rules"><li>${esc(T('lg_rule_pts'))}</li><li>${esc(T('lg_rule_same'))}</li><li>${esc(T('lg_rule_short'))}</li>
        <li>${esc(T('lg_rule_suspect'))}</li><li>${esc(T('lg_rule_move', { n: 5, size: m.size }))}</li></ul>
      ${hist ? `<h3>${esc(T('lg_hist'))}</h3><ol class="feat-list">${hist}</ol>` : ''}`;
  }

  // Chốt tuần: máy chủ gửi thông báo lưu (online: ngay; offline: khi vào lại)
  N.on('notes', (m) => {
    for (const x of m.items || []) {
      if (x.k !== 'league') continue;
      N.toast(T('lg_note_' + (['up', 'down'].includes(x.outcome) ? x.outcome : 'stay'), { div: divName(x.div), rank: x.rank }));
    }
  });

  window.addEventListener('langchange', () => { if (dlg.isOpen()) render(); });
  F.row('more-league', 'lg_title', 'trophy', open, { online: true });
  window.CaroLeague = { open, divName, emblem };
})();
