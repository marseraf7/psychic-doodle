/*
 * Chấm điểm thế cờ của engine (cập nhật dần): cửa sổ 5 ô (luật Việt Nam: hàng bị chặn hai đầu = 0) và cửa sổ 6 ô hai đầu
 * trống, tách "thế của mình" / "thế của đối thủ", trọng số học từ ván Gomocup (server/scripts/tune-eval.js); cộng điểm theo
 * số ô có từng mẫu chéo (nếu luật có trọng số pa / pd) và lối đánh của nhân vật máy (bots.js).
 * Gắn vào Position.prototype qua engine.js (CaroPosition.mixin). Chạy được trên trình duyệt (window.CaroEval), Worker, Node.
 */
(function (global) {
  'use strict';
  const CP = global.CaroPosition || (typeof require === 'function' ? require('./engine-position.js') : null);
  const { EMPTY, X, O, DX, DY } = CP.K;

  // Trọng số chấm điểm thế cờ theo từng luật. Cửa sổ 5 ô một màu có k quân → a5[k] nếu là quân của bên tới lượt
  // ("thế của mình"), d5[k] nếu là quân đối thủ ("thế của đối thủ"); cửa sổ 6 ô hai đầu trống, 4 ô giữa một màu: a6 / d6.
  // tempo: lợi thế được đi. Bộ 'base' là bộ cũ (công = thủ); các luật khác được học từ ván Gomocup bằng
  // server/scripts/tune-eval.js (Texel tuning) và kiểm lại bằng tự đấu (server/scripts/bot-match.js).
  const W5 = [0, 2, 12, 60, 450, 0];
  const W6 = [0, 0, 24, 420, 0];
  const EVAL = {
    base: { a5: W5, d5: W5, a6: W6, d6: W6, tempo: 30 },
    // Học từ ván Gomocup 2008–2025 (~365 nghìn ván, server/scripts/tune-eval.js), chỉ nhận bộ nào thắng bộ trước khi tự đấu;
    // luật Việt Nam (Gomocup chỉ có 864 ván Caro) thêm vòng tự đấu – học lại (selfplay.js)
    free: { a5: [0, 7, 47, 145, 450, 0], d5: [0, 7, 38, 141, 450, 0], a6: [0, 0, 31, 420, 0], d6: [0, 0, 14, 58, 0], tempo: 135 },
    // Luật tiêu chuẩn: học lại kèm đặc trưng mẫu chéo (pa / pd – số ô theo từng mẫu chéo, tune-eval.js) – thắng bộ cũ 61% / 192 ván
    std: { a5: [0, 16, 63, 0, 450, 0], d5: [0, 14, 48, 41, 450, 0], a6: [0, 0, 2, 420, 0], d6: [0, 0, 1, 85, 0],
      pa: [0, -7, -12, -13, -1, -21, 2, -48, 29, 103, 432, -38, 0], pd: [0, -7, -8, -12, 4, -17, -2, -54, 15, 77, 237, 83, 0], tempo: 165 },
    renju: { a5: [0, 6, 40, 82, 450, 0], d5: [0, 5, 29, 105, 450, 0], a6: [0, 0, 0, 420, 0], d6: [0, 0, 0, 75, 0], tempo: 109 },
    // Luật Việt Nam: học tăng cường – engine tự đấu rồi học lại, 2 vòng × 4.000 ván (kèm 864 ván Caro Gomocup, có đặc trưng
    // mẫu chéo): vòng 1 thắng bộ trước 58% / 192 ván, vòng 2 thắng vòng 1 53% / 384 ván
    vn: { a5: [0, 22, 37, 341, 450, 0], d5: [0, 15, 68, 78, 450, 0], a6: [0, 0, 147, 420, 0], d6: [0, 0, 0, 420, 0],
      pa: [0, 0, -20, 0, -15, 202, 0, 0, -74, 126, 0, -246, 0], pd: [0, 0, -7, 0, -15, -25, -118, 0, -21, 11, 0, -12, 0], tempo: 120 },
  };
  const evalOf = (rule) => EVAL[rule] || EVAL[rule === 'vn' ? 'vn' : 'base'] || EVAL.base;

  class EvalMixin {
    /** Bộ trọng số của luật. */
    weights(rule) { return evalOf(rule); }

    // ---- điểm thế cờ: các cửa sổ chịu ảnh hưởng khi ô (cx, cy) đổi
    /**
     * Ô (cx, cy) sắp đổi thành v (chưa đặt): trừ điểm các cửa sổ qua ô theo giá trị hiện tại rồi cộng lại theo v, vào
     * this.acc. Đọc 13 ô trên mỗi đường một lần cho cả hai lượt (trọng số là số nguyên nên thứ tự cộng không đổi kết quả).
     */
    windowsSwap(cx, cy, v) {
      // Cửa sổ 5 ô: một màu, k quân (luật Việt Nam: bị chặn hai đầu = 0); cửa sổ 6 ô hai đầu trống, 4 ô giữa một màu
      const L = this._line, vn = this.rule === 'vn', acc = this.acc, E = this.ev;
      const a5 = E.a5, d5 = E.d5, a6 = E.a6, d6 = E.d6;
      const W = this.W, H = this.H, cells = this.cells;
      for (let d = 0; d < 4; d++) {
        const dx = DX[d], dy = DY[d], step = dy * W + dx;
        // Khoảng k còn trong mảng (ngoài mảng = ô trống), tính một lần thay vì kiểm từng ô
        let k0 = -6, k1 = 6;
        if (dx) { if (-cx > k0) k0 = -cx; if (W - 1 - cx < k1) k1 = W - 1 - cx; }
        if (dy > 0) { if (-cy > k0) k0 = -cy; if (H - 1 - cy < k1) k1 = H - 1 - cy; } else if (dy < 0) { if (cy - H + 1 > k0) k0 = cy - H + 1; if (cy < k1) k1 = cy; }
        if (k0 > -6 || k1 < 6) L.fill(EMPTY);
        for (let k = k0, i = (cy + k0 * dy) * W + cx + k0 * dx; k <= k1; k++, i += step) L[k + 6] = cells[i];
        for (let pass = 0, sign = -1; pass < 2; pass++, sign = 1) {
          if (pass) L[6] = v;
          // Cửa sổ 5 ô L[b..b+4], b = 1..7 (đầu ngoài: L[b-1], L[b+5])
          let x = 0, o = 0;
          for (let k = 1; k <= 5; k++) { const c = L[k]; if (c === X) x++; else if (c === O) o++; }
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
            for (let k = 1; k < 5; k++) { const c = L[b + k]; if (c === X) x6++; else if (c === O) o6++; }
            if ((x6 && o6) || (!x6 && !o6)) continue;
            if (x6) { acc[0] += sign * a6[x6]; acc[1] += sign * d6[x6]; } else { acc[2] += sign * a6[o6]; acc[3] += sign * d6[o6]; }
          }
        }
      }
    }
    /** Điểm theo góc nhìn X với trọng số công (để tương thích: bộ 'base' công = thủ nên bằng điểm cũ). */
    get evalX() { return this.acc[0] - this.acc[2]; }


    /** Điểm thế cờ theo bên tới lượt: thế của mình (trọng số công) trừ thế của đối thủ (trọng số thủ) + lợi thế được đi. */
    evaluate() {
      const st = this.style, acc = this.acc, tempo = this.ev.tempo;
      if (st.a === 1 && st.d === 1) {
        const s = this.side;
        return Math.round(s === X ? acc[0] - acc[3] : acc[2] - acc[1]) + this.patScore(s, true) - this.patScore(3 - s, false) + tempo;
      }
      // Lối đánh (a – trọng số thế mình, d – thế đối thủ) theo góc nhìn bên đi ở gốc (nhân vật máy), đổi dấu cho bên kia:
      // điểm vẫn nhất quán khi tìm (negamax)
      const rs = this.rootSide || this.side;
      const mine = (rs === X ? acc[0] : acc[2]) + this.patScore(rs, rs === this.side);
      const theirs = (rs === X ? acc[3] : acc[1]) + this.patScore(3 - rs, rs !== this.side);
      const e = Math.round(st.a * mine - st.d * theirs);
      return (this.side === rs ? e : -e) + tempo;
    }
    /**
     * Điểm mẫu chéo của p (Rapfi / Wine: chấm theo số ô có từng loại mẫu – ô "bốn", "ba mở", "ba kép"…):
     * toMove – p là bên tới lượt (trọng số pa) hay bên vừa đi (pd). Trọng số học từ ván thật (tune-eval.js).
     */
    patScore(p, toMove) {
      const w = toMove ? this.ev.pa : this.ev.pd;
      if (!w) return 0;
      const c = this.p4cnt[p];
      let s = 0;
      for (let v = 1; v < 12; v++) s += w[v] * c[v];
      return s;
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

  if (typeof module !== 'undefined' && module.exports) module.exports = { Mixin: EvalMixin, EVAL };
  else global.CaroEval = { Mixin: EvalMixin, EVAL };
})(typeof window !== 'undefined' ? window : globalThis);
