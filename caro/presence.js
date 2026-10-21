/*
 * Trạng thái cho bạn bè (như Messenger): máy báo máy chủ mình đang làm gì khi không đấu online – chơi với máy (kèm
 * nhân vật), 2 người một máy, giải đố, học, phân tích / luyện tập, xem ván (lệnh presence – server/src/hub/lobby.js).
 * Ván online thì máy chủ tự biết. Chỉ bạn bè thấy; khách không gửi.
 *
 *   CaroPresence.text(f) – chữ trạng thái của bạn bè f (thẻ trong danh sách bạn bè: status, game, act, bot, seen):
 *     "Đang chơi · Ghép trận nhanh · 3+2", "Đang chơi với máy · BOAT", "Offline · 5 phút trước"…
 *   CaroPresence.ago(ms)  – "5 phút trước" theo ngôn ngữ đang chọn
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const N = window.CaroOnline;
  const App = window.CaroApp;
  let page = null; // trang đang mở (shell.js – 'caro:page'); null = đang ở bàn cờ
  let sent = undefined, timer = 0;

  /** Đang làm gì trên máy này: { act, bot } hoặc null. */
  function current() {
    if (page) return { puzzles: { act: 'puzzle' }, learn: { act: 'learn' }, watch: { act: 'watch' } }[page] || null;
    if (!App || App.online) return null; // ván online: máy chủ tự biết
    if (App.ext) return { act: 'analysis' };
    const L = App.local;
    if (!L.moves && !L.winner) return null; // bàn trống: chưa chơi
    return L.mode === 'pvp' ? { act: 'local' } : { act: 'bot', bot: L.bot };
  }
  function push(force) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const S = N && N.state;
      if (!S || !S.me || S.me.guest || !N.connected) return;
      const now = current();
      const key = JSON.stringify(now);
      if (!force && key === sent) return;
      sent = key;
      N.send({ t: 'presence', ...(now || {}) });
    }, 800);
  }

  window.addEventListener('caro:page', (e) => { page = e.detail && e.detail.id; push(); });
  window.addEventListener('caro:board', () => { page = null; push(); });
  window.addEventListener('caro:online', () => push()); // vừa kết nối / đăng nhập
  if (N) N.on('welcome', () => { sent = undefined; push(true); }); // kết nối lại: máy chủ đã quên
  setInterval(() => push(), 15000); // ván với máy bắt đầu / kết thúc mà không đổi trang

  const locale = () => ({ vi: 'vi-VN', en: 'en-GB', ru: 'ru-RU', zh: 'zh-CN' }[window.I18N.lang] || 'vi-VN');
  function ago(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return T('pr_just_now');
    let rtf;
    try { rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'always' }); } catch (e) { return ''; }
    if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
    if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
    if (s < 86400 * 30) return rtf.format(-Math.floor(s / 86400), 'day');
    return rtf.format(-Math.floor(s / (86400 * 30)), 'month');
  }

  function text(f) {
    if (f.status === 'playing') {
      const g = f.game;
      if (!g) return T('st_playing');
      const tc = g.clock || g.timeLimit ? window.I18N.tc(g.timeLimit, g.clock) : '';
      return [T('st_playing'), T('pr_kind_' + g.kind), tc, g.rule && g.rule !== 'vn' ? T('grule_s_' + g.rule) : ''].filter(Boolean).join(' · ');
    }
    if (f.status === 'online') {
      if (f.act === 'bot') return f.bot ? T('pr_bot_name', { name: T('bot_' + f.bot) }) : T('pr_act_bot');
      return f.act ? T('pr_act_' + f.act) : T('st_online');
    }
    return f.seen ? T('pr_seen', { ago: ago(f.seen) }) : T('st_offline');
  }

  window.CaroPresence = { text, ago, current };
})();
