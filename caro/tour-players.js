/*
 * Giải đấu – người chơi trên trang giải (tách từ tour.js): bảng xếp hạng Arena, danh sách người chơi của giải theo giai
 * đoạn (hạt giống, điểm danh, bị loại vì sao), ván gần đây của Arena, nút loại người chơi (ban tổ chức có quyền).
 * Giải ẩn hạt giống: ban tổ chức vẫn thấy số hạt giống (t.seeds, phần riêng của ban tổ chức).
 *   K.standings(t), K.playerList(t), K.recentGames(t). Nạp sau tour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc, me, can, icon } = K;
  const seedOf = (t, p) => p.seed || (t.seeds && t.seeds[p.uid]) || null;

  const dot = (p) => `<span class="st ${p.playing ? 'playing' : p.online ? 'online' : 'offline'}" title="${esc(T(p.playing ? 'st_playing' : p.online ? 'st_online' : 'st_offline'))}"></span>`;
  function kick(t, p) {
    return can(t, 'players') && !p.withdrawn && (t.status === 'scheduled' || t.status === 'running') && p.uid !== (me() && me().uid)
      ? `<button type="button" class="ghost sm icon" data-act="kick" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}" title="${esc(T('tour_kick'))}" aria-label="${esc(T('tour_kick'))}">${icon('close')}</button>` : '';
  }
  function standings(t) {
    if (!t.players.length) return `<p class="hint">${esc(T('tour_no_players'))}</p>`;
    return `<h4>${esc(T('standings'))}</h4><ol class="ranks tstand">${t.players.map((p, i) => `
      <li class="${me() && p.uid === me().uid ? 'me' : ''}"><span class="rank">${i + 1}</span>${dot(p)}
        <div class="pn"><b><a href="#" class="plink" data-profile="${esc(p.uid)}">${esc(p.name)}</a>${p.playing && p.uid !== (me() && me().uid) ? ` <a href="#" class="watch-link" data-watch-uid="${esc(p.uid)}" title="${esc(T('watch'))}">${icon('eye')}</a>` : ''}${p.fire ? icon('fire', 'fire') : ''}${p.paused ? icon('pause', 'muted') : ''}${p.withdrawn ? icon('close', 'muted') : ''}</b><small>${esc(T('wdl', { w: p.wins, d: p.draws, l: p.losses }))} · ${esc(String(p.rating))}</small></div>
        <span class="pts">${p.score}</span>${kick(t, p)}</li>`).join('')}</ol>
      <p class="hint">${esc(T('arena_rules')).replace('🔥', icon('fire', 'fire'))}</p>`;
  }
  function playerList(t) {
    if (!t.players.length) return `<p class="hint">${esc(T('tour_no_players'))}</p>`;
    const OUT = { no_checkin: 'out_no_checkin', kicked: 'out_kicked', lost: 'out_lost', not_advanced: 'out_not_advanced' };
    const outLabel = (p) => (OUT[p.out] ? T(OUT[p.out]) : p.withdrawn ? T('out_withdrew') : '');
    return `<h4>${esc(T('players_title', { n: t.players.length }))}</h4><ul class="people">${t.players.map((p) => `
      <li>${dot(p)}<div class="pn"><b>${seedOf(t, p) ? '#' + seedOf(t, p) + ' ' : ''}${esc(p.name)}</b><small>${esc(String(p.rating))}${t.status === 'scheduled' && t.checkinEnabled ? ' · ' + esc(T(p.checkedIn ? 'checked_in' : 'not_checked_in')) : ''}${outLabel(p) ? ' · ' + esc(outLabel(p)) : ''}</small></div>${kick(t, p)}</li>`).join('')}</ul>`;
  }
  function recentGames(t) {
    return `<h4>${esc(T('recent_games'))}</h4><ul class="people tgames">${t.games.slice(0, 15).map((g) => {
      const x = g.x ? g.x.name : '?', o = g.o ? g.o.name : '?';
      const res = !g.w ? '½–½' : g.x && g.w === g.x.uid ? '1–0' : '0–1';
      const tag = g.annulled ? ` · ${esc(T('dispute_annulled'))}` : g.dc ? ` · ${esc(T('dispute_dc'))}` : '';
      return `<li><div class="pn"><b>${esc(x)} <span class="muted">${res}</span> ${esc(o)}</b><small>+${g.px} / +${g.po}${tag}</small></div>${g.share ? `<a href="#" data-act="replay" data-share="${esc(g.share)}" aria-label="${esc(T('replay'))}">${icon('play')}</a>` : ''}</li>`;
    }).join('')}</ul>`;
  }

  Object.assign(K, { standings, playerList, recentGames });
})();
