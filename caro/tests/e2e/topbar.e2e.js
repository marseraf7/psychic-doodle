/*
 * Thanh trên và các phần đi kèm (topbar.js, quick-settings.js, player-search.js, online-count.js, backdrop.js, avatar.js):
 *  - Màn hình rộng: công cụ nằm cuối menu trên cùng; điện thoại: ở đầu Trang chủ, không tràn ngang.
 *  - Khách thấy Đăng nhập / Đăng ký (mở đúng hộp thoại); đã đăng nhập thấy ảnh + tên.
 *  - Tìm kỳ thủ: gõ tên → gợi ý → bấm mở hồ sơ. Ô kết bạn có ví dụ @tennguoichoi và cũng gợi ý tên.
 *  - Cài đặt nhanh: đổi giao diện, quân cờ, ngôn ngữ, âm thanh, ảnh nền; có PING / MÁY CHỦ; giữ sau khi tải lại.
 *  - Góc Trang chủ: số kỳ thủ online / số ván đang đấu – đúng số máy chủ đếm.
 *  - Ảnh đại diện: chọn ảnh lớn → thu nhỏ 128×128, ≤ 10 KB, hiện trong thẻ tài khoản, thanh trên, danh sách bạn bè.
 *   node caro/tests/e2e/topbar.e2e.js
 */
'use strict';
const { setup, gotoRetry } = require('./helpers');
const { boardPng } = require('../../../server/src/png.js');

