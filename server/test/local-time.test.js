// Giờ địa phương theo múi giờ thiết bị (local-time.js): khoá ngày / tháng / năm, 00:00 của ngày, đổi giờ mùa hè, múi giờ sai.
// Dùng chung cho Tổng kết tháng / năm (hub/recap.js) và trần lượt Storm / ngày (hub/progress.js). Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LT = require('../src/local-time.js');

const pick = (k) => ({ day: k.day, month: k.month, year: k.year, off: k.off });

test('localKey: múi giờ không đổi giờ mùa hè (Việt Nam, Thượng Hải, Moskva)', () => {
  assert.deepStrictEqual(pick(LT.localKey(Date.UTC(2026, 0, 31, 17), 'Asia/Ho_Chi_Minh')), { day: '2026-02-01', month: '2026-02', year: '2026', off: 420 });
  assert.strictEqual(LT.localKey(Date.UTC(2026, 0, 31, 16, 59), 'Asia/Ho_Chi_Minh').day, '2026-01-31');
  assert.deepStrictEqual(pick(LT.localKey(Date.UTC(2026, 11, 31, 16), 'Asia/Shanghai')), { day: '2027-01-01', month: '2027-01', year: '2027', off: 480 });
  assert.strictEqual(LT.localKey(Date.UTC(2026, 11, 31, 15, 59), 'Asia/Shanghai').year, '2026');
  // Moskva: UTC+3 cả năm (bỏ giờ mùa hè từ 2014)
  assert.strictEqual(LT.localKey(Date.UTC(2026, 0, 15, 12), 'Europe/Moscow').off, 180);
  assert.strictEqual(LT.localKey(Date.UTC(2026, 6, 15, 12), 'Europe/Moscow').off, 180);
  assert.strictEqual(LT.localKey(Date.UTC(2026, 6, 15, 21), 'Europe/Moscow').day, '2026-07-16');
  const k = LT.localKey(Date.UTC(2026, 4, 9, 20, 30), 'Asia/Ho_Chi_Minh');
  assert.deepStrictEqual([k.y, k.m, k.d], [2026, 5, 10]);
});

test('localKey + dayStart: múi giờ có giờ mùa hè (Berlin, New York) – ngày 23 giờ / 25 giờ', () => {
  assert.strictEqual(LT.localKey(Date.UTC(2026, 0, 15, 12), 'Europe/Berlin').off, 60);
  assert.strictEqual(LT.localKey(Date.UTC(2026, 6, 15, 12), 'Europe/Berlin').off, 120);
  // Berlin 29/3/2026: 02:00 CET → 03:00 CEST (ngày 23 giờ). 10:00 sáng: 00:00 là 23:00 UTC ngày 28
  const spring = LT.dayStart(Date.UTC(2026, 2, 29, 8), 'Europe/Berlin');
  assert.strictEqual(spring, Date.UTC(2026, 2, 28, 23));
  assert.strictEqual(LT.dayStart(Date.UTC(2026, 2, 29, 23, 30), 'Europe/Berlin'), Date.UTC(2026, 2, 29, 22), 'nửa đêm sau: 22:00 UTC');
  // Berlin 25/10/2026: 03:00 CEST → 02:00 CET (ngày 25 giờ)
  const fall = LT.dayStart(Date.UTC(2026, 9, 25, 11), 'Europe/Berlin');
  assert.strictEqual(fall, Date.UTC(2026, 9, 24, 22));
  assert.strictEqual(LT.dayStart(Date.UTC(2026, 9, 25, 22, 59), 'Europe/Berlin'), fall, '23:59 CET vẫn cùng ngày');
  assert.strictEqual(LT.localKey(Date.UTC(2026, 9, 25, 23), 'Europe/Berlin').day, '2026-10-26');
  // New York 1/11/2026: 02:00 EDT → 01:00 EST
  assert.strictEqual(LT.localKey(Date.UTC(2026, 10, 1, 3, 30), 'America/New_York').month, '2026-10', '23:30 EDT 31/10');
  assert.deepStrictEqual(pick(LT.localKey(Date.UTC(2026, 10, 1, 4, 30), 'America/New_York')), { day: '2026-11-01', month: '2026-11', year: '2026', off: -240 });
  assert.strictEqual(LT.localKey(Date.UTC(2026, 10, 1, 6, 30), 'America/New_York').off, -300, '01:30 EST (lần thứ hai)');
  assert.strictEqual(LT.dayStart(Date.UTC(2026, 10, 1, 17), 'America/New_York'), Date.UTC(2026, 10, 1, 4));
  // New York 8/3/2026: 02:00 EST → 03:00 EDT
  assert.strictEqual(LT.dayStart(Date.UTC(2026, 2, 8, 16), 'America/New_York'), Date.UTC(2026, 2, 8, 5));
  // Múi giờ không đổi giờ: dayStart = 00:00 địa phương
  assert.strictEqual(LT.dayStart(Date.UTC(2026, 0, 31, 17, 5), 'Asia/Ho_Chi_Minh'), Date.UTC(2026, 0, 31, 17));
  assert.strictEqual(LT.dayStart(Date.UTC(2026, 6, 1, 12), 'Europe/Moscow'), Date.UTC(2026, 5, 30, 21));
});

test('phút lệch UTC (máy cũ chỉ gửi số phút) và múi giờ sai → dự phòng giờ Việt Nam', () => {
  assert.strictEqual(LT.localKey(Date.UTC(2026, 0, 1, 0, 30), -60).day, '2025-12-31');
  assert.strictEqual(LT.localKey(Date.UTC(2026, 0, 1, 0, 30), 345).off, 345, 'Nepal +5:45');
  assert.strictEqual(LT.dayStart(Date.UTC(2026, 0, 1, 12), 60), Date.UTC(2025, 11, 31, 23));
  for (const bad of ['Mars/Olympus', 'x'.repeat(100), '../etc/passwd', '', 9999, 1.5, '420', null, undefined, {}, NaN]) {
    const k = LT.localKey(Date.UTC(2026, 0, 31, 17), bad);
    assert.strictEqual(k.off, LT.FALLBACK_OFF, 'dự phòng: ' + String(bad));
    assert.strictEqual(k.day, '2026-02-01');
  }
  assert.strictEqual(LT.FALLBACK_OFF, 420);
  assert.strictEqual(LT.validZone('Europe/Berlin'), true);
  assert.strictEqual(LT.validZone('UTC'), true);
  assert.strictEqual(LT.validZone('Mars/Olympus'), false);
  assert.strictEqual(LT.validZone(42), false);
});

test('tzOf: tên IANA đã lưu nếu hợp lệ, không thì số phút lệch, không có thì null', () => {
  assert.strictEqual(LT.tzOf({ tzName: 'Europe/Berlin', tz: 60 }), 'Europe/Berlin');
  assert.strictEqual(LT.tzOf({ tzName: 'Bad/Zone', tz: 120 }), 120);
  assert.strictEqual(LT.tzOf({ tz: 2000 }), null);
  assert.strictEqual(LT.tzOf({}), null);
  assert.strictEqual(LT.tzOf(null), null);
});
