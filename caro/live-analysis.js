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
  // Bằng thời gian mỗi thế của phân tích kỹ cho ván ngắn (analysis.js fullMs) → dùng lại được cho mọi ván
  const MS = window.CaroAnalysis ? window.CaroAnalysis.fullMs(0) : 400;
  let on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* riêng tư */ }

  let worker = null, failed = false, seq = 0, gidSeq = 0;
  const g = { gid: 0, rule: null, moves: [], evals: [], busy: false, over: false };
  let inflight = null; // { id, gid, i, key, alt: đang chấm thế sau nước tốt nhất của nước i }
  let pumpTimer = 0;

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

  /** Khoá của thế sau i nước đầu (để biết kết quả trả về còn đúng thế đang có không). */
  const keyOf = (moves, i) => moves.slice(0, i).join(';');

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
      // Ván khác (hoặc đổi luật): làm lại từ đầu
      g.gid = ++gidSeq; g.rule = rule; g.evals = [];
    } else if (c < g.moves.length) g.evals.length = c + 1; // đi lại / rẽ nhánh: bỏ các thế sau chỗ khác nhau
    g.moves = moves;
    g.busy = !!opts.busy;
    // Vừa hết ván: tạo sẵn Worker của phân tích song song (an-pool.js) – bấm Phân tích là chấm ngay phần còn thiếu
    if (opts.over && !g.over && window.CaroAnPool) window.CaroAnPool.warm();
    g.over = !!opts.over;
    if (g.busy && inflight) stop(); // máy bắt đầu nghĩ: dừng thế đang chấm dở để máy có trọn CPU
    // Hoãn một nhịp: app.js báo "máy đang nghĩ" ngay sau nước của người chơi – khỏi bắt đầu chấm rồi lại phải dừng
    clearTimeout(pumpTimer);
    pumpTimer = setTimeout(pump, 60);
  }

  /** Dừng Worker đang chấm (không huỷ được giữa chừng): lần chấm sau tạo Worker mới. */
  function stop() {
    if (worker) worker.terminate();
    worker = null;
    inflight = null;
  }

  /** Chấm thế kế tiếp còn thiếu (từng thế một, theo thứ tự trong ván). */
  function pump() {
    if (!on || inflight || g.busy || document.hidden) return;
    const n = g.moves.length;
    const last = g.over ? n - 1 : n; // thế sau nước thắng không cần chấm
    if (n === 0) return;
    let i = 0, alt = false;
    while (i <= last && g.evals[i]) i++;
    if (i > last) {
      // Đã chấm đủ các thế: chấm thêm thế sau nước tốt nhất cho các nước bị đánh dấu (để hết ván xếp loại ngay)
      const A = window.CaroAnalysis;
      i = 0;
      while (i < n && !(A && A.altNeeded(g.moves, g.evals, i) && !g.evals[i].alt)) i++;
      if (i >= n) return;
      alt = true;
    }
    const w = getWorker();
    if (!w) return;
    const pos = alt ? g.moves.slice(0, i).concat([g.evals[i].move]) : g.moves.slice(0, i);
    inflight = { id: 'lv' + ++seq, gid: g.gid, i, alt, key: keyOf(g.moves, i) };
    w.postMessage({ type: 'eval', id: inflight.id, rule: g.rule, ms: MS, moves: pos });
  }

  function onResult(e) {
    const d = e.data;
    if (!inflight || d.id !== inflight.id) return;
    const { gid, i, key, alt } = inflight;
    inflight = null;
    // Ván vẫn còn đúng thế đó thì lưu (đi lại rồi rẽ nhánh khác trong lúc chấm: các nước đầu đã khác – bỏ)
    if (gid === g.gid && i <= g.moves.length && key === keyOf(g.moves, i) && d.ev) {
      if (!alt) g.evals[i] = { ...d.ev, k: key }; // k: khoá của đúng thế đã chấm (evalsFor kiểm lại)
      else if (g.evals[i] && g.evals[i].k === key) g.evals[i] = { ...g.evals[i], alt: d.ev };
    }
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
    // Chỉ lấy thế có khoá khớp đúng thế của ván này (an toàn tuyệt đối dù đi lại / rẽ nhánh bao nhiêu lần)
    for (let i = 0; i <= c; i++) if (g.evals[i] && g.evals[i].k === keyOf(moves, i)) out[i] = g.evals[i];
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

  /** Kiểm thử: mọi thế đã chấm có khoá khớp với ván hiện tại không. */
  const consistent = () => g.evals.every((e, i) => !e || e.k === keyOf(g.moves, i));

  window.CaroLive = { consistent, sync, evalsFor, setOn, MS, get on() { return on; }, get done() { return g.evals.filter(Boolean).length; }, get alts() { return g.evals.filter((e) => e && e.alt).length; } };
})();
