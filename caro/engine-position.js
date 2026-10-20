/*
 * Thế cờ của engine (engine.js): bàn cờ mảng phẳng quanh vùng có quân (ngoài mảng coi là ô trống – bàn vô hạn), khoá
 * Zobrist, đi / lùi quân. Mỗi nước chỉ cập nhật dần những gì nó làm thay đổi: mã 11 ô của 44 (ô, hướng) trên 4 đường qua
 * ô vừa đánh → mẫu đường / mẫu chéo (engine-patterns.js, ý tưởng Rapfi / Wine), ô thắng (= mẫu F5) và số ô theo từng mẫu.
 * Các phần khác gắn vào Position.prototype trong engine.js (hub): luật Renju (engine-renju.js), chấm điểm (engine-eval.js),
 * sinh nước / đe doạ (engine-moves.js).
 * Chạy được trên trình duyệt (window.CaroPosition), Web Worker và Node.
 */
(function (global) {
  'use strict';
  const PT = global.CaroPatterns || (typeof require === 'function' ? require('./engine-patterns.js') : null);
  const EMPTY = 0, X = 1, O = 2;
  const DX = [1, 0, 1, 1], DY = [0, 1, 1, -1];
  const WIN = 1000000;            // điểm thắng (trừ dần theo số nước để thắng nhanh được ưu tiên)
  const MATE = WIN - 1000;        // điểm ≥ MATE: đã thấy thắng chắc
  const PAD = 8;                  // vùng trống quanh các quân trong mảng
  const SWAP = [0, 2, 1];         // đổi góc nhìn X ↔ O của một ô
  const F5 = PT.F5;
  const POW3 = [1, 3, 9, 27, 81, 243, 729, 2187, 6561, 19683, 59049];

  // Khoá Zobrist theo toạ độ thật của ô (không theo chỉ số trong mảng): cùng thế cờ → cùng khoá ở mọi Position, dù vùng
  // mảng khác nhau – bảng ghi nhớ dùng lại được giữa các nước của một ván (engine.js). Trộn bit kiểu murmur3 (fmix32).
  const mix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
  const zobAt = (x, y, k) => mix(mix(mix(k * 0x9e3779b9 + 0x7f4a7c15) ^ (x | 0)) + Math.imul(y | 0, 0x27d4eb2f));

  class Position {
    /** moves: [[x, y], …] – X đi trước, luân phiên. rule: 'vn' (mặc định) | 'free' | 'std' | 'renju'. */
    constructor(moves, rule) {
      this.rule = ['free', 'std', 'renju'].includes(rule) ? rule : 'vn';
      let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
      if (moves.length) {
        x0 = x1 = moves[0][0]; y0 = y1 = moves[0][1];
        for (const [x, y] of moves) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      this.ox = x0 - PAD; this.oy = y0 - PAD;
      this.W = x1 - x0 + 1 + 2 * PAD; this.H = y1 - y0 + 1 + 2 * PAD;
      const n = this.W * this.H;
      this.cells = new Int8Array(n);
      this.near = new Uint8Array(n);       // số quân trong ô vuông 5×5 quanh ô (ứng viên = ô trống có near > 0)
      this.win = [null, new Uint8Array(n), new Uint8Array(n)]; // ô thắng của X / O: 4 bit, mỗi bit một hướng
      this.winCount = [0, 0, 0];
      this.winSet = [null, new Set(), new Set()]; // các ô thắng (khỏi quét cả mảng)
      this.zob = [null, new Int32Array(n), new Int32Array(n), new Int32Array(n), new Int32Array(n)]; // lo/hi cho X, O
      for (let i = 0; i < n; i++) {
        const x = i % this.W + this.ox, y = (i / this.W | 0) + this.oy;
        this.zob[1][i] = zobAt(x, y, 1); this.zob[2][i] = zobAt(x, y, 2) & 0x1fffff; this.zob[3][i] = zobAt(x, y, 3); this.zob[4][i] = zobAt(x, y, 4) & 0x1fffff;
      }
      this.lo = 0; this.hi = 0;
      this.ev = this.weights(this.rule);   // trọng số chấm điểm của luật này (engine-eval.js)
      this.acc = new Float64Array(4);      // [công X, thủ X, công O, thủ O]: tổng trọng số cửa sổ của X / O (a… / d…)
      this.patOrder = true;                // xếp ứng viên theo mẫu đường (false: theo quickScore như cũ)
      this.policy = true;                  // xếp ứng viên theo chính sách học được (policy-data.js) nếu có
      this.style = { a: 1, d: 1, dbl: 0, trap: 0 }; // lối đánh (bots.js): trọng số thế mình / thế đối thủ, thưởng xếp nước
      // Mẫu đường (ô × 4 hướng) và mẫu chéo của mỗi ô trống cho X / O, kèm số ô theo từng mẫu chéo
      this.pat = [null, new Uint8Array(n * 4), new Uint8Array(n * 4)];
      this.keyX = new Int32Array(n * 4); // mã 11 ô của (ô, hướng) theo góc nhìn X – xem refreshWins
      this.p4 = [null, new Uint8Array(n), new Uint8Array(n)];
      this.p4cnt = [null, new Int32Array(13), new Int32Array(13)];
      this.ptab = [null, PT.table(this.rule, true), PT.table(this.rule, false, true)]; // bảng của O tra theo mã góc nhìn X
      this._stamp = new Int32Array(n); this._stampN = 1; this._touched = [];
      this.stack = [];
      this._line = new Int8Array(13);
      this.lazy = 0;                       // > 0: đang tìm chuỗi ép, không cập nhật điểm thế cờ
      this.evs = [];                       // từng nước đã đặt có cập nhật điểm không (để undo khớp)
      this.count = 0;
      this.ver = 0;                        // phiên bản bàn cờ: tăng mỗi lần đi / lùi (cho các bộ ghi nhớ theo thế, vd. nước cấm)
      for (const [x, y] of moves) this.play(this.idx(x, y), this.count % 2 ? O : X);
    }
    idx(x, y) { return (y - this.oy) * this.W + (x - this.ox); }
    xy(i) { return [i % this.W + this.ox, Math.floor(i / this.W) + this.oy]; }
    /** Ô i → một số theo toạ độ thật (để lưu nước vào bảng ghi nhớ dùng chung giữa các Position); unpack: ngược lại, −1 nếu ngoài mảng. */
    pack(i) { return (i % this.W + this.ox + 32768) * 65536 + ((i / this.W | 0) + this.oy + 32768); }
    unpack(c) {
      const x = Math.floor(c / 65536) - 32768 - this.ox, y = c % 65536 - 32768 - this.oy;
      return x < 0 || y < 0 || x >= this.W || y >= this.H ? -1 : y * this.W + x;
    }
    /** Ô theo toạ độ trong mảng (cx, cy là chỉ số cột / hàng); ngoài mảng = trống. */
    at(cx, cy) { return cx < 0 || cy < 0 || cx >= this.W || cy >= this.H ? EMPTY : this.cells[cy * this.W + cx]; }
    get key() { return this.hi * 4294967296 + (this.lo >>> 0); }
    get side() { return this.count % 2 ? O : X; }

    /** Đặt quân p tại (cx, cy) có thắng ngay theo hướng d không (đúng luật đang chơi, giống rules.js)? */
    winDir(cx, cy, p, d) {
      const dx = DX[d], dy = DY[d];
      let a = 1; while (this.at(cx - a * dx, cy - a * dy) === p) a++;
      let b = 1; while (this.at(cx + b * dx, cy + b * dy) === p) b++;
      const len = a + b - 1;
      if (len < 4) return false;
      switch (this.rule) {
        case 'free': return len >= 5;
        case 'std': return len === 5;
        case 'renju': return p === X ? len === 5 : len >= 5;
      }
      const openA = this.at(cx - a * dx, cy - a * dy) === EMPTY, openB = this.at(cx + b * dx, cy + b * dy) === EMPTY;
      return (len >= 5 && (openA || openB)) || (openA && openB);
    }

    // ---- cập nhật ô thắng trên 4 đường qua (cx, cy): ô khác trên đường d chỉ có thể đổi theo hướng d
    refreshWins(cx, cy, p, sign) {
      // Mỗi (ô, hướng) giữ sẵn mã 11 ô quanh nó (cơ số 3; quân ở độ lệch j so với ô có trọng số 3^(5+j)) theo góc nhìn X
      // (chữ số = giá trị ô): đặt / lùi quân p ở (cx, cy) chỉ cộng / trừ một chữ số vào mã của 11 ô trên mỗi đường. Mẫu đường
      // của ô trống tra bảng theo mã (engine-patterns.js; bảng của O tra thẳng mã góc nhìn X – khỏi giữ mã thứ hai); ô thắng =
      // mẫu F5 (khớp winDir, đã kiểm trên ván thật).
      const W = this.W, H = this.H, rule = this.rule, cells = this.cells;
      const patX = this.pat[X], patO = this.pat[O], tX = this.ptab[X], tO = this.ptab[O], keyX = this.keyX;
      const stamp = this._stamp, sn = this._stampN, touched = this._touched;
      const vx = sign * p;
      for (let d = 0; d < 4; d++) {
        const dx = DX[d], dy = DY[d], bit = 1 << d, step = dy * W + dx;
        // Khoảng k còn trong mảng (tính một lần thay vì kiểm từng ô)
        let k0 = -5, k1 = 5;
        if (dx) { if (-cx > k0) k0 = -cx; if (W - 1 - cx < k1) k1 = W - 1 - cx; }
        if (dy > 0) { if (-cy > k0) k0 = -cy; if (H - 1 - cy < k1) k1 = H - 1 - cy; } else if (dy < 0) { if (cy - H + 1 > k0) k0 = cy - H + 1; if (cy < k1) k1 = cy; }
        for (let k = k0, i = (cy + k0 * dy) * W + cx + k0 * dx; k <= k1; k++, i += step) {
          const pi = i * 4 + d, w = POW3[5 - k];
          const kx = (keyX[pi] += vx * w);
          let px = 0, po = 0;
          if (cells[i] === EMPTY) {
            px = tX[kx]; if (px < 0) px = PT.lookup(tX, kx, rule, true);
            po = tO[kx]; if (po < 0) po = PT.lookup(tO, kx, rule, false, true);
          }
          const ox = patX[pi], oo = patO[pi];
          // Mẫu không đổi thì ô thắng / mẫu chéo của ô này (theo hướng d) cũng không đổi: bỏ qua
          if (ox === px && oo === po && k) continue;
          patX[pi] = px; patO[pi] = po;
          if ((ox === F5) !== (px === F5)) this.setWin(X, i, bit, px === F5);
          if ((oo === F5) !== (po === F5)) this.setWin(O, i, bit, po === F5);
          if (stamp[i] !== sn) { stamp[i] = sn; touched.push(i); }
        }
      }
      this.refreshP4();
    }
    /** Bật / tắt bit hướng của ô thắng i cho p, giữ winCount / winSet. */
    setWin(p, i, bit, on) {
      const w = this.win[p], was = w[i], now = on ? was | bit : was & ~bit;
      if (now === was) return;
      w[i] = now;
      if (!was) { this.winCount[p]++; this.winSet[p].add(i); } else if (!now) { this.winCount[p]--; this.winSet[p].delete(i); }
    }
    /** Tính lại mẫu chéo của các ô vừa đổi mẫu đường (this._touched) và bộ đếm theo mẫu chéo. */
    refreshP4() {
      const T = this._touched, cells = this.cells, CB = PT.COMBO;
      for (let p = 1; p <= 2; p++) {
        const pt = this.pat[p], p4 = this.p4[p], cnt = this.p4cnt[p];
        for (let t = 0; t < T.length; t++) {
          const i = T[t], b = i * 4;
          // (Renju: ô cấm của X không loại ở đây – trạng thái cấm phụ thuộc cả quân ở xa; nơi dùng tự lọc bằng legal())
          const v = cells[i] !== EMPTY ? 0 : CB[pt[b] * 729 + pt[b + 1] * 81 + pt[b + 2] * 9 + pt[b + 3]];
          const old = p4[i];
          if (old !== v) { p4[i] = v; cnt[old]--; cnt[v]++; }
        }
      }
      T.length = 0;
      this._stampN++;
    }
    play(i, p) {
      const cx = i % this.W, cy = (i / this.W) | 0;
      // Trong lúc tìm chuỗi ép (lazy > 0) không cần điểm thế cờ: bỏ qua phần tính điểm (undo cũng bỏ qua theo evs)
      const ev = !this.lazy;
      if (ev) this.windowsSwap(cx, cy, p);
      this.cells[i] = p;
      this.evs.push(ev);
      if (p === X) { this.lo ^= this.zob[1][i]; this.hi ^= this.zob[2][i]; } else { this.lo ^= this.zob[3][i]; this.hi ^= this.zob[4][i]; }
      for (let y = Math.max(0, cy - 2); y <= Math.min(this.H - 1, cy + 2); y++) {
        for (let x = Math.max(0, cx - 2); x <= Math.min(this.W - 1, cx + 2); x++) this.near[y * this.W + x]++;
      }
      this.refreshWins(cx, cy, p, 1);
      this.ver++;
      this.stack.push(i);
      this.count++;
    }
    undo() {
      const i = this.stack.pop();
      const p = this.cells[i];
      const cx = i % this.W, cy = (i / this.W) | 0;
      if (this.evs.pop()) this.windowsSwap(cx, cy, EMPTY);
      this.cells[i] = EMPTY;
      if (p === X) { this.lo ^= this.zob[1][i]; this.hi ^= this.zob[2][i]; } else { this.lo ^= this.zob[3][i]; this.hi ^= this.zob[4][i]; }
      for (let y = Math.max(0, cy - 2); y <= Math.min(this.H - 1, cy + 2); y++) {
        for (let x = Math.max(0, cx - 2); x <= Math.min(this.W - 1, cx + 2); x++) this.near[y * this.W + x]--;
      }
      this.refreshWins(cx, cy, p, -1);
      this.ver++;
      this.count--;
    }

    /** Các ô thắng hiện có của p. */
    winCells(p) {
      if (!this.winCount[p]) return [];
      return Array.from(this.winSet[p]).sort((a, b) => a - b); // theo thứ tự ô như trước
    }

  }

  /** Gắn các phương thức của lớp M vào lớp Target (như hub của máy chủ: trùng tên thì báo lỗi ngay khi nạp). */
  function mixin(Target, M) {
    for (const k of Object.getOwnPropertyNames(M.prototype)) {
      if (k === 'constructor') continue;
      if (Object.prototype.hasOwnProperty.call(Target.prototype, k)) throw new Error('engine: trùng phương thức ' + k);
      Object.defineProperty(Target.prototype, k, Object.getOwnPropertyDescriptor(M.prototype, k));
    }
  }

  const CaroPosition = { Position, mixin, K: { EMPTY, X, O, DX, DY, WIN, MATE, SWAP, POW3 } };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroPosition;
  else global.CaroPosition = CaroPosition;
})(typeof window !== 'undefined' ? window : globalThis);
