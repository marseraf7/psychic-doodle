/*
 * Cầu nối khi chạy trong ứng dụng Android / iOS (Capacitor). Trên trình duyệt web file này không làm gì.
 * Ứng dụng dùng đúng giao diện và mã chơi của bản web, chỉ thay vài chỗ trình duyệt trong app
 * không hỗ trợ bằng tính năng gốc của điện thoại:
 *  - Nút Back của Android: đóng hộp thoại / menu / chế độ xem lại trước, hết mới thu nhỏ app.
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
      const open = [...document.querySelectorAll('dialog[open]')]
        .sort((a, b) => Number(a.dataset.openedAt || 0) - Number(b.dataset.openedAt || 0));
      if (open.length) {
        const d = open[open.length - 1];
        if (d.close) d.close(); else d.removeAttribute('open');
        return;
      }
      if (window.CaroApp && window.CaroApp.replay) { window.CaroApp.closeReplay(); return; }
      const banner = document.getElementById('banner');
      if (banner && !banner.hidden) { banner.hidden = true; return; }
      P.App.minimizeApp().catch(() => P.App.exitApp());
    });
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

  window.CaroNative = { platform, google };
})();
