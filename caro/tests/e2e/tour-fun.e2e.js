/*
 * Kiểm thử trình duyệt – Đợt 10: dự đoán bục vinh quang trước giờ đấu, "Ai sẽ thắng?" khi đang đấu, bảng người đoán +
 * bình chọn cuối giải, tải poster, lưu mẫu giải và dùng lại ở form nhanh, sao chép giải, ô giải định kỳ.
 *   node caro/tests/e2e/tour-fun.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8803;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280);
  const fan = await user('vi', 'fan_caro', 430);
  const tour = (p) => p.evaluate(() => window.CaroTourKit.D.tour);
  const closeDlg = (p) => p.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });

  // ---------------------------------------------------------------- Giải offline 4 người
  await boss.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
  await boss.click('[data-act="tourNew"]'); await sleep(300);
  await boss.fill('#tf input[name=name]', 'Giải Vui Vẻ');
  await boss.selectOption('#tf select[name=preset]', 'single'); await sleep(100);
  await boss.check('#tf input[name=offline]');
  await boss.click('#tf button.primary'); await sleep(800);
  await boss.fill('#bulk-names', 'An\nBình\nChi\nDũng');
  await boss.click('[data-act="bulkAdd"]'); await sleep(500);
  const id = (await tour(boss)).id;
  // Dự đoán
  await fan.evaluate((i) => window.CaroTour.open(i), id); await sleep(600);
  ok(await fan.isVisible('[data-pred="0"]'), 'Trước giờ đấu: có ô dự đoán bục vinh quang');
  const uids = await fan.evaluate(() => Object.fromEntries(window.CaroTourKit.D.tour.players.map((p) => [p.name, p.uid])));
  await fan.selectOption('[data-pred="0"]', uids['An']);
  await fan.selectOption('[data-pred="1"]', uids['Bình']);
  await fan.click('[data-act="funPredict"]'); await sleep(500);
  ok(JSON.stringify((await tour(fan)).myPred) === JSON.stringify([uids['An'], uids['Bình']]), 'Lưu dự đoán: An vô địch, Bình á quân');
  // Poster
  const [dl] = await Promise.all([boss.waitForEvent('download', { timeout: 5000 }).catch(() => null), boss.click('[data-act="funPoster"]')]);
  ok(dl && dl.suggestedFilename() === 'Giai-Vui-Ve-poster.png', 'Tải poster: ' + (dl && dl.suggestedFilename()));
  // ---------------------------------------------------------------- Đang đấu: bình chọn
  await boss.click('[data-act="start"]'); await sleep(800);
  ok((await fan.$$('.fun-votes li')).length === 2, 'Đang đấu: "Ai sẽ thắng?" có 2 trận vòng 1');
  await fan.click('.fun-votes li:first-child [data-v="a"]'); await sleep(500);
  ok(await fan.$eval('.fun-votes li:first-child [data-v="a"]', (e) => e.classList.contains('on')), 'Bình chọn: nút đã chọn được tô');
  await shot(fan, 'fun-vote.png');
  // Ban tổ chức nhập kết quả: hạt giống 1 (An) thắng hết
  const t = app.hub.tours.get(id);
  const score = async () => {
    for (const m of Object.values(t.st[0].matches)) {
      if (m.done || !m.a || !m.b || m.bye) continue;
      const winA = m.a === uids['An'] || (m.b !== uids['An'] && m.a === uids['Bình']);
      await boss.evaluate(([i, mid, s]) => window.CaroOnline.send({ t: 'tourScore', id: i, match: mid, sets: [s] }), [id, m.id, winA ? [2, 0] : [0, 2]]);
      await sleep(250);
    }
  };
  await score(); await sleep(300); await score(); await sleep(600);
  ok(t.status === 'finished' && t.podium[0] === uids['An'] && t.podium[1] === uids['Bình'], 'Giải xong: An vô địch, Bình á quân');
  await sleep(300);
  ok(/6 điểm/.test(await fan.textContent('#tour-body')), 'Người đoán: đúng cả 2 vị trí được 6 điểm');
  await fan.selectOption('[data-award="mvp"]', uids['An']); await sleep(500);
  ok(/An\s*1/.test(await fan.textContent('.fun-awards')), 'Bình chọn Kỳ thủ xuất sắc: An 1 phiếu');
  await shot(fan, 'fun-done.png');
  // ---------------------------------------------------------------- Sao chép giải + mẫu giải
  await boss.check('input[name="tourtab"][value="manage"]'); await sleep(250);
  await boss.click('[data-act="tourClone"]'); await sleep(500);
  ok(await boss.evaluate(() => window.CaroTourKit.V.page) === 'tourAdv' && await boss.$eval('#ta input[name=name]', (e) => e.value) === 'Giải Vui Vẻ'
    && !(await boss.evaluate(() => window.CaroTourKit.tourDraft.F.editId)), 'Sao chép: mở trang nâng cao với cài đặt cũ, là giải mới');
  ok(await boss.isVisible('#ta select[name=recur]'), 'Tab Cơ bản: có ô Lặp lại (giải định kỳ)');
  await boss.selectOption('#ta select[name=recur]', 'weekly');
  await boss.click('[data-act="tplSave"]'); await sleep(600); // hộp hỏi tên trong app: tự bấm Đồng ý với tên sẵn có (helpers.js – autoConfirm)
  const tpls = app.hub.store.users.get((await boss.evaluate(() => window.CaroOnline.state.me.id)).replace(/^u_/, '')).tourTpls;
  ok(tpls && tpls.length === 1 && tpls[0].data.d.recur === 'weekly' && !tpls[0].data.d.start, 'Lưu thành mẫu (không kèm giờ bắt đầu)');
  await closeDlg(boss);
  await boss.evaluate(() => { localStorage.removeItem('caro.tourDraft'); document.getElementById('open-tours').click(); }); await sleep(300);
  await boss.click('[data-act="tourNew"]'); await sleep(500);
  ok(await boss.isVisible('#tpl-pick'), 'Form nhanh: có hàng "Mẫu của tôi"');
  await boss.selectOption('#tpl-pick', tpls[0].id);
  await boss.click('[data-act="tplUse"]'); await sleep(300);
  ok(await boss.$eval('#tf input[name=name]', (e) => e.value) === 'Giải Vui Vẻ' && await boss.isChecked('#tf input[name=offline]'), 'Dùng mẫu: điền lại tên, giải offline');
  ok(await fan.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '430 px: trang giải không tràn ngang');
  await finish();
})();
