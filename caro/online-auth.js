/*
 * Online – tài khoản: thẻ tài khoản trong bảng Online (khách / đã đăng nhập, đổi tên, đăng xuất, liên kết Google),
 * hộp thoại đăng nhập / đăng ký, nút Google (web: thư viện GIS; app điện thoại: tài khoản Google trên máy).
 * online.js gọi window.CaroOnlineAuth(ctx) một lần (ctx: trạng thái + hàm chung của online.js); trả về
 * { renderAccount, openAuth, authLabel }.
 */
(function () {
  'use strict';
  window.CaroOnlineAuth = function (ctx) {
    const App = window.CaroApp;
    const esc = App.esc;
    const T = window.I18N.t;
    const $ = (id) => document.getElementById(id);
    const { S, LS, send, toast, openDlg } = ctx;

    function renderAccount() {
      const el = $('account');
      const me = S.me;
      if (!ctx.wsUrl) {
        el.innerHTML = `<p class="hint">${esc(T('no_server_hint'))}</p>`;
        return;
      }
      if (ctx.outdated) {
        el.innerHTML = `<p class="hint">${esc(T('update_required'))}</p>` +
          (ctx.outdated.url ? `<a class="primary btn-link" href="${esc(ctx.outdated.url)}" target="_blank" rel="noopener">${esc(T('update_btn'))}</a>` : '');
        return;
      }
      if (!me) { el.innerHTML = `<p class="hint">${esc(T('connecting_hint'))}</p>`; return; }
      const avatar = window.CaroAvatar.html(me); // ảnh đã tải lên, chưa có thì chữ cái đầu (avatar.js)
      if (me.guest) {
        el.innerHTML = `
          <div class="who">${avatar}<div><b>${esc(me.name)}</b><small>${esc(T('guest'))} · <a href="#" id="rename">${esc(T('rename'))}</a></small></div></div>
          <div class="row">
            <button type="button" class="primary" id="go-login">${esc(T('login'))}</button>
            <button type="button" class="ghost" id="go-register">${esc(T('register'))}</button>
          </div>
          <p class="hint">${esc(T('account_hint'))}</p>
          <div class="row">${S.status === 'online' ? `<button type="button" class="ghost sm" data-social="leaderboard">🏆 ${esc(T('leaderboard'))}</button>` : ''}</div>`;
        $('go-login').onclick = () => openAuth('login');
        $('go-register').onclick = () => openAuth('register');
      } else {
        const st = me.stats || { wins: 0, losses: 0, draws: 0 };
        el.innerHTML = `
          <div class="who">${avatar}<div><b><a href="#" class="plink" data-profile="${esc(me.uid)}">${esc(me.name)}</a> <span class="rating">${esc(T('rating_short', { n: me.rating || 1200 }))}</span></b><small>@${esc(me.username)} · ${esc(T('stats3', { w: st.wins, l: st.losses, d: st.draws || 0 }))} · <a href="#" id="rename">${esc(T('rename'))}</a></small></div></div>
          <div class="row">
            <button type="button" class="ghost sm" data-profile="${esc(me.uid)}">${esc(T('profile'))}</button>
            <button type="button" class="ghost sm" data-social="history">🕘 ${esc(T('history'))}</button>
            <button type="button" class="ghost sm" data-social="leaderboard">🏆 ${esc(T('leaderboard'))}</button>
            <button type="button" class="ghost sm" data-social="account">⚙ ${esc(T('account_settings'))}</button>
          </div>
          <div class="row">
            <button type="button" class="ghost sm" id="av-change" title="${esc(T('av_hint'))}">${esc(T('av_change'))}</button>
            ${me.av ? `<button type="button" class="ghost sm" id="av-remove">${esc(T('av_remove'))}</button>` : ''}
          </div>
          <div class="row">
            ${me.google ? `<span class="tag">${esc(T('google_linked_tag'))}</span>` : googleAvailable() ? `<button type="button" class="ghost" id="link-google">${esc(T('link_google'))}</button>` : ''}
            <button type="button" class="ghost" id="logout">${esc(T('logout'))}</button>
          </div>
          <div id="google-link-btn"></div>`;
        $('logout').onclick = async () => {
          if (ctx.roomActive() && !(await window.CaroConfirm.ask(T('confirm_logout')))) return;
          send({ t: 'logout' });
        };
        $('av-change').onclick = () => window.CaroAvatar.pick();
        if ($('av-remove')) $('av-remove').onclick = () => window.CaroAvatar.clear();
        const lg = $('link-google');
        if (lg) lg.onclick = () => { lg.hidden = true; mountGoogle($('google-link-btn')); };
      }
      el.querySelectorAll('[data-social]').forEach((b) => { b.onclick = () => window.CaroSocial && window.CaroSocial.open(b.dataset.social); });
      $('rename').onclick = async (e) => {
        e.preventDefault();
        const name = await window.CaroConfirm.prompt(T('rename_prompt'), me.name, { max: 24 });
        if (name && name.trim()) {
          if (me.guest) LS.set('caro.guestName', name.trim());
          send({ t: 'setName', name: name.trim() });
        }
      };
    }

    // ------------------------------------------------------------ Đăng nhập / Google
    let authTab = 'login';
    function openAuth(tab) {
      authTab = tab;
      const f = $('auth-form');
      f.classList.toggle('register', tab === 'register');
      f.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      $('auth-submit').textContent = T(tab === 'login' ? 'login' : 'register');
      f.password.autocomplete = tab === 'login' ? 'current-password' : 'new-password';
      f.password.minLength = tab === 'login' ? 1 : 6;
      $('auth-err').textContent = '';
      const gb = $('google-box');
      gb.hidden = !googleAvailable();
      if (googleAvailable()) mountGoogle($('google-btn'));
      openDlg('auth');
    }
    $('auth-form').querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => openAuth(b.dataset.tab); });
    $('auth-form').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      $('auth-err').textContent = '';
      const msg = { t: authTab, username: f.username.value.trim().toLowerCase(), password: f.password.value };
      if (authTab === 'register') msg.name = f.name.value.trim();
      send(msg);
    };

    // Thư viện Google chỉ được tải khi máy chủ bật đăng nhập Google.
    let gisPromise = null;
    function loadGoogle() {
      if (!gisPromise) {
        gisPromise = new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://accounts.google.com/gsi/client';
          s.async = true;
          s.onload = () => {
            window.google.accounts.id.initialize({
              client_id: S.googleClientId,
              callback: (r) => send({ t: 'google', credential: r.credential }),
            });
            resolve(window.google);
          };
          s.onerror = () => { gisPromise = null; reject(new Error('Không tải được Google')); };
          document.head.appendChild(s);
        });
      }
      return gisPromise;
    }
    // Trong ứng dụng điện thoại: Google chặn đăng nhập trong WebView, nên dùng tài khoản Google
    // trên máy (native.js) – vẫn gửi đúng ID token như bản web, máy chủ xác minh y hệt.
    const nativeApp = !!window.CaroNative;
    const googleAvailable = () => !!S.googleClientId && (!nativeApp || !!window.CaroNative.google);
    function mountGoogle(el) {
      if (nativeApp) return mountNativeGoogle(el);
      loadGoogle().then((g) => {
        el.innerHTML = '';
        g.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', locale: window.I18N.googleLocale, width: 260 });
      }).catch(() => { el.innerHTML = `<p class="hint">${esc(T('google_load_fail'))}</p>`; });
    }
    function mountNativeGoogle(el) {
      el.innerHTML = `<button type="button" class="ghost google-native"><span class="g">G</span> ${esc(T('google_continue'))}</button>`;
      const b = el.querySelector('button');
      b.onclick = async () => {
        b.disabled = true;
        try {
          const credential = await window.CaroNative.google.signIn(S.googleClientId);
          send({ t: 'google', credential });
        } catch (e) {
          // Người dùng tự huỷ thì im lặng; lỗi khác thì báo
          if (!/cancel/i.test(String(e && (e.message || e.code) || e))) toast(T('google_load_fail'));
        } finally { b.disabled = false; }
      };
    }

    /** Đổi ngôn ngữ: chữ nút gửi của hộp thoại đăng nhập. */
    function authLabel() { if (ctx.isOpen('auth')) $('auth-submit').textContent = T(authTab === 'login' ? 'login' : 'register'); }

    return { renderAccount, openAuth, authLabel };
  };
})();
