#!/usr/bin/env node
/*
 * Ảnh bìa + video bìa cho hồ sơ nộp cổng game (CrazyGames…) từ gameplay THẬT của bản cổng:
 *   node server/scripts/portal-media.js [--out thư-mục] [--sizes 1920x1080,800x1200,800x800] [--no-video]
 *        [--video-size 1920x1080] [--seconds 18] [--frame before|win] [--no-title] [--title "…"]
 *        [--subtitle "…"] [--board wood] [--pieces bold] [--theme dark|light] [--ffmpeg /usr/bin/ffmpeg]
 * Mặc định ra dist/portal-media/ ở gốc repo (dist/ không đưa lên git).
 *
 * Cách làm (không dựng ảnh giả): dựng bản cổng crazygames bằng build-portal.js vào thư mục tạm, máy chủ online trỏ về một
 * cổng cục bộ đã đóng (không có máy chủ – kiểm luôn gói vẫn chơi được với máy), phục vụ tĩnh trên máy, mở bằng Chromium
 * như người chơi khách tiếng Anh, bấm "Play the computer" → "Play" rồi bấm từng ô (nước của X do engine của game chọn).
 * Chụp ngay trước nước thắng của X (--frame before, mặc định) hoặc sau khi thắng (--frame win: bấm "View board", chờ thông
 * báo tắt, thấy đường thắng). Mỗi cỡ ảnh là một ván riêng ở khung nhìn có cùng tỉ lệ.
 *  – cover-<R>x<C>.png: ảnh chụp + dải tiêu đề tiếng Anh vẽ chồng ở mép dưới (--no-title: bỏ); cover-<R>x<C>-raw.png: ảnh
 *    chụp nguyên (luôn có, cho biểu mẫu không muốn chữ trên ảnh).
 *  – cover-video.mp4: Playwright recordVideo cả quá trình (Trang chủ → ván → thắng), cắt còn ~--seconds giây cuối,
 *    phóng lên --video-size, H.264 yuv420p, không tiếng (ffmpeg). Không có ffmpeg: giữ cover-video.webm (cỡ khung nhìn CSS,
 *    chưa cắt) và in lệnh tự chuyển.
 *  – Đo cục bộ (in ra): byte đã tải tới khi bàn cờ chơi được, giây tới Trang chủ / tới ván.
 * Kích thước 1920×1080, 800×1200, 800×800 là cỡ CrazyGames thường yêu cầu – KIỂM LẠI trong biểu mẫu Developer Portal
 * trước khi nộp (docs/crazygames-nop-basic-launch.md).
 * Phần trình duyệt: portal-media-play.js. Bài thử: server/test/portal-media.test.js (hàm thuần),
 * caro/tests/e2e/portal-media.e2e.js (chạy thật).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SIZES = '1920x1080,800x1200,800x800';
const TITLE = 'Caro x Gomoku';
const SUBTITLE = 'Five in a row · Vietnamese Caro, Gomoku & Renju';
const USAGE = 'Dùng: node server/scripts/portal-media.js [--out thư-mục] [--sizes 1920x1080,800x1200,800x800] [--no-video]\n'
  + '      [--video-size 1920x1080] [--seconds 18] [--frame before|win] [--no-title] [--title "…"] [--subtitle "…"]\n'
  + '      [--board wood] [--pieces bold] [--theme dark|light] [--ffmpeg đường-dẫn]';
const BOARDS = ['paper', 'wood', 'green', 'blue', 'night', 'marble', 'sand', 'coral', 'pink', 'purple', 'moss', 'walnut', 'slate'];
const PIECES = ['classic', 'bold', 'stones'];

/** "1920x1080" → { w, h } (16–4096 px mỗi chiều), sai thì ném lỗi. */
function parseSize(s) {
  const m = /^\s*(\d{2,4})\s*[x×]\s*(\d{2,4})\s*$/i.exec(String(s));
  if (!m) throw new Error('Kích thước phải dạng RỘNGxCAO, ví dụ 1920x1080: ' + s);
  const w = +m[1], h = +m[2];
  if (w < 16 || h < 16 || w > 4096 || h > 4096) throw new Error('Kích thước ngoài khoảng 16–4096 px: ' + s);
  return { w, h };
}

