/*
 * Kiểm thử trình duyệt – tự xếp lịch và chỉnh lịch thi đấu (otour-sched-ui.js): tab Lịch thi đấu → form tự xếp (ngày,
 * giờ, sân) → lịch theo ngày; dời một lượt đấu; hoãn trận + tìm ngày đá bù trong khung trận; cảnh báo trùng lịch khi
 * sửa tay; tải lịch .ics; sân nhà từng đội.
 *   node caro/tests/e2e/otour-sched.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8833;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_lich', 1100);
  const tab = (k) => boss.click(`[data-act="otTab"][data-tab="${k}"]`).then(() => sleep(400));
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.fill('#otf input[name=name]', 'Giải có lịch');
  await boss.selectOption('#otf select[name=preset]', 'groups_single'); await sleep(200);
  await boss.fill('#otf textarea[name=teams]', Array.from({ length: 16 }, (_, i) => 'Đội ' + (i + 1)).join('\n'));
  await boss.click('#otf button.primary.wide'); await sleep(800);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  ok(t.status === 'running', 'Bắt đầu giải');
  const ms = () => Object.values(t.st[0].matches).filter((m) => m.a !== '-' && m.b !== '-');
  await tab('sched');
  ok(await boss.isVisible('#otsched'), 'Tab Lịch: form tự xếp lịch (mở sẵn khi chưa có lịch)');
  const d = new Date(Date.now() + 3 * 86400000);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await boss.fill('#otsched input[name=start]', start);
  // Chỉ thứ 7 và Chủ nhật, 2 khung giờ, 2 sân
  for (const x of [1, 2, 3, 4, 5]) await boss.uncheck(`#otsched input[name=day][value="${x}"]`);
  await boss.fill('#otsched input[name=times]', '8h, 15:30');
  await boss.fill('#otsched textarea[name=venues]', 'Sân A\nSân B');
  await boss.click('[data-act="otSchedRun"][data-mode="empty"]'); await sleep(900);
  const all = ms();
  ok(all.length === 24 && all.every((m) => m.when && ['Sân A', 'Sân B'].includes(m.venue)), 'Xếp đủ 24 trận vòng bảng (4 bảng × 4 đội), mỗi trận có sân');
  ok(all.every((m) => [0, 6].includes(new Date(m.when).getDay()) && ['08:00', '15:30'].includes(new Date(m.when).toTimeString().slice(0, 5))), 'Chỉ cuối tuần, đúng 8:00 / 15:30');
  ok(await boss.$$eval('.sc-day', (xs) => xs.length) >= 2 && !(await boss.$('.sc-cf')), 'Lịch theo ngày, không trùng lịch');
  await shot(boss, 'ot-sched.png');
  // Dời lượt 1 thêm 7 ngày
  const r0 = t.st[0].groups.flatMap((g) => g.rounds[0]).map((x) => t.st[0].matches[x]).filter((m) => m.when);
  const before = r0.map((m) => m.when);
  await boss.click('.fold[data-k$=":scshift"] summary, details[data-k$=":scshift"] > summary').catch(() => {});
  await boss.$$eval('details.fold', (ds) => ds.forEach((x) => { x.open = true; })); await sleep(300);
  await boss.selectOption('#otsc-round', '0:0');
  await boss.fill('#otsc-days', '7');
  await boss.click('[data-act="otSchedShift"]'); await sleep(700);
  ok(r0.every((m, i) => m.when === before[i] + 7 * 86400000), 'Dời lượt 1 thêm 7 ngày');
  // Sửa tay một trận cho trùng giờ / sân với trận khác → cảnh báo
  const [m1, m2] = all.filter((m) => !r0.includes(m));
  await tab('stages');
  await boss.click(`.scorable[data-mid="${m2.id}"]`); await sleep(300);
  const iso = (ms) => { const x = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };
  await boss.fill('#otm-when', iso(m1.when));
  await boss.fill('#otm-venue', m1.venue);
  await boss.click('[data-act="otInfoSave"]'); await sleep(600);
  await boss.click('.score-panel [data-act="otScoreClose"]').catch(() => {});
  await tab('sched');
  ok(/có 2 trận cùng lúc/.test(await boss.textContent('.sc-cf').catch(() => '')), 'Cảnh báo sân có 2 trận cùng lúc');
  // Hoãn trận rồi tìm ngày đá bù
  await tab('stages');
  await boss.click(`.scorable[data-mid="${m2.id}"]`); await sleep(300);
  await boss.click('[data-act="otPostpone"]'); await sleep(700);
  ok(m2.postponed && !m2.when, 'Hoãn trận: bỏ giờ, đánh dấu hoãn');
  ok(/Hoãn/.test(await boss.textContent(`[data-mid="${m2.id}"]`).catch(() => '')), 'Nhãn "Hoãn" trên trận');
  await boss.click('[data-act="otMakeup"]'); await sleep(700);
  ok(!m2.postponed && m2.when > Date.now() && [0, 6].includes(new Date(m2.when).getDay()), 'Đá bù: ngày cuối tuần sắp tới còn trống');
  await boss.click('.score-panel [data-act="otScoreClose"]').catch(() => {});
  await tab('sched');
  // Dời lượt 1 sang tuần sau đè lên các trận đã xếp → vẫn có cảnh báo khác; riêng trận đá bù không trùng sân / đội nào
  const cfIds = await boss.evaluate(() => { const K = window.CaroTourKit; return [...K.otSchedUi.conflictsOf(K.D.ot, K.D.ot.stageViews[0].groups.flatMap((g, gi) => K.roundsOfGroup(K.D.ot, K.D.ot.stageViews[0], gi).flat())).ids]; });
  ok(!cfIds.includes(m2.id), 'Đá bù xong: trận đá bù không trùng lịch');
  // Tải lịch .ics
  const ics = await boss.evaluate(() => window.CaroTourKit.otIcs(window.CaroTourKit.D.ot));
  ok((ics.match(/BEGIN:VEVENT/g) || []).length === 24 && /LOCATION:Sân A/.test(ics), 'Lịch .ics có 24 trận, có sân');
  // Sân nhà: chọn "Sân nhà" → ô từng đội
  await boss.selectOption('#otsched select[name=home]', '1'); await sleep(400);
  const first = await boss.$('#otsched [data-sc-home]');
  ok(!!first, 'Kiểu sân nhà: có ô sân nhà từng đội');
  if (first) { await first.fill('Sân Hàng Đẫy'); await first.dispatchEvent('change'); await sleep(500); }
  ok(t.players.some((p) => p.home === 'Sân Hàng Đẫy'), 'Lưu sân nhà của đội');
  await shot(boss, 'ot-sched-home.png');
  await finish();
})();
