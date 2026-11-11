/*
 * Kiểm thử trình duyệt – đợt 5: giải tổng kiểu Esports World Cup (otour-multi.js). Thẻ mẫu → form giải tổng (các giải con
 * tạo kèm, bảng điểm theo hạng) → bỏ bớt 3 game, tạo → trang tổng có 2 giải con, chỉ tab Tổng quan + Khác, không có nút
 * bắt đầu → thêm giải con qua form thường (ghi "Giải con của…") → trang giải con có link về giải tổng → đấu xong giải
 * con (qua máy chủ) → bảng điểm câu lạc bộ: điểm theo hạng, đội xếp cao nhất của mỗi câu lạc bộ → sửa bảng điểm → gỡ giải con.
 *   node caro/tests/e2e/otour-multi.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const ST = require('../../../server/src/hub/stages.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8839;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_ewc', 1100);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="esports_world_cup"]'); await sleep(400);
  ok(await boss.isVisible('#otmf') && await boss.$$eval('#otmf .multi-games input', (xs) => xs.length) === 6, 'Form giải tổng: 6 giải con tạo kèm');
  ok(await boss.inputValue('#otmf input[name=table]') === '1000 750 500 300 200 150 100 50' && await boss.inputValue('#otmf input[name=minTop]') === '2' && await boss.isChecked('#otmf input[name=needWin]') && /câu lạc bộ/.test(await boss.textContent('#otmf .tpl-desc')), 'Bảng điểm theo hạng + mô tả');
  for (const k of ['br', 'br_mp', 'fighting', 'chess']) await boss.uncheck(`#otmf input[name=g_${k}]`);
  await boss.fill('#otmf input[name=table]', '100 60 30');
  await boss.fill('#otmf input[name=minTop]', '1'); await boss.uncheck('#otmf input[name=needWin]');
  await shot(boss, 'ot-multi-form.png');
  await boss.click('#otmf button.primary.wide'); await sleep(1200);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const P = app.hub.otGet(id);
  ok(P && P.multi && P.multi.children.length === 2 && P.multi.table.join() === '100,60,30', 'Tạo giải tổng: 2 giải con, bảng điểm 100-60-30');
  const kids = P.multi.children.map((c) => app.hub.otGet(c));
  ok(kids[0].name === 'MOBA 5 đấu 5' && kids[0].players.length === 16 && kids[0].esports.fearless === 'hard' && kids[0].stages[0].type === 'gsl' && kids[1].stages[0].type === 'swiss', 'Giải con: MOBA 16 CLB mẫu (bảng GSL, Fearless), bắn súng Thụy Sĩ');
  ok(await boss.$$eval('.ot-tabs button', (xs) => xs.length) === 2 && !(await boss.$('[data-act="otStart"]')), 'Trang tổng: 2 tab, không có nút bắt đầu');
  ok(/Giải tổng · 2 giải con/.test(await boss.textContent('.thead')) && await boss.$$eval('.multi-kid', (xs) => xs.length) === 2, 'Danh sách 2 giải con');
  // Thêm giải con bằng form thường
  await boss.click('[data-act="otMultiNew"]'); await sleep(400);
  ok(/Giải con của giải tổng/.test(await boss.textContent('#otf')), 'Form giải con ghi rõ giải tổng');
  await boss.fill('#otf input[name=name]', 'Đá bóng ảo');
  await boss.selectOption('#otf select[name=sport]', 'esports'); await sleep(200);
  await boss.selectOption('#otf select[name=preset]', 'single'); await sleep(200);
  await boss.fill('#otf textarea[name=teams]', 'Rồng A |  | Rồng\nHổ A |  | Hổ\nRồng B |  | Rồng\nBáo A |  | Báo');
  await boss.click('#otf button.primary.wide'); await sleep(1200);
  const cid = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const c = app.hub.otGet(cid);
  ok(c && c.parent === id && P.multi.children.length === 3, 'Giải con mới gắn vào giải tổng');
  ok(/Giải tổng: Kiểu Esports World Cup/.test(await boss.textContent('.ot-parent')), 'Trang giải con có link về giải tổng');
  // Đấu xong giải con: hạt giống cao thắng (Rồng A > Hổ A > Rồng B, Báo A đồng hạng 3 – có trận hạng ba thì 3 và 4)
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  const seedOf = app.hub.otSeedOf(c);
  for (let g = 0; c.status === 'running' && g < 6; g++) {
    for (const m of ST.playable(c.st[c.stage])) {
      const bo = ST.boOf(c.st[c.stage], m);
      await boss.evaluate(([tid, mid, s]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, sets: s }), [cid, m.id, Array.from({ length: (bo + 1) / 2 }, () => (seedOf(m.a) < seedOf(m.b) ? [1, 0] : [0, 1]))]);
      await sleep(400);
    }
  }
  ok(c.status === 'finished' && P.status === 'running', 'Giải con kết thúc; giải tổng đang diễn ra');
  await boss.click('.ot-parent button'); await sleep(900);
  const rows = await boss.$$eval('.multi-clubs tbody tr', (trs) => trs.map((tr) => [...tr.children].slice(0, 3).map((td) => td.textContent.trim()).join('|')));
  ok(rows[0] === '1|Rồng|100' && rows[1] === '2|Hổ|60' && rows.length === 3, 'Bảng điểm CLB: Rồng 100 (chỉ tính đội xếp cao nhất), Hổ 60: ' + rows.join(' ; '));
  ok(/Vô địch: Rồng A/.test(await boss.textContent('.multi-kids')), 'Giải con ghi nhà vô địch');
  await shot(boss, 'ot-multi-page.png');
  // Sửa bảng điểm theo hạng
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(300);
  await boss.fill('#multi-table', '10 5'); await boss.click('[data-act="otMultiCfg"]'); await sleep(700);
  ok(P.multi.table.join() === '10,5' && /^1\|Rồng\|10$/.test(await boss.$eval('.multi-clubs tbody tr', (tr) => [...tr.children].slice(0, 3).map((td) => td.textContent.trim()).join('|'))), 'Đổi bảng điểm: Rồng 10');
  // Gỡ một giải con
  await boss.click(`[data-act="otMultiDetach"][data-id="${kids[1].id}"]`); await sleep(300);
  await boss.click('#confirm-ok').catch(() => {}); await sleep(800);
  ok(P.multi.children.length === 2 && !app.hub.otGet(kids[1].id).parent, 'Gỡ giải con: thành giải thường');
  await finish();
})();
