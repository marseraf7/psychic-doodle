/*
 * Kiểm thử trình duyệt – Giải đấu Offline: nhúng vào website + xuất PDF.
 *   - /api/otour/<link riêng>.json: giải công khai trả dữ liệu; giải nháp / riêng tư: 404;
 *   - tab Khác: mã <iframe> embed.html?o=<mã giải>; trang nhúng (mở bằng link riêng cũng được) vẽ bảng xếp hạng + các trận, nút mở trang giải ?o=;
 *   - Báo cáo giải (PDF): file PDF hợp lệ (xref trỏ đúng từng đối tượng), đủ trang, ảnh trang 1 lưu lại để xem.
 *   node caro/tests/e2e/otour-embed.e2e.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8820;
  const { app, user, ok, shot, finish, browser } = await setup(PORT);
  const boss = await user('vi', 'ban_nhung', 1100);
  const make = async (name, slug, access) => {
    await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
    await boss.fill('#otf input[name=name]', name);
    await boss.fill('#otf input[name=slug]', slug);
    if (access) await boss.check(`#otf input[name=access][value="${access}"]`);
    await boss.selectOption('#otf select[name=sport]', 'football'); await sleep(150);
    await boss.selectOption('#otf select[name=preset]', 'roundrobin'); await sleep(150);
    await boss.fill('#otf textarea[name=teams]', 'Sao Mai\nBến Nghé\nPhú Mỹ\nTân Định');
    await boss.click('#otf button.primary.wide'); await sleep(900);
    return app.hub.otGet(await boss.evaluate(() => window.CaroTourKit.D.ot.id));
  };
  // Gọi API từ Node (không qua trình duyệt: lỗi 404 có chủ ý không lẫn vào console)
  const api = (k) => fetch(`http://localhost:${PORT}/api/otour/${k}.json`);

  const hidden = await make('Giải kín', 'giai-kin', 'private');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(800);
  const t = await make('Bóng đá nhúng', 'bong-da-nhung');
  // Giải nháp: không công khai (kiểm thẳng hub – gọi HTTP thì kết quả 404 được giữ 10 giây, che lần gọi sau khi bắt đầu)
  ok(app.hub.publicOTour('bong-da-nhung') === null, 'Giải nháp: API công khai không trả dữ liệu');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(900);
  ok(hidden.status === 'running' && (await api('giai-kin')).status === 404, 'Giải riêng tư: API công khai trả 404');
  const ms = Object.values(t.st[0].matches);
  for (const [i, m] of ms.entries()) {
    if (i === ms.length - 1) break; // để một trận chưa đá (trang nhúng / PDF hiện "–")
    await boss.evaluate(([tid, mid, s]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, score: s }), [t.id, m.id, [2 + (i % 2), i % 2]]);
    await sleep(150);
  }
  await sleep(700);
  const j = await (await api('bong-da-nhung')).json();
  ok(j.kind === 'otour' && j.url === '/?o=bong-da-nhung' && j.stageViews[0].groups[0].table.length === 4 && !('log' in j) && !('canManage' in j), 'API công khai: dữ liệu trang giải, không có phần riêng của ban tổ chức');

  // Tab Khác: mã nhúng
  await boss.click('[data-act="otTab"][data-tab="more"]'); await sleep(300);
  const code = await boss.$eval('#embed-code', (e) => e.value).catch(() => '');
  ok(code.includes(`embed.html?o=${t.id}`) && /<iframe/.test(code), 'Tab Khác: mã <iframe> trỏ embed.html?o=<mã giải> (không đổi khi đổi link riêng)');
  await boss.selectOption('[data-embed="view"]', 'standings'); await sleep(150);
  ok(/view=standings/.test(await boss.$eval('#embed-code', (e) => e.value)), 'Đổi kiểu xem: mã nhúng cập nhật');

  // Trang nhúng (khách, không đăng nhập)
  const ctx = await browser.newContext({ viewport: { width: 760, height: 900 } });
  const em = await ctx.newPage();
  const emErr = [];
  em.on('pageerror', (e) => emErr.push(e.message));
  await em.goto(`http://localhost:${PORT}/embed.html?o=bong-da-nhung&lang=vi&theme=light`);
  await em.waitForSelector('#embed table.stand', { timeout: 10000 }).catch(() => {});
  ok(await em.textContent('#em-title') === 'Bóng đá nhúng' && await em.$$eval('#embed table.stand tbody tr', (x) => x.length) === 4, 'Trang nhúng: tên giải + bảng xếp hạng 4 đội');
  ok(await em.$$eval('#embed .mrow', (x) => x.length) === 6, 'Trang nhúng: đủ 6 trận');
  ok(/\?o=bong-da-nhung$/.test(await em.$eval('#em-open', (a) => a.href)), 'Trang nhúng: nút mở trang giải ?o=');
  ok(!emErr.length, 'Trang nhúng không lỗi JS: ' + emErr.join(' | '));
  await shot(em, 'ot-embed.png');
  await ctx.close();

  // Báo cáo PDF
  await boss.$eval('details[data-k$=":export"]', (d) => { d.open = true; }).catch(() => {}); await sleep(300);
  const [dl] = await Promise.all([boss.waitForEvent('download', { timeout: 20000 }), boss.click('[data-act="otPdf"]')]);
  const buf = fs.readFileSync(await dl.path());
  const s = buf.toString('latin1');
  ok(dl.suggestedFilename() === 'bong-da-nhung.pdf' && s.startsWith('%PDF-1.4') && s.endsWith('%%EOF\n'), 'Tải về file PDF');
  const sx = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(s)[1]);
  const n = Number(/^xref\n0 (\d+)\n/.exec(s.slice(sx))[1]);
  const offs = s.slice(sx).split('\n').slice(3, 2 + n).map((l) => Number(l.slice(0, 10)));
  ok(offs.every((o, i) => s.slice(o, o + `${i + 1} 0 obj`.length) === `${i + 1} 0 obj`), 'PDF hợp lệ: bảng xref trỏ đúng từng đối tượng');
  const pages = Number(/\/Type \/Pages \/Count (\d+)/.exec(s)[1]);
  ok(pages >= 1 && pages <= 3, `PDF ${pages} trang (giải 4 đội)`);
  // Lưu ảnh trang 1 để xem bằng mắt
  const a = s.indexOf('/DCTDecode'), st = s.indexOf('stream\n', a) + 7, len = Number(/\/Length (\d+)/.exec(s.slice(a))[1]);
  const jpg = path.join(process.env.E2E_OUT || require('os').tmpdir(), 'ot-pdf-p1.jpg');
  fs.writeFileSync(jpg, buf.subarray(st, st + len));
  console.log('Ảnh trang 1 của PDF:', jpg);
  ok(buf[st] === 0xff && buf[st + 1] === 0xd8, 'Trang PDF là ảnh JPEG');
  await finish();
})();
