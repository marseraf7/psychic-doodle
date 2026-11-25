// Công cụ ảnh / video bìa cho hồ sơ nộp cổng game (server/scripts/portal-media.js) – phần thuần: đọc tham số, kích thước,
// khung nhìn cho ảnh đúng điểm ảnh, dải tiêu đề, đoạn cắt video, lệnh ffmpeg, đọc cỡ PNG. Chạy thật (Chromium, ván với máy):
// caro/tests/e2e/portal-media.e2e.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const M = require('../scripts/portal-media.js');

test('parseSize / parseSizes: RỘNGxCAO, bỏ trùng, chặn cỡ lạ', () => {
  assert.deepStrictEqual(M.parseSize('1920x1080'), { w: 1920, h: 1080 });
  assert.deepStrictEqual(M.parseSize(' 800 × 1200 '), { w: 800, h: 1200 });
  assert.deepStrictEqual(M.parseSize('800X800'), { w: 800, h: 800 });
  for (const bad of ['1920', '1920x', 'axb', '10x10', '5000x100', '1920x1080x2', '']) assert.throws(() => M.parseSize(bad), /Kích thước/, bad);
  assert.deepStrictEqual(M.parseSizes(M.DEFAULT_SIZES), [{ w: 1920, h: 1080 }, { w: 800, h: 1200 }, { w: 800, h: 800 }]);
  assert.deepStrictEqual(M.parseSizes('800x800,800x800, 640x360,'), [{ w: 800, h: 800 }, { w: 640, h: 360 }]);
  assert.throws(() => M.parseSizes(' , '), /Thiếu/);
  assert.throws(() => M.parseSizes(Array.from({ length: 9 }, (_, i) => `${100 + i}x100`).join(',')), /Tối đa 8/);
});

test('parseArgs: mặc định và từng tham số', () => {
  const d = M.parseArgs([]);
  assert.strictEqual(d.out, path.resolve(__dirname, '..', '..', 'dist', 'portal-media'));
  assert.strictEqual(d.sizes.length, 3);
  assert.deepStrictEqual([d.video, d.videoSize, d.seconds, d.frame, d.title, d.titleText, d.board, d.pieces, d.theme, d.ffmpeg, d.help],
    [true, { w: 1920, h: 1080 }, 18, 'before', true, 'Caro x Gomoku', 'wood', 'bold', 'dark', null, false]);
  const o = M.parseArgs(['--out', 'x/y', '--sizes', '640x360', '--no-video', '--video-size', '1280x720', '--seconds', '15',
    '--frame', 'win', '--no-title', '--title', 'T', '--subtitle', 'S', '--board', 'paper', '--pieces', 'stones', '--theme', 'light',
    '--ffmpeg', '/opt/ff']);
  assert.strictEqual(o.out, path.resolve('x/y'));
  assert.deepStrictEqual([o.sizes, o.video, o.videoSize, o.seconds, o.frame, o.title, o.titleText, o.subText, o.board, o.pieces, o.theme, o.ffmpeg],
    [[{ w: 640, h: 360 }], false, { w: 1280, h: 720 }, 15, 'win', false, 'T', 'S', 'paper', 'stones', 'light', '/opt/ff']);
  assert.strictEqual(M.parseArgs(['--help']).help, true);
  assert.strictEqual(M.parseArgs(['-h']).help, true);
  assert.strictEqual(M.parseArgs(['--title', 'x'.repeat(100)]).titleText.length, 60);
  for (const [args, re] of [
    [['--out'], /Thiếu giá trị cho --out/], [['--sizes', '--no-video'], /Thiếu giá trị/], [['--seconds', '2'], /3–60/],
    [['--seconds', 'abc'], /3–60/], [['--frame', 'mid'], /before hoặc win/], [['--board', 'gold'], /--board/],
    [['--pieces', 'emoji'], /--pieces/], [['--theme', 'blue'], /dark hoặc light/], [['--zip'], /Tham số lạ/],
  ]) assert.throws(() => M.parseArgs(args), re, args.join(' '));
});

