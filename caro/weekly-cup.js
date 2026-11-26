/*
 * Thẻ "Giải tuần" ở Trang chủ (cột trái, trên thẻ Giải đấu): máy chủ tự tạo một giải mỗi tuần (server/src/hub/weekly-cup.js).
 * Thẻ hiện tên, giờ bắt đầu theo GIỜ THIẾT BỊ người xem (Intl, như Tổng kết), đếm ngược, số người đã đăng ký, nút Đăng ký /
 * Vào giải, kết quả tuần trước + "Chia sẻ kết quả" (share-link.js, link /?t=<giải> có thẻ xem trước).
 * Bản cổng game (portal.js – không đăng nhập) và bản không có máy chủ: ẩn thẻ.
 * Cũng dùng cho: danh hiệu trên hồ sơ (titleText – profile-badges.js), dòng trạng thái quản trị (adminHtml – tour-admin.js).
 * Tin nhắn: gửi { t: 'weeklyCup' } → nhận { t: 'weeklyCup', on, cup, last, now }.
 * API: window.CaroWeekly = { refresh, titleText, adminHtml }
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const O = window.CaroOnline;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const locale = () => window.I18N.locale || document.documentElement.lang || 'vi'; // vd. en → en-GB (caro/langs.js intl)
  const portal = () => !!(window.CaroPortal && window.CaroPortal.on);
  const D = { data: null, skew: 0, timer: 0, asked: 0 };

  /** Giờ theo múi giờ của thiết bị (không đặt timeZone): "CN, 29/11, 20:00 GMT+7". */
  const when = (ms) => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(ms);
  function left(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    if (d) return T('cd_days', { d, h });
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }
  const now = () => Date.now() + D.skew;
  const me = () => O && O.state.me && !O.state.me.guest ? O.state.me : null;
  const icon = (n) => `<svg class="ico i-in" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const nameOf = (x) => (x.weekly ? T('wc_name', { n: x.weekly }) : x.name);

  /** Dòng đếm ngược (cập nhật mỗi giây). */
  function cdText(c) {
    if (c.status === 'running') return c.endsAt ? T('wc_live', { t: left(c.endsAt - now()) }) : T('wc_tag');
    return T('wc_cd', { t: left(c.startsAt - now()) });
  }

  function html(m) {
    const c = m.cup, last = m.last;
    let h = `<p class="wc-eyebrow">${icon('trophy')}<span class="ellip">${esc(T('wc_eyebrow'))}</span></p>`;
    if (c) {
      const meta = window.CaroTourKit && window.CaroTourKit.metaHtml ? window.CaroTourKit.metaHtml(c) : '';
      h += `<h3 class="wc-name" title="${esc(c.name)}"><span class="ellip">${esc(nameOf(c))}</span></h3>
        ${meta ? `<p class="wc-meta">${meta}</p>` : ''}
        <p class="wc-when">${esc(T('wc_starts', { t: when(c.startsAt) }))}</p>
        <p class="wc-cd"><b data-wc-cd role="timer">${esc(cdText(c))}</b> · <span>${esc(T('wc_count', { n: c.count }))}</span></p>`;
      const b = [];
      if (c.joined) {
        b.push(`<span class="pill mine">${icon('check')}${esc(T('wc_joined'))}</span>`);
        b.push(`<button type="button" class="primary sm" data-wc="open">${esc(T('wc_open'))}</button>`);
      } else if (c.canJoin) b.push(`<button type="button" class="primary sm" data-wc="join">${esc(T('wc_join'))}</button>`);
      else if (!me() && (c.status === 'scheduled' || c.status === 'running')) b.push(`<button type="button" class="primary sm" data-wc="login">${esc(T('wc_login'))}</button>`);
      if (!c.joined) b.push(`<button type="button" class="ghost sm" data-wc="open">${esc(T('wc_view'))}</button>`);
      h += `<div class="row wc-act">${b.join('')}</div><p class="hint">${esc(T('wc_prize'))}</p>`;
    }
    if (last) {
      h += `<p class="wc-last">${icon('medal')}<span>${esc(T('wc_last', { n: last.weekly, name: last.podium[0] || '—' }))}</span></p>
        <div class="row wc-act"><button type="button" class="ghost sm" data-wc="last">${esc(T('wc_last_btn'))}</button>
        <button type="button" class="ghost sm" data-wc="share">${icon('link')}${esc(T('wc_share'))}</button></div>`;
    }
    return h;
  }

  function render() {
    const el = $('weekly-card');
    if (!el) return;
    const m = D.data;
    const show = !!(m && m.on && (m.cup || m.last)) && !portal();
    el.hidden = !show;
    clearInterval(D.timer);
    D.timer = 0;
    if (!show) return;
    el.innerHTML = html(m);
    if (m.cup) D.timer = setInterval(tick, 1000);
  }

  function tick() {
    const el = $('weekly-card');
    const c = D.data && D.data.cup;
    const cd = el && el.querySelector('[data-wc-cd]');
    if (!c || !cd || el.hidden || (window.CaroShell && window.CaroShell.current !== 'home')) { clearInterval(D.timer); D.timer = 0; return; }
    cd.textContent = cdText(c);
    // Tới giờ bắt đầu / kết thúc: hỏi lại máy chủ (trạng thái đổi) – tối đa mỗi 30 giây một lần
    const edge = c.status === 'running' ? c.endsAt : c.startsAt;
    if (edge && now() >= edge && Date.now() - D.asked > 30000) refresh();
  }

  function refresh() {
    if (!O || !O.connected || portal()) return;
    D.asked = Date.now();
    O.send({ t: 'weeklyCup' });
  }

  function shareUrl(x) {
    const base = (window.CARO_SERVER || location.origin).replace(/\/+$/, '');
    const u = new URL(base + '/');
    u.searchParams.set('t', x.slug || x.id);
    return u.toString();
  }

  function onClick(e) {
    const b = e.target.closest('[data-wc]');
    if (!b || !D.data) return;
    const { cup, last } = D.data;
    const a = b.dataset.wc;
    if (a === 'join' && cup) { O.send({ t: 'tourJoin', id: cup.id }); refresh(); } // máy chủ xử lý theo thứ tự: nhận bản mới sau khi đăng ký
    else if (a === 'open' && cup && window.CaroTour) window.CaroTour.open(cup.id);
    else if (a === 'login' && O.openAuth) O.openAuth('login');
    else if (a === 'last' && last && window.CaroTour) window.CaroTour.open(last.id);
    else if (a === 'share' && last && window.CaroShareLink) {
      const name = nameOf(last);
      window.CaroShareLink.send({ url: shareUrl(last), title: name, text: T('wc_share_text', { name, winner: last.podium[0] || '—' }) });
    }
  }

  /** Danh hiệu trên hồ sơ: { k: 'wc', n, p } → "Vô địch Cúp tuần Caro #3". */
  const titleText = (x) => T('wc_title_' + (x.p | 0), { n: x.n | 0 });

  /** Dòng trạng thái Giải tuần trong số liệu máy chủ (chỉ quản trị viên – api.js adminStats.weekly). */
  function adminHtml(w) {
    if (!w) return '';
    let line;
    if (!w.on) line = T('wc_adm_off');
    else if (w.next) line = T('wc_adm_on', { t: when(w.next.startsAt), n: w.next.count, cfg: w.cfg });
    else line = T('wc_adm_none', { cfg: w.cfg });
    const warn = (w.warn || []).length ? `<br><span class="loss">${esc(T('wc_adm_warn', { w: w.warn.join('; ') }))}</span>` : '';
    return `<p class="hint wc-adm">${icon('trophy')}${esc(line)}${warn}</p>`;
  }

  window.CaroWeekly = { refresh, titleText, adminHtml };
  if (!O || !$('weekly-card')) return;
  $('weekly-card').addEventListener('click', onClick);
  O.on('weeklyCup', (m) => {
    D.data = m;
    D.skew = (m.now || Date.now()) - Date.now();
    render();
  });
  O.on('welcome', refresh);
  O.on('close', () => { D.data = null; render(); });
  // Vào lại Trang chủ / đổi ngôn ngữ: hỏi lại (số người đăng ký, trạng thái), vẽ lại theo ngôn ngữ mới
  window.addEventListener('caro:page', (e) => { if (e.detail.id === 'home') refresh(); });
  window.addEventListener('langchange', render);
  if (O.connected) refresh();
})();
