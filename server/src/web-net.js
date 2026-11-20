/*
 * Tin cậy mạng của phần HTTP / WebSocket (tách khỏi web.js): IP thật của người gọi sau proxy (X-Forwarded-For chỉ tin khi
 * kết nối đến từ proxy đáng tin – M-S2) và chính sách Origin của WebSocket (M-S1).
 *   ipInCidr(addr, cidr), fromProxy(addr), wsOriginAllowed(req), clientIp(req)
 */
'use strict';
/** Địa chỉ IPv4 có nằm trong CIDR (vd. 172.17.0.0/16) hay bằng đúng IP đơn lẻ không.
 *  IPv6 chỉ so khớp đúng chuỗi (đủ cho địa chỉ proxy cụ thể). */
function ipInCidr(addr, cidr) {
  const c = String(cidr || '').trim();
  if (!c) return false;
  if (!c.includes('/')) return addr === c;
  const [base, bitsStr] = c.split('/');
  const bits = Number(bitsStr);
  const v4 = (s) => { const p = String(s).split('.').map(Number); return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p.reduce((v, n) => v * 256 + n, 0) : null; };
  const a = v4(addr), b = v4(base);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

/** Kết nối đến từ proxy đáng tin không.
 *  M-S2: nếu đặt TRUSTED_PROXY_CIDRS (các CIDR/IP cách nhau dấu phẩy) thì CHỈ những địa chỉ
 *  đó được tin — trước đây mọi dải IP riêng (gồm cả dải bridge 172.16/12 của Docker) đều
 *  được tin, nên khi cổng máy chủ bị lộ ra Internet qua Docker, kẻ tấn công nối thẳng vào
 *  vẫn được coi là "proxy" và X-Forwarded-For của chúng được tin hoàn toàn.
 *  Chưa đặt biến này thì giữ hành vi cũ (máy này + mạng nội bộ) để không phá các bản
 *  cài đang chạy sau proxy thật; máy chủ sẽ in cảnh báo khi TRUST_PROXY bật ở cấu hình đó. */
function fromProxy(addr) {
  const a = String(addr || '').replace(/^::ffff:/, '');
  const configured = String(process.env.TRUSTED_PROXY_CIDRS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (configured.length) return configured.some((c) => ipInCidr(a, c));
  if (a === '::1' || /^127\./.test(a) || /^10\./.test(a) || /^192\.168\./.test(a)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return true;
  return /^f[cd][0-9a-f]{2}:/i.test(a); // IPv6 nội bộ fc00::/7
}

/** M-S1: Origin của một kết nối WebSocket có được phép không. Xác thực của game dùng
 *  token gửi trong tin hello (không dùng cookie) nên đây không phải chống trộm tài khoản,
 *  mà để một trang web lạ không mượn được trình duyệt + IP của người thăm để chơi/chat/spam
 *  bằng IP của họ (qua NAT nhà mạng có thể làm cháy hạn mức của cả một nhà mạng).
 *  Chính sách: không có Origin (app gốc / công cụ kiểm thử — không phải trình duyệt) thì cho
 *  qua; Origin cùng host với máy chủ (bản web do chính máy chủ phục vụ), Origin của app
 *  Capacitor / Tauri, các địa chỉ web chính thức (OWN_WS_ORIGINS), Origin của PUBLIC_URL, hoặc Origin khai thêm qua
 *  WS_ALLOWED_ORIGINS thì cho qua; còn lại từ chối. */
// App desktop Tauri (thí điểm, desktop/): tauri://localhost trên macOS / Linux, http://tauri.localhost trên Windows
const APP_WS_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', 'tauri://localhost', 'http://tauri.localhost'];
// Các địa chỉ web chính thức của game (cùng chủ, tin được như bản do máy chủ phục vụ) – có sẵn, khỏi đặt
// WS_ALLOWED_ORIGINS trên máy chủ:
//  - bản giao diện tĩnh trên GitHub Pages (caro/config.js trỏ về máy chủ chính, #110 P3): tải nhanh ở nơi khó vào
//    máy chủ (đo từ Nga: Pages hiện ngay, máy chủ chính > 5 phút);
//  - tên miền phụ caroxo.ddnsgeek.com (cùng máy chủ với caroxo.duckdns.org).
const OWN_WS_ORIGINS = ['https://marseraf7.github.io', 'https://caroxo.ddnsgeek.com'];
function wsOriginAllowed(req) {
  const raw = String((req.headers && req.headers.origin) || '').trim().replace(/\/+$/, '');
  if (!raw) return true;
  const extras = String(process.env.WS_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (APP_WS_ORIGINS.includes(raw) || OWN_WS_ORIGINS.includes(raw) || extras.includes(raw)) return true;
  let o;
  try { o = new URL(raw); } catch (e) { return false; }
  if (process.env.PUBLIC_URL) { try { if (new URL(process.env.PUBLIC_URL).origin === o.origin) return true; } catch (e) { /* PUBLIC_URL sai định dạng: bỏ qua */ } }
  return o.host === String((req.headers && req.headers.host) || '');
}

/** IP thật của người chơi. Sau proxy (Caddy/nginx) lấy IP cuối cùng do proxy thêm vào,
 *  vì các phần đầu của X-Forwarded-For do trình duyệt tự gửi và có thể bị giả mạo. */
function clientIp(req) {
  // Chỉ tin X-Forwarded-For khi kết nối đến từ proxy; ai gọi thẳng vào cổng Node từ Internet thì không giả IP được
  if (process.env.TRUST_PROXY && fromProxy(req.socket.remoteAddress)) {
    const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket.remoteAddress;
}

module.exports = { ipInCidr, fromProxy, wsOriginAllowed, clientIp };
