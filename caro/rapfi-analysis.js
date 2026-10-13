/*
 * Phân tích ván bằng Rapfi (luật tự do / tiêu chuẩn / Renju) – để phân tích theo kịp BOAT: trước đây engine của game
 * (yếu hơn Rapfi) chấm cả nước của BOAT, nên nước hay của Rapfi bị đánh dấu là sai lầm.
 * Chấm từng thế như an-pool.js nhưng bằng Rapfi (boat-rapfi.js · ask), đổi điểm sang thang của engine.js để analysis.js
 * xếp loại như cũ:
 *   - khả năng thắng: Rapfi 1 / (1 + e^(−cp/200)), engine.js 1 / (1 + e^(−score/360)) → score = cp × 1,8;
 *   - thắng / thua chắc "±M n" (n nửa nước) → score = ±(WIN − n), mate = ±⌈n / 2⌉ (đúng quy ước engine.js).
 * Thế sát mép bàn Rapfi (cách mép < 4 ô, xem boat-rapfi.js) chấm thêm bằng engine của game cùng lúc: engine thấy chuỗi
 * ép thắng (đúng trên bàn vô hạn) mà Rapfi không thấy → lấy kết quả engine; Rapfi báo thắng / thua chắc mà engine không
 * xác nhận → hạ về điểm cao thường (có thể do mép bàn). Không vừa bàn Rapfi → dùng kết quả engine.
 * Kết quả có src: 'rapfi' để không lẫn với thế engine đã chấm (phân tích nhanh / phân tích ngầm).
 *   CaroRapfiAn.handles(rule) · CaroRapfiAn.evaluate({ moves, rule, ms, evals, onProgress }) → evals | null
 *   CaroRapfiAn.convert(ev, move, ms) · CaroRapfiAn.cancel()
 */
(function (global) {
  'use strict';
  const C = global.Caro;
  const A = global.CaroAnalysis;
  const R = () => global.CaroRapfi;
  const WIN = 1000000, MATE = WIN - 1000, SCALE = 360 / 200;
  const LOAD_WAIT = 60000; // phân tích chờ tải mạng (có thông báo tiến độ) tối đa 1 phút
  let job = 0;

  const handles = (rule) => !!(R() && R().available(rule));
  const ours = (e, ms) => !!e && e.src === 'rapfi' && typeof e.score === 'number' && (e.q || 0) >= ms;

  /** Điểm Rapfi { cp, mate } (góc nhìn bên đi) → bản gọn như analysis.js slim: { move, score, mate, q, src }. */
  function convert(ev, move, ms) {
    const e = ev || { cp: 0, mate: 0 };
    if (e.mate) {
      const n = Math.min(Math.abs(e.mate), 999);
      const s = e.mate > 0 ? 1 : -1;
      return { move, score: s * (WIN - n), mate: s * Math.ceil(n / 2), q: ms, src: 'rapfi' };
    }
    const score = Math.max(-(MATE - 1), Math.min(MATE - 1, Math.round(e.cp * SCALE)));
    return { move, score, mate: null, q: ms, src: 'rapfi' };
  }

  /** Chấm một thế: Rapfi (+ engine kiểm khi sát mép) → bản gọn src 'rapfi', hoặc null nếu Rapfi lỗi. */
  async function evalPos(rule, moves, ms) {
    const Rp = R();
    const f = moves.length ? Rp.frame(moves, Rp.SIZE[rule]) : { margin: 99 };
    const near = !f || f.margin < Rp.SAFE_EDGE;
    const chk = near ? Rp.check(rule, moves, Math.min(ms, 400)) : null; // chạy song song với Rapfi (Worker khác)
    const r = f ? await Rp.ask(rule, moves, ms) : null;
    const e = chk ? await chk : null;
    if (!r) return e ? { ...e, q: ms, src: 'rapfi' } : null; // không vừa bàn: kết quả engine
    let out = convert(r.ev, r.move, ms);
    if (e) {
      if (e.mate && (!out.mate || Math.sign(e.mate) !== Math.sign(out.mate))) out = { ...e, q: ms, src: 'rapfi' };
      else if (out.mate && !e.mate) out = { ...out, mate: null, score: Math.sign(out.score) * 1500 }; // chưa chắc vì mép bàn
    }
    return out;
  }

  /** Ván kết thúc ở nước nào (thế sau đó không cần chấm). */
  function lastPos(moves, rule) {
    const b = new C.Board(rule);
    for (let i = 0; i < moves.length; i++) {
      const [x, y] = moves[i], p = i % 2 ? C.O : C.X;
      b.play(x, y, p);
      if (C.checkWin(b, x, y, p)) return i;
    }
    return moves.length;
  }

  /**
   * Chấm mọi thế của ván (và thế sau nước tốt nhất khi cần) bằng Rapfi, ms mỗi thế; dùng lại thế Rapfi đã chấm đủ kỹ.
   * → mảng evals cho analyzeGame, hoặc null (Rapfi không dùng được / đã huỷ) để study.js dùng engine của game.
   */
  async function evaluate({ moves, rule, ms, evals, onProgress }) {
    if (!handles(rule)) return null;
    const my = ++job;
    if (!(await R().ready(rule, LOAD_WAIT)) || my !== job) return null;
    const n = moves.length, last = lastPos(moves, rule);
    const ev = Array.from({ length: n + 1 }, (_, i) => (evals && ours(evals[i], ms) ? evals[i] : null));
    const todo = [];
    for (let i = 0; i <= last; i++) if (!ev[i]) todo.push(i);
    // Tiến độ: chấm các thế 0 → 85%, thế sau nước tốt nhất 85 → 99%
    const prog = (f) => { if (onProgress) onProgress(Math.min(0.99, f)); };
    for (let k = 0; k < todo.length; k++) {
      const i = todo[k];
      const e = await evalPos(rule, moves.slice(0, i), ms);
      if (my !== job || !e) return null;
      ev[i] = e;
      prog((0.85 * (k + 1)) / todo.length);
    }
    // Thế sau nước tốt nhất cho các nước có thể bị đánh dấu (analysis.js altNeeded)
    const alts = [];
    for (let i = 0; i < Math.min(last + 1, n); i++) {
      if (A.altNeeded(moves, ev, i) && !ours(ev[i].alt, ms)) alts.push(i);
    }
    for (let k = 0; k < alts.length; k++) {
      const i = alts[k];
      const e = await evalPos(rule, moves.slice(0, i).concat([ev[i].move]), ms);
      if (my !== job) return null;
      if (e) ev[i] = { ...ev[i], alt: e };
      prog(0.85 + (0.14 * (k + 1)) / alts.length);
    }
    return ev;
  }

  /** Huỷ lượt đang chạy (mở ván khác): Worker Rapfi giữ nguyên (nạp lại mạng tốn thời gian), chỉ bỏ kết quả. */
  function cancel() { job++; }

  global.CaroRapfiAn = { handles, evaluate, convert, cancel };
})(window);
