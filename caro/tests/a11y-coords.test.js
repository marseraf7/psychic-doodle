// Trợ năng (C5): tên ô, đọc lệnh gõ chữ, nước đe doạ, bước con trỏ – caro/a11y-coords.js.
// Chạy: node --test caro/tests/a11y-coords.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const A = require('../a11y-coords.js');
const Caro = require('../rules.js');

test('Tên ô: tâm là h8, cột trái → phải, hàng dưới → trên; ra ngoài khung vẫn đếm tiếp', () => {
  assert.strictEqual(A.name(0, 0), 'h8');
  assert.strictEqual(A.name(-7, 7), 'a1');
  assert.strictEqual(A.name(7, -7), 'o15');
  assert.strictEqual(A.name(8, 0), 'p8');
  assert.strictEqual(A.name(-8, 0), '-a8');
  assert.strictEqual(A.name(0, 8), 'h0');
  assert.strictEqual(A.name(0, 10), 'h-2');
  assert.strictEqual(A.name(26 - 7, 0), 'aa8');
  assert.strictEqual(A.letters(0), 'a');
  assert.strictEqual(A.letters(25), 'z');
  assert.strictEqual(A.letters(26), 'aa');
});

test('Đọc tên ô: gõ lại tên là về đúng ô (cả ngoài khung, chữ hoa, khoảng trắng)', () => {
  for (let x = -40; x <= 40; x += 3) for (let y = -30; y <= 30; y += 7) assert.deepStrictEqual(A.parse(A.name(x, y)), [x, y], A.name(x, y));
  assert.deepStrictEqual(A.parse(' H8 '), [0, 0]);
  assert.deepStrictEqual(A.parse('h 9'), [0, -1]);
  assert.strictEqual(A.parse('8h'), null);
  assert.strictEqual(A.parse(''), null);
  assert.strictEqual(A.parse(null), null);
  assert.strictEqual(A.parse('abcd1'), null);
});

test('Lệnh gõ chữ: ô → nước đi, từ khoá 4 ngôn ngữ → lệnh, chữ lạ → null', () => {
  assert.deepStrictEqual(A.command('h8'), { kind: 'move', x: 0, y: 0 });
  assert.deepStrictEqual(A.command('UNDO'), { kind: 'undo' });
  assert.deepStrictEqual(A.command('đi lại'), { kind: 'undo' });
  assert.deepStrictEqual(A.command('новая'), { kind: 'new' });
  assert.deepStrictEqual(A.command('威胁'), { kind: 'threats' });
  assert.deepStrictEqual(A.command('?'), { kind: 'help' });
  for (const k of ['last', 'list', 'status']) assert.deepStrictEqual(A.command(k), { kind: k });
  assert.strictEqual(A.command('xin chào'), null);
  assert.strictEqual(A.command('   '), null);
});

test('Nước đe doạ: 4 quân bị chặn một đầu (luật Việt Nam) → đúng một ô thắng; 4 mở → hai ô', () => {
  const b = new Caro.Board('vn');
  b.play(-1, 0, Caro.O); // chặn đầu trái
  for (let x = 0; x < 4; x++) b.play(x, 0, Caro.X);
  assert.deepStrictEqual(A.threats(Caro, b, Caro.X), [[4, 0]]);
  assert.deepStrictEqual(A.threats(Caro, b, Caro.O), []);
  const f = new Caro.Board('free');
  for (let x = 0; x < 4; x++) f.play(x, 0, Caro.X);
  const t = A.threats(Caro, f, Caro.X).map(String).sort();
  assert.deepStrictEqual(t, ['-1,0', '4,0']);
  assert.strictEqual(A.threats(Caro, f, Caro.X, 1).length, 1, 'giới hạn số ô');
});

test('Bước con trỏ: theo mũi tên, đổi trục khi bàn đã quay, phím khác → null', () => {
  assert.deepStrictEqual(A.step([0, 0], 'ArrowRight'), [1, 0]);
  assert.deepStrictEqual(A.step([0, 0], 'ArrowUp'), [0, -1]);
  const quay90 = (a, b) => [b, -a]; // giả lập bàn đã quay
  assert.deepStrictEqual(A.step([2, 2], 'ArrowRight', quay90), [2, 1]);
  assert.strictEqual(A.step([0, 0], 'Enter'), null);
});
