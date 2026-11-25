/*
 * Xuất video ngắn 9:16 (1080×1920, 30 khung/giây, không tiếng) ngay trong app để đăng TikTok / YouTube Shorts / Facebook
 * Reels – hai loại: "Câu đố" (một bài trong puzzles.json: thế cờ → đếm ngược 3 giây → lật đáp án và chuỗi thắng) và
 * "Ván đấu" (ván đang xem lại: tua tự động ≤ 40 giây → 5 quân thắng). Cuối video: thẻ kết có tên game + tên miền.
 * Dựng: canvas ẩn ngoài màn hình + canvas.captureStream(30) + MediaRecorder (MP4 H.264 nếu trình duyệt ghi được, không thì
 * WebM). MediaRecorder ghi theo thời gian thật nên video 40 giây mất ~40 giây: hộp thoại hiện tiến độ, nút Huỷ; khung hình
 * vẽ theo đồng hồ thật (setTimeout, không dựa vào requestAnimationFrame); tab bị ẩn thì nhắc giữ màn hình mở.
 * window.CaroVideo = { openPuzzle(q?), openGame(game) }. Không có trong bản cổng game (html.portal).
 * Lịch cảnh, định dạng, tên file: video-core.js; vẽ: video-draw.js; chuỗi: i18n-video.js.
 */
