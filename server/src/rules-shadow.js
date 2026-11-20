/*
 * Chạy bóng (shadow) lõi luật Rust trên máy chủ thật – docs/thi-diem-rust-luat-choi.md, mục 8.
 *
 * Mỗi lần Room.move (room.js) quyết định một nước, máy chủ tính lại cùng kết quả bằng bản Rust/WASM
 * (server/vendor/caro_rules.wasm, dựng từ core/caro-rules) rồi so với kết quả của caro/rules.js:
 *   - nước được đặt: cờ cấm Renju trước khi đặt (JS cho qua = null) + checkWin sau khi đặt (người thắng + đúng
 *     từng ô của chuỗi, đúng thứ tự);
 *   - nước bị từ chối vì cấm (JS báo 'overline' / '44' / '33'): bản Rust phải báo cùng lý do.
 * JS luôn là bản quyết định: chạy bóng chỉ đếm và ghi lại chỗ khác nhau, KHÔNG BAO GIỜ đổi diễn biến ván.
 *
 * An toàn:
 *   - mọi lỗi trong đường chạy bóng bị bắt và đếm (errors), không ném ra phần xử lý ván;
 *   - không nạp được file .wasm thì tự tắt (state 'unavailable'), ghi log đúng một lần;
 *   - biến môi trường CARO_RULES_SHADOW=0 tắt hẳn (mặc định bật).
 * Cách tính: mỗi lần kiểm dựng lại một bàn Rust từ danh sách nước của JS rồi giải phóng ngay – không giữ bàn Rust
 * theo phòng, nên đi lại, Swap2, tái đấu, làm mới phòng không cần xử lý riêng và không rò bộ nhớ WASM.
 * Số đo (stats): { checked, mismatches, errors, avgMicros, maxMicros, … } + tối đa 20 chỗ khác nhau gần nhất
 * (luật + dãy nước + kết quả JS / Rust, không có tên hay id người chơi). Xem qua GET /api/rum (mục rulesShadow).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const WASM_FILE = path.join(__dirname, '..', 'vendor', 'caro_rules.wasm');
const LOADER = path.join(__dirname, '..', '..', 'core', 'caro-rules', 'js', 'rules-wasm.js');
const KEEP = 20; // số chỗ khác nhau gần nhất giữ lại
const LOG_GAP_MS = 10000; // console.error tối đa 1 dòng / 10 giây

/** Bộ tính bằng WASM: compute(rule, moves, n, x, y, side, applied) -> { forbidden, cells }. Ném lỗi nếu không nạp được. */
function wasmEngine(file = WASM_FILE) {
  // Nạp đồng bộ (Node cho phép biên dịch đồng bộ file nhỏ ~42 KB): không phải chờ trước khi phòng đầu tiên chạy
  const R = require(LOADER).loadSync(fs.readFileSync(file));
  const E = R.exports;
  return {
    compute(rule, moves, n, x, y, side, applied) {
      const h = E.caro_board_new(R.RULES.indexOf(rule));
      const b = { h };
      try {
        for (let i = 0; i < n; i++) {
          const m = moves[i];
          if (E.caro_play(h, m.x, m.y, m.p)) throw new Error('replay_failed');
        }
        const forbidden = R.forbidden(b, x, y, side);
        if (!applied) return { forbidden, cells: null };
        if (E.caro_play(h, x, y, side)) throw new Error('play_failed');
        return { forbidden, cells: R.checkWin(b, x, y, side) };
      } finally {
        E.caro_board_free(h);
      }
    },
  };
}

const sameCells = (a, b) => {
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  return true;
};
const cellsOut = (c) => (c ? c.map(([x, y]) => [x, y]) : null);

class RulesShadow {
  /**
   * enabled: mặc định theo CARO_RULES_SHADOW (khác '0' là bật). engine: bộ tính có sẵn (bài thử cài bộ giả);
   * không có thì nạp WASM từ wasmFile ở lần kiểm đầu tiên. log: nơi ghi lỗi (mặc định console.error).
   */
  constructor({ enabled = process.env.CARO_RULES_SHADOW !== '0', engine = null, wasmFile = WASM_FILE, log = console.error, now = Date.now } = {}) {
    this.enabled = !!enabled;
    this.engine = engine;
    this.wasmFile = wasmFile;
    this.log = log;
    this.now = now;
    this.state = !this.enabled ? 'off' : engine ? 'on' : 'idle'; // 'idle' = chưa nạp (nạp ở lần kiểm đầu)
    this.reset();
  }

  reset() {
    this.checked = 0; // số lần đã so (nước đặt + nước bị từ chối vì cấm)
    this.rejected = 0; // trong đó: số nước JS từ chối vì cấm
    this.wins = 0; // số nước thắng JS báo (đã so cả chuỗi ô)
    this.mismatches = 0;
    this.errors = 0;
    this.totalNs = 0;
    this.maxNs = 0;
    this.recent = [];
    this.lastError = null;
    this.logAt = -Infinity;
    this.suppressed = 0;
    this.since = this.now();
  }

