'use strict';
// Giải đấu Offline – trợ lý AI tạo giải (hub/otour-ai.js, hub/otour-ai-call.js). Không gọi mạng: thay hàm gọi AI bằng bản
// giả (hub.otAiCall) hoặc fetch / client Claude giả, kiểm request gửi đi, lời đáp, khoá riêng, hạn mức, lỗi.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { ctx, Client, account } = require('./otour-client.js');
const { systemPrompt, OUT_SCHEMA } = require('../src/hub/otour-ai.js');
const { callAi, parseReply } = require('../src/hub/otour-ai-call.js');
const { PROVIDERS, cleanModel, keyOk } = require('../../caro/otour-ai-providers.js');

const SPEC = { sport: 'football', stages: [{ type: 'roundrobin', groups: 4, advance: 2 }, { type: 'single', thirdPlace: true }] };
const ok = (reply, spec) => ({ text: JSON.stringify({ reply, spec_json: spec ? JSON.stringify(spec) : '' }), refused: false });
/** Hàm gọi AI giả: ghi lại yêu cầu, trả lời theo answer(req). */
function fake(answer) {
  const calls = [];
  const fn = async (req) => { calls.push(req); return answer(req); };
  fn.calls = calls;
  return fn;
}
/** Tắt mọi khoá máy chủ (biến môi trường + thư mục khoá) cho bài thử; trả hàm khôi phục. */
function noServerKey(hub) {
  const saved = { m: process.env.MODEL_API_KEY, a: process.env.ANTHROPIC_API_KEY, p: process.env.OTOUR_AI_PROVIDER };
  delete process.env.MODEL_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.OTOUR_AI_PROVIDER;
  hub.otAiKeyDir = null;
  return () => {
    for (const [k, v] of [['MODEL_API_KEY', saved.m], ['ANTHROPIC_API_KEY', saved.a], ['OTOUR_AI_PROVIDER', saved.p]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  };
}

test('máy chủ chưa có khoá: otAiInfo on = false, hỏi bằng AI máy chủ → ot_ai_off; khách → cần tài khoản', async () => {
  const hub = ctx.app.hub;
  const restore = noServerKey(hub);
  hub.otAiCall = null;
  const u = await account();
  const info = await u.req({ t: 'otAiInfo' }, 'otAiInfo');
  assert.deepStrictEqual([info.on, info.login, info.provider], [false, true, null]);
  assert.strictEqual((await u.req({ t: 'otAi', messages: [{ role: 'user', text: 'Giải 8 đội' }] }, 'error')).code, 'ot_ai_off');
  const guest = await Client.open();
  assert.strictEqual((await guest.req({ t: 'otAiInfo' }, 'otAiInfo')).login, false);
  assert.strictEqual((await guest.req({ t: 'otAi', messages: [{ role: 'user', text: 'x' }] }, 'error')).code, 'need_account');
  restore(); u.close(); guest.close();
});

test('khoá máy chủ: mặc định Muse (file DATA_DIR/muse-key), có cả Claude thì OTOUR_AI_PROVIDER chọn', () => {
  const hub = ctx.app.hub;
  const restore = noServerKey(hub);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otai-'));
  hub.otAiKeyDir = dir;
  assert.strictEqual(hub.otAiServer(), null);
  fs.writeFileSync(path.join(dir, 'anthropic-key'), 'sk-ant-thu\n');
  assert.deepStrictEqual(hub.otAiServer(), { provider: 'anthropic', key: 'sk-ant-thu' });
  fs.writeFileSync(path.join(dir, 'muse-key'), 'muse-thu-123\n');
  assert.deepStrictEqual(hub.otAiServer(), { provider: 'muse', key: 'muse-thu-123' }, 'có cả hai: mặc định Muse');
  process.env.OTOUR_AI_PROVIDER = 'anthropic';
  assert.strictEqual(hub.otAiServer().provider, 'anthropic');
  process.env.OTOUR_AI_PROVIDER = 'khong-co';
  assert.strictEqual(hub.otAiServer().provider, 'muse', 'tên lạ: bỏ qua');
  delete process.env.OTOUR_AI_PROVIDER;
  process.env.MODEL_API_KEY = 'muse-bien-moi-truong';
  assert.strictEqual(hub.otAiServer().key, 'muse-bien-moi-truong', 'biến môi trường trước file');
  fs.rmSync(dir, { recursive: true, force: true });
  restore();
});

test('hỏi AI máy chủ (Muse): lời dặn, model mặc định, cấu hình gắn vào tin cuối; trả lời + cấu hình đã kiểm', async () => {
  const hub = ctx.app.hub;
  const restore = noServerKey(hub);
  process.env.MODEL_API_KEY = 'muse-khoa-may-chu';
  const f = fake(() => ok('Đã tạo cấu hình 16 đội.', SPEC));
  hub.otAiCall = f;
  const u = await account();
  const info = await u.req({ t: 'otAiInfo' }, 'otAiInfo');
  assert.ok(info.on && info.left > 0 && info.provider === 'muse');
  const r = await u.req({ t: 'otAi', messages: [{ role: 'user', text: 'Giải bóng đá 16 đội, 4 bảng' }], spec: { sport: 'badminton', stages: [] } }, 'otAi');
  assert.deepStrictEqual([r.reply, r.spec.sport, r.spec.stages.length, r.specError], ['Đã tạo cấu hình 16 đội.', 'football', 2, null]);
  const q = f.calls[0];
  assert.deepStrictEqual([q.provider, q.model, q.key, q.own], ['muse', 'muse-spark-1.3', 'muse-khoa-may-chu', false]);
  assert.strictEqual(q.system, systemPrompt());
  assert.deepStrictEqual(q.schema, OUT_SCHEMA);
  assert.match(q.messages[0].content, /Giải bóng đá 16 đội[\s\S]*Cấu hình hiện tại của form[\s\S]*badminton/);
  // spec_json là object (vài model trả vậy) → vẫn nhận; lời đáp bọc trong ```json``` → vẫn đọc được
  hub.otAiCall = fake(() => ({ text: '```json\n' + JSON.stringify({ reply: 'ok', spec_json: SPEC }) + '\n```', refused: false }));
  const r2 = await u.req({ t: 'otAi', messages: [{ role: 'user', text: 'x' }] }, 'otAi');
  assert.strictEqual(r2.spec.sport, 'football');
  // Cấu hình sai lược đồ → specError, không áp
  hub.otAiCall = fake(() => ({ text: JSON.stringify({ reply: 'x', spec_json: '{"sport":"bong"' }), refused: false }));
  const r3 = await u.req({ t: 'otAi', messages: [{ role: 'user', text: 'x' }] }, 'otAi');
  assert.ok(r3.specError && r3.spec === null);
  restore(); u.close();
});

test('khoá riêng của người dùng: chọn nhà cung cấp / model, không tính vào trần máy chủ, khoá sai báo rõ', async () => {
  const hub = ctx.app.hub;
  const restore = noServerKey(hub); // máy chủ không có khoá – khoá riêng vẫn dùng được
  const f = fake(() => ok('Xong.', SPEC));
  hub.otAiCall = f;
  const u = await account();
  const ask = (own, t = 'otAi') => u.req({ t: 'otAi', messages: [{ role: 'user', text: 'Giải 8 đội' }], own }, t);
  const r = await ask({ provider: 'openai', key: 'sk-proj-1234567890', model: 'gpt-thu' });
  assert.strictEqual(r.reply, 'Xong.');
  assert.deepStrictEqual([f.calls[0].provider, f.calls[0].key, f.calls[0].model, f.calls[0].own], ['openai', 'sk-proj-1234567890', 'gpt-thu', true]);
  await ask({ provider: 'deepseek', key: 'sk-deep-1234567890', model: 'tên sai có khoảng trắng' });
  assert.strictEqual(f.calls[1].model, PROVIDERS.deepseek.model, 'model sai → model mặc định');
  assert.strictEqual((await ask({ provider: 'khong-co', key: 'abcdefghij' }, 'error')).code, 'ot_ai_key_bad');
  assert.strictEqual((await ask({ provider: 'muse', key: 'ngắn' }, 'error')).code, 'ot_ai_key_bad');
  assert.strictEqual((await ask('chuoi', 'error')).code, 'ot_ai_key_bad');
  hub.otAiCall = fake(() => { const e = new Error('x'); e.status = 401; throw e; });
  assert.strictEqual((await ask({ provider: 'muse', key: 'muse-sai-khoa-123' }, 'error')).code, 'ot_ai_key_bad');
  hub.otAiCall = fake(() => { const e = new Error('x'); e.status = 429; throw e; });
  assert.strictEqual((await ask({ provider: 'muse', key: 'muse-het-tien-123' }, 'error')).code, 'ot_ai_rate');
  // Hết lượt khoá riêng trong ngày
  process.env.OTOUR_AI_OWN_DAY = '0';
  assert.strictEqual((await ask({ provider: 'muse', key: 'muse-khoa-12345' }, 'error')).code, 'ot_ai_limit');
  delete process.env.OTOUR_AI_OWN_DAY;
  restore(); hub.otAiCall = null; u.close();
});

test('lỗi: từ chối, nhà cung cấp lỗi / quá tải, lời đáp hỏng, tin nhắn sai; đang trả lời; hết lượt AI máy chủ', async () => {
  const hub = ctx.app.hub;
  const restore = noServerKey(hub);
  process.env.MODEL_API_KEY = 'muse-khoa-may-chu';
  const u = await account();
  const ask = (m) => u.req({ t: 'otAi', messages: m || [{ role: 'user', text: 'Giải 8 đội' }] }, 'error');
  hub.otAiCall = fake(() => ({ text: '', refused: true }));
  assert.strictEqual((await ask()).code, 'ot_ai_refused');
  hub.otAiCall = fake(() => { const e = new Error('boom'); e.status = 500; throw e; });
  assert.strictEqual((await ask()).code, 'ot_ai_failed');
  hub.otAiCall = fake(() => { const e = new Error('slow'); e.status = 429; throw e; });
  assert.strictEqual((await ask()).code, 'ot_ai_limit');
  for (const text of ['không phải JSON', 'null', '[1,2]', '{"spec_json":""}']) {
    hub.otAiCall = fake(() => ({ text, refused: false }));
    assert.strictEqual((await ask()).code, 'ot_ai_failed', 'lời đáp hỏng: ' + text);
  }
  assert.strictEqual((await ask([{ role: 'assistant', text: 'x' }])).code, 'bad_message', 'tin đầu phải là của người dùng');
  assert.strictEqual((await ask([{ role: 'user', text: '   ' }])).code, 'bad_message');
  assert.strictEqual((await ask(Array.from({ length: 13 }, () => ({ role: 'user', text: 'x' })))).code, 'bad_message');
  // Đang trả lời câu trước
  let release;
  hub.otAiCall = fake(() => new Promise((res) => { release = () => res(ok('xong', null)); }));
  u.send({ t: 'otAi', messages: [{ role: 'user', text: 'câu 1' }] });
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual((await ask()).code, 'ot_ai_busy');
  release();
  await u.wait('otAi');
  process.env.OTOUR_AI_USER_DAY = '0';
  hub.otAiCall = fake(() => ok('x', null));
  assert.strictEqual((await ask()).code, 'ot_ai_limit');
  assert.strictEqual((await u.req({ t: 'otAiInfo' }, 'otAiInfo')).left, 0);
  delete process.env.OTOUR_AI_USER_DAY;
  restore(); hub.otAiCall = null; u.close();
});

test('otour-ai-call: Muse / OpenAI kiểu Chat Completions (đúng địa chỉ, Bearer, json_schema), json_object gọi lại khi 400, Claude qua SDK', async () => {
  const sent = [];
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchOk = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return reply(200, { choices: [{ message: { content: '{"reply":"ok","spec_json":""}' } }] }); };
  const base = { system: 'S', messages: [{ role: 'user', content: 'hi' }], schema: OUT_SCHEMA };
  const r = await callAi({ ...base, provider: 'muse', key: 'muse-k', model: 'muse-spark-1.3' }, { fetch: fetchOk });
  assert.deepStrictEqual(r, { text: '{"reply":"ok","spec_json":""}', refused: false });
  assert.strictEqual(sent[0].url, 'https://api.meta.ai/v1/chat/completions');
  assert.strictEqual(sent[0].init.headers.authorization, 'Bearer muse-k');
  assert.deepStrictEqual(sent[0].body.messages[0], { role: 'system', content: 'S' });
  assert.strictEqual(sent[0].body.response_format.type, 'json_schema');
  assert.strictEqual(sent[0].body.max_tokens, 8000);
  await callAi({ ...base, provider: 'openai', key: 'sk-x', model: 'gpt-x' }, { fetch: fetchOk });
  assert.ok(sent[1].body.max_completion_tokens && !('max_tokens' in sent[1].body), 'OpenAI: max_completion_tokens');
  // json_object bị từ chối (400) → gọi lại một lần không kèm response_format
  const seen = [];
  const fetch400 = async (url, init) => { const b = JSON.parse(init.body); seen.push(b); return b.response_format ? reply(400, { error: 'x' }) : reply(200, { choices: [{ message: { content: '{"reply":"r","spec_json":""}' } }] }); };
  assert.strictEqual((await callAi({ ...base, provider: 'openrouter', key: 'k-1234567', model: 'm' }, { fetch: fetch400 })).text, '{"reply":"r","spec_json":""}');
  assert.deepStrictEqual(seen.map((b) => !!b.response_format), [true, false]);
  // Lỗi HTTP / mạng / từ chối
  await assert.rejects(callAi({ ...base, provider: 'muse', key: 'k', model: 'm' }, { fetch: async () => reply(401, {}) }), (e) => e.status === 401);
  await assert.rejects(callAi({ ...base, provider: 'muse', key: 'k', model: 'm' }, { fetch: async () => { throw new Error('net'); } }), (e) => e.status === 0);
  await assert.rejects(callAi({ ...base, provider: 'muse', key: 'k', model: 'm' }, { fetch: async () => reply(200, {}) }), (e) => e.status === 502);
  await assert.rejects(callAi({ ...base, provider: 'khong-co', key: 'k', model: 'm' }), (e) => e.status === 400);
  assert.strictEqual((await callAi({ ...base, provider: 'openai', key: 'k', model: 'm' }, { fetch: async () => reply(200, { choices: [{ message: { refusal: 'no' } }] }) })).refused, true);
  // Claude: SDK (client giả) – fallbacks, structured outputs, cache lời dặn
  const reqs = [];
  const make = () => ({ beta: { messages: { create: async (p) => { reqs.push(p); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'T' }] }; } } } });
  assert.strictEqual((await callAi({ ...base, provider: 'anthropic', key: 'sk-ant', model: 'claude-opus-5-5' }, { anthropic: make })).text, 'T');
  assert.deepStrictEqual([reqs[0].fallbacks, reqs[0].betas[0], reqs[0].output_config.format.type, reqs[0].system[0].cache_control.type], ['default', 'server-side-fallback-2026-07-01', 'json_schema', 'ephemeral']);
  // Model đời cũ người dùng tự chọn: không gửi fallbacks / effort (API sẽ trả 400)
  await callAi({ ...base, provider: 'anthropic', key: 'sk-ant', model: 'claude-haiku-4-5' }, { anthropic: make });
  assert.ok(!('fallbacks' in reqs[1]) && !('betas' in reqs[1]) && !('effort' in reqs[1].output_config) && reqs[1].output_config.format, 'model cũ: chỉ structured outputs');
  await callAi({ ...base, provider: 'anthropic', key: 'sk-ant', model: 'claude-sonnet-4-6' }, { anthropic: make });
  assert.ok(!('fallbacks' in reqs[2]) && reqs[2].output_config.effort === 'medium', 'Sonnet 4.6: có effort, không fallbacks');
  const refuse = () => ({ beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } });
  assert.strictEqual((await callAi({ ...base, provider: 'anthropic', key: 'k', model: 'm' }, { anthropic: refuse })).refused, true);
  const boom = () => ({ beta: { messages: { create: async () => { const e = new Error('x'); e.status = 403; throw e; } } } });
  await assert.rejects(callAi({ ...base, provider: 'anthropic', key: 'k', model: 'm' }, { anthropic: boom }), (e) => e.status === 403);
});

test('parseReply, cleanModel, keyOk', () => {
  assert.deepStrictEqual(parseReply('{"a":1}'), { a: 1 });
  assert.deepStrictEqual(parseReply('Đây: ```json\n{"a":2}\n``` hết'), { a: 2 });
  assert.strictEqual(parseReply('không có'), null);
  assert.strictEqual(parseReply('{hỏng}'), null);
  assert.strictEqual(cleanModel('muse', ' muse-spark-1.3-contributor '), 'muse-spark-1.3-contributor');
  assert.strictEqual(cleanModel('openrouter', 'meta-llama/llama-3.3-70b-instruct:free'), 'meta-llama/llama-3.3-70b-instruct:free');
  assert.strictEqual(cleanModel('muse', 'a b'), 'muse-spark-1.3');
  assert.strictEqual(cleanModel('muse', 42), 'muse-spark-1.3');
  assert.ok(keyOk('sk-1234567890') && !keyOk('ngắn') && !keyOk('có khoảng trắng 123') && !keyOk(null));
});
