/*
 * Giải đấu – trang Duyệt của quản trị viên: hàng chờ giải / câu lạc bộ cần duyệt, số liệu máy chủ
 * (kết nối, phòng, RAM, lệnh chậm, số lệnh theo loại). Nạp sau tour.js, cắm trang 'admin' vào window.CaroTourKit.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc, D, when, setTitle, fmtIcon, metaHtml } = K;

  /** Số liệu máy chủ (chỉ quản trị viên): kết nối, phòng, RAM, lệnh chậm, số lệnh theo loại. */
  function statsHtml() {
    const s = D.stats;
    if (!s) return '';
    const up = s.uptime >= 86400 ? Math.floor(s.uptime / 86400) + 'd ' : '';
    const hms = new Date((s.uptime % 86400) * 1000).toISOString().slice(11, 19);
    const cell = (v, k) => `<div><b>${esc(String(v))}</b><small>${esc(T(k))}</small></div>`;
    return `<details class="adm-stats" open><summary><b>${esc(T('adm_stats'))}</b> <small>${esc(up + hms)}</small>
        <button type="button" class="ghost sm" data-act="adminStats">${esc(T('adm_refresh'))}</button></summary>
      <div class="pf-stats">${cell(s.conns, 'adm_conns')}${cell(s.online, 'adm_online')}${cell(s.rooms + ' / ' + s.active, 'adm_rooms')}
        ${cell(s.watchers, 'adm_watchers')}${cell(s.queue, 'adm_queue')}${cell(s.users, 'adm_users')}
        ${cell(s.mem.rss + ' MB', 'adm_rss')}${cell(s.mem.heap + ' / ' + s.mem.heapTotal + ' MB', 'adm_heap')}</div>
      <h4>${esc(T('adm_slow'))}</h4>
      ${s.slow.length ? `<ul class="adm-list">${s.slow.slice(0, 15).map((x) => `<li><code>${esc(x.t)}</code> <b>${x.ms} ms</b> <small>${esc(when(x.at))}</small></li>`).join('')}</ul>` : `<p class="hint">${esc(T('adm_none'))}</p>`}
      <h4>${esc(T('adm_count'))}</h4>
      <ul class="adm-list adm-count">${s.count.map(([k, n]) => `<li><code>${esc(k)}</code> ${n}${s.crash[k] ? ` <span class="loss">⚠ ${s.crash[k]}</span>` : ''}</li>`).join('')}</ul>
    </details>`;
  }

  function pageAdmin() {
    setTitle('review_title');
    const q = D.queue;
    if (!q) return statsHtml() + `<p class="hint">…</p>`;
    if (!q.clubs.length && !q.tours.length) return statsHtml() + `<p class="hint">${esc(T('review_empty'))}</p>`;
    const item = (kind, x, body) => `<li class="rv"><div class="pn"><b>${esc(x.name)}</b><small>${esc(T('by_user', { name: x.owner.name, u: x.owner.username }))} · ${esc(when(x.created))}</small>${body}${x.desc ? `<p class="tdesc">${esc(x.desc)}</p>` : ''}</div>
      <div class="row"><button type="button" class="ghost sm danger" data-act="review" data-kind="${kind}" data-id="${esc(x.id)}" data-v="0">${esc(T('reject'))}</button>
      <button type="button" class="primary sm" data-act="review" data-kind="${kind}" data-id="${esc(x.id)}" data-v="1">${esc(T('approve'))}</button></div></li>`;
    let html = '';
    if (q.tours.length) html += `<h4>${esc(T('tours_title'))}</h4><ul class="tlist">${q.tours.map((t) => item('tour', t, `<small>${fmtIcon(t.format)} ${metaHtml(t)}</small><small>${esc(when(t.startsAt))}${t.club ? ' · ' + esc(t.club.name) : ''} · ${esc(T('acc_' + t.access))}</small>`)).join('')}</ul>`;
    html = statsHtml() + html;
    if (q.clubs.length) html += `<h4>${esc(T('clubs_title'))}</h4><ul class="tlist">${q.clubs.map((c) => item('club', c, `<small>${esc(T('join_' + c.join))}</small>`)).join('')}</ul>`;
    return html;
  }

  K.pages.admin = pageAdmin;
})();
