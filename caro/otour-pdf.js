/*
 * Giải đấu Offline – xuất PDF (báo cáo giải in được / gửi đi, như "Print bracket" của Challonge, "Xuất PDF" của MyLeague):
 * làm hoàn toàn trên máy, không tốn sức máy chủ. Mỗi trang A4 vẽ bằng canvas (chữ mọi ngôn ngữ hiện đúng) rồi ghép
 * thành PDF bằng pdf-lite.js.
 * Nội dung: tên giải, bộ môn · số đội · trạng thái, bục trao giải (giải đã xong); mỗi giai đoạn: bảng xếp hạng (mỗi bảng
 * đấu), kết quả các trận theo vòng (tỉ số, từng set, luân lưu, giờ – sân). Giải nhiều bảng tải lười: tải đủ các bảng trước
 * (otour.js – K.otGroupsAll). Tối đa MAX_PAGES trang (giải cực lớn: ghi chú xem đầy đủ trên trang giải).
 *   K.acts.otPdf – nút ở mục Xuất dữ liệu (otour-export.js). window.CaroOTourPdf = { build, layout }.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const RU = window.CaroOTourRules;
  const SP = window.CaroOTourSports;
  const PDF = window.CaroPdf;
  if (!K || !PDF) return;
  const { T, D } = K;
  const W = 1240, H = 1754, M = 84; // A4 ~150 dpi, lề 84 px (~14 mm)
  const TOP = M + 54, BOTTOM = H - M - 30; // vùng nội dung (trừ đầu / chân trang)
  const MAX_PAGES = 60;
  const C = { ink: '#111111', soft: '#555555', line: '#d6d6d6', band: '#f2f5f3', head: '#1f5a46', gold: '#b88a00' };

  const site = () => (window.CARO_SERVER || location.origin).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const localTime = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  function fit(g, s, w) {
    s = String(s == null ? '' : s);
    if (g.measureText(s).width <= w) return s;
    while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1);
    return s + '…';
  }

  // ------------------------------------------------------------ Các khối nội dung (cao h, vẽ draw(g, y, font))
  const block = (h, draw, keep = 0) => ({ h, draw, keep }); // keep: cần thêm chỗ cho khối theo sau (tiêu đề không đứng trơ cuối trang)
  const text = (s, size, weight, color, x = M, align = 'left') => (g, y, f) => { g.font = `${weight} ${size}px ${f}`; g.fillStyle = color; g.textAlign = align; g.fillText(fit(g, s, W - 2 * M), x, y); };

  function title(t) {
    const out = [block(70, text(t.name, 52, 800, C.ink))];
    const sp = SP && SP.SPORTS[t.sport];
    const info = [sp ? `${sp.icon || ''} ${T('sport_' + t.sport)}`.trim() : '', T('ot_n_teams', { n: (t.players || []).length }), T('ot_st_' + t.status), t.owner ? T('ot_by', { name: t.owner }) : ''].filter(Boolean).join(' · ');
    out.push(block(44, text(info, 26, 500, C.soft)));
    out.push(block(40, text(`${site()}/?o=${t.slug || t.id}`, 24, 500, C.head)));
    return out;
  }
  function podium(t) {
    if (t.status !== 'finished' || !t.podium || !t.podium.length) return [];
    const out = [block(64, (g, y, f) => { text(T('ot_img_podium'), 34, 800, C.head)(g, y, f); }, 60)];
    t.podium.slice(0, 3).forEach((p, i) => out.push(block(52, (g, y, f) => {
      g.fillStyle = ['#d4af37', '#a8b0bb', '#c27c3e'][i];
      g.beginPath(); g.arc(M + 22, y - 12, 20, 0, Math.PI * 2); g.fill();
      text(String(i + 1), 24, 800, '#ffffff', M + 22, 'center')(g, y - 3, f);
      text(p.name, 32, i === 0 ? 800 : 600, C.ink, M + 60)(g, y, f);
    })));
    out.push(block(20, () => {}));
    return out;
  }
  const h2 = (s) => block(70, (g, y, f) => { text(s, 34, 800, C.head)(g, y, f); g.fillStyle = C.head; g.fillRect(M, y + 14, W - 2 * M, 3); }, 120);
  const h3 = (s) => block(52, text(s, 28, 700, C.ink), 90);

  /** Bảng xếp hạng: [{ t: tiêu đề cột, x, align }], các dòng. */
  function table(rows, race, time) {
    const cols = race ? (time ? [['#', M + 8, 'left'], ['', M + 64, 'left'], [T('race_total'), W - M - 220, 'right'], [T('race_gap'), W - M - 8, 'right']]
      : [['#', M + 8, 'left'], ['', M + 64, 'left'], [T('race_wins'), W - M - 220, 'right'], [T('race_pts'), W - M - 8, 'right']])
      : [['#', M + 8, 'left'], ['', M + 64, 'left'], [T('col_mp'), W - M - 470, 'right'], [T('col_wdl'), W - M - 320, 'right'], [T('col_diff'), W - M - 170, 'right'], [T('col_pts'), W - M - 8, 'right']];
    const nameW = (race ? W - M - 220 - 160 : W - M - 470 - 90) - (M + 64);
    const out = [block(40, (g, y, f) => {
      g.font = `600 22px ${f}`; g.fillStyle = C.soft;
      cols.forEach(([s, x, a]) => { if (s) { g.textAlign = a; g.fillText(s, x, y); } });
      g.fillStyle = C.line; g.fillRect(M, y + 10, W - 2 * M, 2);
    }, 42)];
    rows.forEach((r, i) => out.push(block(42, (g, y, f) => {
      if (r.adv) { g.fillStyle = '#e3f3e8'; g.fillRect(M, y - 30, W - 2 * M, 40); } else if (i % 2) { g.fillStyle = C.band; g.fillRect(M, y - 30, W - 2 * M, 40); }
      g.fillStyle = C.ink; g.font = `${i < 3 ? 700 : 500} 25px ${f}`;
      g.textAlign = 'left'; g.fillText(String(r.rank || i + 1), M + 8, y); g.fillText(fit(g, r.name, nameW), M + 64, y);
      g.textAlign = 'right';
      const cells = race ? (time ? [r.time != null && RU ? RU.fmtTime(r.time) : '–', r.gap && RU ? RU.fmtGap(r.gap) : ''] : [r.wins || 0, r.pts != null ? r.pts : ''])
        : [r.mp, `${r.w}-${r.d}-${r.l}`, (r.gw - r.gl > 0 ? '+' : '') + (r.gw - r.gl), r.pts];
      cells.forEach((v, k) => { if (k === cells.length - 1) g.font = `800 25px ${f}`; g.fillText(String(v), cols[k + 2][1], y); });
    })));
    out.push(block(18, () => {}));
    return out;
  }

  /** Một trận: "Đội A   2–1   Đội B" (+ dòng nhỏ: từng set, luân lưu, giờ – sân). */
  function match(m) {
    const score = m.done ? `${m.wa}–${m.wb}` : '–';
    const extra = [m.sets ? m.sets.map((s, i) => s.join('-') + (m.pens && m.pens[i] ? ` (${m.pens[i].join('-')})` : '')).join(' · ') : '', // pens: luân lưu từng trận của loạt Bo m.extra ? T('ot_pen_tag', { s: m.extra.join('-') }) : '', m.aet && !m.sets ? T('ot_aet_tag') : '',
      m.when ? localTime(m.when) : '', m.venue || ''].filter(Boolean).join(' · ');
    const mid = W / 2;
    return Object.assign(block(extra ? 64 : 42, (g, y, f) => {
      const win = (s) => m.done && m.winner && m.winner === s.uid;
      g.font = `${win(m.a) ? 700 : 500} 25px ${f}`; g.fillStyle = C.ink; g.textAlign = 'right'; g.fillText(fit(g, m.a.name, mid - 90 - M), mid - 70, y);
      g.font = `${win(m.b) ? 700 : 500} 25px ${f}`; g.textAlign = 'left'; g.fillText(fit(g, m.b.name, W - M - mid - 90), mid + 70, y);
      g.font = `800 26px ${f}`; g.textAlign = 'center'; g.fillStyle = m.done ? C.ink : C.soft; g.fillText(score, mid, y);
      if (extra) { g.font = `500 19px ${f}`; g.fillStyle = C.soft; g.fillText(fit(g, extra, W - 2 * M), mid, y + 25); }
      g.fillStyle = C.line; g.fillRect(M + 120, y + (extra ? 38 : 14), W - 2 * M - 240, 1);
    }), { mid: m.id }); // mã trận (kiểm thử đếm đủ các trận)
  }
  const real = (m) => m && m.a && m.b && !m.a.bye && !m.b.bye;
  function rounds(list, name) {
    const out = [];
    list.forEach((r, i) => {
      const ms = (r || []).filter(real);
      if (!ms.length) return;
      out.push(block(46, text(name(i), 24, 700, C.soft), 50));
      ms.forEach((m) => out.push(match(m)));
    });
    return out;
  }
  const lbl = (t, v, r, def) => (K.roundLabel && K.roundLabel(t, v.index, r)) || def;

  function stage(t, v) {
    const cfg = v.cfg || (t.stages || [])[v.index] || {};
    const out = [h2((t.stageViews.length > 1 ? T('stage_n', { n: v.index + 1 }) + ' · ' : '') + (K.stageName ? K.stageName(cfg) : ''))];
    if (v.type === 'race') return out.concat(table(v.table || [], true, cfg.score === 'time' || cfg.score === 'gt'));
    if (v.groups) {
      v.groups.forEach((g, gi) => {
        if (v.groups.length > 1) out.push(h3(T(v.cfg && v.cfg.season ? 'conf_name' : 'group_name', { name: g.name })));
        out.push(...table(g.table || [], false));
        const rs = K.roundsOfGroup ? K.roundsOfGroup(t, v, gi) : g.rounds;
        if (rs) out.push(...rounds(rs, (i) => lbl(t, v, i, T('r_round', { n: i + 1 }))));
      });
      return out;
    }
    if (v.table) out.push(...table(v.table, false)); // Thụy Sĩ / league phase
    const elim = v.type === 'single' || v.type === 'double';
    const rn = (n, r, fk) => (K.roundName ? K.roundName(n, r, fk) : T('r_round', { n: r + 1 }));
    const pre = (v.pre || []).filter(real);
    if (pre.length) out.push(h3(T('pi_title')), ...pre.map(match)); // play-in trước nhánh chính
    out.push(...rounds(v.rounds || [], (i) => lbl(t, v, i, elim ? rn(v.rounds.length, i, v.type === 'double' ? 'wb_final' : 'r_final') : T('r_round', { n: i + 1 }))));
    if (v.third && real(v.third)) out.push(block(46, text(T('third_place'), 24, 700, C.soft), 50), match(v.third));
    for (const p of v.places || []) out.push(...rounds(p.rounds, (i) => `${T('place_range', { a: p.base, b: p.base + p.size - 1 })} · ${T('r_round', { n: i + 1 })}`));
    if (v.lrounds && v.lrounds.length) out.push(h3(T('lb')), ...rounds(v.lrounds, (i) => (i === v.lrounds.length - 1 ? T('lb_final') : T('r_round', { n: i + 1 }))));
    const gf = (v.gf || []).filter((m) => !m.skipped && real(m));
    if (gf.length) out.push(h3(T('gf')), ...gf.map(match));
    return out;
  }

  /** Chia các khối vào trang: [[{ b, y }]] (y – đường chân chữ của khối). Quá MAX_PAGES thì cắt, more = true. */
  function layout(t) {
    const blocks = [...title(t), block(24, () => {}), ...podium(t)];
    for (const v of t.stageViews || []) blocks.push(...stage(t, v));
    const pages = [[]];
    let y = TOP, more = false;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const need = b.h + (b.keep && blocks[i + 1] ? Math.min(b.keep, blocks[i + 1].h) : 0);
      if (y + need > BOTTOM && pages[pages.length - 1].length) {
        if (pages.length >= MAX_PAGES) { more = true; break; }
        pages.push([]);
        y = TOP;
      }
      pages[pages.length - 1].push({ b, y: y + b.h - 14 });
      y += b.h;
    }
    return { pages, more };
  }

  /** Vẽ từng trang và ghép PDF → Blob. */
  async function build(t) {
    const { pages, more } = layout(t);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const out = [];
    for (let i = 0; i < pages.length; i++) {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
      // Đầu trang (trừ trang 1): tên giải; chân trang: link · số trang
      if (i) { text(t.name, 22, 600, C.soft)(g, M + 6, font); g.fillStyle = C.line; g.fillRect(M, M + 20, W - 2 * M, 1); }
      for (const { b, y } of pages[i]) b.draw(g, y, font);
      if (more && i === pages.length - 1) text(T('ot_pdf_more'), 22, 600, C.gold, W / 2, 'center')(g, BOTTOM - 4, font);
      g.font = `500 20px ${font}`; g.fillStyle = C.soft;
      g.textAlign = 'left'; g.fillText(`Caro x Gomoku · ${site()}/?o=${t.slug || t.id}`, M, H - M + 10);
      g.textAlign = 'right'; g.fillText(T('ot_pdf_page', { i: i + 1, n: pages.length }), W - M, H - M + 10);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
      out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: W, h: H });
    }
    return { blob: new Blob(PDF.jpegPdf(out, { title: t.name }), { type: 'application/pdf' }), pages: pages.length };
  }

  const slug = (t) => String(t.slug || t.id).replace(/[^\w-]/g, '');
  K.acts.otPdf = async (b) => {
    const t = D.ot;
    if (!t || b.disabled) return;
    const label = b.textContent;
    b.disabled = true;
    b.textContent = T('ot_pdf_busy');
    try {
      if (K.otGroupsAll) await K.otGroupsAll(t); // giải nhiều bảng: tải đủ các trận trước
      const { blob } = await build(D.ot || t);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug(t)}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    } catch (e) {
      window.CaroConfirm.info(T('ot_x_failed'));
    } finally {
      b.disabled = false;
      b.textContent = label;
    }
  };

  window.CaroOTourPdf = { build, layout };
})();
