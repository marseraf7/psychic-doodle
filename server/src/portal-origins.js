/*
 * Origin WebSocket của bản cổng game (server/scripts/build-portal.js – CrazyGames / itch.io phục vụ gói game từ tên miền của
 * họ, trong iframe), dùng trong web-net.js · wsOriginAllowed. Chỉ những tên miền đã biết – không bao giờ "mọi Origin":
 *  – CrazyGames: https://<tên-game>.game-files.crazygames.com (ví dụ trong docs.crazygames.com → Sitelock:
 *    https://cubes-2048-io.game-files.crazygames.com/cubes-2048-io/13/index.html);
 *  – itch.io: https://html.itch.zone, https://html-classic.itch.zone (CDN HTML5 của itch.io – thấy trong báo lỗi của trình
 *    duyệt trên itch.io; tài liệu itch.io chỉ nói "HTML CDN" không ghi tên miền: kiểm lại bằng bản nháp thật).
 * Biến môi trường:
 *   PORTAL_WS_ORIGINS  thêm mẫu, cách nhau dấu phẩy: origin đúng (https://a.example) hoặc https://*.đuôi (mọi tên miền
 *                      con của đuôi, đuôi có ít nhất 2 nhãn – không nhận '*', '*.com', 'https://*')
 *   PORTAL_WS=0        tắt các mẫu có sẵn ở trên (chỉ còn PORTAL_WS_ORIGINS)
 * Ghi chú: mọi game trên cùng cổng chung tên miền này nên cũng nối được – chấp nhận được (mục đích của chặn Origin là không
 * cho trang lạ bất kỳ mượn trình duyệt + IP người thăm; xác thực của game dùng token trong tin hello, không dùng cookie).
 */
'use strict';

const DEFAULT_PORTAL_ORIGINS = ['https://*.game-files.crazygames.com', 'https://html.itch.zone', 'https://html-classic.itch.zone'];

/** Mẫu hợp lệ → { scheme, host, wild } hoặc null. */
function parsePattern(p) {
  const m = /^(https?):\/\/(\*\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(:\d{1,5})?$/i.exec(String(p).trim().replace(/\/+$/, ''));
  if (!m) return null;
  return { scheme: m[1].toLowerCase() + ':', wild: !!m[2], host: (m[3] + (m[4] || '')).toLowerCase() };
}

function patterns(env = process.env) {
  const extra = String(env.PORTAL_WS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return (env.PORTAL_WS === '0' ? [] : DEFAULT_PORTAL_ORIGINS).concat(extra).map(parsePattern).filter(Boolean);
}

/** Origin (chuỗi trong header) thuộc một cổng game đã khai không. */
function portalOriginAllowed(origin, env = process.env) {
  let u;
  try { u = new URL(String(origin)); } catch (e) { return false; }
  if (u.origin === 'null' || u.origin !== String(origin).replace(/\/+$/, '').toLowerCase()) return false; // có đường dẫn / lạ
  return patterns(env).some((p) => u.protocol === p.scheme && (p.wild ? u.host.endsWith('.' + p.host) : u.host === p.host));
}

module.exports = { DEFAULT_PORTAL_ORIGINS, parsePattern, patterns, portalOriginAllowed };
