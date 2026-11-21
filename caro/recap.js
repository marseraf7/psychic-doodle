/*
 * Tổng kết tháng / năm (hộp "Tổng kết" – tab Xem thêm): số ván, thắng / hoà / thua, luật và loại thời gian chơi nhiều nhất,
 * thắng đẹp nhất (đối thủ điểm cao nhất), chuỗi thắng dài nhất, đối thủ gặp nhiều nhất (chỉ khi cả hai công khai lịch sử
 * đấu), số ngày có chơi, giải đố đã giải và kỷ lục Storm (lưu trên máy này). Thẻ PNG để chia sẻ (vẽ canvas như share.js).
 * Tài khoản: máy chủ tính (server/src/hub/recap.js). Khách: tính trên máy từ Lịch sử đấu trên máy (recap-core.js).
 * API: window.CaroRecap = { open(kind?), card() → Promise<Blob> }
 */
(function () {
  'use strict';
  const F = window.CaroFeat, RC = window.CaroRecapCore;
  const N = window.CaroOnline;
  const T = window.I18N.t;
  const esc = F.esc;
  const dlg = F.dialog('recap-dlg', 'rc_title', 'star');
  const body = dlg.body;
  const per = { kind: 'month', ...RC.localMonth(Date.now()) }; // kỳ theo múi giờ thiết bị (recap-core.js)
  let data = null, lastReq = 0, reqTimer = 0;

  const signed = () => !!(N && N.connected && N.state.me && !N.state.me.guest);
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } };
  /** Giải đố đã giải, kỷ lục Storm (lưu trên máy – puzzles.js, storm.js). */
  const local = () => ({ pz: +read('caro.puzzles').ok || 0, storm: +read('caro.storm').best || 0 });

  function label() {
    const loc = { vi: 'vi-VN', en: 'en-US', ru: 'ru-RU', zh: 'zh-CN' }[window.I18N.lang];
    try {
      return per.kind === 'year' ? T('rc_year', { y: per.y }) : new Date(per.y, per.m - 1, 1).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
    } catch (e) { return per.m + '/' + per.y; }
  }

  function load() {
    data = null;
    const { from, to } = RC.range(per.kind, per.y, per.m);
    if (signed()) {
      render();
      // Máy chủ nhận tối đa 1 lần / giây: bấm đổi kỳ nhanh thì chỉ gửi kỳ cuối cùng. Gửi kỳ (kind, y, m): máy chủ tự tính theo
      // múi giờ thiết bị đã lưu của tài khoản (đúng giờ mùa hè); from / to cho máy chủ bản cũ
      clearTimeout(reqTimer);
      const ask = { t: 'recap', kind: per.kind, y: per.y, m: per.kind === 'month' ? per.m : undefined, from, to };
      reqTimer = setTimeout(() => { lastReq = Date.now(); N.send(ask); }, Math.max(0, lastReq + 1100 - Date.now()));
      return;
    }
    // Khách / offline: ván lưu trên máy
    const H = window.CaroLocalHist;
    const games = (H ? H.store.list() : []).filter((g) => [1, 2].includes(g.me) && g.at >= from && g.at < to)
      .map((g) => ({ at: g.at, rule: g.rule, pool: g.clock ? window.I18N.poolOfClock(g.clock) : null, res: g.winner === 3 ? 'draw' : g.winner === g.me ? 'win' : 'loss', opp: null }));
    data = RC.summarize(games);
    render();
  }
  // Trả lời của kỳ đã bỏ qua (bấm đổi kỳ trong lúc chờ): không hiện nhầm
  const stale = (m) => m.kind && (m.kind !== per.kind || m.y !== per.y || (per.kind === 'month' && m.m !== per.m));
  if (N) N.on('recap', (m) => { if (stale(m)) return; data = m.data; if (dlg.isOpen()) render(); });

  function open(kind) {
    if (kind === 'year' || kind === 'month') per.kind = kind;
    dlg.open();
    load();
  }

  // Đối thủ để lịch sử đấu riêng tư: máy chủ không gửi tên (recap-core.js) – chỉ ghi điểm
  const bestText = (b) => (b.name ? T('rc_best', { name: b.name, r: b.r }) : T('rc_best_anon', { r: b.r }));
  const tile = (big, small) => `<div><b>${esc(big)}</b><small>${esc(small)}</small></div>`;
  function render() {
    const tabs = ['month', 'year'].map((k) => `<button type="button" class="ghost sm${per.kind === k ? ' on' : ''}" data-rk="${k}" aria-pressed="${per.kind === k}">${esc(T('rc_t_' + k))}</button>`).join('');
    const nav = `<div class="row rc-nav"><button type="button" class="ghost sm" data-rn="-1" aria-label="${esc(T('rc_prev'))}">‹</button>
      <b class="rc-period">${esc(label())}</b><button type="button" class="ghost sm" data-rn="1" aria-label="${esc(T('rc_next'))}">›</button></div>`;
    if (!data) { body.innerHTML = `<div class="row lad-tabs">${tabs}</div>${nav}<p class="hint">…</p>`; return; }
    const d = data, L = local();
    const facts = [];
    if (d.rule) facts.push(`<li>${esc(T('rc_fav_rule', { rule: T('grule_s_' + d.rule.k), n: d.rule.n }))}</li>`);
    if (d.pool) facts.push(`<li>${esc(T('rc_fav_pool', { pool: T('pool_' + d.pool.k), n: d.pool.n }))}</li>`);
    if (d.best) facts.push(`<li>${esc(bestText(d.best))}</li>`);
    if (d.opp) facts.push(`<li>${esc(T('rc_opp', { name: d.opp.name, n: d.opp.n }))}</li>`);
    body.innerHTML = `<div class="row lad-tabs">${tabs}</div>${nav}
      ${d.n ? '' : `<p class="hint">${esc(T('rc_empty'))}</p>`}
      <div class="pf-stats">${tile(d.n, T('profile_games'))}${tile(d.w, T('res_win'))}${tile(d.d + ' / ' + d.l, T('rc_dl'))}
        ${tile(d.streak, T('rc_streak'))}${tile(d.days, T('rc_days'))}${tile(L.pz, T('rc_pz'))}${tile(L.storm, T('rc_storm'))}</div>
      ${facts.length ? `<ul class="lg-rules rc-facts">${facts.join('')}</ul>` : ''}
      <p class="hint">${esc(T(signed() ? 'rc_note' : 'rc_note_local'))}</p>
      <div class="row"><button type="button" class="primary" data-rpng>${F.ico('image')} ${esc(T('rc_share'))}</button></div>`;
  }

  // ---------------------------------------------------------------- Thẻ PNG (1080 × 1350, hợp đăng mạng xã hội)
  function card() {
    const d = data || RC.summarize([]), L = local();
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const cs = getComputedStyle(document.documentElement);
    const v = (k, def) => cs.getPropertyValue('--' + k).trim() || def;
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1d2b53'); grad.addColorStop(1, '#7e2553');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const font = (px, w) => `${w || 600} ${px}px "Noto Sans", system-ui, sans-serif`;
    const fit = (s, max) => { s = String(s); while (s.length > 1 && g.measureText(s).width > max) s = s.slice(0, -2) + '…'; return s; };
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = font(44); g.fillText(fit(T('app_title'), W - 120), W / 2, 110);
    g.font = font(72, 800); g.fillText(fit(T('rc_title') + ' · ' + label(), W - 100), W / 2, 220);
    const name = N && N.state.me ? N.state.me.name : '';
    if (name) { g.font = font(40, 500); g.fillText(fit(name, W - 160), W / 2, 285); }
    const tiles = [[d.n, T('profile_games')], [d.w, T('res_win')], [d.streak, T('rc_streak')], [d.days, T('rc_days')], [L.pz, T('rc_pz')], [L.storm, T('rc_storm')]];
    tiles.forEach(([big, small], i) => {
      const x = 90 + (i % 2) * 460, y = 360 + Math.floor(i / 2) * 230;
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, 440, 200);
      g.fillStyle = v('accent', '#ffcc00'); g.font = font(96, 800); g.fillText(String(big), x + 220, y + 115);
      g.fillStyle = '#fff'; g.font = font(34, 500); g.fillText(fit(small, 400), x + 220, y + 170);
    });
    g.textAlign = 'left'; g.font = font(36, 500);
    const lines = [];
    if (d.rule) lines.push(T('rc_fav_rule', { rule: T('grule_s_' + d.rule.k), n: d.rule.n }));
    if (d.best) lines.push(bestText(d.best));
    if (d.opp) lines.push(T('rc_opp', { name: d.opp.name, n: d.opp.n }));
    lines.slice(0, 3).forEach((s, i) => g.fillText(fit('• ' + s, W - 180), 90, 1100 + i * 60));
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }

  /** Gửi ảnh: bảng chia sẻ của máy (điện thoại / ứng dụng), không có thì tải file về. */
  async function share() {
    const blob = await card();
    const name = `caro-recap-${per.kind === 'year' ? per.y : per.y + '-' + String(per.m).padStart(2, '0')}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ files: [file], title: T('rc_title') }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rk) { per.kind = b.dataset.rk; load(); return; }
    if (b.dataset.rn) {
      const s = +b.dataset.rn;
      if (per.kind === 'year') per.y += s;
      else { per.m += s; if (per.m < 1) { per.m = 12; per.y--; } else if (per.m > 12) { per.m = 1; per.y++; } }
      load();
      return;
    }
    if (b.hasAttribute('data-rpng')) share();
  });

  window.addEventListener('langchange', () => { if (dlg.isOpen()) render(); });
  F.row('more-recap', 'rc_title', 'star', () => open());
  window.CaroRecap = { open, card };
})();
