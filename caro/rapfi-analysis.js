/*
 * Phân tích ván bằng Rapfi (luật tự do / tiêu chuẩn / Renju; luật Việt Nam: Rapfi-CARO) – để phân tích theo kịp BOAT: trước đây engine của game
 * (yếu hơn Rapfi) chấm cả nước của BOAT, nên nước hay của Rapfi bị đánh dấu là sai lầm.
 * Chấm từng thế như an-pool.js nhưng bằng Rapfi (boat-rapfi.js · ask), đổi điểm sang thang của engine.js để analysis.js
 * xếp loại như cũ:
 *   - khả năng thắng: Rapfi 1 / (1 + e^(−cp/200)) (luật Việt Nam – bảng cổ điển học riêng: cp/400), engine.js
 *     1 / (1 + e^(−score/360)) → score = cp × 1,8 (luật Việt Nam × 0,9);
 *   - thắng / thua chắc "±M n" (n nửa nước) → score = ±(WIN − n), mate = ±⌈n / 2⌉ (đúng quy ước engine.js).
 * Thế sát mép bàn Rapfi (cách mép < 4 ô, xem boat-rapfi.js) chấm thêm bằng engine của game cùng lúc: engine thấy chuỗi
 * ép thắng (đúng trên bàn vô hạn) mà Rapfi không thấy → lấy kết quả engine; Rapfi báo thắng / thua chắc mà engine không
 * xác nhận → hạ về điểm cao thường (có thể do mép bàn). Không vừa bàn Rapfi → dùng kết quả engine.
 * Kết quả có src: 'rapfi' để không lẫn với thế engine đã chấm (phân tích nhanh / phân tích ngầm).
 *   CaroRapfiAn.handles(rule) · CaroRapfiAn.evaluate({ moves, rule, ms, evals, onProgress }) → evals | null
 *   CaroRapfiAn.convert(ev, move, ms, rule) · CaroRapfiAn.cancel()
 */
