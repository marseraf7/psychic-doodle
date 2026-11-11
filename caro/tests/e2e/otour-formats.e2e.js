/*
 * Kiểm thử trình duyệt – đợt 7: thể thức giải con Esports còn thiếu.
 *   1. Bảng đấu loại kép 4 đội (GSL): form chọn thể thức, Bo trận quyết định, 7 đội thì báo cần chia hết cho 4; 8 đội →
 *      trang giải vẽ 2 bảng với trận mở màn / nhánh thắng / nhánh thua / quyết định, nhập kết quả → "Đi tiếp" / "Bị loại".
 *   2. Sinh tồn: form có điểm hạ gục + match point + "vào thẳng giai đoạn 3"; nhập trận có số hạ gục → bảng có cột Hạ gục,
 *      ghi chú match point; đội đạt ngưỡng thắng trận → vô địch theo match point, giải kết thúc sớm.
 *   node caro/tests/e2e/otour-formats.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const ST = require('../../../server/src/hub/stages.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8840;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_gsl', 1100);
  const tab = (k) => boss.click(`[data-act="otTab"][data-tab="${k}"]`).then(() => sleep(400));
  const newForm = async (name, sport, preset) => {
    await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
    await boss.fill('#otf input[name=name]', name);
    await boss.selectOption('#otf select[name=sport]', sport); await sleep(200);
    await boss.selectOption('#otf select[name=preset]', preset); await sleep(300);
  };
  // ---------- 1. Bảng GSL
  await newForm('Bảng đấu loại kép', 'esports', 'groups_single');
  await boss.selectOption('#otf-stages [data-i="0"][data-k="type"]', 'gsl'); await sleep(300);
  ok(await boss.isVisible('#otf-stages [data-i="0"][data-k="boDecider"]') && !(await boss.$('#otf-stages [data-i="0"][data-k="advance"]')), 'Form: bảng GSL có Bo trận quyết định, không có ô số đội đi tiếp');
  await boss.selectOption('#otf-stages [data-i="0"][data-k="boDecider"]', '5'); await sleep(200);
  ok(/2 người mỗi bảng đi tiếp/.test(await boss.textContent('#otf-stages .flow')) && /thắng 2 trận đi tiếp/.test(await boss.textContent('#otf-desc')), 'Sơ đồ + mô tả bằng lời của bảng GSL');
  const names = ['Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy'];
  await boss.fill('#otf textarea[name=teams]', names.join('\n')); await boss.press('#otf textarea[name=teams]', 'Tab'); await sleep(300);
  await boss.click('#otf button.primary.wide'); await sleep(900);
  let id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(900);
  let t = app.hub.otGet(id);
  ok(t.status === 'draft', '7 đội: chưa bắt đầu được (cần chia hết cho 4)');
  await tab('teams');
  await boss.fill('#ot-add', 'Tám'); await boss.click('[data-act="otTeamsAdd"]'); await sleep(600);
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  ok(t.status === 'running' && t.st[0].groups.length === 2, '8 đội: 2 bảng');
  await tab('stages');
  const body = await boss.textContent('.ot-tab');
  ok(/Trận mở màn/.test(body) && /Trận nhánh thắng/.test(body) && /Trận nhánh thua/.test(body) && /Trận quyết định · Bo5/.test(body), 'Bảng GSL: đủ 4 loại trận, trận quyết định Bo5');
  // Đấu hết bảng A qua máy chủ (hạt giống cao thắng)
  const seedOf = app.hub.otSeedOf(t);
  for (let g = 0; g < 4; g++) {
    for (const m of ST.playable(t.st[0]).filter((x) => x.grp === 0)) {
      const bo = ST.boOf(t.st[0], m);
      await boss.evaluate(([tid, mid, s]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, sets: s }), [id, m.id, Array.from({ length: (bo + 1) / 2 }, () => (seedOf(m.a) < seedOf(m.b) ? [1, 0] : [0, 1]))]);
      await sleep(350);
    }
  }
  const rows = await boss.$$eval('.gsl-tab', (ts) => [...ts[0].querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()).join('|')));
  ok(rows[0] === '1|Một|2–0|Đi tiếp' && rows[1] === '2|Bốn|2–1|Đi tiếp' && /Bị loại/.test(rows[2]) && /Bị loại/.test(rows[3]), 'Bảng A: ' + rows.join(' ; '));
  await shot(boss, 'ot-gsl.png');

  // ---------- 2. Sinh tồn: hạ gục + match point + vào thẳng giai đoạn 3
  await newForm('Sinh tồn', 'esports', 'race_single');
  await boss.fill('#otf-stages [data-i="0"][data-k="events"]', '5'); await boss.press('#otf-stages [data-i="0"][data-k="events"]', 'Tab'); await sleep(300);
  await boss.fill('#otf-stages [data-i="0"][data-k="table"]', '10 6 5 4'); await boss.press('#otf-stages [data-i="0"][data-k="table"]', 'Tab'); await sleep(300);
  await boss.fill('#otf-stages [data-i="0"][data-k="kill"]', '1'); await boss.press('#otf-stages [data-i="0"][data-k="kill"]', 'Tab'); await sleep(300);
  await boss.selectOption('#otf-stages [data-i="0"][data-k="mpMode"]', 'at'); await sleep(300);
  await boss.fill('#otf-stages [data-i="0"][data-k="mpAt"]', '12'); await boss.press('#otf-stages [data-i="0"][data-k="mpAt"]', 'Tab'); await sleep(300);
  ok(/mỗi lần hạ gục 1 điểm/.test(await boss.textContent('#otf-desc')) && /đạt 12 điểm rồi thắng một trận/.test(await boss.textContent('#otf-desc')), 'Mô tả: điểm hạ gục + match point');
  // Thêm 2 giai đoạn phía trước → giai đoạn 1 có ô "vào thẳng giai đoạn 3"
  await boss.click('#otf-stages [data-sact="add"]'); await sleep(200); await boss.click('#otf-stages [data-sact="add"]'); await sleep(300);
  ok(await boss.isVisible('#otf-stages [data-i="0"][data-k="skip"]') && !(await boss.$('#otf-stages [data-i="1"][data-k="skip"]')), 'Giải 3 giai đoạn: giai đoạn 1 có ô vào thẳng giai đoạn 3');
  await boss.fill('#otf-stages [data-i="0"][data-k="skip"]', '1'); await boss.press('#otf-stages [data-i="0"][data-k="skip"]', 'Tab'); await sleep(300);
  ok(/vào thẳng giai đoạn 3/.test(await boss.textContent('#otf-stages .flow')), 'Sơ đồ ghi đội vào thẳng giai đoạn 3');
  await boss.click('#otf-stages [data-sact="del"][data-i="0"]'); await sleep(200); await boss.click('#otf-stages [data-sact="del"][data-i="0"]'); await sleep(300);
  await boss.fill('#otf textarea[name=teams]', 'Sói\nGấu\nCáo\nHổ'); await boss.press('#otf textarea[name=teams]', 'Tab'); await sleep(300);
  await boss.click('#otf button.primary.wide'); await sleep(900);
  id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  t = app.hub.otGet(id);
  ok(t.stages.length === 1 && t.stages[0].kill === 1 && t.stages[0].mp.at === 12 && t.stages[0].skip == null, 'Tạo giải sinh tồn: hạ gục 1 điểm, match point 12');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  await tab('stages');
  ok(/đã có 12 điểm trở lên mà thắng một trận/.test(await boss.textContent('.mp-note')), 'Ghi chú match point');
  const uid = (n) => t.players.find((p) => p.name === n).uid;
  const fill = async (order, kills) => {
    for (let k = 0; k < order.length; k++) {
      await boss.fill(`.race-form tr[data-uid="${uid(order[k])}"] .r-v`, String(k + 1));
      if (kills[order[k]]) await boss.fill(`.race-form tr[data-uid="${uid(order[k])}"] .r-k`, String(kills[order[k]]));
    }
    await boss.click('.race-form button.primary'); await sleep(900);
  };
  await fill(['Gấu', 'Sói', 'Cáo', 'Hổ'], { Gấu: 4, Sói: 1 });
  const st = t.st[0];
  ok(st.events[0].done && st.events[0].rows.find((x) => x.uid === uid('Gấu')).kills === 4, 'Lưu trận 1 kèm số hạ gục');
  const top = await boss.$eval('.ot-tab table.stand tbody tr', (tr) => [...tr.children].map((td) => td.textContent.trim()).join('|'));
  ok(/^1\|Gấu.*Match point\|14\|4\|/.test(top), 'Bảng: Gấu 14 điểm (10 + 4 hạ gục), đã ở match point: ' + top);
  ok(await boss.$$eval('.race-form', (xs) => xs.length) === 1, 'Chỉ trận kế tiếp nhập được');
  await shot(boss, 'ot-br.png');
  await fill(['Gấu', 'Cáo', 'Sói', 'Hổ'], {});
  ok(t.status === 'finished' && st.mpWinner === uid('Gấu') && st.events.filter((e) => e.done).length === 2 && t.podium[0] === uid('Gấu'), 'Gấu thắng trận 2 khi đã đạt ngưỡng → vô địch, giải kết thúc sau 2 / 5 trận');
  await tab('stages');
  ok(/Gấu vô địch theo match point/.test(await boss.textContent('.mp-note')), 'Ghi "vô địch theo match point"');
  await finish();
})();
