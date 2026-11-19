/*
 * Dựng thư mục www cho ứng dụng từ giao diện web (../caro) – hai bản dùng chung một mã nguồn (phần chép chung với
 * app desktop: web-common.js).
 * Biến môi trường:
 *   CARO_SERVER_URL            máy chủ online (mặc định https://caroxo.duckdns.org) – phải là https
 *   CARO_APP_TEST=1            bản thử nghiệm: cho phép máy chủ http (chỉ dùng khi kiểm thử)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const { fail, serverOrigin, copyCaro, writeConfig, injectScripts } = require('./web-common.js');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const TEST = process.env.CARO_APP_TEST === '1';
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

// ---------------------------------------------------------------- Máy chủ
// Android và iOS chặn kết nối không mã hoá: bản phát hành bắt buộc https/wss.
const serverUrl = serverOrigin(process.env, TEST);

// ---------------------------------------------------------------- Chép giao diện
copyCaro(WWW);
writeConfig(WWW, 'app/scripts/build-web.js', serverUrl, APP_VERSION);

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
injectScripts(WWW, VENDOR.map(([, to]) => `vendor/${to}`));

// ---------------------------------------------------------------- Cấu hình Capacitor
const config = {
  appId: 'io.github.marseraf7.caro',
  appName: 'Caro x Gomoku',
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
