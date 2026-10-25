/*
 * Thẻ kết quả ván với máy: dòng "Phân tích nhanh" – độ chính xác và số nước sai của người chơi, bấm là mở bảng phân tích
 * (như nút Phân tích). Dùng các thế đã được phân tích ngầm lúc chơi (live-analysis.js) nên thường xong ngay khi ván kết
 * thúc; thế còn thiếu được chấm trong một Web Worker riêng (ai-worker.js, type 'analyze') – không làm khựng trang.
 * Chỉ ván với máy (người chơi là một bên), ván ≥ 6 nước, khi phân tích ngầm đang bật. Phát / nghe: caro:gameover.
 */
(function () {
  'use strict';
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  const MIN_MOVES = 6; // như nút Phân tích trên thẻ kết quả (app-status.js)
  const BAD = ['blunder', 'mistake', 'miss', 'inacc'];
  let seq = 0;

  function clear() { seq++; const el = $('banner-an'); if (el) { el.hidden = true; el.textContent = ''; } }

  function analyze(rec) {
    const L = window.CaroLive;
    if (!window.Worker || location.protocol === 'file:' || !L || !L.on) return Promise.resolve(null);
    const evals = L.evalsFor(rec.moves, rec.rule) || undefined;
    return new Promise((res) => {
      let w;
      try { w = new Worker('ai-worker.js'); } catch (e) { return res(null); }
      const done = (v) => { try { w.terminate(); } catch (e) { /* đã dừng */ } res(v); };
      const timer = setTimeout(() => done(null), 20000);
      w.onmessage = (e) => {
        if (e.data.progress != null) return;
        clearTimeout(timer);
        done(e.data.error ? null : e.data.result);
      };
      w.onerror = () => { clearTimeout(timer); done(null); };
      // ms = mức của phân tích ngầm: thế đã chấm ngầm được dùng lại, chỉ chấm thế còn thiếu
      w.postMessage({ id: 'bn', type: 'analyze', moves: rec.moves, rule: rec.rule, ms: L.MS, evals });
    });
  }

  function text(res, me) {
    const c = res.counts[me] || {};
    const parts = BAD.filter((k) => c[k]).map((k) => `${c[k]} ${T('cls_' + k).toLowerCase()}`);
    const acc = T('an_quick_acc', { a: res.acc[me] });
    return T('an_quick', { s: acc + ' · ' + (parts.length ? parts.join(', ') : T('an_quick_clean')) });
  }

  window.addEventListener('caro:gameover', (e) => {
    clear();
    const d = e.detail || {};
    const rec = d.record;
    if (d.mode !== 'ai' || !rec || !rec.me || rec.moves.length < MIN_MOVES) return;
    const id = seq;
    analyze(rec).then((res) => {
      const el = $('banner-an');
      if (!res || id !== seq || !el) return;
      el.textContent = text(res, rec.me);
      el.hidden = false;
    });
  });
  // Ván mới / vào ván khác: dòng của ván cũ không còn đúng
  for (const ev of ['caro:newgame', 'caro:online']) window.addEventListener(ev, clear);
  document.addEventListener('click', (e) => {
    if (e.target.closest('#banner-an')) $('banner-analyze').click();
  });
})();
