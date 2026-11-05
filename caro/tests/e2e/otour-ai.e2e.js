/*
 * Kiểm thử trình duyệt – Giải đấu Offline: trợ lý AI trong form tạo giải (otour-ai.js; máy chủ hub/otour-ai.js dùng hàm
 * gọi AI giả – không gọi mạng):
 *   - máy chủ chưa có khoá: khung vẫn hiện, mời thêm khoá API riêng (mục cài đặt mở sẵn), nút Gửi khoá;
 *   - khoá riêng: chọn nhà cung cấp + khoá + "Nhớ" → hỏi được, máy chủ nhận đúng nhà cung cấp / khoá; tải lại trang vẫn nhớ;
 *   - AI máy chủ (Muse): lời đáp, xem trước cấu hình, "Dùng cấu hình này" áp vào form; hết lượt thì khoá nút Gửi.
 *   node caro/tests/e2e/otour-ai.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8822;
  const { app, user, ok, shot, finish } = await setup(PORT);
  for (const k of ['MODEL_API_KEY', 'ANTHROPIC_API_KEY', 'OTOUR_AI_PROVIDER']) delete process.env[k];
  app.hub.otAiKeyDir = null;
  const spec = { sport: 'football', stages: [{ type: 'roundrobin', groups: 4, advance: 2 }, { type: 'single', thirdPlace: true }] };
  const seen = [];
  app.hub.otAiCall = async (req) => {
    seen.push(req);
    return { text: JSON.stringify({ reply: 'Mình đề xuất 4 bảng, nhất nhì vào tứ kết.', spec_json: JSON.stringify(spec) }), refused: false };
  };
  const boss = await user('vi', 'ban_ai', 1100);
  const openNew = async () => { await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(700); };
  await openNew();
  ok(await boss.$eval('#otai', (e) => !e.hidden).catch(() => false) && /chưa bật AI/.test(await boss.textContent('#otai-chat')), 'Máy chủ chưa có khoá: khung vẫn hiện, mời thêm khoá riêng');
  ok(await boss.$eval('#otai-own', (d) => d.open) && await boss.$eval('[data-act="otAiSend"]', (b) => b.disabled), 'Mục khoá riêng mở sẵn, nút Gửi khoá khi chưa có khoá');

  // Khoá riêng: OpenAI
  await boss.selectOption('#otai-prov', 'openai'); await sleep(100);
  ok(await boss.$eval('#otai-model', (e) => e.placeholder) === 'gpt-5-mini', 'Đổi nhà cung cấp: gợi ý model mặc định');
  await boss.fill('#otai-key', 'ngan');
  await boss.click('[data-act="otAiOwnSave"]'); await sleep(200);
  ok(/Khoá API không đúng/.test(await boss.textContent('#otai-own-err')), 'Khoá trông sai: báo ngay, không lưu');
  await boss.fill('#otai-key', 'sk-proj-thu-nghiem-123456');
  await boss.check('#otai-remember');
  await boss.click('[data-act="otAiOwnSave"]'); await sleep(400);
  ok(/khoá riêng: OpenAI · gpt-5-mini/.test(await boss.textContent('#otai-chat')), 'Đang dùng khoá riêng OpenAI');
  await boss.fill('#otf input[name=name]', 'Giải AI');
  await boss.fill('#otai-in', 'Giải bóng đá 16 đội, 4 bảng, nhất nhì vào tứ kết');
  await boss.click('[data-act="otAiSend"]'); await sleep(800);
  ok(/4 bảng, nhất nhì vào tứ kết/.test(await boss.textContent('.ot-ai-log')), 'Lời đáp hiện trong khung');
  ok(seen.length === 1 && seen[0].own === true && seen[0].provider === 'openai' && seen[0].key === 'sk-proj-thu-nghiem-123456', 'Máy chủ gọi đúng nhà cung cấp + khoá riêng');
  ok(await boss.$eval('#otf input[name=name]', (e) => e.value) === 'Giải AI', 'Không vẽ lại cả form: tên giải đang gõ còn nguyên');
  ok(/vòng tròn|bảng/i.test(await boss.textContent('.ot-ai-spec')), 'Xem trước cấu hình đề xuất bằng lời');
  await boss.click('[data-act="otAiApply"]'); await sleep(500);
  const F = await boss.evaluate(() => window.CaroTourKit.otForm.F);
  ok(F.stages.length === 2 && F.stages[0].type === 'roundrobin' && F.d.preset === 'custom', 'Dùng cấu hình này: áp vào form (2 giai đoạn)');
  await shot(boss, 'ot-ai-own.png');
  // Tải lại trang: khoá đã nhớ trên máy này
  await boss.reload(); await sleep(1500);
  await openNew();
  ok(/khoá riêng: OpenAI/.test(await boss.textContent('#otai-chat')), 'Tải lại trang: vẫn nhớ khoá riêng');
  await boss.click('#otai-own summary'); await sleep(100);
  await boss.click('[data-act="otAiOwnClear"]'); await sleep(300);
  ok(await boss.evaluate(() => localStorage.getItem('caro.aiOwn')) === null && /chưa bật AI/.test(await boss.textContent('#otai-chat')), 'Bỏ khoá: xoá khỏi máy, quay về trạng thái chưa có AI');

  // AI máy chủ (Muse)
  process.env.MODEL_API_KEY = 'muse-khoa-may-chu-thu';
  await boss.evaluate(() => window.CaroTourKit.top('otours')); await sleep(300);
  await openNew();
  ok(/AI máy chủ \(Muse Spark \(Meta\)\)/.test(await boss.textContent('#otai-chat')), 'Máy chủ có khoá Muse: dùng AI máy chủ');
  await boss.fill('#otai-in', 'Thêm tranh hạng ba');
  await boss.click('[data-act="otAiSend"]'); await sleep(700);
  ok(seen.length === 2 && seen[1].own === false && seen[1].provider === 'muse' && seen[1].model === 'muse-spark-1.3', 'Gọi Muse Spark bằng khoá máy chủ');
  process.env.OTOUR_AI_USER_DAY = '1';
  await boss.evaluate(() => window.CaroTourKit.top('otours')); await sleep(300);
  await openNew();
  ok(await boss.$eval('[data-act="otAiSend"]', (b) => b.disabled), 'Hết lượt AI máy chủ hôm nay: khoá nút Gửi');
  delete process.env.OTOUR_AI_USER_DAY;
  delete process.env.MODEL_API_KEY;
  await finish();
})();
