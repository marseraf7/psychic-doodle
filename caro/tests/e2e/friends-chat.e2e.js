/*
 * Bạn bè, hồ sơ, bong bóng chat và thanh trên với tên dài (chat-bubbles.js, presence.js, profile.js, topbar.css):
 *  - Thanh trên ở mọi bề rộng 900 → 1920 px (cả khi Windows phóng to 125–150 %), tên dài, khách / đã đăng nhập,
 *    tiếng Việt / Nga: bánh răng Cài đặt luôn nằm trong màn hình, không tràn ngang; chữ cái ảnh đại diện nằm giữa.
 *  - Hồ sơ: Kết bạn → "Đã gửi lời mời kết bạn" + nút Huỷ kết bạn (giữ khi mở lại), huỷ lời mời, đã là bạn → Huỷ kết bạn.
 *  - Bong bóng chat: danh sách bạn bè + trạng thái (online, đang chơi với máy, hoạt động x phút trước), cửa sổ chat,
 *    tin mới từ người chưa mở → chat head có số tin; điện thoại: mở hộp chat toàn màn hình.
 *   node caro/tests/e2e/friends-chat.e2e.js
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8098;
  const { browser, user, ok, shot, sleep, finish } = await setup(PORT);
  const until = async (p, fn, arg, ms = 5000) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };

  // ---------------------------------------------------------------- 1. Thanh trên: tên dài, mọi bề rộng
  const a = await user('vi', 'fc_an', 1920);
  await a.evaluate(() => window.CaroOnline.send({ t: 'setName', name: 'Chi Đoàn ĐHTH Bộ Nội vụ Liên bang Nga' }));
  await sleep(400);
  await a.click('#tabbar [data-tab="home"]');
  const fits = (p) => p.evaluate(() => {
    const g = document.getElementById('tb-gear').getBoundingClientRect();
    return g.width > 0 && g.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1;
  });
  for (const w of [1920, 1536, 1366, 1280, 1100, 1024, 900]) {
    await a.setViewportSize({ width: w, height: 760 });
    await sleep(120);
    ok(await fits(a), `đã đăng nhập, tên dài, ${w}px: bánh răng Cài đặt trong màn hình, không tràn`);
  }
  await a.setViewportSize({ width: 1920, height: 900 });
  const center = await a.evaluate(() => {
    const av = document.querySelector('#tb-auth .avatar'), b = av.querySelector('b');
    const r = av.getBoundingClientRect(), q = b.getBoundingClientRect();
    return Math.abs((r.left + r.right) / 2 - (q.left + q.right) / 2) <= 1.5 && Math.abs((r.top + r.bottom) / 2 - (q.top + q.bottom) / 2) <= 1.5;
  });
  ok(center, 'chữ cái ảnh đại diện nằm giữa vòng tròn');
  for (const lang of ['vi', 'ru']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    await ctx.addInitScript((l) => { localStorage.setItem('caro.lang', l); }, lang);
    const g = await ctx.newPage();
    await g.goto(`http://localhost:${PORT}/`);
    await sleep(700);
    for (const w of [1920, 1280, 1100, 1024, 900, 820, 768, 390, 360]) {
      await g.setViewportSize({ width: w, height: 760 });
      await sleep(120);
      ok(await fits(g), `khách [${lang}] ${w}px: Đăng nhập / Đăng ký + bánh răng gọn trong màn hình`);
    }
    ok(await g.evaluate(() => document.querySelector('#tb-auth [data-auth="register"]').textContent === window.I18N.t('tb_register')), `khách [${lang}]: nút ngắn "Đăng ký"`);
    await shot(g, `fc-guest-${lang}-360.png`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- 2. Hồ sơ: Kết bạn / Huỷ kết bạn
  const b = await user('vi', 'fc_binh', 1280);
  const openProfile = async (p, uname) => {
    await p.evaluate((u) => window.CaroOnline.send({ t: 'profile', username: u }), uname);
    await p.evaluate(() => window.CaroOnline.openDlg('profile-dlg'));
    await until(p, (u) => new RegExp('@' + u).test(document.getElementById('profile-body').textContent), uname);
  };
  const acts = (p) => p.evaluate(() => [...document.querySelectorAll('#profile-body .pf-act > *')].map((e) => e.textContent.trim()));
  await openProfile(a, 'fc_binh');
  ok((await acts(a)).includes('Kết bạn'), 'hồ sơ người lạ: nút Kết bạn');
  await a.click('#profile-body [data-add]');
  ok(await until(a, () => !!document.querySelector('#profile-body [data-unfriend]')), 'bấm Kết bạn: nút đổi thành Huỷ kết bạn');
  let t = await acts(a);
  ok(t.includes('Đã gửi lời mời kết bạn') && t.includes('Huỷ kết bạn') && !t.includes('Kết bạn'), 'hiện "Đã gửi lời mời kết bạn" – ' + t.join(' | '));
  ok(await a.evaluate(() => [...document.querySelectorAll('.toast')].some((x) => /Đã gửi lời mời kết bạn/.test(x.textContent))), 'thông báo đã gửi lời mời');
  await a.evaluate(() => window.CaroOnline.closeDlg('profile-dlg'));
  await openProfile(a, 'fc_binh');
  ok((await acts(a)).includes('Huỷ kết bạn'), 'mở lại hồ sơ: vẫn là Huỷ kết bạn (không hiện lại Kết bạn)');
  await a.click('#profile-body [data-unfriend]');
  ok(await until(a, () => !!document.querySelector('#profile-body [data-add]')), 'huỷ lời mời: về lại nút Kết bạn');
  await a.click('#profile-body [data-add]');
  await sleep(400);
  await openProfile(b, 'fc_an');
  ok((await acts(b)).includes('Chấp nhận kết bạn'), 'người được mời: nút Chấp nhận kết bạn');
  await b.click('#profile-body [data-accept-pf]');
  ok(await until(b, () => !!document.querySelector('#profile-body [data-unfriend][data-rel="friend"]')), 'chấp nhận: thành bạn bè, nút Huỷ kết bạn');
  ok(await until(a, () => !!document.querySelector('#profile-body [data-unfriend][data-rel="friend"]')), 'bên gửi: hồ sơ tự đổi sang Huỷ kết bạn');
  await shot(a, 'fc-profile-friend.png');
  for (const p of [a, b]) await p.evaluate(() => window.CaroOnline.closeDlg('profile-dlg'));

  // ---------------------------------------------------------------- 3. Bong bóng chat (màn hình rộng)
  await a.setViewportSize({ width: 1440, height: 900 });
  await b.setViewportSize({ width: 1440, height: 900 });
  for (const p of [a, b]) await p.click('#tabbar [data-tab="home"]');
  ok(await a.evaluate(() => !document.getElementById('cb').hidden), 'đã đăng nhập: có nút bong bóng chat');
  await a.click('.cb-launch');
  ok(await until(a, () => /fc_binh|Bình|fc_binh/.test(document.querySelector('.cb-panel').textContent) || document.querySelectorAll('.cb-list [data-open]').length === 1), 'danh sách bạn bè trong bong bóng');
  ok(await until(a, () => /Online/.test(document.querySelector('.cb-list small').textContent)), 'trạng thái: Online');
  // Bạn chơi với máy: trạng thái đổi
  await b.evaluate(() => window.CaroApp.startPreset({ rule: 'vn', moves: [[0, 0]], mode: 'ai', bot: 'tit' }));
  ok(await until(a, () => /Đang chơi với máy/.test(document.querySelector('.cb-list small').textContent), null, 8000), 'trạng thái: Đang chơi với máy · <nhân vật> – ' + await a.evaluate(() => document.querySelector('.cb-list small').textContent));
  await shot(a, 'fc-bubble-panel.png');
  await b.click('#btn-home').catch(() => b.evaluate(() => window.CaroShell.go('home')));
  await a.click('.cb-list [data-open]');
  ok(await until(a, () => !!document.querySelector('.cb-win input')), 'bấm bạn: mở cửa sổ chat gắn đáy');
  await a.fill('.cb-win input', 'Chào bạn!');
  await a.press('.cb-win input', 'Enter');
  ok(await until(a, () => /Chào bạn!/.test(document.querySelector('.cb-win .cb-msgs').textContent)), 'tin mình gửi hiện trong cửa sổ');
  ok(await until(b, () => { const h = document.querySelector('.cb-head .count'); return !!h && h.textContent === '1'; }), 'bên nhận: chat head có số 1 tin');
  ok(await b.evaluate(() => ![...document.querySelectorAll('.toast')].some((x) => /Chào bạn!/.test(x.textContent))), 'bên nhận: không bật thêm thông báo nhỏ trùng');
  await b.click('.cb-head');
  ok(await until(b, () => /Chào bạn!/.test((document.querySelector('.cb-win .cb-msgs') || {}).textContent || '')), 'bấm chat head: mở cửa sổ có tin nhắn');
  await b.fill('.cb-win input', 'Chào!');
  await b.press('.cb-win input', 'Enter');
  ok(await until(a, () => /Chào!/.test(document.querySelector('.cb-win .cb-msgs').textContent)), 'trả lời hiện ngay bên kia');
  ok(await until(b, () => !document.querySelector('.cb-launch .count') || document.querySelector('.cb-launch .count').hidden), 'đọc rồi: hết số tin chưa đọc');
  await shot(a, 'fc-bubble-chat.png');
  await a.click('.cb-win [data-min]');
  ok(await a.evaluate(() => !document.querySelector('.cb-win') && !!document.querySelector('.cb-head')), 'thu nhỏ: thành chat head');
  // Bạn offline: "Hoạt động vừa xong"
  await b.context().close();
  await a.click('.cb-launch');
  ok(await until(a, () => /Hoạt động/.test(document.querySelector('.cb-list small').textContent), null, 8000), 'bạn offline: Hoạt động vừa xong / x phút trước');

  // ---------------------------------------------------------------- 4. Điện thoại: hộp chat toàn màn hình
  await a.setViewportSize({ width: 390, height: 844 });
  await a.click('#tabbar [data-tab="home"]');
  await sleep(200);
  const lb = await a.evaluate(() => { const r = document.querySelector('.cb-launch').getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight && r.width > 0; });
  ok(lb, 'điện thoại: nút bong bóng nằm gọn phía trên thanh tab');
  await a.click('.cb-launch');
  await a.click('.cb-list [data-open]');
  ok(await until(a, () => document.getElementById('chat').open), 'điện thoại: bấm bạn → hộp chat toàn màn hình');
  await shot(a, 'fc-mobile-chat.png');

  await finish();
})();
