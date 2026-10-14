/*
 * Đo BOAT đúng như trong app (boat-rapfi.js) trên bàn VÔ HẠN: mỗi nước đặt khung bao các quân vào giữa bàn Rapfi
 * (tự do 20×20, tiêu chuẩn / Renju 15×15); cách mép < 4 ô thì engine của game kiểm chuỗi ép của cả hai bên và sửa nước
 * Rapfi khi cần; không vừa bàn thì engine của game đi. Đối thủ: engine của game (BOAT cũ, 3 giây / nước).
 *   node server/scripts/rapfi/boat-match.js <luật free|std|renju|vn> <số khai cuộc> <ms Rapfi> <ms đối thủ> [mảnh i] [số mảnh]
 * In từng ván một dòng JSON { k, swap, winner, boatSide, n, rapfi, fallback, fixed }. Cần RAPFI_NETS (xem driver-wasm.js).
 * RAPFI=native: dùng bản dựng gốc (driver.js, RAPFI_DIR) thay cho WebAssembly. Luật vn (Rapfi có thêm luật caro – mã 8):
 * bàn Rapfi 20×20.
 * OPEN_FROM=k: bắt đầu từ khai cuộc thứ k. ms Rapfi nhỏ (vd. 600) ≈ BOAT 2,5 giây trên điện thoại chậm hơn máy đo ~4 lần.
 */
'use strict';
const path = require('path');
const CARO = path.join(__dirname, '../../../caro');
const EN = require(path.join(CARO, 'engine.js'));
const C = require(path.join(CARO, 'rules.js'));
const OPEN = require('../openings.json');
const { Rapfi } = require(process.env.RAPFI === 'native' ? './driver.js' : './driver-wasm.js');
const [rule, NOPEN, RMS, MS, SHARD = '0', NSHARD = '1'] = process.argv.slice(2);
const SIZE = { free: 20, std: 15, renju: 15, vn: 20 }[rule], RULE_N = { free: 0, std: 1, renju: 4, vn: 8 }[rule];
const SAFE_EDGE = 4, CHECK_MS = 400;

// Như boat-rapfi.js · frame (giữ hai bản giống nhau)
function frame(moves, n) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of moves) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w > n - 2 || h > n - 2) return null;
  const lx = Math.floor((n - w) / 2), ly = Math.floor((n - h) / 2);
  return { ox: x0 - lx, oy: y0 - ly, margin: Math.min(lx, n - w - lx, ly, n - h - ly) };
}

(async () => {
  const rp = new Rapfi(SIZE, RULE_N, +RMS); await rp.init();
  const from = +(process.env.OPEN_FROM || 0); // OPEN_FROM=k: dùng khai cuộc k…k+NOPEN−1 (đo lại trên bộ khác)
  const ops = OPEN[rule].slice(from, from + +NOPEN);
  for (let k = +SHARD; k < ops.length; k += +NSHARD) {
    for (const swap of [false, true]) {
      const boatSide = swap ? C.O : C.X;
      const b = new C.Board(rule), mv = [];
      ops[k].forEach(([x, y], i) => { b.play(x, y, i % 2 ? C.O : C.X); mv.push([x, y]); });
      let winner = 0;
      const st = { rapfi: 0, fallback: 0, fixed: 0 };
      while (!winner && mv.length < 225) {
        const p = mv.length % 2 ? C.O : C.X;
        if (process.env.TRACE) process.stderr.write(`[${mv.length}${p === boatSide ? 'R' : 'E'}] `);
        let m = null;
        if (p === boatSide) {
          const f = frame(mv, SIZE);
          if (f) {
            // Luật vn: engine của game (có bộ giải VCT luật Việt Nam) luôn kiểm nước của Rapfi (CHECK=0 để tắt)
            const near = f.margin < SAFE_EDGE || (rule === 'vn' && process.env.CHECK !== '0');
            rp.ms = near ? Math.max(Math.min(800, +RMS), +RMS - 2 * CHECK_MS) : +RMS;
            rp.send('INFO timeout_turn ' + rp.ms);
            const r = await rp.move(mv.map(([x, y]) => [x - f.ox, y - f.oy]));
            m = [r[0] + f.ox, r[1] + f.oy];
            if (b.get(m[0], m[1]) !== C.EMPTY || (C.forbidden && C.forbidden(b, m[0], m[1], p))) m = null;
            else if (near) {
              const mine = EN.analyse(mv, { ms: CHECK_MS, rule });
              const after = EN.analyse(mv.concat([m]), { ms: CHECK_MS, rule });
              const keeps = after.mate < 0;
              if ((mine.mate > 0 && !keeps) || (after.mate > 0 && !(mine.mate < 0))) {
                if (mine.move[0] !== m[0] || mine.move[1] !== m[1]) { st.fixed++; m = mine.move; }
              }
            }
            if (m) st.rapfi++;
          }
          if (!m) { st.fallback++; m = EN.analyse(mv, { ms: +MS, rule, vctDepth: 10 }).move; }
        } else m = EN.analyse(mv, { ms: +MS, rule, vctDepth: 10 }).move;
        const [x, y] = m;
        if (b.get(x, y) !== C.EMPTY) { winner = 3 - p; break; }
        b.play(x, y, p); mv.push(m);
        if (C.checkWin(b, x, y, p)) winner = p;
      }
      console.log(JSON.stringify({ k, swap, winner, boatSide, n: mv.length, ...st, ...(process.env.MOVES ? { mv } : {}) }));
    }
  }
  rp.quit(); // bản gốc là tiến trình con: không dừng thì Node chờ mãi
  setTimeout(() => process.exit(0), 500);
})();