  /** Nạp bộ tính WASM nếu chưa có. Trả về false (và tự tắt, log một lần) nếu không nạp được. */
  ready() {
    if (this.state === 'on') return true;
    if (this.state !== 'idle') return false;
    try {
      this.engine = wasmEngine(this.wasmFile);
      this.state = 'on';
      return true;
    } catch (e) {
      this.state = 'unavailable';
      this.lastError = String((e && e.message) || e).slice(0, 200);
      try { this.log(`[rules-shadow] không nạp được ${path.basename(this.wasmFile)} (${this.lastError}) – tắt chạy bóng luật Rust`); } catch (_) { /* bỏ qua */ }
      return false;
    }
  }

  /**
   * So một quyết định của JS với bản Rust. Không bao giờ ném lỗi.
   *  rule: luật của phòng ('vn' | 'free' | 'std' | 'renju'); moves: board.moves của JS ({x, y, p});
   *  applied: true = nước (x, y) đã được đặt (là phần tử cuối của moves), false = bị từ chối vì cấm (chưa đặt);
   *  jsForbidden: lý do cấm JS trả về (null nếu cho qua); jsCells: kết quả checkWin của JS (null nếu chưa thắng).
   */
  observe(rule, moves, applied, x, y, side, jsForbidden, jsCells) {
    try {
      if (!this.enabled || !this.ready()) return;
      const t0 = process.hrtime.bigint();
      const n = applied ? moves.length - 1 : moves.length;
      const rust = this.engine.compute(rule, moves, n, x, y, side, applied);
      const js = { forbidden: jsForbidden || null, cells: applied ? jsCells || null : null };
      const ok = (rust.forbidden || null) === js.forbidden && sameCells(rust.cells, js.cells);
      const ns = Number(process.hrtime.bigint() - t0);
      this.checked++;
      if (!applied) this.rejected++;
      if (js.cells) this.wins++;
      this.totalNs += ns;
      if (ns > this.maxNs) this.maxNs = ns;
      if (!ok) this.mismatch(rule, moves, n, x, y, side, applied, js, rust);
    } catch (e) {
      this.errors++;
      try { this.lastError = String((e && e.message) || e).slice(0, 200); } catch (_) { /* bỏ qua */ }
    }
  }

  /** Ghi lại một chỗ khác nhau (giữ KEEP chỗ gần nhất) và báo console.error (tối đa 1 dòng / LOG_GAP_MS). */
  mismatch(rule, moves, n, x, y, side, applied, js, rust) {
    this.mismatches++;
    const rec = {
      at: new Date(this.now()).toISOString(),
      rule,
      moves: moves.slice(0, n).map((m) => [m.x, m.y]), // các nước TRƯỚC nước đang xét (X đi trước, xen kẽ)
      move: [x, y],
      side,
      applied,
      js: { forbidden: js.forbidden, cells: cellsOut(js.cells) },
      rust: { forbidden: rust.forbidden || null, cells: cellsOut(rust.cells) },
    };
    this.recent.push(rec);
    if (this.recent.length > KEEP) this.recent.shift();
    const now = this.now();
    if (now - this.logAt < LOG_GAP_MS) { this.suppressed++; return; }
    this.logAt = now;
    const more = this.suppressed ? ` (+${this.suppressed} lần chưa báo)` : '';
    this.suppressed = 0;
    try {
      this.log(`[rules-shadow] JS và Rust khác nhau${more}: ${rule} nước ${n + 1} (${x},${y}) quân ${side} – ` +
        `JS ${JSON.stringify(rec.js)} / Rust ${JSON.stringify(rec.rust)}`);
    } catch (_) { /* bỏ qua */ }
  }

  /** Số đo chỉ đọc (bản sao): dùng cho GET /api/rum. */
  stats() {
    const us = (ns) => Math.round(ns / 100) / 10; // ns -> µs, 1 chữ số thập phân
    return {
      enabled: this.enabled,
      state: this.state, // 'off' | 'idle' | 'on' | 'unavailable'
      checked: this.checked,
      rejected: this.rejected,
      wins: this.wins,
      mismatches: this.mismatches,
      errors: this.errors,
      avgMicros: this.checked ? us(this.totalNs / this.checked) : 0,
      maxMicros: us(this.maxNs),
      since: this.since,
      lastError: this.lastError,
      recent: this.recent.map((r) => structuredClone(r)),
    };
  }
}

// Một bản dùng chung cho cả máy chủ; bài thử thay bằng use() rồi trả lại bản cũ.
let current = new RulesShadow();
const shadow = () => current;
function use(s) { const old = current; current = s; return old; }

module.exports = { RulesShadow, wasmEngine, shadow, use, WASM_FILE };
