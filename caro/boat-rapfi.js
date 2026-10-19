/*
 * Cầu nối tới Rapfi (engine vô địch Gomocup, bản WebAssembly – caro/rapfi/, GPL-3) cho luật tự do / tiêu chuẩn / Renju,
 * và Rapfi-CARO (Rapfi thêm luật Việt Nam chặn hai đầu – caro/rapfi/SOURCE.md) cho luật Việt Nam: BOAT đi nước (move) và
 * phân tích ván chấm thế (ask – rapfi-analysis.js). Rapfi chạy trong Worker riêng (rapfi/worker.js), chỉ nói chuyện qua
 * postMessage. Bản iOS (CARO_NO_RAPFI – điều khoản App Store xung khắc với GPL), trình duyệt không có WebAssembly SIMD,
 * thế cờ không vừa bàn của Rapfi hay Rapfi lỗi → trả null để app.js / phân tích dùng engine của game.
 *
 * Bàn của game vô hạn, Rapfi cần bàn cố định: đặt thế lên bàn Rapfi và kiểm lại thế sát mép – xem rapfi-board.js.
 *
 *   CaroRapfi.handles(botId, rule)   – BOAT + luật có Rapfi + trình duyệt chạy được
 *   CaroRapfi.available(rule)        – luật có Rapfi + trình duyệt chạy được (phân tích)
 *   CaroRapfi.prepare(botId, rule)   – tải trước mạng (~10 MB, lần đầu) khi bắt đầu ván với BOAT
 *   CaroRapfi.ready(rule, wait)      – Promise<bool>: Rapfi của luật đã sẵn sàng (chờ tối đa wait ms)
 *   CaroRapfi.move(board, p, botId)  – Promise<[x, y] | null>
 *   CaroRapfi.ask(rule, moves, ms, lane, o) – Promise<{ move, ev: { cp, mate }, margin, used, hit } | null>, moves: [[x, y],
 *                                      …] toạ độ game; lane 1 = Worker phụ cho phân tích (auxReady / auxDone); o: { play,
 *                                      tm, nodes } – cách nghĩ (rapfi/brain.js): BOAT đi / tự chia thời gian / số nút
 *   CaroRapfi.auxReady(rule, wait)   – Promise<bool>: có Worker phụ (máy đủ RAM) · auxDone() – rảnh 1 phút thì dừng nó
 *   CaroRapfi.check(rule, moves, ms) – engine của game chấm thế (Worker riêng): Promise<{ move, score, mate } | null>
 *   CaroRapfi.stopPonder()           – dừng nghĩ trước (sau nước của BOAT Rapfi nghĩ tiếp trên thế người chơi tới lượt;
 *                                      người chơi không chạm / bấm phím IDLE.ms (10 phút) thì tạm dừng, quay lại thì nghĩ tiếp)
 *   CaroRapfi.mtOn() / setMt(v)      – tuỳ chọn "Rapfi đa luồng" (Cài đặt – rapfi-settings.js); đổi thì dựng lại Worker
 *   CaroRapfi.mtActive()             – Worker đang chạy bản đa luồng · working(): bản đa luồng đang nghĩ / nghĩ trước
 *   CaroRapfi.load(level)            – tự giảm tải (rapfi-load.js): 0 bình thường · 1 máy căng / pin yếu: thôi nghĩ trước,
 *                                      nửa số luồng · 2 máy rất nóng: thôi nghĩ trước, 1 luồng
 *   CaroRapfi.stats                  – số nước Rapfi đi / nhường engine / engine sửa nước Rapfi sát mép
 *   CaroRapfi.game                   – như stats nhưng chỉ ván hiện tại (đếm lại ở prepare – mỗi ván mới)
 * Phát sự kiện window 'caro:rapfi' { state: 'loading' | 'ready' | 'failed', rule, pct, mt }.
 */
