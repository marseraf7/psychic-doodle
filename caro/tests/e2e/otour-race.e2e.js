/*
 * Kiểm thử trình duyệt – Giải đấu Offline hệ Race: chọn môn đua xe → tự chọn mẫu Grand Prix, 2 chặng có bảng đội,
 * bắt đầu, nhập chặng 1 bằng nút "Điền hạng theo thứ tự", huỷ rồi nhập lại, nhập chặng 2 có người bỏ cuộc → bảng
 * chung + bảng đội + bục trao giải; Time Trial: thời gian sai báo ngay, chênh lệch với người dẫn đầu.
 *   node caro/tests/e2e/otour-race.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8811;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_dua', 1100);
  const newTour = async (name, sport, teams) => {
    await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
    await boss.fill('#otf input[name=name]', name);
    await boss.selectOption('#otf select[name=sport]', sport); await sleep(200);
    await boss.fill('#otf textarea[name=teams]', teams.join('\n'));
    await boss.$eval('#otf textarea[name=teams]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(150);
  };

  await boss.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
  await newTour('Đua xe sân trường', 'racing', ['Max | NED | Đỏ', 'Lando | GBR | Cam', 'Charles | MON | Đỏ', 'Oscar | AUS | Cam']);
  ok(await boss.$eval('#otf select[name=preset]', (e) => e.value) === 'grand_prix', 'Môn đua xe: tự chọn mẫu Grand Prix');
  ok(/^25 18 15 12/.test(await boss.$eval('#otf-stages [data-k="table"]', (e) => e.value)), 'Bảng điểm mặc định F1');
  // Như người dùng thật: đang ở ô danh sách đội, bấm sang ô số chặng rồi gõ (ô không được bị vẽ lại mất chữ)
  await boss.focus('#otf textarea[name=teams]');
  await boss.click('#otf-stages [data-k="events"]'); await sleep(100);
  await boss.fill('#otf-stages [data-k="events"]', '2');
  await boss.press('#otf-stages [data-k="events"]', 'Tab'); await sleep(200);
  ok(/2 trận|2 lượt/.test(await boss.textContent('#otf-est')), 'Ước tính: 2 chặng');
  await boss.click('#otf button.primary'); await sleep(800);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.stages[0].type === 'race' && t.stages[0].events === 2 && t.stages[0].teams && t.players[0].team === 'Đỏ', 'Tạo giải đua: 2 chặng, bảng đội, tên đội');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(300);
  // hộp xác nhận: helpers.js tự bấm Đồng ý
  await sleep(800);
  ok(t.status === 'running', 'Bắt đầu giải');
  // Chặng 1: điền theo thứ tự danh sách
  await boss.click('[data-act="otRaceFill"]'); await sleep(100);
  await boss.click('.race-form button.primary'); await sleep(800);
  ok(t.st[0].events[0].done, 'Lưu chặng 1');
  ok(/43|25/.test(await boss.textContent('.stand')), 'Bảng chung có điểm');
  // Huỷ rồi nhập lại
  await boss.click('[data-act="otRaceUndo"]'); await sleep(300);
  // hộp xác nhận: helpers.js tự bấm Đồng ý
  await sleep(700);
  ok(!t.st[0].events[0].done, 'Huỷ kết quả chặng');
  await boss.click('[data-act="otRaceFill"]'); await sleep(100);
  await boss.click('.race-form button.primary'); await sleep(800);
  // Chặng 2: Lando nhất, Max nhì, Charles ba, Oscar bỏ cuộc
  const form = '.race-form';
  const rowOf = (name) => `${form} tr:has(td.nm:text-is("${name}"))`;
  await boss.fill(`${rowOf('Lando')} .r-v`, '1');
  await boss.fill(`${rowOf('Max')} .r-v`, '2');
  await boss.fill(`${rowOf('Charles')} .r-v`, '3');
  await boss.check(`${rowOf('Oscar')} .r-dnf`);
  await boss.click(`${form} button.primary`); await sleep(1000);
  ok(t.status === 'finished', 'Chặng cuối xong: kết thúc giải');
  ok(await boss.isVisible('.podium'), 'Bục trao giải');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(300); // bảng chung + bảng đội ở tab Nhánh đấu & bảng
  ok(/Bảng xếp hạng đội/.test(await boss.textContent('#otp-body')) && /Đỏ/.test(await boss.textContent('#otp-body')), 'Bảng đội');
  await shot(boss, 'ot-race.png');

  // Time Trial: thời gian sai báo ngay trong khung
  await newTour('Chạy 5 km', 'running', ['An', 'Bình', 'Chi']);
  ok(await boss.$eval('#otf select[name=preset]', (e) => e.value) === 'time_trial', 'Môn chạy: tự chọn Time Trial');
  await boss.click('#otf button.primary'); await sleep(800);
  const id2 = await boss.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id);
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(300);
  // hộp xác nhận: helpers.js tự bấm Đồng ý
  await sleep(800);
  await boss.fill(`${rowOf('An')} .r-v`, '20:50.0');
  await boss.fill(`${rowOf('Bình')} .r-v`, '19:59.5');
  await boss.fill(`${rowOf('Chi')} .r-v`, 'abc');
  await boss.click(`${form} button.primary`); await sleep(300);
  ok(/ví dụ 1:23.456/.test(await boss.textContent(`${form} .err`)), 'Thời gian sai: báo ngay');
  await boss.fill(`${rowOf('Chi')} .r-v`, '');
  await boss.click(`${form} button.primary`); await sleep(1000);
  const t2 = app.hub.otGet(id2);
  ok(t2.status === 'finished', 'Time Trial một chặng: xong');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(300); // giải xong → Tổng quan; bảng thời gian ở tab Nhánh đấu
  ok(/\+50\.500/.test(await boss.textContent('.stand')), 'Chênh lệch với người dẫn đầu +50.500');
  await shot(boss, 'ot-tt.png');

  // Chia lượt (heat): 10 người, tối đa 4 người mỗi lượt → 3 lượt; nhập từng lượt, đủ lượt thì có kết quả gộp
  const runners = Array.from({ length: 10 }, (_, k) => `VĐV ${k + 1}`);
  await newTour('Bơi 100 m', 'swimming', runners);
  await boss.fill('#otf-stages [data-i="0"][data-k="heat"]', '4');
  await boss.$eval('#otf-stages [data-i="0"][data-k="heat"]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(300);
  ok(/chia lượt, tối đa 4 người/.test(await boss.textContent('#otf-desc')), 'Mô tả bằng lời: chia lượt tối đa 4 người');
  await boss.click('#otf button.primary'); await sleep(800);
  const id3 = await boss.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id);
  const t3 = app.hub.otGet(id3);
  ok(t3.stages[0].heat === 4, 'Cấu hình heat = 4');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1100);
  const heats = t3.st[0].events[0].heats;
  ok(heats && heats.length === 3 && await boss.$$eval('.race-form[data-heat]', (x) => x.length) === 3, 'Bắt đầu: 3 lượt, mỗi lượt một khung nhập');
  const f0 = '.race-form[data-heat="0"]';
  for (const [k, u] of heats[0].uids.entries()) {
    const name = t3.players.find((p) => p.uid === u).name;
    await boss.fill(`${f0} tr:has(td.nm:text-is("${name}")) .r-v`, `1:0${k}.50`);
  }
  await boss.click(`${f0} button.primary`); await sleep(900);
  ok(heats[0].done && !t3.st[0].events[0].done && await boss.$$eval('.race-form[data-heat]', (x) => x.length) === 2, 'Nhập lượt 1: còn 2 khung nhập');
  for (const h of [1, 2]) {
    await boss.evaluate(([tid, hh, us]) => window.CaroTourKit.O.send({ t: 'otRace', id: tid, event: 0, heat: hh, rows: us.map((u, k) => ({ uid: u, time: 59000 + hh * 300 + k * 900 })) }), [id3, h, heats[h].uids]);
    await sleep(500);
  }
  await sleep(600);
  ok(t3.status === 'finished', 'Đủ 3 lượt: chặng xong, giải kết thúc');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(300);
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(400);
  ok(/Kết quả gộp các lượt/.test(await boss.textContent('#otp-body')) && await boss.$$eval('.race-heat', (x) => x.length) === 3, 'Kết quả gộp + từng lượt');
  await shot(boss, 'ot-heats.png');
  await finish();
})();
