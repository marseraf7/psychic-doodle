/*
 * Giải đấu Offline – công cụ xếp hạt giống trong tab Đội (trước khi bắt đầu; thuật toán: otour-seedrank.js):
 *   - theo điểm xếp hạng (Elo, điểm bảng xếp hạng thế giới / khu vực…): mỗi dòng "Tên đội: điểm";
 *   - theo phiếu bầu của các đội (kiểu "Elo cộng đồng" IEM Katowice 2019): mỗi dòng "Đội bầu: A > B > C…".
 * Bấm "Xếp hạt giống" → gửi thứ tự mới (otSeeds); tên không khớp đội nào được báo lại.
 * K.seedToolHtml(t) – otour.js gọi ở tab Đội.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const SR = window.CaroOTourSeedRank;
  if (!K || !SR) return;
  const { T, esc } = K;
  const S = { mode: 'rating', text: '' };

  K.seedToolHtml = (t) => {
    if (!t.canManage || t.status !== 'draft' || t.players.length < 2) return '';
    return `<section class="ot-sec mg-sec"><details class="ot-seedtool"${S.text ? ' open' : ''}><summary><b>${esc(T('ot_seed_tool'))}</b></summary>
      <label class="field inline"><span>${esc(T('ot_seed_mode'))}</span><select id="ot-seed-mode">${['rating', 'ballot'].map((m) => `<option value="${m}" ${S.mode === m ? 'selected' : ''}>${esc(T('ot_seed_' + m))}</option>`).join('')}</select></label>
      <small class="hint">${esc(T('ot_seed_hint_' + S.mode))}</small>
      <textarea id="ot-seed-text" rows="5" placeholder="${esc(T('ot_seed_ph_' + S.mode))}">${esc(S.text)}</textarea>
      <div class="row"><button type="button" class="ghost sm" data-act="otSeedApply">${esc(T('ot_seed_apply'))}</button></div></details></section>`;
  };

  K.acts.otSeedApply = () => {
    const t = K.D.ot;
    S.text = (document.getElementById('ot-seed-text') || {}).value || '';
    const r = S.mode === 'ballot' ? SR.byBallots(S.text, t.players) : SR.byRating(S.text, t.players);
    if (!r.used) return window.CaroConfirm.info(T('ot_seed_none'));
    if (K.O) K.O.send({ t: 'otSeeds', id: t.id, order: r.order });
    if (r.unknown.length) window.CaroConfirm.info(T('ot_seed_unknown', { list: [...new Set(r.unknown)].slice(0, 10).join(', ') }));
  };

  K.binders.push((body) => {
    const sel = body.querySelector('#ot-seed-mode');
    if (sel) sel.onchange = () => { S.mode = sel.value === 'ballot' ? 'ballot' : 'rating'; S.text = (body.querySelector('#ot-seed-text') || {}).value || ''; if (K.render) K.render(); };
  });
})();
