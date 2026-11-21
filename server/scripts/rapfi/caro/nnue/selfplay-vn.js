/*
 * C6 (a) – sinh dữ liệu luật Việt Nam (chặn hai đầu) NGAY TRONG MÁY NÀY, không cần dựng Rapfi gốc: Rapfi-CARO bản WebAssembly
 * của app (caro/rapfi/rapfi-caro-simd128.*, GPL-3 – giữ nguyên giấy phép) tự đấu qua driver-wasm.js, ghi mỗi ván một dòng:
 *   {"m":[[x,y],…],"w":1|2|0,"n":20,"src":"rapfi-caro-wasm","open":k,"ev":[điểm trước nước i, góc nhìn bên tới lượt]}
 * Cùng định dạng selfplay.js / games-to-binpack.js (thêm --eval để ghi điểm vào .binpack làm nhãn phụ bên cạnh kết quả).
 *   node server/scripts/rapfi/caro/nnue/selfplay-vn.js <số ván> <ms mỗi nước> <hạt giống> > out.jsonl
 * Khai cuộc: 3–5 quân ngẫu nhiên đúng luật trong ô 7×7 quanh tâm (như selfplay.js), hạt giống cố định → chạy lại ra đúng
 * khai cuộc. Bàn 20×20 (như dữ liệu luyện mạng – games-to-binpack.js). Rapfi-CARO luật vn hiện dùng bảng đánh giá cổ điển
 * (chưa có mạng NNUE vn – mục đích của việc này), nên nhãn "ev" là điểm tìm kiếm của bảng cổ điển.
 * In tốc độ (ván / phút, thế / giây) ra stderr để ước lượng thời gian (docs/nnue-caro-ke-hoach.md).
 */
'use strict';
const C = require('../../../../../caro/rules.js');
const { Rapfi } = require('../../driver-wasm.js');

const [N, MS, SEED] = process.argv.slice(2);
const SIZE = 20, OFF = SIZE >> 1, RULE_VN = 8; // Rapfi-CARO: luật caro mã 8 ở giao thức Gomocup (driver-wasm.js)
let s = +SEED || 1;
const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };

/** Khai cuộc ngẫu nhiên đúng luật (không ai thắng trong khai cuộc). */
function opening(b) {
  const mv = [];
  const n0 = 3 + Math.floor(rnd() * 3);
  b.play(OFF, OFF, C.X); mv.push([OFF, OFF]);
  while (mv.length < n0) {
    const x = OFF + Math.floor(rnd() * 7) - 3, y = OFF + Math.floor(rnd() * 7) - 3, q = mv.length % 2 ? C.O : C.X;
    if (b.get(x, y)) continue;
    b.play(x, y, q);
    if (C.checkWin(b, x, y, q)) { b.undo(); continue; }
    mv.push([x, y]);
  }
  return mv;
}

async function main() {
  if (!N || !MS) { console.error('Dùng: node selfplay-vn.js <số ván> <ms mỗi nước> <hạt giống>'); process.exit(1); }
  const rp = new Rapfi(SIZE, RULE_VN, +MS);
  await rp.init();
  const t0 = Date.now();
  let plies = 0;
  const tally = { 1: 0, 2: 0, 0: 0 };
  for (let g = 0; g < +N; g++) {
    const b = new C.Board('vn');
    const mv = opening(b);
    const n0 = mv.length, ev = [];
    let w = 0;
    while (!w && mv.length < SIZE * SIZE - 1) {
      const q = mv.length % 2 ? C.O : C.X;
      const mm = await rp.move(mv);
      ev[mv.length] = mm.ev;
      const [x, y] = mm;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || b.get(x, y) !== C.EMPTY) { w = 3 - q; break; } // nước hỏng: xử thua
      b.play(x, y, q); mv.push([x, y]); plies++;
      if (C.checkWin(b, x, y, q)) w = q;
    }
    tally[w]++;
    process.stdout.write(JSON.stringify({ m: mv, w, n: SIZE, src: 'rapfi-caro-wasm', open: n0, ev }) + '\n');
  }
  const sec = (Date.now() - t0) / 1000;
  console.error(`[selfplay-vn] ${N} ván · ${plies} thế · ${sec.toFixed(1)} s · ${(N / sec * 60).toFixed(1)} ván/phút · ${(plies / sec).toFixed(1)} thế/giây · X thắng ${tally[1]}, O thắng ${tally[2]}, hoà ${tally[0]}`);
  rp.quit();
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { opening };