(function (global) {
  'use strict';
  const C = global.Caro;
  const B = global.CaroRapfiBoard; // đặt thế lên bàn Rapfi, kiểm thế sát mép (rapfi-board.js)
  const { SIZE, SAFE_EDGE, frame, place, check } = B;
  const MB = { free: 10, std: 10, renju: 20, vn: 1 }; // luật Việt Nam: chỉ bản dựng ~1,3 MB, không mạng NNUE
  const FIRST_WAIT = 1500; // mạng chưa sẵn sàng: chờ ngần này (đủ cho lần nạp từ bộ nhớ đệm), quá thì nước này dùng engine
  const RETRY_MS = 60000; // tải lỗi (mạng chập chờn): sau 1 phút cho thử lại
  const CHECK_MS = 400; // thời gian engine của game kiểm một thế sát mép
  // Sách khai cuộc '<luật>-rapfi' (book-data.js – server/scripts/build-book.js: Rapfi nghĩ 10 giây / thế, thế tới 7 quân)
  const BOOK_MAX = 7;
  const hasBook = (rule) => !!(global.CaroBookData && global.CaroBookData[rule + '-rapfi']);
  const T = (k, v) => (global.I18N ? global.I18N.t(k, v) : k);
  const toast = (m, ms) => global.CaroOnline && global.CaroOnline.toast(m, ms);

  let cur = null; // { rule, worker, ready: Promise<bool>, state, pct, toasted, busy: số thế đang nghĩ }
  let aux = null; // Worker Rapfi thứ hai cho phân tích (máy đủ RAM): chấm hai thế cùng lúc – xem rapfi-analysis.js
  const failedAt = {}; // luật → thời điểm tải lỗi gần nhất
  let seq = 0;

  // Rapfi dựng với WebAssembly SIMD – mạng NNUE bắt buộc có (kiểm bằng một hàm nhỏ dùng lệnh v128 – như wasm-feature-detect)
  let simd = null;
  function hasSimd() {
    if (simd === null) {
      try {
        simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
      } catch (e) { simd = false; }
    }
    return simd;
  }
  function supported() {
    return !global.CARO_NO_RAPFI && typeof WebAssembly === 'object' && !!global.Worker &&
      /^(https?|capacitor):$/.test(global.location.protocol) && hasSimd();
  }
  function botOf(id) { return global.CaroBots && (typeof id === 'string' ? global.CaroBots.get(id) : id); }
  function available(rule) {
    return !!(SIZE[rule] && supported() && !(failedAt[rule] && Date.now() - failedAt[rule] < RETRY_MS));
  }
  function handles(botId, rule) {
    const bot = botOf(botId);
    return !!(bot && bot.rapfi && available(rule));
  }
  const emit = (detail) => global.dispatchEvent(new CustomEvent('caro:rapfi', { detail }));

  const RETIRE_MS = 30000; // Worker thôi việc mà vẫn chưa xong việc sau ngần này (treo): dừng hẳn

  function stop() {
    if (cur) retire(cur);
    if (aux) retire(aux);
    cur = aux = null;
    B.reset(); // Worker kiểm thế sát mép (rapfi-board.js): đổi luật / dừng Rapfi thì trả RAM luôn
  }

  /**
   * Cho Worker thôi việc. Đang tính (nạp mạng / nghĩ nước) thì đợi tính xong mới terminate(): terminate() lúc
   * WebAssembly của Rapfi đang chạy có lúc làm sập cả trang trên WebKit (Safari) – đo trên CI, kịch bản tắt Worker
   * đang nghĩ. Kết quả của Worker đã thôi việc bị bỏ qua (ask() / ready() so cur === st).
   */
  function retire(st) {
    try { st.worker.postMessage({ type: 'stop' }); } catch (e) { /* đã dừng */ } // đang nghĩ trước: dừng ở lát kế tiếp
    const kill = () => { clearTimeout(st.retireTimer); try { st.worker.terminate(); } catch (e) { /* đã dừng */ } };
    if (st.state !== 'loading' && !st.busy) return kill();
    // Các listener của ensure() / ask() đăng ký trước nên đã cập nhật state / busy khi tới listener này
    st.worker.addEventListener('message', () => { if (st.state !== 'loading' && !st.busy) kill(); });
    st.worker.addEventListener('error', kill); // lỗi trong Worker: dừng ngay, khỏi chờ hết RETIRE_MS
    st.retireTimer = setTimeout(kill, RETIRE_MS);
  }

  /** Worker cho luật `rule` (mỗi Worker một luật: đổi luật thì dựng lại). */
  function ensure(rule) {
    if (cur && cur.rule === rule) return cur;
    stop();
    cur = spawn(rule, false);
    return cur;
  }
  /** Worker thứ hai (phân tích) cho luật `rule`, dựng sau khi Worker chính đã sẵn sàng (mạng đã nằm trong Cache Storage). */
  function ensureAux(rule) {
    if (aux && aux.rule === rule) return aux;
    if (aux) retire(aux);
    aux = spawn(rule, true);
    return aux;
  }

  /** Dựng một Worker Rapfi. quiet: Worker phụ – không báo tải / lỗi cho người chơi, lỗi thì chỉ bỏ Worker phụ. */
  function spawn(rule, quiet) {
    let worker;
    try { worker = new Worker('rapfi/worker.js'); } catch (e) { if (!quiet) failedAt[rule] = Date.now(); return null; }
    const st = { rule, worker, state: 'loading', pct: 0, toasted: false, busy: 0 };
    // Chỉ báo "đang tải" khi chưa xong sau 0,7 giây (mạng đã có trong Cache Storage thì nạp gần như tức thì)
    const slow = quiet ? 0 : setTimeout(() => {
      if (st.state === 'loading' && cur === st) { st.toasted = true; toast(T('rapfi_loading', { mb: MB[rule] }), 5000); }
    }, 700);
    st.ready = new Promise((resolve) => {
      const onMsg = (e) => {
        const d = e.data;
        if (d.type === 'progress') {
          st.pct = d.pct;
          if (!quiet) emit({ state: 'loading', rule, pct: d.pct });
        } else if (d.type === 'ready') {
          clearTimeout(slow);
          worker.removeEventListener('message', onMsg);
          st.state = 'ready';
          st.mt = !!d.mt; st.threads = st.maxThreads = d.threads || 1; // bản đa luồng (trang cô lập cross-origin) – rapfi/worker.js
          stats.threads = st.threads;
          if (!quiet && level) setThreads(st); // máy đang căng từ trước khi Worker sẵn sàng
          if (st.toasted) toast(T('rapfi_ready'), 3500);
          if (!quiet) emit({ state: 'ready', rule, pct: 100, mt: st.mt });
          resolve(true);
        } else if (d.type === 'error') {
          clearTimeout(slow);
          worker.removeEventListener('message', onMsg);
          if (st.state === 'loading' && !quiet) { // lỗi khi đang tải / khởi động
            failedAt[rule] = Date.now();
            toast(T('rapfi_failed'), 4500);
            emit({ state: 'failed', rule });
          }
          st.state = 'failed';
          if (quiet) { if (aux === st) { retire(st); aux = null; } } else if (cur === st) stop();
          resolve(false);
        }
      };
      worker.addEventListener('message', onMsg);
      worker.addEventListener('error', () => onMsg({ data: { type: 'error', msg: 'worker' } }));
    });
    // Số luồng (bản đa luồng): chừa một lõi cho trang; điện thoại tối đa 2 (pin, máy nóng). Bảng băm lớn hơn trên máy
    // đủ RAM – nghĩ trước không giới hạn thời gian cần chỗ chứa nhiều kịch bản
    const cores = navigator.hardwareConcurrency || 2;
    worker.postMessage({ type: 'init', rule, mt: mtOn(), threads: Math.max(1, Math.min(small() ? 2 : 8, cores - 1)), hashMb: small() ? 16 : 64 });
    return st;
  }

  // Ván hiện tại: số nước Rapfi đi / nhường engine (huy hiệu "Đánh chìm BOAT–Rapfi" – habits.js); ván mới thì đếm lại
  const game = { rapfi: 0, fallback: 0 };
  function prepare(botId, rule) {
    game.rapfi = game.fallback = 0;
    stopPonder();
    // Ván mới: Worker quên lượt nghĩ trước và quỹ giờ của ván cũ (rapfi/brain.js)
    if (cur && cur.state === 'ready') try { cur.worker.postMessage({ type: 'game' }); } catch (e) { /* đã dừng */ }
    if (handles(botId, rule)) ensure(rule);
  }

  const wait = (ms) => new Promise((r) => setTimeout(() => r(false), ms));
  /** Rapfi của luật đã sẵn sàng chưa (bắt đầu tải nếu chưa) – chờ tối đa `ms`. */
  async function ready(rule, ms) {
    if (!available(rule)) return false;
    const st = ensure(rule);
    if (!st) return false;
    const ok = st.state === 'ready' || (await Promise.race([st.ready, wait(ms)]));
    return !!ok && cur === st;
  }

  /**
   * Worker phụ cho phân tích (chấm hai thế cùng lúc) sẵn sàng chưa – chỉ máy đủ RAM (mỗi Worker giữ một bản mạng NNUE) và
   * khi Worker chính đã sẵn sàng (mạng đã có trong Cache Storage); dựng nếu chưa có, chờ tối đa `ms`.
   */
  let auxTimer = 0;
  async function auxReady(rule, ms) {
    clearTimeout(auxTimer);
    // Bản đa luồng: một Worker đã dùng hết các lõi – Worker thứ hai chỉ tranh CPU
    if (small() || !cur || cur.rule !== rule || cur.state !== 'ready' || cur.mt) return false;
    const st = ensureAux(rule);
    if (!st) return false;
    const ok = st.state === 'ready' || (await Promise.race([st.ready, wait(ms)]));
    return !!ok && aux === st;
  }

  /** Phân tích xong / vừa tạo sẵn: Worker phụ rảnh AUX_IDLE thì dừng (trả RAM của bản mạng thứ hai). */
  const AUX_IDLE = 60000;
  function auxDone() {
    clearTimeout(auxTimer);
    auxTimer = setTimeout(() => { if (aux && !aux.busy) { retire(aux); aux = null; } }, AUX_IDLE);
  }

  /**
   * Hỏi Rapfi một thế (moves: [[x, y], …] toạ độ game, X đi trước). lane 1: Worker phụ (phân tích – auxReady).
   * Chưa sẵn sàng / lỗi / không vừa bàn → null.
   */
  async function ask(rule, moves, ms, lane, o) {
    if (!moves.length) return { move: [0, 0], ev: { cp: 0, mate: 0 }, margin: SIZE[rule] >> 1 };
    // Phân tích theo số nút: luôn đặt thế vào giữa bàn (frame) – khung "dính" của place đổi theo các thế chấm trước, mà vị
    // trí trên bàn Rapfi làm đổi chút ít kết quả; chấm theo số nút cần cùng thế → cùng kết quả
    const n = SIZE[rule], f = o && o.nodes ? frame(moves, n) : place(rule, moves);
    if (!f || !(await ready(rule, 0))) return null;
    const live = () => (lane ? aux : cur);
    const st = live(), id = ++seq;
    if (!st || st.state !== 'ready' || st.rule !== rule) return null;
    if (lane) stats.aux++;
    st.busy++;
    const res = await new Promise((resolve) => {
      // Chờ quá giới hạn cứng của brain.js (số nút: 5 × ms, tự chia thời gian: 2 × ms) mà chưa trả lời: coi là treo
      const timer = setTimeout(() => { st.busy--; st.worker.removeEventListener('message', onMsg); resolve(null); }, ms * 12 + 8000);
      function onMsg(e) {
        if (e.data.type !== 'move' || e.data.id !== id) return;
        clearTimeout(timer);
        st.busy--;
        st.worker.removeEventListener('message', onMsg);
        resolve(e.data);
      }
      st.worker.addEventListener('message', onMsg);
      st.worker.postMessage({ type: 'move', id, size: n, ms, ...(o || {}), moves: moves.map(([x, y]) => [x - f.ox, y - f.oy]) });
    });
    if (live() !== st) return null; // Worker đã thôi việc (đổi luật) trong lúc nghĩ: nước này thuộc thế cũ
    if (!res || !res.move) { // treo: lần sau dựng Worker mới
      if (!res) { if (lane) { retire(st); aux = null; } else stop(); }
      return null;
    }
    const [rx, ry] = res.move;
    if (rx < 0 || ry < 0 || rx >= n || ry >= n) return null;
    return { move: [rx + f.ox, ry + f.oy], ev: res.ev, margin: f.margin, used: res.used || 0, hit: !!res.hit };
  }

  // Điện thoại (RAM ≤ 4 GB / màn cảm ứng): ít luồng, bảng băm nhỏ, không Worker phụ
  function small() {
    return (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4) ||
      !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
  }
  /**
   * Rapfi nghĩ trước trên thế moves (người chơi tới lượt) – bảng băm giữ sang nước sau của BOAT (rapfi/worker.js). Giữ thế
   * trong held: tạm dừng (ứng dụng chạy nền / người chơi bỏ máy IDLE.ms) rồi nghĩ tiếp đúng thế đó khi người chơi quay lại.
   */
  const IDLE = { ms: 600000 }; // giới hạn an toàn cho nghĩ trước không giới hạn: bỏ máy 10 phút thì thôi (pin, máy nóng)
  let held = null, paused = false, lastInput = Date.now(), idleTimer = 0;
  function ponder(rule, moves) {
    held = { rule, moves };
    paused = false;
    run();
  }
  function run() {
    const st = cur, { rule, moves } = held;
    if (!st || st.state !== 'ready' || st.rule !== rule || global.document.hidden || level) { paused = true; return; }
    armIdle();
    const f = place(rule, moves);
    if (paused || !f) return; // người chơi đã bỏ máy quá IDLE.ms: chờ họ quay lại
    const id = ++seq;
    stats.ponder++;
    st.busy++; // đang chạy WebAssembly: retire() chờ xong lát hiện tại mới terminate()
    const onMsg = (e) => {
      if (e.data.type !== 'pondered' || e.data.id !== id) return;
      st.busy--;
      st.worker.removeEventListener('message', onMsg);
    };
    st.worker.addEventListener('message', onMsg);
    // ms: 0 – không giới hạn: người chơi nghĩ càng lâu, BOAT càng xét nhiều kịch bản (dừng khi người chơi đi, hết ván,
    // ván mới, ứng dụng chạy nền)
    st.worker.postMessage({ type: 'ponder', id, ms: 0, moves: moves.map(([x, y]) => [x - f.ox, y - f.oy]) });
  }
  function halt() {
    if (cur && cur.state === 'ready') try { cur.worker.postMessage({ type: 'stop' }); } catch (e) { /* đã dừng */ }
  }
  function stopPonder() {
    held = null; paused = false;
    clearTimeout(idleTimer);
    halt();
  }
  /** Tạm dừng nghĩ trước, giữ thế để nghĩ tiếp (resume). */
  function pause() {
    if (!held || paused) return;
    paused = true;
    clearTimeout(idleTimer);
    halt();
  }
  function resume() {
    if (held && paused && !global.document.hidden) { paused = false; run(); }
  }
  function armIdle() {
    clearTimeout(idleTimer);
    const left = IDLE.ms - (Date.now() - lastInput);
    if (left <= 0) { stats.idle++; pause(); } else idleTimer = setTimeout(armIdle, left);
  }
  // Người chơi còn ở đây (chạm, bấm phím, cuộn): tính lại giờ bỏ máy; đang tạm dừng vì bỏ máy thì nghĩ tiếp
  const touched = () => {
    lastInput = Date.now();
    if (paused) resume(); else if (held) armIdle();
  };
  for (const t of ['pointerdown', 'keydown', 'touchstart', 'wheel']) global.addEventListener(t, touched, { capture: true, passive: true });
  // Hết ván / ứng dụng chạy nền: thôi nghĩ trước (trả CPU cho phân tích, đỡ pin). Hết ván với Rapfi đang chạy (máy đủ
  // RAM): tạo sẵn Worker phụ để bấm Phân tích là chấm hai thế cùng lúc
  global.addEventListener('caro:gameover', () => {
    stopPonder();
    if (cur && cur.state === 'ready' && !cur.mt && !small()) { ensureAux(cur.rule); auxDone(); }
  });
  global.document.addEventListener('visibilitychange', () => { if (global.document.hidden) pause(); else touched(); });

  // Đếm số nước Rapfi đi / phải nhường engine của game / engine sửa nước Rapfi sát mép / số lần nghĩ trước / số thế Worker phụ chấm (kiểm thử, gỡ lỗi)
  // … / số lần tạm dừng nghĩ trước vì người chơi bỏ máy
  // … / số nước đáp nhanh vì đoán trúng lúc nghĩ trước / mức tự giảm tải
  const stats = { rapfi: 0, fallback: 0, fixed: 0, ponder: 0, aux: 0, threads: 0, idle: 0, load: 0, hit: 0 };
  // Cách BOAT nghĩ mỗi nước (rapfi/brain.js – số đo trong rapfi/SOURCE.md và caro/README.md): hit – đoán trúng nước người chơi
  // lúc nghĩ trước thì đáp nhanh; tm – Rapfi tự chia thời gian theo quỹ giờ cả ván
  const PLAY = { hit: false, tm: false };

  // Tuỳ chọn "Rapfi đa luồng" (mặc định bật; trình duyệt không cô lập cross-origin thì luôn một luồng – rapfi/worker.js)
  const MT_KEY = 'caro.rapfiMt';
  function mtOn() {
    try { return localStorage.getItem(MT_KEY) !== '0'; } catch (e) { return true; }
  }
  function setMt(v) {
    try { localStorage.setItem(MT_KEY, v ? '1' : '0'); } catch (e) { /* riêng tư */ }
    // Worker đang chạy khác lựa chọn mới: dừng, nước sau / lần phân tích sau dựng lại (mạng đã có trong Cache Storage)
    if (cur && cur.state === 'ready' && cur.mt !== (!!v && global.crossOriginIsolated === true)) { held = null; stop(); }
  }
  const mtActive = () => !!(cur && cur.state === 'ready' && cur.mt);

  // Tự giảm tải: máy căng / nóng (Compute Pressure) hoặc pin yếu → thôi nghĩ trước (việc nặng kéo dài nhất), bớt luồng.
  // Hết căng thì trả lại như cũ và nghĩ trước tiếp đúng thế đang chờ
  let level = 0;
  function setThreads(st) {
    const n = !st.mt ? 1 : level >= 2 ? 1 : level === 1 ? Math.max(1, Math.ceil(st.maxThreads / 2)) : st.maxThreads;
    if (n === st.threads) return;
    st.threads = stats.threads = n;
    try { st.worker.postMessage({ type: 'threads', n }); } catch (e) { /* đã dừng */ }
  }
  function load(v) {
    const lv = Math.max(0, Math.min(2, v | 0));
    if (lv === level) return;
    level = stats.load = lv;
    if (level) pause(); // giữ thế: hết căng thì nghĩ trước tiếp
    if (cur && cur.state === 'ready') setThreads(cur);
    if (!level) resume();
  }
  const working = () => !!(mtActive() && cur.busy > 0);

  async function move(board, p, botId) {
    const bot = botOf(botId);
    if (!handles(bot, board.rule)) return null;
    held = null; // người chơi đã đi: thế nghĩ trước cũ hết dùng (tin 'move' dừng lượt nghĩ trước trong Worker)
    clearTimeout(idleTimer);
    const m = await think(board, p, bot);
    stats[m ? 'rapfi' : 'fallback']++;
    game[m ? 'rapfi' : 'fallback']++;
    // Nghĩ trước trong lúc người chơi nghĩ (trừ khi nước này thắng luôn, hoặc nước sau của BOAT còn trong sách)
    const moves = board.moves.map((q) => [q.x, q.y]);
    if (m && !C.winsIfPlaced(board, m[0], m[1], p) && !(hasBook(board.rule) && moves.length + 2 <= BOOK_MAX)) {
      ponder(board.rule, moves.concat([m]));
    }
    return m;
  }

  async function think(board, p, bot) {
    const rule = board.rule, moves = board.moves.map((m) => [m.x, m.y]);
    if (!moves.length) return [0, 0];
    if ((moves.length % 2 === 0 ? C.X : C.O) !== p) return null; // Rapfi tính bên đi theo số quân
    // Nước đầu ván lấy từ sách (Rapfi nghĩ 10 giây mỗi thế – hơn nghĩ 2,5 giây trên điện thoại; đi ngay, kể cả khi mạng
    // NNUE còn đang tải lần đầu)
    if (moves.length <= BOOK_MAX && global.CaroBook) {
      const m = global.CaroBook.lookup(moves, rule + '-rapfi');
      if (m && board.get(m[0], m[1]) === C.EMPTY && !(C.forbidden && C.forbidden(board, m[0], m[1], p))) return m;
    }
    const f = frame(moves, SIZE[rule]);
    if (!f || !(await ready(rule, FIRST_WAIT))) return null;
    const near = f.margin < SAFE_EDGE;
    // Sát mép: chừa thời gian cho engine kiểm lại (tổng vẫn ≈ thời gian nghĩ của BOAT)
    const r = await ask(rule, moves, near ? Math.max(800, bot.rapfi.ms - 2 * CHECK_MS) : bot.rapfi.ms, 0, { play: true, ...PLAY });
    if (!r) return null;
    if (r.hit) stats.hit++;
    let [x, y] = r.move;
    if (board.get(x, y) !== C.EMPTY || (C.forbidden && C.forbidden(board, x, y, p))) return null;
    if (r.margin < SAFE_EDGE) {
      const [mine, after] = await Promise.all([check(rule, moves, CHECK_MS), check(rule, moves.concat([[x, y]]), CHECK_MS)]);
      const keeps = after && after.mate < 0; // sau nước Rapfi, đối thủ thua chắc
      const ok = (m) => m && board.get(m[0], m[1]) === C.EMPTY && !(C.forbidden && C.forbidden(board, m[0], m[1], p));
      // Engine thấy ta có chuỗi thắng mà nước Rapfi không giữ được / nước Rapfi để đối thủ có chuỗi thắng trong khi
      // engine chưa thấy ta thua: đi nước của engine (Rapfi đọc sai vì mép bàn)
      if (mine && ok(mine.move) && ((mine.mate > 0 && !keeps) || (after && after.mate > 0 && !(mine.mate < 0)))) {
        if (mine.move[0] !== x || mine.move[1] !== y) { stats.fixed++; [x, y] = mine.move; }
      }
    }
    return [x, y];
  }

  global.CaroRapfi = {
    handles, available, supported, prepare, ready, auxReady, auxDone, move, ask, check, frame, stopPonder,
    mtOn, setMt, mtActive, working, load, stats, game, IDLE, SIZE, SAFE_EDGE,
  };
})(window);
