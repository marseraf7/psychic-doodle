/*
 * Kiểm thử trình duyệt – Đợt 3: giải offline (Bulk Add theo tên, nhập tỉ số theo set, kết quả phụ, huỷ kết quả,
 * in biên bản) và đăng ký nâng cao của giải trực tuyến (mã vào + câu hỏi + ban tổ chức duyệt, danh sách mời).
 *   node caro/tests/e2e/tour-offline.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8795;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280);
  const openNew = async (p) => {
    await p.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });
    await p.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
    await p.click('[data-act="tourNew"]'); await sleep(300);
  };
  const tour = (p) => p.evaluate(() => window.CaroTourKit.D.tour);

  // ---------------------------------------------------------------- Tạo giải offline từ form nhanh
  await openNew(boss);
  await boss.fill('#tf input[name=name]', 'Giải Cờ Trường');
  await boss.selectOption('#tf select[name=preset]', 'single'); await sleep(100);
  await boss.check('#tf input[name=offline]'); await sleep(100);
  ok(await boss.$eval('#tf input[name=rated]', (e) => e.closest('label').hidden) && await boss.$eval('#tf fieldset.only-online', (e) => e.hidden), 'Bật giải offline: ẩn các ô chỉ dành cho giải trực tuyến (tính Elo, thời gian…)');
  await boss.click('#tf button.primary'); await sleep(800);
  let t = await tour(boss);
  ok(t && t.offline && !t.rated, 'Tạo giải offline: không tính Elo');
  ok(/Offline/.test(await boss.textContent('#tour-body .thead')), 'Trang giải ghi "Offline"');
  ok(!(await boss.$('[data-act="join"]')), 'Giải offline: không có nút Đăng ký');
  ok(await boss.isVisible('#bulk-names'), 'Chưa có người chơi: khung "Thêm người chơi" mở sẵn');

  // ---------------------------------------------------------------- Bulk Add
  await boss.fill('#bulk-names', 'Nguyễn An\nTrần Bình\n\nnguyễn an\nLê Chi\nPhạm Dũng');
  await boss.click('[data-act="bulkAdd"]'); await sleep(500);
  t = await tour(boss);
  ok(t.players.length === 4, 'Dán 6 dòng (1 dòng trống, 1 tên trùng): thêm đúng 4 người – ' + t.players.map((p) => p.name).join(', '));
  ok(/Đã thêm 4/.test(await boss.textContent('.bulk-res')) && /Đã có trong giải 1/.test(await boss.textContent('.bulk-res')), 'Báo kết quả: đã thêm 4, trùng 1');
  ok(await boss.$eval('#bulk-names', (e) => e.value) === '', 'Thêm xong: ô dán được xoá');
  // Tệp CSV: đọc cột đầu, bỏ dòng tiêu đề
  const names = await boss.evaluate(() => window.CaroTourKit.regCsvNames('Tên người chơi,Lớp\r\n"Võ Em",10A\nĐỗ Phương;11B\n'));
  ok(JSON.stringify(names) === JSON.stringify(['Võ Em', 'Đỗ Phương']), 'CSV: cột đầu, bỏ tiêu đề và dấu ngoặc kép – ' + names.join('|'));
  await shot(boss, 'offline-players.png');

  // ---------------------------------------------------------------- Bắt đầu, nhập tỉ số theo set
  await boss.click('[data-act="start"]'); await sleep(800);
  t = await tour(boss);
  ok(t.status === 'running', 'Bắt đầu giải offline');
  ok(await boss.isVisible('.score-tools'), 'Thanh công cụ: in biên bản các trận đang chờ / biên bản trắng');
  const first = await boss.$eval('.b-match[data-mid]', (e) => e.dataset.mid);
  await boss.click(`.b-match[data-mid="${first}"] .b-p`); await sleep(250);
  ok(await boss.isVisible('#sp'), 'Bấm một trận: mở khung nhập tỉ số');
  const setInputs = () => boss.$$('#sp-sets input');
  let ins = await setInputs();
  await ins[0].fill('21'); await ins[1].fill('15');
  await boss.click('[data-act="setAdd"]'); await sleep(150);
  ins = await setInputs();
  ok(ins.length === 4 && await ins[0].inputValue() === '21', 'Thêm set: giữ tỉ số set trước');
  await ins[2].fill('15'); await ins[3].fill('21');
  await boss.click('#sp button.primary'); await sleep(400);
  ok(/Loại trực tiếp không được hoà/.test(await boss.textContent('#sp-err')), 'Hoà 1–1 set ở loại trực tiếp: báo cần kết quả phụ');
  await boss.check('#sp-extra-on'); await sleep(80);
  await boss.fill('#sp-ex0', '5'); await boss.fill('#sp-ex1', '3');
  await boss.click('#sp button.primary'); await sleep(600);
  t = await tour(boss);
  const m1 = t.stageViews[0].rounds[0].find((m) => m.id === first);
  ok(m1.done && JSON.stringify(m1.sets) === '[[21,15],[15,21]]' && JSON.stringify(m1.extra) === '[5,3]', 'Lưu: trận xong với tỉ số từng set + kết quả phụ');
  ok(!(await boss.$('#sp')), 'Lưu xong: khung nhập tự đóng');
  ok((await boss.textContent(`.b-match[data-mid="${first}"]`)).includes('21-15 · 15-21 (5-3)'), 'Nhánh đấu hiện tỉ số từng set');
  // Huỷ KQ
  await boss.click(`.b-match[data-mid="${first}"] .b-p`); await sleep(250);
  await boss.click('[data-act="scoreUndo"]'); await sleep(600);
  t = await tour(boss);
  ok(!t.stageViews[0].rounds[0].find((m) => m.id === first).done, 'Huỷ KQ: trận trở về chưa đấu');
  // In biên bản: dựng trang A4 với tên giải, hai người chơi, ô ký
  const sheet = await boss.evaluate(() => window.CaroTourSheet.page(window.CaroTourKit.D.tour, { m: window.CaroTourKit.D.tour.stageViews[0].rounds[0][0], v: window.CaroTourKit.D.tour.stageViews[0] }, true, 0, 1));
  ok(/BIÊN BẢN TRẬN ĐẤU/.test(sheet) && /Giải Cờ Trường/.test(sheet) && /Nguyễn An/.test(sheet) && /Trọng tài 1/.test(sheet) && /Giám sát/.test(sheet), 'Biên bản: tên giải, người chơi, ô ký trọng tài / giám sát');
  await boss.click('[data-act="sheetBlank"]'); await sleep(500);
  ok(true, 'In biên bản trắng: không lỗi');
  await shot(boss, 'offline-score.png');
  // Nhập hết: hạt giống theo danh sách, An vô địch
  for (let k = 0; k < 4 && (await tour(boss)).status === 'running'; k++) {
    const mid = await boss.evaluate(() => {
      const v = window.CaroTourKit.D.tour.stageViews[0];
      const m = [...v.rounds.flat(), v.third].find((x) => x && !x.done && x.a && x.a.uid && x.b && x.b.uid);
      return m && m.id;
    });
    if (!mid) break;
    await boss.click(`.b-match[data-mid="${mid}"] .b-p`); await sleep(250);
    ins = await setInputs();
    await ins[0].fill('21'); await ins[1].fill('10');
    await boss.click('#sp button.primary'); await sleep(500);
  }
  t = await tour(boss);
  ok(t.status === 'finished' && t.podium[0].name === 'Nguyễn An', 'Nhập hết các trận: giải kết thúc, hạt giống 1 vô địch');

  // ---------------------------------------------------------------- Đăng ký online: mã vào + câu hỏi + duyệt tay
  await openNew(boss);
  await boss.fill('#tf input[name=name]', 'Cúp Có Mã');
  await boss.selectOption('#tf select[name=preset]', 'custom'); await sleep(100);
  if (await boss.isChecked('#tf input[name=offline]')) await boss.uncheck('#tf input[name=offline]');
  await boss.click('#tf-adv'); await sleep(300);
  await boss.click('.ta-tab[data-tab="reg"]'); await sleep(100);
  await boss.uncheck('#ta input[name=checkin]');
  await boss.fill('#ta input[name=code]', 'CARO');
  await boss.check('#ta input[name=approval]');
  await boss.click('.reg-qs [data-qact="add"]'); await sleep(100);
  await boss.fill('.q-row [data-q="q"]', 'Bạn học lớp nào?');
  await boss.fill('#ta input[name=minRating]', '1300');
  await boss.fill('#ta input[name=maxRating]', '1100');
  await boss.click('.ta-foot button.primary'); await sleep(300);
  ok(/Elo tối đa phải/.test(await boss.textContent('#ta-err')), 'Elo tối đa < tối thiểu: báo lỗi ngay');
  await boss.fill('#ta input[name=minRating]', '');
  await boss.fill('#ta input[name=maxRating]', '');
  await boss.click('.ta-foot button.primary'); await sleep(800);
  t = await tour(boss);
  ok(t && t.reg.hasCode && t.reg.approval && t.reg.questions.length === 1, 'Máy chủ nhận: mã vào, duyệt tay, 1 câu hỏi');
  ok(/Cần mã vào giải/.test(await boss.textContent('.reg-chips')), 'Trang giải hiện điều kiện "Cần mã vào giải"');
  const tid = t.id;
  const an = await user('vi', 'hs_an', 390);
  await an.evaluate((id) => window.CaroTour.open(id), tid); await sleep(600);
  await an.click('[data-act="join"]'); await sleep(250);
  ok(await an.isVisible('#rf'), 'Bấm Đăng ký: mở form mã vào + câu hỏi');
  await an.fill('#rf input[name=code]', 'sai');
  await an.fill('#rf [data-ans="0"]', '10A1');
  await an.click('#rf button.primary'); await sleep(400);
  ok(/Mã vào giải không đúng/.test(await an.textContent('#rf-err')), 'Sai mã: báo ngay trong form');
  await an.fill('#rf input[name=code]', 'CARO');
  await an.click('#rf button.primary'); await sleep(600);
  ok(/chờ ban tổ chức duyệt/i.test(await an.textContent('#tour-body')), 'Đăng ký xong: thẻ "Đang chờ ban tổ chức duyệt"');
  await shot(an, 'reg-pending-390.png');
  await boss.evaluate((id) => window.CaroTour.open(id), tid); await sleep(600);
  ok(/10A1/.test(await boss.textContent('#tour-body')), 'Ban tổ chức thấy câu trả lời "10A1"');
  await boss.click('[data-act="regDecide"][data-v="1"]'); await sleep(600);
  ok(await an.evaluate(() => window.CaroTourKit.D.tour.joined), 'Duyệt: người đăng ký vào giải');
  const w = await an.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok(w, '390 px: trang giải không tràn ngang');
  await finish();
  app.hub && null;
})();
