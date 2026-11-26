/*
 * Mục "Thành tích" trong hồ sơ người chơi (A5): chuỗi ngày chơi, Puzzle Storm (cao nhất / tuần này – máy chủ đã kiểm),
 * huy hiệu đã đạt. Dữ liệu: profile.progress do máy chủ gửi (server/src/hub/progress.js – progressOf), từ tiến độ đã đồng bộ
 * với tài khoản (progress-sync.js); danh hiệu Giải tuần (profile.titles – weekly-cup.js). profile.js gọi CaroProfileBadges.html(p) khi vẽ hồ sơ.
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const esc = window.CaroApp.esc;
  const ICON = {}; // mã huy hiệu → biểu tượng (habits.js)

  /** Danh hiệu Giải tuần (hạng 1–3 – server/src/hub/weekly-cup.js), mới nhất trước. */
  function titles(p) {
    const list = (p && p.titles) || [];
    if (!list.length || !window.CaroWeekly) return '';
    const li = list.slice().reverse().map((x) => `<li title="${esc(window.CaroWeekly.titleText(x))}"><svg class="ico" aria-hidden="true"><use href="#i-medal"/></svg>
      <span class="ellip">${esc(window.CaroWeekly.titleText(x))}</span></li>`).join('');
    return `<h3>${esc(T('pf_titles'))}</h3><ul class="pf-badges pf-titles">${li}</ul>`;
  }

  function html(p) {
    const g = p && p.progress;
    if (!g) return titles(p);
    if (!Object.keys(ICON).length && window.CaroHabits) for (const b of window.CaroHabits.BADGES) ICON[b.id] = b.icon;
    const badges = (g.badges || []).map((id) => `<li title="${esc(T('badge_' + id + '_d'))}"><svg class="ico" aria-hidden="true"><use href="#i-${esc(ICON[id] || 'medal2')}"/></svg>
      <span class="ellip">${esc(T('badge_' + id))}</span></li>`).join('');
    return `<h3>${esc(T('pf_progress'))}</h3>
      <div class="pf-stats pf-prog">
        <div><b>${g.streak | 0}</b><small>${esc(T('pf_streak', { n: g.bestStreak | 0 }))}</small></div>
        <div><b>${g.storm | 0}</b><small>${esc(T('pf_storm', { n: g.stormWeek | 0 }))}</small></div>
        <div><b>${(g.badges || []).length}</b><small>${esc(T('badges'))}</small></div>
      </div>
      ${badges ? `<ul class="pf-badges">${badges}</ul>` : ''}${titles(p)}`;
  }

  window.CaroProfileBadges = { html };
})();
