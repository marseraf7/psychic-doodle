/*
 * Dựng thư mục www cho ứng dụng từ giao diện web (../caro) – hai bản dùng chung một mã nguồn.
 * Biến môi trường:
 *   CARO_SERVER_URL            máy chủ online (mặc định https://caroxo.duckdns.org) – phải là https
 *   CARO_APP_TEST=1            bản thử nghiệm: cho phép máy chủ http (chỉ dùng khi kiểm thử)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, '..', 'caro');
const WWW = path.join(ROOT, 'www');
const TEST = process.env.CARO_APP_TEST === '1';
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

// ---------------------------------------------------------------- Máy chủ
let server;
try { server = new URL(process.env.CARO_SERVER_URL || 'https://caroxo.duckdns.org'); } catch (e) { fail('CARO_SERVER_URL không hợp lệ'); }
if (!['https:', 'http:'].includes(server.protocol) || server.pathname !== '/' || server.search || server.hash) {
  fail('CARO_SERVER_URL chỉ gồm giao thức + tên miền (+ cổng), ví dụ https://caro.example.com');
}
// Android và iOS chặn kết nối không mã hoá: bản phát hành bắt buộc https/wss.
if (server.protocol === 'http:' && !TEST) fail('Máy chủ phải dùng https (http chỉ dùng cho bản thử nghiệm CARO_APP_TEST=1)');
const serverUrl = server.origin;

// ---------------------------------------------------------------- Chép giao diện
const SKIP = new Set(['tests', 'README.md', 'sw.js', 'config.js']);
fs.rmSync(WWW, { recursive: true, force: true });
fs.cpSync(SRC, WWW, { recursive: true, filter: (src) => !SKIP.has(path.relative(SRC, src).split(path.sep)[0]) || src === SRC });

fs.writeFileSync(path.join(WWW, 'config.js'),
  '// Tạo tự động bởi app/scripts/build-web.js – không sửa tay.\n' +
  `window.CARO_SERVER = ${JSON.stringify(serverUrl)};\n` +
  // Gửi kèm khi kết nối để máy chủ báo "cần cập nhật app" với bản quá cũ (MIN_APP_VERSION)
  `window.CARO_APP_VERSION = ${JSON.stringify(APP_VERSION)};\n`);

// ---------------------------------------------------------------- Thư viện Capacitor (không cần bundler)
const VENDOR = [
  ['@capacitor/core/dist/capacitor.js', 'capacitor.js'],
  ['@capacitor/app/dist/plugin.js', 'app.js'],
  ['@capacitor/share/dist/plugin.js', 'share.js'],
  ['@capacitor/clipboard/dist/plugin.js', 'clipboard.js'],
  ['@capacitor/haptics/dist/plugin.js', 'haptics.js'],
  ['@capacitor/filesystem/dist/plugin.js', 'filesystem.js'],
  ['@capgo/capacitor-social-login/dist/plugin.js', 'social-login.js'],
];
fs.mkdirSync(path.join(WWW, 'vendor'));
for (const [from, to] of VENDOR) {
  const src = path.join(ROOT, 'node_modules', from);
  if (!fs.existsSync(src)) fail('Thiếu ' + from + ' – chạy npm ci trong thư mục app');
  // Bỏ dòng sourceMappingURL (không chép file .map)
  fs.writeFileSync(path.join(WWW, 'vendor', to), fs.readFileSync(src, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/m, '\n'));
}
const indexFile = path.join(WWW, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');
const anchor = '<script src="native.js"></script>';
if (!html.includes(anchor)) fail('index.html thiếu thẻ <script src="native.js">');
html = html.replace(anchor, VENDOR.map(([, to]) => `<script src="vendor/${to}"></script>`).join('\n  ') + '\n  ' + anchor);
fs.writeFileSync(indexFile, html);

// ---------------------------------------------------------------- Cấu hình Capacitor
const config = {
  appId: 'io.github.marseraf7.caro',
  appName: 'Cờ Caro',
  webDir: 'www',
  android: {
    // Bản thử nghiệm kết nối máy chủ http trong mạng nội bộ; bản phát hành luôn tắt.
    allowMixedContent: TEST,
  },
  server: TEST ? { cleartext: true } : {},
  plugins: {
    SocialLogin: { providers: { google: true, facebook: false, apple: false, twitter: false } },
  },
};
fs.writeFileSync(path.join(ROOT, 'capacitor.config.json'), JSON.stringify(config, null, 2) + '\n');

console.log(`✓ www đã dựng từ ../caro · máy chủ ${serverUrl}${TEST ? ' (bản thử nghiệm)' : ''}`);
