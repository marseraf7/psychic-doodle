/*
 * Kiểm thử trình duyệt – Đợt 6: xem nhánh đấu như Challonge (đường nối SVG, phóng to / thu nhỏ, tải ảnh PNG), thanh tiến
 * độ + thống kê, dải phong độ ở bảng vòng tròn, khu "Nhúng vào website" và trang nhúng embed.html (đọc JSON công khai).
 *   node caro/tests/e2e/tour-view.e2e.js
 */
'use strict';
const { setup, sleep, gotoRetry } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8798;
  const { browser, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280);
  const tour = () => boss.evaluate(() => window.CaroTourKit.D.tour);
  const newTour = async (name, preset) => {
    await boss.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });
    await boss.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
    await boss.click('[data-act="tourNew"]'); await sleep(300);
    await boss.fill('#tf input[name=name]', name);
    await boss.selectOption('#tf select[name=preset]', preset); await sleep(100);
    await boss.check('#tf input[name=offline]');
    await boss.click('#tf button.primary'); await sleep(800);
  };
  /** Nhập tỉ số cho n trận đầu đang chờ (người A thắng 2–0). */
  const score = (n) => boss.evaluate(async (k) => {
    const t = window.CaroTourKit.D.tour;
    const ms = [];
    for (const v of t.stageViews) for (const l of [...(v.rounds || []), ...((v.groups || []).flatMap((g) => g.rounds))]) for (const m of l) if (!m.done && m.a && m.a.uid && m.b && m.b.uid) ms.push(m);
    for (const m of ms.slice(0, k)) { window.CaroOnline.send({ t: 'tourScore', id: t.id, match: m.id, sets: [[2, 0]] }); await new Promise((r) => setTimeout(r, 150)); }
  }, n);

  // ---------------------------------------------------------------- Loại trực tiếp 8 người
  await newTour('Giải Xem Nhánh', 'single');
  await boss.fill('#bulk-names', 'An\nBình\nChi\nDũng\nEm\nPhúc\nGiang\nHà');
  await boss.click('[data-act="bulkAdd"]'); await sleep(500);
  await boss.click('[data-act="start"]'); await sleep(800);
  await score(4); await sleep(500); await score(1); await sleep(600);
  const t = await tour();
  ok(t.status === 'running', 'Bắt đầu giải 8 người, nhập 5 kết quả');
  ok(await boss.isVisible('.t-progress'), 'Có thanh tiến độ');
  ok(/5\/8/.test(await boss.textContent('.t-stats')) && /63%/.test(await boss.textContent('.t-progress')), 'Thống kê: 5/8 trận đã xong (gồm tranh hạng ba), tiến độ 63%: ' + (await boss.textContent('.t-progress')) + ' | ' + (await boss.textContent('.t-stats')));
  // Đường nối: 4 + 2 trận nối sang vòng sau = 6 đường
  const lines = await boss.$eval('.b-wrap .bracket svg.b-lines path', (p) => (p.getAttribute('d').match(/M/g) || []).length).catch(() => 0);
  ok(lines === 6, 'Đường nối SVG giữa các trận: ' + lines + ' / 6');
  // Phóng to / thu nhỏ
  const w0 = await boss.$eval('.b-wrap .b-col', (e) => e.getBoundingClientRect().width);
  await boss.click('.b-tools [data-bz="1"]'); await sleep(200);
  await boss.click('.b-tools [data-bz="1"]'); await sleep(200);
  const w1 = await boss.$eval('.b-wrap .b-col', (e) => e.getBoundingClientRect().width);
  ok(w1 > w0 * 1.3 && /140%/.test(await boss.textContent('.b-tools [data-bz="0"]')), `Phóng to 140%: cột ${Math.round(w0)} → ${Math.round(w1)} px`);
  const linesZoom = await boss.$eval('.b-wrap .bracket svg.b-lines', (s) => Number(s.getAttribute('width'))).catch(() => 0);
  ok(linesZoom >= w1 * 2, 'Phóng to: vẽ lại đường nối theo cỡ mới');
  await boss.click('.b-tools [data-bz="0"]'); await sleep(200);
  ok(Math.abs(await boss.$eval('.b-wrap .b-col', (e) => e.getBoundingClientRect().width) - w0) < 2, 'Về cỡ gốc 100%');
  // Vẽ lại (có cập nhật) vẫn giữ mức phóng
  await boss.click('.b-tools [data-bz="-1"]'); await sleep(150);
  await score(1); await sleep(600);
  ok(/80%/.test(await boss.textContent('.b-tools [data-bz="0"]')), 'Có kết quả mới (vẽ lại): vẫn giữ mức 80%');
  // Tải ảnh PNG
  const [dl] = await Promise.all([boss.waitForEvent('download', { timeout: 5000 }).catch(() => null), boss.click('.b-tools [data-bpng]')]);
  ok(dl && dl.suggestedFilename() === 'Giai-Xem-Nhanh.png', 'Tải ảnh PNG nhánh đấu: ' + (dl && dl.suggestedFilename()));
  await shot(boss, 'view-bracket.png');

  // ---------------------------------------------------------------- Khu nhúng + trang nhúng
  await boss.check('input[name="tourtab"][value="manage"]'); await sleep(250);
  ok(await boss.isVisible('.embed-sec #embed-code'), 'Tab Quản lý: có khu Nhúng vào website');
  let code = await boss.$eval('#embed-code', (e) => e.value);
  ok(/<iframe src="http:\/\/localhost:\d+\/embed\.html\?t=[0-9a-f]+&amp;lang=vi"/.test(code), 'Mã nhúng iframe trỏ tới embed.html');
  await boss.selectOption('[data-embed="theme"]', 'dark'); await sleep(100);
  code = await boss.$eval('#embed-code', (e) => e.value);
  ok(/theme=dark/.test(code), 'Chọn giao diện Tối: mã nhúng cập nhật ngay');
  const src = code.match(/src="([^"]+)"/)[1].replace(/&amp;/g, '&');
  // Người xem không đăng nhập mở trang nhúng (trong iframe của một trang khác)
  const ctx = await browser.newContext({ viewport: { width: 760, height: 900 } });
  // Website khác nguồn (máy chủ nhỏ ở cổng khác – khác nguồn với app): trang nhúng phải hiện được trong iframe của nó
  const site = require('http').createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(`<h1>Website CLB</h1><iframe src="${src}" style="width:740px;height:700px;border:0"></iframe>`); });
  await new Promise((r) => site.listen(PORT + 1, '127.0.0.1', r));
  const host = await ctx.newPage();
  const errs = [];
  host.on('pageerror', (e) => errs.push(JSON.stringify(e.message + ' @ ' + (e.stack || '').slice(0, 300))));
  await gotoRetry(host, `http://127.0.0.1:${PORT + 1}/`);
  await sleep(1500);
  const fr = host.frame({ url: /embed\.html/ });
  ok(!!fr, 'Trang nhúng nạp được trong iframe của website khác');
  ok(fr && (await fr.textContent('#em-title')) === 'Giải Xem Nhánh', 'Trang nhúng: tên giải');
  ok(fr && (await fr.$$('.b-match')).length >= 8, 'Trang nhúng: vẽ nhánh đấu');
  ok(fr && (await fr.$('.bracket svg.b-lines')), 'Trang nhúng: có đường nối');
  ok(fr && (await fr.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', 'Trang nhúng: giao diện tối theo ?theme=dark');
  ok(fr && /Xem trên Caro x Gomoku/.test(await fr.textContent('#em-open')), 'Trang nhúng: link mở app');
  await host.screenshot({ path: require('path').join(process.env.E2E_OUT || require('os').tmpdir(), 'view-embed.png') });
  ok(!errs.length, 'Trang nhúng không lỗi JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  ok(await boss.evaluate(() => localStorage.getItem('caro.lang')) === 'vi', 'Trang nhúng không đổi ngôn ngữ đã lưu của app');
  // Trang nhúng của giải không có / sai mã
  const bad = await ctx.newPage();
  await gotoRetry(bad, `http://localhost:${PORT}/embed.html?t=abcdef123456&lang=en`);
  await sleep(600);
  ok(/not found/.test(await bad.textContent('#embed')), 'Trang nhúng giải không có: báo không tìm thấy (tiếng Anh theo ?lang=en)');

  // ---------------------------------------------------------------- Vòng tròn: dải phong độ
  await newTour('Giải Phong Độ', 'roundrobin');
  await boss.fill('#bulk-names', 'An\nBình\nChi\nDũng');
  await boss.click('[data-act="bulkAdd"]'); await sleep(500);
  await boss.click('[data-act="start"]'); await sleep(800);
  await score(4); await sleep(600);
  ok(await boss.isVisible('table.stand th[title*="5 trận gần nhất"]'), 'Bảng vòng tròn có cột Phong độ');
  const cells = await boss.$$eval('table.stand td.form .fm', (x) => x.map((e) => e.textContent));
  ok(cells.length === 8 && cells.every((c) => c === 'T' || c === 'B'), 'Dải phong độ: 8 ô T / B cho 4 trận');
  await shot(boss, 'view-form.png');
  // Điện thoại: thanh công cụ không tràn ngang
  await boss.setViewportSize({ width: 360, height: 800 }); await sleep(200);
  ok(await boss.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '360 px: trang giải không tràn ngang');
  await ctx.close();
  site.close();
  await finish();
})();
