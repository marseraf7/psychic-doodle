/*
 * Kiểm thử trình duyệt – Giải đấu Offline: trợ lý AI trong form tạo giải (otour-ai.js; máy chủ hub/otour-ai.js dùng
 * client giả – không gọi API thật): máy chủ chưa có khoá thì không có khung; có khoá: gửi câu hỏi, thấy lời đáp + xem
 * trước cấu hình, "Dùng cấu hình này" áp vào form (số giai đoạn, mô tả bằng lời), báo lỗi khi hết lượt.
 *   node caro/tests/e2e/otour-ai.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8822;
  const { app, user, ok, shot, finish } = await setup(PORT);
  delete process.env.ANTHROPIC_API_KEY;
  app.hub.otAiKeyFile = null;
  const boss = await user('vi', 'ban_ai', 1100);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(600);
  ok(await boss.$eval('#otai', (e) => e.hidden).catch(() => true), 'Máy chủ chưa có khoá API: không hiện khung trợ lý');

  // Bật trợ lý bằng client giả: trả lời kèm cấu hình 4 bảng + loại trực tiếp
  const spec = { sport: 'football', stages: [{ type: 'roundrobin', groups: 4, advance: 2 }, { type: 'single', thirdPlace: true }] };
  const seen = [];
  app.hub.otAiClient = { beta: { messages: { create: async (p) => {
    seen.push(p);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: 'Mình đề xuất 4 bảng, nhất nhì vào tứ kết.', spec_json: JSON.stringify(spec) }) }] };
  } } } };
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.evaluate(() => window.CaroTourKit.top('otours')); await sleep(300);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(600);
  ok(await boss.$eval('#otai', (e) => !e.hidden).catch(() => false), 'Có khoá: hiện khung "Trợ lý AI tạo giải"');
  await boss.fill('#otf input[name=name]', 'Giải AI');
  await boss.fill('#otai-in', 'Giải bóng đá 16 đội, 4 bảng, nhất nhì vào tứ kết');
  await boss.click('[data-act="otAiSend"]'); await sleep(800);
  ok(/4 bảng, nhất nhì vào tứ kết/.test(await boss.textContent('.ot-ai-log')), 'Lời đáp của trợ lý hiện trong khung');
  ok(seen.length === 1 && seen[0].messages[0].content.startsWith('Giải bóng đá 16 đội'), 'Máy chủ gửi câu hỏi tới API');
  ok(/vòng tròn|bảng/i.test(await boss.textContent('.ot-ai-spec')), 'Xem trước cấu hình đề xuất bằng lời');
  ok(await boss.$eval('#otf input[name=name]', (e) => e.value) === 'Giải AI', 'Không vẽ lại cả form: tên giải đang gõ còn nguyên');
  await boss.click('[data-act="otAiApply"]'); await sleep(500);
  const F = await boss.evaluate(() => window.CaroTourKit.otForm.F);
  ok(F.stages.length === 2 && F.stages[0].type === 'roundrobin' && F.d.preset === 'custom', 'Dùng cấu hình này: áp vào form (2 giai đoạn)');
  await shot(boss, 'ot-ai.png');
  // Hết lượt
  process.env.OTOUR_AI_USER_DAY = '1';
  await boss.fill('#otai-in', 'Thêm tranh hạng ba');
  await boss.click('[data-act="otAiSend"]').catch(() => {}); await sleep(600);
  ok(/hết lượt/i.test(await boss.textContent('#otai')) || await boss.$eval('[data-act="otAiSend"]', (b) => b.disabled), 'Hết lượt hôm nay: báo / khoá nút gửi');
  delete process.env.OTOUR_AI_USER_DAY;
  await finish();
})();
