/*
 * Phần dùng chung khi dựng thư mục www từ giao diện web (../caro): app Android / iOS (app/scripts/build-web.js) và app
 * desktop Tauri (desktop/scripts/build-web.js) – để hai nơi chép giao diện và chọn máy chủ y như nhau.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CARO = path.resolve(__dirname, '..', '..', 'caro');
// Không chép: bài thử, service worker (app tự có file), config.js (mỗi bản tự ghi), README
const SKIP = new Set(['tests', 'README.md', 'sw.js', 'config.js']);

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

/**
 * Địa chỉ máy chủ online từ CARO_SERVER_URL (mặc định https://caroxo.duckdns.org), chỉ gồm giao thức + tên miền (+ cổng).
 * http chỉ cho phép khi allowHttp (bản thử nghiệm) – Android, iOS và bản phát hành desktop đều bắt buộc https/wss.
 */
function serverOrigin(env, allowHttp) {
  let server;
  try { server = new URL(env.CARO_SERVER_URL || 'https://caroxo.duckdns.org'); } catch (e) { fail('CARO_SERVER_URL không hợp lệ'); }
  if (!['https:', 'http:'].includes(server.protocol) || server.pathname !== '/' || server.search || server.hash) {
    fail('CARO_SERVER_URL chỉ gồm giao thức + tên miền (+ cổng), ví dụ https://caro.example.com');
  }
  if (server.protocol === 'http:' && !allowHttp) fail('Máy chủ phải dùng https (http chỉ dùng cho bản thử nghiệm CARO_APP_TEST=1)');
  return server.origin;
}

/** Xoá rồi chép ../caro vào www (bỏ SKIP và rapfi/nets/ – mạng Rapfi ~10 MB mỗi file, app tự tải khi cần). */
function copyCaro(www) {
  fs.rmSync(www, { recursive: true, force: true });
  const skip = (rel) => SKIP.has(rel.split(path.sep)[0]) || rel === path.join('rapfi', 'nets');
  fs.cpSync(CARO, www, { recursive: true, filter: (src) => src === CARO || !skip(path.relative(CARO, src)) });
}

/** Ghi www/config.js: máy chủ, phiên bản app, cộng các biến window.* thêm (extra: { TÊN: giá trị }). */
function writeConfig(www, by, serverUrl, version, extra) {
  const lines = [`// Tạo tự động bởi ${by} – không sửa tay.`, `window.CARO_SERVER = ${JSON.stringify(serverUrl)};`,
    // Gửi kèm khi kết nối để máy chủ báo "cần cập nhật app" với bản quá cũ (MIN_APP_VERSION)
    `window.CARO_APP_VERSION = ${JSON.stringify(version)};`];
  for (const [k, v] of Object.entries(extra || {})) lines.push(`window.${k} = ${JSON.stringify(v)};`);
  fs.writeFileSync(path.join(www, 'config.js'), lines.join('\n') + '\n');
}

/** Chèn các thẻ <script src> vào www/index.html ngay trước <script src="native.js"> (không sửa caro/index.html gốc). */
function injectScripts(www, srcs) {
  const indexFile = path.join(www, 'index.html');
  const html = fs.readFileSync(indexFile, 'utf8');
  const anchor = '<script src="native.js"></script>';
  if (!html.includes(anchor)) fail('index.html thiếu thẻ <script src="native.js">');
  fs.writeFileSync(indexFile, html.replace(anchor, srcs.map((s) => `<script src="${s}"></script>`).join('\n  ') + '\n  ' + anchor));
}

module.exports = { CARO, SKIP, fail, serverOrigin, copyCaro, writeConfig, injectScripts };
