/*
 * Thống kê cá nhân (hộp "Thống kê" – mở từ hồ sơ người chơi hoặc tab Xem thêm):
 *   thắng / hoà / thua theo màu quân (X / O), luật, loại thời gian, sức đối thủ, khai cuộc (4 nước đầu, chuẩn hoá xoay / lật),
 *   độ dài ván; độ chính xác theo thời gian + kiểu lỗi hay gặp (chỉ các ván đã phân tích – insights-an.js) và nút
 *   "Phân tích N ván gần nhất" (chạy nền, huỷ được).
 * Tài khoản: máy chủ gom (server/src/hub/insights.js, theo quyền xem Lịch sử đấu). Khách / offline: tính trên máy từ Lịch sử
 * đấu trên máy (local-games.js). Phần tính chung: insights-core.js. Biểu đồ: feat-dlg.js (CaroFeat.bars / line).
 * API: window.CaroInsights = { open(uid?) }
 */
(function () {
  'use strict';
  const F = window.CaroFeat, IC = window.CaroInsightsCore, AN = window.CaroInsightsAn;
  const N = window.CaroOnline;
  const T = window.I18N.t;
  const esc = F.esc;
  const dlg = F.dialog('insights-dlg', 'ins_title', 'analyze');
  const body = dlg.body;
  let cur = null; // { owner, data, games, recent, local }
  let prog = null; // tiến độ phân tích hàng loạt { done, total, f }

  const signed = () => !!(N && N.state && N.state.me && !N.state.me.guest);

  function open(uid) {
    cur = null;
    prog = AN.running ? prog : null;
    dlg.open();
    if (N && N.connected && (uid || signed())) {
      body.innerHTML = '<p class="hint">…</p>';
      N.send(uid ? { t: 'insights', uid } : { t: 'insights' });
    } else {
      cur = localData();
      render();
    }
  }
  if (N) N.on('insights', (m) => { if (!dlg.isOpen()) return; cur = m; render(); });

  /** Loại thời gian của ván lưu trên máy (cùng cách chia với máy chủ – rating.js poolOf); không giới hạn giờ → 'none'. */
  function poolOf(g) {
    if (g.clock) return window.I18N.poolOfClock(g.clock);
    const t = Number(g.timeLimit) || 0;
    return !t ? 'none' : t <= 10 ? 'blitz' : 'rapid';
  }

  /** Thống kê từ Lịch sử đấu trên máy (khách, chơi với máy, offline). */
  function localData() {
    const H = window.CaroLocalHist;
    const games = [], an = [];
    for (const meta of H ? H.store.list() : []) {
      if (![1, 2].includes(meta.me)) continue; // 2 người chung máy: không có "mình"
      const g = H.store.get(meta.id);
      if (!g) continue;
      const res = g.winner === 3 ? 'draw' : g.winner === g.me ? 'win' : 'loss';
      games.push({ at: g.at, rule: g.rule, pool: poolOf(g), side: g.me, res, moves: g.moves, band: 'unknown' });
      const s = (g.analysis && IC.anSummary(g.analysis)) || AN.get(IC.hash(g.moves));
      if (s) an.push({ at: g.at, side: g.me, s });
    }
    const recent = games.slice(0, 20).map((g) => ({ side: g.side, rule: g.rule, at: g.at, moves: g.moves }));
    return { owner: { self: true, local: true }, data: IC.aggregate(games), an: IC.anAggregate(an), recent };
  }

  /** Kết quả phân tích của các ván máy chủ gửi về (khớp theo mã nước đi với kết quả lưu trên máy). */
  function anOf(m) {
    if (m.an) return m.an;
    const list = [];
    for (const [h, side, at] of m.games || []) { const s = AN.get(h); if (s) list.push({ at, side, s }); }
    return IC.anAggregate(list);
  }

  const RULE_KEY = { vn: 'grule_s_vn', free: 'grule_s_free', std: 'grule_s_std', renju: 'grule_s_renju' };
  const ruleName = (r) => T(RULE_KEY[r] || 'grule_s_vn');
  const poolName = (p) => (p === 'none' ? T('time_off') : T('pool_' + p));

  /** Hình khai cuộc nhỏ (thế chuẩn hoá): lưới 5 × 5 quanh các quân. */
  function shape(cells) {
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const span = Math.max(4, Math.max(...xs) - x0, Math.max(...ys) - y0);
    const S = 10, size = (span + 1) * S;
    let g = '';
    for (let i = 0; i <= span; i++) g += `<line x1="${S / 2}" x2="${size - S / 2}" y1="${i * S + S / 2}" y2="${i * S + S / 2}"/><line y1="${S / 2}" y2="${size - S / 2}" x1="${i * S + S / 2}" x2="${i * S + S / 2}"/>`;
    const st = cells.map(([x, y, p], i) => `<circle class="${p === 1 ? 'sx' : 'so'}" cx="${(x - x0) * S + S / 2}" cy="${(y - y0) * S + S / 2}" r="4"><title>${i + 1}</title></circle>`).join('');
    return `<svg class="ins-shape" viewBox="0 0 ${size} ${size}" aria-hidden="true"><g class="gl">${g}</g>${st}</svg>`;
  }

  const section = (key, html) => `<h3>${esc(T(key))}</h3>${html}`;
  const rows = (obj, order, label) => order.filter((k) => obj[k]).map((k) => ({ label: label(k), ...obj[k] }));

  function anHtml(m) {
    if (!m.owner.self) return section('ins_acc', `<p class="hint">${esc(T('ins_acc_self'))}</p>`);
    const a = anOf(m);
    const recent = m.recent || [];
    const left = recent.filter((g) => !AN.get(IC.hash(g.moves))).length;
    let btn = '';
    if (AN.running) {
      const p = prog || { done: 0, total: left, f: 0 };
      btn = `<p class="hint" role="status">${esc(T('ins_batch_run', { done: Math.min(p.total, p.done + 1), total: p.total, p: Math.round((p.f || 0) * 100) }))}</p>
        <button type="button" class="ghost sm" data-ins="stop">${esc(T('ins_batch_stop'))}</button>`;
    } else if (left) btn = `<button type="button" class="primary sm" data-ins="batch">${F.ico('analyze')} ${esc(T('ins_batch', { n: left }))}</button>`;
    const mist = IC.MIST.map((k) => `<div><b>${a.mist[k]}</b><small>${esc(T('cls_' + k))}</small></div>`).join('');
    const ph = ['ins_ph_open', 'ins_ph_mid', 'ins_ph_end'].map((k, i) => `<div><b>${a.ph[i]}</b><small>${esc(T(k))}</small></div>`).join('');
    const body = a.n ? `<p class="hint">${esc(T('ins_acc_n', { n: a.n, a: a.avg }))}</p>
      ${F.line(a.trend, { label: T('ins_acc') })}
      <h4>${esc(T('ins_mist'))}</h4><div class="pf-stats ins-4">${mist}</div>
      ${a.top ? `<p class="hint">${esc(T('ins_mist_top', { k: T('cls_' + a.top) }))}</p>` : ''}
      <h4>${esc(T('ins_phase'))}</h4><div class="pf-stats">${ph}</div>` : `<p class="hint">${esc(T('ins_acc_none'))}</p>`;
    return section('ins_acc', body + `<div class="row ins-act">${btn}</div>`);
  }

  function render() {
    if (!cur) return;
    const m = cur;
    if (m.hidden) { body.innerHTML = `<p class="hint">${esc(T('ins_hidden', { name: m.owner.name || '' }))}</p>`; return; }
    const d = m.data;
    const who = m.owner.local ? T('ins_local') : m.owner.self ? T('ins_mine') : T('ins_of', { name: m.owner.name });
    if (!d || !d.n) { body.innerHTML = `<p class="ins-who">${esc(who)}</p><p class="hint">${esc(T('ins_empty'))}</p>`; return; }
    const tot = d.total;
    const ops = d.openings.map((o) => `<li>${shape(o.cells)}<span class="ins-op"><b class="ellip">${esc(ruleName(o.rule))} · ${esc(T('ins_op_x', { n: o.x, t: o.w + o.d + o.l }))}</b>
      <small class="ellip">${esc(T('ins_wdl', { w: o.w, d: o.d, l: o.l }))} · ${IC.score(o)}%</small></span></li>`).join('');
    body.innerHTML = `<p class="ins-who">${esc(who)}</p>
      <div class="pf-stats"><div><b>${d.n}</b><small>${esc(T('profile_games'))}</small></div>
        <div><b class="win">${tot.w}</b><small>${esc(T('res_win'))}</small></div>
        <div><b>${tot.d}</b><small>${esc(T('res_draw'))}</small></div><div><b class="loss">${tot.l}</b><small>${esc(T('res_loss'))}</small></div>
        <div><b>${IC.score(tot)}%</b><small>${esc(T('ins_score'))}</small></div></div>
      <p class="hint">${esc(T('ins_note', { n: d.n }))}</p>
      ${section('ins_color', F.bars(rows(d.color, [1, 2], (k) => T(k === 1 ? 'ins_as_x' : 'ins_as_o')), { label: T('ins_color') }))}
      ${section('ins_rule', F.bars(rows(d.rule, IC.RULES, ruleName), { label: T('ins_rule') }))}
      ${section('ins_pool', F.bars(rows(d.pool, IC.POOLS, poolName), { label: T('ins_pool') }))}
      ${section('ins_band', F.bars(rows(d.band, IC.BANDS, (k) => T('ins_b_' + k)), { label: T('ins_band') }))}
      ${section('ins_len', F.bars(rows(d.len, IC.LENS, (k) => T('ins_' + k)), { label: T('ins_len') }))}
      ${section('ins_open', ops ? `<p class="hint">${esc(T('ins_open_hint', { k: IC.OPEN_K }))}</p><ul class="ins-ops">${ops}</ul>` : `<p class="hint">${esc(T('ins_none'))}</p>`)}
      ${anHtml(m)}`;
  }

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ins]');
    if (!b || !cur) return;
    if (b.dataset.ins === 'stop') { AN.cancel(); prog = null; render(); return; }
    if (b.dataset.ins !== 'batch' || AN.running) return;
    const games = (cur.recent || []).map((g) => ({ moves: g.moves, rule: g.rule }));
    prog = { done: 0, total: games.filter((g) => !AN.get(IC.hash(g.moves))).length, f: 0 };
    const p = AN.batch(games, (done, total, f) => { prog = { done, total, f }; if (dlg.isOpen()) render(); });
    render();
    await p;
    prog = null;
    if (cur && cur.owner.local) cur = localData();
    if (dlg.isOpen()) render();
  });

  window.addEventListener('langchange', () => { if (dlg.isOpen()) render(); });
  F.row('more-insights', 'ins_title', 'analyze', () => open());
  window.CaroInsights = { open };
})();
