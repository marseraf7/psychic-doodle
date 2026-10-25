/*
 * Học cờ: phân tích ván (trong chế độ xem lại), "Thử lại" nước sai. Bàn cờ được mượn từ app.js qua CaroApp.enterExt
 * (chế độ "ext"); phần tính toán nằm ở analysis.js. Luyện tập trên một thế cờ: study-trainer.js; Giải đố: puzzles.js
 * (nạp trước file này). window.CaroStudy giữ nguyên các hàm cũ.
 */
(function () {
  'use strict';
  const App = window.CaroApp;
  const A = window.CaroAnalysis;
  const C = window.Caro;
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  const glyph = (p) => (p === C.X ? '<b class="dot x">X</b>' : '<b class="dot o">O</b>');
  const ico = (id) => `<svg class="ico i-in" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  // Loại nước: màu + ký hiệu trên huy hiệu (giống chess.com: !! xuất sắc, ? sai lầm, ?? nước hỏng…)
  const CLS = {
    great: { color: '#1baca6', text: '!!' },
    only: { color: '#3b82c4', text: '□' }, // ký hiệu "nước duy nhất" trong sách cờ
    best: { color: '#5c9e31', text: '!' },
    good: { color: '#8aa572', text: '' },
    miss: { color: '#e5664f', text: '×' },
    inacc: { color: '#56b4e9', text: '?!' },
    mistake: { color: '#e9a01d', text: '?' },
    blunder: { color: '#ca3431', text: '??' },
    lost: { color: '#8b8b8b', text: '' },
  };
  const ORDER = ['great', 'only', 'best', 'miss', 'inacc', 'mistake', 'blunder'];
  const GOOD = '#5c9e31';

  // ================================================================ Phân tích ván
  let worker = null;
  function getWorker() {
    if (worker || location.protocol === 'file:' || !window.Worker) return worker;
    try { worker = new Worker('ai-worker.js'); } catch (e) { worker = null; }
    return worker;
  }
  const cache = new Map(); // khoá: chuỗi nước đi -> kết quả
  const an = { result: null, running: false, seq: 0, refining: null, job: 0, key: null, prog: 0, pv: null }; // pv: dòng máy gợi ý đang hiện

  /**
   * opts: { evals: thế đã chấm sẵn, ms: thời gian mỗi thế }. Có Worker (an-pool.js – 1 tới 4 Worker, nhớ các thế đã chấm
   * cho mọi ván): chấm song song rồi xếp loại ngay trên trang; không được thì một Worker chạy cả analyzeGame (cách cũ).
   */
  async function runAnalysis(moves, rule, onProgress, opts) {
    opts = opts || {};
    // Lượt kỹ do Rapfi chấm (luật Việt Nam: Rapfi-CARO) (rapfi-analysis.js); Rapfi lỗi thì engine của game
    if (opts.rapfi && window.CaroRapfiAn) {
      const job = an.job;
      const evals = await window.CaroRapfiAn.evaluate({ moves, rule, ms: opts.ms, evals: opts.evals, onProgress });
      if (job !== an.job) return null;
      if (evals) return { ...A.analyzeGame(moves, { rule, ms: opts.ms, evals }), engine: 'rapfi' };
      an.rapfi = false;
      return runAnalysis(moves, rule, onProgress, { evals: opts.evals, ms: fullMs(moves.length) });
    }
    const Pool = window.CaroAnPool;
    if (Pool && opts.ms) {
      const job = an.job;
      const evals = await Pool.evaluate({ moves, rule, ms: opts.ms, evals: opts.evals, onProgress });
      if (job !== an.job) return null; // đã huỷ
      if (evals) return A.analyzeGame(moves, { rule, ms: opts.ms, evals });
    }
    return runSingle(moves, rule, onProgress, opts);
  }
  function runSingle(moves, rule, onProgress, opts) {
    const w = getWorker();
    if (!w) {
      // Không có Web Worker: tính trên luồng chính (sau 1 khung hình để kịp vẽ thanh tiến trình).
      // C3: engine từ chối thế quá rộng thì coi như không phân tích được (null, như khi huỷ) — đừng để lỗi văng ra làm treo lần chờ.
      return new Promise((res) => setTimeout(() => {
        try { res(A.analyzeGame(moves, { rule, ms: opts.ms, evals: opts.evals })); } catch (err) { res(null); }
      }, 30));
    }
    const id = 'an' + ++an.seq;
    return new Promise((res) => {
      pending.add(res); // cancel() trả null cho mọi lần đang chờ
      const onMsg = (e) => {
        if (e.data.id !== id) return;
        if (e.data.progress != null) return onProgress(e.data.progress);
        w.removeEventListener('message', onMsg);
        pending.delete(res);
        res(e.data.error ? null : e.data.result); // C3: Worker báo lỗi → null như khi huỷ, không treo
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ id, type: 'analyze', moves, rule, ms: opts.ms, evals: opts.evals });
    });
  }

  // Phân tích hai lượt (như Lichess): lượt nhanh hiện kết quả sau ~1–2 giây, lượt kỹ tinh chỉnh ngay sau đó.
  // Các thế đã được phân tích ngầm lúc chơi (live-analysis.js) đủ kỹ nên cả hai lượt đều dùng lại, không chấm lại.
  const QUICK_MIN = 8; // còn ít thế chưa chấm hơn thế này thì làm luôn lượt kỹ
  const quickMs = (n) => Math.max(15, Math.min(40, Math.round(2000 / (n + 1))));
  const fullMs = (n) => A.fullMs(n); // analysis.js: cả ván ~20 giây một luồng
  const rapfiMs = (n) => Math.max(150, Math.min(500, Math.round(16000 / (n + 1)))); // Rapfi WASM cần ≥ ~100 ms / thế

  const pending = new Set();
  /** Huỷ phân tích đang chạy (mở ván khác): dừng Worker (không dừng giữa chừng được), các lần chờ nhận null. */
  function cancel() {
    if (!an.running) return;
    an.job++;
    an.running = false;
    an.key = null;
    if (worker) { worker.terminate(); worker = null; }
    if (window.CaroAnPool) window.CaroAnPool.cancel();
    if (window.CaroRapfiAn) window.CaroRapfiAn.cancel();
    for (const res of pending) res(null);
    pending.clear();
  }

  /** Bàn cờ vừa đổi kích thước (mở / đóng bảng): đợi bố cục xong rồi vừa khung lại. */
  function relayout() {
    requestAnimationFrame(() => requestAnimationFrame(() => { App.resize(); App.fitReplayView(); }));
  }

  async function analyze() {
    const r = App.replay;
    if (!r) return;
    const moves = r.data.moves;
    const wasOpen = !$('an-panel').hidden;
    $('an-panel').hidden = false;
    document.body.classList.add('analysis');
    if (!wasOpen) relayout();
    // Toạ độ trên bàn (a, b, c… / 1, 2, 3…) theo phạm vi ván, để danh sách nước đi có tên ô
    const xs = moves.map((m) => m[0]), ys = moves.map((m) => m[1]);
    // Nới 2 ô mỗi phía: nước gợi ý có thể nằm ngoài vùng đã có quân
    App.setCoords(xs.length ? { minX: Math.min(...xs) - 2, maxX: Math.max(...xs) + 2, minY: Math.min(...ys) - 2, maxY: Math.max(...ys) + 2 } : null);
    const key = (r.data.rule || 'vn') + JSON.stringify(moves);
    if (an.running && an.key === key) {
      // Đang phân tích đúng ván này (vd. đóng rồi mở lại bảng): hiện lại trạng thái hiện có
      if (an.result) renderPanel(); else renderProgress(an.prog || 0);
      return;
    }
    cancel(); // đang phân tích ván khác: huỷ, khỏi phải chờ và khỏi hiện nhầm kết quả ván cũ
    if (cache.has(key)) { an.result = cache.get(key); an.refining = null; renderPanel(); return; }
    const job = ++an.job;
    const mine = () => job === an.job; // chưa bị huỷ
    an.running = true;
    an.key = key;
    an.result = null;
    an.refining = null;
    an.prog = 0;
    const same = () => mine() && App.replay && App.replay.data.moves === moves; // chưa đóng xem lại / mở ván khác
    const progress = (f) => { if (!mine()) return; an.prog = f; if (an.refining != null) renderRefine(f); else if (same()) renderProgress(f); };
    const n = moves.length;
    an.rapfi = !!(window.CaroRapfiAn && window.CaroRapfiAn.handles(r.data.rule || 'vn'));
    const ms = an.rapfi ? rapfiMs(n) : fullMs(n);
    const live = window.CaroLive ? window.CaroLive.evalsFor(moves, r.data.rule) : null;
    const missing = Array.from({ length: n + 1 }, (_, i) => !(live && live[i] && (live[i].q || 0) >= ms)).filter(Boolean).length;
    let evals = live || undefined;
    try {
      if (missing > QUICK_MIN || an.rapfi) { // Rapfi chấm lại mọi thế: luôn hiện trước kết quả nhanh của engine
        // Lượt nhanh
        renderProgress(0);
        const quick = await runAnalysis(moves, r.data.rule, progress, { evals, ms: quickMs(n) });
        if (!quick || !mine()) return;
        if (same()) { an.result = quick; an.refining = 0; renderPanel(); }
        evals = quick.evals;
      } else if (missing) renderProgress(0); // không thiếu thế nào: đã phân tích ngầm xong, chỉ còn xếp loại nước đi
      // Lượt kỹ: chỉ chấm lại các thế mới chấm nhanh / còn thiếu
      const res = await runAnalysis(moves, r.data.rule, progress, { evals, ms, rapfi: an.rapfi });
      if (!res || !mine()) return;
      cache.set(key, res);
      // Lịch sử đấu trên máy (local-save.js) lưu kèm kết quả: mở lại ván không phải phân tích lại
      window.dispatchEvent(new CustomEvent('caro:analyzed', { detail: { moves, rule: r.data.rule || 'vn', lg: r.data.lg || null, result: res } }));
      if (!same()) return;
      an.result = res;
      an.refining = null;
      renderPanel();
    } finally {
      if (mine()) { an.running = false; an.key = null; }
    }
  }

  /** Dòng "Đang tinh chỉnh…" trên bảng khi đang chạy lượt kỹ (kết quả nhanh đã hiện). */
  function renderRefine(f) {
    an.refining = f;
    const el = $('an-refine');
    if (el) el.textContent = T(an.rapfi ? 'an_refining_rapfi' : 'an_refining', { p: Math.round(f * 100) });
  }

  function renderProgress(f) {
    $('an-body').innerHTML = `<div class="an-prog"><i style="width:${Math.round(f * 100)}%"></i></div>
      <p class="muted">${esc(T('an_running', { p: Math.round(f * 100) }))}<br>${esc(T('an_engine'))}</p>`;
  }

  const nameOf = (p) => {
    const d = App.replay && App.replay.data;
    const n = d && (p === C.X ? d.x : d.o);
    return n || T('deleted_player');
  };

  const G = window.CaroAnGraph; // biểu đồ (kéo để tua) + khoảnh khắc quyết định (an-graph.js)
  const EX = window.CaroExplore; // đi thử / tìm nước tốt hơn / dòng máy gợi ý (an-explore.js)

  function renderPanel() {
    const res = an.result;
    if (!res || !App.replay) return;
    const chips = (p) => ORDER.filter((c) => res.counts[p][c])
      .map((c) => `<button type="button" class="an-chip" data-jump="${c}" data-p="${p}" style="--c:${CLS[c].color}" title="${esc(T('cls_' + c) + ' · ' + T('an_jump'))}"><i>${CLS[c].text || '•'}</i>${res.counts[p][c]}</button>`).join('');
    const player = (p) => `<div class="an-player">${glyph(p)}<span class="name">${esc(nameOf(p))}</span>
      <span class="an-chips">${chips(p)}</span><b class="an-acc" title="${esc(T('an_acc'))}">${res.acc[p]}%</b></div>`;
    // Danh sách nước đi 2 cột như Lichess: số thứ tự | X | O; ký hiệu !! ! ? ?? ngay sau tên ô
    let list = '';
    res.moves.forEach((m, k) => {
      if (k % 2 === 0) list += `<span class="an-no">${k / 2 + 1}.</span>`;
      const meta = CLS[m.cls];
      list += `<button type="button" class="an-mv" data-i="${k + 1}" title="${esc(T('an_move', { n: k + 1 }) + ' · ' + T('cls_' + m.cls))}">${esc(App.cellName(m.x, m.y))}${meta.text ? `<b style="color:${meta.color}">${meta.text}</b>` : ''}</button>`;
    });
    if (res.moves.length % 2) list += '<span class="an-mv empty"></span>';
    $('an-body').innerHTML = `<div class="an-players">${player(C.X)}${player(C.O)}</div>
      ${an.refining != null ? `<p class="an-refine muted" id="an-refine" role="status">${esc(T(an.rapfi ? 'an_refining_rapfi' : 'an_refining', { p: Math.round(an.refining * 100) }))}</p>` : ''}
      ${res.engine === 'rapfi' ? `<p class="an-eng muted">${esc(T('an_by_rapfi'))}</p>` : ''}
      ${G.moments(res, CLS, glyph)}
      <div class="an-gwrap" id="an-gwrap">${G.svg(res, App.replay.idx, CLS)}</div>
      <div class="an-moves" id="an-moves" role="list" aria-label="${esc(T('an_moves'))}">${list}</div>
      <div class="an-now" id="an-now"></div>`;
    renderNow();
  }

  /** Nhận xét cho nước vừa xem + đánh dấu trên bàn + nước đang xem trong danh sách / biểu đồ. */
  function renderNow() {
    const res = an.result;
    const r = App.replay;
    syncPlay();
    if (!res || !r || App.ext) return;
    const idx = r.idx;
    const list = $('an-moves');
    if (list) {
      list.querySelectorAll('.an-mv.cur').forEach((b) => b.classList.remove('cur'));
      const cur = list.querySelector(`.an-mv[data-i="${idx}"]`);
      if (cur) {
        cur.classList.add('cur');
        // Cuộn trong danh sách (không cuộn cả trang): dọc trên máy tính, ngang trên điện thoại
        const lr = list.getBoundingClientRect(), cr = cur.getBoundingClientRect();
        if (cr.top < lr.top || cr.bottom > lr.bottom) list.scrollTop += cr.top - lr.top - lr.height / 2 + cr.height / 2;
        if (cr.left < lr.left || cr.right > lr.right) list.scrollLeft += cr.left - lr.left - lr.width / 2 + cr.width / 2;
      } else if (idx === 0) { list.scrollTop = 0; list.scrollLeft = 0; }
    }
    const curLine = $('an-cur');
    if (curLine) { curLine.setAttribute('x1', idx); curLine.setAttribute('x2', idx); }
    const m = res.moves[idx - 1];
    const el = $('an-now');
    if (an.pv && an.pv.at !== idx) an.pv = null; // dòng máy chỉ hiện ở đúng thế đã tính
    const pvMarks = an.pv && an.pv.line ? an.pv.line.map(([x, y], k) => ({ x, y, kind: 'ghost', color: GOOD, p: (idx + k) % 2 ? C.O : C.X, text: String(k + 1) })) : [];
    const tapHint = EX ? `<p class="an-tap muted">${esc(T('an_tap_explore'))}</p>` : '';
    if (!m) {
      App.setMarks(pvMarks);
      if (el) el.innerHTML = `<span class="muted">${esc(T('an_start'))}</span>${pvHtml(idx)}${tapHint}`;
      return;
    }
    const meta = CLS[m.cls];
    const marks = [{ x: m.x, y: m.y, kind: 'badge', color: meta.color, text: meta.text || (m.cls === 'good' ? '' : '') }];
    if (m.best && !pvMarks.length) marks.push({ x: m.best[0], y: m.best[1], kind: 'ghost', color: GOOD, p: m.p });
    App.setMarks(marks.filter((k) => k.text || k.kind === 'ghost').concat(pvMarks));
    if (!el) return;
    // Xếp loại theo mức tụt khả năng thắng (engine) thì ghi rõ tụt bao nhiêu %
    let text = m.ev ? T('ex_' + (m.cls === 'inacc' ? 'inacc' : m.cls + '_ev'), { d: m.drop }) : T('ex_' + m.cls, { len: m.len });
    if (m.cls === 'miss' && m.len === 1) text = T('ex_miss1');
    if (m.best) text += ' ' + T('ex_bestmove').replace(/[.。]$/, '') + ` → ${App.cellName(m.best[0], m.best[1])}`;
    const canRetry = ['miss', 'mistake', 'blunder'].includes(m.cls) && !m.ev; // "Thử lại" cần chuỗi thắng / thua chắc
    // Nước chưa chính xác / sai lầm chấm theo khả năng thắng: "Tìm nước tốt hơn" – đi thử, nước đầu so với nước của máy
    const canBetter = !canRetry && EX && m.best && ['inacc', 'mistake', 'blunder', 'miss'].includes(m.cls);
    el.innerHTML = `<span class="an-badge" style="--c:${meta.color}">${meta.text || '•'}</span>
      <span><b>${esc(T('an_move', { n: idx }))} ${glyph(m.p)} ${esc(App.cellName(m.x, m.y))} · ${esc(T('cls_' + m.cls))}</b> — ${esc(text)}</span>
      ${canRetry ? `<button type="button" class="primary sm" data-retry="${idx - 1}">${ico('retry')} ${esc(T('an_retry'))}</button>` : ''}
      ${canBetter ? `<button type="button" class="primary sm" data-better="${idx - 1}">${ico('retry')} ${esc(T('an_better'))}</button>` : ''}
      ${EX && !an.pv ? `<button type="button" class="ghost sm" data-pv="${idx - 1}">${ico('bulb')} ${esc(T('an_pv'))}</button>` : ''}
      ${pvHtml(idx)}${tapHint}`;
  }

  /** Dòng máy gợi ý đang hiện ở thế idx: "Dòng máy: e5 → f6 → …" + Đi thử từ đây / Ẩn. */
  function pvHtml(idx) {
    const pv = an.pv;
    if (!pv || pv.at !== idx) return '';
    if (!pv.line) return `<p class="an-pv muted" role="status">${esc(T('an_pv_loading'))}</p>`;
    if (!pv.line.length) return `<p class="an-pv muted" role="status">${esc(T('an_pv_none'))}</p>`;
    const names = pv.line.map(([x, y], k) => `<b>${k + 1}</b> ${esc(App.cellName(x, y))}`).join(' → ');
    return `<p class="an-pv" role="status">${esc(T('an_pv_line'))} ${names}
      <button type="button" class="ghost sm" data-pvtry="${idx}">${esc(T('an_pv_try'))}</button>
      <button type="button" class="ghost sm" data-pvhide>${esc(T('an_pv_hide'))}</button></p>`;
  }

  /** Tính dòng máy gợi ý từ thế trước nước i (lùi bàn về thế đó để quân đánh số nằm đúng chỗ). */
  async function showPv(i) {
    const r = App.replay;
    if (!r || !EX) return;
    an.pv = { at: i, line: null };
    const pv = an.pv;
    if (r.idx !== i) App.seek(i); else renderNow();
    const line = await EX.line(r.data.moves.slice(0, i), r.data.rule, 4);
    if (an.pv !== pv) return; // đã tua đi chỗ khác / ẩn
    pv.line = line;
    renderNow();
  }

  /** Nút Chạy / Dừng trong bảng giống nút ở thanh dưới. */
  function syncPlay() {
    const src = document.querySelector('#rp-play-ico use');
    const dst = document.querySelector('#an-play-ico use');
    if (src && dst) dst.setAttribute('href', src.getAttribute('href'));
  }

  function closePanel() {
    const was = !$('an-panel').hidden;
    $('an-panel').hidden = true;
    document.body.classList.remove('analysis');
    App.setMarks(null);
    App.setCoords(null);
    if (was && App.replay) relayout();
  }

  $('an-close').onclick = closePanel;
  $('an-body').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return; // biểu đồ: kéo / bấm để tua do an-graph.js lo
    if (b.dataset.i) App.seek(+b.dataset.i);
    else if (b.dataset.retry != null) retry(+b.dataset.retry);
    else if (b.dataset.better != null) better(+b.dataset.better);
    else if (b.dataset.pv != null) showPv(+b.dataset.pv);
    else if (b.dataset.pvtry != null && App.replay) {
      const i = +b.dataset.pvtry;
      an.pv = null;
      EX.start({ base: App.replay.data.moves.slice(0, i), backTo: i, rule: App.replay.data.rule });
    } else if (b.hasAttribute('data-pvhide')) { an.pv = null; renderNow(); }
    else if (b.dataset.jump && an.result) {
      // Nước tiếp theo cùng loại của người chơi đó (hết thì quay lại nước đầu tiên)
      const p = +b.dataset.p, all = an.result.moves.filter((m) => m.p === p && m.cls === b.dataset.jump);
      const next = all.find((m) => m.i + 1 > App.replay.idx) || all[0];
      if (next) App.seek(next.i + 1);
    }
  });
  $('an-nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-nav]');
    const r = App.replay;
    if (!b || !r) return;
    const act = b.dataset.nav;
    if (act === 'first') App.seek(0);
    else if (act === 'prev') App.seek(r.idx - 1);
    else if (act === 'next') App.seek(r.idx + 1);
    else if (act === 'last') App.seek(r.data.moves.length);
    else if (act === 'play') { $('rp-play').click(); syncPlay(); }
    else if (act === 'share') $('rp-share').click();
    else if (act === 'close') $('rp-close').click();
  });
  $('rp-analyze').onclick = () => {
    if (!$('an-panel').hidden && (!an.running || an.result)) return closePanel(); // đang tinh chỉnh vẫn đóng được
    analyze();
  };
  window.addEventListener('caro:seek', renderNow);
  window.addEventListener('caro:replayclose', () => { closePanel(); an.result = null; });
  // Mở câu đố / bài học khi bảng phân tích đang mở: dừng phân tích, đóng bảng (dấu nước cũ không sót trên bàn mới).
  // "Thử lại" (retry) cũng vào chế độ luyện nhưng là của chính bảng phân tích: giữ nguyên.
  let retrying = false;
  window.addEventListener('caro:extenter', () => { if (retrying || (EX && EX.entering)) return; cancel(); closePanel(); an.result = null; });
  if (G) G.bind($('an-body'), () => an.result);

  /** "Tìm nước tốt hơn" cho nước i (chấm theo khả năng thắng): đi thử từ thế trước nước đó, nước đầu được chấm. */
  function better(i) {
    const res = an.result, r = App.replay;
    if (!res || !r || !EX) return;
    const m = res.moves[i];
    an.pv = null;
    EX.start({ base: r.data.moves.slice(0, i), backTo: i + 1, rule: r.data.rule, goal: 'better', p: m.p, best: m.best });
  }

  /** "Thử lại": đặt lại thế cờ trước nước i, cho người chơi tìm nước tốt hơn. */
  function retry(i) {
    const res = an.result;
    const r = App.replay;
    if (!res || !r) return;
    const m = res.moves[i];
    const moves = r.data.moves.slice(0, i);
    const backTo = r.idx;
    const goal = m.cls === 'miss' ? 'win' : 'save';
    retrying = true;
    try {
      Trainer.start({
        moves, p: m.p, goal, left: m.len || 0, sol: m.best, rule: r.data.rule,
        title: T('an_retry'),
        exitLabel: 'tr_back',
        onExit: () => { App.exitExt(); App.seek(backTo); relayout(); },
      });
    } finally { retrying = false; }
  }
  const Trainer = window.CaroTrainer; // luyện tập trên một thế cờ (study-trainer.js)
  const P = window.CaroPuzzles; // giải đố (puzzles.js)

  window.addEventListener('langchange', () => { if (an.result) renderPanel(); if (Trainer.active) Trainer.refresh(); });

  /** Kết quả phân tích đã lưu sẵn (Lịch sử đấu trên máy): analyze() hiện ngay, không chạy lại. */
  function prime(moves, rule, result) { if (result) cache.set((rule || 'vn') + JSON.stringify(moves), result); }

  window.CaroStudy = {
    analyze, prime, Trainer,
    openPuzzles: P.openPuzzles, startMode: P.startMode, loadPuzzles: P.loadPuzzles, pickNear: P.pickNear, dailyPuzzle: P.dailyPuzzle,
    get puzzles() { return P.puzzles; },
  };
})();