(async () => {
  const PORT = 8097;
  const { browser, user, ok, shot, sleep, finish } = await setup(PORT);
  const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0; }, sel);

  // ---------------------------------------------------------------- 1. Khách: Đăng nhập / Đăng ký trên thanh trên
  const gctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const g = await gctx.newPage();
  const gErr = [];
  g.on('pageerror', (e) => gErr.push(e.message));
  await g.goto(`http://localhost:${PORT}/`);
  await sleep(800);
  ok(await g.evaluate(() => document.getElementById('tb-tools').parentElement.id === 'tabbar'), 'màn hình rộng: công cụ nằm trên menu trên cùng');
  ok(await visible(g, '#tb-auth [data-auth="login"]') && await visible(g, '#tb-auth [data-auth="register"]'), 'khách: có nút Đăng nhập và Đăng ký');
  await g.click('#tb-auth [data-auth="register"]');
  await sleep(300);
  ok(await g.evaluate(() => document.getElementById('auth').open && document.getElementById('auth-form').classList.contains('register')), 'bấm Đăng ký: mở hộp thoại tạo tài khoản');
  await g.keyboard.press('Escape');
  ok(!gErr.length, 'khách: không lỗi JS ' + gErr.join(' | '));

  // ---------------------------------------------------------------- 2. Hai tài khoản; tìm kỳ thủ
  const a = await user('vi', 'tb_an', 1280);
  await a.context().addInitScript(() => { window.addEventListener('caro:board', () => { window.__boardStack = String(new Error().stack).slice(0, 600); }); });
  const b = await user('vi', 'tb_binh', 390);
  await a.click('#tabbar [data-tab="home"]');
  await sleep(300);
  ok(await visible(a, '#tb-auth .tb-me'), 'đã đăng nhập: thanh trên hiện ảnh + tên');
  await a.fill('#tb-search', 'tb_b');
  await a.waitForSelector('#tb-tools .ps-list li[data-i]', { timeout: 3000 }).catch(() => {});
  const sug = await a.evaluate(() => [...document.querySelectorAll('#tb-tools .ps-list li[data-i] small')].map((s) => s.textContent));
  ok(sug.includes('@tb_binh'), 'tìm kỳ thủ: gợi ý @tb_binh (' + sug.join(', ') + ')');
  await shot(a, 'topbar-search.png');
  await a.click('#tb-tools .ps-list li[data-i]');
  await sleep(600);
  ok(await a.evaluate(() => /tb_binh/.test(document.getElementById('profile-body').textContent)), 'chọn gợi ý: mở hồ sơ tb_binh');
  await a.keyboard.press('Escape');

  // Ô kết bạn: ví dụ @tennguoichoi, gợi ý tên, chọn thì điền @tên
  await a.click('#tabbar [data-tab="more"]');
  await sleep(300);
  ok(/@tennguoichoi/.test(await a.getAttribute('#add-friend input[name=u]', 'placeholder')), 'ô kết bạn: ví dụ @tennguoichoi');
  await a.fill('#add-friend input[name=u]', 'tb_bi');
  await a.waitForSelector('#add-friend .ps-list li[data-i]', { timeout: 3000 }).catch(() => {});
  await a.click('#add-friend .ps-list li[data-i]').catch(() => {});
  ok(await a.inputValue('#add-friend input[name=u]') === '@tb_binh', 'ô kết bạn: chọn gợi ý thì điền @tb_binh');
  await a.click('#add-friend button.primary');
  await sleep(400);
  await b.evaluate(() => window.CaroOnline.send({ t: 'friendAdd', username: 'tb_an' }));
  await sleep(500);

  // ---------------------------------------------------------------- 3. Số kỳ thủ / số ván ở góc Trang chủ
  await a.click('#tabbar [data-tab="home"]');
  await a.evaluate(() => window.CaroOnline.send({ t: 'ping' }));
  await sleep(500);
  const oc = await a.evaluate(() => { const e = document.getElementById('online-count'); return { vis: !e.hidden && getComputedStyle(e).display !== 'none', text: e.textContent }; });
  ok(oc.vis && /3 kỳ thủ online/.test(oc.text) && /0 ván đang đấu/.test(oc.text), 'góc Trang chủ: 3 kỳ thủ online (khách + 2 tài khoản), 0 ván – ' + oc.text);

  // ---------------------------------------------------------------- 4. Cài đặt nhanh
  await a.click('#tb-gear');
  await sleep(200);
  ok(await visible(a, '#qs .qs-row[data-sub="lang"]'), 'bánh răng: mở Cài đặt nhanh');
  ok(await a.evaluate(() => /Ping\s+\d+ ms/.test(document.querySelector('#qs .qs-net').textContent) && /Máy chủ\s+\d+ ms/.test(document.querySelector('#qs .qs-net').textContent)), 'Cài đặt nhanh: có Ping và Máy chủ (ms)');
  await shot(a, 'topbar-quick.png');
  // Giao diện (như Lichess): sáng / tối / theo thiết bị + bo tròn + ảnh nền trong cùng trang con
  await a.click('#qs [data-sub="theme"]');
  await a.click('#qs [data-v="light"]');
  ok(await a.evaluate(() => window.CaroTheme.get() === 'light'), 'đổi giao diện: sáng');
  ok(await visible(a, '#qs [data-range="corner"]') && await visible(a, '#qs [data-tog="bg"]'), 'trang Giao diện có Bo tròn và Ảnh nền');
  await a.locator('#qs [data-range="corner"]').fill('4');
  ok(await a.evaluate(() => document.documentElement.hasAttribute('data-corner') && getComputedStyle(document.querySelector('.hbtn')).borderTopLeftRadius === '4px'
    && document.querySelector('#qs [data-val="corner"]').textContent === '4px'), 'bo tròn 4px: các ô / nút đổi theo');
  await a.click('#qs [data-tog="bg"]');
  ok(await a.evaluate(() => document.body.classList.contains('bg-img') && document.getElementById('settings-form').bg.checked), 'bật ảnh nền (cả ô trong Cài đặt)');
  await a.click('#qs [data-back]');
  await a.click('#qs [data-sub="pieces"]');
  await a.click('#qs [data-v="stones"]');
  ok(await a.evaluate(() => window.CaroStyle.pieces === 'stones'), 'đổi quân cờ: quân đá');
  await a.click('#qs [data-sub="board"]');
  ok(await a.evaluate(() => document.querySelectorAll('#qs .qs-opt').length >= 13), 'có ≥ 13 mẫu bàn cờ');
  await a.click('#qs [data-v="walnut"]');
  ok(await a.evaluate(() => window.CaroStyle.board === 'walnut' && getComputedStyle(document.documentElement).getPropertyValue('--board').trim() === '#a77a52'), 'đổi bàn cờ: gỗ óc chó');
  // Âm thanh: bật / tắt, âm lượng, ≥ 10 kiểu
  const before = await a.evaluate(() => window.CaroSound.enabled);
  await a.click('#qs [data-sub="soundStyle"]');
  await a.click('#qs [data-tog="sound"]');
  ok(await a.evaluate((v) => window.CaroSound.enabled === !v, before), 'bật / tắt âm thanh');
  await a.locator('#qs [data-range="vol"]').fill('30');
  ok(await a.evaluate(() => window.CaroSound.volume === 30), 'âm lượng 30%');
  ok(await a.evaluate(() => document.querySelectorAll('#qs .qs-opt').length >= 10), 'có ≥ 10 kiểu âm thanh');
  await a.click('#qs [data-v="piano"]');
  ok(await a.evaluate(() => window.CaroSound.style === 'piano' && !!document.querySelector('#qs [data-range="vol"]')), 'chọn kiểu piano (vẫn ở trang Âm thanh)');
  await a.click('#qs [data-back]');
  ok(await a.evaluate(async () => (await fetch('img/backdrop.webp')).ok), 'ảnh nền tải được');
  await a.click('#qs [data-sub="lang"]');
  await a.click('#qs [data-v="en"]');
  ok(await a.evaluate(() => window.I18N.lang === 'en' && document.querySelector('#tb-search').placeholder === 'Search players…'), 'đổi ngôn ngữ: tiếng Anh');
  await a.mouse.click(600, 500);
  await sleep(150);
  ok(await a.evaluate(() => document.getElementById('qs').hidden), 'bấm ra ngoài: đóng Cài đặt nhanh');
  // Mở lại trang (như tải lại). Firefox (CI) đôi khi không xong điều hướng: gotoRetry thử lại 1 lần (helpers.js)
  await gotoRetry(a, `http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(800);
  // (ngôn ngữ: hồ sơ trình duyệt của kịch bản đặt lại tiếng Việt mỗi lần mở trang – helpers.js)
  ok(await a.evaluate(() => window.CaroTheme.get() === 'light' && window.CaroStyle.pieces === 'stones' && document.body.classList.contains('bg-img')
    && window.CaroStyle.board === 'walnut' && window.CaroCorners.value === 4 && window.CaroSound.volume === 30 && window.CaroSound.style === 'piano'), 'tải lại: giữ giao diện, quân cờ, ảnh nền, bàn cờ, bo tròn, âm lượng, kiểu âm thanh');
  await a.evaluate(() => { window.CaroBackdrop.set(false); window.CaroApp.setSetting('lang', 'vi'); });
  // Tải lại chỉ chờ domcontentloaded: chờ kết nối lại và đăng nhập lại xong (thẻ tài khoản mới có nút đổi ảnh)
  await a.waitForFunction(() => { const m = window.CaroOnline.state.me; return m && !m.guest; }, null, { timeout: 15000 });

  // ---------------------------------------------------------------- 5. Ảnh đại diện
  // WebKit trên CI: đôi khi mở lại trang xong khung trang đang ẩn (ở bàn cờ) – in chẩn đoán (ai phát 'caro:board') rồi mở tab
  // Xem thêm bằng CaroShell; bước này kiểm ảnh đại diện, không kiểm điều hướng
  const diag = await a.evaluate(() => ({ shell: !document.getElementById('shell').hidden, page: window.CaroShell.current,
    online: !!window.CaroApp.online, ext: !!window.CaroApp.ext, board: window.__boardStack || null }));
  if (!diag.shell) { console.log('     (khung trang đang ẩn sau khi mở lại: ' + JSON.stringify(diag) + ')'); await a.evaluate(() => window.CaroShell.open('more')); }
  else await a.click('#tabbar [data-tab="more"]');
  await sleep(300);
  const [chooser] = await Promise.all([a.waitForEvent('filechooser'), a.click('#av-change')]);
  await chooser.setFiles({ name: 'big.png', mimeType: 'image/png', buffer: boardPng([[0, 0], [1, 1], [2, 2], [1, 0]], 'vn') }); // 1200×630
  await sleep(1200);
  const me = await a.evaluate(() => window.CaroOnline.state.me);
  ok(me.av > 0, 'tải ảnh đại diện: tài khoản có ảnh');
  const img = await a.evaluate(async () => {
    const i = document.querySelector('#account .avatar img');
    if (!i) return null;
    await i.decode().catch(() => {});
    const r = await fetch(i.src);
    return { w: i.naturalWidth, h: i.naturalHeight, size: (await r.arrayBuffer()).byteLength, type: r.headers.get('content-type') };
  });
  ok(img && img.w === 128 && img.h === 128 && img.size <= 10240, 'ảnh đã thu nhỏ 128×128, ≤ 10 KB: ' + JSON.stringify(img));
  ok(await a.evaluate(() => !!document.querySelector('#tb-auth .avatar img')), 'thanh trên hiện ảnh mới');
  await b.click('#tabbar [data-tab="more"]');
  await sleep(500);
  ok(await b.evaluate(() => !!document.querySelector('#friends .avatar img')), 'bạn bè thấy ảnh trong danh sách bạn bè');
  await shot(a, 'topbar-avatar.png');
  await a.click('#av-remove');
  await sleep(500);
  ok(await a.evaluate(() => window.CaroOnline.state.me.av === 0 && !document.querySelector('#account .avatar img')), 'xoá ảnh đại diện');

  // ---------------------------------------------------------------- 6. Điện thoại: công cụ ở đầu Trang chủ, không tràn
  for (const w of [360, 390]) {
    await b.setViewportSize({ width: w, height: 760 });
    await b.click('#tabbar [data-tab="home"]');
    await sleep(250);
    const m = await b.evaluate(() => ({
      inHome: !!document.querySelector('#page-home .pg-right #tb-tools'),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      gear: document.getElementById('tb-gear').getBoundingClientRect().right <= window.innerWidth,
    }));
    ok(m.inHome && !m.overflow && m.gear, `điện thoại ${w}px: công cụ ở đầu Trang chủ, không tràn ngang`);
  }
  await b.click('#tb-search-btn');
  await b.keyboard.type('tb_a');
  await b.waitForSelector('#tb-tools .ps-list li[data-i]', { timeout: 3000 }).catch(() => {});
  ok(await visible(b, '#tb-tools .ps-list li[data-i]'), 'điện thoại: bấm kính lúp, gõ tên thì hiện gợi ý');
  await shot(b, 'topbar-mobile-search.png');
  await b.click('#tb-gear');
  await sleep(200);
  const qsBox = await b.evaluate(() => { const r = document.getElementById('qs').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
  ok(qsBox, 'điện thoại: Cài đặt nhanh nằm gọn trong màn hình');
  await shot(b, 'topbar-mobile-quick.png');

  await gctx.close();
  await finish();
})();
