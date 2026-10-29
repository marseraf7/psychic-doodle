/*
 * Trang nhúng (embed.html) – dựng window.CaroTourKit tối giản (chỉ đọc, không đăng nhập, không kết nối WebSocket) để
 * dùng lại đúng các module vẽ của trang giải: tour-players.js, tour-stages.js, tour-stage-edit.js, tour-bracket-view.js.
 * Nạp sau các file i18n-*.js, trước các module trên; embed-run.js nạp cuối và vẽ trang.
 */
(function () {
  'use strict';
  const T = window.I18N.t;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls = '') => `<svg class="ico i-in ${esc(cls)}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const when = (ms) => new Intl.DateTimeFormat(document.documentElement.lang || 'vi', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
  const D = { tour: null, open: {} };
  const K = window.CaroTourKit = {
    T, esc, icon, when, D, embed: true, pages: {}, acts: {}, binders: [], enter: {},
    me: () => null, // người xem trang nhúng không đăng nhập
    can: () => false, // không có quyền ban tổ chức
  };
  // Nhãn vòng / giờ – địa điểm ban tổ chức đặt (giống tour-manage.js – trang nhúng không nạp file đó)
  K.roundLabel = (t, stage, round) => { const s = t && t.schedule && t.schedule[stage + ':' + round]; return (s && s.label) || ''; };
  K.slotOf = (t, stage, round) => {
    const s = t && t.schedule && t.schedule[stage + ':' + round];
    return s ? [s.at ? when(s.at) : '', s.place || ''].filter(Boolean).join(' · ') : '';
  };
  /** "21-15 · 15-21 (5-3)" – tỉ số từng set của giải offline (giống tour-score.js). */
  K.setsText = (m) => (m.sets ? m.sets.map((s) => s.join('-')).join(' · ') + (m.extra ? ` (${m.extra.join('-')})` : '') : '');
})();
