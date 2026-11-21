'use strict';
// Dây chuyền NNUE luật Việt Nam (server/scripts/rapfi/caro/nnue/) – các phần sửa theo điều tra 21/11/2026
// (docs/nnue-caro-dieu-tra-21-11-2026.md): khai cuộc ngẫu nhiên / cân bằng, bộ khai cuộc đấu chọn để riêng, làm sạch dữ liệu.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const C = require('../../caro/rules.js');
const B = require('../../caro/book.js');

const DIR = path.join(__dirname, '../scripts/rapfi/caro/nnue');
const L = require(path.join(DIR, 'openings-lib.js'));

test('openings-lib: chuỗi thế ↔ nước, dời vào giữa bàn, PRNG có hạt giống', () => {
  assert.deepStrictEqual(L.parsePos('h8i9'), [[7, 7], [8, 8]]);
  assert.deepStrictEqual(L.parsePos('j10k11'), [[9, 9], [10, 10]]);
  assert.strictEqual(L.parsePos('h8 x'), null, 'chuỗi hỏng');
  assert.strictEqual(L.parsePos(''), null);
  assert.strictEqual(L.formatPos([[7, 7], [8, 8]]), 'h8i9');
  assert.deepStrictEqual(L.centerOn([[0, 0], [2, 1]], 20), [[8, 9], [10, 10]]);
  assert.strictEqual(L.centerOn([[0, 0], [25, 0]], 20), null, 'rộng hơn bàn');
  const a = L.prng(5), b = L.prng(5), c = L.prng(6);
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, [c(), c(), c()]);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
});

test('openings-lib: khai cuộc ngẫu nhiên đúng luật, trong ô quanh tâm, không ai thắng', () => {
  const rnd = L.prng(11);
  for (let i = 0; i < 200; i++) {
    const mv = L.randomOpening(rnd, { min: 3, max: 7, box: 7 });
    assert.ok(mv.length >= 3 && mv.length <= 7);
    assert.ok(mv.every(([x, y]) => Math.abs(x) <= 3 && Math.abs(y) <= 3));
    assert.strictEqual(new Set(mv.map(String)).size, mv.length);
    const b = new C.Board('vn');
    mv.forEach(([x, y], k) => { const p = k % 2 ? C.O : C.X; b.play(x, y, p); assert.strictEqual(C.checkWin(b, x, y, p), null); });
  }
});

