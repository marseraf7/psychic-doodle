/*
 * Tổng kết tháng / năm (recap.js): mở từ tab Xem thêm → số ván, chuỗi thắng, thắng đẹp nhất của tháng này; đổi sang Năm;
 * lùi về kỳ trước (không có ván); "Chia sẻ ảnh tổng kết" tạo file PNG. Soát giao diện ở 390 px.
 *   node caro/tests/e2e/recap.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8126;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const a = await user('vi', 'rc_ann', 390);
  await user('vi', 'rc_ben', 390);
  const ua = app.store.byUsername.get('rc_ann').id, ub = app.store.byUsername.get('rc_ben').id;
  const rec = (x, o, winner) => app.store.recordGame({ kind: 'quick', timeLimit: 0, clock: '3+2', rule: 'vn', xId: x, oId: o, xName: 'x', oName: 'o', winner, reason: 'win', moves: [[0, 0], [5, 5], [1, 0], [5, 6], [2, 0], [5, 7], [3, 0], [5, 8], [4, 0]] });
  rec(ua, ub, 1); rec(ub, ua, 2); rec(ua, ub, 2);
  await a.evaluate(() => localStorage.setItem('caro.storm', JSON.stringify({ best: 23, runs: 4 })));

  await a.click('#tabbar [data-tab="more"]');
  await sleep(300);
  await a.click('#more-recap');
  await a.waitForSelector('#recap-dlg[open] .pf-stats', { timeout: 5000 });
  const txt = await a.evaluate(() => document.getElementById('recap-dlg-body').textContent.replace(/\s+/g, ' '));
  ok(/3\s*Ván/.test(txt) && /2\s*Chuỗi thắng dài nhất/.test(txt), `tháng này: 3 ván, chuỗi thắng 2 (${txt.slice(0, 120)})`);
  ok(/Thắng đẹp nhất: trước rc_ben/.test(txt) && /Đối thủ gặp nhiều nhất: rc_ben \(3 ván\)/.test(txt), 'thắng đẹp nhất + đối thủ gặp nhiều nhất');
  ok(/23\s*Kỷ lục Storm/.test(txt), 'kỷ lục Storm lấy từ máy');
  ok((await audit(a, '#recap-dlg')).length === 0, 'soát giao diện 390 px: 0 lỗi hiển thị');
  await shot(a, 'recap-390.png');

  await a.click('#recap-dlg [data-rk="year"]');
  await a.waitForFunction(() => /Năm \d{4}/.test(document.getElementById('recap-dlg-body').textContent), null, { timeout: 5000 });
  ok(true, 'đổi sang tổng kết năm');
  await sleep(1100);
  await a.click('#recap-dlg [data-rn="-1"]');
  await a.waitForFunction(() => /Chưa có ván nào trong kỳ này/.test(document.getElementById('recap-dlg-body').textContent), null, { timeout: 5000 }).catch(() => {});
  ok(/Chưa có ván nào trong kỳ này/.test(await a.evaluate(() => document.getElementById('recap-dlg-body').textContent)), 'năm trước: chưa có ván');

  const [dl] = await Promise.all([a.waitForEvent('download', { timeout: 10000 }), a.click('#recap-dlg [data-rpng]')]);
  const file = await dl.path();
  const size = require('fs').statSync(file).size;
  ok(/^caro-recap-\d{4}\.png$/.test(dl.suggestedFilename()) && size > 5000, `ảnh PNG tổng kết (${dl.suggestedFilename()}, ${size} B)`);
  await finish();
})();
