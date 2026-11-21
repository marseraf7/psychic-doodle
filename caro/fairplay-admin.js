/*
 * Soát chơi đẹp – trang quản trị (chỉ quản trị viên; hàng "Soát chơi đẹp" ở tab Xem thêm): hàng chờ ván cần xem (rời tab
 * nhiều, bàn đầu của giải, bị báo cáo gian lận) với số lần / thời gian rời tab của từng bên; nút "So với máy cờ" phân tích ván
 * ngay trên trình duyệt này (an-pool.js + analysis.js, mức nhẹ) rồi gửi kết quả về máy chủ (tỉ lệ trùng nước máy cờ, mức tụt
 * trung bình, độ chính xác – fairplay-core.js stats); Xem lại, Đã xem, Bỏ qua. KHÔNG có nút xử phạt: quản trị viên tự quyết
 * (khoá / cấm qua các công cụ sẵn có). Máy chủ: server/src/hub/fairplay.js.
 */
(function () {
  'use strict';
  const F = window.CaroFeat, FC = window.CaroFairCore;
  const N = window.CaroOnline;
  if (!N || !FC) return;
  const T = window.I18N.t;
  const esc = F.esc;
  const dlg = F.dialog('fp-dlg', 'fp_title', 'shield');
  const body = dlg.body;
  let status = 'open', items = [], busy = null, openN = 0;

  const isAdmin = () => !!(N.state.me && N.state.me.admin);
  function ensureRow() { if (isAdmin()) F.row('more-fairplay', 'fp_title', 'shield', open, { online: true }); }
  N.on('welcome', ensureRow);
  N.on('me', ensureRow);

  function open() { dlg.open(); load(); }
  function load() { body.innerHTML = '<p class="hint">…</p>'; N.send({ t: 'fpQueue', status }); }
  N.on('fpQueue', (m) => { items = m.items || []; openN = m.open || 0; if (dlg.isOpen()) render(); });
  N.on('fpSaved', (m) => {
    const it = items.find((x) => x.id === m.id);
    if (it && m.stats) it.stats = m.stats;
    if (it && m.status) it.status = m.status;
    if (dlg.isOpen()) render();
  });

  const date = (ms) => { try { return new Date(ms).toLocaleString(); } catch (e) { return ''; } };
  const sec = (ms) => Math.round((ms || 0) / 1000);
  function side(it, s) {
    const name = (s === 1 ? it.x_name : it.o_name) || T('deleted_player');
    const n = s === 1 ? it.x_n : it.o_n, ms = s === 1 ? it.x_ms : it.o_ms;
    const st = it.stats && it.stats[s];
    return `<small class="fp-side"><b>${s === 1 ? 'X' : 'O'} · ${esc(name)}</b> · ${esc(T('fp_blur', { n: n || 0, s: sec(ms) }))}${st ? ' · ' + esc(T('fp_stats', { m: st.match, l: st.loss, a: st.acc, n: st.n })) : ''}</small>`;
  }

  function render() {
    const tabs = ['open', 'reviewed', 'dismissed', 'all'].map((k) => `<button type="button" class="ghost sm${k === status ? ' on' : ''}" data-fps="${k}" aria-pressed="${k === status}">${esc(T('fp_st_' + k))}</button>`).join('');
    const rows = items.map((it) => `<li class="fp-item"><div class="fp-main">
        <b>${esc(it.x_name || T('deleted_player'))} – ${esc(it.o_name || T('deleted_player'))}</b>
        <small>${esc(date(it.created))} · ${esc(T('n_moves', { n: it.n || 0 }))} · ${it.why.split(',').map((w) => `<span class="feat-tag down">${esc(T('fp_why_' + w))}</span>`).join(' ')}
          ${it.status !== 'open' ? ` · <span class="feat-tag">${esc(T('fp_st_' + it.status))}</span>` : ''}</small>
        ${side(it, 1)}${side(it, 2)}</div>
        <div class="row fp-act">
          <button type="button" class="ghost sm" data-fpr="${esc(it.share)}">${esc(T('replay'))}</button>
          <button type="button" class="primary sm" data-fpa="${it.id}"${busy ? ' disabled' : ''}>${esc(busy === it.id ? T('fp_running') : T('fp_analyze'))}</button>
          ${it.status === 'open' ? `<button type="button" class="ghost sm" data-fpm="reviewed" data-id="${it.id}">${esc(T('fp_mark_reviewed'))}</button>
          <button type="button" class="ghost sm" data-fpm="dismissed" data-id="${it.id}">${esc(T('fp_mark_dismissed'))}</button>` : ''}
        </div></li>`).join('');
    body.innerHTML = `<p class="hint">${esc(T('fp_hint'))}</p>
      <div class="row lad-tabs" role="group">${tabs}</div>
      <p class="hint">${esc(T('fp_open_n', { n: openN }))}</p>
      ${rows ? `<ul class="fp-list">${rows}</ul>` : `<p class="hint">${esc(T('fp_empty'))}</p>`}`;
  }

  /** So ván với máy cờ ngay trên trình duyệt này (nhẹ: 40% thời gian lượt kỹ), gửi kết quả về máy chủ. */
  async function analyze(it) {
    const A = window.CaroAnalysis, Pool = window.CaroAnPool;
    const data = await N.fetchReplay(it.share);
    if (!data || data === 'missing' || !Array.isArray(data.moves)) { N.toast(T('replay_not_found')); return; }
    busy = it.id;
    render();
    try {
      const rule = data.rule || 'vn';
      const ms = Math.max(30, Math.round(A.fullMs(data.moves.length) * 0.4));
      const evals = Pool ? await Pool.evaluate({ moves: data.moves, rule, ms }) : null;
      const res = A.analyzeGame(data.moves, { rule, ms: evals ? ms : 20, evals: evals || undefined });
      const stats = FC.stats(data.moves, res);
      N.send({ t: 'fpResult', id: it.id, stats: { ...stats, engine: evals ? 'pool' : 'main' } });
    } finally {
      busy = null;
      if (dlg.isOpen()) render();
    }
  }

  body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.fps) { status = b.dataset.fps; load(); return; }
    if (b.dataset.fpr) { dlg.close(); N.openReplay(b.dataset.fpr); return; }
    if (b.dataset.fpa) { const it = items.find((x) => x.id === +b.dataset.fpa); if (it && !busy) analyze(it); return; }
    if (b.dataset.fpm) N.send({ t: 'fpMark', id: +b.dataset.id, status: b.dataset.fpm });
  });

  window.addEventListener('langchange', () => { if (dlg.isOpen()) render(); });
  window.CaroFairAdmin = { open };
})();
