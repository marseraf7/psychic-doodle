/*
 * Sinh nước và đe doạ cho engine: ứng viên xếp theo mẫu đường (Rapfi / Wine), nước "bốn" (VCF), ô chặn, phòng thủ bắt buộc
 * khi đối thủ doạ bốn mở, thắng nhanh, mẫu chéo giả định khi thêm một quân (không cần đặt thật).
 * Gắn vào Position.prototype qua engine.js (CaroPosition.mixin). Chạy được trên trình duyệt (window.CaroMoves), Worker, Node.
 */
(function (global) {
  'use strict';
  const PT = global.CaroPatterns || (typeof require === 'function' ? require('./engine-patterns.js') : null);
  const CP = global.CaroPosition || (typeof require === 'function' ? require('./engine-position.js') : null);
  const { EMPTY, X, DX, DY, POW3 } = CP.K;
  const P4 = PT.P4;
  // Điểm xếp ứng viên theo mẫu đường (NONE, B2, F2, B3, F3, F3S, B4, F4, F5) – cùng thang với quickScore
  const LS = [0, 6, 20, 40, 220, 260, 600, 1200, 5000];

  class MovesMixin {
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
      // Luật tự do / tiêu chuẩn / Renju: quân đặt ở ô khác không làm hỏng được hàng 5 qua ô thắng → chặn được khi và chỉ khi
      // chỉ có một ô thắng (đặt vào chính ô đó). Luật Việt Nam còn chặn được bằng cách bịt đầu (hàng 5 bị chặn hai đầu).
      if (this.rule !== 'vn') return W.length === 1 ? this.legal(W, p) : [];
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
        // Quân p ở b: còn ô thắng nào của q không? (q chỉ có thể thắng ở các ô thắng cũ; tra mẫu, không cần đặt thật)
        let still = false;
        for (const w of W) if (w !== b && this.p4With(q, w, b, p) === P4.A_FIVE) { still = true; break; }
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
      if (this.patOrder) {
        // Điểm theo mẫu đường đã có sẵn của ô (Rapfi / Wine: xếp nước theo mẫu) – rẻ hơn quickScore nhiều
        const pp = this.pat[p], pq = this.pat[q], cells = this.cells, near = this.near;
        for (let i = 0; i < cells.length; i++) {
          if (cells[i] !== EMPTY || !near[i]) continue;
          const b = i * 4;
          const sp = LS[pp[b]] + LS[pp[b + 1]] + LS[pp[b + 2]] + LS[pp[b + 3]];
          const sq = LS[pq[b]] + LS[pq[b + 1]] + LS[pq[b + 2]] + LS[pq[b + 3]];
          list.push({ i, s: sp + 0.85 * sq + near[i] });
        }
      } else {
        for (let i = 0; i < this.cells.length; i++) {
          if (this.cells[i] !== EMPTY || !this.near[i]) continue;
          list.push({ i, s: this.quickScore(i, p) + 0.85 * this.quickScore(i, q) });
        }
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

    /** Nước tạo "bốn" cho p (ô có mẫu chéo ≥ E_BLOCK4 – đe doạ buộc đối thủ phải chặn), mạnh trước. */
    threatMoves(p, limit) {
      const c = this.p4cnt[p];
      if (!c[P4.E_BLOCK4] && !c[P4.D_BLOCK4_PLUS] && !c[P4.C_BLOCK4_FLEX3] && !c[P4.B_FLEX4]) return [];
      // Xếp: mẫu chéo mạnh trước, rồi tổng mẫu đường 4 hướng (thay cho quickScore – rẻ hơn nhiều, như Rapfi)
      const out = [], p4 = this.p4[p], pt = this.pat[p], cells = this.cells;
      for (let i = 0; i < p4.length; i++) {
        const v = p4[i];
        if (v >= P4.E_BLOCK4 && v !== P4.A_FIVE && cells[i] === EMPTY) {
          const b = i * 4;
          out.push({ i, s: v * 64 + pt[b] + pt[b + 1] + pt[b + 2] + pt[b + 3] });
        }
      }
      out.sort((a, b) => b.s - a.s);
      const list = out.map((o) => o.i);
      return this.legal(list, p).slice(0, limit || list.length);
    }
    /** Các ô trống của p có mẫu chéo ≥ min (đã lọc nước cấm Renju). */
    cellsAtLeast(p, min) {
      if (!this.hasAtLeast(p, min)) return [];
      const out = [], p4 = this.p4[p], cells = this.cells;
      for (let i = 0; i < p4.length; i++) if (p4[i] >= min && cells[i] === EMPTY) out.push(i);
      return this.legal(out, p);
    }
    /**
     * p thắng chắc trong 2 nước của mình: có ô "bốn mở" (B_FLEX4, hợp lệ) mà đối thủ không có ô thắng / nước bốn nào để
     * phản công (Rapfi: quickWinCheck). Đối thủ không có nước bốn thì không thể làm gì ngoài chặn – mà bốn mở không chặn nổi.
     */
    quickWin(p) {
      const q = 3 - p;
      if (!this.p4cnt[p][P4.B_FLEX4] || this.winCount[q] || this.hasAtLeast(q, P4.E_BLOCK4)) return false;
      return this.hasFlex4(p);
    }
    /**
     * Phòng thủ bắt buộc (Rapfi / Allis: đối thủ doạ "bốn mở" thì chỉ có hai cách – chặn hoặc phản công bằng nước bốn):
     * đối thủ q có ô B_FLEX4 hợp lệ → các nước của p làm q hết ô B_FLEX4 hợp lệ, cùng mọi nước bốn của p (xếp theo điểm
     * ứng viên; fast: xếp rẻ theo mẫu chéo). null = q không có đe doạ đó (hoặc không tìm được nước nào – để tìm kiếm thường
     * tự xử lý).
     */
    threatDefense(p, fast) {
      const q = 3 - p;
      if (!this.p4cnt[q][P4.B_FLEX4]) return null;
      const threats = this.cellsAtLeast(q, P4.B_FLEX4).filter((i) => this.p4[q][i] === P4.B_FLEX4);
      if (!threats.length) return null;
      // Ô có thể chặn: chính ô đe doạ và các ô trống trong ±5 ô trên đường "bốn" của nó (luật Việt Nam: chặn đầu cũng được)
      const W = this.W, H = this.H, pq = this.pat[q], cand = new Set(threats);
      for (const c of threats) {
        const cx = c % W, cy = (c / W) | 0;
        for (let d = 0; d < 4; d++) {
          if (pq[c * 4 + d] < PT.B4) continue;
          for (let k = -5; k <= 5; k++) {
            const x = cx + k * DX[d], y = cy + k * DY[d];
            if (k && x >= 0 && y >= 0 && x < W && y < H && this.cells[y * W + x] === EMPTY) cand.add(y * W + x);
          }
        }
      }
      const out = [];
      if (this.rule === 'renju') {
        // Renju: quân chặn của O có thể làm ô bốn-bốn (cấm) của X thành ô bốn mở hợp lệ – đặt thật mới chắc
        for (const m of this.legal(Array.from(cand), p)) {
          this.play(m, p);
          const ok = !this.p4cnt[q][P4.B_FLEX4] || !this.cellsAtLeast(q, P4.B_FLEX4).some((i) => this.p4[q][i] === P4.B_FLEX4);
          this.undo();
          if (ok) out.push(m);
        }
      } else {
        // Không cần đặt thật: quân chặn ở e chỉ đổi mẫu đường của ô đe doạ c trên đúng một hướng → tra bảng mẫu cho đường
        // đó (e là quân của p) rồi gộp lại với 3 hướng kia; mọi ô đe doạ đều hết B_FLEX4 thì e là nước phòng
        for (const e of cand) if (threats.every((c) => c === e || this.p4With(q, c, e, p) < P4.B_FLEX4)) out.push(e);
      }
      for (const m of this.threatMoves(p)) if (!out.includes(m)) out.push(m);
      if (!out.length) return null;
      // fast (VCT): xếp rẻ theo mẫu chéo của hai bên ở ô đó; còn lại theo điểm ứng viên
      const p4p = this.p4[p], p4q = this.p4[q];
      const sc = new Map(out.map((m) => [m, fast ? p4p[m] * 16 + p4q[m] : this.quickScore(m, p) + 0.85 * this.quickScore(m, q)]));
      return out.sort((a, b) => sc.get(b) - sc.get(a));
    }
    /** Mẫu chéo của ô trống c cho bên q nếu ô e (khác c) có quân của bên b (không đặt thật; e ngoài 11 ô quanh c: như cũ). */
    p4With(q, c, e, b) {
      const W = this.W, cx = c % W, cy = (c / W) | 0, ex = e % W, ey = (e / W) | 0, dx = ex - cx, dy = ey - cy;
      let d, k;
      if (!dy) { d = 0; k = dx; } else if (!dx) { d = 1; k = dy; } else if (dx === dy) { d = 2; k = dx; } else if (dx === -dy) { d = 3; k = dx; } else return this.p4[q][c];
      if (k < -5 || k > 5) return this.p4[q][c];
      // Mã 11 ô của đường d qua c theo góc nhìn q (giữ sẵn – xem refreshWins), thêm quân b ở ô e (độ lệch k, đang trống)
      const key = (q === X ? this.keyX : this.keyO)[c * 4 + d] + (b === q ? 1 : 2) * POW3[5 + k];
      const T = this.ptab[q];
      let np = T[key]; if (np < 0) np = PT.lookup(T, key, this.rule, q === X);
      const pt = this.pat[q], base = c * 4;
      const a = d === 0 ? np : pt[base], b1 = d === 1 ? np : pt[base + 1], c2 = d === 2 ? np : pt[base + 2], d3 = d === 3 ? np : pt[base + 3];
      return PT.COMBO[a * 729 + b1 * 81 + c2 * 9 + d3];
    }
    /**
     * Thêm quân p ở ô trống m có tạo ô "bốn mở" mới cho p trên 4 đường qua m không (tra mẫu, không đặt thật). Ô bốn mở mới
     * sau nước m chỉ có thể nằm trên đường qua m (quân khác không đổi) – điều kiện cần để chuỗi bốn còn 2 nước công thắng.
     */
    makesFlex4(m, p) {
      const W = this.W, H = this.H, cells = this.cells, mx = m % W, my = (m / W) | 0;
      for (let d = 0; d < 4; d++) {
        for (let k = -5; k <= 5; k++) {
          if (!k) continue;
          const x = mx + k * DX[d], y = my + k * DY[d];
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const c = y * W + x;
          if (cells[c] === EMPTY && this.p4[p][c] !== P4.B_FLEX4 && this.p4With(p, c, m, p) === P4.B_FLEX4) return true;
        }
      }
      return false;
    }
    /** p có ô "bốn mở" (B_FLEX4) hợp lệ không. */
    hasFlex4(p) {
      return this.p4cnt[p][P4.B_FLEX4] > 0 && this.cellsAtLeast(p, P4.B_FLEX4).some((i) => this.p4[p][i] === P4.B_FLEX4);
    }
    /** p có ô nào mẫu chéo ≥ min không (theo bộ đếm – chưa lọc nước cấm). */
    hasAtLeast(p, min) {
      const c = this.p4cnt[p];
      for (let v = min; v <= P4.A_FIVE; v++) if (c[v] > 0) return true;
      return false;
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { Mixin: MovesMixin };
  else global.CaroMoves = { Mixin: MovesMixin };
})(typeof window !== 'undefined' ? window : globalThis);
