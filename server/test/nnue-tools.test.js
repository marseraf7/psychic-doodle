'use strict';
// C6: công cụ NNUE luật Việt Nam – SPRT / Elo ± 95 % (sprt.js), khai cuộc tự đấu đúng luật (selfplay-vn.js),
// ghi điểm tìm kiếm vào .binpack (games-to-binpack.js EVAL=1).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const S = require('../scripts/rapfi/caro/nnue/sprt.js');
const C = require('../../caro/rules.js');

test('Elo / khoảng 95 % / SPRT', () => {
  assert.ok(Math.abs(S.elo(50, 0, 50)) < 1e-9);
  assert.ok(Math.abs(S.elo(76, 0, 24) - 200) < 3, 'điểm 76 % ≈ +200 Elo');
  const [lo, hi] = S.eloCi(260, 0, 240);
  assert.ok(lo < S.elo(260, 0, 240) && S.elo(260, 0, 240) < hi && lo < 0 && hi > 0, '500 ván 52 %: khoảng tin cậy còn chứa 0');
  assert.deepStrictEqual(S.eloCi(0, 0, 0), [-Infinity, Infinity]);
  assert.strictEqual(S.sprt(600, 0, 400).decision, 'H1', '60 % sau 1000 ván: chấp nhận H1');
  assert.strictEqual(S.sprt(380, 0, 620).decision, 'H0');
  assert.strictEqual(S.sprt(11, 0, 9).decision, 'continue', '20 ván: chưa đủ');
  assert.strictEqual(S.llr(0, 0, 0), 0);
  assert.strictEqual(S.llr(0, 10, 0), 0, 'toàn hoà: phương sai 0');
  const r = S.sprt(510, 20, 470, { elo0: 0, elo1: 5 });
  assert.ok(r.a < 0 && r.b > 0);
  assert.ok(Math.abs(S.eloOf(S.scoreOf(123)) - 123) < 1e-9);
  const out = execFileSync(process.execPath, [path.join(__dirname, '../scripts/rapfi/caro/nnue/sprt.js'), '600', '0', '400'], { encoding: 'utf8' });
  assert.match(out, /Elo \+70\.4/);
  assert.match(out, /thay mạng/);
});

test('selfplay-vn: khai cuộc 3–5 quân đúng luật Việt Nam, không ai thắng sẵn', () => {
  const { opening } = require('../scripts/rapfi/caro/nnue/selfplay-vn.js');
  for (let i = 0; i < 30; i++) {
    const b = new C.Board('vn');
    const mv = opening(b);
    assert.ok(mv.length >= 3 && mv.length <= 5);
    assert.deepStrictEqual(mv[0], [10, 10]);
    assert.ok(mv.every(([x, y]) => Math.abs(x - 10) <= 3 && Math.abs(y - 10) <= 3));
    assert.strictEqual(new Set(mv.map(String)).size, mv.length);
  }
});

test('games-to-binpack EVAL=1: điểm vào PackedMove (isNoEval = 0), thế không điểm vẫn isNoEval = 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-bp-'));
  const src = path.join(dir, 'g.jsonl'), out = path.join(dir, 'g.bin');
  const m = [[10, 10], [11, 11], [10, 11], [12, 12], [10, 12], [13, 13], [10, 13]]; // X 4 quân cột 10 (O chặn đầu trên? không – thắng 4 mở)
  fs.writeFileSync(src, JSON.stringify({ m, w: 1, ev: [null, -50, 80, 40000, 200, -300, 20000] }) + '\n');
  execFileSync(process.execPath, [path.join(__dirname, '../scripts/rapfi/caro/games-to-binpack.js'), out, src], { env: { ...process.env, EVAL: '1' } });
  const buf = fs.readFileSync(out);
  const n = buf.length / 4 - 2;
  assert.ok(n >= 5);
  const flags = (i) => buf.readUInt16LE(8 + 4 * i) & 7, ev = (i) => buf.readInt16LE(10 + 4 * i);
  assert.strictEqual(flags(0), 7, 'nước 1 không có điểm: isNoEval');
  assert.deepStrictEqual([flags(1), ev(1)], [3, -50]);
  assert.strictEqual(ev(3), 32000, 'kẹp vào int16');
  execFileSync(process.execPath, [path.join(__dirname, '../scripts/rapfi/caro/games-to-binpack.js'), out, src], { env: { ...process.env, EVAL: '' } });
  assert.strictEqual(fs.readFileSync(out).readUInt16LE(12) & 7, 7, 'không bật EVAL: như cũ');
  fs.rmSync(dir, { recursive: true, force: true });
});