test('make-openings: thêm khai cuộc ngẫu nhiên, không trùng nhau / bộ đo / EXCLUDE, cùng hạt giống cùng bộ', () => {
  const { build } = require(path.join(DIR, 'make-openings.js'));
  const arena = build({ book: false, random: 60, seed: 977 });
  assert.strictEqual(arena.length, 60);
  assert.deepStrictEqual(build({ book: false, random: 60, seed: 977 }), arena, 'tất định theo hạt giống');
  const sp = build({ book: false, random: 300, seed: 1, exclude: arena.map(L.parsePos) });
  assert.strictEqual(sp.length, 300);
  const key = (s) => B.canon(L.parsePos(s)).key;
  const ak = new Set(arena.map(key));
  assert.ok(sp.every((s) => !ak.has(key(s))), 'bộ tự đấu không chứa thế của bộ đấu chọn (kể cả sau xoay / lật)');
  assert.strictEqual(new Set(sp.map(key)).size, sp.length, 'không trùng nhau');
  const OPEN = require('../scripts/openings.json').vn;
  const ok = new Set(OPEN.map((o) => B.canon(o).key));
  assert.ok(sp.concat(arena).every((s) => !ok.has(key(s))), 'không trùng openings.json');
  for (const s of sp.slice(0, 50)) {
    const mv = L.parsePos(s);
    assert.ok(mv.every(([x, y]) => x >= 0 && y >= 0 && x < 20 && y < 20));
  }
  // Sách: vẫn có như trước
  assert.ok(build({}).length > 100);
  // Dòng lệnh: RANDOM + EXCLUDE
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-op-'));
  fs.writeFileSync(path.join(dir, 'a.txt'), arena.join('\n') + '\n');
  execFileSync(process.execPath, [path.join(DIR, 'make-openings.js'), path.join(dir, 's.txt')],
    { env: { ...process.env, NO_BOOK: '1', RANDOM: '40', SEED: '3', EXCLUDE: path.join(dir, 'a.txt') }, stdio: 'pipe' });
  const lines = fs.readFileSync(path.join(dir, 's.txt'), 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 40);
  assert.ok(lines.every((s) => !ak.has(key(s))));
  assert.strictEqual(L.readFile(path.join(dir, 's.txt')).length, 40);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('bộ khai cuộc dựng sẵn: openings/arena.txt và openings/selfplay.txt tách rời, đọc được', () => {
  const arena = L.readFile(path.join(DIR, 'openings/arena.txt'));
  const sp = L.readFile(path.join(DIR, 'openings/selfplay.txt'));
  assert.ok(arena.length >= 400, 'đủ 400 cặp cho đấu chọn');
  assert.ok(sp.length >= 5000, 'đủ nhiều thế cho tự đấu');
  const ak = new Set(arena.map((m) => B.canon(m).key));
  assert.ok(sp.every((m) => !ak.has(B.canon(m).key)), 'không thế nào của bộ đấu chọn nằm trong bộ tự đấu');
});

test('arena: khai cuộc từ ARENA_OPENINGS_FILE (toạ độ bàn 20×20 → toạ độ game), bộ cũ khi không có file', () => {
  const A = require(path.join(DIR, 'arena.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-ar-'));
  const f = path.join(dir, 'a.txt');
  fs.writeFileSync(f, 'k11l12\nj10\n\nk11k12l12\n');
  assert.deepStrictEqual(A.openings(5, 0, f), [[[0, 0], [1, 1]], [[-1, -1]], [[0, 0], [0, 1], [1, 1]]]);
  assert.deepStrictEqual(A.openings(1, 2, f), [[[0, 0], [0, 1], [1, 1]]], 'bắt đầu từ dòng FROM');
  const old = A.openings(70, 32, '');
  assert.strictEqual(old.length, 70);
  assert.strictEqual(A.extraOpenings(3, []).length, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('balance-openings: giữ thế có điểm và |điểm| ≤ cửa sổ', () => {
  const Bo = require(path.join(DIR, 'balance-openings.js'));
  assert.strictEqual(Bo.keep(120, 150), true);
  assert.strictEqual(Bo.keep(-150, 150), true);
  assert.strictEqual(Bo.keep(151, 150), false);
  assert.strictEqual(Bo.keep(null, 150), false, 'không có điểm (Rapfi chưa xong độ sâu 1)');
  assert.strictEqual(Bo.keep(20000, 150), false);
  assert.deepStrictEqual([null, 20000, -40, 120, 200, 900, 5000].map(Bo.bucket),
    ['không có điểm', 'thắng/thua chắc', '≤50', '≤150', '≤300', '≤1000', '>1000']);
});

test('clean-binpack.py: tự kiểm (bỏ ván trùng sau xoay / lật, ván lỗi VALUE_NONE, khác luật)', (t) => {
  const py = spawnSync('python3', ['--version']);
  if (py.status !== 0) return t.skip('không có python3');
  const out = execFileSync('python3', [path.join(DIR, 'clean-binpack.py'), '--self-test'], { encoding: 'utf8' });
  assert.match(out, /tự kiểm OK/);
});

test('bản vá tự đấu: thử lại khi VALUE_NONE, bỏ ván không có điểm; setup.sh áp sau bản vá luật caro', () => {
  const patch = fs.readFileSync(path.join(DIR, 'rapfi-caro-selfplay.patch'), 'utf8');
  assert.match(patch, /^--- a\/Rapfi\/command\/selfplay\.cpp$/m);
  assert.match(patch, /rootMoves\[0\]\.value == VALUE_NONE/);
  assert.match(patch, /RESULT_UNKNOWN/);
  const setup = fs.readFileSync(path.join(DIR, 'setup.sh'), 'utf8');
  assert.match(setup, /rapfi-caro\.patch" && patch -s -p1 < "\$HERE\/rapfi-caro-selfplay\.patch"/);
  const lib = fs.readFileSync(path.join(DIR, 'lib.sh'), 'utf8');
  assert.match(lib, /--budget-distribution uniform/, 'số nút ngẫu nhiên – ván không tất định');
  assert.doesNotMatch(lib, /--budget-distribution fixed/);
});
