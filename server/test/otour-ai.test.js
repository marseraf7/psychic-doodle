'use strict';
// Giải đấu Offline – trợ lý AI tạo giải (hub/otour-ai.js). Không gọi API thật: thay client bằng bản giả (hub.otAiClient)
// và kiểm request gửi đi (model, fallbacks, structured outputs, cache), lời đáp, hạn mức, lỗi.
const test = require('node:test');
const assert = require('node:assert');
const { ctx, Client, account } = require('./otour-client.js');
const { systemPrompt, OUT_SCHEMA } = require('../src/hub/otour-ai.js');

const SPEC = { sport: 'football', stages: [{ type: 'roundrobin', groups: 4, advance: 2 }, { type: 'single', thirdPlace: true }] };
/** Client giả: ghi lại request, trả lời theo hàm answer(params). */
function fake(answer) {
  const calls = [];
  return { calls, beta: { messages: { create: async (p) => { calls.push(p); return answer(p); } } } };
}
const ok = (reply, spec) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply, spec_json: spec ? JSON.stringify(spec) : '' }) }] });

test('tắt khi không có khoá API: otAiInfo on = false, otAi → ot_ai_off; khách → cần tài khoản', async () => {
  const hub = ctx.app.hub;
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  hub.otAiClient = null;
  hub.otAiKeyFile = null;
  const u = await account();
  const info = await u.req({ t: 'otAiInfo' }, 'otAiInfo');
  assert.deepStrictEqual([info.on, info.login], [false, true]);
  assert.strictEqual((await u.req({ t: 'otAi', messages: [{ role: 'user', text: 'Giải 8 đội' }] }, 'error')).code, 'ot_ai_off');
  const guest = await Client.open();
  assert.strictEqual((await guest.req({ t: 'otAiInfo' }, 'otAiInfo')).login, false);
  assert.strictEqual((await guest.req({ t: 'otAi', messages: [{ role: 'user', text: 'x' }] }, 'error')).code, 'need_account');
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  u.close(); guest.close();
});

test('hỏi trợ lý: request đúng (model, fallbacks, structured outputs, cache lời dặn), trả lời + cấu hình đã kiểm', async () => {
  const hub = ctx.app.hub;
  const f = fake(() => ok('Đã tạo cấu hình 16 đội.', SPEC));
  hub.otAiClient = f;
  const u = await account();
  const info = await u.req({ t: 'otAiInfo' }, 'otAiInfo');
  assert.ok(info.on && info.left > 0);
  const r = await u.req({ t: 'otAi', messages: [{ role: 'user', text: 'Giải bóng đá 16 đội, 4 bảng' }], spec: { sport: 'badminton', stages: [] } }, 'otAi');
  assert.strictEqual(r.reply, 'Đã tạo cấu hình 16 đội.');
  assert.strictEqual(r.spec.sport, 'football');
  assert.strictEqual(r.spec.stages.length, 2);
  assert.strictEqual(r.specError, null);
  const p = f.calls[0];
  assert.strictEqual(p.model, 'claude-opus-5-5');
  assert.strictEqual(p.fallbacks, 'default');
  assert.deepStrictEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.deepStrictEqual(p.output_config.format, { type: 'json_schema', schema: OUT_SCHEMA });
  assert.deepStrictEqual(p.system[0].cache_control, { type: 'ephemeral' });
  assert.strictEqual(p.system[0].text, systemPrompt());
  assert.match(p.system[0].text, /Lược đồ JSON/);
  assert.strictEqual(p.messages.length, 1);
  assert.match(p.messages[0].content, /Giải bóng đá 16 đội[\s\S]*Cấu hình hiện tại của form[\s\S]*badminton/, 'gắn cấu hình đang có trên form');
  assert.ok(!('tool_choice' in p) && !('thinking' in p), 'không ép công cụ / không tắt suy nghĩ (Opus 5.5 trả 400)');
  // Hỏi lại (chưa đủ thông tin): không có cấu hình
  f.calls.length = 0;
  hub.otAiClient = fake(() => ok('Giải có bao nhiêu đội?', null));
  const r2 = await u.req({ t: 'otAi', messages: [{ role: 'user', text: 'Tạo giải' }, { role: 'assistant', text: 'Môn gì?' }, { role: 'user', text: 'Bóng đá' }] }, 'otAi');
  assert.deepStrictEqual([r2.reply, r2.spec], ['Giải có bao nhiêu đội?', null]);
  // Cấu hình sai lược đồ → specError, không áp
  hub.otAiClient = fake(() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: 'x', spec_json: '{"sport":"bong"' }) }] }));
  const r3 = await u.req({ t: 'otAi', messages: [{ role: 'user', text: 'x' }] }, 'otAi');
  assert.ok(r3.specError && r3.spec === null);
  u.close();
});

