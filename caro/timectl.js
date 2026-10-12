/*
 * Thời gian ván đấu (dùng chung trình duyệt và máy chủ – chỉ dữ liệu + hàm thuần):
 *   - Đồng hồ tổng "phút+giây cộng" như Lichess, vd. '5+3': mỗi bên 5 phút, mỗi nước cộng 3 giây.
 *   - Giới hạn mỗi nước: số giây cho từng nước (0 = không giới hạn).
 * Các mức chọn được nằm trong MINUTES / INCS / PER_MOVE (thanh trượt nhảy theo các mức này).
 * Giá trị dạng chữ dùng trong form / ô chọn: 't0' (không giới hạn), 't20' (20 giây mỗi nước), 'c5+3' (đồng hồ).
 */
(function (global) {
  'use strict';
  const MINUTES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 40, 45, 60, 90, 120, 180];
  const INCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 45, 60, 90, 120, 180];
  const PER_MOVE = [5, 10, 15, 20, 25, 30, 40, 45, 60, 90, 120];
  // Ô chọn nhanh (dưới thanh trượt) và lưới ghép trận ở Trang chủ
  const CLOCK_PRESETS = ['1+0', '2+1', '3+0', '3+2', '5+0', '5+3', '10+0', '10+5', '15+10', '30+0', '30+20'];
  const MOVE_PRESETS = [10, 20, 30, 45, 60];

  /** '5+3' hợp lệ (phút, giây cộng nằm trong các mức cho phép). */
  function isClock(s) {
    const m = /^(\d{1,3})\+(\d{1,3})$/.exec(String(s || ''));
    return !!m && MINUTES.includes(Number(m[1])) && INCS.includes(Number(m[2]));
  }
  /** '5+3' -> { base: 300000, inc: 3000 } (ms), hoặc null nếu không hợp lệ. */
  function parseClock(s) {
    if (!isClock(s)) return null;
    const [m, i] = s.split('+').map(Number);
    return { base: m * 60000, inc: i * 1000 };
  }
  /** Số giây mỗi nước hợp lệ (0 = không giới hạn). */
  const isTimeLimit = (n) => Number(n) === 0 || PER_MOVE.includes(Number(n));
  /** Loại thời gian của đồng hồ tổng (thời lượng ước tính = phút*60 + 40*giây cộng, như Lichess). */
  function poolOfClock(s) {
    const [m, i] = String(s).split('+').map(Number);
    const est = m * 60 + 40 * i;
    return est < 180 ? 'bullet' : est < 480 ? 'blitz' : est < 1500 ? 'rapid' : 'classical';
  }
  /** 't20' / 'c5+3' / 't0' -> { timeLimit, clock } (giá trị lạ -> không giới hạn). */
  function fromValue(v) {
    v = String(v || '');
    if (v[0] === 'c' && isClock(v.slice(1))) return { timeLimit: 0, clock: v.slice(1) };
    const n = Number(v.slice(1));
    return { timeLimit: v[0] === 't' && isTimeLimit(n) ? n : 0, clock: null };
  }
  /** { timeLimit, clock } -> 't20' / 'c5+3' / 't0'. */
  const toValue = ({ timeLimit, clock } = {}) => (clock && isClock(clock) ? 'c' + clock : 't' + (isTimeLimit(timeLimit) ? Number(timeLimit) : 0));

  const CaroTimeCtl = { MINUTES, INCS, PER_MOVE, CLOCK_PRESETS, MOVE_PRESETS, isClock, parseClock, isTimeLimit, poolOfClock, fromValue, toValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroTimeCtl;
  else global.CaroTimeCtl = CaroTimeCtl;
})(typeof window !== 'undefined' ? window : globalThis);
