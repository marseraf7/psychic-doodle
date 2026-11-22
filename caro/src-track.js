/*
 * Nguồn người chơi gửi kèm tin hello (online.js → máy chủ server/src/hub/sources.js; bảng thống kê: src-admin.js):
 *   src – window.CARO_SRC nếu lớp chạy trong ứng dụng khác đặt sẵn (telegram, vk, crazygames, itch, embed…), không thì tự
 *         nhận: app (Android / iOS – CaroNative), desktop (Tauri – CARO_DESKTOP), pwa (đã cài, display-mode standalone),
 *         embed (trang nhúng), web.
 *   ref – ?ref= hoặc utm_source của LẦN MỞ ĐẦU trên máy này (chữ thường a-z 0-9 _ -, ≤ 24 ký tự), lưu ở caro.ref.
 * Nạp trước online.js (trước khi máy tạo khoá khách – lần mở đầu nhận ra nhờ chưa có khoá khách / đăng nhập).
 * API: window.CaroSrc = { src(), ref(), hello() → { src, ref } }; detect(env) / cleanRef(s) dùng được trong Node (bài thử).
 */
(function (root) {
  'use strict';
  const SOURCES = ['web', 'pwa', 'app', 'desktop', 'telegram', 'vk', 'crazygames', 'itch', 'mcp', 'embed', 'unknown'];
  const KEY = 'caro.ref';

  /** ref đã làm sạch, rỗng → ''. */
  function cleanRef(s) { return typeof s === 'string' ? s.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) : ''; }

  /** env: { given (CARO_SRC), native, desktop, standalone, path }. */
  function detect(env) {
    if (SOURCES.includes(env.given)) return env.given;
    if (env.desktop) return 'desktop';
    if (env.native) return 'app';
    if (/\/embed\.html$/.test(env.path || '')) return 'embed';
    if (env.standalone) return 'pwa';
    return 'web';
  }

  /** ref của lần mở đầu: first = máy chưa có dữ liệu của game; search = location.search. */
  function firstRef(search, first) {
    if (!first) return '';
    let q;
    try { q = new URLSearchParams(search || ''); } catch (e) { return ''; }
    return cleanRef(q.get('ref') || q.get('utm_source') || '');
  }

  const api = { SOURCES, cleanRef, detect, firstRef };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  const w = root;
  const mm = (q) => { try { return !!(w.matchMedia && w.matchMedia(q).matches); } catch (e) { return false; } };
  const src = () => detect({
    given: w.CARO_SRC, native: !!(w.CaroNative && w.CaroNative.platform && w.CaroNative.platform !== 'web'), desktop: !!w.CARO_DESKTOP,
    standalone: mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)') || (w.navigator && w.navigator.standalone === true),
    path: w.location.pathname,
  });
  let ref = '';
  try {
    const ls = w.localStorage;
    const saved = ls.getItem(KEY);
    if (saved !== null) ref = cleanRef(saved);
    else {
      const first = !ls.getItem('caro.guestKey') && !ls.getItem('caro.token');
      ref = firstRef(w.location.search, first);
      if (first) ls.setItem(KEY, ref); // lần mở đầu: ghi cả khi rỗng (lần sau không lấy ref nữa)
    }
  } catch (e) { ref = firstRef(w.location.search, true); }
  w.CaroSrc = Object.assign(api, { src, ref: () => ref, hello: () => ({ src: src(), ref: ref || null }) });
})(typeof window !== 'undefined' ? window : this);