test('lỗi: từ chối, API lỗi / quá tải, lời đáp hỏng, tin nhắn sai; đang trả lời; hết lượt trong ngày', async () => {
  const hub = ctx.app.hub;
  const u = await account();
  const ask = (m) => u.req({ t: 'otAi', messages: m || [{ role: 'user', text: 'Giải 8 đội' }] }, 'error');
  hub.otAiClient = fake(() => ({ stop_reason: 'refusal', content: [] }));
  assert.strictEqual((await ask()).code, 'ot_ai_refused');
  hub.otAiClient = fake(() => { const e = new Error('boom'); e.status = 500; throw e; });
  assert.strictEqual((await ask()).code, 'ot_ai_failed');
  hub.otAiClient = fake(() => { const e = new Error('slow down'); e.status = 429; throw e; });
  assert.strictEqual((await ask()).code, 'ot_ai_limit');
  hub.otAiClient = fake(() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'không phải JSON' }] }));
  assert.strictEqual((await ask()).code, 'ot_ai_failed');
  assert.strictEqual((await ask([{ role: 'assistant', text: 'x' }])).code, 'bad_message', 'tin đầu phải là của người dùng');
  assert.strictEqual((await ask([{ role: 'user', text: '   ' }])).code, 'bad_message');
  assert.strictEqual((await ask(Array.from({ length: 13 }, () => ({ role: 'user', text: 'x' })))).code, 'bad_message');
  // Đang trả lời câu trước
  let release;
  hub.otAiClient = fake(() => new Promise((res) => { release = () => res(ok('xong', null)); }));
  u.send({ t: 'otAi', messages: [{ role: 'user', text: 'câu 1' }] });
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual((await ask()).code, 'ot_ai_busy');
  release();
  await u.wait('otAi');
  // Hết lượt trong ngày
  process.env.OTOUR_AI_USER_DAY = '0';
  hub.otAiClient = fake(() => ok('x', null));
  assert.strictEqual((await ask()).code, 'ot_ai_limit');
  assert.strictEqual((await u.req({ t: 'otAiInfo' }, 'otAiInfo')).left, 0);
  delete process.env.OTOUR_AI_USER_DAY;
  hub.otAiClient = null;
  u.close();
});

test('khoá API đọc từ file DATA_DIR/anthropic-key (không có file → tắt)', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const hub = ctx.app.hub;
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  hub.otAiClient = null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otai-'));
  hub.otAiKeyFile = path.join(dir, 'anthropic-key');
  assert.strictEqual(hub.otAiKey(), null);
  assert.strictEqual(hub.otAiApi(), null);
  fs.writeFileSync(hub.otAiKeyFile, 'khoa-thu-nghiem\n');
  assert.strictEqual(hub.otAiKey(), 'khoa-thu-nghiem');
  const c = hub.otAiApi();
  assert.ok(c && typeof c.beta.messages.create === 'function', 'tạo client SDK (chưa gọi mạng)');
  assert.strictEqual(hub.otAiApi(), c, 'dùng lại client khi khoá không đổi');
  fs.rmSync(dir, { recursive: true, force: true });
  hub.otAiKeyFile = null;
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
});
