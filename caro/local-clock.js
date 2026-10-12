/*
 * Đồng hồ tổng khi chơi trên máy (với máy hoặc 2 người), như đồng hồ cờ vua "5+3":
 * mỗi bên một quỹ thời gian, đi xong một nước thì được cộng thêm số giây cộng.
 * Đồng hồ chỉ chạy từ sau nước đầu tiên (như Lichess). Chỉ có phần tính toán – app.js gắn vào ván và vẽ.
 *
 * Đối tượng đồng hồ c (cùng dạng đồng hồ ván online để app.js vẽ chung):
 *   { x, o: số ms còn lại tính tới thời điểm at · running: 1 (X) | 2 (O) | 0 · at: performance.now() · inc · local: true }
 */
(function () {
  'use strict';
  const TC = window.CaroTimeCtl;
  const key = (p) => (p === 1 ? 'x' : 'o');

  /** Đồng hồ mới theo spec '5+3' (null nếu spec không hợp lệ). saved: { x, o } còn lại (khôi phục khi tải lại trang). */
  function create(spec, now, saved) {
    const c = TC.parseClock(spec);
    if (!c) return null;
    const ok = (v) => (Number.isFinite(v) && v > 0 && v <= c.base * 10 ? v : c.base);
    return { x: ok(saved && saved.x), o: ok(saved && saved.o), running: 0, at: now, inc: c.inc, local: true, spec };
  }
  /** Chốt thời gian bên đang chạy tới lúc now. */
  function settle(c, now) {
    if (c.running) c[key(c.running)] -= now - c.at;
    c.at = now;
  }
  /** Cho bên want chạy (0: dừng cả hai). */
  function run(c, want, now) {
    if (c.running === want) return;
    settle(c, now);
    c.running = want;
  }
  /** Bên mover vừa đi xong: trừ thời gian đã dùng, cộng giây cộng. */
  function press(c, mover, now) {
    if (c.running !== mover) return;
    settle(c, now);
    c[key(mover)] += c.inc;
  }
  /** Thời gian còn lại của bên p lúc now. */
  const left = (c, p, now) => c[key(p)] - (c.running === p ? now - c.at : 0);
  /** Tạm dừng dt ms (đang mở hộp thoại / trang khác / chuyển app): đẩy mốc tính giờ lên. */
  function pause(c, dt) { c.at += dt; }
  /** Số liệu để lưu: { spec, x, o } đã chốt tới now. */
  const snapshot = (c, now) => ({ spec: c.spec, x: Math.max(0, left(c, 1, now)), o: Math.max(0, left(c, 2, now)) });

  window.CaroLocalClock = { create, run, press, left, pause, snapshot };
})();
