/*
 * Đồng bộ tiến độ với tài khoản (A5): Giải đố (caro.puzzles – puzzles.js), Puzzle Storm (caro.storm – storm.js), chuỗi
 * ngày chơi + huy hiệu (caro.habits – habits.js). Vẫn lưu trên máy như cũ (khách, mất mạng: chỉ trên máy).
 *  – Đăng nhập (tin welcome có tài khoản): gửi bản trên máy; máy chủ gộp với bản đã lưu (progress-merge.js – không bao giờ
 *    mất tiến độ: số lớn nhất, hợp các tập) và trả lại; máy gộp lần nữa, ghi vào localStorage rồi báo 'caro:progress' để các
 *    module đọc lại.
 *  – Đổi tiến độ trên máy (các module gọi CaroProgressSync.dirty()): gửi lên sau vài giây (gom nhiều lần đổi).
 * window.CaroProgressSync = { dirty, canSync, local, apply }.
 */
(function () {
  'use strict';
  const P = window.CaroProgress;
  const N = window.CaroOnline;
  const KEYS = { pz: 'caro.puzzles', storm: 'caro.storm', habits: 'caro.habits' };
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };

  function local() {
    const out = {};
    for (const [f, k] of Object.entries(KEYS)) out[f] = read(k) || {};
    return out;
  }
  /** Gộp bản từ máy chủ vào máy; chỉ ghi phần đổi, báo các module đọc lại. */
  function apply(data) {
    const cur = local();
    const m = P.merge(cur, data);
    let changed = false;
    for (const [f, k] of Object.entries(KEYS)) {
      // Giữ các trường chỉ máy này dùng (không đồng bộ) – ghi đè phần đồng bộ lên trên
      const next = { ...(cur[f] || {}), ...m[f] };
      if (JSON.stringify(next) === JSON.stringify(cur[f])) continue;
      try { localStorage.setItem(k, JSON.stringify(next)); changed = true; } catch (e) { /* riêng tư */ }
    }
    if (changed) window.dispatchEvent(new Event('caro:progress'));
    return m;
  }

  const canSync = () => !!(N && N.connected && N.state.me && !N.state.me.guest);
  // Máy chủ nhận tối đa 1 lần / 2 giây: gửi sớm quá thì hẹn lại
  let timer = 0, lastPush = 0;
  function push() {
    if (!canSync()) return;
    const wait = lastPush + 2500 - Date.now();
    if (wait > 0) { clearTimeout(timer); timer = setTimeout(push, wait); return; }
    lastPush = Date.now();
    N.send({ t: 'progressSync', data: local() });
  }
  function dirty() {
    if (!canSync()) return;
    clearTimeout(timer);
    timer = setTimeout(push, 4000);
  }

  if (N) {
    N.on('welcome', () => { if (canSync()) { clearTimeout(timer); timer = setTimeout(push, 300); } });
    N.on('progress', (m) => { if (m.data) apply(m.data); });
  }
  window.CaroProgressSync = { dirty, canSync, local, apply };
})();
