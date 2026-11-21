/*
 * Thống kê cá nhân (insights.js): tài khoản mở từ tab Xem thêm → biểu đồ theo màu / luật / thời gian / sức đối thủ / độ dài,
 * khai cuộc; "Phân tích N ván gần nhất" chạy xong thì có độ chính xác; mở từ hồ sơ người khác (không có phần phân tích);
 * khách dùng ván lưu trên máy. Soát giao diện ở 390 px.
 *   node caro/tests/e2e/insights.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8121;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const a = await user('vi', 'ins_alice', 390);
  const b = await user('en', 'ins_bob', 390);
  const ua = app.store.byUsername.get('ins_alice').id, ub = app.store.byUsername.get('ins_bob').id;
  const rec = (x, o, winner, moves, rule = 'vn') => app.store.recordGame({ kind: 'quick', timeLimit: 0, clock: '3+2', rule, xId: x, oId: o, xName: 'x', oName: 'o', winner, reason: 'win', moves });
  const row = [[0, 0], [5, 5], [1, 0], [5, 6], [2, 0], [5, 7], [3, 0], [5, 8], [4, 0]];
  rec(ua, ub, 1, row);
  rec(ub, ua, 1, row.map(([x, y]) => [-x, y]));
  rec(ua, ub, 3, [[0, 0], [1, 1], [1, 0], [2, 0], [3, 3], [4, 4], [6, 6]], 'free');

  // ---------------------------------------------------------------- Của mình (tab Xem thêm)
  await a.click('#tabbar [data-tab="more"]');
  await sleep(300);
  await a.click('#more-insights');
  await a.waitForSelector('#insights-dlg[open] svg.chart.bars', { timeout: 5000 });
  const info = await a.evaluate(() => ({
    who: document.querySelector('.ins-who').textContent,
    bars: document.querySelectorAll('#insights-dlg svg.chart.bars').length,
    ops: document.querySelectorAll('#insights-dlg .ins-ops li').length,
    batch: !!document.querySelector('[data-ins="batch"]'),
  }));
  ok(/Thống kê của bạn/.test(info.who), 'tiêu đề: thống kê của bạn');
  ok(info.bars >= 5, `có biểu đồ theo màu / luật / thời gian / sức đối thủ / độ dài (${info.bars})`);
  ok(info.ops >= 1, 'có khai cuộc hay gặp');
  ok(info.batch, 'có nút "Phân tích N ván gần nhất"');
  ok((await audit(a, '#insights-dlg')).length === 0, 'soát giao diện 390 px: 0 lỗi hiển thị');
  await shot(a, 'insights-390.png');

  await a.click('[data-ins="batch"]');
  await a.waitForFunction(() => !document.querySelector('[data-ins="stop"]') && /ván đã phân tích/.test(document.getElementById('insights-dlg-body').textContent), null, { timeout: 90000 }).catch(() => {});
  const acc = await a.evaluate(() => ({ txt: document.getElementById('insights-dlg-body').textContent, line: !!document.querySelector('#insights-dlg svg.chart path.ln') }));
  ok(/ván đã phân tích · trung bình \d+%/.test(acc.txt), 'phân tích hàng loạt xong: có độ chính xác trung bình');
  ok(acc.line, 'có biểu đồ độ chính xác');
  ok(!/\{\w+\}|undefined|NaN/.test(acc.txt), 'không lộ chuỗi mẫu / undefined');
  await a.evaluate(() => document.querySelector('#insights-dlg .x-close').click());

  // ---------------------------------------------------------------- Từ hồ sơ người khác
  await b.evaluate((id) => window.CaroProfile.open(id), ua);
  await b.waitForSelector('#profile-body [data-insights]', { timeout: 5000 });
  await b.click('#profile-body [data-insights]');
  await b.waitForSelector('#insights-dlg[open] svg.chart.bars', { timeout: 5000 });
  const other = await b.evaluate(() => document.getElementById('insights-dlg-body').textContent);
  ok(/Insights for ins_alice/.test(other), 'mở thống kê người khác từ hồ sơ');
  ok(/shown to the owner only/.test(other), 'người khác không thấy phần độ chính xác');

  // ---------------------------------------------------------------- Khách: ván trên máy
  const g = await (await a.context().browser().newContext({ viewport: { width: 390, height: 860 } })).newPage();
  await g.goto(`http://localhost:${PORT}/`);
  await sleep(500);
  await g.evaluate(() => {
    const S = window.CaroLocalHist.store;
    S.add({ at: Date.now(), kind: 'bot', bot: 'ti', me: 1, x: '', o: '', winner: 1, reason: 'win', rule: 'vn', moves: [[0, 0], [3, 3], [1, 0], [3, 4], [2, 0], [3, 5], [3, 0], [3, 6], [4, 0]] });
    window.CaroInsights.open();
  });
  await g.waitForSelector('#insights-dlg[open] .ins-who', { timeout: 5000 });
  const loc = await g.evaluate(() => document.getElementById('insights-dlg-body').textContent);
  ok(/trên máy này|on this device/.test(loc), 'khách: thống kê từ ván lưu trên máy');
  ok((await audit(g, '#insights-dlg')).length === 0, 'khách 390 px: 0 lỗi hiển thị');
  await finish();
})();
