/*
 * Thẻ người chơi trên / dưới bàn cờ (như màn chơi của Lichess): ảnh, tên, Elo / điểm, quân X / O và đồng hồ.
 *   dưới – mình (với máy, online) hoặc X (2 người cùng máy, xem ván, xem lại); trên – đối thủ.
 * Người đang tới lượt: thẻ sáng lên, đồng hồ chạy. Đồng hồ là chính các ô #ck-x / #ck-o của app.js (app.js vẫn tự cập nhật số),
 * module này chỉ chuyển chúng vào đúng thẻ. Dữ liệu lấy từ CaroApp.players; app.js gọi render() mỗi khi giao diện đổi.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const App = window.CaroApp;
  const T = window.I18N.t;
  const esc = App.esc;
  const Bots = window.CaroBots;
  const glyph = (p) => (p === 1 ? '<b class="x">X</b>' : '<b class="o">O</b>');

  function avatar(p) {
    if (p.bot && window.CaroBotPicker) return window.CaroBotPicker.avatarHtml(p.bot, 'sm');
    const ch = [...String(p.name || '?').trim()][0] || '?';
    return `<span class="pl-av ${p.side === 1 ? 'x' : 'o'}">${esc(ch.toUpperCase())}</span>`;
  }
  function sub(p, thinking) {
    if (p.bot) {
      const b = Bots.get(p.bot);
      if (thinking && p.turn) return `<span class="thinking">${esc(T('thinking'))}</span>`;
      return b ? `~${b.elo} · ${esc(T('style_' + b.style))}` : '';
    }
    if (p.offline) return `<span class="pl-off">${esc(T('disconnected'))}</span>`;
    if (p.rating) return `${p.rating}${p.prov ? '?' : ''}`;
    return '';
  }

  function fill(el, p, thinking) {
    el.classList.toggle('turn', !!p.turn);
    el.innerHTML = `${avatar(p)}<div class="pl-t"><b class="pl-name">${esc(p.name)}</b><small>${sub(p, thinking)}</small></div>
      <span class="pl-side">${glyph(p.side)}</span><span class="pl-ck"></span>`;
    el.querySelector('.pl-ck').appendChild($(p.side === 1 ? 'ck-x' : 'ck-o'));
  }

  function render() {
    const info = App.players;
    const top = $('pl-top'), bot = $('pl-bot');
    const on = !!info;
    top.hidden = bot.hidden = !on;
    // Trả ô đồng hồ về thanh trên trước khi vẽ lại thẻ (giải đố / bài học: để luôn ở đó)
    $('clocks').append($('ck-x'), $('ck-o'));
    if (!on) return;
    fill(top, info.top, info.thinking);
    fill(bot, info.bottom, info.thinking);
  }

  window.addEventListener('langchange', render);
  window.CaroStrips = { render };
  render();
})();
