/*
 * Đấu hai bản Rapfi-CARO (bản gốc) luật Việt Nam trên bàn 20×20 – để chọn mạng NNUE tốt hơn trong vòng luyện:
 *   node arena.js <thư mục A> <thư mục B> <số khai cuộc> <ms mỗi nước> [khai cuộc từ = 32] [mảnh i] [số mảnh]
 * Mỗi thư mục chạy là pbrain-rapfi + config.toml (+ bảng / mạng). Mỗi khai cuộc (server/scripts/openings.json, luật vn;
 * mặc định từ khai cuộc 32 – 0–31 để dành đo với engine của game) đấu 2 ván đổi bên.
 * Số khai cuộc lớn hơn số khai cuộc còn lại của bộ (64 thế 32–95): phần thiếu sinh ngẫu nhiên có hạt giống cố định (5 quân
 * X-O-X-O-X quanh tâm như bộ có sẵn, không trùng nhau – cùng số thì cùng bộ, hai lần đấu chọn so được với nhau); mỗi thế vẫn đánh 2 ván đổi
 * bên nên thế lệch cũng công bằng.
 * Loại sớm (ARENA_EARLY=1, mặc định): sau ít nhất 1/2 số cặp, cận trên Elo 95% của A < 0 (A chắc chắn yếu hơn) thì dừng.
 * In mỗi ván một dòng JSON { k, aIsX, winner: 'A' | 'B' | null, n }, cuối cùng dòng tổng { a, b, draws, games, score,
 * elo, lo, hi } (score = tỉ lệ điểm của A; elo ± 95% tính theo cặp – sprt.js).
 */
'use strict';
const path = require('path');
const C = require('../../../../../caro/rules.js');
const OPEN = require('../../../openings.json').vn;
const S = require('../../../sprt.js');
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

/** Khai cuộc bổ sung: 5 quân X-O-X-O-X trong ô 7×7 quanh tâm (như bộ có sẵn), PRNG mulberry32 hạt cố định, bỏ thế trùng (kể cả với bộ có sẵn). */
function extraOpenings(count, have) {
  let seed = 0xca70;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const seen = new Set(have.map((o) => JSON.stringify(o)));
  const out = [];
  while (out.length < count) {
    const op = [[0, 0]]; // quân đầu ở tâm như bộ có sẵn
    while (op.length < 5) {
      const c = [Math.floor(rnd() * 7) - 3, Math.floor(rnd() * 7) - 3];
      if (!op.some(([x, y]) => x === c[0] && y === c[1])) op.push(c);
    }
    const key = JSON.stringify(op);
    if (!seen.has(key)) { seen.add(key); out.push(op); }
  }
  return out;
}

(async () => {
  const A = engine(dirA), B = engine(dirB);
  await A.init(); await B.init();
  const tally = { a: 0, b: 0, draws: 0, games: 0 };
  const base = OPEN.slice(+FROM, +FROM + +NOPEN);
  const ops = base.concat(extraOpenings(Math.max(0, +NOPEN - base.length), OPEN));
  const pairs = S.tally();
  const early = process.env.ARENA_EARLY !== '0' && +NSHARD === 1;
  for (let k = +SHARD; k < ops.length; k += +NSHARD) {
    const pts = [];
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
      pts.push(winner === 'A' ? 1 : winner === 'B' ? 0 : 0.5);
      console.log(JSON.stringify({ k: +FROM + k, aIsX, winner, n: mv.length }));
    }
    pairs.pair(pts[0], pts[1]);
    // Đã đánh ≥ nửa số cặp mà A chắc chắn yếu hơn: dừng, khỏi tốn thời gian đấu nốt
    if (early && k + 1 >= ops.length / 2 && S.summary(pairs).hi < 0) break;
  }
  const sm = S.summary(pairs);
  const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
  console.log(JSON.stringify({ ...tally, score: (tally.a + tally.draws / 2) / Math.max(1, tally.games), elo: r1(sm.elo), lo: r1(sm.lo), hi: r1(sm.hi) }));
  A.quit(); B.quit();
  setTimeout(() => process.exit(0), 300);
})();
