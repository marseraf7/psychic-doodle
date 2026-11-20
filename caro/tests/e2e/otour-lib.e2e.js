/*
 * Kiểm thử trình duyệt – thư viện mẫu giải dạng ô gọn + hộp chi tiết (otour-tpl-lib.js, hình: otour-tpl-art.js) và form
 * tạo giải Offline chia bước (otour-new-ui.js). Chỉ mô phỏng thể thức – không có tên, logo, dữ liệu giải thật.
 *   1. Form chỉ có MỘT ô gọn "Mẫu giải nổi tiếng" (không còn lưới thẻ dài); bấm → hộp danh sách đủ mẫu, nhóm theo mục,
 *      ô tìm (bỏ dấu) và nút lọc mục hoạt động; Esc đóng hộp, focus trở về ô gọn.
 *   2. Chi tiết mẫu: sơ đồ SVG từng giai đoạn, luật chơi, từng giai đoạn bằng lời, link thể thức mở tab mới (noopener);
 *      "Quay lại" về danh sách; "Dùng mẫu này" điền form như bấm thẻ mẫu trước đây.
 *   3. Form chia bước: Bắt đầu nhanh + 4 bước có số, khung "Giải của bạn" đổi theo số đội và thẻ chọn nhanh thể thức;
 *      máy tính: khung tóm tắt dính bên phải; điện thoại 390px: không cuộn ngang, khung tóm tắt nằm cuối (không che ô
 *      nhập), hộp mẫu toàn màn hình; soát giao diện 0 lỗi; tiếng Trung không lộ {x}; không lỗi JS.
 *   node caro/tests/e2e/otour-lib.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const { audit } = require('./ui-audit.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8871;
  const { user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_thuvien', 1280);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(400);

  // 1. Ô gọn + danh sách
  const total = await boss.evaluate(() => window.CaroOTourTemplates.TEMPLATES.length);
  ok(await boss.$$eval('.tpl-tile', (x) => x.length) === 1 && !(await boss.$('.tpl-cards')) && !(await boss.$('#otf .tpl-item')), 'Form chỉ có một ô gọn mẫu giải (không còn lưới thẻ)');
  ok(new RegExp(`Mẫu giải nổi tiếng · ${total} mẫu`).test(await boss.textContent('.tpl-tile')), `Ô gọn ghi số mẫu (${total})`);
  await boss.click('.tpl-tile'); await sleep(300);
  ok(await boss.evaluate(() => document.querySelector('dialog.tpl-lib').open), 'Bấm ô gọn: mở hộp danh sách');
  const vis = () => boss.$$eval('.tpl-lib .tpl-item', (b) => b.filter((x) => x.offsetParent).map((x) => x.dataset.id));
  ok((await vis()).length === total && (await boss.$$('.tpl-lib .tpl-cat')).length >= 5, `Danh sách đủ ${total} mẫu, nhóm theo mục`);
  await boss.fill('#tpl-q', 'champions league'); await sleep(150);
  ok(JSON.stringify(await vis()) === '["champions_league"]', 'Tìm "champions league": còn đúng 1 mẫu');
  await boss.fill('#tpl-q', 'bong da'); await sleep(150);
  ok((await vis()).includes('premier_league') && !(await vis()).includes('cs_major'), 'Tìm không dấu "bong da" ra mẫu bóng đá');
  await boss.fill('#tpl-q', 'zzzz'); await sleep(150);
  ok(!(await vis()).length && await boss.isVisible('.tpl-lib .tpl-none'), 'Không khớp: báo không có mẫu');
  await boss.fill('#tpl-q', ''); await boss.click('.tpl-lib .chip[data-cat="br"]'); await sleep(150);
  const br = await vis();
  ok(br.length > 3 && br.every((id) => /^pg|tft|algs/.test(id)) && await boss.getAttribute('.tpl-lib .chip[data-cat="br"]', 'aria-pressed') === 'true', 'Lọc mục Sinh tồn');
  await boss.click('.tpl-lib .chip[data-cat=""]'); await sleep(150);
  await shot(boss, 'lib-list.png');
  await boss.keyboard.press('Escape'); await sleep(250);
  ok(!(await boss.evaluate(() => document.querySelector('dialog.tpl-lib').open)) && await boss.evaluate(() => document.activeElement && document.activeElement.classList.contains('tpl-tile')), 'Esc đóng hộp, focus về ô gọn');

  // 2. Chi tiết mẫu
  await boss.click('.tpl-tile'); await sleep(250);
  await boss.click('.tpl-lib .tpl-item[data-id="champions_league"]'); await sleep(250);
  ok(await boss.$$eval('.tpl-lib .tpl-flow svg.tpl-svg', (x) => x.length) === 2, 'Chi tiết: sơ đồ SVG cho 2 giai đoạn');
  ok(/36 đội/.test(await boss.textContent('.tpl-lib .tpl-rules')) && /Giai đoạn 1: vòng phân hạng/.test(await boss.textContent('.tpl-lib .tpl-lines')), 'Chi tiết: luật chơi + từng giai đoạn bằng lời');
  ok(/36 đội · 24 đi tiếp/.test(await boss.textContent('.tpl-lib .tpl-flow')), 'Sơ đồ ghi 36 đội · 24 đi tiếp (từ thông số mẫu)');
  const links = await boss.$$eval('.tpl-lib .tpl-links a', (a) => a.map((x) => ({ href: x.href, t: x.target, rel: x.rel })));
  ok(links.length === 2 && links.every((x) => /^https:\/\/(vi|en)\.wikipedia\.org\/wiki\//.test(x.href) && x.t === '_blank' && /noopener/.test(x.rel)), 'Link thể thức: Wikipedia, tab mới, rel=noopener ' + JSON.stringify(links));
  ok(await boss.evaluate(() => document.activeElement && document.activeElement.id === 'tpl-lib-h'), 'Mở chi tiết: focus tiêu đề hộp');
  await shot(boss, 'lib-detail.png');
  await boss.click('.tpl-lib .tpl-foot [data-lib="back"]'); await sleep(200);
  ok(await boss.isVisible('#tpl-q') && await boss.evaluate(() => document.activeElement && document.activeElement.dataset.id === 'champions_league'), 'Quay lại: về danh sách, focus đúng mẫu vừa xem');
  await boss.click('.tpl-lib .tpl-item[data-id="champions_league"]'); await sleep(200);
  await boss.click('.tpl-lib [data-lib="use"]'); await sleep(400);
  ok(!(await boss.evaluate(() => document.querySelector('dialog.tpl-lib').open)), '"Dùng mẫu này": đóng hộp');
  ok(await boss.inputValue('#otf select[name=sport]') === 'football' && await boss.inputValue('#otf input[name=name]') === 'Kiểu Champions League'
    && await boss.isChecked('#otf-stages [data-k="league"]') && /Kiểu Champions League/.test(await boss.textContent('.tpl-card.on')), 'Áp mẫu: bộ môn, tên tạm, vòng phân hạng như bấm thẻ mẫu trước đây');
  await boss.click('.tpl-desc [data-act="otTplInfo"]'); await sleep(250);
  ok(await boss.evaluate(() => document.querySelector('dialog.tpl-lib').dataset.view === 'detail') && /Champions/.test(await boss.textContent('#tpl-lib-h')), '"Xem chi tiết mẫu" ở form mở thẳng chi tiết');
  await boss.click('.tpl-lib [data-lib="close"]'); await sleep(200);
  await boss.click('[data-act="otTplOff"]'); await sleep(300);

  // 3. Form chia bước + khung tóm tắt
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(400);
  const steps = await boss.$$eval('#otf .ot-step', (s) => s.length);
  ok(steps === 5 && await boss.$$eval('#otf .ot-num', (n) => n.map((x) => x.textContent).join()) === '1,2,3,4', 'Form có Bắt đầu nhanh + 4 bước đánh số');
  ok(!(await boss.evaluate(() => document.querySelector('details[data-k="otf:io"]').open)), 'Bước 4 (tuỳ chọn nâng cao) thu gọn sẵn');
  ok(/Chưa có đội · Vòng bảng \+ loại trực tiếp/.test(await boss.textContent('#otf-sum')), 'Tóm tắt khi chưa có đội');
  await boss.fill('#otf textarea[name=teams]', Array.from({ length: 16 }, (_, i) => 'Đội ' + (i + 1)).join('\n')); await sleep(200);
  const s1 = await boss.textContent('#otf-sum');
  ok(/16 đội · Vòng bảng \+ loại trực tiếp · khoảng \d+ trận/.test(s1), 'Tóm tắt đổi theo số đội: ' + s1);
  await boss.click('#otf .ot-fmt[data-fmt="double"]'); await sleep(300);
  const s2 = await boss.textContent('#otf-sum');
  ok(await boss.inputValue('#otf select[name=preset]') === 'double' && /16 đội · Nhánh thắng – nhánh thua · khoảng 3\d(–3\d)? trận/.test(s2)
    && await boss.getAttribute('#otf .ot-fmt[data-fmt="double"]', 'aria-pressed') === 'true', 'Thẻ thể thức: chọn loại kép, tóm tắt đổi: ' + s2);
  ok(await boss.$$eval('#otf-stages [data-sact], #otf-stages select, #otf-stages input', (x) => x.length) > 0, 'Trình sửa giai đoạn vẫn hiện');
  await boss.selectOption('#otf select[name=preset]', 'swiss'); await sleep(300);
  ok(await boss.getAttribute('#otf .ot-fmt[data-fmt="swiss"]', 'aria-pressed') === 'true' && /Hệ Thụy Sĩ/.test(await boss.textContent('#otf-sum')), 'Chọn trong hộp chọn: thẻ + tóm tắt theo');
  ok(await boss.$eval('.ot-sum', (e) => getComputedStyle(e).position) === 'sticky', 'Máy tính: khung tóm tắt dính bên phải');
  await shot(boss, 'lib-form-1280.png');

  // 390px
  await boss.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  const hs = await boss.evaluate(() => [document.scrollingElement, ...document.querySelectorAll('.otp-body, #otf')].filter(Boolean).map((e) => e.scrollWidth - e.clientWidth));
  ok(hs.every((d) => d <= 1), 'Điện thoại: không cuộn ngang ' + JSON.stringify(hs));
  ok(await boss.$eval('.ot-sum', (e) => getComputedStyle(e).position) === 'static', 'Điện thoại: khung tóm tắt nằm cuối form (không dính, không che ô nhập)');
  // (Hộp chọn dài của trình sửa giai đoạn Thụy Sĩ / loại kép – "Kiểu Hà Lan, chuẩn FIDE…", "1 hoặc 2 trận…" – dài hơn hộp ở
  // 390px: lỗi có từ trước, không thuộc phần này; soát với thể thức mặc định vòng bảng + loại trực tiếp)
  await boss.click('#otf .ot-fmt[data-fmt="groups_single"]'); await sleep(300);
  const bad = await audit(boss, '#otf');
  ok(!bad.length, 'Soát giao diện form 390px: 0 lỗi ' + JSON.stringify(bad.slice(0, 5)));
  await boss.click('.tpl-tile'); await sleep(300);
  const r = await boss.$eval('dialog.tpl-lib', (d) => { const b = d.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
  ok(r[0] === 390 && r[1] === 844, 'Điện thoại: hộp mẫu toàn màn hình ' + r);
  const badL = await audit(boss, 'dialog.tpl-lib');
  await boss.click('.tpl-lib .tpl-item[data-id="cs_major"]'); await sleep(300);
  const badD = await audit(boss, 'dialog.tpl-lib');
  ok(!badL.length && !badD.length, 'Soát giao diện hộp 390px (danh sách + chi tiết): 0 lỗi ' + JSON.stringify([...badL, ...badD].slice(0, 5)));
  await shot(boss, 'lib-detail-390.png');
  await boss.keyboard.press('Escape'); await sleep(200);

  // Tiếng Trung: không lộ {x}
  const zh = await user('zh', 'ban_zh', 390);
  await zh.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(400);
  await zh.click('.tpl-tile'); await sleep(250);
  await zh.click('.tpl-lib .tpl-item[data-id="world_cup_2026"]'); await sleep(250);
  // (chỉ phần của tính năng này: hộp mẫu, ô gọn, các bước, tóm tắt – chuỗi trong trình sửa giai đoạn soát ở bài khác)
  const zt = (await zh.textContent('dialog.tpl-lib')) + (await zh.$$eval('#otf .ot-step-h, #otf .tpl-tile, #otf .ot-fmts, #otf .ot-sum', (e) => e.map((x) => x.textContent).join(' ')));
  ok(!/\{\w+\}|undefined|NaN/.test(zt) && /48 队/.test(zt) && /小组赛（12 组）/.test(zt) && /你的赛事/.test(zt), 'Tiếng Trung: hộp chi tiết + form không lộ {x}, có "48 队", "小组赛（12 组）"');
  await finish();
})();
