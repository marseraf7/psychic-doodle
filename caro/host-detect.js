/*
 * Nhận biết trang đang chạy ở đâu – chạy trong <head>, đồng bộ, trước mọi mã khác (bản web chính: không làm gì cả).
 *  – Bản cổng game (CrazyGames / itch.io): server/scripts/build-portal.js ghi window.CARO_PORTAL vào portal-config.js, nạp
 *    trước file này → lớp html.portal + html.portal-<tên cổng>, window.CARO_SRC = tên cổng (đo theo nguồn – trường src
 *    của tin hello do phần khác đọc). Phần còn lại của bản cổng: portal.js, portal-crazygames.js, host.css.
 *  – Mini App Telegram / VK (cùng trang chính, không bản riêng): window.CARO_HOST = CARO_SRC = 'telegram' | 'vk', lớp
 *    html.host + html.host-<tên>, rồi chèn thư viện của nền tảng ngay sau file này (document.write – chạy trước mọi mã khác
 *    như tài liệu Telegram dặn "đặt trong <head> trước các script khác"):
 *      Telegram: https://telegram.org/js/telegram-web-app.js (chính thức; CSP cho phép ở server/src/host-embed.js);
 *      VK: vendor/vk-bridge.js (@vkontakte/vk-bridge, MIT – bản tự phục vụ).
 *    Nhận biết TRƯỚC khi thư viện nạp: Telegram thêm #tgWebAppData=…&tgWebAppVersion=… vào địa chỉ (và ?tgWebAppStartParam=
 *    khi mở bằng link startapp), app điện thoại có sẵn window.TelegramWebviewProxy; VK thêm ?vk_app_id=…&sign=… (tham số
 *    khởi chạy). Nhớ trong sessionStorage ('caro.host'): tải lại trang (mất #…) vẫn nhận ra.
 *    Link sâu: start_param của Telegram (t.me/<bot>/<app>?startapp=room-123456) / tham số hash của VK (vk.com/app<id>#room-…)
 *    → thêm ?room= ?replay= ?t= ?o= ?club= ?u= ?cls= vào địa chỉ (history.replaceState) để mã sẵn có xử lý như link thường;
 *    mỗi phiên một lần. Không dùng vk_user_id / initData để đăng nhập (chưa kiểm chữ ký – MVP giữ tài khoản Caro / khách).
 * Hàm thuần (kiểm thử trên Node: caro/tests/host-detect.test.js):
 *   window.CaroHostDetect = { PORTALS, portalOf, ROUTE_KEYS, detect(env), startParam(host, env), parseStart(s), routeSearch(search, s) }
 */
(function (root) {
  'use strict';
  const PORTALS = ['crazygames', 'itch'];
  /** Tên cổng hợp lệ hoặc null. */
  const portalOf = (v) => (PORTALS.includes(v) ? v : null);

  // Như native.js · LINK_KEYS và share-link.js: các loại link sâu của trang chính
  const ROUTE_KEYS = ['room', 'replay', 't', 'o', 'club', 'u', 'cls'];
  const VALUE = /^[A-Za-z0-9_.-]{1,64}$/;
  const hashParams = (h) => new URLSearchParams(String(h || '').replace(/^#/, ''));

  /** env: { search, hash, tgProxy, session } → 'telegram' | 'vk' | null. */
  function detect(env) {
    const q = new URLSearchParams(env.search || ''), h = hashParams(env.hash);
    if (h.has('tgWebAppData') || h.has('tgWebAppVersion') || q.has('tgWebAppStartParam') || q.has('tgWebAppData') || env.tgProxy) return 'telegram';
    if (q.has('vk_app_id') && q.has('sign')) return 'vk';
    return env.session === 'telegram' || env.session === 'vk' ? env.session : null;
  }

  /** Tham số link sâu do nền tảng truyền vào (chuỗi thô) hoặc ''. */
  function startParam(host, env) {
    const q = new URLSearchParams(env.search || '');
    if (host === 'telegram') {
      if (q.get('tgWebAppStartParam')) return q.get('tgWebAppStartParam');
      try { return new URLSearchParams(hashParams(env.hash).get('tgWebAppData') || '').get('start_param') || ''; } catch (e) { return ''; }
    }
    // VK: "Các ký tự sau # sẽ được truyền cho ứng dụng trong tham số URL hash" (dev.vk.ru → Launch params)
    if (host === 'vk') return q.get('hash') || '';
    return '';
  }

  /** "room-123456" / "replay_AbC" / "room=123456" → { key, value } hoặc null (loại lạ, giá trị lạ). */
  function parseStart(s) {
    s = String(s || '').trim();
    try { s = decodeURIComponent(s); } catch (e) { /* để nguyên */ }
    const m = /^([a-z]+)[-_=](.+)$/.exec(s);
    if (!m || !ROUTE_KEYS.includes(m[1]) || !VALUE.test(m[2])) return null;
    return { key: m[1], value: m[2] };
  }

  /** Địa chỉ mới (chuỗi search) có thêm tham số link sâu, hoặc null (không có / địa chỉ đã có link sâu khác). */
  function routeSearch(search, s) {
    const r = parseStart(s);
    if (!r) return null;
    const q = new URLSearchParams(search || '');
    if (ROUTE_KEYS.some((k) => q.get(k))) return null;
    q.set(r.key, r.value);
    return '?' + q.toString();
  }

  const api = { PORTALS, portalOf, ROUTE_KEYS, detect, startParam, parseStart, routeSearch };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  const w = root;
  const html = document.documentElement;
  const ss = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* riêng tư */ } },
  };
  const portal = portalOf(w.CARO_PORTAL);
  w.CARO_PORTAL = portal; // giá trị lạ = không phải bản cổng
  w.CaroHostDetect = api;
  if (portal) {
    html.classList.add('portal', 'portal-' + portal);
    w.CARO_SRC = portal;
    return; // gói của cổng chạy trên tên miền của cổng: không phải Mini App
  }

  const env = { search: location.search, hash: location.hash, tgProxy: !!w.TelegramWebviewProxy, session: ss.get('caro.host') };
  const host = detect(env);
  if (!host) return;
  ss.set('caro.host', host);
  w.CARO_HOST = host;
  w.CARO_SRC = host;
  html.classList.add('host', 'host-' + host);

  // Link sâu: mỗi phiên một lần (tải lại trang không mở lại link đã xử lý – mã web xoá tham số sau khi dùng)
  const sp = startParam(host, env);
  if (sp && ss.get('caro.hostRoute') !== sp) {
    ss.set('caro.hostRoute', sp);
    const next = routeSearch(location.search, sp);
    if (next) try { history.replaceState(history.state, '', location.pathname + next + location.hash); } catch (e) { /* bỏ qua */ }
  }

  const lib = host === 'telegram' ? 'https://telegram.org/js/telegram-web-app.js?65' : 'vendor/vk-bridge.js';
  document.write('<script src="' + lib + '"><\/script>');
})(this);
