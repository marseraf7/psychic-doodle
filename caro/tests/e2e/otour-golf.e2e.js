/*
 * Kiểm thử trình duyệt – đợt 4: golf đấu gậy kiểu The Masters (otour-golf.js) + giải nhiều mùa / đăng ký theo lời mời
 * (otour-next.js). Mẫu The Masters → form cách tính golf, par 72, cắt sau vòng 2 → giải 6 golfer: vòng 1 lưu dở rồi dán
 * cả bảng điểm → bảng dẫn đầu (so với par, đồng hạng "T", vòng đang đánh) → các vòng sau qua máy chủ → vạch cắt, bằng
 * điểm hạng nhất → ghi người thắng đấu phụ → kết thúc → tab Khác: tạo mùa sau (vô địch đứng đầu, đặc cách) → mùa 2:
 * chỉ nhận đăng ký theo lời mời, mời tên không có → báo không tìm thấy.
 *   node caro/tests/e2e/otour-golf.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8838;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_golf', 1100);
  const tab = (k) => boss.click(`[data-act="otTab"][data-tab="${k}"]`).then(() => sleep(400));
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="masters"]'); await sleep(300);
  ok(await boss.$eval('#otf select[name=sport]', (e) => e.value) === 'golf' && await boss.$eval('#otf-stages [data-k="score"]', (e) => e.value) === 'golf', 'Mẫu The Masters: golf, cách tính đấu gậy');
  ok(await boss.inputValue('#otf-stages [data-k="par"]') === '4 5 4 3 4 3 4 5 4 4 4 3 5 4 5 3 4 4' && /par 72/.test(await boss.textContent('#otf-stages')), 'Par 18 lỗ, tổng 72');
  ok(await boss.isChecked('#otf-stages [data-k="cutOn"]') && await boss.inputValue('#otf-stages [data-k="cutTop"]') === '50', 'Cắt sau vòng 2: 50 người + đồng hạng');
  ok(/vòng 2 chỉ 50 người/.test(await boss.textContent('.tpl-desc')) || /50 người đầu/.test(await boss.textContent('.tpl-desc')), 'Mô tả bằng lời');
  await boss.fill('#otf-stages [data-k="cutTop"]', '3'); await boss.press('#otf-stages [data-k="cutTop"]', 'Tab'); await sleep(200);
  await shot(boss, 'ot-golf-form.png');
  await boss.fill('#otf textarea[name=teams]', ['An', 'Bình', 'Chi', 'Dũng', 'Em', 'Giang'].join('\n'));
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.stages[0].cut.top === 3 && t.stages[0].input === 'round', 'Tạo giải: cắt 3 người, nhập tổng vòng');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  await tab('stages');
  const uid = (n) => t.players.find((p) => p.name === n).uid;
  // Vòng 1: lưu dở (An 68) → bảng dẫn đầu An −4, vòng đang đánh
  await boss.fill(`.golf-form tr[data-uid="${uid('An')}"] .g-s`, '68');
  await boss.click('.golf-form button.primary'); await sleep(800);
  ok(t.st[0].events[0].rows && !t.st[0].events[0].done, 'Lưu dở vòng 1');
  ok(/−4/.test(await boss.textContent('.golf-board')) && /đang đánh/.test(await boss.textContent('body')), 'Bảng dẫn đầu: An −4, vòng đang đánh');
  // Dán cả bảng điểm vòng 1
  await boss.click('.golf-form .gt-paste summary'); await sleep(200);
  await boss.fill('.golf-form .g-paste', 'An | 68\nBình | 70\nChi | 70\nDũng | 72\nEm | 75\nGiang | WD\nAi đó | 70');
  await boss.click('[data-act="otGolfPaste"]'); await sleep(300);
  ok(/Ai đó/.test(await boss.textContent('.golf-form .err')), 'Dán: báo tên không có');
  await boss.click('.golf-form button.primary'); await sleep(900);
  ok(t.st[0].events[0].done, 'Vòng 1 xong (Giang rút lui)');
  ok(/T2/.test(await boss.textContent('.golf-board')) && /Rút lui/.test(await boss.textContent('.golf-board')), 'Đồng hạng "T2", rút lui');
  // Vòng 2–4 qua máy chủ: sau vòng 2 An −6, Bình −3, Chi −3, Dũng E, Em +5 → cắt top 3 (An, Bình, Chi)
  const send = (i, rows) => boss.evaluate(([tid, ev, rs]) => window.CaroTourKit.O.send({ t: 'otRace', id: tid, event: ev, rows: rs }), [id, i, rows]);
  await send(1, [['An', 70], ['Bình', 71], ['Chi', 71], ['Dũng', 72], ['Em', 74]].map(([n, s]) => ({ uid: uid(n), s }))); await sleep(600);
  await send(2, [['An', 74], ['Bình', 70], ['Chi', 72]].map(([n, s]) => ({ uid: uid(n), s }))); await sleep(600);
  await send(3, [['An', 72], ['Bình', 73], ['Chi', 72]].map(([n, s]) => ({ uid: uid(n), s }))); await sleep(900);
  ok(t.st[0].events[3].done && t.status === 'running', 'Hết 4 vòng, bằng điểm hạng nhất: chờ đấu phụ');
  const board = await boss.textContent('.golf-board');
  ok(/Vạch cắt: −3/.test(board) && /Bị cắt/.test(board), 'Vạch cắt −3, người bị cắt');
  ok(await boss.isVisible('.golf-po-form'), 'Khung ghi người thắng đấu phụ');
  await boss.$eval('.golf-po', (e) => e.scrollIntoView()).catch(() => {}); await sleep(200);
  await shot(boss, 'ot-golf-board.png');
  await boss.selectOption('.golf-po-form select[name=winner]', uid('Bình'));
  await boss.fill('.golf-po-form input[name=holes]', '2');
  await boss.click('.golf-po-form button.primary'); await sleep(1200);
  ok(t.status === 'finished' && t.podium[0] === uid('Bình') && t.st[0].playoff.holes === 2, 'Bình thắng đấu phụ sau 2 lỗ, giải kết thúc');
  // Mùa sau
  await tab('more');
  await boss.fill('#ot-exempt', 'An');
  await boss.click('[data-act="otExemptSave"]'); await sleep(500);
  ok(t.exempt[0] === 'An', 'Lưu đặc cách trọn đời');
  await boss.click('[data-act="otNextSeason"]'); await sleep(300);
  await boss.click('#confirm-ok').catch(() => {}); await sleep(1200);
  const id2 = await boss.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id);
  const t2 = app.hub.otGet(id2);
  ok(id2 !== id && t2 && t2.players.map((p) => p.name).join(',') === 'Bình,An' && t2.series.n === 2, 'Mùa 2: Bình (vô địch) đứng đầu, An đặc cách');
  ok(/Mùa 2/.test(await boss.textContent('body')), 'Nhãn "Mùa 2"');
  // Đăng ký theo lời mời
  await tab('overview');
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(200);
  await boss.check('#ot-reg-open'); await sleep(500);
  await boss.check('#ot-reg-invite'); await sleep(600);
  ok(t2.reg.open && t2.reg.invite, 'Mở đăng ký chỉ theo lời mời');
  await boss.fill('#ot-invite-in', 'khong_co_ai'); await boss.click('[data-act="otInviteSend"]'); await sleep(600);
  ok(/Không tìm thấy: khong_co_ai/.test(await boss.textContent('#ot-invite-msg')), 'Mời tên không có: báo không tìm thấy');
  await shot(boss, 'ot-golf-next.png');
  await finish();
})();
