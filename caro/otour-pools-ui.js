/*
 * Giải đấu Offline – giao diện giai đoạn "pool loại kép xếp tầng" (type 'pools', kiểu EVO – máy chủ: stages-pools.js).
 * Đăng ký vào registry phía trình duyệt K.kinds.pools: tên, vẽ từng pool (nhánh thắng / nhánh thua) và danh sách suất đi tiếp
 * có huy hiệu W / L; ô cấu hình cỡ pool, số suất mỗi phía, Bo. Nạp sau tour-stages.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc } = K;
  const sel = (i, k, items, v) => `<select data-i="${i}" data-k="${k}">${items.map(([x, l]) => `<option value="${esc(x)}" ${String(x) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;

  function html(t, v) {
    const key = t.id + ':' + v.index;
    const pools = (v.groups || []).map((g, gi) => {
      const wb = g.rounds.slice(0, g.wb), lb = g.rounds.slice(g.wb);
      const body = () => `<h6>${esc(T('wb'))}</h6>${K.bracketCols(wb, (r) => T('r_round', { n: r + 1 }), null, null)}`
        + (lb.length ? `<h6>${esc(T('lb'))}</h6>${K.bracketCols(lb, (r) => T('r_round', { n: r + 1 }), null, null)}` : '');
      return K.fold(key + ':pool' + gi, `<b>${esc(T('pool_name', { name: g.name }))}</b>`, body, gi === 0);
    }).join('');
    const q = (v.qual || []).map((x) => `<li>${esc(x.name)} <span class="pill">${esc(x.side)}</span></li>`).join('');
    return `<p class="hint">${esc(T('pools_note', { n: v.cfg.out }))}</p>${pools}${q ? `<h5>${esc(T('pools_qual'))}</h5><ol class="pools-q">${q}</ol>` : ''}`;
  }

  function edit(i, c) {
    return [
      field(T('opt_pool_size'), sel(i, 'pool', [8, 16, 32].map((x) => [x, String(x)]), c.pool || 16)),
      field(T('opt_pool_out'), sel(i, 'poolOut', [1, 2, 4, 8].filter((x) => x <= (c.pool || 16) / 4).map((x) => [x, String(x)]), c.out || 2)),
      field(T('format_bo'), sel(i, 'bestOf', [1, 3, 5].map((x) => [x, 'Bo' + x]), c.bestOf || 3)),
      `<small class="hint">${esc(T('pools_note', { n: c.out || 2 }))}</small>`,
    ];
  }
  function change(stages, i, k, el) {
    const c = stages[i];
    if (k === 'pool') { c.pool = Number(el.value) || 16; c.out = Math.min(c.out || 2, c.pool / 4); return true; }
    if (k === 'poolOut') { c.out = Number(el.value) || 2; return true; }
    return false;
  }

  K.kinds = K.kinds || {};
  K.kinds.pools = {
    name: (c) => T('fmt_pools', { n: c.pool || 16 }),
    adv: (c) => T('adv_pools', { n: c.out || 2 }),
    html,
    def: () => ({ type: 'pools', pool: 16, out: 2, bestOf: 3 }),
    edit,
    change,
    mid: true,
  };
})();
