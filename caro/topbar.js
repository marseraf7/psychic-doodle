/*
 * Thanh trên (như Lichess): ô tìm kỳ thủ (player-search.js), Đăng nhập / Đăng ký (khách) hoặc ảnh đại diện (đã đăng nhập),
 * bánh răng mở Cài đặt nhanh (quick-settings.js).
 * Màn hình rộng: nằm cuối menu trên cùng (#tabbar); điện thoại: nằm ở đầu Trang chủ (thanh tab ở dưới đáy).
 * Không có máy chủ game: chỉ còn bánh răng.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = (k, a) => window.I18N.t(k, a);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tools = $('tb-tools');
  if (!tools) return;
  const O = window.CaroOnline;
  const wide = matchMedia('(min-width: 900px)');

  // ------------------------------------------------------------ Chỗ đặt: menu trên cùng / đầu Trang chủ
  function place() {
    const target = wide.matches ? $('tabbar') : document.querySelector('#page-home .pg-right');
    if (target && tools.parentElement !== target) target.appendChild(tools);
  }
  place();
  wide.addEventListener('change', place);

  // ------------------------------------------------------------ Tìm kỳ thủ
  const search = $('tb-search');
  const searchBtn = $('tb-search-btn');
  function openSearch(on) {
    tools.classList.toggle('searching', on);
    if (on) search.focus(); else { search.value = ''; search.blur(); }
  }
  searchBtn.onclick = () => openSearch(!tools.classList.contains('searching'));
  search.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== search && !search.value) openSearch(false); }, 200));
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') openSearch(false); });
  if (window.CaroPlayerSearch) window.CaroPlayerSearch.attach(search, { onPick: (u) => { openSearch(false); window.CaroProfile.open(u.id); } });

  // ------------------------------------------------------------ Đăng nhập / Đăng ký hoặc ảnh đại diện
  const auth = $('tb-auth');
  // Trước khi máy chủ trả lời (vài giây đầu), vùng này trước đây trống trơn trông như bị đăng xuất (loi-04).
  // Nay: có danh tính đã lưu cục bộ thì hiện ngay từ bản lưu; chưa có thì hiện khung chờ (skeleton);
  // máy chủ báo không có / đang ngoại tuyến hẳn thì hiện nút Đăng nhập / Đăng ký như với khách.
  const ME_KEY = 'caro.meCache';
  const guestBtns = () => `<button type="button" class="tb-link" data-auth="login">${esc(T('login'))}</button><button type="button" class="tb-btn" data-auth="register">${esc(T('tb_register'))}</button>`;
  function cacheMe(me) {
    try {
      if (me.guest) localStorage.removeItem(ME_KEY);
      else localStorage.setItem(ME_KEY, JSON.stringify({ name: me.name, username: me.username, av: me.av || 0, uid: me.uid || me.id }));
    } catch (e) { /* chế độ riêng tư */ }
  }
  function drawAuth() {
    const me = O && O.state.me;
    if (!me) {
      if (!O) { auth.innerHTML = ''; return; } // không có module online: chỉ còn bánh răng (như trước)
      if (document.body.classList.contains('no-online') || O.state.status === 'offline') { auth.innerHTML = guestBtns(); return; }
      try {
        const c = JSON.parse(localStorage.getItem(ME_KEY) || 'null');
        if (c && c.name) {
          auth.innerHTML = `<span class="tb-me cached" aria-busy="true">${window.CaroAvatar.html(c, 'sm')}<span class="tb-name">${esc(c.name)}</span></span>`;
          return;
        }
      } catch (e) { /* dữ liệu hỏng: dùng khung chờ */ }
      auth.innerHTML = '<span class="tb-skel" aria-hidden="true"><span class="tb-skel-av"></span><span class="tb-skel-bar"></span></span>';
      return;
    }
    cacheMe(me);
    if (me.guest) {
      auth.innerHTML = `<button type="button" class="tb-link" data-auth="login">${esc(T('login'))}</button><button type="button" class="tb-btn" data-auth="register">${esc(T('tb_register'))}</button>`;
    } else {
      auth.innerHTML = `<button type="button" class="tb-me" data-me title="${esc(me.name)} (@${esc(me.username)})">${window.CaroAvatar.html(me, 'sm')}<span class="tb-name">${esc(me.name)}</span></button>`;
    }
  }
  auth.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.auth) { O.connect(); O.openAuth(b.dataset.auth); return; }
    if (b.hasAttribute('data-me')) { const t = document.querySelector('#tabbar [data-tab="more"]'); if (t) t.click(); } // thẻ tài khoản ở Xem thêm
  };
  window.addEventListener('caro:online', drawAuth);
  window.addEventListener('langchange', drawAuth);
  drawAuth();

  // ------------------------------------------------------------ Cài đặt nhanh
  const gear = $('tb-gear');
  const panel = $('qs');
  window.CaroQuickSet.mount(panel);
  function openPanel(on) {
    panel.hidden = !on;
    gear.setAttribute('aria-expanded', String(on));
    gear.classList.toggle('on', on);
    if (on) window.CaroQuickSet.reset();
  }
  gear.onclick = (e) => { e.stopPropagation(); openPanel(panel.hidden); };
  panel.addEventListener('qs:close', () => openPanel(false));
  // Bấm ra ngoài / Esc / đổi trang: đóng
  document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target)) openPanel(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { openPanel(false); gear.focus(); } });
  window.addEventListener('caro:page', () => { if (!panel.hidden) openPanel(false); place(); });
})();
