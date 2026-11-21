/*
 * Kết quả phân tích lưu trên máy cho Thống kê cá nhân (insights.js): mỗi lần phân tích xong một ván (study.js phát
 * 'caro:analyzed') thì lưu bản gọn (insights-core.js anSummary) theo mã nước đi – localStorage 'caro.ins.an', tối đa MAX ván.
 * Nút "Phân tích N ván gần nhất": chạy lần lượt từng ván chưa phân tích bằng bộ phân tích song song sẵn có (an-pool.js),
 * mức nhẹ (ít thời gian mỗi thế), nhường máy: chờ lúc rảnh giữa hai ván, tạm dừng khi đang có ván online; huỷ được.
 * API: window.CaroInsightsAn = { get(h), put(h, s), batch(games, onProgress) → Promise<số ván đã phân tích>, cancel(), running }
 */
(function () {
  'use strict';
  const IC = window.CaroInsightsCore;
  const KEY = 'caro.ins.an';
  const MAX = 400;
  const LIGHT = 0.4; // phân tích hàng loạt: 40% thời gian mỗi thế so với lượt kỹ (analysis.js fullMs)

  let mem = null;
  function load() {
    if (mem) return mem;
    try { mem = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { mem = {}; }
    if (typeof mem !== 'object' || Array.isArray(mem)) mem = {};
    return mem;
  }
  function save() {
    const m = load();
    const keys = Object.keys(m);
    if (keys.length > MAX) keys.sort((a, b) => (m[a].t || 0) - (m[b].t || 0)).slice(0, keys.length - MAX).forEach((k) => delete m[k]);
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* riêng tư / đầy bộ nhớ: chỉ giữ trong phiên */ }
  }
  const get = (h) => (load()[h] || null);
  function put(h, s) {
    if (!h || !s) return;
    load()[h] = { ...s, t: Date.now() };
    save();
  }

  // Phân tích xong ở bảng phân tích (study.js): lưu bản gọn
  window.addEventListener('caro:analyzed', (e) => {
    const d = e.detail || {};
    if (Array.isArray(d.moves) && d.result) put(IC.hash(d.moves), IC.anSummary(d.result));
  });

  let job = 0;
  const state = { running: false, inPool: false }; // inPool: lượt hàng loạt đang chấm trên bể Worker (an-pool.js)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const idle = () => new Promise((r) => (window.requestIdleCallback ? window.requestIdleCallback(() => r(), { timeout: 1500 }) : setTimeout(r, 200)));
  // Đang có ván online chưa xong: nhường CPU cho đồng hồ / bàn cờ
  const busy = () => { const N = window.CaroOnline; const r = N && N.state && N.state.room; return !!(r && !r.winner && r.moves && r.moves.length); };

  /** Phân tích lần lượt các ván chưa có kết quả. games: [{ moves, rule }]. onProgress(đã xong, tổng, tiến độ ván đang chạy). */
  async function batch(games, onProgress) {
    const A = window.CaroAnalysis, Pool = window.CaroAnPool;
    const todo = (games || []).filter((g) => Array.isArray(g.moves) && g.moves.length >= 6 && !get(IC.hash(g.moves)));
    const my = ++job;
    state.running = true;
    let done = 0;
    try {
      for (const g of todo) {
        await idle();
        while (busy() && my === job) await sleep(2000);
        if (my !== job) break;
        const ms = Math.max(30, Math.round(A.fullMs(g.moves.length) * LIGHT));
        const prog = (f) => { if (onProgress && my === job) onProgress(done, todo.length, f); };
        prog(0);
        let res = null;
        if (Pool) {
          state.inPool = true;
          let evals;
          try { evals = await Pool.evaluate({ moves: g.moves, rule: g.rule || 'vn', ms, onProgress: prog }); } finally { state.inPool = false; }
          if (my !== job || !evals) break; // bị huỷ (hoặc bảng phân tích vừa giành bộ phân tích)
          res = A.analyzeGame(g.moves, { rule: g.rule || 'vn', ms, evals });
        } else {
          try { res = A.analyzeGame(g.moves, { rule: g.rule || 'vn', ms: 20 }); } catch (e) { res = null; }
        }
        if (res) put(IC.hash(g.moves), IC.anSummary(res));
        done++;
        if (onProgress && my === job) onProgress(done, todo.length, 1);
      }
    } finally {
      if (my === job) state.running = false;
    }
    return done;
  }

  function cancel() {
    if (!state.running) return;
    job++;
    state.running = false;
    // Chỉ dừng bể Worker khi chính lượt hàng loạt đang chấm: đang chờ lúc rảnh / chờ ván online xong thì bể có thể đang
    // chạy cho bảng phân tích (study.js) – huỷ nhầm sẽ làm hỏng lượt phân tích đó
    if (state.inPool && window.CaroAnPool) window.CaroAnPool.cancel();
  }

  window.CaroInsightsAn = { get, put, batch, cancel, get running() { return state.running; } };
})();