(function (global) {
  'use strict';
  const C = global.Caro;
  const A = global.CaroAnalysis;
  const R = () => global.CaroRapfi;
  const WIN = 1000000, MATE = WIN - 1000;
  const SCALE = { vn: 360 / 400 }, SCALE_NNUE = 360 / 200; // thang điểm Rapfi theo luật (bảng caro học với K = 1/400)
  const LOAD_WAIT = 60000; // phân tích chờ tải mạng (có thông báo tiến độ) tối đa 1 phút
  // Chấm theo số nút (rapfi/brain.js – INFO max_node), không theo giờ: kết quả không đổi theo máy nhanh / chậm (máy mạnh chỉ
  // xong sớm hơn). Cả ván đặt vào một khung cố định trên bàn Rapfi, bảng băm xoá khi bắt đầu rồi giữ suốt ván (các thế liền
  // nhau dùng lại được) – cùng ván, cùng số Worker thì cùng kết quả. Đo (server/scripts/rapfi/an-bench-rapfi.js, luật Việt
  // Nam, 12 ván, 300 ms / thế, so với chấm ×8 nút): trùng chuẩn 86,1% (theo giờ như trước: 82,8%; theo số nút mà xoá bảng
  // băm mỗi thế: 80,5%), đánh dấu oan 10 / bỏ sót 10 (trước 15 / 13), hai lần chạy ra cùng kết quả 100% (trước 89,4%).
  // Số nút = thời gian Rapfi thật sự nghĩ khi chấm theo giờ ms (~ms − 30 – brain.js fixedTime) × tốc độ chuẩn của Rapfi
  // WebAssembly 1 luồng theo luật (nghìn nút / giây = nút / ms: tổng nút / tổng thời gian trên các ván của công cụ đo, máy
  // rảnh – Node 22): cùng thời gian như cách cũ trên máy chuẩn. Luật có mạng NNUE chậm hơn ~5 lần luật Việt Nam
  const KNPS = { free: 99, std: 106, renju: 91, vn: 555 };
  const nodesFor = (rule, ms) => Math.max(10000, Math.round((ms - 30) * KNPS[rule]));
  let job = 0;

  const handles = (rule) => !!(R() && R().available(rule));
  const ours = (e, ms) => !!e && e.src === 'rapfi' && typeof e.score === 'number' && (e.q || 0) >= ms;

  /** Điểm Rapfi { cp, mate } (góc nhìn bên đi) → bản gọn như analysis.js slim: { move, score, mate, q, src }. */
  function convert(ev, move, ms, rule) {
    const e = ev || { cp: 0, mate: 0 };
    if (e.mate) {
      const n = Math.min(Math.abs(e.mate), 999);
      const s = e.mate > 0 ? 1 : -1;
      return { move, score: s * (WIN - n), mate: s * Math.ceil(n / 2), q: ms, src: 'rapfi' };
    }
    const score = Math.max(-(MATE - 1), Math.min(MATE - 1, Math.round(e.cp * (SCALE[rule] || SCALE_NNUE))));
    return { move, score, mate: null, q: ms, src: 'rapfi' };
  }

  /**
   * Chấm một thế: Rapfi (+ engine kiểm khi sát mép) → bản gọn src 'rapfi', hoặc null nếu Rapfi lỗi. lane: Worker Rapfi;
   * gf: khung cố định của cả ván (null: ván rộng hơn bàn Rapfi); clean: lượt đầu của Worker này trong lần phân tích (xoá
   * bảng băm trước).
   */
  async function evalPos(rule, moves, ms, lane, gf, clean) {
    const Rp = R(), Bd = global.CaroRapfiBoard, n = Rp.SIZE[rule];
    const f = moves.length ? Bd.fit(moves, gf, n) || Rp.frame(moves, n) : { margin: 99 };
    const near = !f || f.margin < Rp.SAFE_EDGE;
    const chk = near ? Rp.check(rule, moves, Math.min(ms, 400)) : null; // chạy song song với Rapfi (Worker khác)
    const r = f ? await Rp.ask(rule, moves, ms, lane, { nodes: nodesFor(rule, ms), frame: gf, fresh: clean }) : null;
    const e = chk ? await chk : null;
    if (!r) return e ? { ...e, q: ms, src: 'rapfi' } : null; // không vừa bàn: kết quả engine
    // Rapfi đi ngay không tìm kiếm (không in điểm) khi có nước thắng ngay – hoặc thế chỉ còn một nước: tự chấm
    let ev = r.ev;
    if (!ev && winsNow(rule, moves, r.move)) ev = { cp: 20000, mate: 1 };
    if (!ev) {
      const e2 = e || (await Rp.check(rule, moves, Math.min(ms, 400)));
      return e2 ? { ...e2, q: ms, src: 'rapfi' } : convert(null, r.move, ms, rule);
    }
    let out = convert(ev, r.move, ms, rule);
    if (e) {
      if (e.mate && (!out.mate || Math.sign(e.mate) !== Math.sign(out.mate))) out = { ...e, q: ms, src: 'rapfi' };
      else if (out.mate && !e.mate) out = { ...out, mate: null, score: Math.sign(out.score) * 1500 }; // chưa chắc vì mép bàn
    }
    return out;
  }

  const sameMove = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

  /** Bên đi đặt quân ở `move` là thắng ngay. */
  function winsNow(rule, moves, move) {
    const b = new C.Board(rule);
    moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? C.O : C.X));
    const p = moves.length % 2 ? C.O : C.X;
    return b.get(move[0], move[1]) === C.EMPTY && C.winsIfPlaced(b, move[0], move[1], p);
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
    let todo = [];
    for (let i = 0; i <= last; i++) if (!ev[i]) todo.push(i);
    // Bộ nhớ điểm dùng chung (eval-cloud.js): thế đã có người chấm cùng số nút thì lấy luôn; thế chấm trên máy lượt này
    // (fresh) gửi lên khi xong
    const nodes = nodesFor(rule, ms), cloud = global.CaroEvalCloud, fresh = [];
    if (cloud && todo.length) {
      const got = await cloud.get(rule, nodes, todo.map((i) => moves.slice(0, i)));
      if (my !== job) return null;
      for (const [k, h] of got) ev[todo[k]] = { ...h, q: ms, src: 'rapfi' };
      todo = todo.filter((i) => !ev[i]);
    }
    // Tiến độ: chấm các thế 0 → 85%, thế sau nước tốt nhất 85 → 99%
    const prog = (f) => { if (onProgress) onProgress(Math.min(0.99, f)); };
    // Máy đủ RAM: Worker Rapfi thứ hai chấm hai thế cùng lúc – cùng số nút mỗi thế nên cùng kết quả, xong nhanh gấp đôi.
    // Worker phụ chưa sẵn sàng (lần đầu nạp mạng): không chờ, lượt này một Worker (boat-rapfi.js tạo sẵn khi hết ván)
    const two = todo.length >= 3 && (await R().auxReady(rule, 0));
    if (my !== job) return null;
    const lanes = two ? 2 : 1;
    // Khung cố định cho cả ván (mọi thế, kể cả thế sau nước tốt nhất nếu vừa); bảng băm mỗi Worker xoá ở lượt đầu
    const gf = R().frame(moves, R().SIZE[rule]);
    const first = [true, true];
    const run = async (list, at) => {
      let next = 0, bad = false, done = 0;
      await Promise.all(Array.from({ length: lanes }, async (_, lane) => {
        while (!bad && my === job && next < list.length) {
          const k = next++;
          const clean = first[lane]; // lượt đầu của Worker này: xoá bảng băm
          first[lane] = false;
          const e = await at(list[k], lane, clean);
          if (my !== job) return;
          if (!e) { bad = true; return; }
          done++;
          prog.step(done, list.length);
        }
      }));
      return !bad && my === job;
    };
    prog.step = (d, n) => prog((0.85 * d) / n);
    // "Nước duy nhất" (analysis.js): người chơi đi đúng nước Rapfi chọn ở thế chưa ngã ngũ → lọc phòng thủ của engine
    // (Worker kiểm thế, chạy song song với Rapfi) chỉ còn đúng nước đó thì ghi one = 1. Thế dùng lại đã có kết quả (one).
    const onlyChecks = [];
    const onlyCheck = (i) => {
      const e = ev[i];
      if (!e || 'one' in e || e.mate || i >= Math.min(last + 1, n) || !sameMove(e.move, moves[i]) || !global.CaroRapfiBoard) return;
      onlyChecks.push(global.CaroRapfiBoard.safe(rule, moves.slice(0, i), ms).then((list) => {
        if (my === job && ev[i]) ev[i] = { ...ev[i], one: list && list.length === 1 && sameMove(list[0], moves[i]) ? 1 : 0 };
      }));
    };
    for (let i = 0; i <= last; i++) if (ev[i]) onlyCheck(i);
    const okPos = await run(todo, async (i, lane, clean) => {
      const e = await evalPos(rule, moves.slice(0, i), ms, lane, gf, clean);
      if (e) { ev[i] = { ...e, q: ms }; onlyCheck(i); fresh.push({ moves: moves.slice(0, i), e }); }
      return e;
    });
    if (!okPos) { if (two) R().auxDone(); return null; }
    // Thế sau nước tốt nhất cho các nước có thể bị đánh dấu (analysis.js altNeeded)
    const alts = [];
    for (let i = 0; i < Math.min(last + 1, n); i++) {
      if (A.altNeeded(moves, ev, i) && !ours(ev[i].alt, ms)) alts.push(i);
    }
    prog.step = (d, n) => prog(0.85 + (0.14 * d) / n);
    const altMoves = (i) => moves.slice(0, i).concat([ev[i].move]);
    if (cloud && alts.length) {
      const got = await cloud.get(rule, nodes, alts.map(altMoves));
      if (my !== job) return null;
      for (const [k, h] of got) ev[alts[k]] = { ...ev[alts[k]], alt: { ...h, q: ms, src: 'rapfi' } };
    }
    await run(alts.filter((i) => !ours(ev[i].alt, ms)), async (i, lane, clean) => {
      const mv = altMoves(i), e = await evalPos(rule, mv, ms, lane, gf, clean);
      if (e) { ev[i] = { ...ev[i], alt: { ...e, q: ms } }; fresh.push({ moves: mv, e }); }
      return e || {}; // thế sau nước tốt nhất chấm lỗi: bỏ qua thế đó, không bỏ cả lượt
    });
    if (two) R().auxDone();
    await Promise.all(onlyChecks);
    if (cloud && my === job) cloud.put(rule, nodes, fresh.map(({ moves: mv, e }) => ({ moves: mv, move: e.move, score: e.score, mate: e.mate || null })));
    return my === job ? ev : null;
  }

  /** Huỷ lượt đang chạy (mở ván khác): Worker Rapfi giữ nguyên (nạp lại mạng tốn thời gian), chỉ bỏ kết quả. */
  function cancel() { job++; }

  global.CaroRapfiAn = { handles, evaluate, convert, cancel };
})(window);
