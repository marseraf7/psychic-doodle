/*
 * Hook "capacitor:copy:after" (package.json – chạy sau mỗi `cap copy` / `cap sync`): bản iOS không mang Rapfi.
 * Rapfi (BOAT ở luật tự do / tiêu chuẩn / Renju, phân tích bằng Rapfi) theo GPL-3, mà điều khoản App Store xung khắc
 * với GPL – nên xoá thư mục rapfi/ khỏi bản chép vào ios/ và bật CARO_NO_RAPFI: BOAT / phân tích trên iOS dùng engine
 * của game (như luật Việt Nam). Android và web giữ nguyên Rapfi.
 */
'use strict';
const fs = require('fs');
const path = require('path');

if (process.env.CAPACITOR_PLATFORM_NAME !== 'ios') process.exit(0);
const pub = path.resolve(__dirname, '..', 'ios', 'App', 'App', 'public');
if (!fs.existsSync(pub)) { console.error('✗ Không thấy ' + pub); process.exit(1); }
fs.rmSync(path.join(pub, 'rapfi'), { recursive: true, force: true });
const cfg = path.join(pub, 'config.js');
const flag = 'window.CARO_NO_RAPFI = true; // iOS: không kèm Rapfi (GPL-3) – app/scripts/strip-rapfi-ios.js\n';
const text = fs.readFileSync(cfg, 'utf8');
if (!text.includes('CARO_NO_RAPFI')) fs.writeFileSync(cfg, text + flag);
console.log('✓ iOS: đã bỏ Rapfi (rapfi/) khỏi bản ứng dụng');