(function () {
  'use strict';
  const V = window.CaroVideoCore;
  const C = window.Caro;
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  const dlg = $('video-dlg');
  // Chỉ dùng trong bài thử (caro/tests/e2e/video.e2e.js): { speed: rút ngắn thời lượng, mime: ép định dạng }
  const testOpt = () => window.__caroVideoTest || {};
  const isPortal = () => document.documentElement.classList.contains('portal');

  let st = null; // { kind, src, names, spec, renderer, rec, timer, canceled, hidden, blob, url, file, name }
  let work = null; // canvas 1080×1920 ẩn ngoài màn hình (dựng + ghi hình)

  function workCanvas() {
    if (work) return work;
    work = document.createElement('canvas');
    work.width = V.W; work.height = V.H;
    work.setAttribute('aria-hidden', 'true');
    work.className = 'vid-work';
    document.body.appendChild(work);
    return work;
  }

  // ------------------------------------------------------------ Dữ liệu từng cảnh
  function resultOf(game, names) {
    const n = game.moves.length;
    let winner = game.winner;
    if (!winner && n) { // ván chưa ghi người thắng: xem nước cuối có làm 5 quân không
      const b = new C.Board(game.rule);
      game.moves.forEach((m, i) => { try { b.play(m[0], m[1], i % 2 ? C.O : C.X); } catch (e) { /* nước hỏng */ } });
      const last = b.moves[b.moves.length - 1];
      if (last && C.checkWin(b, last.x, last.y, last.p)) winner = last.p;
    }
    if (winner === 3 || (!winner && game.reason === 'draw')) return T('draw_short');
    if (!winner) return '';
    const who = winner === C.X ? 'x' : 'o';
    let r = T('replay_wins', { name: names ? names[who] : who.toUpperCase() });
    if (game.reason && !['win', 'draw'].includes(game.reason)) r += ' · ' + T('end_' + game.reason);
    return r;
  }

  function buildSpec() {
    const speed = +testOpt().speed || 1;
    const host = V.siteHost(location, window.CARO_SERVER);
    const text = { app: T('app_title'), tag: T('vid_end_tag'), find: T('vid_end_find', { host }) };
    const base = { col: window.CaroShare.palette(), font: getComputedStyle(document.body).fontFamily, host, text };
    if (st.kind === 'puzzle') {
      const q = st.src;
      const sol = V.solveLine(C, window.CaroAnalysis, q.m, q.sol, q.rule, 600);
      const side = q.m.length % 2 ? C.O : C.X, P = side === C.X ? 'X' : 'O';
      Object.assign(text, {
        head: T('vid_pz_head', { n: q.id, r: q.r }), question: T('vid_pz_q', { p: P, n: q.len }), think: T('vid_pz_think'),
        answer: T('vid_pz_answer'), answerN: T('vid_pz_answer_n', { n: q.len }), won: T('vid_pz_won', { p: P }),
      });
      return { ...base, kind: 'puzzle', moves: q.m, line: sol.line, won: sol.won, side, rule: q.rule || 'vn',
        tl: V.puzzleTimeline(sol.line.length, sol.won, speed) };
    }
    const g = st.src, n = g.moves.length;
    const names = st.names ? { x: g.x, o: g.o } : null;
    const result = resultOf(g, names);
    Object.assign(text, {
      head: T('vid_game_head') + window.I18N.ruleTag(g.rule), count: T('n_moves', { n }),
      moveOf: (i, all) => T('vid_move_of', { i, n: all }),
    });
    return { ...base, kind: 'game', moves: g.moves, line: [], names, result, rule: g.rule,
      tl: V.gameTimeline(n, !!result && result !== T('draw_short'), speed) };
  }

  // ------------------------------------------------------------ Hộp thoại
  function setStatus(msg, err) {
    const el = $('vid-status');
    el.textContent = msg || '';
    el.classList.toggle('err', !!err);
  }
  function ui(phase) {
    st.phase = phase;
    const busy = phase === 'rec';
    $('vid-start').hidden = busy;
    $('vid-start').disabled = busy;
    $('vid-cancel').hidden = !busy;
    $('vid-prog-box').hidden = !busy;
    $('vid-names').disabled = busy;
    $('vid-pz-id').disabled = busy;
    $('vid-pz-rand').disabled = busy;
    const done = phase === 'done';
    const native = !!(window.CaroNative && window.CaroNative.shareFile);
    $('vid-dl').hidden = !done || native; // app gốc: thẻ a download không chạy trong WebView – dùng bảng chia sẻ
    $('vid-share').hidden = !done || !(native || (st.file && navigator.canShare && safeCanShare(st.file)));
    $('vid-start').querySelector('span').textContent = T(done ? 'vid_again' : 'vid_start');
  }
  function safeCanShare(file) { try { return navigator.canShare({ files: [file] }); } catch (e) { return false; } }

  function drawPreview() {
    const pv = $('vid-preview');
    const g = pv.getContext('2d');
    g.drawImage(work, 0, 0, pv.width, pv.height);
  }

  /** Dựng lại kịch bản (đổi bài / ô hiện tên) và vẽ khung đầu vào ô xem trước. */
  function refresh() {
    clearResult();
    st.spec = buildSpec();
    st.renderer = window.CaroVideoDraw.renderer(workCanvas(), st.spec);
    st.renderer.draw(0);
    drawPreview();
    $('vid-info').textContent = T('vid_info', { s: Math.round(st.spec.tl.total) });
    setStatus('');
    ui('ready');
  }

  function clearResult() {
    if (st && st.url) URL.revokeObjectURL(st.url);
    if (st) { st.blob = st.url = st.file = null; }
    $('vid-dl').removeAttribute('href');
  }

  function open(kind, src) {
    if (isPortal() || !src) return false;
    stop(true);
    if (st && st.url) URL.revokeObjectURL(st.url);
    st = { kind, src, names: false };
    $('vid-names').checked = false;
    $('vid-names-row').hidden = kind !== 'game';
    $('vid-pz-row').hidden = kind !== 'puzzle';
    if (kind === 'puzzle') $('vid-pz-id').value = String(src.id);
    window.CaroOnline.openDlg('video-dlg');
    refresh();
    return true;
  }

  /** Câu đố: q là một bài của puzzles.json; không truyền thì lấy bài hôm nay. */
  async function openPuzzle(q) {
    if (isPortal()) return false;
    if (!q) {
      try {
        const list = await window.CaroPuzzles.loadPuzzles();
        q = window.CaroPuzzles.dailyPuzzle(list.filter((z) => !z.rule));
      } catch (e) { q = null; }
      if (!q) { await window.CaroConfirm.info(T('pz_load_fail')); return false; }
    }
    return open('puzzle', q);
  }
  /** Ván đấu: { moves, x, o, winner?, reason?, rule, id? } – cùng dữ liệu hộp chia sẻ ảnh / GIF (share.js). */
  function openGame(game) {
    if (!game || !Array.isArray(game.moves) || !game.moves.length) return false;
    return open('game', game);
  }

  async function pickPuzzle(id, random) {
    let list;
    try { list = await window.CaroPuzzles.loadPuzzles(); } catch (e) { return; }
    const pool = list.filter((z) => !z.rule || z.rule === 'vn' || z.rule === 'free');
    const q = random ? pool[Math.floor(Math.random() * pool.length)] : list.find((z) => z.id === id);
    if (!q || !st) { if (st) $('vid-pz-id').value = String(st.src.id); return; }
    st.src = q;
    $('vid-pz-id').value = String(q.id);
    refresh();
  }

  // ------------------------------------------------------------ Ghi hình
  function supported(cv) {
    return typeof window.MediaRecorder === 'function' && typeof cv.captureStream === 'function';
  }

  async function start() {
    if (!st || st.phase === 'rec') return;
    const cv = workCanvas();
    if (!supported(cv)) { await window.CaroConfirm.info(T('vid_unsupported')); return; }
    clearResult();
    const MR = window.MediaRecorder;
    const mime = testOpt().mime || (typeof MR.isTypeSupported === 'function' ? V.pickMime((m) => MR.isTypeSupported(m)) : '');
    const total = st.spec.tl.total;
    let stream, rec;
    try {
      stream = cv.captureStream(V.FPS);
      const opts = { videoBitsPerSecond: V.BITRATE };
      if (mime) opts.mimeType = mime;
      rec = new MR(stream, opts);
    } catch (e) {
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      await window.CaroConfirm.info(T('vid_unsupported'));
      return;
    }
    const run = st;
    run.rec = rec; run.canceled = false; run.hidden = document.hidden;
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onerror = () => { run.failed = true; };
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      clearTimeout(run.timer);
      if (st !== run) return; // đã mở video khác
      if (run.canceled) { ui('ready'); setStatus(T('vid_canceled')); return; }
      finish(run, chunks, rec.mimeType || mime, total).catch(() => { ui('ready'); setStatus(T('vid_fail'), true); });
    };
    ui('rec');
    setStatus(T('vid_keep_open'));
    $('vid-prog').value = 0;
    $('vid-prog-n').textContent = T('vid_making', { p: 0 });
    run.renderer.draw(0);
    try { rec.start(1000); } catch (e) { stream.getTracks().forEach((tr) => tr.stop()); ui('ready'); setStatus(T('vid_fail'), true); return; }
    // Đồng hồ thật: vẽ khung theo thời gian đã trôi (không theo số lần gọi), nên video đúng thời lượng cả khi máy chậm
    const t0 = performance.now();
    let frame = 0;
    const tick = () => {
      if (st !== run || run.canceled || rec.state === 'inactive') return;
      const now = performance.now(), t = (now - t0) / 1000;
      run.renderer.draw(Math.min(t, total));
      if (++frame % 3 === 0) drawPreview();
      const pct = Math.min(100, Math.floor((t / total) * 100));
      $('vid-prog').value = pct;
      $('vid-prog-n').textContent = T('vid_making', { p: pct });
      if (t >= total + 0.15) { drawPreview(); rec.stop(); return; } // giữ khung cuối thêm chút cho chắc lấy được
      const due = t0 + (frame + 1) * (1000 / V.FPS);
      run.timer = setTimeout(tick, Math.max(0, due - performance.now()));
    };
    tick();
  }

  async function finish(run, chunks, mime, total) {
    let blob = new Blob(chunks, { type: V.baseMime(mime) });
    if (!blob.size || run.failed) throw new Error('empty');
    if (V.extOf(mime) === 'webm') blob = new Blob([V.fixWebmDuration(new Uint8Array(await blob.arrayBuffer()), total * 1000)], { type: 'video/webm' });
    const id = run.kind === 'puzzle' ? run.src.id : run.src.id || new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    run.name = V.fileName(run.kind, id, mime);
    run.blob = blob;
    run.url = URL.createObjectURL(blob);
    try { run.file = new File([blob], run.name, { type: blob.type }); } catch (e) { run.file = null; }
    const a = $('vid-dl');
    a.href = run.url;
    a.download = run.name;
    ui('done');
    const msg = T('vid_done', { s: Math.round(total), mb: (blob.size / 1048576).toFixed(1), ext: V.extOf(mime).toUpperCase() });
    setStatus(run.hidden ? msg + ' ' + T('vid_hidden_warn') : msg, run.hidden);
  }

  /** Dừng bản ghi đang chạy (Huỷ, đóng hộp, mở video khác). */
  function stop(silent) {
    if (!st || !st.rec || st.rec.state === 'inactive') return;
    st.canceled = true;
    clearTimeout(st.timer);
    try { st.rec.stop(); } catch (e) { /* đã dừng */ }
    if (silent) st.rec = null;
  }

  const b64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  async function share() {
    if (!st || !st.blob) return;
    const title = T('app_title');
    const N = window.CaroNative;
    try {
      if (N && N.shareFile) await N.shareFile(st.name, await b64(st.blob), title); // app gốc: ghi file tạm rồi mở bảng chia sẻ (như ảnh / GIF)
      else await navigator.share({ files: [st.file], title });
    } catch (e) {
      if ((e && e.name === 'AbortError') || /cancel/i.test(String(e && e.message))) return;
      setStatus(T('share_fail'), true);
    }
  }

  // Tab bị ẩn giữa chừng: trình duyệt hãm đồng hồ → video giật. Nhắc giữ màn hình mở (và ghi nhận để báo khi xong).
  document.addEventListener('visibilitychange', () => {
    if (!st || st.phase !== 'rec' || !document.hidden) return;
    st.hidden = true;
    setStatus(T('vid_hidden_warn'), true);
  });

  $('vid-start').onclick = start;
  $('vid-cancel').onclick = () => stop(false);
  $('vid-share').onclick = share;
  $('vid-names').onchange = () => { if (st && st.phase !== 'rec') { st.names = $('vid-names').checked; refresh(); } };
  $('vid-pz-id').onchange = () => pickPuzzle(Math.floor(+$('vid-pz-id').value), false);
  $('vid-pz-rand').onclick = () => pickPuzzle(0, true);
  dlg.addEventListener('close', () => { stop(true); if (st) st.phase = 'closed'; });
  window.addEventListener('langchange', () => { if (st && dlg.open && st.phase !== 'rec') refresh(); });

  window.CaroVideo = {
    openPuzzle, openGame,
    /** Kết quả lần dựng gần nhất (cho bài thử): { size, type, name, dur } hoặc null. */
    get result() { return st && st.blob ? { size: st.blob.size, type: st.blob.type, name: st.name, dur: st.spec.tl.total } : null; },
    get blob() { return st && st.blob; },
    get phase() { return st ? st.phase : ''; },
  };
})();
