/*
 * Cài đặt nhanh (bấm bánh răng trên thanh trên – topbar.js), gọn như bảng cài đặt của Lichess: Ngôn ngữ, Âm thanh,
 * Giao diện (sáng / tối), Bàn cờ, Quân cờ, Ảnh nền, "Tất cả cài đặt", và cuối bảng PING / MÁY CHỦ.
 * Mỗi mục có trang con trong chính bảng (chọn xong thì quay về). Đổi giá trị qua CaroApp.setSetting – đúng như khi đổi
 * trong trang Cài đặt (app-dialogs.js lưu và áp dụng). Các lựa chọn lấy từ chính trang Cài đặt (form#settings-form),
 * nên thêm lựa chọn ở đó là bảng này có theo.
 *
 *   CaroQuickSet.mount(el) – vẽ bảng vào el · CaroQuickSet.reset() – về trang gốc của bảng
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const form = document.getElementById('settings-form');
  // Mục có trang con: tên ô trong form#settings-form → tiêu đề, biểu tượng
  const SUBS = [
    { name: 'lang', title: 'language', icon: 'i-globe' },
    { name: 'soundStyle', title: 'set_sound', icon: 'i-sound', toggle: 'sound' },
    { name: 'theme', title: 'theme', icon: 'i-palette' },
    { name: 'board', title: 'set_look_board', icon: 'i-board' },
    { name: 'pieces', title: 'set_look_pieces', icon: 'i-star' },
  ];
  let el = null, sub = null, net = null;

  /** Các lựa chọn của ô name trong form: [{ value, text, swatch }]. */
  function options(name) {
    return [...form.querySelectorAll(`input[type="radio"][name="${name}"]`)].map((inp) => {
      const li = inp.closest('.li');
      const t = li && li.querySelector('.li-t');
      const sw = li && li.querySelector('.swatch');
      return { value: inp.value, text: t ? (t.firstElementChild || t).textContent.trim() : inp.value, swatch: sw ? sw.getAttribute('style') : '' };
    });
  }
  /** Giá trị đang dùng (theo trạng thái thật, không theo form – form chỉ được điền khi mở Cài đặt). */
  function current(name) {
    switch (name) {
      case 'lang': return window.I18N.lang;
      case 'soundStyle': return window.CaroSound.style;
      case 'theme': return window.CaroTheme.get();
      case 'board': return window.CaroStyle.board;
      case 'pieces': return window.CaroStyle.pieces;
      default: return '';
    }
  }
  const textOf = (name) => (options(name).find((o) => o.value === current(name)) || {}).text || '';
  const ico = (id) => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  const tog = (key, on) => `<button type="button" class="qs-row" role="switch" aria-checked="${on}" data-tog="${key}">${ico(key === 'sound' ? 'i-sound' : 'i-image')}<span class="qs-t">${esc(T(key === 'sound' ? 'sound_on' : 'qs_bg'))}</span><span class="qs-sw${on ? ' on' : ''}"></span></button>`;

  function netHtml() {
    const ms = (v) => (typeof v === 'number' ? v + ' ms' : '–');
    return `<div class="qs-net" title="${esc(T('qs_ping_d'))}"><span>${esc(T('qs_ping'))} <b>${ms(net && net.rtt)}</b></span><span>${esc(T('qs_server'))} <b>${ms(net && net.lag)}</b></span></div>`;
  }

  function draw() {
    if (!el) return;
    if (sub) {
      const s = SUBS.find((x) => x.name === sub);
      const cur = current(sub);
      el.innerHTML = `<button type="button" class="qs-row qs-head" data-back>${ico('i-chevl')}<span class="qs-t">${esc(T(s.title))}</span></button>
        ${s.toggle ? tog('sound', window.CaroSound.enabled) : ''}
        ${options(sub).map((o) => `<button type="button" class="qs-row qs-opt${o.value === cur ? ' on' : ''}" data-v="${esc(o.value)}">${o.swatch ? `<i class="swatch" style="${esc(o.swatch)}"></i>` : ''}<span class="qs-t">${esc(o.text)}</span>${o.value === cur ? ico('i-check') : ''}</button>`).join('')}`;
    } else {
      el.innerHTML = SUBS.map((s) => `<button type="button" class="qs-row" data-sub="${s.name}">${ico(s.icon)}<span class="qs-t">${esc(T(s.title))}</span><span class="qs-v">${esc(s.toggle && !window.CaroSound.enabled ? T('off') : textOf(s.name))}</span>${ico('i-chev')}</button>`).join('') +
        (window.CaroBackdrop ? tog('bg', window.CaroBackdrop.on) : '') +
        `<button type="button" class="qs-row" data-all>${ico('i-sliders')}<span class="qs-t">${esc(T('qs_all'))}</span>${ico('i-chev')}</button>` +
        (document.body.classList.contains('no-online') ? '' : netHtml());
    }
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation(); // bảng vẽ lại ngay: không để thanh trên coi là bấm ra ngoài
    if (b.dataset.sub) sub = b.dataset.sub;
    else if (b.hasAttribute('data-back')) sub = null;
    else if (b.dataset.v != null) { window.CaroApp.setSetting(sub, b.dataset.v); sub = null; }
    else if (b.dataset.tog === 'sound') window.CaroApp.setSetting('sound', !window.CaroSound.enabled);
    else if (b.dataset.tog === 'bg') window.CaroBackdrop.set(!window.CaroBackdrop.on);
    else if (b.hasAttribute('data-all')) { el.dispatchEvent(new CustomEvent('qs:close', { bubbles: true })); return document.getElementById('btn-settings').click(); }
    draw();
  }

  function mount(target) {
    el = target;
    el.addEventListener('click', onClick);
    draw();
  }
  function reset() { sub = null; draw(); }

  if (window.CaroOnline) window.CaroOnline.on('pong', (m) => { net = m; if (el && !el.hidden && !sub) draw(); });
  window.addEventListener('langchange', draw);

  window.CaroQuickSet = { mount, reset };
})();
