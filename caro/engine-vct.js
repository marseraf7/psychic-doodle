/*
 * Tìm chuỗi đe doạ VCT (Victory by Continuous Threats) cho engine.js – theo "threat-space search" của L. V. Allis
 * (Go-Moku and Threat-Space Search, chương 5) và cách sinh nước theo mẫu hình của Rapfi / Wine (tự viết, không dùng mã).
 *
 * Bên công p chỉ đi nước đe doạ: "bốn" (ô mẫu chéo ≥ E_BLOCK4 – đối thủ phải chặn ngay) hoặc "ba" (H_FLEX3 … F_FLEX3_2X –
 * tạo ô "bốn mở" B_FLEX4, đối thủ phải phòng). Bên thủ xét MỌI cách phòng: chặn ô thắng (khi bị bốn), hoặc mọi nước làm
 * bên công hết ô B_FLEX4 cùng mọi nước bốn phản công (Position.threatDefense – như "meta-move" nhiều quân của Allis,
 * nhưng kiểm bằng cách đặt thật nên đúng cả luật Việt Nam / Renju). Bên thủ phản công bằng bốn thì bên công phải chặn
 * rồi tiếp tục. Chứng minh thắng chỉ khi mọi cách phòng đều thua – nên nước tìm được là thắng chắc.
 *
 * Dùng: CaroVct.install(Search.prototype) – thêm vctFind / vctRoot / vctAttack / vctDefend vào lớp Search của engine.js
 * (engine.js dùng để tìm thắng ở gốc và để kiểm nước định đi: sau nước đó đối thủ có VCT không).
 * Chạy được trên trình duyệt (window.CaroVct, nạp trước engine.js), Web Worker và Node.
 */
