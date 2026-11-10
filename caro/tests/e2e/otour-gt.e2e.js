/*
 * Kiểm thử trình duyệt – xe đạp nhiều chặng (đợt 3, otour-gt.js): mẫu Tour de France → form có cách tính "nhiều bảng
 * xếp hạng", 21 ô loại chặng, giây thưởng; tạo giải 184 tay đua (cột "U25" = tay đua trẻ) → chặng 1: dán danh sách về
 * đích (bỏ trống = cùng thời gian, "+0:12", DNF) → bảng áo vàng / xanh / chấm bi / trắng / đồng đội, người giữ áo;
 * chặng 2 chưa nhập được trước chặng 1; chỉ chặng nhập sau cùng có nút huỷ.
 *   node caro/tests/e2e/otour-gt.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8837;
  const { app, user, ok, shot, finish, browser } = await setup(PORT);
  const boss = await user('vi', 'ban_xedap', 1100);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="tour_de_france"]'); await sleep(300);
  ok(await boss.$eval('#otf select[name=sport]', (e) => e.value) === 'cycling', 'Mẫu Tour de France: bộ môn xe đạp');
  ok(await boss.$eval('#otf-stages [data-i="0"][data-k="score"]', (e) => e.value) === 'gt', 'Cách tính: nhiều bảng xếp hạng');
  ok(await boss.$$eval('#otf-stages [data-k="kind"]', (xs) => xs.length) === 21 && await boss.$eval('#otf-stages [data-k="kind"][data-n="4"]', (e) => e.value) === 'itt', '21 ô loại chặng, chặng 5 tính giờ');
  ok(await boss.isChecked('#otf-stages [data-k="bonus"]'), 'Bật giây thưởng');
  ok(/áo vàng/i.test(await boss.textContent('.tpl-desc')), 'Có mô tả bằng lời');
  // Đổi số chặng: giữ loại các chặng đầu
  await boss.fill('#otf-stages [data-i="0"][data-k="events"]', '6'); await boss.press('#otf-stages [data-i="0"][data-k="events"]', 'Tab'); await sleep(300);
  ok(await boss.$$eval('#otf-stages [data-k="kind"]', (xs) => xs.map((x) => x.value).join(',')) === 'flat,hilly,flat,hilly,itt,hilly', 'Còn 6 chặng, giữ loại');
  await boss.selectOption('#otf-stages [data-k="kind"][data-n="5"]', 'mtn'); await sleep(200);
  await shot(boss, 'ot-gt-form.png');
  await boss.click('[data-act="otTplTeams"]'); await sleep(300);
  ok(/U25/.test(await boss.inputValue('#otf textarea[name=teams]')), 'Danh sách mẫu có cột tay đua trẻ');
  await boss.click('#otf button.primary.wide'); await sleep(1200);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.sport === 'cycling' && t.stages[0].kinds[5] === 'mtn' && t.players.length === 184 && t.players.filter((p) => p.young).length === 23, 'Tạo giải: 184 tay đua, 23 tay đua trẻ, chặng 6 núi');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(500);
  ok(await boss.isVisible('.gt-form'), 'Khung nhập chặng 1');
  // Dán danh sách: tay đua 1–183 về đích (tay đua 3 thắng, cả đoàn cùng thời gian, tay đua 9 chậm 12 giây), tay đua 184 bỏ cuộc
  const names = t.players.map((p) => p.name);
  const order = [names[2], names[0], names[1], ...names.slice(3, 183)];
  const lines = order.map((n, k) => (k === 0 ? `${n} | 4:12:33 | 3` : n === names[8] ? `${n} | +0:12` : k === 1 ? `${n} | | | 20` : n)).concat(`${names[183]} | DNF`);
  await boss.click('.gt-paste summary'); await sleep(200);
  await boss.fill('.gt-form .g-paste', lines.join('\n'));
  await boss.click('[data-act="otGtPaste"]'); await sleep(300);
  ok(await boss.inputValue(`.gt-form tr[data-uid="${t.players[2].uid}"] .g-rank`) === '1' && await boss.isChecked(`.gt-form tr[data-uid="${t.players[183].uid}"] .g-dnf`), 'Dán: tay đua 3 hạng 1, tay đua 184 bỏ cuộc');
  await boss.click('.gt-form button.primary'); await sleep(1200);
  const st = t.st[0];
  ok(st.events[0].done && st.events[0].rows.find((x) => x.uid === t.players[8].uid).time === (4 * 3600 + 12 * 60 + 33 + 12) * 1000, 'Lưu chặng 1: "+0:12" = chậm 12 giây');
  ok(st.events[0].rows.find((x) => x.uid === t.players[0].uid).sp === 20 && st.events[0].rows.find((x) => x.uid === t.players[2].uid).kom === 3, 'Điểm nước rút, leo núi');
  const txt = await boss.textContent('#ot-body, body');
  ok(/Người giữ áo sau chặng 1/.test(txt) && /Áo vàng/.test(txt) && new RegExp('Áo vàng\\s*' + names[2] + '(?!\\d)').test(await boss.textContent('.gt-now')), 'Người giữ áo sau chặng 1: tay đua 3');
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(500);
  const all = await boss.textContent('body');
  ok(/Bỏ cuộc ở chặng 1/.test(all) && /Còn dưới 3 người|Đồng đội/.test(all), 'Bảng chung: người bỏ cuộc; có bảng đồng đội');
  ok(await boss.$$eval('[data-act="otRaceUndo"]', (xs) => xs.length) === 1, 'Chỉ chặng nhập sau cùng có nút huỷ');
  await boss.$eval('.gt-now', (e) => e.scrollIntoView()).catch(() => {}); await sleep(200);
  await shot(boss, 'ot-gt-stage.png');
  // Chặng 2 nhập qua máy chủ → nút huỷ chuyển sang chặng 2
  const left = t.players.slice(0, 183).map((p) => p.uid);
  await boss.evaluate(([tid, rows]) => window.CaroTourKit.O.send({ t: 'otRace', id: tid, event: 1, rows }), [id, left.map((uid, k) => ({ uid, rank: k + 1, time: 3 * 3600000 + k * 1000 }))]);
  await sleep(1000);
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(500);
  ok(st.events[1].done && await boss.$eval('[data-act="otRaceUndo"]', (b) => b.dataset.ev) === '1', 'Chặng 2 xong: chỉ chặng 2 huỷ được');
  ok(new RegExp('Áo vàng\\s*' + names[0] + '\\b').test(await boss.textContent('.gt-now')), 'Áo vàng sau chặng 2: tay đua 1');
  // Trang nhúng (khách): bảng áo vàng xe đạp
  const ectx = await browser.newContext({ viewport: { width: 760, height: 900 } });
  const em = await ectx.newPage();
  const emErr = [];
  em.on('pageerror', (e) => emErr.push(e.message));
  await em.goto(`http://localhost:${PORT}/embed.html?o=${id}&lang=vi&theme=light`);
  await em.waitForSelector('#embed table.stand', { timeout: 10000 }).catch(() => {});
  ok(/Tổng thời gian \(áo vàng\)/.test(await em.textContent('#embed').catch(() => '')) && /Người giữ áo sau chặng 2/.test(await em.textContent('#embed')) && !emErr.length, 'Trang nhúng: bảng áo vàng xe đạp' + (emErr.length ? ' – lỗi JS: ' + emErr.join(' | ') : ''));
  await ectx.close();
  await finish();
})();
