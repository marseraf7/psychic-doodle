/*
 * Đấu hai bản Rapfi-CARO (bản gốc) luật Việt Nam trên bàn 20×20 – để chọn mạng NNUE tốt hơn trong vòng luyện:
 *   node arena.js <thư mục A> <thư mục B> <số khai cuộc> <ms mỗi nước> [khai cuộc từ = 32] [mảnh i] [số mảnh]
 * Mỗi thư mục chạy là pbrain-rapfi + config.toml (+ bảng / mạng). Mỗi khai cuộc (server/scripts/openings.json, luật vn;
 * mặc định từ khai cuộc 32 – 0–31 để dành đo với engine của game) đấu 2 ván đổi bên.
 * In mỗi ván một dòng JSON { k, aIsX, winner: 'A' | 'B' | null, n }, cuối cùng dòng tổng { a, b, draws, games, score }
 * (score = tỉ lệ điểm của A).
 */
'use strict';
const path = require('path');
const C = require('../../../../../caro/rules.js');
const OPEN = require('../../../openings.json').vn;
const DRIVER = path.join(__dirname, '../../driver.js');

const [dirA, dirB, NOPEN, MS, FROM = '32', SHARD = '0', NSHARD = '1'] = process.argv.slice(2);
const N = 20, MAX_PLY = 300;

/** Một tiến trình Rapfi-CARO chạy ở thư mục dir (driver.js đọc RAPFI_DIR khi nạp – nạp riêng cho mỗi thư mục). */
function engine(dir) {
  process.env.RAPFI_DIR = dir;
  delete require.cache[require.resolve(DRIVER)];
  const { Rapfi } = require(DRIVER);
  return new Rapfi(N, 8, +MS);
}

/** Toạ độ game → bàn Rapfi: đặt khai cuộc vào giữa bàn (khai cuộc nhỏ nên ván hiếm khi chạm mép). */
const OFF = 10;

(async () => {
  const A = engine(dirA), B = engine(dirB);
  await A.init(); await B.init();
  const tally = { a: 0, b: 0, draws: 0, games: 0 };
  const ops = OPEN.slice(+FROM, +FROM + +NOPEN);
  for (let k = +SHARD; k < ops.length; k += +NSHARD) {
    for (const aIsX of [true, false]) {
      const b = new C.Board('vn'), mv = [];
      ops[k].forEach(([x, y], i) => { b.play(x, y, i % 2 ? C.O : C.X); mv.push([x + OFF, y + OFF]); });
      let winner = null;
      while (!winner && mv.length < MAX_PLY) {
        const p = mv.length % 2 ? C.O : C.X;
        const aTurn = (p === C.X) === aIsX;
        const r = await (aTurn ? A : B).move(mv);
        const [x, y] = [r[0] - OFF, r[1] - OFF];
        if (r[0] < 0 || r[1] < 0 || r[0] >= N || r[1] >= N || b.get(x, y) !== C.EMPTY) { winner = aTurn ? 'B' : 'A'; break; }
        b.play(x, y, p); mv.push([r[0], r[1]]);
        if (C.checkWin(b, x, y, p)) winner = aTurn ? 'A' : 'B';
      }
      tally.games++;
      if (winner === 'A') tally.a++; else if (winner === 'B') tally.b++; else tally.draws++;
      console.log(JSON.stringify({ k: +FROM + k, aIsX, winner, n: mv.length }));
    }
  }
  console.log(JSON.stringify({ ...tally, score: (tally.a + tally.draws / 2) / Math.max(1, tally.games) }));
  A.quit(); B.quit();
  setTimeout(() => process.exit(0), 300);
})();
