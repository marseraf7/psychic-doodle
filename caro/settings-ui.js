/*
 * Trang Cài đặt dạng danh sách (như app Lichess): trang gốc gồm các hàng, bấm hàng có dấu › để mở trang con
 * (Âm thanh, Giao diện, Cài đặt bàn cờ, Ngôn ngữ, Ván cờ mặc định, Đối thủ máy, Lịch sử đấu trên máy này – local-save.js).
 *   - Hàng ở trang gốc hiện giá trị đang chọn bên phải (chữ nhỏ, màu nhạt).
 *   - Trang Giao diện có bàn cờ xem trước, vẽ lại ngay khi đổi nền / màu bàn / kiểu quân.
 *   - Nút ‹ ở trang con: về trang gốc của Cài đặt; ở trang gốc: về Xem thêm (shell.js).
 * Giá trị và việc lưu vẫn do app.js đảm nhận (form#settings-form, các ô name=… giữ nguyên).
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = window.I18N.t;
  const form = $('settings-form');
  const page = $('page-settings');
  let sub = 'root';

  const tcText = (v) => { const t = window.CaroTimeCtl.fromValue(v); return t.clock || window.I18N.tc(t.timeLimit, null); };
  const checkedText = (name) => {
    const el = form.querySelector(`input[name="${name}"]:checked`);
    const lab = el && el.closest('.li');
    const t = lab && lab.querySelector('.li-t');
    return t ? (t.firstElementChild || t).textContent.trim() : '';
  };
  /** Giá trị hiện bên phải mỗi hàng ở trang gốc. */
  function values() {
    const v = {
      sound: form.sound.checked ? checkedText('soundStyle') : T('off'),
      look: [checkedText('theme'), checkedText('board')].join(' · '),
      lang: checkedText('lang'),
      game: [form.mode.value === 'pvp' ? T('mode_pvp') : T('mode_ai'), T('grule_s_' + form.rule.value), form.tc ? tcText(form.tc.value) : ''].filter(Boolean).join(' · '),
      bot: form.bot ? T('bot_' + form.bot.value) : '',
      localhist: window.CaroLocalSave ? window.CaroLocalSave.valueText() : '', // Lịch sử đấu trên máy này (local-save.js)
    };
    form.querySelectorAll('[data-val]').forEach((el) => { el.textContent = v[el.dataset.val] || ''; });
  }

  function show(id) {
    sub = id;
    form.querySelectorAll('.sp').forEach((el) => { el.hidden = el.dataset.sp !== id; });
    const sp = form.querySelector(`.sp[data-sp="${id}"]`);
    const title = page.querySelector('.pg-title');
    title.dataset.i18n = id === 'root' ? 'settings' : sp.dataset.title;
    title.textContent = T(title.dataset.i18n);
    page.querySelector('.pg-body').scrollTo?.(0, 0);
    if (id === 'look') drawPreview();
    if (id === 'root') values();
  }

  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) show(b.dataset.go);
  });
  form.addEventListener('change', () => { values(); if (sub === 'look') requestAnimationFrame(drawPreview); });
  // Nút ‹: đang ở trang con thì về trang gốc của Cài đặt
  window.addEventListener('caro:back', (e) => {
    if (e.detail.id === 'settings' && sub !== 'root') { e.preventDefault(); show('root'); }
  });
  window.addEventListener('caro:page', (e) => { if (e.detail.id === 'settings') show('root'); });
  window.addEventListener('langchange', () => { if (window.CaroShell && window.CaroShell.current === 'settings') show(sub); });

  // ---------------------------------------------------------------- Bàn cờ xem trước (trang Giao diện)
  // Một góc bàn 7×4 ô với vài quân X / O và đường thắng, theo màu bàn + kiểu quân đang chọn.
  const PREVIEW = [[1, 1, 1], [2, 1, 2], [2, 2, 1], [3, 2, 2], [3, 3, 1], [4, 1, 2], [4, 2, 1], [5, 1, 2]];
  function drawPreview() {
    const cv = $('look-preview');
    if (!cv || !cv.isConnected || cv.offsetParent === null) return;
    const w = cv.clientWidth, cols = 7, rows = 4, s = w / cols, h = s * rows;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const css = (k) => cs.getPropertyValue(k).trim();
    ctx.fillStyle = css('--board') || css('--bg');
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = css('--board-grid') || css('--grid');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < cols; i++) { ctx.moveTo(i * s + 0.5, 0); ctx.lineTo(i * s + 0.5, h); }
    for (let j = 1; j < rows; j++) { ctx.moveTo(0, j * s + 0.5); ctx.lineTo(w, j * s + 0.5); }
    ctx.stroke();
    const colors = { x: css('--x'), o: css('--o') };
    const pieces = form.pieces.value;
    for (const [x, y, p] of PREVIEW) window.CaroStyle.drawStone(ctx, p, x * s + s / 2, y * s + s / 2, s, 1, colors, pieces);
    ctx.globalAlpha = 1;
  }
  window.CaroTheme.onChange(() => requestAnimationFrame(drawPreview));
  window.CaroStyle.onChange(() => requestAnimationFrame(drawPreview));
  window.addEventListener('resize', () => { if (sub === 'look') drawPreview(); });

  window.CaroSettingsUI = { show, values };
})();
