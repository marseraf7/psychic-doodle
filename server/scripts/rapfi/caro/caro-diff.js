// Kiểm thử sai khác Rapfi-CARO (bản vá rapfi-caro.patch) với rules.js (luật vn), GPL-3 như Rapfi:
//  1) ô "thắng ngay" (Pattern4 = A, lệnh TRACEBOARD) trên thế ngẫu nhiên; 2) thế phải chặn / có nước thắng: Rapfi đi đúng.
//   RAPFI_DIR=<thư mục có pbrain-rapfi (bản vá) + config.toml> node server/scripts/rapfi/caro/caro-diff.js <số thế> <hạt giống>
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const C = require(path.join(__dirname, '../../../../caro/rules.js'));
const N = +(process.argv[2] || 200);
let seed = +(process.argv[3] || 1);
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const SIZE = 20, LO = 6, HI = 13; // quân trong [LO, HI]; chỉ so ô trong [LO-1, HI+1] (cách tường ≥ 5)

const DIR = process.env.RAPFI_DIR;
const p = spawn(path.join(DIR, 'pbrain-rapfi'), [], { cwd: DIR });
let buf = '', waiters = [];
p.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
    if (waiters.length) waiters[0].lines.push(line);
    if (waiters.length && waiters[0].done(line)) { const w = waiters.shift(); w.res(w.lines); }
  }
});
const send = (s) => p.stdin.write(s + '\n');
const until = (done) => new Promise((res) => waiters.push({ lines: [], done, res }));

/** Sinh thế ngẫu nhiên hợp lệ (chưa ai thắng) bằng cách đặt quân thay phiên vào ô gần các quân sẵn có. */
function randomPosition() {
  for (;;) {
    const b = new C.Board('vn'), mv = [];
    const n = 6 + Math.floor(rnd() * 30);
    let ok = true;
    for (let k = 0; k < n; k++) {
      const q = k % 2 ? C.O : C.X;
      let x, y, tries = 0;
      do {
        if (mv.length && rnd() < 0.85) { const [bx, by] = mv[Math.floor(rnd() * mv.length)]; x = bx + Math.floor(rnd() * 5) - 2; y = by + Math.floor(rnd() * 5) - 2; }
        else { x = LO + Math.floor(rnd() * (HI - LO + 1)); y = LO + Math.floor(rnd() * (HI - LO + 1)); }
        tries++;
      } while ((x < LO || x > HI || y < LO || y > HI || b.get(x, y) !== C.EMPTY) && tries < 200);
      if (tries >= 200) { ok = false; break; }
      b.play(x, y, q); mv.push([x, y]);
      if (C.checkWin(b, x, y, q)) { ok = false; break; }
    }
    if (ok) return { b, mv };
  }
}

function parseGrid(lines, title) {
  const i = lines.findIndex((l) => l.includes(title));
  const rows = [];
  for (let r = 0; r < SIZE; r++) rows.push(lines[i + 1 + r].replace(/^MESSAGE /, '').trim().split(/\s+/).slice(0, SIZE));
  return rows; // rows[y][x]
}

(async () => {
  await (send('START ' + SIZE), until((l) => l === 'OK'));
  send('INFO rule 8');
  let positions = 0, cells = 0, bad = 0, wins = 0, defTests = 0, defBad = 0, missWin = 0;
  for (let t = 0; t < N; t++) {
    const { b, mv } = randomPosition();
    const side = mv.length % 2; // 0: X (đen) tới lượt
    send('YXBOARD');
    mv.forEach(([x, y], i) => send(`${x},${y},${i % 2 === side ? 1 : 2}`));
    send('DONE');
    send('TRACEBOARD');
    send('ABOUT'); // dòng name="…" đánh dấu hết phần in của TRACEBOARD
    const lines = await until((l) => /name=/.test(l));
    const stm = (lines.find((l) => /SideToMove/.test(l)) || '').includes('Black') ? C.X : C.O;
    if (stm !== (side === 0 ? C.X : C.O)) { console.log('lệch bên đi', stm, side); bad++; continue; }
    const grid = { [C.X]: parseGrid(lines, 'Pattern4----Black'), [C.O]: parseGrid(lines, 'Pattern4----White') };
    positions++;
    for (let y = LO - 1; y <= HI + 1; y++) for (let x = LO - 1; x <= HI + 1; x++) {
      if (b.get(x, y) !== C.EMPTY) continue;
      for (const q of [C.X, C.O]) {
        cells++;
        const rapfi = grid[q][y][x] === 'A';
        const ours = C.winsIfPlaced(b, x, y, q);
        if (ours) wins++;
        if (rapfi !== ours) {
          bad++;
          if (bad <= 8) console.log('KHÁC', JSON.stringify({ mv, cell: [x, y], q, rapfi, ours }));
        }
      }
    }
  }
  // Phần 2: thế bên đi phải chặn ô thắng của đối thủ – Rapfi nghĩ 100 ms rồi đi; kiểm bằng rules.js
  for (let t = 0; t < N; t++) {
    const { b, mv } = randomPosition();
    const side = mv.length % 2, me = side === 0 ? C.X : C.O, opp = C.other(me);
    const empties = [];
    for (let y = LO - 2; y <= HI + 2; y++) for (let x = LO - 2; x <= HI + 2; x++) if (b.get(x, y) === C.EMPTY) empties.push([x, y]);
    const myWin = empties.some(([x, y]) => C.winsIfPlaced(b, x, y, me));
    const oppWins = empties.filter(([x, y]) => C.winsIfPlaced(b, x, y, opp));
    if (!myWin && !oppWins.length) continue;
    // Có cách chặn hết không (vét cạn)?
    const stops = (x, y) => { b.put(x, y, me); const ok = !empties.some(([a, c]) => b.get(a, c) === C.EMPTY && C.winsIfPlaced(b, a, c, opp)); b.remove(x, y); return ok; };
    const canDefend = oppWins.length && empties.some(([x, y]) => stops(x, y));
    send('INFO timeout_turn 100');
    send('BOARD');
    mv.forEach(([x, y], i) => send(`${x},${y},${i % 2 === side ? 1 : 2}`));
    send('DONE');
    const out = await until((l) => /^\d+,\d+$/.test(l));
    const [rx, ry] = out[out.length - 1].split(',').map(Number);
    defTests++;
    if (myWin) { if (!C.winsIfPlaced(b, rx, ry, me)) { missWin++; if (missWin <= 5) console.log('BỎ LỠ THẮNG', JSON.stringify({ mv, r: [rx, ry] })); } continue; }
    if (canDefend && !stops(rx, ry)) { defBad++; if (defBad <= 5) console.log('CHẶN SAI', JSON.stringify({ mv, r: [rx, ry], oppWins })); }
  }
  console.log(`${positions} thế · ${cells} lần so · ${wins} ô thắng thật · khác ${bad}`);
  console.log(`phòng thủ / thắng ngay: ${defTests} thế · bỏ lỡ thắng ${missWin} · chặn sai ${defBad}`);
  bad += missWin + defBad;
  send('END');
  setTimeout(() => process.exit(bad ? 1 : 0), 200);
})();
