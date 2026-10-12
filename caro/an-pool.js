/*
 * Phân tích ván song song trên nhiều Web Worker (như Lichess chạy Stockfish nhiều luồng): các thế cờ của ván được chia
 * cho min(4, số lõi − 1) Worker, mỗi Worker giữ bảng nhớ engine riêng suốt lượt. Xong phần chấm thế, chấm tiếp
 * "thế sau nước tốt nhất" cho các nước có thể bị đánh dấu (analysis.js altNeeded) – cũng song song.
 * Kết quả trả về là mảng evals đầy đủ để analysis.js analyzeGame chỉ còn xếp loại (rất nhanh, chạy luôn trên trang).
 * Chỉ dùng khi xem lại / phân tích ván (không có ván đang chơi) nên không tranh CPU với máy đang nghĩ nước.
 * study.js gọi evaluate() / cancel(); không có Web Worker (mở file trực tiếp) thì trả null để study.js tự tính.
 */
(function () {
  'use strict';
  const A = window.CaroAnalysis;
  const C = window.Caro;
  let workers = [];
  let job = 0; // tăng mỗi lần huỷ: kết quả của lượt cũ bị bỏ
  const pending = new Set();

  const size = () => Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const reusable = (e, ms) => !!e && typeof e.score === 'number' && (e.q || 0) >= ms;

  function ensure() {
    if (!window.Worker || location.protocol === 'file:') return false;
    try { while (workers.length < size()) workers.push(new Worker('ai-worker.js')); } catch (e) { return false; }
    return true;
  }

  /** Huỷ mọi việc đang chạy: dừng các Worker (lần sau tạo mới), các lần chờ nhận null. */
  function cancel() {
    job++;
    workers.forEach((w) => w.terminate());
    workers = [];
    for (const res of pending) res(null);
    pending.clear();
  }

  /** Chạy danh sách thế cờ trên các Worker (lấy việc kế tiếp khi xong việc trước). → Map key → eval gọn, hoặc null. */
  function runTasks(tasks, rule, ms, onDone) {
    const my = job;
    const out = new Map();
    return new Promise((res) => {
      if (!tasks.length) return res(out);
      pending.add(res);
      let next = 0, active = workers.length;
      const finish = () => { pending.delete(res); res(out); };
      workers.forEach((w, k) => {
        const gid = `pool${my}_${k}`; // bảng nhớ engine riêng của Worker này trong lượt này
        const take = () => {
          if (my !== job) return;
          if (next >= tasks.length) { if (--active === 0) finish(); return; }
          const t = tasks[next++];
          const id = `${gid}_${next}`;
          w.onmessage = (e) => {
            if (e.data.id !== id || my !== job) return;
            out.set(t.key, e.data.ev);
            if (onDone) onDone();
            take();
          };
          w.postMessage({ type: 'eval', id, gid, rule, ms, moves: t.moves });
        };
        take();
      });
    });
  }

  /**
   * Chấm mọi thế của ván (và thế sau nước tốt nhất khi cần) với ms mỗi thế; dùng lại thế đã chấm đủ kỹ trong evals.
   * → mảng evals cho analyzeGame, hoặc null (không có Worker / đã huỷ).
   */
  async function evaluate({ moves, rule, ms, evals, onProgress }) {
    if (!ensure()) return null;
    const my = job;
    const n = moves.length;
    const ev = Array.from({ length: n + 1 }, (_, i) => (evals && evals[i]) || null);
    // Ván kết thúc bằng nước thắng: thế sau đó không cần chấm
    let last = n;
    const b = new C.Board(rule);
    for (let i = 0; i < n; i++) {
      const [x, y] = moves[i], p = i % 2 ? C.O : C.X;
      b.play(x, y, p);
      if (C.checkWin(b, x, y, p)) { last = i; break; }
    }
    const tasks = [];
    for (let i = 0; i <= last; i++) if (!reusable(ev[i], ms)) tasks.push({ key: i, moves: moves.slice(0, i) });
    let done = 0, total = tasks.length + 1;
    const tick = () => { done++; if (onProgress) onProgress(Math.min(0.99, done / total)); };
    const r1 = await runTasks(tasks, rule, ms, tick);
    if (!r1 || my !== job) return null;
    for (const [i, e] of r1) ev[i] = e;
    // Thế sau nước tốt nhất cho các nước có thể bị đánh dấu (giữ alt cũ nếu đủ kỹ)
    const alts = [];
    for (let i = 0; i < Math.min(last + 1, n); i++) {
      if (A.altNeeded(moves, ev, i) && !reusable(ev[i].alt, ms)) alts.push({ key: i, moves: moves.slice(0, i).concat([ev[i].move]) });
    }
    total = tasks.length + alts.length;
    const r2 = await runTasks(alts, rule, ms, tick);
    if (!r2 || my !== job) return null;
    for (const [i, e] of r2) ev[i] = { ...ev[i], alt: e };
    return ev;
  }

  window.CaroAnPool = { evaluate, cancel, get size() { return size(); } };
})();