test('viewportFor: khung nhìn CSS nguyên × tỉ lệ = đúng điểm ảnh, giao diện to vừa', () => {
  for (const [w, h] of [[1920, 1080], [800, 1200], [800, 800], [640, 360], [1280, 720], [1001, 999], [3840, 2160], [16, 16]]) {
    const v = M.viewportFor({ w, h });
    assert.ok(Number.isInteger(v.width) && Number.isInteger(v.height), `${w}x${h}: CSS nguyên`);
    assert.ok(Math.abs(v.width * v.scale - w) < 1e-6 && Math.abs(v.height * v.scale - h) < 1e-6, `${w}x${h}: đúng điểm ảnh`);
    assert.ok(v.scale >= 1 && v.scale <= 2.01, `${w}x${h}: tỉ lệ ${v.scale}`);
  }
  assert.deepStrictEqual(M.viewportFor({ w: 1920, h: 1080 }), { width: 1072, height: 603, scale: 120 / 67 });
  assert.deepStrictEqual(M.viewportFor({ w: 800, h: 1200 }), { width: 600, height: 900, scale: 400 / 300 });
  assert.deepStrictEqual(M.viewportFor({ w: 800, h: 800 }), { width: 600, height: 600, scale: 800 / 600 });
  assert.deepStrictEqual(M.viewportFor({ w: 640, h: 360 }), { width: 640, height: 360, scale: 1 });
  assert.deepStrictEqual(M.viewportFor({ w: 1001, h: 999 }), { width: 1001, height: 999, scale: 1 }); // ƯCLN 1: không đổi tỉ lệ
  assert.deepStrictEqual(M.viewportFor({ w: 3840, h: 2160 }), { width: 1920, height: 1080, scale: 2 });
});

test('bandFor: chữ theo cạnh ngắn, dải không quá ~25 % khung nhìn', () => {
  for (const [w, h] of [[1072, 603], [600, 900], [600, 600], [640, 360], [16, 16]]) {
    const b = M.bandFor(w, h);
    assert.ok(b.title >= 18 && b.sub >= 11 && b.sub < b.title, `${w}x${h}`);
    if (h >= 300) assert.ok(b.h <= h * 0.26, `${w}x${h}: dải ${b.h}`);
  }
  assert.deepStrictEqual(M.bandFor(1072, 603), { title: 45, sub: 19, pad: 23, h: 140 });
});

test('clipWindow + ffmpegArgs: lấy giây cuối, không trước lúc vào ván; MP4 H.264 không tiếng', () => {
  assert.deepStrictEqual(M.clipWindow(2, 40, 18), { start: 22, dur: 18 });
  assert.deepStrictEqual(M.clipWindow(2.5, 12, 18), { start: 2.5, dur: 9.5 }); // ván ngắn: từ lúc mở bảng ván mới
  assert.deepStrictEqual(M.clipWindow(-1, 0.5, 18), { start: 0, dur: 1 });
  const a = M.ffmpegArgs('in.webm', 'out.mp4', { start: 3, dur: 15 }, { w: 1920, h: 1080 });
  assert.deepStrictEqual(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 2), ['-ss', '3']);
  assert.deepStrictEqual(a.slice(a.indexOf('-t'), a.indexOf('-t') + 2), ['-t', '15']);
  for (const x of ['-an', 'libx264', 'yuv420p', '+faststart', 'scale=1920:1080:flags=lanczos,fps=30']) assert.ok(a.includes(x), x);
  assert.strictEqual(a[a.length - 1], 'out.mp4');
  assert.strictEqual(a[a.indexOf('-i') + 1], 'in.webm');
});

test('findFfmpeg: đường dẫn hỏng → thử chỗ khác, không có thì null', () => {
  const r = M.findFfmpeg('/khong/co/ffmpeg');
  assert.ok(r === null || typeof r === 'string');
  const old = process.env.PATH;
  process.env.PATH = '';
  try { if (!require('fs').existsSync('/usr/bin/ffmpeg')) assert.strictEqual(M.findFfmpeg('/khong/co'), null); } finally { process.env.PATH = old; }
});

test('pngSize: đọc rộng × cao từ IHDR, không phải PNG → null', () => {
  const b = Buffer.alloc(24);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(1920, 16); b.writeUInt32BE(1080, 20);
  assert.deepStrictEqual(M.pngSize(b), { w: 1920, h: 1080 });
  assert.strictEqual(M.pngSize(Buffer.from('GIF89a')), null);
  assert.strictEqual(M.pngSize(Buffer.alloc(30)), null);
});
