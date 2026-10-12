/*
 * Nhắc người chơi khi đang có ván (học ý tưởng từ màn chơi của Lichess, tự viết):
 *   - Ván online: tiêu đề tab "Đến lượt bạn" / "Đang chờ đối thủ" / "Hết ván"; tới lượt mình mà đang ở tab khác thì
 *     biểu tượng tab nhấp nháy cho tới khi quay lại.
 *   - Mọi ván đang dở (online, với máy, 2 người) khi đang ở bàn cờ: giữ màn hình không tự tắt (Screen Wake Lock),
 *     nhả ra khi hết ván hoặc chuyển sang Trang chủ / menu.
 *     Safari chỉ cấp khi người dùng vừa chạm, nên thử lại ở lần chạm kế tiếp nếu chưa được.
 * app.js gọi update(info) mỗi khi giao diện đổi (info: xem attentionInfo trong app.js).
 */
(function () {
  'use strict';
  const T = window.I18N.t;
  const baseTitle = () => T('app_title'); // theo ngôn ngữ đang dùng (i18n.js đặt tiêu đề gốc như vậy)
  const icon = document.querySelector('link[rel="icon"]');
  const baseIcon = icon && icon.getAttribute('href');
  // Biểu tượng thứ hai khi nhấp nháy: chấm màu nhấn trên nền tối
  const altIcon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1b1b1b"/><circle cx="32" cy="32" r="16" fill="#3b82f6"/></svg>');
  let info = { active: false };
  let blinkTimer = 0, alt = false;

  // ---------------------------------------------------------------- Tiêu đề + nhấp nháy
  function setIcon(a) {
    if (!icon || alt === a) return;
    alt = a;
    icon.setAttribute('href', a ? altIcon : baseIcon);
  }
  function stopBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = 0;
    setIcon(false);
  }
  function blink() {
    if (document.hasFocus() || !(info.online && info.active && info.myTurn)) return stopBlink();
    setIcon(!alt);
    blinkTimer = setTimeout(blink, 1000);
  }
  function renderTitle() {
    let text = '';
    if (info.online && info.active) text = T(info.myTurn ? 'title_your_turn' : 'title_waiting');
    else if (info.online && info.over) text = T('title_game_over');
    document.title = text ? `${text} – ${baseTitle()}` : baseTitle();
    if (info.online && info.active && info.myTurn && !document.hasFocus()) { if (!blinkTimer) blinkTimer = setTimeout(blink, 200); } else stopBlink();
  }
  window.addEventListener('focus', stopBlink);

  // ---------------------------------------------------------------- Giữ màn hình sáng
  let lock = null, want = false, asking = false;
  function acquire() {
    if (lock || asking || !want || document.hidden || !navigator.wakeLock) return;
    asking = true;
    navigator.wakeLock.request('screen').then((s) => {
      asking = false;
      if (!want) { s.release().catch(() => {}); return; }
      lock = s;
      s.addEventListener('release', () => { if (lock === s) lock = null; });
    }).catch(() => { asking = false; }); // chưa có thao tác của người dùng (Safari) / bị từ chối: thử lại lần chạm sau
  }
  function release() {
    if (lock) lock.release().catch(() => {});
    lock = null;
  }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, acquire, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); else acquire(); });

  /** Chỉ giữ màn hình sáng khi đang ở bàn cờ (đang xem Trang chủ / menu với một ván dở thì không). */
  function applyLock() {
    want = !!info.active && !document.body.classList.contains('shell-on');
    if (want) acquire(); else release();
  }
  function update(next) {
    info = next || { active: false };
    renderTitle();
    applyLock();
  }
  window.addEventListener('caro:page', () => setTimeout(applyLock, 0));
  window.addEventListener('caro:board', () => setTimeout(applyLock, 0));

  window.addEventListener('langchange', renderTitle);
  window.CaroAttention = { update, get locked() { return !!lock; }, get wanted() { return want; } };
})();
