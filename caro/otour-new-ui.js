/*
 * Giải đấu Offline – bố cục form tạo giải chia bước (otour.js – pageNew): mỗi bước một thẻ có số thứ tự, tiêu đề và một
 * dòng gợi ý; thẻ chọn nhanh thể thức có sơ đồ nhỏ (otour-tpl-art.js) thay cho hộp chọn trơn; khung "Giải của bạn"
 * tóm tắt số đội · thể thức · số trận, dính bên phải trên máy tính và nằm cuối form trên điện thoại (không che ô nhập).
 * Hộp chọn name="preset" vẫn giữ (đủ mọi thể thức: đua, tuỳ chỉnh…): bấm thẻ = chọn trong hộp đó + sự kiện change, nên
 * mọi xử lý cũ (đổi giai đoạn, bỏ đánh dấu mẫu…) chạy như trước.
 *   K.otStep(n, body)            – một bước (tiêu đề otn_s<n>, gợi ý otn_s<n>_h)
 *   K.otFmtCards(d)              – thẻ chọn nhanh thể thức
 *   K.otSummary(F, n)            – cập nhật khung tóm tắt + trạng thái thẻ (gọi mỗi lần form đổi – otour.js showEst)
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const ART = window.CaroOTourTplArt;
  const SP = window.CaroOTourSports;
  if (!K || !ART || !SP) return;
  const { T, esc, $ } = K;
  const QUICK = ['single', 'double', 'roundrobin', 'swiss', 'groups_single', 'swiss_single'];
  // Hình mẫu cho từng thẻ (chỉ để minh hoạ – giai đoạn thật do PRESETS của otour.js tạo)
  const SHAPE = {
    single: [{ type: 'single' }], double: [{ type: 'double' }], roundrobin: [{ type: 'roundrobin', advance: 0 }],
    swiss: [{ type: 'swiss', rounds: 5 }], groups_single: [{ type: 'roundrobin', groups: 4, advance: 2 }, { type: 'single' }],
    swiss_single: [{ type: 'swiss', record: { win: 3, lose: 3 } }, { type: 'single' }],
  };

  K.otStep = (n, body) => `<section class="ot-step" aria-labelledby="ots-${n}">
    <header class="ot-step-h"><span class="ot-num" aria-hidden="true">${n}</span><span class="ot-step-t"><h3 id="ots-${n}">${esc(T('otn_s' + n))}</h3><small class="hint">${esc(T('otn_s' + n + '_h'))}</small></span></header>
    <div class="ot-step-b">${body}</div></section>`;
  /** Tiêu đề bước 4 (đặt trong <summary> của khối thu gọn otf:io). */
  K.otStepFoldTitle = (n) => `<span class="ot-num" aria-hidden="true">${n}</span><span class="ot-step-t"><b id="ots-${n}">${esc(T('otn_s' + n))}</b><small class="hint">${esc(T('otn_s' + n + '_h'))}</small></span>`;

  K.otFmtCards = (d) => `<div class="ot-fmts" role="group" aria-label="${esc(T('otn_fmt_pick'))}">${QUICK.map((k) => {
    const st = SHAPE[k];
    const pic = st.map((c, i) => ART.stageSvg(c, { n: 8, groups: c.groups || 1 }, i ? '' : T('fmt_' + k))).join('');
    return `<button type="button" class="ot-fmt ${d.preset === k ? 'on' : ''}" data-act="otFmt" data-fmt="${k}" aria-pressed="${d.preset === k}">
      <span class="pic" aria-hidden="true">${pic}</span><b>${esc(T('fmt_' + k))}</b><small>${esc(T('otn_fmt_' + k + '_h'))}</small></button>`;
  }).join('')}</div>`;
  K.acts.otFmt = (b) => {
    const f = $('otf');
    const s = f && f.elements.preset;
    if (!s || s.value === b.dataset.fmt) return;
    s.value = b.dataset.fmt;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /** Khung tóm tắt "Giải của bạn". */
  K.otSummary = (F, n) => {
    const d = F.d;
    document.querySelectorAll('#otf .ot-fmt').forEach((b) => { const on = b.dataset.fmt === d.preset; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const el = $('otf-sum');
    if (!el) return;
    const sp = SP.SPORTS[d.sport] || SP.SPORTS.other;
    const st = F.stages || [];
    const fmt = d.preset === 'custom' || !d.preset ? `${T('fmt_custom')} (${T('otl_stages', { n: st.length })})` : T('fmt_' + d.preset);
    let m = 0;
    if (n >= 2 && window.CaroTourEstimate) {
      const e = window.CaroTourEstimate.estimate({ stages: st, players: n, timeLimit: 20 });
      m = e.maxMatches > e.matches ? `${e.matches}–${e.maxMatches}` : e.matches;
    }
    const line = n >= 2 ? T('otn_sum_line', { n, fmt, m }) : T('otn_sum_none', { fmt });
    const gr = (c) => (c.type === 'roundrobin' && !c.league ? c.groups || (c.groupSize && n ? Math.ceil(n / c.groupSize) : 1) : 1);
    const lab = (c) => (gr(c) > 1 ? T('otl_k_groups', { n: gr(c) }) : T('otl_k_' + ART.kind(c)));
    const chips = st.map((c, i) => `<span class="pill">${esc(T('otl_st', { n: i + 1 }))} · ${esc(lab(c))}</span>`).join('');
    el.innerHTML = `<p class="ot-sum-sport">${sp.icon} ${esc(T('sport_' + (SP.SPORTS[d.sport] ? d.sport : 'other')))}</p><p class="ot-sum-line">${esc(line)}</p><p class="ot-sum-st">${chips}</p>`;
  };
})();
