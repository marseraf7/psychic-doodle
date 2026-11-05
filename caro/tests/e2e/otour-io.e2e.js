/*
 * Kiểm thử trình duyệt – Giải đấu Offline: xem trước bằng lời (describeSpec), nhập / xuất cấu hình JSON ở form tạo giải,
 * xuất CSV bảng xếp hạng / kết quả và JSON cấu hình ở trang giải, lược đồ công khai /api/otour/schema.json.
 *   node caro/tests/e2e/otour-io.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8815;
  const { app, user, ok, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_json', 1100);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  ok(/Giai đoạn 1: vòng tròn 4 bảng/.test(await boss.textContent('#otf-desc')), 'Xem trước bằng lời theo cấu hình mặc định');
  await boss.click('.tpl-card[data-id="champions_league"]'); await sleep(300);
  ok(/league phase: mỗi đội 8 trận/.test(await boss.textContent('#otf-desc')), 'Mô tả đổi theo mẫu');
  await boss.$eval('details[data-k="otf:io"]', (d) => { d.open = true; }); await sleep(200);
  await boss.click('[data-act="otIoCopy"]'); await sleep(200);
  const json = await boss.$eval('#otf-json', (e) => e.value);
  ok(JSON.parse(json).stages[0].league.games === 8, 'Lấy cấu hình hiện tại (JSON)');
  // Đổi sang thể thức khác rồi dán lại JSON → khôi phục
  await boss.selectOption('#otf select[name=preset]', 'single'); await sleep(400);
  ok(!(await boss.$('#otf-stages [data-k="league"]:checked')), 'Đã đổi thể thức');
  await boss.$eval('details[data-k="otf:io"]', (d) => { d.open = true; }); await sleep(200);
  await boss.fill('#otf-json', '{ sai');
  await boss.click('[data-act="otIoApply"]'); await sleep(200);
  ok(/Không đọc được JSON/.test(await boss.textContent('#otf-json-err')), 'JSON sai: báo lỗi');
  await boss.fill('#otf-json', json);
  await boss.click('[data-act="otIoApply"]'); await sleep(400);
  ok(await boss.textContent('#confirm-q') === 'Đã áp dụng cấu hình', 'Báo "Đã áp dụng cấu hình" bằng hộp trong app (bài thử tự bấm Đồng ý)');
  ok(await boss.isChecked('#otf-stages [data-k="league"]') && await boss.isChecked('#otf-stages [data-k="legs"]'), 'Áp dụng JSON: khôi phục league phase + 2 lượt');
  // Tạo giải nhỏ, nhập một kết quả, xuất CSV / JSON
  await boss.selectOption('#otf select[name=preset]', 'groups_single'); await sleep(300);
  await boss.fill('#otf input[name=name]', 'Giải xuất dữ liệu');
  await boss.fill('#otf textarea[name=teams]', '=HYPERLINK(1)\nBình\nChi\nDũng\nEm\nPhong\nGiang\nHải');
  await boss.click('#otf button.primary.wide'); await sleep(800); // nút Tạo giải (khung JSON đang mở cũng có nút primary)
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(300);
  // hộp xác nhận: helpers.js tự bấm Đồng ý
  await sleep(900);
  const t = app.hub.otGet(id);
  const m = Object.values(t.st[0].matches)[0];
  await boss.click(`.scorable[data-mid="${m.id}"]`); await sleep(300);
  await boss.fill('#ots-a', '3'); await boss.fill('#ots-b', '1');
  await boss.click('#ots button.primary'); await sleep(900);
  await boss.click('summary:has-text("Xuất dữ liệu")'); await sleep(200);
  const grab = async (act) => {
    const [dl] = await Promise.all([boss.waitForEvent('download', { timeout: 5000 }), boss.click(`[data-act="otExport"][data-kind="${act}"]`)]);
    const fs = require('fs'); return fs.readFileSync(await dl.path(), 'utf8');
  };
  const csvT = await grab('table');
  ok(csvT.charCodeAt(0) === 0xfeff && /Giai đoạn,Bảng,#,Đội/.test(csvT) && csvT.split('\r\n').length === 9, 'CSV bảng xếp hạng (BOM, tiêu đề, 8 đội)');
  ok(/'=HYPERLINK\(1\)/.test(csvT) && !/,=HYPERLINK/.test(csvT), 'CSV: tên đội bắt đầu bằng = được thêm dấu \' (không thành công thức)');
  await boss.evaluate(() => { window.__clip = ''; navigator.clipboard.writeText = async (x) => { window.__clip = x; }; });
  await boss.click('[data-act="otExportCopy"][data-kind="spec"]'); await sleep(300);
  ok(/"stages"/.test(await boss.evaluate(() => window.__clip)), 'Nút Chép: chép cấu hình JSON vào bộ nhớ tạm');
  const csvM = await grab('matches');
  ok(/3-1/.test(csvM), 'CSV kết quả có tỉ số 3-1');
  const spec = JSON.parse(await grab('spec'));
  ok(spec.sport === 'football' && spec.stages.length === 2, 'JSON cấu hình giải');
  // Lược đồ công khai
  const sch = await boss.evaluate(async () => (await fetch('/api/otour/schema.json')).json());
  ok(sch.properties && sch.properties.stages && sch.examples.length >= 10, 'Lược đồ /api/otour/schema.json (kèm ví dụ mẫu giải)');
  await finish();
})();
