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
 *    khi mở bằng link startapp), app điện thoại có sẵn window.TelegramWebviewProxy (chỉ tính kèm ?host=tg); VK thêm ?vk_app_id=…&sign=… (tham số
 *    khởi chạy). Nhớ trong sessionStorage ('caro.host'): tải lại trang (mất #…) vẫn nhận ra.
 *    Link sâu: start_param của Telegram (t.me/<bot>/<app>?startapp=room-123456) / tham số hash của VK (vk.com/app<id>#room-…)
 *    → thêm ?room= ?replay= ?t= ?o= ?club= ?u= ?cls= vào địa chỉ (history.replaceState) để mã sẵn có xử lý như link thường;
 *    mỗi phiên một lần.
 *    Đăng nhập bằng Mini App (Đợt 3 – host-auth.js, máy chủ kiểm chữ ký): VK – ngay lúc mở, chép nguyên văn các tham số vk_… +
 *    sign vào sessionStorage ('caro.vkLaunch') rồi BỎ sign khỏi địa chỉ (thêm ?host=vk nếu chưa có để máy chủ / sw.js vẫn nhận
 *    ra lượt mở Mini App): sign là "vé" đăng nhập còn hiệu lực nhiều giờ – không để nó nằm trong địa chỉ (lịch sử, link sao
 *    chép, otour.js / tour.js giữ nguyên search khi đổi địa chỉ). Các tham số vk_ khác giữ nguyên (VK Bridge đọc vk_platform).
 *    Telegram: initData do telegram-web-app.js giữ (Telegram.WebApp.initData, nằm sau # – không tới máy chủ).
 *  – Discord Activity (docs/discord-activity.md): Discord mở trang trong iframe ở https://<client_id>.discordsays.com (mọi
 *    yêu cầu qua proxy của Discord) với ?frame_id=…&instance_id=…&platform=desktop|mobile (SDK đòi đủ ba tham số này). Nhận
 *    biết theo ba tham số đó (không dùng ?host=discord: URL Mapping chỉ trỏ tiền tố → tên miền, không thêm được tham số) hoặc
 *    theo tên miền *.discordsays.com (chỉ Discord phục vụ). CARO_HOST = CARO_SRC = 'discord'; nhớ chuỗi tham số khởi chạy
 *    ('caro.discordLaunch') để host-discord.js tạo SDK đúng cả khi mã khác đã xoá tham số khỏi địa chỉ; nạp
 *    vendor/discord-sdk.js (@discord/embedded-app-sdk, MIT – bản tự phục vụ).
 * Hàm thuần (kiểm thử trên Node: caro/tests/host-detect.test.js):
 *   window.CaroHostDetect = { PORTALS, portalOf, ROUTE_KEYS, detect(env), isDiscordLaunch(search), startParam(host, env),
 *     parseStart(s), routeSearch(search, s), vkLaunch(search) }
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

  const HOSTS = ['telegram', 'vk', 'discord'];
  /** Địa chỉ có đủ tham số khởi chạy Discord Activity không (như SDK kiểm: frame_id, instance_id, platform hợp lệ). */
  function isDiscordLaunch(search) {
    const q = new URLSearchParams(search || '');
    return !!(q.get('frame_id') && q.get('instance_id') && /^(desktop|mobile)$/.test(q.get('platform') || ''));
  }

  /** env: { search, hash, tgProxy, session, hostname } → 'telegram' | 'vk' | 'discord' | null. */
  function detect(env) {
    const q = new URLSearchParams(env.search || ''), h = hashParams(env.hash);
    // TelegramWebviewProxy có cả trong trình duyệt trong app Telegram khi mở link thường (không phải Mini App): chỉ tính khi
    // địa chỉ có dấu ?host=tg của Mini App – không thì trang web chính mở từ chat Telegram bị nhận nhầm (nguồn, ẩn cài PWA…)
    if (h.has('tgWebAppData') || h.has('tgWebAppVersion') || q.has('tgWebAppStartParam') || q.has('tgWebAppData') || (env.tgProxy && q.get('host') === 'tg')) return 'telegram';
    if (q.has('vk_app_id') && q.has('sign')) return 'vk';
    if (isDiscordLaunch(env.search) || /(^|\.)discordsays\.com$/i.test(env.hostname || '')) return 'discord';
    return HOSTS.includes(env.session) ? env.session : null;
  }

  /** Tham số link sâu do nền tảng truyền vào (chuỗi thô) hoặc ''. */
  function startParam(host, env) {
    const q = new URLSearchParams(env.search || '');
    if (host === 'telegram') {
      if (q.get('tgWebAppStartParam')) return q.get('tgWebAppStartParam');
      try { return new URLSearchParams(hashParams(env.hash).get('tgWebAppData') || '').get('start_param') || ''; } catch (e) { return ''; }
    }
    // VK: "Các ký tự sau # sẽ được truyền cho ứng dụng trong tham số URL hash" (dev.vk.ru → Launch params)
    // Một số bản VK đưa thẳng phần sau # vào địa chỉ của khung (location.hash): nhận cả hai (chưa kiểm trên máy thật)
    if (host === 'vk') return q.get('hash') || String(env.hash || '').replace(/^#/, '');
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

  /**
   * Tham số khởi chạy VK: → { raw: 'vk_…&…&sign=…' (nguyên văn, đúng thứ tự – để máy chủ kiểm chữ ký),
   *   search: địa chỉ mới không có sign, luôn có host=vk } hoặc null (không có sign).
   */
  function vkLaunch(search) {
    const segs = String(search || '').replace(/^\?/, '').split('&').filter(Boolean);
    const isSign = (s) => /^sign(=|$)/.test(s);
    if (!segs.some(isSign)) return null;
    const raw = segs.filter((s) => /^vk_/.test(s) || isSign(s)).join('&');
    const rest = segs.filter((s) => !isSign(s));
    if (!rest.some((s) => /^host=/.test(s))) rest.unshift('host=vk');
    return { raw, search: '?' + rest.join('&') };
  }

  const api = { PORTALS, portalOf, ROUTE_KEYS, detect, isDiscordLaunch, startParam, parseStart, routeSearch, vkLaunch };
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

  const env = { search: location.search, hash: location.hash, tgProxy: !!w.TelegramWebviewProxy, session: ss.get('caro.host'), hostname: location.hostname };
  const host = detect(env);
  if (!host) return;
  ss.set('caro.host', host);
  w.CARO_HOST = host;
  w.CARO_SRC = host;
  html.classList.add('host', 'host-' + host);

  // VK: giữ tham số khởi chạy có chữ ký cho đăng nhập (host-auth.js), bỏ sign khỏi địa chỉ
  if (host === 'vk') {
    const vl = vkLaunch(location.search);
    if (vl) {
      ss.set('caro.vkLaunch', vl.raw);
      try { history.replaceState(history.state, '', location.pathname + vl.search + location.hash); } catch (e) { /* bỏ qua */ }
    }
  }

  // Link sâu: mỗi phiên một lần (tải lại trang không mở lại link đã xử lý – mã web xoá tham số sau khi dùng)
  const sp = startParam(host, env);
  if (sp && ss.get('caro.hostRoute') !== sp) {
    ss.set('caro.hostRoute', sp);
    const next = routeSearch(location.search, sp);
    if (next) try { history.replaceState(history.state, '', location.pathname + next + location.hash); } catch (e) { /* bỏ qua */ }
  }

  if (host === 'discord' && isDiscordLaunch(location.search)) ss.set('caro.discordLaunch', location.search);
  const lib = host === 'telegram' ? 'https://telegram.org/js/telegram-web-app.js?65' : host === 'vk' ? 'vendor/vk-bridge.js' : 'vendor/discord-sdk.js';
  document.write('<script src="' + lib + '"><\/script>');
})(this);
