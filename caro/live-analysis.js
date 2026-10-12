/*
 * Phân tích ngầm trong lúc chơi: mỗi khi có nước mới, engine chấm thế cờ đó trong một Web Worker riêng
 * (không tranh với máy đang nghĩ nước, không làm khựng bàn cờ). Hết ván, bấm Phân tích là có kết quả gần như ngay,
 * vì study.js chỉ còn phải chấm các thế còn thiếu.
 *   - Chạy hoàn toàn trên máy người chơi: máy chủ / VPS không phải làm gì thêm.
 *   - Tạm dừng khi máy đang nghĩ nước (CaroApp báo busy), khi ứng dụng chạy nền, hoặc khi người chơi tắt trong Cài đặt.
 *   - Đi lại / ván mới: giữ các thế chung ở đầu ván, bỏ phần đã khác.
 * app.js gọi sync() mỗi khi giao diện đổi; study.js gọi evalsFor() để lấy các thế đã chấm.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'caro.liveAn';
  const MS = 200; // bằng thời gian mỗi thế của phân tích đầy đủ cho ván ngắn → dùng lại được cho mọi ván
  let on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* riêng tư */ }

  let worker = null, failed = false, seq = 0, gidSeq = 0;
  const g = { gid: 0, rule: null, moves: [], evals: [], busy: false, over: false };
  let inflight = null; // { id, gid, i }

  function getWorker() {
    if (worker || failed) return worker;
    try {
      if (!window.Worker || !location.protocol.startsWith('http')) throw new Error('no worker');
      worker = new Worker('ai-worker.js');
      worker.onmessage = onResult;
      worker.onerror = () => { failed = true; worker = null; inflight = null; };
    } catch (e) { failed = true; worker = null; }
    return worker;
  }

  /** Số nước đầu giống nhau của hai ván. */
  function common(a, b) {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i][0] === b[i][0] && a[i][1] === b[i][1]) i++;
    return i;
  }

  /**
   * Cập nhật ván đang chơi. board: Board của app.js; opts: { busy: máy đang nghĩ, over: ván đã kết thúc }.
   * Gọi với board = null khi đang xem lại / giải đố (không phải ván đang chơi) – giữ nguyên dữ liệu ván cuối.
   */
  function sync(board, opts) {
    if (!board) return;
    opts = opts || {};
    const moves = board.moves.map((m) => [m.x, m.y]);
    const rule = board.rule || 'vn';
    const c = rule === g.rule ? common(g.moves, moves) : -1;
    if (c <= 0 && (g.moves.length || rule !== g.rule)) {
      // Ván khác (hoặc đổi luật): làm lại từ đầu, bảng nhớ engine cũng mới
      g.gid = ++gidSeq; g.rule = rule; g.evals = [];
    } else if (c < g.moves.length) g.evals.length = c + 1; // đi lại / rẽ nhánh: bỏ các thế sau chỗ khác nhau
    g.moves = moves;
    g.busy = !!opts.busy;
    g.over = !!opts.over;
    pump();
  }

  /** Chấm thế kế tiếp còn thiếu (từng thế một, theo thứ tự trong ván). */
  function pump() {
    if (!on || inflight || g.busy || document.hidden) return;
    const n = g.moves.length;
    const last = g.over ? n - 1 : n; // thế sau nước thắng không cần chấm
    let i = 0;
    while (i <= last && g.evals[i]) i++;
    if (i > last || n === 0) return;
    const w = getWorker();
    if (!w) return;
    inflight = { id: 'lv' + ++seq, gid: g.gid, i };
    w.postMessage({ type: 'eval', id: inflight.id, gid: g.gid, rule: g.rule, ms: MS, moves: g.moves.slice(0, i) });
  }

  function onResult(e) {
    const d = e.data;
    if (!inflight || d.id !== inflight.id) return;
    const { gid, i } = inflight;
    inflight = null;
    // Ván vẫn còn thế đó (chưa bị đi lại qua) thì lưu
    if (gid === g.gid && i <= g.moves.length && d.ev) g.evals[i] = d.ev;
    setTimeout(pump, 0);
  }

  /**
   * Các thế đã chấm cho ván moves ([[x, y], …]) theo luật rule – mảng dài moves.length + 1, chỗ chưa chấm để trống;
   * null nếu ván này không phải ván vừa chơi.
   */
  function evalsFor(moves, rule) {
    if ((rule || 'vn') !== g.rule || !g.evals.length) return null;
    const c = common(g.moves, moves);
    if (c === 0 && moves.length) return null;
    const out = new Array(moves.length + 1).fill(null);
    for (let i = 0; i <= c; i++) if (g.evals[i]) out[i] = g.evals[i];
    return out;
  }

  /** Bật / tắt (Cài đặt › Cài đặt bàn cờ). */
  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* riêng tư */ }
    if (on) pump();
  }

  document.addEventListener('visibilitychange', pump);
  const box = () => { const f = $('settings-form'); return f && f.elements.liveAn; };
  window.addEventListener('caro:page', (e) => { if (e.detail.id === 'settings' && box()) box().checked = on; });
  const el = box();
  if (el) {
    el.checked = on;
    el.addEventListener('change', () => setOn(el.checked));
  }

  window.CaroLive = { sync, evalsFor, setOn, MS, get on() { return on; }, get done() { return g.evals.filter(Boolean).length; } };
})();
