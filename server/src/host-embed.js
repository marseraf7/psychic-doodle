/*
 * Trang chính mở làm Mini App trong Telegram / VK (caro/host-detect.js, host-*.js). Chỉ đổi header của đúng lượt tải trang
 * chính có dấu hiệu Mini App – mọi lượt tải khác giữ nguyên CSP / X-Frame-Options của web.js (frame-ancestors 'none').
 * Dấu hiệu (tham số trong địa chỉ – phần sau # không tới được máy chủ):
 *   ?host=tg | ?host=vk           – Minh đặt sẵn trong địa chỉ Web App của BotFather / VK (docs/huong-dan-cong-game-mini-app-…)
 *   ?tgWebAppStartParam=…          – Telegram thêm khi mở bằng link t.me/<bot>/<app>?startapp=… (core.telegram.org/bots/webapps)
 *   ?vk_app_id=…&sign=…            – tham số khởi chạy VK luôn có (dev.vk.ru → Mini Apps → Launch params)
 * Khi có dấu hiệu:
 *   – frame-ancestors cho Telegram Web (web.telegram.org) và VK bản web (vk.com, vk.ru và tên miền con – m.vk.com…) – hai nơi
 *     này mở Mini App trong iframe; app điện thoại / máy tính mở trong WebView riêng nên không cần. Bỏ X-Frame-Options.
 *     Đổi bằng HOST_FRAME_ANCESTORS (danh sách https://… cách nhau dấu cách; 'none' = không cho nhúng).
 *   – script-src thêm đúng file https://telegram.org/js/telegram-web-app.js (thư viện chính thức, Telegram khuyên nạp từ
 *     telegram.org); VK Bridge thì tự phục vụ (caro/vendor/vk-bridge.js – 'self').
 * caro/sw.js: lượt mở có dấu hiệu luôn hỏi mạng trước (không lấy trang đã lưu kèm header cũ 'none').
 */
'use strict';

const TG_SCRIPT = 'https://telegram.org/js/telegram-web-app.js';
const DEFAULT_ANCESTORS = ['https://web.telegram.org', 'https://vk.com', 'https://*.vk.com', 'https://vk.ru', 'https://*.vk.ru'];

/** Lượt tải có dấu hiệu Mini App không (searchParams của URL). */
function isHostLaunch(sp) {
  const h = sp.get('host');
  return h === 'tg' || h === 'vk' || sp.has('tgWebAppStartParam') || (sp.has('vk_app_id') && sp.has('sign'));
}

/** Danh sách frame-ancestors (chuỗi CSP). Mục sai dạng bị bỏ – không bao giờ thành '*'. */
function ancestors(env = process.env) {
  const raw = env.HOST_FRAME_ANCESTORS;
  if (raw === undefined || raw === '') return DEFAULT_ANCESTORS.join(' ');
  if (raw.trim() === 'none' || raw.trim() === "'none'") return "'none'";
  const ok = raw.split(/[\s,]+/).filter((s) => /^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/i.test(s));
  return ok.length ? ok.join(' ') : "'none'";
}

/** CSP của trang chính khi mở làm Mini App. */
function hostCsp(csp, env = process.env) {
  return csp.replace("frame-ancestors 'none'", 'frame-ancestors ' + ancestors(env)).replace("script-src 'self'", "script-src 'self' " + TG_SCRIPT);
}

/** Đặt header Mini App cho lượt tải trang chính có dấu hiệu; true nếu đã đặt. */
function applyHostHeaders(res, url, sp, csp, env = process.env) {
  if ((url !== '/' && url !== '/index.html') || !isHostLaunch(sp)) return false;
  res.setHeader('content-security-policy', hostCsp(csp, env));
  res.removeHeader('x-frame-options');
  return true;
}

module.exports = { TG_SCRIPT, DEFAULT_ANCESTORS, isHostLaunch, ancestors, hostCsp, applyHostHeaders };
