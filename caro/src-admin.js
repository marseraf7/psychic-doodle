/*
 * Nguồn người chơi – bảng cho quản trị viên (hàng "Nguồn người chơi" ở tab Xem thêm, chỉ hiện với quản trị viên):
 * 30 ngày gần nhất theo nguồn lần đầu (web, pwa, app, desktop, telegram, vk, crazygames, itch…): người mới, D1, D7, số ván
 * online mỗi người mới; mã giới thiệu ?ref= hay gặp; bảng theo ngày (nguồn của lần vào). Máy chủ: server/src/hub/sources.js
 * (tin srcStats – requireAdmin). Nguồn do src-track.js gửi kèm hello.
 */
(function () {
  'use strict';
  const F = window.CaroFeat;
  const N = window.CaroOnline;
  if (!N || !F) return;
  const T = window.I18N.t;
  const esc = F.esc;
  const dlg = F.dialog('src-dlg', 'src_title', 'users');
  const body = dlg.body;
  let data = null;

  const isAdmin = () => !!(N.state.me && N.state.me.admin);
  function ensureRow() { if (isAdmin()) F.row('more-sources', 'src_title', 'users', open, { online: true }); }
  N.on('welcome', ensureRow);
  N.on('me', ensureRow);

  function open() { dlg.open(); body.innerHTML = '<p class="hint">…</p>'; N.send({ t: 'srcStats', days: 30 }); }
  N.on('srcStats', (m) => { data = m; if (dlg.isOpen()) render(); });

  const pct = (x) => (x && x.n ? Math.round((x.back / x.n) * 100) + '%' : T('src_na'));
  const cell = (v) => `<td><span>${esc(v)}</span></td>`;
  const head = (keys) => `<thead><tr>${keys.map((k) => `<th scope="col"><span>${esc(T(k))}</span></th>`).join('')}</tr></thead>`;

  function render() {
    const d = data || {};
    const src = d.sources || [];
    if (!src.length && !(d.daily || []).length) { body.innerHTML = `<p class="hint">${esc(T('src_hint', { n: d.days || 30 }))}</p><p class="hint">${esc(T('src_empty'))}</p>`; return; }
    const rows = src.map((s) => `<tr>${cell(s.src)}${cell(s.new)}${cell(pct(s.d1))}${cell(pct(s.d7))}${cell(s.new ? (s.games / s.new).toFixed(1) : T('src_na'))}</tr>`).join('');
    // Theo ngày: cộng các nguồn của cùng ngày
    const days = new Map();
    for (const r of d.daily || []) {
      const x = days.get(r.day) || { new: 0, active: 0, games: 0 };
      x.new += r.new; x.active += r.active; x.games += r.games;
      days.set(r.day, x);
    }
    const dayRows = [...days].slice(0, 30).map(([day, x]) => `<tr>${cell(day)}${cell(x.new)}${cell(x.active)}${cell(x.games)}</tr>`).join('');
    const refs = (d.refs || []).map((r) => `<li><code>${esc(r.ref)}</code> <small>${esc(r.src)}</small> <b>${esc(r.n)}</b></li>`).join('');
    body.innerHTML = `<p class="hint">${esc(T('src_hint', { n: d.days || 30 }))}</p>
      <div class="src-wrap"><table class="src-table">${head(['src_col', 'src_new', 'src_d1', 'src_d7', 'src_gpu'])}<tbody>${rows}</tbody></table></div>
      ${refs ? `<h4>${esc(T('src_refs'))}</h4><ul class="adm-list">${refs}</ul>` : ''}
      ${dayRows ? `<h4>${esc(T('src_daily'))}</h4><div class="src-wrap"><table class="src-table">${head(['src_day', 'src_new', 'src_active', 'src_games'])}<tbody>${dayRows}</tbody></table></div>` : ''}`;
  }

  window.addEventListener('langchange', () => { if (dlg.isOpen() && data) render(); });
  window.CaroSrcAdmin = { open, render: () => render() };
})();
