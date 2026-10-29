/*
 * Giải đấu – xem nhánh đấu (như Challonge): đường nối giữa các trận (SVG vẽ theo vị trí thật sau khi trang vẽ xong),
 * thanh công cụ phóng to / thu nhỏ / toàn màn hình / tải ảnh PNG (vẽ lại bằng canvas từ dữ liệu, không chụp DOM),
 * thanh tiến độ + thống kê giải (tính ở trình duyệt từ dữ liệu đã có – không thêm việc cho máy chủ).
 *   K.bracketTools(key) – thanh công cụ đặt trước một khối nhánh đấu; K.statsHtml(t) – tiến độ + thống kê.
 * Dùng ở trang giải và trang nhúng (embed.html). Nạp sau tour-stages.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc } = K;
  const Z = { scale: {} }; // mức phóng theo khối (giữ qua các lần vẽ lại)
  const icon = (n) => (K.icon ? K.icon(n) : '');
  // Có nút toàn màn hình không (kiểm một lần): trong iframe chưa được cho phép (Safari không có featurePolicy) thì không –
  // Safari ghi lỗi mỗi lần đọc fullscreenEnabled ở đó
  const canFull = (() => {
    try {
      if (window.self !== window.top && !(document.featurePolicy && document.featurePolicy.allowsFeature('fullscreen'))) return false;
      return !!document.fullscreenEnabled;
    } catch (e) { return false; }
  })();

  // ------------------------------------------------------------ Thống kê + tiến độ
  /** Mọi trận của các giai đoạn đã bốc thăm (bỏ trận miễn đấu / split / reset không đấu). */
  function matchesOf(t) {
    const out = [];
    const add = (l) => { for (const m of l || []) if (m && !m.bye && !m.skipped && !m.split) out.push(m); };
    for (const v of t.stageViews || []) {
      for (const r of v.rounds || []) add(r);
      for (const r of v.lrounds || []) add(r);
      add(v.gf);
      if (v.third) add([v.third]);
      for (const p of v.places || []) for (const r of p.rounds) add(r);
      for (const g of v.groups || []) for (const r of g.rounds) add(r);
    }
    return out;
  }
  K.statsHtml = (t) => {
    if (t.format !== 'bracket' || !t.stageViews || !t.stageViews.length) return '';
    const all = matchesOf(t); // gồm cả trận chưa rõ người (vòng sau): tiến độ tính trên cả giải
    if (!all.length) return '';
    const done = all.filter((m) => m.done);
    const pct = Math.round((done.length / all.length) * 100);
    const games = done.reduce((n, m) => n + (m.games ? m.games.length : 0) + (m.sets ? m.sets.length : 0), 0);
    const draws = done.filter((m) => m.draw).length, wo = done.filter((m) => m.walkover).length, live = all.filter((m) => m.live).length;
    const cell = (v, k) => `<div><b>${esc(String(v))}</b><small>${esc(T(k))}</small></div>`;
    return `<div class="t-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(T('st_progress'))}">
        <span style="width:${pct}%"></span><b>${pct}%</b></div>
      <div class="pf-stats t-stats">${cell(`${done.length}/${all.length}`, 'st_matches')}${cell(games, t.offline ? 'st_sets' : 'st_games')}${cell(live, 'st_live')}${cell(draws, 'st_draws')}${cell(wo, 'st_walkovers')}</div>`;
  };

  // ------------------------------------------------------------ Thanh công cụ nhánh đấu
  K.bracketTools = (key) => `<div class="b-tools" data-bkey="${esc(key)}">
      <button type="button" class="ghost sm icon" data-bz="-1" aria-label="${esc(T('bv_zoom_out'))}" title="${esc(T('bv_zoom_out'))}">−</button>
      <button type="button" class="ghost sm icon" data-bz="0" aria-label="${esc(T('bv_zoom_reset'))}" title="${esc(T('bv_zoom_reset'))}">100%</button>
      <button type="button" class="ghost sm icon" data-bz="1" aria-label="${esc(T('bv_zoom_in'))}" title="${esc(T('bv_zoom_in'))}">+</button>
      ${canFull ? `<button type="button" class="ghost sm" data-bfull>${icon('expand')}${esc(T('bv_full'))}</button>` : ''}
      <button type="button" class="ghost sm" data-bpng>${icon('image')}${esc(T('bv_png'))}</button>
    </div>`;

  /**
   * Đường nối: cột sau bằng nửa cột trước → trận i nối trận i/2; bằng nhau → i nối i (nhánh thua). Phóng to chỉ áp vào
   * các cột (CSS zoom) nên toạ độ đo trực tiếp trong khung cuộn của nhánh, không phải chia tỉ lệ.
   */
  function drawLines(br) {
    const old = br.querySelector(':scope > svg.b-lines');
    if (old) old.remove();
    if (!br.getClientRects().length) return; // đang ẩn (khối thu gọn): đo ra 0, bỏ qua
    const cols = [...br.querySelectorAll(':scope > .b-col')].map((c) => [...c.querySelectorAll(':scope > .b-match')]);
    if (cols.length < 2) return;
    const box = br.getBoundingClientRect();
    const pt = (el, right) => {
      const r = el.getBoundingClientRect();
      return [Math.round((right ? r.right : r.left) - box.left + br.scrollLeft), Math.round((r.top + r.bottom) / 2 - box.top + br.scrollTop)];
    };
    const paths = [];
    for (let c = 0; c + 1 < cols.length; c++) {
      const a = cols[c], b = cols[c + 1];
      const map = b.length * 2 === a.length ? (i) => i >> 1 : b.length === a.length ? (i) => i : null;
      if (!map) continue;
      a.forEach((m, i) => {
        const to = b[map(i)];
        if (!to) return;
        const [x1, y1] = pt(m, true), [x2, y2] = pt(to, false), mx = Math.round((x1 + x2) / 2);
        paths.push(`M${x1} ${y1}H${mx}V${y2}H${x2}`);
      });
    }
    if (!paths.length) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'b-lines');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', br.scrollWidth);
    svg.setAttribute('height', br.scrollHeight);
    svg.innerHTML = `<path d="${paths.join(' ')}"/>`;
    br.prepend(svg);
  }
  const redrawAll = (root) => (root || document).querySelectorAll('.b-wrap > .bracket').forEach(drawLines);

  // ------------------------------------------------------------ Ảnh PNG (canvas, từ dữ liệu trên trang)
  function png(br, title) {
    const cols = [...br.querySelectorAll(':scope > .b-col')].map((c) => ({
      head: (c.querySelector(':scope > h5') || {}).textContent || '',
      matches: [...c.querySelectorAll(':scope > .b-match')].map((m) => [...m.querySelectorAll('.b-p')].map((p) => ({
        name: (p.querySelector('.nm') || {}).textContent || '', score: (p.querySelector('b') || {}).textContent || '', win: p.classList.contains('win'),
      }))),
    }));
    if (!cols.length) return;
    const W = 200, H = 52, GX = 60, GY = 18, PAD = 30, TOP = 70;
    const rows = Math.max(...cols.map((c) => c.matches.length));
    const cw = PAD * 2 + cols.length * W + (cols.length - 1) * GX, ch = TOP + rows * (H + GY) + PAD;
    const cv = document.createElement('canvas');
    const dpr = 2;
    cv.width = cw * dpr; cv.height = ch * dpr;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#111'; g.font = 'bold 20px system-ui, sans-serif'; g.fillText(title, PAD, 34);
    const ys = cols.map((c) => c.matches.map((_, i) => TOP + ((i + 0.5) * rows / c.matches.length) * (H + GY) - H / 2));
    g.strokeStyle = '#9aa0a6'; g.lineWidth = 1.5;
    cols.forEach((c, ci) => {
      const x = PAD + ci * (W + GX);
      g.fillStyle = '#555'; g.font = '600 13px system-ui, sans-serif'; g.fillText(c.head, x, TOP - 12);
      c.matches.forEach((rowsP, i) => {
        const y = ys[ci][i];
        const next = cols[ci + 1];
        if (next) {
          const j = next.matches.length * 2 === c.matches.length ? i >> 1 : next.matches.length === c.matches.length ? i : -1;
          if (j >= 0) { const y2 = ys[ci + 1][j] + H / 2; g.beginPath(); g.moveTo(x + W, y + H / 2); g.lineTo(x + W + GX / 2, y + H / 2); g.lineTo(x + W + GX / 2, y2); g.lineTo(x + W + GX, y2); g.stroke(); }
        }
        g.fillStyle = '#f4f5f7'; g.fillRect(x, y, W, H); g.strokeRect(x, y, W, H);
        rowsP.slice(0, 2).forEach((p, k) => {
          g.fillStyle = p.win ? '#0b7a3b' : '#222'; g.font = `${p.win ? 'bold ' : ''}13px system-ui, sans-serif`;
          g.fillText(p.name.slice(0, 24), x + 8, y + 20 + k * 22);
          g.textAlign = 'right'; g.fillText(p.score, x + W - 8, y + 20 + k * 22); g.textAlign = 'left';
        });
      });
    });
    g.fillStyle = '#888'; g.font = '11px system-ui, sans-serif'; g.fillText('Caro x Gomoku', PAD, ch - 10);
    cv.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      // Tên file không dấu ("Giai-Xem-Nhanh.png"): một số trình duyệt / hệ máy đổi tên có dấu thành "download"
      a.download = (title || 'bracket').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
        .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) + '.png';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }, 'image/png');
  }

  /** Gắn sự kiện cho mọi khối nhánh đấu trong root (gọi sau mỗi lần vẽ). */
  function bind(root, title) {
    root.querySelectorAll('.b-tools').forEach((bar) => {
      const br = bar.nextElementSibling;
      if (!br || !br.classList.contains('bracket')) return;
      const key = bar.dataset.bkey;
      const apply = () => { const s = Z.scale[key] || 1; br.style.setProperty('--bz', s); br.classList.toggle('zoomed', s !== 1); };
      apply();
      bar.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.bz != null) {
          const d = Number(b.dataset.bz);
          Z.scale[key] = d ? Math.max(0.4, Math.min(2, Math.round(((Z.scale[key] || 1) + d * 0.2) * 10) / 10)) : 1;
          apply();
          bar.querySelector('[data-bz="0"]').textContent = Math.round((Z.scale[key] || 1) * 100) + '%';
          requestAnimationFrame(() => drawLines(br));
        } else if (b.hasAttribute('data-bfull')) {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else bar.parentElement.requestFullscreen().catch(() => {});
        } else if (b.hasAttribute('data-bpng')) png(br, title || document.title);
      };
      bar.querySelector('[data-bz="0"]').textContent = Math.round((Z.scale[key] || 1) * 100) + '%';
    });
    requestAnimationFrame(() => redrawAll(root));
  }

  K.bracketBind = bind;
  K.binders.push((body) => bind(body, K.D && K.D.tour ? K.D.tour.name : ''));
  // Đổi cỡ cửa sổ / vào – ra toàn màn hình / mở khối thu gọn: vẽ lại đường nối (gộp trong một khung hình)
  let raf = 0;
  const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; redrawAll(); }); };
  window.addEventListener('resize', later);
  document.addEventListener('fullscreenchange', later);
  document.addEventListener('toggle', later, true);
})();
