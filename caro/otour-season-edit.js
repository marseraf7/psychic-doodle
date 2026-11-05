/*
 * Giải đấu Offline – phần "mùa giải kiểu nhà nghề Mỹ" trong form giai đoạn vòng tròn (tour-stage-edit.js gọi qua móc):
 *   K.seasonEdit.html(i, c, ctx) → mảng HTML các ô (ô bật / tắt, số miền, số bảng con, bảng số lần gặp theo quan hệ,
 *                                   dòng "mỗi đội N trận · tổng M trận" hoặc lỗi)
 *   K.seasonEdit.change(c, k, el) → true nếu đã xử lý ô k (data-k bắt đầu bằng 'sn' hoặc là 'season')
 * Cách tính dùng chung với máy chủ: caro/otour-season.js (CaroOTourSeason).
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc } = K;
  const SS = () => window.CaroOTourSeason;
  const LEVELS = ['div', 'conf', 'inter'];
  // Mặc định khi bật: 2 miền, không bảng con, 2 lượt trong miền, 1 lượt với miền kia
  const DEF = { confs: 2, divs: 1, div: { m: 2, x: 0 }, conf: { m: 0, x: 0 }, inter: { m: 1, x: 0 } };

  function html(i, c, ctx) {
    const out = [`<label class="check"><input type="checkbox" data-i="${i}" data-k="season" ${c.season ? 'checked' : ''}> <span>${esc(T('opt_season'))}</span></label>`];
    if (!c.season) return out;
    const s = SS() ? SS().cleanSeason(c.season) : c.season;
    const num = (k, v, min, max) => `<input type="number" data-i="${i}" data-k="${k}" value="${v}" min="${min}" max="${max}">`;
    out.push(`<div class="field inline"><span>${esc(T('opt_sn_confs'))}</span>${num('snConfs', s.confs, 1, 8)}</div>`,
      `<div class="field inline"><span>${esc(T('opt_sn_divs'))}</span>${num('snDivs', s.divs, 1, 8)}</div>`);
    // Bảng số lần gặp: mỗi mức một dòng (gặp mọi đội m lần + số đội gặp thêm 1 lần)
    const rows = LEVELS.filter((k) => (k !== 'conf' || s.divs > 1) && (k !== 'inter' || s.confs > 1)).map((k) => `<tr><th scope="row">${esc(T('sn_lv_' + k))}</th>
      <td>${num(`sn_${k}_m`, s[k].m, 0, 30)}</td><td>${num(`sn_${k}_x`, s[k].x, 0, 999)}</td></tr>`).join('');
    out.push(`<div class="field sn-meet"><span>${esc(T('opt_sn_meet'))}</span><div class="tscroll"><table class="sn-table"><thead><tr><th></th><th>${esc(T('sn_col_m'))}</th><th>${esc(T('sn_col_x'))}</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`);
    const n = ctx && ctx.n;
    const info = SS() && n ? SS().seasonInfo(s, n) : null;
    if (info && info.error) out.push(`<p class="err sn-err">${esc(T('srv_' + info.error.code, info.error.args))}</p>`);
    else if (info) out.push(`<p class="hint sn-sum">${esc(T('sn_sum', { per: info.perTeam, all: info.matches, cs: info.confSize, ds: info.divSize }))}</p>`);
    out.push(`<small class="hint">${esc(T('opt_season_hint'))}</small>`);
    return out;
  }

  function change(c, k, el) {
    const v = Math.floor(Number(el.value));
    const clamp = (n) => Math.max(Number(el.min), Math.min(Number(el.max), Number.isFinite(n) ? n : 0));
    if (k === 'season') {
      if (el.checked) {
        c.season = JSON.parse(JSON.stringify(DEF));
        delete c.league;
        delete c.groupSize;
        delete c.bestNext;
        c.groups = DEF.confs;
        c.meetings = 1;
      } else delete c.season;
      return true;
    }
    if (!c.season || !/^sn/.test(k)) return false;
    const s = c.season;
    if (k === 'snConfs') { s.confs = clamp(v); c.groups = s.confs; return true; }
    if (k === 'snDivs') { s.divs = clamp(v); return true; }
    const m = /^sn_(div|conf|inter)_(m|x)$/.exec(k);
    if (!m) return false;
    s[m[1]] = { m: 0, x: 0, ...s[m[1]], [m[2]]: clamp(v) };
    return true;
  }

  K.seasonEdit = { html, change };
})();
