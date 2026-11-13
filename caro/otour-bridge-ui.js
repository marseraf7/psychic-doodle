/*
 * Giải đấu Offline – khung nhập trận bridge đồng đội (giai đoạn có cfg.boards; máy chủ otour-run.js, quy tắc caro/otour-bridge.js):
 *   K.bridgeForm(t, m, v) – mỗi ván một dòng: điểm Bắc – Nam bàn 1 (đội ô trên ngồi Bắc – Nam), bàn 2 (đội ô dưới ngồi Bắc – Nam),
 *     IMP của ván, tổng IMP và VP tính ngay khi gõ; bỏ trống = ván chưa nhập / không đấu.
 *   K.bridgeRead(form) – [[bàn 1, bàn 2] | null…] để gửi otScore (null nếu chưa nhập ván nào).
 * otour-score.js gọi qua móc. Nạp sau otour-score.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const BR = window.CaroOTourBridge;
  if (!K || !BR) return;
  const { T, esc } = K;

  function totals(form) {
    const w = form.querySelector('.br-wrap'), n = Number(w.dataset.boards) || 1, rows = read(form) || [];
    form.querySelectorAll('tr[data-b]').forEach((tr) => {
      const x = rows[Number(tr.dataset.b)];
      tr.querySelector('.br-imp').textContent = x ? String(BR.imp(x[0] - x[1])) : '';
    });
    const R = BR.result(rows, n, JSON.parse(w.dataset.vpt || 'null'));
    const out = form.querySelector('.br-sum');
    if (out) out.textContent = R.played ? T('br_sum', { a: R.impA, b: R.impB, va: R.vpA.toFixed(2), vb: R.vpB.toFixed(2) }) : '';
  }

  function read(form) {
    const rows = [...form.querySelectorAll('tr[data-b]')].map((tr) => {
      const v = [...tr.querySelectorAll('input')].map((x) => x.value.trim());
      return v[0] !== '' && v[1] !== '' ? [Number(v[0]), Number(v[1])] : null;
    });
    return rows.some(Boolean) ? rows : null;
  }

  K.bridgeForm = (t, m, v) => {
    const n = v.cfg.boards;
    const rows = Array.from({ length: n }, (_, k) => `<tr data-b="${k}"><td>${k + 1}</td><td><input type="number" step="10" inputmode="numeric" aria-label="${esc(T('br_t1', { name: m.a.name }))}"></td><td><input type="number" step="10" inputmode="numeric" aria-label="${esc(T('br_t2', { name: m.b.name }))}"></td><td class="br-imp"></td></tr>`).join('');
    return `<div class="br-wrap" data-boards="${n}" data-vpt="${esc(JSON.stringify(v.cfg.vpTable || null))}"><p class="hint">${esc(T('br_hint', { a: m.a.name, b: m.b.name }))}</p>
      <div class="tscroll"><table class="stand br-in"><thead><tr><th>#</th><th>${esc(T('br_t1', { name: m.a.name }))}</th><th>${esc(T('br_t2', { name: m.b.name }))}</th><th>IMP</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="br-sum hint"></p></div>`;
  };
  K.bridgeRead = read;

  K.binders.push((body) => {
    const f = body.querySelector('form[data-bridge]');
    if (f) f.addEventListener('input', () => totals(f)); // IMP / VP tính ngay khi gõ
  });
})();
