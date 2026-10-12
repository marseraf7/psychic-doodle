/*
 * Engine phân tích Caro (luật Việt Nam + Gomoku tự do / tiêu chuẩn / Renju), tự viết – học ý tưởng từ các engine Gomoku mạnh (Rapfi, AlphaGomoku,
 * KataGomo…) nhưng không dùng mã nguồn của họ.
 *
 * Luật (giống rules.js): hàng ≥ 5 quân thắng nếu còn ít nhất một đầu trống; 4 quân liền mà hai đầu đều trống thắng ngay;
 * hàng bị chặn cả hai đầu không bao giờ thắng. Hệ quả: 3 quân không bị chặn đã là đe doạ thắng (thêm 1 quân là thắng),
 * nên "chuỗi ép" ở đây gồm cả nước tạo thế 3 lẫn thế 4.
 *
 * Kỹ thuật:
 *  - Bàn cờ mảng phẳng quanh vùng có quân (đọc ra ngoài coi là ô trống – bàn cờ vô hạn), khoá Zobrist.
 *  - Ô thắng của từng bên được cập nhật dần sau mỗi nước (chỉ xét 4 đường qua ô vừa đánh).
 *  - Điểm thế cờ cập nhật dần: cửa sổ 5 ô (hàng bị chặn hai đầu = 0 điểm) + cửa sổ 6 ô hai đầu trống (thế 2, thế 3 mở).
 *  - Negamax Alpha-Beta (PVS) làm sâu dần, bảng ghi nhớ thế cờ, nước sát thủ, chỉ xét các ứng viên tốt nhất.
 *  - Bị đe doạ thắng: chỉ xét các nước chặn được hết; chỉ còn 1 nước chặn thì tìm sâu thêm.
 *  - Tìm tiếp ở lá (quiescence) = tìm chuỗi ép: bên công chỉ đi nước tạo ô thắng, bên thủ thử mọi cách chặn.
 * Chạy trên trình duyệt (window.CaroEngine), Web Worker và Node.
 */
