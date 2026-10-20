/*
 * Tìm kiếm của engine: Negamax Alpha-Beta (PVS) làm sâu dần, bảng ghi nhớ, nước sát thủ, LMR (luật tiêu chuẩn); bị doạ
 * thắng thì chỉ xét nước chặn, bị doạ bốn mở thì chỉ xét nước phòng + nước bốn (Position.threatDefense); ở lá tìm chuỗi bốn
 * (VCF) có bảng ghi nhớ; ở gốc tìm VCF và bỏ các nước để đối thủ có VCF. VCT gắn thêm từ engine-vct.js (qua engine.js).
 * Chạy được trên trình duyệt (window.CaroSearch), Web Worker và Node.
 */
(function (global) {
  'use strict';
  const CP = global.CaroPosition || (typeof require === 'function' ? require('./engine-position.js') : null);
  const { X, WIN, MATE } = CP.K;

  const EXACT = 0, LOWER = 1, UPPER = 2;

  class Search {
    constructor(pos, opts) {
      this.pos = pos;
      // opts.nodes: giới hạn theo số nút thay cho thời gian – "đồng hồ" là số nút đã xét, nên cùng thế cờ cho cùng kết quả
      // trên mọi máy / trình duyệt / Worker (phân tích ván). opts.ms khi đó chỉ là giới hạn cứng cho máy quá chậm.
      this.budget = opts.nodes > 0 ? opts.nodes : 0;
      this.hard = this.budget ? Date.now() + (opts.ms || 5000) : Infinity;
      this.nodes = 0;
      this.deadline = this.clock() + (this.budget || opts.ms || 500);
      this.tt = opts.tt || new Map();
      this.qtt = opts.qtt || new Map();
      this.vtt = opts.vtt || new Map();
      // Độ sâu chuỗi bốn thử ở lá: luật Việt Nam (ba mở đã là đe doạ thắng – rất nhiều nước bốn) chỉ xét bốn mở – tự đấu 66%
      // so với 3 nước nhờ tìm sâu hơn; luật khác giữ 3 (ngang nhau)
      this.leafVcf = opts.leafVcf || (pos.rule === 'vn' ? 1 : 3);
      // Xem giờ mỗi 1024 nút; opts.strict: mỗi 128 nút – một nút có thể tốn ~0,1 ms nên 1024 nút trễ hạn cả trăm ms
      // (lượt phân tích nhanh cần đúng giờ; máy đánh và phân tích kỹ giữ cách cũ để sức cờ không đổi)
      this.tick = opts.strict ? 127 : 1023;
      // LMR: tự đấu (bot-match.js, 192 ván / luật) cho thấy có lợi ở luật tiêu chuẩn (+60%), ngang ở luật Việt Nam (53%),
      // hơi kém ở luật tự do / Renju (47–48%) → mặc định chỉ bật cho luật tiêu chuẩn; opts.lmr ghi đè
      this.lmr = opts.lmr != null ? !!opts.lmr : pos.rule === 'std';
      this.patterns = opts.patterns !== false; // phòng thủ bắt buộc + thắng nhanh theo mẫu hình (tắt: { patterns: false })
      this.stop = false;
      this.killers = [];
      this.width = opts.width || 10;   // số ứng viên ở các nút bên trong
      this.rootWidth = opts.rootWidth || 18;
      this.qDepth = opts.qDepth || 14; // độ sâu tối đa của chuỗi ép ở lá
    }
    /** Giờ hiện tại của lượt tìm: số nút (giới hạn theo nút) hoặc ms. Các hạn (deadline) tính theo đơn vị này. */
    clock() { return this.budget ? this.nodes : Date.now(); }
    timeUp() {
      if (this.budget) {
        if (++this.nodes > this.deadline || ((this.nodes & 1023) === 0 && Date.now() > this.hard)) this.stop = true;
      } else if ((++this.nodes & this.tick) === 0 && Date.now() > this.deadline) this.stop = true;
      return this.stop;
    }
    ttGet(ply) {
      const e = this.tt.get(this.pos.key);
      if (!e) return null;
      let s = e.s;
      if (s >= MATE) s -= ply; else if (s <= -MATE) s += ply;
      return { d: e.d, s, f: e.f, m: e.m < 0 ? -1 : this.pos.unpack(e.m) };
    }
    ttPut(d, s, f, m, ply) {
      if (this.tt.size > 600000) this.tt.clear();
      if (s >= MATE) s += ply; else if (s <= -MATE) s -= ply;
      const old = this.tt.get(this.pos.key);
      if (old && old.d > d && f !== EXACT) return;
      // Nước lưu theo toạ độ thật: bảng dùng lại được ở Position khác (engine.js – opts.carry)
      this.tt.set(this.pos.key, { d, s, f, m: m >= 0 ? this.pos.pack(m) : -1 });
    }

    /** Tìm tiếp ở lá: chỉ nước chặn bắt buộc và nước tạo đe doạ (= tìm chuỗi ép). */
    qsearch(alpha, beta, ply, qd) {
      const pos = this.pos, p = pos.side;
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
      if (this.patterns && pos.quickWin(p)) return WIN - (ply + 3);
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
      // Có ô bốn mở: thắng sau 2 nước công (không chặn nổi, đối thủ chưa có ô thắng để phản công)
      if (this.patterns && pos.hasFlex4(p)) return 2;
      // Còn 1 nước công: chỉ bốn mở mới thắng – không có thì khỏi thử (trừ Renju: X có thể không chặn được vì ô chặn bị cấm)
      if (this.patterns && depth === 1 && !(pos.rule === 'renju' && q === X)) return 0;
      const key = pos.key, e = this.vtt.get(key);
      if (e !== undefined && (e > 0 || -e >= depth)) return e > 0 ? e : 0;
      let found = 0;
      // Còn 2 nước công: nước bốn m chỉ thắng được nếu (sau khi bị chặn) có ô bốn mở – ô đó phải mới sinh trên đường qua m
      // (Allis: nước công sau phụ thuộc nước trước). Kiểm bằng tra mẫu trước khi đặt thử. Renju khi X phòng: X có thể không
      // chặn được vì ô chặn bị cấm, nên không cắt.
      const dep = this.patterns && depth === 2 && !(pos.rule === 'renju' && q === X);
      for (const m of pos.threatMoves(p, 14)) {
        if (dep && !pos.makesFlex4(m, p)) continue;
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
      // Mẫu hình chỉ nhìn 11 ô: kiểm lại bằng ô thắng thật (không tạo ô thắng nào thì không phải nước bốn)
      if (!pos.winCount[p]) { pos.undo(); return 0; }
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
        if (this.patterns && ply > 0 && pos.quickWin(p)) return WIN - (ply + 3);
        // Đối thủ doạ bốn mở: chỉ xét nước chặn + nước bốn (Rapfi); ở gốc giữ thứ tự / bộ lọc của rootMoves
        const def = this.patterns ? pos.threatDefense(p) : null;
        if (ply === 0 && this.rootMoves) moves = def ? this.rootMoves.filter((m) => def.includes(m)) : this.rootMoves;
        else moves = def || pos.candidates(p, ply === 0 ? this.rootWidth : this.width);
        if (!moves.length) moves = def || this.rootMoves;
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


  if (typeof module !== 'undefined' && module.exports) module.exports = { Search };
  else global.CaroSearch = { Search };
})(typeof window !== 'undefined' ? window : globalThis);