/** "1920x1080,800x1200" → [{ w, h }…] (bỏ trùng, tối đa 8 cỡ). */
function parseSizes(s) {
  const out = [];
  for (const part of String(s).split(',').filter((x) => x.trim())) {
    const z = parseSize(part);
    if (!out.some((o) => o.w === z.w && o.h === z.h)) out.push(z);
  }
  if (!out.length) throw new Error('Thiếu kích thước ảnh (--sizes)');
  if (out.length > 8) throw new Error('Tối đa 8 kích thước ảnh');
  return out;
}

/** Đọc tham số dòng lệnh → tuỳ chọn. Sai thì ném lỗi (CLI in USAGE). */
function parseArgs(argv) {
  const o = {
    out: path.join(ROOT, 'dist', 'portal-media'), sizes: parseSizes(DEFAULT_SIZES), video: true, videoSize: { w: 1920, h: 1080 },
    seconds: 18, frame: 'before', title: true, titleText: TITLE, subText: SUBTITLE, board: 'wood', pieces: 'bold', theme: 'dark', ffmpeg: null, help: false,
  };
  const need = (i, k) => { if (i + 1 >= argv.length || /^--/.test(argv[i + 1])) throw new Error('Thiếu giá trị cho ' + k); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    switch (k) {
      case '--out': o.out = path.resolve(need(i, k)); i++; break;
      case '--sizes': o.sizes = parseSizes(need(i, k)); i++; break;
      case '--no-video': o.video = false; break;
      case '--video-size': o.videoSize = parseSize(need(i, k)); i++; break;
      case '--seconds': {
        const n = Number(need(i, k)); i++;
        if (!(n >= 3 && n <= 60)) throw new Error('--seconds phải trong khoảng 3–60');
        o.seconds = n; break;
      }
      case '--frame': o.frame = need(i, k); i++; if (!['before', 'win'].includes(o.frame)) throw new Error('--frame phải là before hoặc win'); break;
      case '--no-title': o.title = false; break;
      case '--title': o.titleText = need(i, k).slice(0, 60); i++; break;
      case '--subtitle': o.subText = need(i, k).slice(0, 120); i++; break;
      case '--board': o.board = need(i, k); i++; if (!BOARDS.includes(o.board)) throw new Error('--board phải là một trong: ' + BOARDS.join(', ')); break;
      case '--pieces': o.pieces = need(i, k); i++; if (!PIECES.includes(o.pieces)) throw new Error('--pieces phải là một trong: ' + PIECES.join(', ')); break;
      case '--theme': o.theme = need(i, k); i++; if (!['dark', 'light'].includes(o.theme)) throw new Error('--theme phải là dark hoặc light'); break;
      case '--ffmpeg': o.ffmpeg = need(i, k); i++; break;
      case '-h': case '--help': o.help = true; break;
      default: throw new Error('Tham số lạ: ' + k);
    }
  }
  return o;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * Khung nhìn CSS + tỉ lệ điểm ảnh để ảnh chụp ra ĐÚNG w×h điểm ảnh mà giao diện vẫn to, dễ đọc khi cổng thu nhỏ ảnh:
 * tỉ lệ ≈ cạnh ngắn / 600 (1–2), chọn đúng phân số g/k (g = ƯCLN(w, h)) để chiều rộng / cao CSS là số nguyên.
 * → { width, height, scale }
 */
function viewportFor({ w, h }) {
  const want = Math.min(2, Math.max(1, Math.min(w, h) / 600));
  const g = gcd(w, h);
  const k = Math.max(1, Math.round(g / want));
  const scale = g / k;
  if (scale < 1) return { width: w, height: h, scale: 1 };
  return { width: (w / g) * k, height: (h / g) * k, scale };
}

/** Dải tiêu đề (px CSS) cho khung nhìn width×height: cỡ chữ theo cạnh ngắn, cao ≤ ~25 % khung – không che bàn cờ nhiều. */
function bandFor(width, height) {
  const title = Math.max(18, Math.round(Math.min(width * 0.09, height * 0.075)));
  const sub = Math.max(11, Math.round(title * 0.42));
  const pad = Math.round(title * 0.5);
  return { title, sub, pad, h: Math.round(title * 1.1 + sub * 1.6 + pad * 2.6) };
}

/**
 * Đoạn cắt video: lấy `seconds` giây cuối, kết thúc ở `end`, nhưng không bắt đầu trước `from` (lúc người chơi bắt đầu
 * mở bảng ván mới). Đơn vị giây tính từ đầu video. → { start, dur }
 */
function clipWindow(from, end, seconds) {
  const start = Math.max(0, from, end - seconds);
  return { start: +start.toFixed(2), dur: +Math.max(1, end - start).toFixed(2) };
}

/** Tham số ffmpeg: cắt + chuyển WebM → MP4 H.264 (yuv420p, faststart), không tiếng, đúng w×h. */
function ffmpegArgs(input, output, { start, dur }, { w, h }) {
  return ['-y', '-loglevel', 'error', '-ss', String(start), '-i', input, '-t', String(dur), '-an',
    '-vf', `scale=${w}:${h}:flags=lanczos,fps=30`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', output];
}

/** ffmpeg dùng được: --ffmpeg, rồi /usr/bin/ffmpeg, rồi `ffmpeg` trong PATH; không có → null. */
function findFfmpeg(prefer) {
  for (const c of [prefer, '/usr/bin/ffmpeg', 'ffmpeg'].filter(Boolean)) {
    try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return c; } catch (e) { /* thử cái khác */ }
  }
  return null;
}

/** Kích thước ảnh PNG từ phần đầu file (IHDR). */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const sizeTag = ({ w, h }) => `${w}x${h}`;

/** Chạy toàn bộ: dựng gói, chụp ảnh, quay video. log(chuỗi) in tiến độ. → { files: [đường dẫn], measure, warnings } */
async function run(o, log = console.log) {
  const P = require('./portal-media-play.js');
  const { buildPortal } = require('./build-portal.js');
  fs.mkdirSync(o.out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-media-'));
  const files = [], warnings = [];
  let measure = null;
  const look = { board: o.board, pieces: o.pieces };
  const port = await P.closedPort();
  const built = buildPortal({ mode: 'crazygames', server: `http://127.0.0.1:${port}`, out: path.join(tmp, 'pkg'), zip: false, allowHttp: true });
  if (built.problems.length) throw new Error('Gói cổng chưa đạt: ' + built.problems.join(' | '));
  const { server, base } = await P.serveDir(built.out);
  const browser = await P.loadPlaywright().chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const size of o.sizes) {
      const vp = viewportFor(size);
      const { ctx, page } = await P.openGame(browser, base, { ...vp, theme: o.theme, look });
      const home = await P.loadHome(page, base);
      const t = Date.now();
      await P.startBotGame(page);
      if (!measure) measure = { bytes: page.bytes.n, requests: page.bytes.files, homeSec: home, gameSec: +(home + (Date.now() - t) / 1000).toFixed(2) };
      // Chụp: --frame before = thế cờ ngay trước nước thắng của X (mọi quân rõ, đang tới lượt "you");
      // --frame win (hoặc ván không kết thúc bằng nước thắng của X) = bàn cờ sau khi thắng, có đường thắng
      const shoot = async (label) => {
        await P.centerBoard(page);
        await P.mouseAway(page);
        const shots = [['-raw', null]];
        if (o.title) shots.push(['', bandFor(vp.width, vp.height)]);
        for (const [suffix, band] of shots) {
          await P.overlayTitle(page, band, { title: o.titleText, sub: o.subText });
          const file = path.join(o.out, `cover-${sizeTag(size)}${suffix}.png`);
          await page.screenshot({ path: file, animations: 'disabled' });
          const got = pngSize(fs.readFileSync(file));
          if (!got || got.w !== size.w || got.h !== size.h) warnings.push(`${path.basename(file)}: ra ${got ? sizeTag(got) : '?'} thay vì ${sizeTag(size)}`);
          files.push(file);
          log(`  ảnh ${path.basename(file)} (${got ? sizeTag(got) : '?'}, ${label})`);
        }
        await P.overlayTitle(page, null);
      };
      let shot = false;
      const before = o.frame === 'before' ? async (n, e) => {
        if (shot || e.mate !== 1) return;
        shot = true;
        const k = await page.evaluate(() => window.CaroApp.board.moves.length);
        await shoot(`giữa ván, ${k} quân, X sắp thắng`);
      } : null;
      const r = await P.playToWin(page, { pace: 80, before });
      if (!r.winner) warnings.push(`${sizeTag(size)}: ván chưa ngã ngũ sau ${r.moves} nước – chụp thế cờ hiện tại`);
      if (!shot) {
        await P.showFinalBoard(page);
        await shoot(`hết ván ${r.moves} nước, ${r.winner === 1 ? 'X thắng' : r.winner ? 'O thắng' : 'chưa xong'}`);
      }
      if (page.errs.length) warnings.push(`${sizeTag(size)}: lỗi JS trên trang: ${page.errs.join(' | ')}`);
      await ctx.close();
    }
    if (o.video) files.push(...await recordVideo(P, browser, base, o, look, tmp, log, warnings));
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { files, measure, warnings };
}

/** Quay một ván (Trang chủ → bảng ván mới → ván → thắng), cắt + chuyển MP4 nếu có ffmpeg. → [đường dẫn file ra] */
async function recordVideo(P, browser, base, o, look, tmp, log, warnings) {
  // recordVideo của Playwright ghi theo điểm ảnh CSS (bỏ qua deviceScaleFactor): quay ở khung nhìn CSS như ảnh (giao diện
  // to, dễ đọc), tỉ lệ 1, rồi ffmpeg phóng lên đúng --video-size.
  const vp = { ...viewportFor(o.videoSize), scale: 1 };
  const dir = path.join(tmp, 'video');
  const { ctx, page, t0 } = await P.openGame(browser, base, { ...vp, theme: o.theme, look, video: { dir, size: { width: vp.width, height: vp.height } } });
  await P.loadHome(page, base);
  await page.waitForTimeout(700);
  const from = (Date.now() - t0) / 1000 - 0.3;
  await P.startBotGame(page);
  const r = await P.playToWin(page, { pace: 650 });
  await page.waitForTimeout(2200); // bảng "You win!" + đường thắng
  const end = (Date.now() - t0) / 1000;
  const webm = await page.video().path();
  await ctx.close(); // video ghi xong khi đóng hồ sơ
  const win = clipWindow(from, end, o.seconds);
  const ff = findFfmpeg(o.ffmpeg);
  if (ff) {
    const mp4 = path.join(o.out, 'cover-video.mp4');
    execFileSync(ff, ffmpegArgs(webm, mp4, win, o.videoSize), { stdio: 'inherit' });
    log(`  video ${path.basename(mp4)} (${sizeTag(o.videoSize)}, ${win.dur} giây, H.264, không tiếng; ván ${r.moves} nước)`);
    return [mp4];
  }
  const out = path.join(o.out, 'cover-video.webm');
  fs.copyFileSync(webm, out);
  warnings.push('Không có ffmpeg: giữ video WebM chưa cắt. Tự cắt + chuyển MP4 khi có ffmpeg:\n    ffmpeg '
    + ffmpegArgs(out, path.join(o.out, 'cover-video.mp4'), win, o.videoSize).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' '));
  log(`  video ${path.basename(out)} (WebM gốc ${vp.width}x${vp.height}, đoạn nên giữ: từ giây ${win.start}, dài ${win.dur} giây)`);
  return [out];
}

