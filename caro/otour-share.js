/*
 * Giải đấu Offline – ảnh chia sẻ (vẽ ngay trên máy bằng canvas, không tốn sức máy chủ; xem trước, tải về, chia sẻ qua
 * K.imgShare – tour-match-extra.js):
 *   - Bảng xếp hạng (1080×1350 – khổ dọc cho mạng xã hội): một bảng vòng tròn / league phase / Thụy Sĩ / hệ Race, tối đa
 *     20 dòng (#, tên, số trận, thắng-hoà-thua, hiệu số, điểm; Race: điểm hoặc thời gian + chênh lệch).
 *   - Bục trao giải (1200×630) khi giải kết thúc.
 *   - Ảnh kết quả từng trận: nút 🖼 trên nhánh đấu (tour-match-extra.js – giải offline bật sẵn shareImages).
 * K.otShareHtml(t) – mục "Ảnh chia sẻ" ở tab Tổng quan (otour.js).
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const RU = window.CaroOTourRules;
  if (!K) return;
  const { T, esc, D, icon } = K;
  const MAX_ROWS = 20;

  const site = () => (window.CARO_SERVER || location.origin).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  /** Cắt chữ cho vừa bề rộng w. */
  function fit(g, s, w) {
    s = String(s == null ? '' : s);
    if (g.measureText(s).width <= w) return s;
    while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1);
    return s + '…';
  }
  /** Khung chung: nền, tên giải, dòng phụ, chân trang (link giải). */
  function frame(t, W, H, sub) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#102038');
    bg.addColorStop(1, '#1f5a46');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = `700 52px ${font}`;
    g.fillText(fit(g, t.name, W - 100), W / 2, 96);
    g.fillStyle = '#ffd36b';
    g.font = `600 30px ${font}`;
    g.fillText(fit(g, sub, W - 100), W / 2, 146);
    g.fillStyle = '#9fc4b4';
    g.font = `500 24px ${font}`;
    g.fillText(`Caro x Gomoku · ${site()}/?o=${t.slug || t.id}`, W / 2, H - 36);
    return { c, g, font };
  }

  /** Các bảng có thể làm ảnh: [{ key, label, rows, race, time }]. */
  function tablesOf(t) {
    const out = [];
    for (const v of t.stageViews || []) {
      const st = T('stage_n', { n: v.index + 1 });
      if (v.type === 'race') out.push({ key: `${v.index}`, label: (t.stageViews.length > 1 ? st + ' · ' : '') + K.stageName(v.cfg), rows: v.table, race: true, time: v.cfg.score === 'time' });
      else if (v.table) out.push({ key: `${v.index}`, label: (t.stageViews.length > 1 ? st + ' · ' : '') + K.stageName(v.cfg), rows: v.table });
      else if (v.groups) v.groups.forEach((g, gi) => out.push({ key: `${v.index}:${gi}`, label: (t.stageViews.length > 1 ? st + ' · ' : '') + (v.groups.length > 1 ? T('group_name', { name: g.name }) : K.stageName(v.cfg)), rows: g.table }));
    }
    return out.filter((x) => x.rows && x.rows.length);
  }

  function drawTable(t, tb) {
    const W = 1080, H = 1350;
    const { c, g, font } = frame(t, W, H, tb.label);
    const rows = tb.rows.slice(0, MAX_ROWS);
    const top = 210, rowH = Math.min(52, Math.floor((H - top - 110) / (rows.length + 1)));
    const cols = tb.race ? (tb.time ? [['#', 70], ['', 0], [T('race_total'), 820], [T('race_gap'), 990]] : [['#', 70], ['', 0], [T('race_wins'), 760], [T('race_pts'), 990]])
      : [['#', 70], ['', 0], [T('col_mp'), 640], [T('col_wdl'), 770], [T('col_diff'), 880], [T('col_pts'), 990]];
    g.font = `600 26px ${font}`;
    g.fillStyle = '#9fc4b4';
    cols.forEach(([h, x]) => { if (h) { g.textAlign = x < 100 ? 'left' : 'right'; g.fillText(h, x, top); } });
    rows.forEach((r, i) => {
      const y = top + rowH * (i + 1);
      if (r.adv || i < 3) { g.fillStyle = r.adv ? 'rgba(47,180,90,0.22)' : 'rgba(255,255,255,0.06)'; g.fillRect(50, y - rowH + 12, W - 100, rowH - 6); }
      g.fillStyle = i === 0 ? '#ffd36b' : '#ffffff';
      g.font = `${i < 3 ? 700 : 500} 30px ${font}`;
      g.textAlign = 'left';
      g.fillText(String(r.rank || i + 1), 70, y);
      g.fillText(fit(g, r.name, tb.race ? 560 : 480), 130, y);
      g.textAlign = 'right';
      const cells = tb.race ? (tb.time ? [r.time != null && RU ? RU.fmtTime(r.time) : '–', r.gap ? RU.fmtGap(r.gap) : ''] : [r.wins, r.pts])
        : [r.mp, `${r.w}-${r.d}-${r.l}`, (r.gw - r.gl > 0 ? '+' : '') + (r.gw - r.gl), r.pts];
      cells.forEach((v, k) => g.fillText(String(v), cols[k + 2][1], y));
    });
    if (tb.rows.length > MAX_ROWS) { g.textAlign = 'center'; g.fillStyle = '#9fc4b4'; g.font = `500 24px ${font}`; g.fillText(T('ot_img_more', { n: tb.rows.length - MAX_ROWS }), W / 2, H - 80); }
    return c;
  }

  function drawPodium(t) {
    const W = 1200, H = 630;
    const { c, g, font } = frame(t, W, H, T('ot_img_podium'));
    const order = [1, 0, 2]; // bục: nhì – nhất – ba
    const hgt = [220, 290, 170], cx = [W / 2 - 330, W / 2, W / 2 + 330];
    order.forEach((idx, k) => {
      const p = t.podium[idx];
      if (!p) return;
      const h = hgt[k], x = cx[k], base = H - 90;
      g.fillStyle = ['#c0c7d1', '#ffd36b', '#d79a5f'][idx];
      g.fillRect(x - 140, base - h, 280, h);
      g.fillStyle = '#102038';
      g.textAlign = 'center';
      g.font = `800 64px ${font}`;
      g.fillText(String(idx + 1), x, base - h + 80);
      g.fillStyle = '#ffffff';
      g.font = `700 34px ${font}`;
      g.fillText(fit(g, p.name, 300), x, base - h - 20);
    });
    return c;
  }

  K.otShareHtml = (t) => {
    if (t.status === 'draft') return '';
    const tabs = tablesOf(t);
    const pod = t.status === 'finished' && t.podium && t.podium.length;
    if (!tabs.length && !pod) return '';
    const opts = tabs.map((x) => `<option value="${esc(x.key)}">${esc(x.label)}</option>`).join('');
    return `<section class="ot-sec ot-share"><h4>${icon('image')} ${esc(T('ot_img'))}</h4>
      <div class="row ot-img-row">${tabs.length > 1 ? `<select id="ot-img-tb" aria-label="${esc(T('ot_img_table'))}">${opts}</select>` : ''}
      ${tabs.length ? `<button type="button" class="ghost sm" data-act="otImgTable" data-key="${esc(tabs[0].key)}">${icon('image')}${esc(T('ot_img_table'))}</button>` : ''}
      ${pod ? `<button type="button" class="ghost sm" data-act="otImgPodium">${icon('medal')}${esc(T('ot_img_podium'))}</button>` : ''}</div>
      <p class="hint">${esc(T('ot_img_hint'))}</p></section>`;
  };
  K.acts.otImgTable = (b) => {
    const t = D.ot;
    const sel = document.getElementById('ot-img-tb');
    const key = sel ? sel.value : b.dataset.key;
    const tb = tablesOf(t).find((x) => x.key === key);
    if (tb && K.imgShare) K.imgShare(drawTable(t, tb), `${t.slug || t.id}-bang-${key.replace(':', '-')}.png`, t.name);
  };
  K.acts.otImgPodium = () => { const t = D.ot; if (K.imgShare) K.imgShare(drawPodium(t), `${t.slug || t.id}-buc.png`, t.name); };
  window.CaroOTourShare = { drawTable, drawPodium, tablesOf };
})();
