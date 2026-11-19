/*
 * So sánh caro/rules.js (C) với bản Rust/WASM (W, js/rules-wasm.js) trên cùng một thế cờ.
 * Hai bàn jb (JS) và wb (WASM) luôn được giữ giống nhau. Mỗi thế kiểm:
 *  - checkWin của nước vừa đánh (người thắng + đúng các ô của chuỗi),
 *  - winsIfPlaced cho X và O ở mọi ô trống trong bán kính 2 quanh nước vừa đánh,
 *  - forbidden (cờ cấm Renju) cho X ở MỌI ô trống trong bán kính 2 quanh bất kỳ quân nào; với O và với các luật
 *    khác thì kiểm các ô quanh nước vừa đánh (phải cùng ra null),
 *  - bàn không bị đổi sau các phép đặt thử (đọc lại các ô ứng viên ở cả hai bên).
 * Ngoài ra "soát bước lọc": forbiddenAt không qua mayForbid (chỉ bên Rust) – nếu khác kết quả có lọc nghĩa là
 * mayForbid của rules.js bỏ sót một nước cấm (lỗi của chính rules.js, không phải sai khác JS ↔ Rust).
 */
'use strict';

const REASONS = ['overline', '44', '33'];

class Checker {
  constructor(C, W, opts) {
    this.C = C; this.W = W;
    this.maxDiffs = (opts && opts.maxDiffs) || 20;
    this.stats = {};
    this.diffs = [];
    this.prefilterMiss = [];
    this.totalDiffs = 0;
  }

  st(rule) {
    if (!this.stats[rule]) {
      this.stats[rule] = { positions: 0, checkWin: 0, wins: 0, winsIfPlaced: 0, winsIfPlacedTrue: 0, forbidden: 0, raw: 0,
        reasons: { overline: 0, '44': 0, '33': 0 }, playErrors: 0, undo: 0, diffs: 0 };
    }
    return this.stats[rule];
  }

  /** Ghi một sai khác (giữ tối đa maxDiffs mẫu kèm thế cờ để tái hiện). */
  diff(rule, kind, at, js, wasm, stones) {
    this.totalDiffs++; this.st(rule).diffs++;
    if (this.diffs.length < this.maxDiffs) this.diffs.push({ rule, kind, at, js, wasm, stones: stones.slice() });
  }

  /** Đánh cùng một nước trên hai bàn; so cả lỗi ném ra. Trả về true nếu nước hợp lệ. */
  play(rule, jb, wb, x, y, p, stones) {
    let ej = null, ew = null;
    try { jb.play(x, y, p); } catch (e) { ej = e.message; }
    try { wb.play(x, y, p); } catch (e) { ew = e.message; }
    if (ej !== ew) this.diff(rule, 'play-error', [x, y, p], ej, ew, stones);
    if (ej) this.st(rule).playErrors++;
    return !ej && !ew;
  }

  /** Lùi rồi đánh lại nước cuối trên hai bàn, so nước trả về. */
  undoRedo(rule, jb, wb, stones) {
    const mj = jb.undo(), mw = wb.undo();
    if (JSON.stringify(mj) !== JSON.stringify(mw)) this.diff(rule, 'undo', null, mj, mw, stones);
    this.st(rule).undo++;
    if (mj) jb.play(mj.x, mj.y, mj.p);
    if (mw) wb.play(mw.x, mw.y, mw.p);
  }

  cmpWin(rule, jb, wb, x, y, p, stones) {
    const s = this.st(rule);
    const cj = this.C.checkWin(jb, x, y, p), cw = this.W.checkWin(wb, x, y, p);
    s.checkWin++;
    if (cj) s.wins++;
    if (JSON.stringify(cj) !== JSON.stringify(cw)) this.diff(rule, 'checkWin', [x, y, p], cj, cw, stones);
  }

  cmpPlace(rule, jb, wb, x, y, stones) {
    const s = this.st(rule);
    for (const q of [1, 2]) {
      const a = this.C.winsIfPlaced(jb, x, y, q), b = this.W.winsIfPlaced(wb, x, y, q);
      s.winsIfPlaced++;
      if (a) s.winsIfPlacedTrue++;
      if (a !== b) this.diff(rule, 'winsIfPlaced', [x, y, q], a, b, stones);
    }
  }

