/*
 * Phân tích ván song song trên nhiều Web Worker (như Lichess chạy Stockfish nhiều luồng): các thế cờ của ván được chia
 * cho min(4, số lõi − 1) Worker; mỗi thế chấm theo số nút với bảng nhớ mới (analysis.js evaluate) nên kết quả không phụ
 * thuộc số Worker hay thứ tự chấm – máy 2 lõi hay 8 lõi cũng ra cùng kết quả. Xong phần chấm thế, chấm tiếp
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

  // Điện thoại (màn cảm ứng / RAM ≤ 4 GB): tối đa 2 Worker – mỗi Worker là một bản engine riêng tốn RAM, Safari trên
  // iPhone đóng tab dùng quá nhiều RAM; máy nóng / tụt xung khi chạy đủ lõi
  const small = () => (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4) ||
    !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const size = () => Math.max(1, Math.min(small() ? 2 : 4, (navigator.hardwareConcurrency || 2) - 1));
  const IDLE_MS = 15000; // phân tích xong mà không có lượt mới trong ngần này: dừng các Worker, trả RAM
  let idleTimer = 0;
  const reusable = (e, ms) => !!e && typeof e.score === 'number' && (e.q || 0) >= ms;

  // Thế đã chấm, dùng chung cho mọi ván (các ván chung khai cuộc, mở lại ván, lượt kỹ sau lượt nhanh): mỗi thế chấm theo
  // số nút nên cùng thế → cùng kết quả, và dời cả thế cờ đi đâu cũng vậy (đã kiểm) – khoá theo thế dời về gốc toạ độ.
  const memo = new Map();
  const MEMO_MAX = 20000;
  function memoKey(rule, ms, moves) {
    if (!moves.length) return null;
    let x0 = Infinity, y0 = Infinity;
    for (const [x, y] of moves) { if (x < x0) x0 = x; if (y < y0) y0 = y; }
    return { k: `${rule}|${ms}|` + moves.map(([x, y]) => (x - x0) + ',' + (y - y0)).join(';'), x0, y0 };
  }
  /** Kết quả đã nhớ cho thế moves (đã dời về đúng toạ độ của ván), hoặc null. */
  function recall(rule, ms, moves) {
    const m = memoKey(rule, ms, moves);
    const e = m && memo.get(m.k);
    return e ? { ...e, move: e.move && [e.move[0] + m.x0, e.move[1] + m.y0] } : null;
  }
  function remember(rule, ms, moves, ev) {
    const m = memoKey(rule, ms, moves);
    if (!m || !ev || !ev.move) return;
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value); // bỏ thế nhớ lâu nhất
    memo.set(m.k, { move: [ev.move[0] - m.x0, ev.move[1] - m.y0], score: ev.score, mate: ev.mate, q: ev.q });
  }

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
        const take = () => {
          if (my !== job) return;
          if (next >= tasks.length) { if (--active === 0) finish(); return; }
          const t = tasks[next++];
          const id = `pool${my}_${k}_${next}`;
          w.onmessage = (e) => {
            if (e.data.id !== id || my !== job) return;
            out.set(t.key, e.data.ev);
            if (onDone) onDone();
            take();
          };
          w.postMessage({ type: 'eval', id, rule, ms, moves: t.moves });
        };
        take();
      });
    });
  }

  /**
   * Chấm mọi thế của ván (và thế sau nước tốt nhất khi cần) với ms mỗi thế; dùng lại thế đã chấm đủ kỹ trong evals.
   * → mảng evals cho analyzeGame, hoặc null (không có Worker / đã huỷ).
   */
  /** Rảnh (không lượt nào đang chạy) quá IDLE_MS thì dừng Worker – lượt nhanh → lượt kỹ cách nhau ít nên vẫn dùng lại. */
  function idleLater() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (pending.size || !workers.length) return;
      workers.forEach((w) => w.terminate()); // đang rảnh: không có thế nào đang chấm
      workers = [];
    }, IDLE_MS);
  }

  async function evaluate(opts) {
    clearTimeout(idleTimer);
    try { return await evaluateAll(opts); } finally { idleLater(); }
  }

  async function evaluateAll({ moves, rule, ms, evals, onProgress }) {
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
    for (let i = 0; i <= last; i++) {
      if (reusable(ev[i], ms)) continue;
      const mv = moves.slice(0, i), hit = recall(rule, ms, mv);
      if (hit) ev[i] = hit; else tasks.push({ key: i, moves: mv });
    }
    let done = 0, total = tasks.length + 1;
    const tick = () => { done++; if (onProgress) onProgress(Math.min(0.99, done / total)); };
    const r1 = await runTasks(tasks, rule, ms, tick);
    if (!r1 || my !== job) return null;
    for (const [i, e] of r1) { ev[i] = e; remember(rule, ms, moves.slice(0, i), e); }
    // Thế sau nước tốt nhất cho các nước có thể bị đánh dấu (giữ alt cũ nếu đủ kỹ)
    const alts = [];
    for (let i = 0; i < Math.min(last + 1, n); i++) {
      if (!A.altNeeded(moves, ev, i) || reusable(ev[i].alt, ms)) continue;
      const mv = moves.slice(0, i).concat([ev[i].move]), hit = recall(rule, ms, mv);
      if (hit) ev[i] = { ...ev[i], alt: hit }; else alts.push({ key: i, moves: mv });
    }
    total = tasks.length + alts.length;
    const r2 = await runTasks(alts, rule, ms, tick);
    if (!r2 || my !== job) return null;
    for (const [i, e] of r2) { ev[i] = { ...ev[i], alt: e }; remember(rule, ms, moves.slice(0, i).concat([ev[i].move]), e); }
    return ev;
  }

  /** Tạo sẵn các Worker (vd. vừa hết ván – live-analysis.js): bấm Phân tích khỏi chờ Worker nạp engine; rảnh thì tự dừng. */
  function warm() {
    if (pending.size || workers.length >= size()) return;
    if (ensure()) idleLater();
  }

  window.CaroAnPool = { evaluate, cancel, warm, get size() { return size(); }, get remembered() { return memo.size; } };
})();
