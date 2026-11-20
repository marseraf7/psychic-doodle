/*
 * Trang chủ – thẻ cho người mới (lần đầu mở, chưa chơi ván nào): một nút lớn "Chơi với máy", bấm một lần là vào ván với
 * nhân vật máy mặc định (dễ – App.local.bot, người mới: Anh Độ), luật đang chọn, cầm X.
 * Ẩn hẳn (lưu caro.hero) khi đã chơi xong một ván (caro:gameover) hoặc bấm ✕. Không hiện cho người đã chơi trên máy này:
 * có Lịch sử đấu trên máy, đã mở khoá nhân vật, đã đăng nhập, ván cục bộ đang dở / đã có tỉ số.
 * Đang có thẻ "Tiếp tục ván" (home.js) thì nhường chỗ cho thẻ đó.
 * Trình duyệt tự động (navigator.webdriver) không hiện – giữ nguyên bố cục cho các bài thử khác – trừ khi đặt caro.heroE2E.
 * Nối: index.html (#home-hero), home.js (CaroHome.render → caro:page), app.js (startPreset), i18n-shell.js (home_hero_*).
 * API: window.CaroHomeHero = { render, played }
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = window.I18N.t;
  const App = window.CaroApp;
  const KEY = 'caro.hero';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return 'x'; } }; // chế độ riêng tư: coi như đã chơi
  const json = (k, d) => { try { return JSON.parse(get(k)) || d; } catch (e) { return d; } };

  /** Đã chơi trên máy này (hoặc đã ẩn thẻ)? */
  function played() {
    if (get(KEY) || get('caro.bots') || get('caro.token')) return true;
    if ((json('caro.lg.index', []) || []).length) return true;
    const v = json('caro.v1', null);
    return !!(v && ((v.moves && v.moves.length) || (v.score && Object.values(v.score).some(Boolean))));
  }
  const done = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* riêng tư */ } };

  function render() {
    const el = $('home-hero');
    if (!el) return;
    const robot = navigator.webdriver && !get('caro.heroE2E');
    const busy = !$('home-resume').hidden; // đã có thẻ Tiếp tục ván
    el.hidden = robot || busy || played();
    if (el.hidden) return;
    el.innerHTML = `<button type="button" class="primary home-hero-go" data-hero-go><svg class="ico" aria-hidden="true"><use href="#i-cpu"/></svg><span>${App.esc(T('home_vs_bot'))}</span></button>
      <p class="hint">${App.esc(T('home_hero_hint'))}</p>
      <button type="button" class="x-close home-hero-x" data-hero-x aria-label="${App.esc(T('home_hero_hide'))}" title="${App.esc(T('home_hero_hide'))}">✕</button>`;
  }

  $('home-hero').addEventListener('click', (e) => {
    if (e.target.closest('[data-hero-x]')) { done(); render(); return; }
    if (e.target.closest('[data-hero-go]')) {
      const L = App.local;
      App.startPreset({ rule: L.rule || 'vn', bot: L.bot || 'ti', human: window.Caro.X, moves: [] });
    }
  });
  // Chơi xong ván đầu tiên (với máy hay 2 người): thôi hiện
  window.addEventListener('caro:gameover', () => { done(); render(); });
  window.addEventListener('caro:page', (e) => { if (e.detail.id === 'home') render(); });
  window.addEventListener('langchange', render);

  window.CaroHomeHero = { render, played };
  render();
})();
