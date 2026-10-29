/*
 * Trang nhúng (embed.html) – tải /api/tour/<mã>.json, vẽ nhánh đấu / bảng xếp hạng / người chơi bằng các module của
 * trang giải, tự tải lại mỗi 20 giây khi trang đang hiện và giải chưa xong (máy chủ giữ bản dựng 10 giây – nhiều trang
 * nhúng cùng giải chỉ tốn một lần dựng). Bấm vào giải / ván thì mở app ở thẻ mới.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const { T, esc, D } = K;
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const id = (q.get('t') || '').replace(/[^0-9a-f]/g, '').slice(0, 20);
  const view = ['bracket', 'standings', 'players'].includes(q.get('view')) ? q.get('view') : 'bracket';
  const EVERY = 20000;
  let timer = 0, failed = 0, last = '';

  function body(t) {
    if (view === 'players') return K.playerList(t);
    if (t.format === 'arena') return K.standings(t) + (view === 'bracket' && t.games && t.games.length ? K.recentGames(t) : '');
    if (view === 'standings') {
      const out = t.podium && t.podium.length && t.status === 'finished'
        ? `<div class="podium">${t.podium.map((p, i) => `<div class="pl p${i + 1}"><span>${K.icon('medal', 'm' + (i + 1))}</span><b>${esc(p.name)}</b></div>`).join('')}</div>` : '';
      return out + K.statsHtml(t) + K.playerList(t);
    }
    return K.statsHtml(t) + K.stagesHtml(t);
  }
  function render() {
    const t = D.tour;
    const main = $('embed');
    $('em-title').textContent = t.name;
    document.title = t.name + ' – Caro x Gomoku';
    const open = $('em-open');
    open.href = new URL(t.url, location.origin).toString();
    open.textContent = T('embed_open');
    // Giữ chỗ đang cuộn ngang của từng nhánh đấu qua lần vẽ lại
    const keep = [...main.querySelectorAll('.bracket')].map((b) => b.scrollLeft);
    main.innerHTML = body(t);
    main.querySelectorAll('.bracket').forEach((b, i) => { if (keep[i]) b.scrollLeft = keep[i]; });
    main.querySelectorAll('details.fold').forEach((d) => {
      d.ontoggle = () => {
        D.open[d.dataset.k] = d.open;
        if (d.open && d.dataset.lazy) render(); // khối chỉ dựng nội dung khi mở
      };
    });
    for (const f of K.binders) f(main);
    stamp();
  }
  const stamp = () => { $('em-foot').textContent = T('embed_updated', { t: new Intl.DateTimeFormat(document.documentElement.lang || 'vi', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(Date.now()) }); };
  async function load() {
    clearTimeout(timer);
    try {
      const r = await fetch(`/api/tour/${id}.json`, { cache: 'no-cache' });
      if (r.status === 404) { $('embed').innerHTML = `<p class="hint">${esc(T('embed_not_found'))}</p>`; return; }
      if (!r.ok) throw new Error(String(r.status));
      const t = await r.json();
      failed = 0;
      // Không có gì mới (chỉ đổi giờ máy chủ / ai đang online): giữ nguyên trang – không mất chỗ đang cuộn
      const sig = JSON.stringify({ ...t, now: 0 });
      if (sig !== last) { last = sig; D.tour = t; render(); } else stamp();
      if (['finished', 'cancelled'].includes(D.tour.status)) return; // giải đã xong: không tải lại nữa
    } catch (e) {
      failed++;
      $('em-foot').textContent = T('embed_retry');
    }
    timer = setTimeout(tick, EVERY * Math.min(4, 1 + failed));
  }
  // Trang nhúng bị ẩn (cuộn khuất / thẻ nền): không tải; hiện lại thì tải ngay
  const tick = () => { if (document.visibilityState === 'visible') load(); else timer = 0; };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !timer && D.tour && !['finished', 'cancelled'].includes(D.tour.status)) load(); });

  // Bấm vào ván / người chơi / trận đang đấu: mở app ở thẻ mới (trang nhúng không chơi / xem trực tiếp được)
  $('embed').addEventListener('click', (e) => {
    const a = e.target.closest('a[href="#"], [data-share], [data-watch]');
    if (!a) return;
    e.preventDefault();
    const u = new URL('/', location.origin);
    if (a.dataset.share) u.searchParams.set('replay', a.dataset.share);
    else u.searchParams.set('t', id);
    window.open(u.toString(), '_blank', 'noopener');
  });

  window.I18N.apply();
  document.title = 'Caro x Gomoku';
  if (!id) $('embed').innerHTML = `<p class="hint">${esc(T('embed_not_found'))}</p>`;
  else { $('embed').innerHTML = `<p class="hint">${esc(T('embed_loading'))}</p>`; load(); }
})();