  cmpForbid(rule, jb, wb, x, y, p, stones, audit) {
    const s = this.st(rule);
    const a = this.C.forbidden(jb, x, y, p), b = this.W.forbidden(wb, x, y, p);
    s.forbidden++;
    if (a) s.reasons[a]++;
    if (a !== b) this.diff(rule, 'forbidden', [x, y, p], a, b, stones);
    if (audit && rule === 'renju' && p === 1 && jb.get(x, y) === 0) {
      s.raw++;
      const raw = this.W.forbiddenRaw(wb, x, y);
      if (raw !== b && this.prefilterMiss.length < this.maxDiffs) this.prefilterMiss.push({ at: [x, y], filtered: b, raw, stones: stones.slice() });
    }
  }

  /** Các ô trống trong bán kính r quanh (x,y). */
  around(jb, x, y, r) {
    const out = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if ((dx || dy) && jb.get(x + dx, y + dy) === 0) out.push([x + dx, y + dy]);
    return out;
  }

  /** Thế trong một ván: (x,y,p) vừa đánh; cand: Map khóa -> [x,y] các ô trống gần quân; stones: các nước đến giờ. */
  position(rule, jb, wb, last, cand, stones) {
    this.st(rule).positions++;
    const [x, y, p] = last;
    this.cmpWin(rule, jb, wb, x, y, p, stones);
    const near = this.around(jb, x, y, 2);
    for (const [cx, cy] of near) {
      this.cmpPlace(rule, jb, wb, cx, cy, stones);
      this.cmpForbid(rule, jb, wb, cx, cy, 2, stones, false);
      if (rule !== 'renju') this.cmpForbid(rule, jb, wb, cx, cy, 1, stones, false);
    }
    if (rule === 'renju') {
      const nearSet = new Set(near.map(([a, b]) => a + ',' + b));
      for (const [cx, cy] of cand.values()) this.cmpForbid(rule, jb, wb, cx, cy, 1, stones, nearSet.has(cx + ',' + cy));
    }
    this.cmpBoard(rule, jb, wb, cand, stones);
  }

  /** Thế đặt tay (không có "nước vừa đánh"): kiểm thắng ở mọi quân, đặt thử / cấm ở mọi ô ứng viên. */
  staticPosition(rule, jb, wb, cand, stones) {
    this.st(rule).positions++;
    for (const [x, y, p] of stones) this.cmpWin(rule, jb, wb, x, y, p, stones);
    for (const [cx, cy] of cand.values()) {
      this.cmpPlace(rule, jb, wb, cx, cy, stones);
      for (const q of [1, 2]) this.cmpForbid(rule, jb, wb, cx, cy, q, stones, true);
    }
    this.cmpBoard(rule, jb, wb, cand, stones);
  }

  /** Hai bàn vẫn giống nhau ở các ô ứng viên và các quân (phát hiện đặt thử mà quên gỡ). */
  cmpBoard(rule, jb, wb, cand, stones) {
    for (const [cx, cy] of cand.values()) {
      if (jb.get(cx, cy) !== 0 || wb.get(cx, cy) !== 0) this.diff(rule, 'board-dirty', [cx, cy], jb.get(cx, cy), wb.get(cx, cy), stones);
    }
    const [x, y] = stones.length ? stones[stones.length - 1] : [0, 0];
    if (jb.get(x, y) !== wb.get(x, y)) this.diff(rule, 'board', [x, y], jb.get(x, y), wb.get(x, y), stones);
  }
}

/** Cập nhật tập ô ứng viên (trống, cách quân <= 2) sau khi có quân ở (x,y). */
function addStone(C, jb, cand, x, y) {
  cand.delete(C.key(x, y));
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const cx = x + dx, cy = y + dy;
      if (jb.get(cx, cy) === 0) cand.set(C.key(cx, cy), [cx, cy]);
    }
  }
}

module.exports = { Checker, addStone, REASONS };
