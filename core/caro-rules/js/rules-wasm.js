/*
 * Nạp lõi luật Rust (caro_rules.wasm) và bày ra API cùng tên với caro/rules.js:
 *   EMPTY, X, O, DIRS, RULES, ruleOf, key, other, Board, lineWin, checkWin, winsIfPlaced, forbidden, winLen
 * thêm: checkWinMoves(rule, moves), forbiddenMoves(rule, moves, x, y) – kiểu "không trạng thái" (dãy nước (x,y),
 *       X đi trước); mayForbid, forbiddenRaw – chỉ để kiểm tra bước lọc nhanh; exports – các hàm caro_* gốc.
 * Thí điểm (docs/thi-diem-rust-luat-choi.md): CHƯA nối vào trò chơi. Chạy được trên Node (đọc file bằng fs) và
 * trình duyệt (fetch + instantiateStreaming). Toạ độ phải là số nguyên 32 bit (WASM nhận i32).
 *
 *   const R = await CaroRulesWasm.load();              // Node: mặc định ./caro_rules.wasm cạnh file này
 *   const b = new R.Board('renju'); b.play(0, 0, R.X); R.forbidden(b, 1, 1, R.X); b.free();
 */
(function (global) {
  'use strict';

  const EMPTY = 0, X = 1, O = 2;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const RULES = ['vn', 'free', 'std', 'renju'];
  const REASON = [null, 'overline', '44', '33'];
  const PLAY_ERR = { 1: 'out_of_range', 2: 'occupied' };
  const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

  /** Đọc byte của file .wasm: Uint8Array/ArrayBuffer dùng luôn; chuỗi là đường dẫn (Node) hoặc URL (trình duyệt). */
  async function instantiate(src) {
    if (src instanceof ArrayBuffer || ArrayBuffer.isView(src)) return (await WebAssembly.instantiate(src, {})).instance;
    if (isNode && (src === undefined || typeof src === 'string') && !/^https?:/.test(src || '')) {
      const fs = require('fs'), path = require('path');
      const file = src || path.join(__dirname, 'caro_rules.wasm');
      return (await WebAssembly.instantiate(fs.readFileSync(file), {})).instance;
    }
    const url = src || 'caro_rules.wasm';
    if (WebAssembly.instantiateStreaming) {
      try { return (await WebAssembly.instantiateStreaming(fetch(url), {})).instance; } catch (e) { /* máy chủ trả sai MIME: thử cách thường */ }
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error('wasm_fetch_' + r.status);
    return (await WebAssembly.instantiate(await r.arrayBuffer(), {})).instance;
  }

  /** Dựng API trên một instance đã nạp. */
  function makeApi(instance) {
    const E = instance.exports;
    const bufPtr = E.caro_buf(), bufCap = E.caro_buf_cap();
    let mem = null, i32 = null, u8 = null;
    // Bộ nhớ WASM lớn lên thì ArrayBuffer cũ bị tách rời: kiểm và tạo lại cửa sổ nhìn mỗi lần dùng
    const view = () => {
      if (mem !== E.memory.buffer) {
        mem = E.memory.buffer;
        i32 = new Int32Array(mem, bufPtr, bufCap);
        u8 = new Uint8Array(mem, bufPtr, bufCap * 4);
      }
      return i32;
    };
    const cellsOf = (n) => {
      if (!n) return null;
      const v = view(), out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = [v[2 * i], v[2 * i + 1]];
      return out;
    };
    const ruleId = (rule) => RULES.indexOf(ruleOf(rule));
    const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

    // ruleOf theo Rust: chuỗi ghi vào vùng đệm, Rust trả mã luật. Giá trị không phải chuỗi -> 'vn' như JS.
    function ruleOf(r) {
      if (typeof r !== 'string' || !enc) return RULES.includes(r) ? r : 'vn';
      const bytes = enc.encode(r);
      if (bytes.length > bufCap * 4) return 'vn';
      view(); u8.set(bytes, 0);
      return RULES[E.caro_rule_of(bytes.length)];
    }
    const key = (x, y) => E.caro_key(x, y);
    const other = (p) => 3 - p;

    // Bàn sống trong WASM; đối tượng JS chỉ giữ số hiệu h. Gọi free() khi xong (có FinalizationRegistry dự phòng).
    const reg = typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry((h) => E.caro_board_free(h)) : null;
    class Board {
      constructor(rule) {
        this.rule = ruleOf(rule);
        this.h = E.caro_board_new(RULES.indexOf(this.rule));
        if (reg) reg.register(this, this.h, this);
      }
      get(x, y) { return E.caro_get(this.h, x, y); }
      put(x, y, p) { E.caro_put(this.h, x, y, p); }
      remove(x, y) { E.caro_remove(this.h, x, y); }
      play(x, y, p) {
        const r = E.caro_play(this.h, x, y, p);
        if (r) throw new Error(PLAY_ERR[r] || 'bad_stone');
      }
      undo() {
        if (!E.caro_undo(this.h)) return undefined;
        const v = view();
        return { x: v[0], y: v[1], p: v[2] };
      }
      /** Danh sách nước {x, y, p} – đọc từ WASM mỗi lần gọi (nguồn sự thật nằm bên Rust). */
      get moves() {
        const n = E.caro_moves(this.h), v = view(), out = [];
        for (let i = 0; i < Math.min(n, bufCap / 3); i++) out.push({ x: v[3 * i], y: v[3 * i + 1], p: v[3 * i + 2] });
        return out;
      }
      free() {
        if (this.h < 0) return;
        if (reg) reg.unregister(this);
        E.caro_board_free(this.h);
        this.h = -1;
      }
    }

    const checkWin = (b, x, y, p) => cellsOf(E.caro_check_win(b.h, x, y, p));
    const lineWin = (b, x, y, dx, dy, p) => cellsOf(E.caro_line_win(b.h, x, y, dx, dy, p));
    const winsIfPlaced = (b, x, y, p) => E.caro_wins_if_placed(b.h, x, y, p) === 1;
    const forbidden = (b, x, y, p) => REASON[E.caro_forbidden(b.h, x, y, p)];
    const mayForbid = (b, x, y) => E.caro_may_forbid(b.h, x, y) === 1;
    const forbiddenRaw = (b, x, y) => REASON[E.caro_forbidden_raw(b.h, x, y)];
    // winLen nhận hai hàm hỏi đầu trống như JS; chỉ luật Việt Nam (và luật lạ) mới gọi chúng
    function winLen(rule, p, len, openA, openB) {
      const id = ['free', 'std', 'renju'].indexOf(rule);
      let a = 0, b = 0;
      if (id < 0) { a = openA() ? 1 : 0; b = openB() ? 1 : 0; }
      return E.caro_win_len(id < 0 ? 0 : id + 1, p, len, a, b) === 1;
    }

    /** Ghi dãy nước [[x,y], …] vào vùng đệm; trả về số nước. */
    function writeMoves(moves) {
      const n = moves.length;
      if (2 * n > bufCap) throw new Error('too_many_moves');
      const v = view();
      for (let i = 0; i < n; i++) { v[2 * i] = moves[i][0]; v[2 * i + 1] = moves[i][1]; }
      return n;
    }
    /** Không trạng thái: nước cuối của dãy có thắng không (theo luật rule)? Mảng ô thắng hoặc null. */
    function checkWinMoves(rule, moves) {
      const n = E.caro_check_win_moves(ruleId(rule), writeMoves(moves));
      if (n < 0) throw new Error('bad_moves');
      return cellsOf(n);
    }
    /** Không trạng thái: sau dãy nước, X đánh (x,y) có bị cấm không? Lý do hoặc null. */
    function forbiddenMoves(rule, moves, x, y) {
      const r = E.caro_forbidden_moves(ruleId(rule), writeMoves(moves), x, y);
      if (r < 0) throw new Error('bad_moves');
      return REASON[r];
    }

    return {
      EMPTY, X, O, DIRS, RULES, ruleOf, Board, key, other, lineWin, checkWin, winsIfPlaced, forbidden, winLen,
      checkWinMoves, forbiddenMoves, mayForbid, forbiddenRaw, exports: E,
    };
  }

  async function load(src) { return makeApi(await instantiate(src)); }

  const api = { load, makeApi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroRulesWasm = api;
})(typeof window !== 'undefined' ? window : globalThis);
