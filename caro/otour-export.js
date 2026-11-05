/*
 * Giải đấu Offline – xuất dữ liệu trang giải (không cần máy chủ: dùng đúng dữ liệu đang hiện):
 *   - Bảng xếp hạng (CSV): mọi bảng vòng tròn / Thụy Sĩ / league phase / Race.
 *   - Kết quả các trận (CSV): giai đoạn, vòng, hai đội, tỉ số, từng set / lượt, luân lưu, giờ, sân.
 *   - Cấu hình giải (JSON): bộ môn, cách ghi kết quả, luật set, các giai đoạn – dùng lại để tạo giải giống hệt
 *     (form tạo giải – "Nhập cấu hình JSON", otour-spec-io.js) hoặc đưa cho chatbot AI sau này.
 * CSV có BOM UTF-8 để Excel đọc đúng tiếng Việt. Trình duyệt trong app (Zalo, Messenger…) chặn tải file: chép vào bộ
 * nhớ tạm và báo bằng hộp trong app (CaroConfirm.info).
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const RU = window.CaroOTourRules;
  if (!K) return;
  const { T, esc, D } = K;

  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = (rows) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const slug = (t) => String(t.slug || t.id).replace(/[^\w-]/g, '');

  /** Bảng xếp hạng của mọi giai đoạn có bảng. */
  function tableRows(t) {
    const out = [[T('ot_x_stage'), T('ot_x_group'), '#', T('ot_x_team'), T('ot_x_mp'), T('ot_x_w'), T('ot_x_d'), T('ot_x_l'), T('ot_x_for'), T('ot_x_against'), T('ot_x_pts'), T('ot_x_time')]];
    for (const v of t.stageViews || []) {
      const n = v.index + 1;
      if (v.type === 'race') { for (const x of v.table) out.push([n, '', x.rank, x.name, x.races, x.wins || '', '', x.dnf || '', '', '', x.pts != null ? x.pts : '', x.time != null && RU ? RU.fmtTime(x.time) : '']); continue; }
      const tabs = v.groups ? v.groups.map((g) => [g.name, g.table]) : v.table ? [['', v.table]] : [];
      for (const [g, rows] of tabs) for (const x of rows || []) out.push([n, g, x.rank, x.name, x.mp, x.w, x.d, x.l, x.gw, x.gl, x.pts, '']);
    }
    return out;
  }

  /** Kết quả từng trận (trận đã có đủ hai bên). */
  function matchRows(t) {
    const out = [[T('ot_x_stage'), T('ot_x_round'), T('ot_x_home'), T('ot_x_away'), T('ot_score'), T('ot_x_detail'), T('ot_pen'), T('ot_when'), T('ot_venue')]];
    for (const v of t.stageViews || []) {
      const all = [...(v.rounds || []).flat(), ...(v.lrounds || []).flat(), ...(v.gf || []), ...(v.third ? [v.third] : []),
        ...(v.places || []).flatMap((p) => p.rounds.flat()), ...(v.groups || []).flatMap((g) => g.rounds.flat())].filter((m) => m && m.a && m.b && !m.a.bye && !m.b.bye);
      for (const m of all) {
        out.push([v.index + 1, m.round + 1, m.a.name, m.b.name, m.done ? `${m.wa}-${m.wb}` : '', m.sets ? m.sets.map((s) => s.join('-')).join(' ') : '',
          m.extra ? m.extra.join('-') : '', m.when ? new Date(m.when).toISOString().slice(0, 16).replace('T', ' ') : '', m.venue || '']);
      }
    }
    return out;
  }

  /** Cấu hình giải (bản dùng lại được). */
  const specOf = (t) => ({ sport: t.sport, result: t.result, ...(t.set !== undefined ? { set: t.set } : {}), stages: t.stages });

  /** Tải file; trình duyệt chặn tải thì chép vào bộ nhớ tạm. */
  async function save(name, text, type) {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) {
      try { await navigator.clipboard.writeText(text); window.CaroConfirm.info(T('ot_x_copied')); } catch (e2) { window.CaroConfirm.info(T('ot_x_failed')); }
    }
  }

  K.otExportHtml = (t) => (t.status === 'draft' && !t.canManage ? '' : K.fold('ot:' + t.id + ':export', esc(T('ot_export')), () => `<div class="row">
      ${t.stageViews && t.stageViews.length ? `<button type="button" class="ghost sm" data-act="otCsvTable">${esc(T('ot_x_tables'))}</button>
      <button type="button" class="ghost sm" data-act="otCsvMatches">${esc(T('ot_x_matches'))}</button>` : ''}
      <button type="button" class="ghost sm" data-act="otJsonSpec">${esc(T('ot_x_spec'))}</button></div>
      <p class="hint">${esc(T('ot_x_hint'))}</p>`, false));

  K.acts.otCsvTable = () => save(`${slug(D.ot)}-bang-xep-hang.csv`, csv(tableRows(D.ot)), 'text/csv;charset=utf-8');
  K.acts.otCsvMatches = () => save(`${slug(D.ot)}-ket-qua.csv`, csv(matchRows(D.ot)), 'text/csv;charset=utf-8');
  K.acts.otJsonSpec = () => save(`${slug(D.ot)}-cau-hinh.json`, JSON.stringify(specOf(D.ot), null, 2), 'application/json');

  window.CaroOTourExport = { tableRows, matchRows, specOf, csv };
})();
