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
 *
 * Discord Activity (docs/discord-activity.md): Discord mở trang qua proxy của nó ở https://<client_id>.discordsays.com
 * (URL Mapping '/' → tên miền của game), trong iframe của discord.com, với ?frame_id=…&instance_id=…&platform=desktop|mobile
 * (Embedded App SDK đòi đủ ba tham số). Lượt tải trang chính có đủ ba tham số đó:
 *   – frame-ancestors: discord.com (+ tên miền con ptb / canary), discordapp.com (+ con) và *.discordsays.com; bỏ
 *     X-Frame-Options. Đổi bằng DISCORD_FRAME_ANCESTORS (cùng cú pháp HOST_FRAME_ANCESTORS). script-src không thêm gì: SDK
 *     tự phục vụ (caro/vendor/discord-sdk.js), mọi yêu cầu cùng nguồn discordsays.com qua proxy;
 *   – DISCORD_CLIENT_ID (client id công khai, không phải secret) → thẻ <meta name="caro-discord-client-id"> trong trang
 *     (host-discord.js; trên discordsays.com client id còn lấy được từ tên miền). WebSocket từ
 *     https://<DISCORD_CLIENT_ID>.discordsays.com: portal-origins.js.
 */
'use strict';

const TG_SCRIPT = 'https://telegram.org/js/telegram-web-app.js';
const DEFAULT_ANCESTORS = ['https://web.telegram.org', 'https://vk.com', 'https://*.vk.com', 'https://vk.ru', 'https://*.vk.ru'];
const DISCORD_ANCESTORS = ['https://discord.com', 'https://*.discord.com', 'https://discordapp.com', 'https://*.discordapp.com', 'https://*.discordsays.com'];

/** Lượt tải có đủ tham số khởi chạy Discord Activity không (như caro/host-detect.js · isDiscordLaunch). */
function isDiscordLaunch(sp) {
  return !!(sp.get('frame_id') && sp.get('instance_id') && /^(desktop|mobile)$/.test(sp.get('platform') || ''));
}

/** Lượt tải có dấu hiệu Mini App không (searchParams của URL). */
function isHostLaunch(sp) {
  const h = sp.get('host');
  return h === 'tg' || h === 'vk' || sp.has('tgWebAppStartParam') || (sp.has('vk_app_id') && sp.has('sign'));
}

/** Danh sách frame-ancestors (chuỗi CSP). Mục sai dạng bị bỏ – không bao giờ thành '*'. */
function ancestors(env = process.env, key = 'HOST_FRAME_ANCESTORS', defaults = DEFAULT_ANCESTORS) {
  const raw = env[key];
  if (raw === undefined || raw === '') return defaults.join(' ');
  if (raw.trim() === 'none' || raw.trim() === "'none'") return "'none'";
  const ok = raw.split(/[\s,]+/).filter((s) => /^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/i.test(s));
  return ok.length ? ok.join(' ') : "'none'";
}

/** CSP của trang chính khi mở làm Mini App. */
function hostCsp(csp, env = process.env) {
  return csp.replace("frame-ancestors 'none'", 'frame-ancestors ' + ancestors(env)).replace("script-src 'self'", "script-src 'self' " + TG_SCRIPT);
}

/** CSP của trang chính khi mở làm Discord Activity: chỉ đổi frame-ancestors. */
function discordCsp(csp, env = process.env) {
  return csp.replace("frame-ancestors 'none'", 'frame-ancestors ' + ancestors(env, 'DISCORD_FRAME_ANCESTORS', DISCORD_ANCESTORS));
}

/** Đặt header Mini App / Discord Activity cho lượt tải trang chính có dấu hiệu; true nếu đã đặt. */
function applyHostHeaders(res, url, sp, csp, env = process.env) {
  if (url !== '/' && url !== '/index.html') return false;
  const discord = isDiscordLaunch(sp);
  if (!discord && !isHostLaunch(sp)) return false;
  res.setHeader('content-security-policy', discord ? discordCsp(csp, env) : hostCsp(csp, env));
  res.removeHeader('x-frame-options');
  return true;
}

/** Client id công khai của Discord Activity (DISCORD_CLIENT_ID, mục đầu nếu khai nhiều – chỉ chữ số) hoặc ''. */
function discordClientId(env = process.env) {
  const id = String(env.DISCORD_CLIENT_ID || '').split(',')[0].trim();
  return /^\d{5,25}$/.test(id) ? id : '';
}

/** Trang chính (HTML) của lượt mở Discord Activity: thêm thẻ meta client id (khi đã đặt DISCORD_CLIENT_ID). */
function injectDiscord(html, sp, env = process.env) {
  const id = sp && isDiscordLaunch(sp) ? discordClientId(env) : '';
  if (!id || !html.includes('</head>')) return html;
  return html.replace('</head>', `<meta name="caro-discord-client-id" content="${id}">\n</head>`);
}

module.exports = {
  TG_SCRIPT, DEFAULT_ANCESTORS, DISCORD_ANCESTORS, isHostLaunch, isDiscordLaunch, ancestors, hostCsp, discordCsp, applyHostHeaders,
  discordClientId, injectDiscord,
};
