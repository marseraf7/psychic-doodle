/*
 * Đăng nhập bằng Telegram Mini App / VK Mini App (Đợt 3). Máy chủ kiểm chữ ký: server/src/host-auth.js + hub/host-login.js.
 * Chỉ chạy trong Mini App (window.CARO_HOST = 'telegram' | 'vk' – host-detect.js) và khi máy chủ bật nền tảng đó (tin welcome
 * có hostAuth: ['telegram', 'vk'] – máy chủ chưa đặt TELEGRAM_BOT_TOKEN / VK_APP_SECRET thì danh sách rỗng, không hiện gì).
 *  – Dữ liệu khởi chạy có chữ ký: Telegram – Telegram.WebApp.initData (nguyên văn); VK – chuỗi vk_…&sign=… host-detect.js đã
 *    chép vào sessionStorage 'caro.vkLaunch' lúc mở (địa chỉ có thể bị đổi sau đó). Không lưu thêm ở đâu, không gửi đi đâu
 *    ngoài máy chủ game.
 *  – Khách mở Mini App: gửi hostLogin mode 'auto' (im lặng). Đã liên kết → máy chủ đăng nhập như thường (auth + welcome; tiến
 *    độ trên máy gộp vào tài khoản – progress-sync.js). Chưa liên kết → thẻ tài khoản hiện nút "Lưu tiến độ bằng Telegram / VK"
 *    (mode 'create': tạo tài khoản không mật khẩu, mang tiến độ khách sang).
 *  – Đang đăng nhập tài khoản Caro chưa liên kết → nút "Liên kết Telegram / VK", hỏi xác nhận (CaroConfirm) rồi mode 'link'.
 *  – Đăng xuất / bị đăng xuất từ xa / xoá tài khoản trong Mini App: phiên này thôi tự đăng nhập ('caro.hostNoAuto' trong
 *    sessionStorage) – không thì đăng xuất xong lại tự vào ngay.
 *  – Cài đặt tài khoản (mọi nơi, cả web): mục "Telegram và VK" liệt kê nền tảng đã liên kết, nút Huỷ liên kết (tài khoản không
 *    còn cách đăng nhập nào khác thì cảnh báo rõ trước khi huỷ). social.js gọi CaroHostAuth.fill() khi vẽ hộp Tài khoản.
 * window.CaroHostAuth = { host, state, launchData(), fill() }.
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  if (!N) return;
  const T = window.I18N.t;
  const esc = window.CaroApp.esc;
  const $ = (id) => document.getElementById(id);
  const NAME = { telegram: 'Telegram', vk: 'VK' };
  const HOST = NAME[window.CARO_HOST] ? window.CARO_HOST : null;
  const ss = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* riêng tư */ } },
  };
  const NO_AUTO = 'caro.hostNoAuto';
  let providers = []; // nền tảng máy chủ bật (welcome.hostAuth)
  let state = null; // null (chưa biết / đang hỏi) | 'unlinked' | 'failed' | 'linked'
  let autoSent = false; // mỗi lần tải trang chỉ thử im lặng một lần

  /** Dữ liệu khởi chạy có chữ ký của nền tảng đang chạy ('' nếu không có). */
  function launchData() {
    if (HOST === 'telegram') {
      const W = window.Telegram && window.Telegram.WebApp;
      return (W && typeof W.initData === 'string' && W.initData) || '';
    }
    if (HOST === 'vk') return ss.get('caro.vkLaunch') || '';
    return '';
  }
  const on = () => !!HOST && providers.includes(HOST) && !!launchData();
  const me = () => N.state.me;

  /** Tên gợi ý cho tài khoản mới (VK không có tên trong tham số khởi chạy): tên khách tự đặt, hoặc tên VK qua VK Bridge. */
  function suggestName() {
    let own = '';
    try { own = localStorage.getItem('caro.guestName') || ''; } catch (e) { /* riêng tư */ }
    if (own || HOST !== 'vk' || !window.vkBridge) return Promise.resolve(own);
    const ask = window.vkBridge.send('VKWebAppGetUserInfo').then((u) => (u && typeof u.first_name === 'string' ? u.first_name : ''), () => '');
    return Promise.race([ask, new Promise((r) => setTimeout(() => r(''), 1500))]);
  }

  function login(mode, name) {
    const data = launchData();
    if (!data) return false;
    const m = { t: 'hostLogin', provider: HOST, data, mode };
    if (name) m.name = String(name).slice(0, 64);
    return N.send(m);
  }

  async function save(btn) {
    btn.disabled = true;
    ss.set(NO_AUTO, null); // người chơi tự bấm: lại cho tự đăng nhập ở các lần mở sau trong phiên
    const name = await suggestName();
    if (!login('create', name)) btn.disabled = false;
  }

  async function link() {
    const m = me();
    if (!m || m.guest) return;
    if (!(await window.CaroConfirm.ask(T('hostauth_link_q', { host: NAME[HOST], name: '@' + m.username })))) return;
    login('link');
  }

  /** Thẻ tài khoản (online-auth.js vẽ lại sau mỗi lần render → sự kiện caro:online): thêm một hàng của Mini App. */
  function renderCard() {
    const el = $('account');
    if (!el) return;
    const old = $('host-auth-row');
    if (old) old.remove();
    const m = me();
    if (!m || !on() || N.state.status !== 'online') return;
    const host = NAME[HOST];
    let html = '';
    if (m.guest) {
      // Đang hỏi im lặng (state null) thì chưa hiện nút – tránh nút nháy rồi biến mất khi đã liên kết
      if (state === 'unlinked' || (state === null && ss.get(NO_AUTO))) {
        html = `<div class="row"><button type="button" class="primary" id="host-auth-save">${esc(T('hostauth_save', { host }))}</button></div>
          <p class="hint">${esc(T('hostauth_save_hint', { host }))}</p>`;
      }
    } else if ((m.hosts || []).includes(HOST)) {
      html = `<div class="row"><span class="tag">${esc(T('hostauth_linked_tag', { host }))}</span></div>`;
    } else if (!m.admin) { // máy chủ không cho tài khoản quản trị liên kết
      html = `<div class="row"><button type="button" class="ghost" id="host-auth-link">${esc(T('hostauth_link_btn', { host }))}</button></div>`;
    }
    if (!html) return;
    el.insertAdjacentHTML('beforeend', `<div id="host-auth-row">${html}</div>`);
    const s = $('host-auth-save'), l = $('host-auth-link');
    if (s) s.onclick = () => save(s);
    if (l) l.onclick = link;
  }

  /** Mục "Telegram và VK" trong Cài đặt tài khoản: nền tảng đã liên kết + nút Huỷ liên kết. */
  function fill() {
    const card = $('hostlinks-card');
    if (!card) return;
    const m = me();
    const list = (m && !m.guest && m.hosts) || [];
    card.hidden = !list.length;
    if (!list.length) return;
    const only = !m.hasPassword && !m.google && list.length === 1;
    $('hostlinks-note').hidden = !only;
    $('hostlinks-note').textContent = only ? T('hostauth_only_note') : '';
    $('hostlinks-list').innerHTML = list.filter((p) => NAME[p]).map((p) => `<li><div class="pn"><b>${esc(NAME[p])}</b></div>
      <button type="button" class="ghost sm" data-host-unlink="${esc(p)}">${esc(T('hostauth_unlink'))}</button></li>`).join('');
  }

  async function unlink(p) {
    const m = me();
    if (!m || m.guest || !NAME[p]) return;
    const hosts = m.hosts || [];
    const last = !m.hasPassword && !m.google && hosts.length === 1;
    const q = T(last ? 'hostauth_unlink_last_q' : 'hostauth_unlink_q', { host: NAME[p] });
    if (!(await window.CaroConfirm.ask(q))) return;
    N.send({ t: 'hostUnlink', provider: p, confirm: last });
  }
  const list = $('hostlinks-list');
  if (list) list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-host-unlink]');
    if (b) unlink(b.dataset.hostUnlink);
  });

  // ------------------------------------------------------------ Tin máy chủ
  /** Thử đăng nhập im lặng (khách). Thư viện Telegram chưa kịp có initData thì chờ tối đa ~5 giây. */
  function tryAuto(n = 0) {
    const m = me();
    if (!HOST || !providers.includes(HOST) || autoSent || ss.get(NO_AUTO) || !m || !m.guest || !N.connected) return;
    if (!launchData()) { if (n < 25) setTimeout(() => tryAuto(n + 1), 200); return; }
    autoSent = true;
    login('auto');
  }

  N.on('welcome', (m) => {
    providers = Array.isArray(m.hostAuth) ? m.hostAuth : [];
    if (!m.me.guest) state = null;
    else tryAuto();
    renderCard(); // online.js đã vẽ thẻ trước khi biết danh sách nền tảng
  });
  N.on('hostState', (m) => {
    if (m.provider && m.provider !== HOST) return;
    state = m.state;
    N.render();
  });
  // Đăng xuất (kể cả từ xa) / xoá tài khoản: thôi tự đăng nhập trong phiên này
  for (const t of ['loggedOut', 'accountDeleted']) N.on(t, () => { if (HOST) ss.set(NO_AUTO, '1'); state = null; });
  N.on('me', () => { if (N.isOpen('account-dlg')) fill(); });
  N.on('error', (m) => {
    if (m.ctx !== 'hostLogin') return;
    const b = $('host-auth-save');
    if (b) b.disabled = false;
  });
  window.addEventListener('caro:online', renderCard);
  window.addEventListener('langchange', () => { if (N.isOpen('account-dlg')) fill(); });

  window.CaroHostAuth = { host: HOST, get state() { return state; }, launchData, fill };
})();
