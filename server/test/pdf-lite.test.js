'use strict';
// Bộ ghi PDF tối giản (caro/pdf-lite.js – xuất PDF giải đấu Offline): cấu trúc đúng chuẩn – mọi vị trí trong bảng xref
// trỏ đúng đầu đối tượng, startxref trỏ đúng bảng xref, số trang, tiêu đề tiếng Việt (UTF-16).
const test = require('node:test');
const assert = require('node:assert');
const P = require('../../caro/pdf-lite.js');

const join = (parts) => Buffer.concat(parts.map((x) => Buffer.from(x)));
// "JPEG" giả: đủ để kiểm khung PDF (không giải mã ảnh)
const fake = (n) => ({ jpeg: new Uint8Array([0xff, 0xd8, ...Array(n).fill(7), 0xff, 0xd9]), w: 124, h: 175 });

test('pdf-lite: xref trỏ đúng từng đối tượng, startxref đúng, đủ trang', () => {
  const buf = join(P.jpegPdf([fake(50), fake(80), fake(10)], { title: 'Giải Bóng đá phường – 2026' }));
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4\n') && s.endsWith('%%EOF\n'));
  const sx = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(s)[1]);
  assert.strictEqual(s.slice(sx, sx + 4), 'xref');
  const [, first, count] = /^xref\n(\d+) (\d+)\n/.exec(s.slice(sx)).map(Number);
  assert.strictEqual(first, 0);
  assert.strictEqual(count, 3 + 3 * 3 + 1); // 0, Catalog, Pages, 3 × (Page, nội dung, ảnh), Info
  const lines = s.slice(sx).split('\n').slice(2, 2 + count);
  assert.ok(lines.every((l) => l.length === 19)); // 20 byte gồm cả \n
  lines.slice(1).forEach((l, i) => {
    const off = Number(l.slice(0, 10));
    assert.strictEqual(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `đối tượng ${i + 1}`);
  });
  assert.match(s, /\/Type \/Pages \/Count 3 \/Kids \[3 0 R 6 0 R 9 0 R\]/);
  assert.strictEqual((s.match(/\/Type \/Page /g) || []).length, 3);
  // Độ dài luồng ảnh khớp số byte ảnh
  assert.match(s, /\/Filter \/DCTDecode \/Length 54 >>/);
  assert.match(s, /\/Root 1 0 R \/Info 12 0 R/);
});

test('pdf-lite: tiêu đề UTF-16BE (tiếng Việt, chữ ngoài BMP)', () => {
  assert.strictEqual(P.utf16('Giải'), '<FEFF004700691EA30069>');
  assert.strictEqual(P.utf16('😀'), '<FEFFD83DDE00>');
  assert.strictEqual(P.utf16(''), '<FEFF>');
});

test('pdf-lite: khổ giấy tuỳ chọn', () => {
  const s = join(P.jpegPdf([fake(1)], { w: 841.89, h: 595.28 })).toString('latin1');
  assert.match(s, /\/MediaBox \[0 0 841.89 595.28\]/);
  assert.match(s, /q 841.89 0 0 595.28 0 0 cm \/Im0 Do Q/);
});
