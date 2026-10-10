/*
 * Thói quen hằng ngày: chuỗi ngày chơi liên tiếp + huy hiệu cột mốc (như chess.com).
 * Ngày "có chơi" = hết một ván (với máy, 2 người, online) hoặc giải xong một bài đố / bài học.
 * Lưu trên máy (localStorage 'caro.habits'); huy hiệu online lấy từ thống kê tài khoản do máy chủ gửi.
 */
(function () {
  'use strict';
  const T = window.I18N.t;
  const App = window.CaroApp;
  const N = window.CaroOnline;
  const esc = App.esc;
  const $ = (id) => document.getElementById(id);
  const STORE = 'caro.habits';
  const toast = (m, ms) => N && N.toast(m, ms);

  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };

  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { /* hỏng thì làm lại */ }
    return { days: Array.isArray(s.days) ? s.days.slice(-120) : [], best: +s.best || 0, games: +s.games || 0, bots: s.bots || {}, earned: s.earned || {} };
  }
  let H = load();
  function save() { try { localStorage.setItem(STORE, JSON.stringify(H)); } catch (e) { /* riêng tư */ } }

  /** Chuỗi ngày hiện tại: tính lùi từ hôm nay (hoặc hôm qua nếu hôm nay chưa chơi). */
  function streak() {
    const set = new Set(H.days);
    let k = dayKey();
    if (!set.has(k)) k = addDays(k, -1);
    let n = 0;
    while (set.has(k)) { n++; k = addDays(k, -1); }
    return n;
  }

  function active() {
    const k = dayKey();
    if (H.days.includes(k)) return;
    H.days.push(k);
    const n = streak();
    H.best = Math.max(H.best, n);
    save();
    if (n >= 2) toast(T('streak_up', { n }), 3500);
  }

  // ---------------------------------------------------------------- Huy hiệu
  const pz = () => { try { return JSON.parse(localStorage.getItem('caro.puzzles') || '{}'); } catch (e) { return {}; } };
  const me = () => (N && N.state.me && !N.state.me.guest ? N.state.me : null);
  const BADGES = [
    { id: 'first_game', icon: 'swords', ok: () => H.games >= 1 },
    { id: 'first_win', icon: 'trophy', ok: () => Object.keys(H.bots).length > 0 || (me() && me().stats.wins > 0) },
    { id: 'beat_bin', icon: 'check', ok: () => !!H.bots.bin },
    { id: 'beat_mai', icon: 'check', ok: () => !!H.bots.mai },
    { id: 'beat_minh', icon: 'medal2', ok: () => !!H.bots.minh },
    { id: 'beat_rong', icon: 'fire', ok: () => !!H.bots.rong },
    { id: 'learn_all', icon: 'book', ok: () => window.CaroLearn && window.CaroLearn.doneCount() >= window.CaroLearn.LESSONS.length },
    { id: 'puzzles_10', icon: 'puzzle', ok: () => (pz().ok || 0) >= 10 },
    { id: 'puzzles_50', icon: 'puzzle', ok: () => (pz().ok || 0) >= 50 },
    { id: 'pz_streak_10', icon: 'fire', ok: () => (pz().best || 0) >= 10 },
    { id: 'daily_3', icon: 'cal', ok: () => H.best >= 3 },
    { id: 'daily_7', icon: 'cal', ok: () => H.best >= 7 },
    { id: 'daily_30', icon: 'cal', ok: () => H.best >= 30 },
    { id: 'online_10', icon: 'globe', ok: () => me() && me().stats.wins >= 10 },
    { id: 'online_100', icon: 'globe', ok: () => me() && me().stats.wins + me().stats.losses + (me().stats.draws || 0) >= 100 },
    { id: 'win_streak_5', icon: 'fire', ok: () => me() && me().streak && me().streak.best >= 5 },
    { id: 'rating_1500', icon: 'star', ok: () => me() && me().rating >= 1500 },
    { id: 'rating_1800', icon: 'star', ok: () => me() && me().rating >= 1800 },
    { id: 'tour_win', icon: 'trophy', ok: () => me() && me().tours && me().tours.won >= 1 },
  ];
  /** Kiểm tra huy hiệu mới đạt (báo 1 lần). */
  function checkBadges(quiet) {
    let fresh = 0;
    for (const b of BADGES) {
      if (H.earned[b.id]) continue;
      let ok = false;
      try { ok = !!b.ok(); } catch (e) { ok = false; }
      if (!ok) continue;
      H.earned[b.id] = dayKey();
      fresh++;
      if (!quiet) setTimeout(() => toast(T('badge_new', { name: T('badge_' + b.id) }), 4500), 600 + fresh * 300);
    }
    if (fresh) save();
    if (N && N.isOpen('habits-dlg')) render();
  }

  // ---------------------------------------------------------------- Sự kiện
  window.addEventListener('caro:gameover', (e) => {
    H.games++;
    if (e.detail.won && e.detail.bot) H.bots[e.detail.bot] = true;
    save();
    active();
    checkBadges();
  });
  window.addEventListener('caro:solved', (e) => { if (e.detail.kind !== 'retry') { active(); checkBadges(); } });
  window.addEventListener('caro:lesson', () => checkBadges());
  if (N) {
    let lastEnd = null;
    N.on('room', (m) => {
      const r = m.room;
      if (m.watch || !r || !r.winner || !N.state.me || !r.players.some((p) => p.id === N.state.me.id)) return;
      const key = r.code + ':' + r.gameNo;
      if (key === lastEnd) return;
      lastEnd = key;
      H.games++;
      save();
      active();
    });
    N.on('me', () => checkBadges());
    N.on('welcome', () => checkBadges(true));
  }

  // ---------------------------------------------------------------- Hộp "Thành tích"
  function render() {
    const n = streak();
    const set = new Set(H.days);
    const today = dayKey();
    const cells = [];
    for (let i = 13; i >= 0; i--) {
      const k = addDays(today, -i);
      cells.push(`<i class="${set.has(k) ? 'on' : ''}${k === today ? ' today' : ''}" title="${esc(k)}"></i>`);
    }
    const earned = BADGES.filter((b) => H.earned[b.id]).length;
    $('habits-body').innerHTML = `
      <div class="hb-streak">
        <svg class="ico hb-fire${n ? ' lit' : ''}" aria-hidden="true"><use href="#i-fire"/></svg>
        <div><b>${esc(T('streak_days', { n }))}</b><small>${esc(T('streak_best', { n: H.best }))}${set.has(today) ? '' : ' · ' + esc(T('streak_today_hint'))}</small></div>
      </div>
      <div class="hb-days" aria-label="${esc(T('streak_14'))}">${cells.join('')}</div>
      <h3>${esc(T('badges'))} <small>${earned}/${BADGES.length}</small></h3>
      <ul class="hb-badges">${BADGES.map((b) => `<li class="${H.earned[b.id] ? 'got' : ''}" title="${esc(T('badge_' + b.id + '_d'))}">
        <span class="hb-ic"><svg class="ico" aria-hidden="true"><use href="#i-${b.icon}"/></svg></span>
        <b>${esc(T('badge_' + b.id))}</b><small>${esc(T('badge_' + b.id + '_d'))}</small></li>`).join('')}</ul>`;
  }
  function open() {
    checkBadges(true);
    render();
    N.openDlg('habits-dlg');
  }
  document.querySelectorAll('[data-open="habits"]').forEach((b) => { b.onclick = () => { N.closeDlg('settings'); N.closeDlg('puzzle-dlg'); open(); }; });
  document.querySelectorAll('[data-open="learn"]').forEach((b) => { b.onclick = () => { N.closeDlg('settings'); window.CaroLearn.open(); }; });

  window.addEventListener('langchange', () => { if (N && N.isOpen('habits-dlg')) render(); });
  window.CaroHabits = { open, streak, BADGES, get data() { return H; } };
})();
