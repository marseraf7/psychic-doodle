/*
 * Giờ của "Giải tuần" (hub/weekly-cup.js) – hàm thuần, không phụ thuộc múi giờ của máy chủ:
 *   nextSlot(after, cfg) → { at, key } – lần đấu đầu tiên SAU thời điểm after (ms): đúng thứ cfg.day (0 = Chủ nhật … 6 =
 *                          thứ Bảy), giờ cfg.hh:cfg.mm theo múi giờ IANA cfg.tz (tính bằng Intl qua local-time.js nên đúng
 *                          cả múi có giờ mùa hè, vd. Europe/Prague). key = 'YYYY-MM-DD' của ngày đấu theo múi giờ đó –
 *                          khoá duy nhất của mỗi lần giải (chống tạo trùng).
 *   wallToUtc(y, m, d, hh, mm, tz) → ms của giờ địa phương y-m-d hh:mm ở tz. Giờ không tồn tại (khoảng nhảy giờ mùa hè,
 *                          vd. 02:30 sáng ngày đổi giờ ở châu Âu) → giờ sau khi nhảy (03:30).
 */
'use strict';
const LT = require('./local-time.js');

const DAY_MS = 86400000;
const pad = (n, w = 2) => String(n).padStart(w, '0');

function wallToUtc(y, m, d, hh, mm, tz) {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const o1 = LT.localKey(wall, tz).off;
  let at = wall - o1 * 60000;
  // Độ lệch lúc "at" khác lúc đoán (giờ thật nằm ở phía bên kia lần đổi giờ): thử theo độ lệch mới; giờ đó vẫn không tự khớp
  // (giờ nằm trong khoảng nhảy – không tồn tại) thì lấy giờ SAU khi nhảy = trừ độ lệch nhỏ hơn. Đúng cả múi giờ dương
  // (Prague 02:30 → 03:30 CEST) lẫn âm (New York 02:30 → 03:30 EDT) – rà soát 27/11/2026: bản cũ lùi sớm 1 giờ ở múi âm.
  const o2 = LT.localKey(at, tz).off;
  if (o2 !== o1) {
    const a2 = wall - o2 * 60000;
    at = LT.localKey(a2, tz).off === o2 ? a2 : wall - Math.min(o1, o2) * 60000;
  }
  return at;
}

function nextSlot(after, { day, hh, mm, tz }) {
  const k = LT.localKey(after, tz);
  const base = Date.UTC(k.y, k.m - 1, k.d); // nửa đêm (coi như UTC) của ngày địa phương chứa after
  for (let i = 0; i < 15; i++) {
    const dt = new Date(base + i * DAY_MS);
    if (dt.getUTCDay() !== day) continue;
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    const at = wallToUtc(y, m, d, hh, mm, tz);
    if (at > after) return { at, key: `${pad(y, 4)}-${pad(m)}-${pad(d)}` };
  }
  /* node:coverage ignore next */
  return null; // không xảy ra: trong 15 ngày luôn có 2 lần đúng thứ
}

module.exports = { nextSlot, wallToUtc };
