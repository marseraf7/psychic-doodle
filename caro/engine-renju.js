/*
 * Nước cấm Renju của X cho engine (cùng định nghĩa với rules.js: 3-3, 4-4, hàng dài; "ba" chỉ tính khi thành được bốn mở
 * hợp lệ – xét đệ quy có giới hạn). Gắn vào Position.prototype qua engine.js (CaroPosition.mixin).
 * Chạy được trên trình duyệt (window.CaroRenju), Web Worker và Node.
 */
(function (global) {
  'use strict';
  const CP = global.CaroPosition || (typeof require === 'function' ? require('./engine-position.js') : null);
  const { EMPTY, X, DX, DY } = CP.K;

  class RenjuMixin {
    // ---- nước cấm Renju cho X (cùng định nghĩa với rules.js)
    run(cx, cy, d) {
      const dx = DX[d], dy = DY[d];
      let a = 1; while (this.at(cx - a * dx, cy - a * dy) === X) a++;
      let b = 1; while (this.at(cx + b * dx, cy + b * dy) === X) b++;
      return a + b - 1;
    }
    /** X đã nằm ở (cx, cy): các ô k trên hướng d mà đánh vào thành đúng 5 (chuỗi chứa (cx, cy)). */
    fiveSpots(cx, cy, d) {
      const dx = DX[d], dy = DY[d], out = [];
      for (let k = -4; k <= 4; k++) {
        if (!k) continue;
        const x = cx + k * dx, y = cy + k * dy;
        if (this.at(x, y) !== EMPTY || x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
        const i = y * this.W + x;
        this.cells[i] = X;
        let a = 1; while (this.at(x - a * dx, y - a * dy) === X) a++;
        let b = 1; while (this.at(x + b * dx, y + b * dy) === X) b++;
        this.cells[i] = EMPTY;
        if (a + b - 1 === 5 && k - (a - 1) <= 0 && k + (b - 1) >= 0) out.push(k);
      }
      return out;
    }
    forbidAt(cx, cy, depth) {
      const i = cy * this.W + cx;
      this.cells[i] = X;
      let res = null;
      let five = false, over = false;
      for (let d = 0; d < 4; d++) { const n = this.run(cx, cy, d); if (n === 5) five = true; else if (n > 5) over = true; }
      if (!five) {
        if (over) res = 1;
        else {
          let fours = 0, threes = 0;
          for (let d = 0; d < 4 && fours < 2; d++) {
            const f = this.fiveSpots(cx, cy, d);
            const nf = f.length === 2 && Math.abs(f[1] - f[0]) === 5 ? 1 : f.length;
            fours += nf;
            if (!nf && threes < 2 && this.threeOn(cx, cy, d, depth)) threes++;
          }
          if (fours >= 2 || threes >= 2) res = 1;
        }
      }
      this.cells[i] = EMPTY;
      return res;
    }
    threeOn(cx, cy, d, depth) {
      const dx = DX[d], dy = DY[d];
      for (let k = -4; k <= 4; k++) {
        if (!k) continue;
        const x = cx + k * dx, y = cy + k * dy;
        if (this.at(x, y) !== EMPTY || x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
        const i = y * this.W + x;
        this.cells[i] = X;
        const f = this.fiveSpots(cx, cy, d);
        const straight = f.length === 2 && Math.abs(f[1] - f[0]) === 5 && this.run(x, y, d) === 4;
        this.cells[i] = EMPTY;
        if (straight && (depth <= 0 || !this.forbidAt(x, y, depth - 1))) return true;
      }
      return false;
    }
    /** Ô trống i có cấm với p không (chỉ Renju, chỉ X)? */
    forbidden(i, p) {
      if (this.rule !== 'renju' || p !== X) return false;
      const cx = i % this.W, cy = (i / this.W) | 0;
      // lọc nhanh như rules.js
      let lines = 0, maybe = false;
      for (let d = 0; d < 4 && !maybe; d++) {
        const dx = DX[d], dy = DY[d];
        let n = 0;
        for (let k = 1; k <= 4; k++) { const v = this.at(cx + k * dx, cy + k * dy); if (v === X) n++; else if (v !== EMPTY) break; }
        for (let k = 1; k <= 4; k++) { const v = this.at(cx - k * dx, cy - k * dy); if (v === X) n++; else if (v !== EMPTY) break; }
        if (n >= 3 || this.run(cx, cy, d) >= 6) maybe = true;
        else if (n >= 2 && ++lines >= 2) maybe = true;
      }
      return maybe && !!this.forbidAt(cx, cy, 2);
    }
    /** Bỏ các ô cấm khỏi danh sách (khi p là X theo luật Renju). */
    legal(list, p) { return this.rule === 'renju' && p === X ? list.filter((i) => !this.forbidden(i, p)) : list; }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { Mixin: RenjuMixin };
  else global.CaroRenju = { Mixin: RenjuMixin };
})(typeof window !== 'undefined' ? window : globalThis);
