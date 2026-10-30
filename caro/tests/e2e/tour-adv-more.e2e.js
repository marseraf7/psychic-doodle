/*
 * Kiểm thử trình duyệt – Advanced options kiểu Challonge: tab Quyền (tự báo tỉ số, chia sẻ quyền quản trị), Thông báo,
 * Khác (ẩn bảng xếp hạng); giải offline thêm người có tài khoản bằng "@tên", người chơi tự nhập tỉ số trận của mình,
 * nhận "tới trận" và kết quả trong chuông thông báo.
 *   node caro/tests/e2e/tour-adv-more.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8805;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280);
  const an = await user('vi', 'an_tu_bao', 1100), co = await user('vi', 'dong_btc', 430);
  const AN = an.uid.replace(/^u_/, ''), CO = co.uid.replace(/^u_/, '');

  await boss.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
  await boss.click('[data-act="tourNew"]'); await sleep(300);
  await boss.fill('#tf input[name=name]', 'Giải Tự Báo');
  await boss.selectOption('#tf select[name=preset]', 'custom'); await sleep(100);
  await boss.click('#tf-adv'); await sleep(300);
  await boss.click('.ta-tab[data-tab="reg"]'); await sleep(100);
  await boss.check('#ta input[name=offline]'); await sleep(100);
  await boss.click('.ta-tab[data-tab="access"]'); await sleep(100);
  ok(await boss.isVisible('#ta input[name=selfReport]') && await boss.isChecked('#ta input[name=selfReport]'), 'Tab Quyền: "tự báo tỉ số" (mặc định bật)');
  await boss.fill('#ta textarea[name=admins]', '@dong_btc');
  await boss.click('.ta-tab[data-tab="notify"]'); await sleep(100);
  ok(await boss.isChecked('#ta input[name=notifyMatch]') && await boss.isChecked('#ta input[name=notifyResults]'), 'Tab Thông báo: 2 ô mặc định bật');
  await boss.click('.ta-tab[data-tab="misc"]'); await sleep(100);
  await boss.uncheck('#ta input[name=showStandings]');
  await shot(boss, 'adv-misc.png');
  await boss.click('.ta-foot button.primary'); await sleep(800);
  const id = await boss.evaluate(() => window.CaroTourKit.D.tour.id);
  const t = app.hub.tours.get(id);
  ok(t && t.selfReport && t.showStandings === false && t.staff.some((x) => x.uid === CO && x.perms.join() === 'all'), 'Tạo giải: tự báo bật, ẩn bảng xếp hạng, @dong_btc thành đồng ban tổ chức');
  // Thêm người: 1 tài khoản + 3 tên
  await boss.fill('#bulk-names', '@an_tu_bao\nBình\nChi\nDũng');
  await boss.click('[data-act="bulkAdd"]'); await sleep(500);
  ok(t.players.some((p) => p.uid === AN), 'Bulk Add: "@an_tu_bao" thêm đúng tài khoản');
  await boss.click('[data-act="start"]'); await sleep(800);
  // An: chuông có "tới trận", mở giải tự nhập tỉ số trận của mình
  ok(/tới trận của bạn/.test(await an.evaluate(() => { document.getElementById('tb-bell').click(); return document.getElementById('tb-pop').textContent; })), 'An: chuông "tới trận của bạn"');
  await an.evaluate(() => document.getElementById('tb-bell').click());
  await an.evaluate((i) => window.CaroTour.open(i), id); await sleep(600);
  const scorable = await an.$$eval('.scorable', (x) => x.length);
  ok(scorable === 1, 'An chỉ bấm được trận của mình: ' + scorable);
  await an.click('.scorable'); await sleep(300);
  ok(/tự báo tỉ số/.test(await an.textContent('.score-panel')) && !(await an.$('[data-act="sheetOne"]')), 'Khung tự báo: có ghi chú, không có nút in / huỷ kết quả');
  const m = Object.values(t.st[0].matches).find((x) => [x.a, x.b].includes(AN));
  const aFirst = m.a === AN;
  await an.fill('[data-set="0"][data-side="0"]', aFirst ? '2' : '0');
  await an.fill('[data-set="0"][data-side="1"]', aFirst ? '0' : '2');
  await an.click('#sp button.primary'); await sleep(600);
  ok(m.done && m.winner === AN, 'An tự báo: thắng 2–0, kết quả vào nhánh đấu');
  await shot(an, 'self-report.png');
  // Ẩn bảng xếp hạng: người xem (An) không thấy bảng điểm vòng bảng; ban tổ chức vẫn thấy
  ok(!(await an.$('table.stand')), 'Ẩn bảng xếp hạng: người chơi không thấy bảng điểm');
  await boss.evaluate(() => window.CaroTourKit.render(true)); await sleep(200);
  ok(!!(await boss.$('table.stand')), 'Ban tổ chức vẫn thấy bảng điểm');
  ok(t.log.some((x) => x.act === 'self_score'), 'Nhật ký ghi "người chơi tự báo tỉ số"');
  // Ban tổ chức nhập nốt → kết quả tới chuông
  for (let i = 0; i < 12 && t.status === 'running'; i++) {
    for (const x of Object.values(t.st[t.stage || 0].matches)) {
      if (x.done || x.bye || typeof x.a !== 'string' || typeof x.b !== 'string' || x.a === '-' || x.b === '-') continue;
      await boss.evaluate(([tid, mid, s]) => window.CaroOnline.send({ t: 'tourScore', id: tid, match: mid, sets: [s] }), [id, x.id, x.a === AN ? [2, 0] : x.b === AN ? [0, 2] : [2, 1]]);
      await sleep(300);
    }
  }
  ok(t.status === 'finished', 'Giải xong');
  await sleep(300);
  ok(/xếp hạng 1/.test(await an.evaluate(() => { document.getElementById('tb-bell').click(); return document.getElementById('tb-pop').textContent; })), 'An: chuông "đã kết thúc – bạn xếp hạng 1"');
  await finish();
})();
