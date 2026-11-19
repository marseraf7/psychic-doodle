/*
 * Dựng desktop/www cho app desktop Tauri từ giao diện web (../caro) – chép giống hệt app Android / iOS
 * (app/scripts/web-common.js: bỏ tests, sw.js, rapfi/nets), rồi:
 *  - config.js trỏ về máy chủ online, thêm cờ window.CARO_DESKTOP = true;
 *  - chép cầu nối thí điểm www-extra/native-engine.js (window.CaroNativeEngine – Rapfi gốc qua lệnh Tauri) và nạp nó
 *    trong bản sao www/index.html (không sửa caro/index.html). Chưa nối vào giao diện chơi.
 * Biến môi trường: CARO_SERVER_URL (mặc định https://caroxo.duckdns.org, phải https) · CARO_APP_TEST=1 cho phép http.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { serverOrigin, copyCaro, writeConfig, injectScripts } = require('../../app/scripts/web-common.js');

const DESK = path.resolve(__dirname, '..');
const WWW = path.join(DESK, 'www');
const EXTRA = path.join(DESK, 'www-extra');
const VERSION = JSON.parse(fs.readFileSync(path.join(DESK, 'package.json'), 'utf8')).version;

const serverUrl = serverOrigin(process.env, process.env.CARO_APP_TEST === '1');
copyCaro(WWW);
writeConfig(WWW, 'desktop/scripts/build-web.js', serverUrl, VERSION, { CARO_DESKTOP: true });

const extras = fs.readdirSync(EXTRA).filter((f) => f.endsWith('.js')).sort();
for (const f of extras) fs.copyFileSync(path.join(EXTRA, f), path.join(WWW, f));
injectScripts(WWW, extras);

// CSP cho cửa sổ app (Tauri ghép vào lúc dựng: tauri build --config src-tauri/tauri.csp.json). Giống CSP của máy chủ
// (server/src/web.js) nhưng giao diện nạp tại chỗ ('self' = tauri://localhost) nên phải cho thêm máy chủ online (API, ảnh,
// WebSocket) và kênh IPC của Tauri (ipc: trên macOS / Linux, http://ipc.localhost trên Windows). withGlobalTauri mở cầu
// nối lệnh native cho mọi script trên trang – CSP chặn script lạ (chỉ script của app + Google đăng nhập).
const ws = serverUrl.replace(/^http/, 'ws');
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  `img-src 'self' data: blob: ${serverUrl} https://*.googleusercontent.com`,
  `connect-src 'self' ipc: http://ipc.localhost ${serverUrl} ${ws} https://accounts.google.com/gsi/ https://cdn.jsdelivr.net https://raw.githubusercontent.com`,
  "frame-src https://accounts.google.com/gsi/",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'",
].join('; ');
fs.writeFileSync(path.join(DESK, 'src-tauri', 'tauri.csp.json'), JSON.stringify({ app: { security: { csp } } }, null, 2) + '\n');

console.log(`✓ desktop/www đã dựng từ ../caro · máy chủ ${serverUrl} · thêm ${extras.join(', ')}`);
