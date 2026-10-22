/*
 * Cầu nối khi chạy trong ứng dụng Android / iOS (Capacitor). Trên trình duyệt web file này không làm gì.
 * Ứng dụng dùng đúng giao diện và mã chơi của bản web, chỉ thay vài chỗ trình duyệt trong app
 * không hỗ trợ bằng tính năng gốc của điện thoại:
 *  - Nút Back của Android: đóng hộp thoại / menu, lùi trang (trang con → Trang chủ → bàn cờ), thoát xem lại; hết mới thu nhỏ app.
 *  - Chia sẻ link mời, link xem lại: bảng chia sẻ của hệ thống.
 *  - Sao chép link: bộ nhớ tạm của hệ thống.
 *  - Rung: phản hồi rung của hệ thống.
 *  - Đăng nhập Google: dùng tài khoản Google trên máy (Google chặn đăng nhập trong WebView).
 */
(function () {
  'use strict';
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
  const P = Cap.Plugins || {};
  const platform = Cap.getPlatform();
  document.documentElement.classList.add('native', 'native-' + platform);

  // ------------------------------------------------------------ Chia sẻ & sao chép
  if (P.Share) {
    // Mã giao diện kiểm tra navigator.share để hiện nút "Chia sẻ" – thay bằng bảng chia sẻ gốc.
    navigator.share = (data) => P.Share.share({ title: data.title, text: data.text, url: data.url, dialogTitle: data.title })
      .then(() => undefined)
      .catch((e) => { throw Object.assign(new Error(String(e && e.message || e)), { name: 'AbortError' }); });
  }
  if (P.Clipboard) {
    const writeText = (text) => P.Clipboard.write({ string: String(text) });
    try {
      if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'writeText', { value: writeText, configurable: true });
      else Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    } catch (e) { /* giữ bản của trình duyệt */ }
  }

  /** Chia sẻ file ảnh (PNG/GIF ván cờ): ghi vào bộ nhớ đệm của app rồi mở bảng chia sẻ của hệ thống. */
  const shareFile = P.Filesystem && P.Share ? async (name, base64, title) => {
    const { uri } = await P.Filesystem.writeFile({ path: name, data: base64, directory: 'CACHE' });
    await P.Share.share({ title, files: [uri], dialogTitle: title });
  } : null;

  // ------------------------------------------------------------ Rung
  if (P.Haptics) {
    navigator.vibrate = (pattern) => {
      const ms = Array.isArray(pattern) ? pattern[0] || 0 : Number(pattern) || 0;
      if (ms > 0) P.Haptics.vibrate({ duration: Math.min(ms, 400) }).catch(() => {});
      return true;
    };
  }

  // ------------------------------------------------------------ Nút Back (Android)
  if (P.App && platform === 'android') {
    // Ghi lại thứ tự mở hộp thoại để Back luôn đóng hộp thoại mở sau cùng (nằm trên cùng)
    let seq = 0;
    const showModal = window.HTMLDialogElement && HTMLDialogElement.prototype.showModal;
    if (showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.dataset.openedAt = String(++seq);
        return showModal.apply(this, arguments);
      };
    }
    P.App.addListener('backButton', () => {
      const menu = document.getElementById('quick-menu');
      if (menu && !menu.hidden) { menu.hidden = true; return; }
      // Hộp thoại đã thành trang (shell.js) không tính: Back của trang do CaroShell.back() xử lý
      const open = [...document.querySelectorAll('dialog[open]:not(.proxied)')]
        .sort((a, b) => Number(a.dataset.openedAt || 0) - Number(b.dataset.openedAt || 0));
      if (open.length) {
        const d = open[open.length - 1];
        if (typeof d.onBack === 'function' && d.onBack()) return; // hộp thoại có nhiều trang: Back về trang trước
        if (d.close) d.close(); else d.removeAttribute('open');
        return;
      }
      if (window.CaroShell && window.CaroShell.back()) return;
      if (window.CaroApp && window.CaroApp.replay) { window.CaroApp.closeReplay(); return; }
      const banner = document.getElementById('banner');
      if (banner && !banner.hidden) { banner.hidden = true; return; }
      P.App.minimizeApp().catch(() => P.App.exitApp());
    });
  }

  // ------------------------------------------------------------ Link sâu (H-A5)
  // Link mời phòng / xem lại / giải đấu / câu lạc bộ trên web đều dùng tham số truy vấn
  // (?room= ?replay= ?t= ?club=) và mã web đã xử lý chúng từ location.search. Trong app,
  // link https của máy chủ (App Links / Universal Links) hoặc link scheme riêng mở app qua
  // sự kiện appUrlOpen: chép đúng các tham số đó vào địa chỉ của app rồi nạp lại trang —
  // phần còn lại để mã web sẵn có xử lý như khi mở link trên trình duyệt.
  let routeLink = null;
  if (P.App) {
    const LINK_KEYS = ['room', 'replay', 't', 'club'];
    routeLink = (url) => {
      try {
        const u = new URL(String(url));
        const qs = new URLSearchParams();
        for (const k of LINK_KEYS) { const v = u.searchParams.get(k); if (v) qs.set(k, v); }
        if (![...qs.keys()].length) return;
        location.assign('/?' + qs.toString());
      } catch (e) { /* link lạ / không có tham số link: bỏ qua */ }
    };
    P.App.addListener('appUrlOpen', (data) => { if (data && data.url) routeLink(data.url); });
    // getLaunchUrl() trả cùng một link suốt phiên chạy app, mà routeLink nạp lại trang (mã web còn xoá tham số khỏi địa chỉ
    // – online.js replaceState): không nhớ là đã xử lý thì mỗi lần nạp lại lại mở link đó → tải lại mãi. Nhớ trong phiên.
    const LAUNCH = 'caro.launchUrl';
    if (P.App.getLaunchUrl) P.App.getLaunchUrl().then((r) => {
      if (!r || !r.url) return;
      try { if (sessionStorage.getItem(LAUNCH) === r.url) return; sessionStorage.setItem(LAUNCH, r.url); } catch (e) { return; }
      routeLink(r.url);
    }).catch(() => {});
  }

  // ------------------------------------------------------------ Đăng nhập Google (gốc)
  // Hiện chỉ bật trên Android. Trên iPhone nút Google được ẩn: tài khoản Google đặt mật khẩu trong mục
  // Tài khoản rồi đăng nhập bằng tên đăng nhập (xem app/README.md).
  const Social = P.SocialLogin;
  let inited = null;
  const google = Social && platform === 'android' ? {
    /** Trả về ID token của Google (JWT) để gửi cho máy chủ giống hệt bản web. */
    async signIn(webClientId) {
      if (inited !== webClientId) {
        await Social.initialize({
          google: { webClientId, mode: 'online' },
        });
        inited = webClientId;
      }
      const res = await Social.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
      const token = res && res.result && res.result.idToken;
      if (!token) throw new Error('no idToken');
      return token;
    },
  } : null;

  window.CaroNative = { platform, google, shareFile, routeLink };
})();
