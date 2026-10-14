/*
 * Thiết bị (như Google / Telegram): trong Cài đặt tài khoản, xem tài khoản đang đăng nhập ở những đâu – app hay trình
 * duyệt, hệ điều hành, đời máy, IP, lần hoạt động cuối, đang trực tuyến – và đăng xuất từ xa từng thiết bị / mọi thiết bị khác.
 * Máy chủ: server/src/hub/devices.js (tin nhắn devices / dropDevice / dropOtherDevices).
 * Thiết bị bị đăng xuất từ xa nhận 'loggedOut' (reason 'revoked') → online.js về làm khách, ở đây báo cho người chơi biết.
 * API: window.CaroDevices = { load() } – social.js gọi khi mở Cài đặt tài khoản.
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  if (!N) return;
  const T = window.I18N.t;
  const esc = window.CaroApp.esc;
  const $ = (id) => document.getElementById(id);
  let list = null; // danh sách lần gần nhất máy chủ gửi

  const locale = () => ({ vi: 'vi-VN', en: 'en-GB', ru: 'ru-RU', zh: 'zh-CN' }[window.I18N.lang]);
  function ago(ms) {
    const s = Math.max(0, Date.now() - ms) / 1000;
    if (s < 60) return T('dev_now');
    if (s < 3600) return T('dev_min', { n: Math.floor(s / 60) });
    if (s < 86400) return T('dev_hour', { n: Math.floor(s / 3600) });
    if (s < 30 * 86400) return T('dev_day', { n: Math.floor(s / 86400) });
    try { return new Date(ms).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return new Date(ms).toLocaleDateString(); }
  }

  /** Tên thiết bị: "Chrome trên Windows", "App Cờ Caro trên Android 14 · SM-S918B"… */
  function name(d) {
    const what = d.app ? T('dev_app') : d.browser;
    let s = what && d.os ? T('dev_on', { a: what, b: d.os }) : what || d.os || T('dev_unknown');
    if (d.model && !/^iP(hone|ad|od)$/.test(d.model)) s += ' · ' + d.model;
    return s;
  }

  function render() {
    const el = $('devices-list');
    if (!el) return;
    if (!list) { el.innerHTML = '<li class="empty">…</li>'; $('devices-others').hidden = true; return; }
    el.innerHTML = list.map((d) => {
      const status = d.current ? T('dev_this') : d.online ? T('dev_online') : T('dev_seen', { when: ago(d.seen) });
      const meta = [d.ip ? T('dev_ip', { ip: d.ip }) : '', T('dev_signed', { when: ago(d.created) })].filter(Boolean).join(' · ');
      return `<li class="dev${d.current ? ' cur' : ''}">
        <svg class="ico dev-ic" aria-hidden="true"><use href="#i-${d.mobile ? 'phone' : 'monitor'}"/></svg>
        <div class="pn"><b>${esc(name(d))}</b>
          <small><span class="dev-st${d.online ? ' on' : ''}">${esc(status)}</span> · ${esc(meta)}</small></div>
        ${d.current ? '' : `<button type="button" class="ghost sm" data-drop="${esc(d.id)}">${esc(T('dev_logout'))}</button>`}
      </li>`;
    }).join('') + (list.length < 2 ? `<li class="empty">${esc(T('dev_only_this'))}</li>` : '');
    $('devices-others').hidden = list.length < 2;
  }

  function load() {
    const me = N.state.me;
    const card = $('devices-card');
    if (card) card.hidden = !me || me.guest;
    if (!me || me.guest) return;
    list = null;
    render();
    N.send({ t: 'devices' });
  }

  N.on('devices', (m) => { list = m.list || []; render(); });
  // Thiết bị này bị đăng xuất từ xa (từ mục Thiết bị của thiết bị khác, hoặc đổi mật khẩu)
  N.on('loggedOut', (m) => {
    if (m.reason !== 'revoked') return;
    N.closeDlg('account-dlg');
    N.toast(T('srv_session_revoked'), 5000);
  });

  $('devices-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-drop]');
    const d = b && list && list.find((x) => x.id === b.dataset.drop);
    if (d && confirm(T('dev_confirm_one', { name: name(d) }))) N.send({ t: 'dropDevice', id: d.id });
  });
  $('devices-others').onclick = () => { if (confirm(T('dev_confirm_others'))) N.send({ t: 'dropOtherDevices' }); };
  window.addEventListener('langchange', () => { if (N.isOpen('account-dlg')) render(); });

  window.CaroDevices = { load, name };
})();
