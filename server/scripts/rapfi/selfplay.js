// Rapfi tự đấu sinh ván chất lượng vô địch để engine của game học (chưng cất – distillation).
//   node server/scripts/rapfi/selfplay.js <luật free|std|renju> <số ván> <ms mỗi nước> <hạt giống> > out.jsonl
// Dùng được cho train-policy.js (nước của Rapfi) và tune-eval.js (LABEL=ev EVSCALE=150: điểm của Rapfi làm nhãn).
// Mỗi ván mở bằng 3–5 quân ngẫu nhiên trong ô 7×7 quanh tâm (đúng luật), rồi Rapfi đánh cả hai bên.
// Ra cùng định dạng gomocup-import.js: {"m":[[x,y],…],"w":1|2|0,"n":kích thước,"src":"rapfi"} (toạ độ 0..n-1), thêm
// ev[i] = điểm Rapfi của thế trước nước i (góc nhìn bên tới lượt; ±20000 = thắng / thua chắc).
'use strict';
const C = require('../../../caro/rules.js');
const [rule, N, MS, SEED] = process.argv.slice(2);
const SIZE = rule === 'free' ? 20 : 15, OFF = SIZE >> 1, RULE_N = { free: 0, std: 1, renju: 4 }[rule];
let s = +SEED || 1;
const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };

const { Rapfi } = require('./driver.js');
const rp = new Rapfi(SIZE, RULE_N, +MS);

(async () => {
  await rp.init();
  for (let g = 0; g < +N; g++) {
    const b = new C.Board(rule), mv = [];
    const n0 = 3 + Math.floor(rnd() * 3);
    b.play(OFF, OFF, C.X); mv.push([OFF, OFF]);
    while (mv.length < n0) {
      const x = OFF + Math.floor(rnd() * 7) - 3, y = OFF + Math.floor(rnd() * 7) - 3, q = mv.length % 2 ? C.O : C.X;
      if (b.get(x, y) || C.forbidden(b, x, y, q)) continue;
      b.play(x, y, q); mv.push([x, y]);
    }
    let w = 0;
    const ev = [];
    while (!w && mv.length < SIZE * SIZE - 1) {
      const q = mv.length % 2 ? C.O : C.X;
      const mm = await rp.move(mv);
      const [x, y] = mm;
      ev[mv.length] = mm.ev;
      if (b.get(x, y) !== C.EMPTY) { w = 3 - q; break; }
      b.play(x, y, q); mv.push([x, y]);
      if (C.checkWin(b, x, y, q)) w = q;
    }
    process.stdout.write(JSON.stringify({ m: mv, w, n: SIZE, src: 'rapfi/' + rule, open: n0, ev }) + '\n');
  }
  rp.quit();
})();
