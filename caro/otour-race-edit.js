/*
 * Giải đấu Offline – ô cấu hình các cách tính riêng của hệ Race trong form giai đoạn (tour-stage-edit.js gọi qua móc K.raceEdit):
 *   golf     – cách nhập, par từng lỗ, cắt sau vòng N, chấm điểm Stableford (chuẩn / Modified), bảng điểm 6 mức, handicap
 *              theo chỉ số khó từng lỗ (máy chủ: stages-golf.js, stages-golf-stable.js);
 *   omnium   – 4 đua con, bảng điểm theo hạng, điểm mỗi vòng hơn / kém (stages-omnium.js);
 *   massstart – số vòng, các vòng có điểm giữa đua, điểm giữa đua / về đích, bán kết (stages-massstart.js);
 *   pursuit  – xuất phát theo khoảng thua giai đoạn trước, mốc xuất phát đồng loạt (stages-pursuit.js).
 * K.raceEdit = { scores, keys, html(i, c, st, ctx), change(c, k, el, clamp), init(c, score) }.
 * Nạp sau tour-stage-edit.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc } = K;
  const PAR72 = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];
  const LEVELS = ['alb', 'eagle', 'birdie', 'par', 'bogey', 'dbl'];
  const TABLES = { stableford: [5, 4, 3, 2, 1, 0], modified: [8, 5, 2, 0, -1, -3] }; // như máy chủ (stages-golf-stable.js)
  const OMN_RANK = Array.from({ length: 20 }, (_, k) => 40 - 2 * k);

  const num = (i, k, v, min, max) => `<input type="number" data-i="${i}" data-k="${k}" value="${v}" min="${min}" max="${max}">`;
  const chk = (i, k, v, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${v ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
  const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;
  const sel = (i, k, items, v) => `<select data-i="${i}" data-k="${k}">${items.map(([x, l]) => `<option value="${esc(x)}" ${String(x) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const text = (i, k, v, label, hint) => `<label class="field"><span>${esc(label)}</span><input data-i="${i}" data-k="${k}" value="${esc(v)}" inputmode="numeric">${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</label>`;
  const nums = (s, lo, hi, max) => String(s).split(/[\s,;]+/).filter(Boolean).slice(0, max).map((x) => Math.max(lo, Math.min(hi, Math.floor(Number(x)) || 0)));

  function golf(i, c) {
    const par = c.par || PAR72, f = [];
    if (!c.scoring) f.push(field(T('opt_golf_input'), sel(i, 'input', [['round', T('golf_input_round')], ['hole', T('golf_input_hole')]], c.input || 'round')));
    f.push(text(i, 'par', par.join(' '), T('opt_golf_par', { n: par.length, p: par.reduce((a, b) => a + b, 0) }), T('opt_golf_par_hint')));
    if ((c.events || 1) > 1) {
      f.push(chk(i, 'cutOn', !!c.cut, T('opt_golf_cut')));
      if (c.cut) f.push(field(T('opt_golf_cut_after'), num(i, 'cutAfter', c.cut.after, 1, (c.events || 2) - 1)), field(T('opt_golf_cut_top'), num(i, 'cutTop', c.cut.top, 1, 512)));
    }
    // Stableford: chấm điểm từng lỗ thay cho cộng gậy (bắt buộc nhập từng lỗ)
    f.push(field(T('opt_golf_scoring'), sel(i, 'gScoring', [['stroke', T('golf_sc_stroke')], ['stableford', T('golf_sc_stableford')], ['modified', T('golf_sc_modified')]], c.scoring || 'stroke')));
    if (c.scoring) {
      const P = c.points || {}, def = TABLES[c.scoring];
      f.push(`<div class="field"><span>${esc(T('opt_golf_points'))}</span><small class="hint">${esc(T('opt_golf_points_hint'))}</small><div class="row wrap">${
        LEVELS.map((x, k) => `<label class="field inline"><span>${esc(T('golf_lv_' + x))}</span>${num(i, 'gPts', P[x] != null ? P[x] : def[k], -20, 20).replace('data-k="gPts"', `data-k="gPts" data-n="${x}"`)}</label>`).join('')}</div></div>`,
      chk(i, 'gHcp', !!c.handicap, T('opt_golf_hcp')));
      if (c.handicap) f.push(text(i, 'gSi', ((c.handicap.si) || par.map((_, k) => k + 1)).join(' '), T('opt_golf_si'), T('opt_golf_si_hint')));
    }
    return f;
  }

  function omnium(i, c) {
    const O = c.omnium || {};
    return [`<small class="hint">${esc(T('om_note'))}</small>`,
      text(i, 'omRank', (O.rank || OMN_RANK).join(' '), T('opt_om_rank'), T('opt_om_rank_hint')),
      field(T('opt_om_lap'), num(i, 'omLap', O.lap || 20, 1, 50)),
      text(i, 'omSprint', (O.sprint || [5, 3, 2, 1]).join(' '), T('opt_om_sprint'), T('opt_om_sprint_hint'))];
  }

  function mass(i, c) {
    const M = c.massStart || {};
    const f = [field(T('opt_ms_laps'), num(i, 'msLaps', M.laps || 16, 4, 40)),
      text(i, 'msSprints', (M.sprints || [4, 8, 12]).join(' '), T('opt_ms_sprints')),
      text(i, 'msMid', (M.mid || [3, 2, 1]).join(' '), T('opt_ms_mid')),
      text(i, 'msFinal', (M.final || [60, 40, 20, 10, 6, 3]).join(' '), T('opt_ms_final')),
      chk(i, 'msSemis', !!M.semis, T('opt_ms_semis'))];
    if (M.semis) f.push(field(T('opt_ms_heat'), num(i, 'msHeat', M.heat || 24, 6, 24)), field(T('opt_ms_adv'), num(i, 'msAdv', M.adv || 8, 2, 16)));
    return f;
  }

  function pursuit(i, c) {
    return [`<small class="hint">${esc(T(i > 0 ? 'pu_note' : 'pu_first'))}</small>`, field(T('opt_pu_wave'), num(i, 'puWave', (c.pursuit || {}).wave != null ? c.pursuit.wave : 240, 0, 3600))];
  }

  const HTML = { golf, omnium, massstart: mass, pursuit };

  K.raceEdit = {
    scores: ['omnium', 'massstart', 'pursuit'],
    keys: ['scoring', 'points', 'handicap', 'omnium', 'massStart', 'pursuit'],
    html: (i, c) => (HTML[c.score] ? HTML[c.score](i, c) : []),
    /** Giá trị mặc định khi chọn cách tính mới. Trả true nếu đã xử lý. */
    init(c, v) {
      if (!['omnium', 'massstart', 'pursuit'].includes(v)) return false;
      for (const k of ['table', 'teams', 'heat']) delete c[k];
      if (v === 'omnium') Object.assign(c, { events: 4, omnium: { rank: [...OMN_RANK], lap: 20, sprint: [5, 3, 2, 1] } });
      if (v === 'massstart') Object.assign(c, { events: 1, massStart: { laps: 16, sprints: [4, 8, 12], mid: [3, 2, 1], final: [60, 40, 20, 10, 6, 3] } });
      if (v === 'pursuit') Object.assign(c, { events: 1, pursuit: { wave: 240 } });
      return true;
    },
    change(c, k, el, clamp) {
      const v = el.value;
      if (k === 'input') { c.input = v === 'hole' ? 'hole' : 'round'; return true; }
      if (k === 'par') { // par từng lỗ: 1–18 số, mỗi số 3–6
        const p = nums(v, 3, 6, 18);
        c.par = p.length ? p : [...PAR72];
        c.po = (c.po || [18, 10]).filter((h) => h <= c.par.length);
        if (!c.po.length) c.po = [c.par.length];
        if (c.handicap) c.handicap = { si: c.par.map((_, j) => j + 1) };
        return true;
      }
      if (k === 'cutOn') { if (el.checked) c.cut = { after: Math.min(2, (c.events || 2) - 1), top: 50 }; else delete c.cut; return true; }
      if (k === 'cutAfter' || k === 'cutTop') { c.cut = { after: 2, top: 50, ...c.cut, [k === 'cutAfter' ? 'after' : 'top']: clamp(Number(v)) }; return true; }
      if (k === 'gScoring') {
        if (v === 'stableford' || v === 'modified') { c.scoring = v; c.input = 'hole'; c.points = Object.fromEntries(LEVELS.map((x, j) => [x, TABLES[v][j]])); } else { delete c.scoring; delete c.points; delete c.handicap; }
        return true;
      }
      if (k === 'gPts') { c.points = { ...c.points, [el.dataset.n]: Math.max(-20, Math.min(20, Math.floor(Number(v)) || 0)) }; return true; }
      if (k === 'gHcp') { if (el.checked) c.handicap = { si: (c.par || PAR72).map((_, j) => j + 1) }; else delete c.handicap; return true; }
      if (k === 'gSi') { const H = (c.par || PAR72).length, si = nums(v, 1, H, H); if (si.length === H && new Set(si).size === H) c.handicap = { si }; return true; }
      if (k === 'omRank') { const r = nums(v, 0, 100, 40); if (r.length) c.omnium = { ...c.omnium, rank: r }; return true; }
      if (k === 'omLap') { c.omnium = { ...c.omnium, lap: Math.max(1, Math.min(50, Math.floor(Number(v)) || 20)) }; return true; }
      if (k === 'omSprint') { const r = nums(v, 0, 20, 6); if (r.length) c.omnium = { ...c.omnium, sprint: r }; return true; }
      const M = c.massStart || {};
      if (k === 'msLaps') { const laps = Math.max(4, Math.min(40, Math.floor(Number(v)) || 16)); c.massStart = { ...M, laps, sprints: (M.sprints || []).filter((x) => x < laps) }; return true; }
      if (k === 'msSprints') { c.massStart = { ...M, sprints: [...new Set(nums(v, 1, (M.laps || 16) - 1, 10))].sort((a, b) => a - b) }; return true; }
      if (k === 'msMid' || k === 'msFinal') { const r = nums(v, 0, k === 'msMid' ? 20 : 200, k === 'msMid' ? 6 : 12); if (r.length) c.massStart = { ...M, [k === 'msMid' ? 'mid' : 'final']: r }; return true; }
      if (k === 'msSemis') { c.massStart = { ...M }; if (el.checked) Object.assign(c.massStart, { semis: true, heat: 24, adv: 8 }); else { delete c.massStart.semis; delete c.massStart.heat; delete c.massStart.adv; } c.events = el.checked ? 2 : 1; return true; }
      if (k === 'msHeat' || k === 'msAdv') { c.massStart = { ...M, [k === 'msHeat' ? 'heat' : 'adv']: clamp(Number(v)) }; return true; }
      if (k === 'puWave') { c.pursuit = { wave: Math.max(0, Math.min(3600, Math.floor(Number(v)) || 0)) }; return true; }
      return false;
    },
  };
})();