if (require.main === module) {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error('✗ ' + e.message + '\n' + USAGE); process.exit(1); }
  if (o.help) { console.log(USAGE); process.exit(0); }
  console.log(`Ảnh / video bìa từ gameplay thật → ${o.out}`);
  run(o).then(({ measure, warnings }) => {
    if (measure) {
      console.log(`Đo cục bộ (bản cổng crazygames, không máy chủ online, SDK bị chặn): ${(measure.bytes / 1024).toFixed(0)} KB / ${measure.requests} yêu cầu`
        + ` tới khi bàn cờ chơi được; Trang chủ sau ${measure.homeSec} giây, vào ván với máy sau ${measure.gameSec} giây (gồm thao tác bấm)`);
    }
    for (const w of warnings) console.log('! ' + w);
    console.log('Kích thước ảnh / video: kiểm lại trong biểu mẫu Developer Portal trước khi nộp (docs/crazygames-nop-basic-launch.md).');
  }).catch((e) => { console.error('✗ ' + (e && e.stack || e)); process.exitCode = 1; });
}

module.exports = { parseArgs, parseSize, parseSizes, viewportFor, bandFor, clipWindow, ffmpegArgs, findFfmpeg, pngSize, run, DEFAULT_SIZES, TITLE, SUBTITLE };
