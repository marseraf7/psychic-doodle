/*
 * Tên miền của game – MỘT chỗ duy nhất trong mã máy chủ (và các script dựng app / desktop) ghi tên miền chính.
 * Đổi tên miền: `bash scripts/set-domain.sh <tên-miền-mới>` (scripts/set-domain.js sửa dòng DEFAULT_HOST dưới đây cùng các
 * file tĩnh không đọc được biến môi trường – danh sách trong scripts/domain-files.js; bài thử server/test/domain-literals.test.js).
 * Lúc chạy, biến môi trường thắng giá trị mặc định:
 *   PUBLIC_URL   địa chỉ công khai (https://tên-miền) – link tuyệt đối, thẻ og, canonical, sitemap, MCP
 *   MOVED_TO     đã chuyển sang tên miền mới (https://tên-miền-mới): yêu cầu tới tên miền cũ được chuyển hướng / chuyển dữ
 *                liệu trình duyệt (domain-move.js). Thường đặt cùng PUBLIC_URL = MOVED_TO.
 *   MOVED_FROM   tên máy cũ (phẩy ngăn cách, vd. caroxo.duckdns.org,caroxo.ddnsgeek.com). Bỏ trống: mọi tên máy khác tên
 *                miền mới, trừ localhost / 127.0.0.1 / ::1 (lệnh kiểm tra trong máy – update.sh – không bị chuyển hướng).
 */
'use strict';

const DEFAULT_HOST = 'caroxo.duckdns.org'; // set-domain.js thay dòng này
const DEFAULT_ORIGIN = 'https://' + DEFAULT_HOST;
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** Gốc (giao thức + tên máy + cổng) của một địa chỉ http(s); sai định dạng → ''. */
function originOf(s) {
  try { const u = new URL(String(s || '').trim()); return /^https?:$/.test(u.protocol) ? u.origin : ''; } catch (e) { return ''; }
}
/** Tên máy (chữ thường, bỏ cổng) của giá trị header Host ("a.b:443", "[::1]:80"). */
function hostName(h) {
  const m = /^(\[[0-9a-f:.]+\]|[^:/\s]+)(?::\d{1,5})?$/i.exec(String(h || '').trim());
  return m ? m[1].toLowerCase() : '';
}

/** Địa chỉ công khai của trang: PUBLIC_URL, không có thì tên miền mặc định. */
function publicOrigin() { return originOf(process.env.PUBLIC_URL) || DEFAULT_ORIGIN; }
/** Tên miền mới khi đã chuyển (MOVED_TO), chưa chuyển → ''. */
function movedTo() { return originOf(process.env.MOVED_TO); }
/** Địa chỉ chuẩn (canonical) cho máy tìm kiếm: tên miền mới nếu đã chuyển, không thì địa chỉ công khai. */
function canonicalOrigin() { return movedTo() || publicOrigin(); }
/** Tên máy của địa chỉ công khai. */
function publicHost() { return new URL(publicOrigin()).hostname; }
/** Danh sách tên máy cũ khai ở MOVED_FROM. */
function movedFrom() {
  return String(process.env.MOVED_FROM || '').split(',').map((s) => hostName(s.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''))).filter(Boolean);
}
/** Yêu cầu tới tên miền cũ (cần chuyển hướng / chuyển dữ liệu) không – theo header Host. */
function isOldHost(hostHeader) {
  const to = movedTo();
  if (!to) return false;
  const h = hostName(hostHeader);
  if (!h || h === new URL(to).hostname) return false;
  const from = movedFrom();
  return from.length ? from.includes(h) : !LOOPBACK.includes(h);
}
/** Mọi tên máy công khai của game (MCP chống DNS rebinding): địa chỉ công khai, tên miền mới, tên máy cũ. */
function siteHosts() {
  const list = [publicHost()];
  const to = movedTo();
  if (to) list.push(new URL(to).hostname);
  for (const h of movedFrom()) list.push(h);
  return [...new Set(list)];
}

module.exports = { DEFAULT_HOST, DEFAULT_ORIGIN, originOf, hostName, publicOrigin, movedTo, canonicalOrigin, publicHost, movedFrom, isOldHost, siteHosts };