(function (global) {
  'use strict';
  const EMPTY = 0, X = 1, O = 2;
  const DX = [1, 0, 1, 1], DY = [0, 1, 1, -1];
  const WIN = 1000000;            // điểm thắng (trừ dần theo số nước để thắng nhanh được ưu tiên)
  const MATE = WIN - 1000;        // điểm ≥ MATE: đã thấy thắng chắc
  const PAD = 8;                  // vùng trống quanh các quân trong mảng
  // Trọng số chấm điểm thế cờ theo từng luật. Cửa sổ 5 ô một màu có k quân → a5[k] nếu là quân của bên tới lượt
  // ("thế của mình"), d5[k] nếu là quân đối thủ ("thế của đối thủ"); cửa sổ 6 ô hai đầu trống, 4 ô giữa một màu: a6 / d6.
  // tempo: lợi thế được đi. Bộ 'base' là bộ cũ (công = thủ); các luật khác được học từ ván Gomocup bằng
  // server/scripts/tune-eval.js (Texel tuning) và kiểm lại bằng tự đấu (server/scripts/bot-match.js).
  const W5 = [0, 2, 12, 60, 450, 0];
  const W6 = [0, 0, 24, 420, 0];
  const EVAL = {
    base: { a5: W5, d5: W5, a6: W6, d6: W6, tempo: 30 },
    // Học từ ván Gomocup 2016–2025 (server/scripts/tune-eval.js); luật Việt Nam thêm vòng tự đấu – học lại (selfplay.js)
    free: { a5: [0, 8, 44, 117, 450, 0], d5: [0, 8, 36, 110, 450, 0], a6: [0, 0, 28, 420, 0], d6: [0, 0, 13, 72, 0], tempo: 135 },
    std: { a5: [0, 11, 49, 87, 450, 0], d5: [0, 9, 40, 98, 450, 0], a6: [0, 0, 0, 420, 0], d6: [0, 0, 0, 97, 0], tempo: 96 },
    renju: { a5: [0, 6, 40, 82, 450, 0], d5: [0, 5, 29, 105, 450, 0], a6: [0, 0, 0, 420, 0], d6: [0, 0, 0, 75, 0], tempo: 109 },
    vn: { a5: [0, 3, 0, 170, 450, 0], d5: [0, 0, 54, 22, 450, 0], a6: [0, 0, 151, 420, 0], d6: [0, 0, 0, 420, 0], tempo: 120 },
  };
  const evalOf = (rule) => EVAL[rule] || EVAL[rule === 'vn' ? 'vn' : 'base'] || EVAL.base;

  // Bộ sinh số giả ngẫu nhiên cố định (khoá Zobrist giống nhau mọi lần chạy)
  let seed = 0x9e3779b9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };

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
      for (let i = 0; i < n; i++) { this.zob[1][i] = rnd(); this.zob[2][i] = rnd() & 0x1fffff; this.zob[3][i] = rnd(); this.zob[4][i] = rnd() & 0x1fffff; }
      this.lo = 0; this.hi = 0;
      this.ev = evalOf(this.rule);         // trọng số chấm điểm của luật này
      this.acc = new Float64Array(4);      // [công X, thủ X, công O, thủ O]: tổng trọng số cửa sổ của X / O (a… / d…)
      this.style = { a: 1, d: 1, dbl: 0, trap: 0 }; // lối đánh (bots.js): trọng số thế mình / thế đối thủ, thưởng xếp nước
      this.stack = [];
      this._line = new Int8Array(13);
      this._wline = new Int8Array(25);
      this.lazy = 0;                       // > 0: đang tìm chuỗi ép, không cập nhật điểm thế cờ
      this.evs = [];                       // từng nước đã đặt có cập nhật điểm không (để undo khớp)
      this.count = 0;
      for (const [x, y] of moves) this.play(this.idx(x, y), this.count % 2 ? O : X);
    }
    idx(x, y) { return (y - this.oy) * this.W + (x - this.ox); }
    xy(i) { return [i % this.W + this.ox, Math.floor(i / this.W) + this.oy]; }
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
    /** Đặt quân p tại (cx, cy) có thắng ngay không? Ô phải đang trống. */
    wouldWin(cx, cy, p) {
      return this.winDir(cx, cy, p, 0) || this.winDir(cx, cy, p, 1) || this.winDir(cx, cy, p, 2) || this.winDir(cx, cy, p, 3);
    }
    /** Quân p vừa nằm ở ô i: đã thắng chưa? */
    isWinAt(i, p) {
      const cx = i % this.W, cy = (i / this.W) | 0;
      this.cells[i] = EMPTY;
      const w = this.wouldWin(cx, cy, p);
      this.cells[i] = p;
      return w;
    }

    // ---- điểm thế cờ: các cửa sổ chịu ảnh hưởng khi ô (cx, cy) đổi
    /** Cộng (sign = +1) hoặc trừ (sign = -1) điểm các cửa sổ qua (cx, cy) vào this.acc. */
    windowsAround(cx, cy, sign) {
      // Đọc 13 ô trên mỗi đường một lần rồi trượt cửa sổ (nhanh hơn nhiều so với đọc lại từng cửa sổ)
      // Cửa sổ 5 ô: một màu, k quân (luật Việt Nam: bị chặn hai đầu = 0); cửa sổ 6 ô hai đầu trống, 4 ô giữa một màu
      const L = this._line, vn = this.rule === 'vn', acc = this.acc, E = this.ev;
      const a5 = E.a5, d5 = E.d5, a6 = E.a6, d6 = E.d6;
      for (let d = 0; d < 4; d++) {
        const dx = DX[d], dy = DY[d];
        for (let k = -6; k <= 6; k++) L[k + 6] = this.at(cx + k * dx, cy + k * dy);
        // Cửa sổ 5 ô L[b..b+4], b = 1..7 (đầu ngoài: L[b-1], L[b+5])
        let x = 0, o = 0;
        for (let k = 1; k <= 5; k++) { const v = L[k]; if (v === X) x++; else if (v === O) o++; }
        for (let b = 1; b <= 7; b++) {
          if (b > 1) {
            const out = L[b - 1], inn = L[b + 4];
            if (out === X) x--; else if (out === O) o--;
            if (inn === X) x++; else if (inn === O) o++;
          }
          if ((x && o) || (!x && !o)) continue;
          const q = x ? O : X;
          if (vn && L[b - 1] === q && L[b + 5] === q) continue; // luật Việt Nam: bị chặn hai đầu
          if (x) { acc[0] += sign * a5[x]; acc[1] += sign * d5[x]; } else { acc[2] += sign * a5[o]; acc[3] += sign * d5[o]; }
        }
        // Cửa sổ 6 ô L[b..b+5], b = 1..6: hai đầu trống, 4 ô giữa một màu
        for (let b = 1; b <= 6; b++) {
          if (L[b] !== EMPTY || L[b + 5] !== EMPTY) continue;
          let x6 = 0, o6 = 0;
          for (let k = 1; k < 5; k++) { const v = L[b + k]; if (v === X) x6++; else if (v === O) o6++; }
          if ((x6 && o6) || (!x6 && !o6)) continue;
          if (x6) { acc[0] += sign * a6[x6]; acc[1] += sign * d6[x6]; } else { acc[2] += sign * a6[o6]; acc[3] += sign * d6[o6]; }
        }
      }
    }
    /** Điểm theo góc nhìn X với trọng số công (để tương thích: bộ 'base' công = thủ nên bằng điểm cũ). */
    get evalX() { return this.acc[0] - this.acc[2]; }

    // ---- cập nhật ô thắng trên 4 đường qua (cx, cy): ô khác trên đường d chỉ có thể đổi theo hướng d
    refreshWins(cx, cy) {
      // Đọc 25 ô trên mỗi đường một lần (L[12] = ô vừa đổi), rồi xét lại 11 ô k = -5..5 như winDir
      const L = this._wline, W = this.W, H = this.H;
      for (let d = 0; d < 4; d++) {
        const dx = DX[d], dy = DY[d], bit = 1 << d;
        this.readLine(cx, cy, dx, dy, L);
        for (let k = -5; k <= 5; k++) {
          const x = cx + k * dx, y = cy + k * dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = y * W + x, c = k + 12, empty = L[c] === EMPTY;
          const lft = L[c - 1], rgt = L[c + 1];
          for (let p = 1; p <= 2; p++) {
            const w = this.win[p], was = w[i];
            // Ô thắng phải kề quân p trên hướng này (lọc nhanh trước khi đếm hàng)
            const on = empty && (lft === p || rgt === p) && this.winLine(L, c, p);
            const now = on ? was | bit : was & ~bit;
            if (now !== was) { w[i] = now; if (!was) { this.winCount[p]++; this.winSet[p].add(i); } else if (!now) { this.winCount[p]--; this.winSet[p].delete(i); } }
          }
        }
      }
    }
    /** Đọc 25 ô trên đường qua (cx, cy) theo hướng (dx, dy) vào L (L[12] = ô giữa); ngoài mảng = trống. */
    readLine(cx, cy, dx, dy, L) {
      const W = this.W, H = this.H;
      const x0 = cx - 12 * dx, y0 = cy - 12 * dy, x1 = cx + 12 * dx, y1 = cy + 12 * dy;
      if (x0 >= 0 && x1 >= 0 && x0 < W && x1 < W && y0 >= 0 && y1 >= 0 && y0 < H && y1 < H) {
        // Cả đoạn nằm trong mảng: đọc thẳng theo bước chỉ số
        const step = dy * W + dx, cells = this.cells;
        let j = y0 * W + x0;
        for (let k = 0; k < 25; k++, j += step) L[k] = cells[j];
        return;
      }
      for (let k = -12; k <= 12; k++) {
        const x = cx + k * dx, y = cy + k * dy;
        L[k + 12] = x < 0 || y < 0 || x >= W || y >= H ? EMPTY : this.cells[y * W + x];
      }
    }
    /** Như winDir nhưng trên mảng một đường L (ô c đang trống); ngoài mảng coi như bị chặn (chỉ xảy ra khi hàng ≥ 8 quân). */
    winLine(L, c, p) {
      let a = 1; while (L[c - a] === p) a++;
      let b = 1; while (L[c + b] === p) b++;
      const len = a + b - 1;
      if (len < 4) return false;
      switch (this.rule) {
        case 'free': return len >= 5;
        case 'std': return len === 5;
        case 'renju': return p === X ? len === 5 : len >= 5;
      }
      const openA = L[c - a] === EMPTY, openB = L[c + b] === EMPTY;
      return (len >= 5 && (openA || openB)) || (openA && openB);
    }
    play(i, p) {
      const cx = i % this.W, cy = (i / this.W) | 0;
      // Trong lúc tìm chuỗi ép (lazy > 0) không cần điểm thế cờ: bỏ qua phần tính điểm (undo cũng bỏ qua theo evs)
      const ev = !this.lazy;
      if (ev) {
        this.windowsAround(cx, cy, -1);
        this.cells[i] = p;
        this.windowsAround(cx, cy, 1);
      } else this.cells[i] = p;
      this.evs.push(ev);
      if (p === X) { this.lo ^= this.zob[1][i]; this.hi ^= this.zob[2][i]; } else { this.lo ^= this.zob[3][i]; this.hi ^= this.zob[4][i]; }
      for (let y = Math.max(0, cy - 2); y <= Math.min(this.H - 1, cy + 2); y++) {
        for (let x = Math.max(0, cx - 2); x <= Math.min(this.W - 1, cx + 2); x++) this.near[y * this.W + x]++;
      }
      this.refreshWins(cx, cy);
      this.stack.push(i);
      this.count++;
    }
    undo() {
      const i = this.stack.pop();
      const p = this.cells[i];
      const cx = i % this.W, cy = (i / this.W) | 0;
      if (this.evs.pop()) {
        this.windowsAround(cx, cy, -1);
        this.cells[i] = EMPTY;
        this.windowsAround(cx, cy, 1);
      } else this.cells[i] = EMPTY;
      if (p === X) { this.lo ^= this.zob[1][i]; this.hi ^= this.zob[2][i]; } else { this.lo ^= this.zob[3][i]; this.hi ^= this.zob[4][i]; }
      for (let y = Math.max(0, cy - 2); y <= Math.min(this.H - 1, cy + 2); y++) {
        for (let x = Math.max(0, cx - 2); x <= Math.min(this.W - 1, cx + 2); x++) this.near[y * this.W + x]--;
      }
      this.refreshWins(cx, cy);
      this.count--;
    }

    /** Các ô thắng hiện có của p. */
    winCells(p) {
      if (!this.winCount[p]) return [];
      return Array.from(this.winSet[p]).sort((a, b) => a - b); // theo thứ tự ô như trước
    }

    /** Điểm nhanh để xếp thứ tự ứng viên: hình cờ của p trên 4 đường nếu đánh vào ô i. */
    quickScore(i, p) {
      const cx = i % this.W, cy = (i / this.W) | 0, q = 3 - p;
      let s = 0;
      for (let d = 0; d < 4; d++) {
        const dx = DX[d], dy = DY[d];
        let own = 0, span = 1, adj = 0;
        for (const sg of [-1, 1]) {
          let gap = false;
          for (let k = 1; k <= 4; k++) {
            const v = this.at(cx + sg * k * dx, cy + sg * k * dy);
            if (v === q) break;
            span++;
            if (v === p) { own++; if (!gap) adj++; } else gap = true;
          }
        }
        if (span < 5) continue; // hướng này bị chặn, không thể thành 5
        s += [0, 6, 40, 220, 1200, 1200][Math.min(own, 5)] + adj * 4;
      }
      return s;
    }

    /** Các ô có thể chặn hết ô thắng của q (p đánh vào). */
    blocks(p) {
      const q = 3 - p, W = this.winCells(q);
      if (!W.length) return [];
      // cand: ô → số ô thắng mà nó trùng hoặc cùng đường (≤ 5 ô). Ô chặn được hết phải dính tới mọi ô thắng.
      const cand = new Map();
      for (const w of W) {
        cand.set(w, (cand.get(w) || 0) + 1);
        const cx = w % this.W, cy = (w / this.W) | 0, bits = this.win[q][w];
        for (let d = 0; d < 4; d++) {
          // Chỉ ô trên hướng làm w thành ô thắng mới có thể chặn (đặt quân p ở hướng khác không đổi được hướng đó)
          if (!(bits & (1 << d))) continue;
          for (let k = -5; k <= 5; k++) {
            if (!k) continue;
            const x = cx + k * DX[d], y = cy + k * DY[d];
            if (x >= 0 && y >= 0 && x < this.W && y < this.H && this.cells[y * this.W + x] === EMPTY) { const j = y * this.W + x; cand.set(j, (cand.get(j) || 0) + 1); }
          }
        }
      }
      const out = [];
      for (const [b, n] of cand) {
        if (n < W.length) continue;
        // Đặt tạm quân p ở b: còn ô thắng nào của q không? (q chỉ có thể thắng ở các ô thắng cũ)
        this.cells[b] = p;
        let still = false;
        for (const w of W) {
          if (w === b) continue;
          if (this.wouldWin(w % this.W, (w / this.W) | 0, q)) { still = true; break; }
        }
        this.cells[b] = EMPTY;
        if (!still) out.push(b);
      }
      return this.legal(out, p);
    }

    /** Ứng viên (ô trống gần quân), xếp theo điểm tấn công + phòng thủ. */
    candidates(p, limit, pure) {
      const q = 3 - p, list = [];
      if (!this.count) return [this.idx(0, 0)];
      // Thưởng theo lối đánh chỉ cho nước của nhân vật máy ở gốc (pure: bỏ qua, chỉ theo điểm)
      const root = !pure && this.count === this.rootCount;
      for (let i = 0; i < this.cells.length; i++) {
        if (this.cells[i] !== EMPTY || !this.near[i]) continue;
        list.push({ i, s: this.quickScore(i, p) + 0.85 * this.quickScore(i, q) });
      }
      list.sort((a, b) => b.s - a.s);
      if (root && (this.style.dbl || this.style.trap)) {
        // Lối đánh chỉ đổi thứ tự trong nhóm nước tốt nhất (không đẩy nước tốt ra ngoài): ngang điểm thì nước hợp lối được chọn
        const top = list.slice(0, limit || list.length);
        for (const o of top) o.t = o.s + this.styleScore(o.i, p);
        top.sort((a, b) => b.t - a.t);
        list.splice(0, top.length, ...top);
      }
      if (this.rule === 'renju' && p === X) {
        const out = [];
        for (const o of list) { if (!this.forbidden(o.i, p)) out.push(o.i); if (limit && out.length >= limit) break; }
        return out;
      }
      return (limit ? list.slice(0, limit) : list).map((o) => o.i);
    }

    /** Nước tạo ô thắng mới cho p (đe doạ buộc đối thủ phải chặn). */
    threatMoves(p, limit) {
      const out = [];
      const W = this.W, H = this.H, wp = this.win[p];
      for (let i = 0; i < this.cells.length; i++) {
        if (this.cells[i] !== EMPTY || !this.near[i]) continue;
        const cx = i % W, cy = (i / W) | 0;
        if (!this.mayThreat(cx, cy, p)) continue;
        this.cells[i] = p;
        let made = 0;
        const L = this._wline;
        for (let d = 0; d < 4; d++) {
          const dx = DX[d], dy = DY[d], bit = 1 << d;
          this.readLine(cx, cy, dx, dy, L);
          for (let k = -5; k <= 5; k++) {
            if (!k || L[k + 12] !== EMPTY || (L[k + 11] !== p && L[k + 13] !== p)) continue;
            const x = cx + k * dx, y = cy + k * dy;
            if (x < 0 || y < 0 || x >= W || y >= H || (wp[y * W + x] & bit)) continue;
            if (this.winLine(L, k + 12, p)) made++;
          }
        }
        this.cells[i] = EMPTY;
        if (made) out.push({ i, s: this.quickScore(i, p) + made * 60 });
      }
      out.sort((a, b) => b.s - a.s);
      return this.legal(out.slice(0, limit).map((o) => o.i), p);
    }
    /** Lọc nhanh: đánh vào (cx, cy) có thể tạo ô thắng nếu một đường có ≥ 2 quân p trong 4 ô mỗi bên (chưa bị chặn). */
    mayThreat(cx, cy, p) {
      const q = 3 - p;
      for (let d = 0; d < 4; d++) {
        const dx = DX[d], dy = DY[d];
        let n = 0;
        for (let k = 1; k <= 4; k++) { const v = this.at(cx + k * dx, cy + k * dy); if (v === p) n++; else if (v === q) break; }
        for (let k = 1; k <= 4; k++) { const v = this.at(cx - k * dx, cy - k * dy); if (v === p) n++; else if (v === q) break; }
        if (n >= 2) return true;
      }
      return false;
    }

    /** Điểm thế cờ theo bên tới lượt: thế của mình (trọng số công) trừ thế của đối thủ (trọng số thủ) + lợi thế được đi. */
    evaluate() {
      const st = this.style, acc = this.acc, tempo = this.ev.tempo;
      if (st.a === 1 && st.d === 1) return Math.round(this.side === X ? acc[0] - acc[3] : acc[2] - acc[1]) + tempo;
      // Lối đánh (a – trọng số thế mình, d – thế đối thủ) theo góc nhìn bên đi ở gốc (nhân vật máy), đổi dấu cho bên kia:
      // điểm vẫn nhất quán khi tìm (negamax)
      const rs = this.rootSide || this.side;
      const mine = rs === X ? acc[0] : acc[2], theirs = rs === X ? acc[3] : acc[1];
      const e = Math.round(st.a * mine - st.d * theirs);
      return (this.side === rs ? e : -e) + tempo;
    }
    /** Thưởng xếp thứ tự ứng viên theo lối đánh: nước đôi (nhiều đường có quân mình), gài bẫy (nước nhảy cách quãng). */
    styleScore(i, p) {
      const st = this.style;
      if (!st.dbl && !st.trap) return 0;
      const cx = i % this.W, cy = (i / this.W) | 0, q = 3 - p;
      let b = 0;
      if (st.dbl) {
        let dirs = 0;
        for (let d = 0; d < 4; d++) {
          let n = 0;
          for (const sg of [-1, 1]) for (let k = 1; k <= 4; k++) { const v = this.at(cx + sg * k * DX[d], cy + sg * k * DY[d]); if (v === q) break; if (v === p) n++; }
          if (n >= 1) dirs++;
        }
        b += st.dbl * 30 * Math.max(0, dirs - 1);
      }
      if (st.trap) {
        let adj = false;
        for (let dy = -1; dy <= 1 && !adj; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && this.at(cx + dx, cy + dy) !== EMPTY) { adj = true; break; }
        const last = this.stack[this.stack.length - 1];
        const near = last !== undefined && Math.abs((last % this.W) - cx) <= 1 && Math.abs(((last / this.W) | 0) - cy) <= 1;
        b += st.trap * ((adj ? 0 : 20) - (near ? 15 : 0));
      }
      return b;
    }
  }

  // ================================================================ Tìm kiếm
  const EXACT = 0, LOWER = 1, UPPER = 2;

  class Search {
    constructor(pos, opts) {
      this.pos = pos;
      this.deadline = Date.now() + (opts.ms || 500);
      this.tt = opts.tt || new Map();
      this.qtt = opts.qtt || new Map();
      this.vtt = opts.vtt || new Map();
      this.leafVcf = opts.leafVcf || 3;  // độ sâu chuỗi ép thử ở lá
      this.nodes = 0;
      // Xem giờ mỗi 1024 nút; opts.strict: mỗi 128 nút – một nút có thể tốn ~0,1 ms nên 1024 nút trễ hạn cả trăm ms
      // (lượt phân tích nhanh cần đúng giờ; máy đánh và phân tích kỹ giữ cách cũ để sức cờ không đổi)
      this.tick = opts.strict ? 127 : 1023;
      this.lmr = !!opts.lmr; // bật bằng opts.lmr (đang thử nghiệm – xem server/scripts/bot-match.js)
      this.stop = false;
      this.killers = [];
      this.width = opts.width || 10;   // số ứng viên ở các nút bên trong
      this.rootWidth = opts.rootWidth || 18;
      this.qDepth = opts.qDepth || 14; // độ sâu tối đa của chuỗi ép ở lá
    }
    timeUp() {
      if ((++this.nodes & this.tick) === 0 && Date.now() > this.deadline) this.stop = true;
      return this.stop;
    }
    ttGet(ply) {
      const e = this.tt.get(this.pos.key);
      if (!e) return null;
      let s = e.s;
      if (s >= MATE) s -= ply; else if (s <= -MATE) s += ply;
      return { d: e.d, s, f: e.f, m: e.m };
    }
    ttPut(d, s, f, m, ply) {
      if (this.tt.size > 600000) this.tt.clear();
      if (s >= MATE) s += ply; else if (s <= -MATE) s -= ply;
      const old = this.tt.get(this.pos.key);
      if (old && old.d > d && f !== EXACT) return;
      this.tt.set(this.pos.key, { d, s, f, m });
    }

    /** Tìm tiếp ở lá: chỉ nước chặn bắt buộc và nước tạo đe doạ (= tìm chuỗi ép). */
    qsearch(alpha, beta, ply, qd) {
      const pos = this.pos, p = pos.side, q = 3 - p;
      if (pos.winCount[p]) return WIN - ply;
      if (this.timeUp()) return 0;
      // Bảng ghi nhớ riêng cho chuỗi ép: chỉ lưu kết quả thắng / thua chắc (không phụ thuộc cửa sổ alpha-beta)
      const qk = this.pos.key;
      const qe = this.qtt.get(qk);
      if (qe !== undefined) return qe > 0 ? qe - ply : qe + ply;
      const r = this.qsearch2(alpha, beta, ply, qd);
      if (!this.stop && Math.abs(r) >= MATE) {
        if (this.qtt.size > 400000) this.qtt.clear();
        this.qtt.set(qk, r > 0 ? r + ply : r - ply);
      }
      return r;
    }
    qsearch2(alpha, beta, ply, qd) {
      const pos = this.pos, p = pos.side, q = 3 - p;
      if (pos.winCount[q]) {
        const bl = pos.blocks(p);
        if (!bl.length) return -(WIN - ply - 1);
        if (qd <= 0) return pos.evaluate() - 300;
        let best = -WIN;
        for (const b of bl) {
          pos.play(b, p);
          const s = -this.qsearch(-beta, -alpha, ply + 1, qd - 1);
          pos.undo();
          if (this.stop) return 0;
          if (s > best) best = s;
          if (s > alpha) alpha = s;
          if (alpha >= beta) break;
        }
        return best;
      }
      // Không bị doạ: chuỗi ép ngắn cho bên tới lượt, không có thì lấy điểm tĩnh
      const r = this.vcfSolve(this.leafVcf, ply);
      if (r) return WIN - (ply + 2 * r - 1);
      return pos.evaluate();
    }

    /**
     * Bộ giải chuỗi ép (VCF) cho bên tới lượt p: mỗi nước công tạo ô thắng mới, đối thủ phải chặn (thử mọi cách chặn);
     * nước chặn mà tạo luôn đe doạ cho đối thủ thì p phải thắng ngay. Trả về số nước công tới thắng (0 = không thấy).
     * Bảng ghi nhớ: > 0 = đã chứng minh thắng với số nước đó, < 0 = đã thử tới độ sâu |giá trị| mà không thấy.
     */
    vcfSolve(depth, ply) {
      const pos = this.pos, p = pos.side, q = 3 - p;
      if (pos.winCount[p]) return 1;
      if (pos.winCount[q] || depth <= 0) return 0;
      if (this.timeUp()) return 0;
      const key = pos.key, e = this.vtt.get(key);
      if (e !== undefined && (e > 0 || -e >= depth)) return e > 0 ? e : 0;
      let found = 0;
      for (const m of pos.threatMoves(p, 14)) {
        const r = this.vcfTry(m, depth);
        if (this.stop) return 0;
        if (r) { found = r; break; }
      }
      if (this.vtt.size > 500000) this.vtt.clear();
      this.vtt.set(key, found || -depth);
      return found;
    }
    /** p đi nước công m: mọi cách chặn của đối thủ có còn thua trong depth - 1 nước công nữa không? */
    vcfTry(m, depth) {
      const pos = this.pos;
      pos.lazy++;
      try { return this.vcfTry2(m, depth); } finally { pos.lazy--; }
    }
    vcfTry2(m, depth) {
      const pos = this.pos, p = pos.side, q = 3 - p;
      pos.play(m, p);
      const bl = pos.blocks(q);
      let worst = 1, ok = true;
      for (const b of bl) {
        pos.play(b, q);
        const r = pos.winCount[q] ? (pos.winCount[p] ? 1 : 0) : this.vcfSolve(depth - 1, 0);
        pos.undo();
        if (!r || this.stop) { ok = false; break; }
        if (r > worst) worst = r;
      }
      pos.undo();
      return ok ? worst + 1 : 0;
    }
    /** Chuỗi ép ở gốc: làm sâu dần tới khi thấy hoặc hết giờ. Trả về { move, len } hoặc null. */
    vcfRoot(maxDepth, deadline) {
      const pos = this.pos, p = pos.side;
      if (pos.winCount[3 - p]) return null;
      const saved = this.deadline;
      this.deadline = Math.min(saved, deadline);
      let res = null;
      for (let d = 1; d <= maxDepth && !res && !this.stop; d++) {
        for (const m of pos.threatMoves(p, 40)) {
          const r = this.vcfTry(m, d);
          if (this.stop) break;
          if (r) { res = { move: m, len: r }; break; }
        }
      }
      this.stop = false;
      this.deadline = saved;
      return res;
    }

    /**
     * Phòng thủ ở gốc: nước nào của p để đối thủ có chuỗi ép thắng (VCF, sâu tới depth) thì bỏ. Bên đối thủ thường có
     * đe doạ mà ô chặn đúng không nằm trong vài ứng viên đầu – tìm rộng ở gốc thì thấy, alpha-beta hẹp bên trong thì sót.
     * Trả về danh sách nước an toàn (giữ thứ tự ứng viên), hoặc null nếu không cần lọc / mọi nước đều thua.
     */
    safeRoot(depth, deadline) {
      const pos = this.pos, p = pos.side, q = 3 - p;
      if (pos.winCount[q] || !pos.threatMoves(q, 1).length) return null; // đối thủ chưa có nước công nào
      const saved = this.deadline;
      this.deadline = Math.min(saved, deadline);
      const cands = pos.candidates(p, 40, true); // theo điểm thuần: lối đánh không được đẩy nước tốt ra ngoài
      const safe = [];
      let unsafe = 0;
      for (const m of cands) {
        pos.play(m, p);
        let bad = false;
        if (!pos.winCount[p]) for (let d = 1; d <= depth && !bad && !this.stop; d++) bad = this.vcfSolve(d, 0) > 0;
        pos.undo();
        if (this.stop) break;
        if (bad) unsafe++; else safe.push(m);
        if (safe.length >= this.rootWidth) break;
      }
      const timedOut = this.stop;
      this.stop = false;
      this.deadline = saved;
      if (timedOut || !unsafe || !safe.length) return null;
      // Lối đánh chỉ đổi thứ tự xét trong nhóm an toàn (như candidates ở gốc)
      if (pos.style.dbl || pos.style.trap) {
        const rank = new Map(pos.candidates(p, 40).map((m, k) => [m, k]));
        safe.sort((a, b) => rank.get(a) - rank.get(b));
      }
      return safe;
    }

    negamax(depth, alpha, beta, ply, pv) {
      const pos = this.pos, p = pos.side, q = 3 - p;
      if (pos.winCount[p]) return WIN - ply;
      if (ply > 0 && this.timeUp()) return 0;
      const a0 = alpha;
      const tte = this.ttGet(ply);
      if (tte && tte.d >= depth && ply > 0) {
        if (tte.f === EXACT) return tte.s;
        if (tte.f === LOWER && tte.s >= beta) return tte.s;
        if (tte.f === UPPER && tte.s <= alpha) return tte.s;
      }
      let moves;
      let ext = 0;
      if (pos.winCount[q]) {
        moves = pos.blocks(p);
        if (!moves.length) return -(WIN - ply - 1);
        if (moves.length === 1 && ply < 40) ext = 1; // nước chặn duy nhất: không tính vào độ sâu
      } else {
        if (depth <= 0) return this.qsearch(alpha, beta, ply, this.qDepth);
        moves = ply === 0 && this.rootMoves ? this.rootMoves : pos.candidates(p, ply === 0 ? this.rootWidth : this.width);
      }
      if (depth <= 0 && !ext) return this.qsearch(alpha, beta, ply, this.qDepth);
      // Thứ tự: nước trong bảng ghi nhớ, nước sát thủ, rồi theo điểm
      const first = [];
      if (tte && tte.m >= 0 && moves.includes(tte.m)) first.push(tte.m);
      const k = this.killers[ply];
      if (k) for (const m of k) if (m !== first[0] && moves.includes(m)) first.push(m);
      const ordered = first.concat(moves.filter((m) => !first.includes(m)));
      let best = -WIN - 1, bestMove = ordered[0];
      const childPv = [];
      for (let n = 0; n < ordered.length; n++) {
        const m = ordered[n];
        pos.play(m, p);
        let s;
        childPv.length = 0;
        if (n === 0) s = -this.negamax(depth - 1 + ext, -beta, -alpha, ply + 1, childPv);
        else {
          // LMR (như Stockfish / Rapfi): nước xếp cuối, thế yên tĩnh, còn sâu → tìm nông hơn 1 bậc; vượt alpha thì tìm lại đủ sâu
          const r = this.lmr && n >= 3 && depth >= 3 && !ext && !pos.winCount[q] && !pos.winCount[p] ? 1 : 0;
          s = -this.negamax(depth - 1 - r + ext, -alpha - 1, -alpha, ply + 1, childPv);
          if (r && s > alpha && !this.stop) { childPv.length = 0; s = -this.negamax(depth - 1 + ext, -alpha - 1, -alpha, ply + 1, childPv); }
          if (s > alpha && s < beta) { childPv.length = 0; s = -this.negamax(depth - 1 + ext, -beta, -alpha, ply + 1, childPv); }
        }
        pos.undo();
        if (this.stop) return best > -WIN - 1 ? best : 0;
        if (s > best) {
          best = s; bestMove = m;
          if (pv) { pv.length = 0; pv.push(m, ...childPv); }
        }
        if (s > alpha) alpha = s;
        if (alpha >= beta) {
          const kl = this.killers[ply] || (this.killers[ply] = []);
          if (kl[0] !== m) { kl.unshift(m); kl.length = Math.min(kl.length, 2); }
          break;
        }
      }
      this.ttPut(depth, best, best <= a0 ? UPPER : best >= beta ? LOWER : EXACT, bestMove, ply);
      return best;
    }
  }

  /**
   * Phân tích một thế cờ (moves: [[x, y], …], bên tới lượt = X nếu số nước chẵn).
   * opts: { ms (thời gian, mặc định 500), maxDepth (mặc định 20), tt (Map dùng lại giữa các lần gọi), rule }.
   * Trả về { move: [x, y], score, depth, nodes, pv: [[x, y]…], mate: số nước tới thắng (+ bên tới lượt thắng, − thua) | null }.
   */
  function analyse(moves, opts) {
    opts = opts || {};
    const pos = new Position(moves, opts.rule);
    if (opts.style) Object.assign(pos.style, opts.style);
    pos.rootSide = pos.side; pos.rootCount = pos.count;
    const p = pos.side;
    if (!moves.length) return { move: [0, 0], score: 0, depth: 0, nodes: 0, pv: [[0, 0]], mate: null };
    // Thắng ngay
    const wins = pos.winCells(p);
    if (wins.length) return { move: pos.xy(wins[0]), score: WIN - 1, depth: 1, nodes: 1, pv: [pos.xy(wins[0])], mate: 1 };
    const S = new Search(pos, opts);
    // Chuỗi ép cho bên tới lượt trước (nhanh, chính xác hơn tìm rộng)
    const v = S.vcfRoot(opts.vcfDepth || 12, Date.now() + (opts.ms || 500) * 0.45);
    if (v) {
      const plies = 2 * v.len - 1;
      return { move: pos.xy(v.move), score: WIN - plies, depth: plies, nodes: S.nodes, pv: [pos.xy(v.move)], mate: v.len };
    }
    // Lọc nước để đối thủ có chuỗi ép (tốn tối đa ~30% thời gian)
    if (opts.safeRoot !== false) S.rootMoves = S.safeRoot(opts.defDepth || 6, Date.now() + (opts.ms || 500) * 0.3);
    let result = null;
    const maxDepth = opts.maxDepth || 20;
    for (let d = 1; d <= maxDepth; d++) {
      const pv = [];
      const s = S.negamax(d, -WIN - 1, WIN + 1, 0, pv);
      if (S.stop && result) break;
      if (pv.length) result = { score: s, depth: d, pv: pv.slice() };
      else if (!result) result = { score: s, depth: d, pv: [pos.candidates(p, 1)[0]] };
      if (Math.abs(s) >= MATE || S.stop) break;
    }
    const mate = result.score >= MATE ? Math.ceil((WIN - result.score) / 2) : result.score <= -MATE ? -Math.ceil((WIN + result.score) / 2) : null;
    return { move: pos.xy(result.pv[0]), score: result.score, depth: result.depth, nodes: S.nodes, pv: result.pv.map((i) => pos.xy(i)), mate };
  }

  /** Điểm → khả năng thắng (0..1) của bên tới lượt (giống cách Lichess đổi centipawn sang % thắng). */
  function winChance(score) {
    if (score >= MATE) return 1;
    if (score <= -MATE) return 0;
    return 1 / (1 + Math.exp(-score / 360));
  }

  const CaroEngine = { analyse, winChance, Position, WIN, MATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroEngine;
  else global.CaroEngine = CaroEngine;
})(typeof window !== 'undefined' ? window : globalThis);
