/*
 * Đấu engine của game với Rapfi trên bộ khai cuộc cân bằng (openings.json), mỗi khai cuộc 2 ván đổi bên.
 *   node server/scripts/rapfi/match.js <luật free|std|renju> <số khai cuộc> <ms của ta> <ms của Rapfi> [mảnh i] [số mảnh] [opts JSON]
 * In từng ván một dòng JSON { k, swap, winner, ourSide, n }; chạy nhiều mảnh song song rồi cộng lại (xem README.md).
 * Rapfi không có luật Việt Nam. Bàn: tự do 20×20, tiêu chuẩn / Renju 15×15 (nước của ta ra ngoài bàn = thua).
 */
'use strict';
const path = require('path');
const CARO = path.join(__dirname, '../../../caro');
const EN = require(process.env.ENGINE || path.join(CARO, 'engine.js'));
const C = require(path.join(CARO, 'rules.js'));
const OPEN = require('../openings.json');
const [rule, NOPEN, MS, RMS, SHARD = '0', NSHARD = '1', OPTS] = process.argv.slice(2);
const extra = OPTS ? JSON.parse(OPTS) : {};
const SIZE = rule === 'free' ? 20 : 15, OFF = SIZE >> 1, RULE_N = { free: 0, std: 1, renju: 4 }[rule];

const { Rapfi } = require('./driver.js');

(async () => {
  const rp = new Rapfi(SIZE, RULE_N, +RMS); await rp.init();
  const ops = OPEN[rule].slice(0, +NOPEN);
  for (let k = +SHARD; k < ops.length; k += +NSHARD) {
    for (const swap of [false, true]) {
      const ourSide = swap ? C.O : C.X; // swap: ta cầm O
      const b = new C.Board(rule), mv = [];
      ops[k].forEach(([x, y], i) => { b.play(x, y, i % 2 ? C.O : C.X); mv.push([x, y]); });
      let winner = 0;
      while (!winner && mv.length < 200) {
        const p = mv.length % 2 ? C.O : C.X;
        let m;
        if (p === ourSide) m = EN.analyse(mv, { ms: +MS, rule, ...extra }).move;
        else { const r = await rp.move(mv.map(([x, y]) => [x + OFF, y + OFF])); m = [r[0] - OFF, r[1] - OFF]; }
        const [x, y] = m;
        if (x + OFF < 0 || y + OFF < 0 || x + OFF >= SIZE || y + OFF >= SIZE || b.get(x, y) !== C.EMPTY) { winner = 3 - p; break; }
        b.play(x, y, p); mv.push(m);
        if (C.checkWin(b, x, y, p)) winner = p;
      }
      console.log(JSON.stringify({ k, swap, winner, ourSide, n: mv.length, restarts: rp.restarts }));
    }
  }
  rp.quit();
})();
