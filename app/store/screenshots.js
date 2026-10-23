/*
 * Chụp ảnh cửa hàng (Google Play / App Store) từ máy chủ local — Issue #95.
 *   node app/store/screenshots.js
 * Dùng lại setup() của bộ e2e (máy chủ tạm + tài khoản giả, KHÔNG đụng máy chủ thật).
 * Ra: app/store/shots/<ngôn ngữ>/<cỡ>/<cảnh>.png — 4 ngôn ngữ × 3 cỡ × 6 cảnh = 72 ảnh
 *     + app/store/shots/feature-graphic.png (1024×500, từ feature-graphic.html).
 * Thư mục shots/ đã được .gitignore — chỉ commit script này.
 * Cỡ ảnh (viewport × deviceScaleFactor = đúng số pixel yêu cầu):
 *   phone    360×640  ×3 = 1080×1920
 *   tablet7  400×640  ×3 = 1200×1920
 *   tablet10 800×1280 ×2 = 1600×2560
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { setup, sleep } = require('../../caro/tests/e2e/helpers');

const PORT = 8123;
const OUT = path.join(__dirname, 'shots');
const LANGS = ['vi', 'en', 'ru', 'zh'];
const SIZES = [
  { id: 'phone', w: 360, h: 640, dsf: 3 },
  { id: 'tablet7', w: 400, h: 640, dsf: 3 },
  { id: 'tablet10', w: 800, h: 1280, dsf: 2 },
];
const GREET = { vi: 'Xin chào!', en: 'Hello!', ru: 'Привет!', zh: '你好！' };
// Ván mẫu cho cảnh phân tích (giống boat-rapfi.e2e.js): O bỏ mặc thế bốn ở nước 8, X thắng nước 9 — có nước bị chấm "sai lầm"
const GAME = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [-1, 0], [2, 1], [-2, 0]];

const until = async (p, fn, arg, ms = 15000) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };

async function shoot(p, lang, size, scene) {
  await p.setViewportSize({ width: size.w, height: size.h });
  await sleep(450); // chờ bố cục ổn định theo cỡ mới
  // Chờ toast (kết bạn, hiện diện…) tắt hết để ảnh cửa hàng sạch; quá 8 giây thì gỡ thẳng
  await until(p, () => !document.querySelector('#toasts .toast'), null, 8000);
  await p.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((e) => e.remove()));
  const dir = path.join(OUT, lang, size.id);
  fs.mkdirSync(dir, { recursive: true });
  await p.screenshot({ path: path.join(dir, scene + '.png') });
  console.log('  📸', lang, size.id, scene);
}

/** Chạy 6 cảnh trên một trang; sizes = các cỡ cùng deviceScaleFactor với trang. */
async function scenes(p, friend, lang, sizes, ok) {
  const at = async (scene, prep) => { await prep(); for (const s of sizes) await shoot(p, lang, s, scene); };

  await at('01-home', async () => {
    await p.click('#tabbar [data-tab="home"]');
    await sleep(700);
  });

  await at('02-game-boat', async () => {
    await p.evaluate(() => { window.CaroApp.setBot('boat', 7); window.CaroApp.startPreset({ rule: 'free', mode: 'ai', bot: 'boat', moves: [[0, 0], [1, 1], [0, 1], [1, 0]] }); });
    // BOAT đi thêm một nước (Rapfi hoặc engine dự phòng đều được — chỉ cần ván đang sống)
    await until(p, () => window.CaroApp.board.moves.length >= 5, null, 45000);
    await sleep(500);
  });

  await at('03-analysis', async () => {
    await p.evaluate((g) => window.CaroApp.startPreset({ rule: 'free', mode: 'pvp', moves: g }), GAME);
    await sleep(300);
    await p.evaluate(() => document.getElementById('btn-analyze').click());
    ok(await until(p, () => !!document.querySelector('.an-acc'), null, 30000), `${lang}: mở được phân tích ván`);
    await until(p, () => !document.getElementById('an-refine'), null, 90000); // chờ chấm xong; quá hạn vẫn chụp
    await sleep(400);
  });

  await at('04-tours', async () => {
    await p.evaluate(() => window.CaroShell.go('home'));
    await sleep(400);
    await p.evaluate(() => document.getElementById('open-tours').click());
    await sleep(800);
    const hasNew = await p.evaluate(() => !!document.querySelector('[data-act="tourNew"]'));
    if (hasNew) { await p.click('[data-act="tourNew"]'); await sleep(700); } // hiện cả form tạo giải
  });

  await at('05-puzzle', async () => {
    await p.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) { if (window.CaroOnline && window.CaroOnline.closeDlg) window.CaroOnline.closeDlg(d.id); else d.close(); } }); // đóng dialog (form tạo giải) nếu còn mở
    await p.evaluate(() => window.CaroShell.go('home'));
    await sleep(400);
    await p.click('#tabbar [data-tab="puzzles"]');
    await sleep(600);
    await p.click('[data-pz="rated"]');
    await until(p, () => !!document.querySelector('#board, .pz-board, canvas'), null, 10000);
    await sleep(700);
  });

  await at('06-friends-chat', async () => {
    await p.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) { if (window.CaroOnline && window.CaroOnline.closeDlg) window.CaroOnline.closeDlg(d.id); else d.close(); } }); // đóng dialog (form tạo giải) nếu còn mở
    await p.evaluate(() => window.CaroShell.go('home'));
    await sleep(400);
    await p.click('#tabbar [data-tab="home"]');
    await sleep(500);
    await p.click('.cb-launch');
    await until(p, () => document.querySelectorAll('.cb-list [data-open]').length >= 1, null, 10000);
    await p.click('.cb-list [data-open]');
    // Màn hình hẹp: mở hộp chat toàn màn hình (#chat); màn hình rộng: cửa sổ bong bóng (.cb-win)
    await until(p, () => !!document.querySelector('.cb-win input') || (document.getElementById('chat') || {}).open, null, 10000);
    const mobile = await p.evaluate(() => (document.getElementById('chat') || {}).open && !document.querySelector('.cb-win input'));
    const inp = mobile ? '#chat-form input[name="text"]' : '.cb-win input';
    const msgs = mobile ? '#chat-msgs' : '.cb-win .cb-msgs';
    await p.fill(inp, GREET[lang]);
    await p.press(inp, 'Enter');
    await until(p, ([sel, g]) => (document.querySelector(sel) || {}).textContent.includes(g), [msgs, GREET[lang]], 10000);
    await sleep(400);
  });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  const { browser, user, ok, finish } = await setup(PORT);
  let made = 0;

  for (const lang of LANGS) {
    console.log('== Ngôn ngữ:', lang);
    // Bạn diễn (chỉ cần một trang phụ cho cảnh 6; cỡ nào cũng được)
    const sam = await user(lang, 'sam' + lang, 390);
    // Hai nhóm theo deviceScaleFactor: 3 (phone + tablet7 chung một trang) và 2 (tablet10)
    for (const dsf of [3, 2]) {
      const sizes = SIZES.filter((s) => s.dsf === dsf);
      const first = sizes[0];
      const alex = await user(lang, `alex${lang}${dsf}`, first.w, { viewport: { width: first.w, height: first.h }, deviceScaleFactor: dsf });
      // Kết bạn alex <-> sam (qua hồ sơ như người dùng thật)
      await alex.evaluate((u) => window.CaroOnline.send({ t: 'profile', username: u }), 'sam' + lang);
      await alex.evaluate(() => window.CaroOnline.openDlg('profile-dlg'));
      await until(alex, () => !!document.querySelector('#profile-body [data-add]'), null, 10000);
      await alex.click('#profile-body [data-add]');
      await sleep(500);
      await sam.evaluate((u) => window.CaroOnline.send({ t: 'profile', username: u }), `alex${lang}${dsf}`);
      await sam.evaluate(() => window.CaroOnline.openDlg('profile-dlg'));
      await until(sam, () => !!document.querySelector('#profile-body [data-accept-pf]'), null, 10000);
      await sam.click('#profile-body [data-accept-pf]');
      await sleep(600);
      await alex.evaluate(() => window.CaroOnline.closeDlg('profile-dlg'));
      await scenes(alex, sam, lang, sizes, ok);
      made += sizes.length * 6;
      await alex.context().close();
    }
    await sam.context().close();
  }

  // Feature graphic 1024×500 từ trang tĩnh
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 } });
  const fp = await ctx.newPage();
  const ferr = [];
  fp.on('pageerror', (e) => ferr.push(e.message));
  await fp.goto('file://' + path.join(__dirname, 'feature-graphic.html'));
  await sleep(400);
  await fp.screenshot({ path: path.join(OUT, 'feature-graphic.png') });
  ok(!ferr.length, 'feature-graphic.html không lỗi JS' + (ferr.length ? ': ' + ferr.join(' | ') : ''));
  await ctx.close();

  // Đếm đủ ảnh
  let count = 0;
  for (const lang of LANGS) for (const s of SIZES) for (const f of fs.readdirSync(path.join(OUT, lang, s.id))) if (f.endsWith('.png')) count++;
  ok(count === 72, `đủ 72 ảnh cảnh (thực tế ${count})`);
  ok(fs.existsSync(path.join(OUT, 'feature-graphic.png')), 'có feature-graphic.png');
  console.log('Ảnh đã chụp:', count + 1, '· thư mục:', OUT);
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
