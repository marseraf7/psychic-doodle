/*
 * Công cụ ảnh / video bìa (server/scripts/portal-media.js) chạy thật: dựng bản cổng crazygames, không máy chủ online, mở
 * bằng Chromium, chơi một ván với máy bằng cách bấm ô, chụp một cỡ ảnh nhỏ + quay video ngắn.
 * Kiểm: PNG đúng kích thước (bản có dải tiêu đề + bản nguyên, khác nhau), video MP4 H.264 đúng cỡ, không tiếng, dài ~--seconds
 * (có ffmpeg) hoặc WebM (không có ffmpeg), in số đo tải, không lỗi JS / cảnh báo.
 *   node caro/tests/e2e/portal-media.e2e.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { pngSize, findFfmpeg } = require('../../../server/scripts/portal-media.js');

const SCRIPT = path.resolve(__dirname, '../../../server/scripts/portal-media.js');
let failed = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) { failed++; process.exitCode = 1; } };

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-media-e2e-'));
const t = Date.now();
const r = spawnSync(process.execPath, [SCRIPT, '--out', out, '--sizes', '640x360', '--video-size', '640x360', '--seconds', '5'],
  { encoding: 'utf8', timeout: 240000 });
const log = (r.stdout || '') + (r.stderr || '');
console.log(log.trim().split('\n').map((l) => '     | ' + l).join('\n'));
ok(r.status === 0, `công cụ chạy xong, mã thoát 0 (${((Date.now() - t) / 1000).toFixed(1)} giây)`);

for (const name of ['cover-640x360.png', 'cover-640x360-raw.png']) {
  const f = path.join(out, name);
  const sz = fs.existsSync(f) ? pngSize(fs.readFileSync(f)) : null;
  ok(!!sz && sz.w === 640 && sz.h === 360, `${name}: PNG 640×360 (${sz ? sz.w + '×' + sz.h : 'không có'})`);
}
const a = path.join(out, 'cover-640x360.png'), b = path.join(out, 'cover-640x360-raw.png');
ok(fs.existsSync(a) && fs.existsSync(b) && !fs.readFileSync(a).equals(fs.readFileSync(b)), 'bản có dải tiêu đề khác bản nguyên');
ok(/giữa ván, \d+ quân, X sắp thắng|hết ván \d+ nước/.test(log), 'ảnh chụp từ ván thật với máy (bấm ô)');
ok(/Đo cục bộ .*\d+ KB \/ \d+ yêu cầu.*Trang chủ sau [\d.]+ giây/.test(log), 'in số đo tải / thời gian tới lúc chơi được');
ok(!/^! (?!Không có ffmpeg)/m.test(log), 'không cảnh báo (sai cỡ ảnh, lỗi JS, ván không xong)');

const ff = findFfmpeg();
if (ff) {
  const mp4 = path.join(out, 'cover-video.mp4');
  ok(fs.existsSync(mp4), 'có cover-video.mp4');
  if (fs.existsSync(mp4)) {
    const probe = path.join(path.dirname(ff), 'ffprobe');
    const info = JSON.parse(execFileSync(fs.existsSync(probe) ? probe : 'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:format=duration', '-of', 'json', mp4], { encoding: 'utf8' }));
    const v = info.streams.find((s) => s.codec_type === 'video');
    const dur = +info.format.duration;
    ok(v && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.width === 640 && v.height === 360, `video H.264 yuv420p 640×360 (${v && [v.codec_name, v.pix_fmt, v.width + '×' + v.height].join(' ')})`);
    ok(!info.streams.some((s) => s.codec_type === 'audio'), 'video không có tiếng');
    ok(dur >= 3 && dur <= 5.6, `video dài ~5 giây (${dur.toFixed(2)})`);
  }
} else {
  ok(fs.existsSync(path.join(out, 'cover-video.webm')) && /ffmpeg/.test(log), 'không có ffmpeg: giữ WebM + in lệnh tự chuyển');
}

fs.rmSync(out, { recursive: true, force: true });
console.log(failed ? `${failed} bước KHÔNG đạt` : 'Tất cả đạt');
