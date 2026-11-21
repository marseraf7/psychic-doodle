/*
 * Giờ địa phương theo múi giờ THIẾT BỊ của người chơi – dùng chung cho Tổng kết tháng / năm (hub/recap.js: kỳ tháng / năm,
 * "ngày có chơi") và trần lượt Puzzle Storm mỗi ngày (hub/progress.js). Bảng Storm tuần và Hạng đấu tuần KHÔNG dùng file này:
 * vẫn theo tuần chung giờ Việt Nam (caro/progress-merge.js weekKey) để mọi người cùng một tuần.
 *   tzOf(u)          → múi giờ đã lưu của tài khoản: tên IANA (u.tzName, vd. 'Europe/Berlin' – đúng giờ mùa hè) nếu hợp lệ,
 *                      không thì số phút lệch UTC (u.tz – máy cũ chỉ gửi số này), không có thì null. Lưu lúc kết nối
 *                      (auth.js on_hello → core.js attach).
 *   localKey(at, tz) → { day: 'YYYY-MM-DD', month: 'YYYY-MM', year: 'YYYY', y, m, d, off } của thời điểm at (ms) theo tz.
 *                      tz: tên IANA | số phút lệch UTC (-720..840) | null / sai → FALLBACK_OFF (giờ Việt Nam, UTC+7).
 *                      off: số phút lệch UTC lúc at (tên IANA: tính bằng Intl.DateTimeFormat nên đổi giờ mùa hè đúng).
 *   dayStart(at, tz) → ms lúc bắt đầu ngày địa phương chứa at (thường 00:00; ngày đổi giờ dài 23 / 25 giờ vẫn đúng).
 *   validZone(name)  → tên IANA dùng được (máy chủ có dữ liệu múi giờ đó).
 */
'use strict';

const FALLBACK_OFF = 420; // giờ Việt Nam – múi giờ chung của app khi chưa biết múi giờ thiết bị
const NAME_RE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;
const fmts = new Map(); // tên → Intl.DateTimeFormat | null (tên sai) – tạo một lần mỗi múi giờ
const pad = (n, w = 2) => String(n).padStart(w, '0');

function fmtOf(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name) || name.includes('..')) return null;
  if (fmts.has(name)) return fmts.get(name);
  let f = null;
  try {
    f = new Intl.DateTimeFormat('en-US', { timeZone: name, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  } catch (e) { f = null; } // RangeError: múi giờ không có
  if (fmts.size < 1000) fmts.set(name, f); // tên do máy gửi (đã lọc ở auth.js): giới hạn bộ nhớ đệm
  return f;
}

const validZone = (name) => !!fmtOf(name);
const validOff = (v) => Number.isInteger(v) && v >= -720 && v <= 840;

function tzOf(u) {
  if (!u) return null;
  if (validZone(u.tzName)) return u.tzName;
  return validOff(u.tz) ? u.tz : null;
}

/** Số phút lệch UTC của múi giờ IANA lúc at: giờ trên đồng hồ địa phương (coi như UTC) trừ thời điểm thật. */
function zoneOff(f, at) {
  const p = {};
  for (const x of f.formatToParts(new Date(at))) p[x.type] = x.value;
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((wall - Math.floor(at / 1000) * 1000) / 60000);
}

function localKey(at, tz) {
  at = Number(at) || 0;
  const f = fmtOf(tz);
  const off = f ? zoneOff(f, at) : validOff(tz) ? tz : FALLBACK_OFF;
  const t = new Date(at + off * 60000);
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
  const year = pad(y, 4);
  return { day: `${year}-${pad(m)}-${pad(d)}`, month: `${year}-${pad(m)}`, year, y, m, d, off };
}

function dayStart(at, tz) {
  const k = localKey(at, tz);
  const mid = Date.UTC(k.y, k.m - 1, k.d);
  const s = mid - k.off * 60000;
  // Giờ mùa hè đổi trong ngày (từ 00:00 tới at): lấy độ lệch lúc nửa đêm. Ngày bắt đầu bằng giờ bị bỏ qua (00:00 không có,
  // vd. Chile): s rơi đúng lúc đổi giờ – giờ đầu tiên của ngày
  const off0 = localKey(s, tz).off;
  return off0 === k.off ? s : mid - off0 * 60000;
}

module.exports = { localKey, dayStart, tzOf, validZone, FALLBACK_OFF };
