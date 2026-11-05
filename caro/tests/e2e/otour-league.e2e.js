/*
 * Kiểm thử trình duyệt – Giải đấu Offline kiểu MyLeague (otour-league.js): mở đăng ký → người khác gửi đơn → ban tổ chức
 * duyệt; sửa đội hình; bắt đầu; trong khung trận ghi giờ / sân, bàn thắng, thẻ; lịch thi đấu + vua phá lưới; in biên bản.
 *   node caro/tests/e2e/otour-league.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8814;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_phui', 1100);
  const tab = (p, k) => p.click(`[data-act="otTab"][data-tab="${k}"]`).then(() => sleep(300)); // các tab của trang giải offline
  const fan = await user('vi', 'doi_truong', 430);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.fill('#otf input[name=name]', 'Giải phủi phường');
  await boss.selectOption('#otf select[name=preset]', 'single'); await sleep(150);
  await boss.fill('#otf textarea[name=teams]', 'FC Một\nFC Hai\nFC Ba');
  await boss.click('#otf button.primary'); await sleep(800);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  // Mở đăng ký, người khác gửi đơn
  await boss.check('#ot-reg-open'); await sleep(500);
  ok(t.reg && t.reg.open, 'Mở đăng ký');
  await fan.evaluate((x) => window.CaroOTour.open(x), id); await sleep(800);
  await fan.fill('#otreg input[name=name]', 'FC Bốn');
  await fan.fill('#otreg textarea[name=roster]', '1 Thủ thành\n9 Sát thủ | FW');
  await fan.click('#otreg button.primary'); await sleep(800);
  ok(t.regs && t.regs.length === 1 && /chờ ban tổ chức duyệt/.test(await fan.textContent('#tour-body, .tour-body, body')), 'Gửi đơn, thấy "chờ duyệt"');
  await sleep(400);
  await boss.click('[data-act="otRegOk"]'); await sleep(800);
  ok(t.players.length === 4 && t.players[3].roster.length === 2, 'Duyệt đơn: thêm đội kèm đội hình');
  // Sửa đội hình FC Một
  await tab(boss, 'teams');
  await boss.click(`[data-act="otRosterEdit"][data-uid="${t.players[0].uid}"]`); await sleep(300);
  await boss.fill('#ot-roster-in', '10 Số Mười\n7 Số Bảy | FW');
  await boss.click('[data-act="otRosterSave"]'); await sleep(700);
  ok(t.players[0].roster.length === 2, 'Sửa đội hình');
  // Bắt đầu, mở trận có FC Một
  await tab(boss, 'stages'); // bắt đầu (otStart) rồi nhập kết quả ở tab Nhánh đấu
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(300);
  // hộp xác nhận: helpers.js tự bấm Đồng ý
  await sleep(900);
  ok(t.status === 'running', 'Bắt đầu giải');
  const m = Object.values(t.st[0].matches).find((x) => x.a === t.players[0].uid || x.b === t.players[0].uid);
  await boss.click(`.scorable[data-mid="${m.id}"]`); await sleep(300);
  await boss.fill('#otm-when', '2026-11-20T19:30');
  await boss.fill('#otm-venue', 'Sân Bờ Sông');
  await boss.click('[data-act="otInfoSave"]'); await sleep(600);
  ok(m.venue === 'Sân Bờ Sông' && m.when > 0, 'Lưu giờ đấu + sân');
  const sideOf = m.a === t.players[0].uid ? 'a' : 'b';
  for (const [type, who, min] of [['goal', '10 Số Mười', '12'], ['goal', '10 Số Mười', '70'], ['yellow', '7 Số Bảy', '40']]) {
    await boss.selectOption('#otm-type', type);
    await boss.selectOption('#otm-side', sideOf);
    await boss.fill('#otm-who', who);
    await boss.fill('#otm-min', min);
    await boss.click('[data-act="otEvAdd"]'); await sleep(500);
  }
  ok(m.events && m.events.length === 3, 'Ghi 3 sự kiện');
  ok(await boss.isVisible('.ot-evs li'), 'Danh sách sự kiện trong khung trận');
  await tab(boss, 'stats');
  ok(/10 Số Mười/.test(await boss.textContent('body')) && /Vua phá lưới/.test(await boss.textContent('body')), 'Vua phá lưới');
  await tab(boss, 'sched');
  ok(/Sân Bờ Sông/.test(await boss.textContent('.ot-sched')), 'Lịch thi đấu có sân');
  // In biên bản: chặn hộp in thật, kiểm nội dung
  await boss.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await tab(boss, 'stages');
  await boss.click(`.scorable[data-mid="${m.id}"]`).catch(() => {}); await sleep(300);
  await boss.click('[data-act="otPrint"]'); await sleep(300);
  ok(await boss.evaluate(() => window.__printed) === 1 && /Biên bản trận đấu/.test(await boss.textContent('#ot-print')) && /Số Mười/.test(await boss.textContent('#ot-print')), 'In biên bản trận (đội hình + sự kiện)');
  // Người xem: bấm trận xem chi tiết (giờ, sân, diễn biến) và in biên bản; không có ô sửa
  await fan.evaluate((x) => window.CaroOTour.open(x), id); await sleep(900);
  await fan.click(`.viewable[data-mid="${m.id}"]`); await sleep(300);
  ok(/Sân Bờ Sông/.test(await fan.textContent('.score-panel')) && /Số Mười/.test(await fan.textContent('.score-panel')) && !(await fan.$('#otm-venue, [data-act="otEvDel"]')), 'Người xem: xem chi tiết trận, không sửa được');
  await fan.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await fan.click('[data-act="otPrint"]'); await sleep(300);
  ok(await fan.evaluate(() => window.__printed) === 1, 'Người xem in được biên bản');
  await shot(boss, 'ot-league.png');
  await finish();
})();
