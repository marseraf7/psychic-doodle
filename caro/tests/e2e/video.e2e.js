/*
 * Xuất video ngắn 9:16 (caro/video-maker.js) – Chromium, màn 390px:
 *  – Câu đố hôm nay → Xuất video: xem trước khung đầu, Bắt đầu → tiến độ → Tải về file caro-puzzle-<mã>.mp4 (MP4 H.264);
 *  – Ván đang xem lại → Chia sẻ → Xuất video (cạnh PNG / GIF): ô "Hiện tên người chơi", ép WebM → file .webm có thời lượng;
 *  – ffprobe (nếu có ở /usr/bin/ffprobe): 1080×1920, thời lượng khớp lịch cảnh; tách 1 khung hình kiểm không trống;
 *  – Huỷ giữa chừng, nhắc giữ màn hình khi tab bị ẩn, trình duyệt không ghi được video → hộp thông báo trong app;
 *  – 0 lỗi hiển thị ở 390px (vi, ru, ja); bản cổng game (html.portal) không có nút.
 * Chế độ thử nhanh: window.__caroVideoTest = { speed: 4 } (chỉ bài thử) – video ngắn đi 4 lần, khung hình vẫn 1080×1920.
 *   node caro/tests/e2e/video.e2e.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { setup, gotoRetry } = require('./helpers');
const { audit } = require('./ui-audit');

const FFPROBE = '/usr/bin/ffprobe', FFMPEG = '/usr/bin/ffmpeg';
const SPEED = 4;

(async () => {
  const PORT = 8177;
  const { browser, ok, sleep, finish, shot } = await setup(PORT);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-video-'));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await ctx.addInitScript((speed) => { if (!localStorage.getItem('caro.lang')) localStorage.setItem('caro.lang', 'vi'); window.__caroVideoTest = { speed }; }, SPEED);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await gotoRetry(p, `http://localhost:${PORT}/`);
  await sleep(600);

  const auditDlg = async (what) => {
    const bad = await audit(p, '#video-dlg');
    ok(bad.length === 0, `${what}: 0 lỗi hiển thị ở 390px` + (bad.length ? ' – ' + JSON.stringify(bad.slice(0, 4)) : ''));
  };
  const previewInk = () => p.evaluate(() => {
    const c = document.getElementById('vid-preview'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    return seen.size;
  });
  const waitPhase = async (want, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await p.evaluate(() => window.CaroVideo.phase) === want) return true; await sleep(200); }
    return false;
  };
  /** Blob vừa dựng → file trên máy (qua base64). */
  const saveBlob = async (name) => {
    const b64 = await p.evaluate(() => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(window.CaroVideo.blob); }));
    const f = path.join(tmp, name);
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    return f;
  };
  const probe = (f) => {
    if (!fs.existsSync(FFPROBE)) return null;
    const j = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=duration,format_name', '-of', 'json', f]).toString());
    const v = j.streams.find((s) => s.width) || {};
    return { codec: v.codec_name, w: v.width, h: v.height, dur: Number(j.format.duration), fmt: j.format.format_name };
  };
  const frameOk = (f, at) => {
    if (!fs.existsSync(FFMPEG)) return true;
    const out = f + '.png';
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', String(at), '-i', f, '-frames:v', '1', out]);
    return fs.statSync(out).size > 20000; // khung có bàn cờ + chữ (khung trống nén còn vài KB)
  };

  // ------------------------------------------------------------ 1. Câu đố hôm nay → MP4
  await p.evaluate(() => window.CaroShell.open('puzzles'));
  await p.waitForSelector('#pz-today [data-pz-video]', { timeout: 8000 });
  ok(await p.isVisible('#pz-today [data-pz-video]'), 'thẻ Câu đố hôm nay có nút Xuất video');
  const todayBad = await audit(p, '#pz-today');
  ok(todayBad.length === 0, 'thẻ Câu đố hôm nay: 0 lỗi hiển thị ở 390px' + (todayBad.length ? ' – ' + JSON.stringify(todayBad) : ''));
  await p.click('#pz-today [data-pz-video]');
  await sleep(500);
  ok(await p.evaluate(() => document.getElementById('video-dlg').open), 'mở hộp Xuất video');
  ok(await p.isVisible('#vid-pz-row') && await p.isHidden('#vid-names-row'), 'câu đố: có ô chọn bài, không có ô hiện tên');
  ok(await previewInk() > 4, 'xem trước khung đầu (có hình)');
  ok(/1080×1920/.test(await p.textContent('#vid-info')), 'ghi rõ khung 1080×1920 và thời lượng: ' + await p.textContent('#vid-info'));
  await auditDlg('hộp Xuất video (câu đố)');
  await shot(p, 'video-puzzle-ready-390.png');
  // Đổi bài theo số, rồi bài khác
  await p.fill('#vid-pz-id', '5');
  await p.dispatchEvent('#vid-pz-id', 'change');
  await sleep(500);
  ok(await p.inputValue('#vid-pz-id') === '5', 'chọn bài số 5');
  await p.click('#vid-start');
  await sleep(400);
  ok(await p.isVisible('#vid-prog-box') && await p.isVisible('#vid-cancel') && await p.isHidden('#vid-start'), 'đang dựng: thanh tiến độ + nút Huỷ');
  ok(/%/.test(await p.textContent('#vid-prog-n')), 'hiện phần trăm: ' + await p.textContent('#vid-prog-n'));
  await auditDlg('đang dựng');
  ok(await waitPhase('done', 30000), 'dựng xong video câu đố');
  const r1 = await p.evaluate(() => window.CaroVideo.result);
  ok(r1 && r1.size > 10000 && /^video\/mp4/.test(r1.type), `blob MP4 ${r1 && r1.size} byte, ${r1 && r1.type}`);
  ok(r1 && r1.name === 'caro-puzzle-5.mp4', 'tên file ' + (r1 && r1.name));
  ok(await p.isVisible('#vid-dl') && /^blob:/.test(await p.getAttribute('#vid-dl', 'href')) && await p.getAttribute('#vid-dl', 'download') === r1.name, 'nút Tải về (a download)');
  ok(/MP4/.test(await p.textContent('#vid-status')), 'báo xong: ' + await p.textContent('#vid-status'));
  await auditDlg('dựng xong');
  await shot(p, 'video-puzzle-done-390.png');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#vid-dl')]);
  ok(dl.suggestedFilename() === 'caro-puzzle-5.mp4', 'tải về đúng tên file');
  const f1 = await saveBlob(r1.name);
  const i1 = probe(f1);
  if (i1) {
    ok(i1.w === 1080 && i1.h === 1920 && i1.codec === 'h264', `ffprobe: ${i1.codec} ${i1.w}×${i1.h}`);
    ok(i1.dur > r1.dur - 0.6 && i1.dur < r1.dur + 1.5, `thời lượng ${i1.dur.toFixed(2)} s (lịch ${r1.dur.toFixed(2)} s)`);
    ok(frameOk(f1, r1.dur * 0.3), 'khung giữa video có nội dung');
  } else console.log('     (không có ffprobe – bỏ qua kiểm khung hình)');
  await p.click('#video-dlg [data-close]');
  await sleep(200);

  // ------------------------------------------------------------ 2. Ván đang xem lại → WebM (ép định dạng)
  const moves = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [5, 5], [4, 0]];
  await p.evaluate((mv) => window.CaroApp.openReplay({ local: true, x: 'An Nguyễn Văn Rất Dài Tên', o: 'Bình', winner: 1, reason: 'win', moves: mv, rule: 'vn' }), moves);
  await sleep(500);
  await p.click('#rp-share');
  await sleep(300);
  ok(await p.isVisible('#sh-video') && await p.isVisible('#sh-gif'), 'hộp chia sẻ ván: nút Xuất video cạnh GIF / PNG');
  // Ghi lại mọi chữ vẽ lên canvas: ẩn tên (mặc định) thì video không có tên người chơi ở bất kỳ cảnh nào
  await p.evaluate(() => { window.__txt = []; const f = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__txt.push(String(t)); return f.call(this, t, ...a); }; });
  await p.click('#sh-video');
  await sleep(500);
  ok(await p.isVisible('#vid-names-row') && !(await p.isChecked('#vid-names')) && await p.isHidden('#vid-pz-row'), 'ván đấu: ô "Hiện tên người chơi" mặc định tắt');
  ok(await previewInk() > 4, 'xem trước ván đấu');
  await p.check('#vid-names');
  await sleep(300);
  ok(await previewInk() > 4, 'bật hiện tên: vẽ lại xem trước');
  ok(await p.evaluate(() => window.__txt.some((t) => /An Nguyễn/.test(t))), 'bật hiện tên: tên có trên khung (đối chứng cho bài thử ẩn tên)');
  await p.uncheck('#vid-names'); // ghi video với tên ẩn (mặc định): không cảnh nào được có tên
  await sleep(300);
  await p.evaluate(() => { window.__txt = []; });
  await auditDlg('hộp Xuất video (ván đấu)');
  await p.evaluate(() => { window.__caroVideoTest.mime = 'video/webm;codecs=vp9'; });
  await p.click('#vid-start');
  ok(await waitPhase('done', 30000), 'dựng xong video ván đấu');
  const r2 = await p.evaluate(() => window.CaroVideo.result);
  ok(r2 && r2.size > 10000 && r2.type === 'video/webm' && /^caro-game-\d+\.webm$/.test(r2.name), `blob WebM ${r2 && r2.size} byte, ${r2 && r2.name}`);
  const leaked = await p.evaluate(() => window.__txt.filter((t) => /An Nguyễn|Bình/.test(t)));
  ok(leaked.length === 0 && (await p.evaluate(() => window.__txt.length)) > 10, 'ẩn tên: cả video không vẽ tên người chơi' + (leaked.length ? ' – ' + leaked.join(' | ') : ''));
  const f2 = await saveBlob(r2.name);
  const i2 = probe(f2);
  if (i2) {
    ok(i2.w === 1080 && i2.h === 1920 && i2.codec === 'vp9', `ffprobe: ${i2.codec} ${i2.w}×${i2.h}`);
    ok(i2.dur > r2.dur - 0.6 && i2.dur < r2.dur + 1.5, `WebM có thời lượng ${i2.dur} s (lịch ${r2.dur.toFixed(2)} s)`);
    ok(frameOk(f2, r2.dur * 0.5), 'khung giữa video ván đấu có nội dung');
  }
  await p.evaluate(() => { delete window.__caroVideoTest.mime; });
  // Đóng hộp khi đã có video: thu hồi object URL, bỏ blob (không giữ ~20 MB trong bộ nhớ); mở lại cho phần sau
  const href = await p.getAttribute('#vid-dl', 'href');
  await p.evaluate(() => { window.__revoked = []; const r = URL.revokeObjectURL; URL.revokeObjectURL = (u) => { window.__revoked.push(u); r.call(URL, u); }; window.CaroOnline.closeDlg('video-dlg'); });
  await sleep(200);
  ok(await p.evaluate((h) => window.__revoked.includes(h) && window.CaroVideo.result === null, href), 'đóng hộp: thu hồi object URL, bỏ blob');
  await p.click('#rp-share');
  await sleep(300);
  await p.click('#sh-video');
  await sleep(500);

  // ------------------------------------------------------------ 3. Huỷ, tab bị ẩn, không hỗ trợ
  await p.click('#vid-start');
  await sleep(500);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(100);
  ok(/ẩn/.test(await p.textContent('#vid-status')), 'tab bị ẩn: nhắc giữ màn hình mở – ' + await p.textContent('#vid-status'));
  await p.evaluate(() => { delete document.hidden; });
  await p.click('#vid-cancel');
  ok(await waitPhase('ready', 5000), 'Huỷ: quay về trạng thái sẵn sàng');
  ok(await p.evaluate(() => window.CaroVideo.result) === null && /huỷ/.test(await p.textContent('#vid-status')), 'Huỷ: không có file, báo đã huỷ');
  ok(await p.isHidden('#vid-dl'), 'Huỷ: ẩn nút Tải về');
  await p.evaluate(() => { window.__mr = window.MediaRecorder; window.MediaRecorder = undefined; });
  await p.click('#vid-start');
  await sleep(300);
  ok(await p.evaluate(() => document.getElementById('confirm-dlg').open), 'không có MediaRecorder: hộp thông báo trong app (không dùng alert)');
  ok(/không quay được video/.test(await p.textContent('#confirm-dlg')), 'nội dung báo lỗi gọn');
  await p.click('#confirm-ok');
  await p.evaluate(() => { window.MediaRecorder = window.__mr; });
  // Ván lạ / hỏng: quân rải rất xa (±500 ô) và nước hỏng ở giữa – vẫn mở, vẽ được (không ném lỗi), bỏ phần hỏng
  const odd = await p.evaluate(() => {
    try {
      const okOpen = window.CaroVideo.openGame({ moves: [[-500, -500], [500, 480], [0, 0], [1, 1], null, [2, 2]], x: 'A', o: 'B', rule: 'vn' });
      return okOpen === true && window.CaroVideo.phase === 'ready';
    } catch (e) { return 'lỗi: ' + e.message; }
  });
  ok(odd === true, 'ván quân rải xa + nước hỏng: mở và vẽ được – ' + odd);
  ok(await previewInk() > 4, 'ván quân rải xa: xem trước có hình');
  ok(await p.evaluate(() => window.CaroVideo.openGame({ moves: [null, [0, 0]] })) === false, 'ván không có nước hợp lệ: không mở');
  await sleep(200);

  // ------------------------------------------------------------ 4. Ngôn ngữ dài / chữ Nhật ở 390px
  for (const l of ['ru', 'ja']) {
    await p.evaluate((x) => window.I18N.setLang(x), l);
    await sleep(900);
    const t = await p.textContent('#video-dlg h2');
    ok(t && !/vid_/.test(t), `${l}: tiêu đề hộp đã dịch – ${t}`);
    await auditDlg(`hộp Xuất video (${l})`);
  }
  await shot(p, 'video-game-ja-390.png');
  await p.evaluate(() => window.I18N.setLang('vi'));
  await sleep(500);
  await p.click('#video-dlg [data-close]');
  await sleep(200);

  // ------------------------------------------------------------ 5. Bản cổng game: không có nút
  await p.evaluate(() => document.documentElement.classList.add('portal'));
  await p.click('#rp-share');
  await sleep(300);
  ok(await p.isHidden('#sh-video'), 'bản cổng game: hộp chia sẻ không có nút Xuất video');
  await p.click('#share-dlg [data-close]');
  ok(await p.evaluate(() => window.CaroVideo.openGame({ moves: [[0, 0]] })) === false, 'bản cổng game: CaroVideo không mở');
  await p.evaluate(() => window.CaroApp.closeReplay && window.CaroApp.closeReplay());
  await p.evaluate(() => window.CaroShell.open('puzzles'));
  await sleep(500);
  ok(await p.isHidden('#pz-today [data-pz-video]'), 'bản cổng game: thẻ Câu đố hôm nay không có nút Xuất video');

  ok(!errs.length, 'không có lỗi JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
  await finish();
})();