(function (global) {
  'use strict';
  const PT = global.CaroPatterns || (typeof require === 'function' ? require('./engine-patterns.js') : null);
  const P4 = PT.P4;

  /** Nước công của p: bốn và ba (ô hợp lệ), mạnh trước; tối đa limit nước. */
  function attackMoves(pos, p, limit) {
    if (!hasAttack(pos, p)) return [];
    const out = [], p4 = pos.p4[p], pt = pos.pat[p], cells = pos.cells;
    for (let i = 0; i < p4.length; i++) {
      const v = p4[i];
      if (v >= P4.H_FLEX3 && v !== P4.A_FIVE && cells[i] === 0) {
        const b = i * 4;
        out.push({ i, s: v * 64 + pt[b] + pt[b + 1] + pt[b + 2] + pt[b + 3] });
      }
    }
    out.sort((a, b) => b.s - a.s);
    return pos.legal(out.map((o) => o.i), p).slice(0, limit);
  }

  const NO_VCT = -1e9;

  /** p có ô "ba" / "bốn" nào không (theo bộ đếm). */
  function hasAttack(pos, p) {
    const c = pos.p4cnt[p];
    for (let v = P4.H_FLEX3; v <= P4.B_FLEX4; v++) if (c[v]) return true;
    return false;
  }

  const methods = {
    /**
     * Bên tới lượt (bên công p) thắng bằng VCT trong tối đa depth nước công? → số nước công (> 0) hoặc 0.
     * Bảng ghi nhớ this.vctA / vctD: khoá thế → > 0 đã thắng, NO_VCT – đã xét hết (không nhánh nào bị cắt vì độ sâu) mà
     * không thấy, < 0 – đã thử tới độ sâu |giá trị| không thấy. this.vctCut: có nhánh bị cắt vì hết độ sâu (làm sâu thêm
     * mới có thể thấy) – không có thì dừng làm sâu sớm, khỏi phí giờ.
     */
    vctAttack(depth) {
      const pos = this.pos, p = pos.side, q = 3 - p;
      if (pos.winCount[p]) return 1;
      if (this.timeUp()) return 0;
      if (pos.winCount[q]) {
        // Bên thủ vừa phản công bằng bốn: bên công phải chặn, rồi bên thủ lại phải lo đe doạ cũ (nếu còn)
        let best = 0;
        for (const b of pos.blocks(p)) {
          pos.play(b, p);
          const r = this.vctDefend(depth);
          pos.undo();
          if (this.stop) return 0;
          if (r && (!best || r < best)) best = r;
        }
        return best;
      }
      if (depth <= 0) { if (hasAttack(pos, p)) this.vctCut = true; return 0; }
      const key = pos.key, e = this.vctA.get(key);
      if (e !== undefined) {
        if (e > 0) return e;
        if (e === NO_VCT) return 0;
        if (-e >= depth) { this.vctCut = true; return 0; }
      }
      const outer = this.vctCut;
      this.vctCut = false;
      let found = this.vcfSolve(depth + 2, 0); // chuỗi bốn (rẻ hơn) trước
      if (!found) {
        for (const m of attackMoves(pos, p, this.vctWidth)) {
          pos.play(m, p);
          const r = this.vctDefend(depth - 1);
          pos.undo();
          if (this.stop) return 0;
          if (r) { found = r + 1; break; }
        }
      }
      const cut = this.vctCut;
      this.vctCut = outer || cut;
      this.vctA.set(key, found || (cut ? -depth : NO_VCT));
      return found;
    },

    /** Bên tới lượt là bên thủ: mọi cách phòng đều thua? → số nước công còn lại (> 0) hoặc 0 (phòng được). */
    vctDefend(depth) {
      const pos = this.pos, q = pos.side, p = 3 - q;
      if (pos.winCount[q]) return 0; // bên thủ thắng ngay
      if (this.timeUp()) return 0;
      let moves;
      if (pos.winCount[p]) {
        moves = pos.blocks(q);
        if (!moves.length) return 1;
      } else if (pos.hasFlex4(p)) {
        moves = pos.threatDefense(q, true);
        if (!moves) return 2; // không chặn được, không có nước bốn phản công
      } else return 0; // nước vừa rồi không phải đe doạ
      const key = pos.key, e = this.vctD.get(key);
      if (e !== undefined) {
        if (e > 0) return e;
        if (e === NO_VCT) return 0;
        if (-e >= depth) { this.vctCut = true; return 0; }
      }
      const outer = this.vctCut;
      this.vctCut = false;
      let worst = 1;
      for (const m of moves) {
        pos.play(m, q);
        const r = this.vctAttack(depth);
        pos.undo();
        if (!r || this.stop) { worst = 0; break; }
        if (r > worst) worst = r;
      }
      const cut = this.vctCut;
      this.vctCut = outer || cut;
      if (!this.stop) this.vctD.set(key, worst || (cut ? -depth : NO_VCT));
      return worst;
    },

    /**
     * VCT cho bên tới lượt: làm sâu dần (số nước công) tới maxDepth hoặc hết giờ (this.deadline). → { move, len } | null;
     * this.vctTimedOut = true nếu dừng vì hết giờ (khi đó null không có nghĩa là "không có VCT").
     */
    vctFind(maxDepth) {
      const pos = this.pos, p = pos.side;
      this.vctTimedOut = false;
      if (pos.winCount[3 - p]) return null;
      this.vctA = new Map(); this.vctD = new Map();
      this.vctWidth = this.vctWidth || 10;
      pos.lazy++; // chỉ cần ô thắng / mẫu hình, không cần điểm thế cờ
      const tick = this.tick;
      this.tick = Math.min(tick, 63); // nút VCT tốn hơn nút thường nhiều: xem giờ dày hơn cho đúng hạn
      let res = null;
      for (let d = 2; d <= maxDepth && !res && !this.stop; d++) {
        this.vctCut = false;
        for (const m of attackMoves(pos, p, 20)) {
          pos.play(m, p);
          const r = this.vctDefend(d - 1);
          pos.undo();
          if (this.stop) break;
          if (r) { res = { move: m, len: r + 1 }; break; }
        }
        if (!this.vctCut) break; // đã xét hết, làm sâu thêm cũng vậy
      }
      pos.lazy--;
      this.tick = tick;
      this.vctTimedOut = this.stop && !res;
      this.stop = false;
      this.vctA = this.vctD = null;
      return res;
    },

    /** VCT ở gốc, giới hạn giờ tới deadline. → { move, len } hoặc null. */
    vctRoot(maxDepth, deadline) {
      const saved = this.deadline;
      this.deadline = Math.min(saved, deadline);
      const res = this.vctFind(maxDepth);
      this.deadline = saved;
      return res;
    },
  };

  const CaroVct = {
    attackMoves,
    install(proto) { Object.assign(proto, methods); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroVct;
  else global.CaroVct = CaroVct;
})(typeof window !== 'undefined' ? window : globalThis);
