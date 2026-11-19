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

console.log(`✓ desktop/www đã dựng từ ../caro · máy chủ ${serverUrl} · thêm ${extras.join(', ')}`);
