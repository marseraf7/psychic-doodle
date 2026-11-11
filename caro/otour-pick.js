/*
 * Giải đấu Offline – hạt giống 1 chọn đối thủ bán kết (cfg.pick ở nhánh loại trực tiếp 4 đội, kiểu MSI 2018–2022; máy chủ:
 * otour-run.js on_otPick). K.pickHtml(t, v) – tour-stages.js gọi khi vẽ nhánh: ban tổ chức bấm chọn hạt giống 3 hoặc 4
 * (trước khi có trận nào xong); đã chọn thì ghi lại lựa chọn.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc } = K;
  K.pickHtml = (t, v) => {
    const p = v.pick;
    if (p.picked) return `<p class="hint">${esc(T('pick_done', { a: p.top.name, b: p.picked.name }))}</p>`;
    if (!p.open) return '';
    const can = t.canManage && t.status === 'running' && v.index === (t.stage || 0);
    if (!can) return `<p class="hint">${esc(T('pick_wait', { a: p.top.name }))}</p>`;
    return `<div class="pick-row"><p class="hint">${esc(T('pick_ask', { a: p.top.name }))}</p><div class="row">${p.opts.map((o) => `<button type="button" class="ghost sm" data-act="otPick" data-uid="${esc(o.uid)}">${esc(o.name)}</button>`).join('')}</div></div>`;
  };
  if (K.O) K.acts.otPick = (b) => window.CaroConfirm.ask(T('pick_confirm', { b: b.textContent })).then((ok) => { if (ok) K.O.send({ t: 'otPick', id: K.D.ot.id, opp: b.dataset.uid }); });
})();
