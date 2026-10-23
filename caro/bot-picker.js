/*
 * Bảng chọn nhân vật máy (dùng chung cho hộp "Ván mới" và Cài đặt):
 *   hàng nút lối đánh (Tấn công / Phòng thủ / Nước đôi / Gài bẫy) → 6 thẻ nhân vật của lối đó theo mức sức cờ
 *   (ảnh đại diện, biểu tượng, tên, Elo; mức chưa mở khoá thì mờ đi) → khung giới thiệu nhân vật đang chọn
 *   (ảnh lớn, lối đánh, mô tả nhân vật, mô tả lối đánh).
 * Ô chọn là các radio name="bot" nằm trong form chứa bảng, nên form.bot.value là nhân vật đang chọn.
 * Ngoại hình lấy từ bot-looks.js, số liệu từ bots.js, chữ từ i18n-bots.js; số mức đã mở khoá hỏi CaroApp.
 */
(function () {
  'use strict';
  const Bots = window.CaroBots;
  const T = window.I18N.t;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STYLE_ICON = { atk: 'bolt', def: 'shield', dbl: 'fork', trap: 'eye', uni: 'star' };
  const FALLBACK = { avatar: '', icon: '', color: '#64748b' };

  const look = (id) => (window.CaroBotLooks && window.CaroBotLooks[id]) || FALLBACK;
  const name = (id) => T('bot_' + id);
  const isImg = (s) => /[./]/.test(s);
  const unlocked = () => (window.CaroApp && window.CaroApp.unlockedTiers ? window.CaroApp.unlockedTiers() : Bots.START_UNLOCKED);

  /** Biểu tượng nhỏ của nhân vật (emoji hoặc ảnh). */
  function iconHtml(id) {
    const ic = look(id).icon;
    if (!ic) return '';
    return isImg(ic) ? `<img class="bot-ic" src="${esc(ic)}" alt="">` : `<i class="bot-ic" aria-hidden="true">${esc(ic)}</i>`;
  }
  /** Ảnh đại diện có viền màu riêng; không có ảnh thì hiện chữ cái đầu của tên. */
  function avatarHtml(id, cls) {
    const L = look(id);
    const inner = L.avatar ? `<img src="${esc(L.avatar)}" alt="">` : esc([...name(id).split(' ').pop()][0] || '?');
    return `<span class="bot-av${cls ? ' ' + cls : ''}" style="--c:${esc(L.color)}">${inner}${iconHtml(id)}</span>`;
  }
  const styleTag = (st) => `<span class="style-tag st-${esc(st)}"><svg class="ico i-in" aria-hidden="true"><use href="#i-${STYLE_ICON[st]}"/></svg>${esc(T('style_' + st))}</span>`;

  /**
   * Nhãn sức cờ. BOAT chạy Rapfi (engine vô địch Gomocup; luật Việt Nam: Rapfi-CARO) thì mạnh hơn hẳn ~2700 – không gán
   * một con số Elo bịa ra: ghi "Rapfi" (đủ chỗ thì ghi rõ Rapfi-CARO ở luật Việt Nam).
   */
  function eloText(b, long) {
    const R = window.CaroRapfi;
    if (!(b.rapfi && R && R.available('free'))) return long ? `~${b.elo} Elo` : '~' + b.elo;
    return long ? T('boat_elo_rapfi') : 'Rapfi';
  }

  /** Khung giới thiệu nhân vật id. */
  function sayHtml(id) {
    const b = Bots.get(id);
    return `${avatarHtml(id, 'lg')}<div class="bs-text">
      <b style="color:var(--c)">${esc(name(id))}</b> <span class="bs-meta">${esc(eloText(b, true))} · ${styleTag(b.style)}</span>
      <span class="bs-desc">${esc(T('bot_' + id + '_desc'))}</span>
      <small>${esc(T('style_' + b.style + '_d'))}</small></div>`;
  }

  const mounted = new Map(); // phần tử gốc -> lối đánh đang xem

  /** Vẽ bảng chọn vào root, chọn sẵn nhân vật selected. */
  function render(root, selected) {
    const cur = Bots.get(selected);
    const style = mounted.get(root) && mounted.get(root).keep ? mounted.get(root).style : cur ? cur.style : 'atk';
    mounted.set(root, { style });
    root.classList.add('bot-picker');
    root.innerHTML = `<div class="seg style-tabs" role="radiogroup" aria-label="${esc(T('bot_style'))}">${Bots.STYLES.map((st) =>
      `<label><input type="radio" name="botStyle" value="${st}"${st === style ? ' checked' : ''}><svg class="ico i-in" aria-hidden="true"><use href="#i-${STYLE_ICON[st]}"/></svg><span>${esc(T('style_' + st))}</span></label>`).join('')}</div>
      <div class="bot-grid"></div><div class="bot-say" aria-live="polite"></div>`;
    renderCards(root, selected);
  }

  function renderCards(root, selected) {
    const n = unlocked();
    const style = mounted.get(root).style;
    const list = Bots.BOTS.filter((b) => b.style === style);
    // Nhân vật đang chọn không thuộc lối này: chọn nhân vật cùng mức của lối mới (nếu đã mở khoá)
    if (!list.some((b) => b.id === selected)) {
      const t = Bots.get(selected) ? Bots.get(selected).tier : 2;
      const same = list.find((b) => b.tier === Math.min(t, n));
      selected = same ? same.id : list[0].id;
    }
    root.querySelector('.bot-grid').innerHTML = list.map((b) => {
      const locked = b.tier - 1 >= n;
      return `<label class="bot-card${locked ? ' locked' : ''}" style="--c:${esc(look(b.id).color)}" title="${esc(locked ? T('tier_locked', { elo: Bots.TIERS[b.tier - 2].elo }) : '')}">
        <input type="radio" name="bot" value="${b.id}"${locked ? ' disabled' : ''}${b.id === selected ? ' checked' : ''}>
        ${avatarHtml(b.id)}<b>${esc(name(b.id))}</b><small>${locked ? '<svg class="ico i-in" aria-hidden="true"><use href="#i-lock"/></svg>' : esc(eloText(b, false))}</small></label>`;
    }).join('');
    renderSay(root);
  }

  function renderSay(root) {
    const on = root.querySelector('input[name="bot"]:checked');
    const say = root.querySelector('.bot-say');
    say.innerHTML = on ? sayHtml(on.value) : '';
    if (on) say.style.setProperty('--c', look(on.value).color);
  }

  document.addEventListener('change', (e) => {
    const root = e.target.closest && e.target.closest('.bot-picker');
    if (!root || !mounted.has(root)) return;
    if (e.target.name === 'botStyle') {
      e.stopPropagation();
      const was = root.querySelector('input[name="bot"]:checked');
      mounted.get(root).style = e.target.value;
      renderCards(root, was ? was.value : null);
      // Báo cho form biết nhân vật đang chọn có thể đã đổi (Cài đặt lưu ngay)
      const on = root.querySelector('input[name="bot"]:checked');
      if (on) on.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (e.target.name === 'bot') renderSay(root);
  }, true);

  // Đổi ngôn ngữ: vẽ lại các bảng đang hiện, giữ lối đánh và nhân vật đang chọn
  window.addEventListener('langchange', () => {
    for (const [root, st] of mounted) {
      if (!root.isConnected) continue;
      const on = root.querySelector('input[name="bot"]:checked');
      st.keep = true; // render() giữ lối đánh đang xem
      render(root, on ? on.value : null);
    }
  });

  window.CaroBotPicker = { render, look, avatarHtml, iconHtml, sayHtml, styleTag, STYLE_ICON };
})();
