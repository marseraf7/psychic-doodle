/*
 * Giải đấu Offline – gọi nhà cung cấp AI cho trợ lý tạo giải (otour-ai.js). Danh sách nhà cung cấp cố định:
 * caro/otour-ai-providers.js (máy chủ chỉ gọi đúng các địa chỉ trong đó).
 *   callAi({ provider, key, model, system, messages, schema, own }, deps?) → { text, refused }
 *     own: khoá riêng của người dùng – không giữ lại sau lần gọi.
 *     messages: [{ role: 'user' | 'assistant', content }]; schema: JSON Schema của lời đáp.
 *     deps.fetch – thay fetch (bài thử); deps.anthropic(key) – thay client Claude (bài thử).
 *   Lỗi HTTP: ném { status } (không kèm nội dung lỗi của nhà cung cấp – có thể nhắc tới khoá / tài khoản).
 * Kiểu 'openai' (Muse Spark, OpenAI, Gemini, DeepSeek, OpenRouter): POST <base>/chat/completions, Bearer <khoá>,
 * response_format json_schema hoặc json_object. Kiểu 'anthropic': SDK chính thức @anthropic-ai/sdk, structured outputs,
 * fallbacks "default" khi bộ lọc an toàn từ chối.
 */
'use strict';
const { PROVIDERS } = require('../../../caro/otour-ai-providers.js');

const TIMEOUT = 90000;
// Model Claude nhận fallbacks: "default" (Fable 5.x, Opus 5.x, Sonnet 5.5) / nhận output_config.effort (đời 4.5 trở lên)
const FALLBACK_MODELS = /^claude-(fable-5|opus-5|sonnet-5-5)/;
const EFFORT_MODELS = /^claude-(fable-|mythos-|opus-5|opus-4-[5-9]|sonnet-5|sonnet-4-6|haiku-5)/;
const MAX_OUT = 8000;

class AiError extends Error {
  constructor(status) { super('ai_http_' + status); this.status = status; }
}

async function callOpenAi(p, req, fetchImpl, noFormat = false) {
  const { key, model, system, messages, schema } = req;
  const body = { model, messages: [{ role: 'system', content: system }, ...messages], [p.maxKey || 'max_tokens']: MAX_OUT };
  if (!noFormat) body.response_format = p.fmt === 'schema' ? { type: 'json_schema', json_schema: { name: 'otour_reply', schema, strict: true } } : { type: 'json_object' };
  let res;
  try {
    res = await fetchImpl(p.base + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (e) { throw new AiError(0); } // mạng / quá giờ
  // json_object: vài model (OpenRouter, Gemini cũ…) không nhận tham số này (400) – gọi lại một lần không kèm nó; lời dặn
  // hệ thống vẫn bảo trả đúng một object JSON
  if (res.status === 400 && p.fmt === 'object' && !noFormat) return callOpenAi(p, req, fetchImpl, true);
  if (!res.ok) throw new AiError(res.status);
  let data;
  try { data = await res.json(); } catch (e) { throw new AiError(502); }
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) throw new AiError(502);
  if (msg.refusal) return { text: '', refused: true };
  return { text: typeof msg.content === 'string' ? msg.content : '', refused: false };
}

const newAnthropic = (key) => {
  const A = require('@anthropic-ai/sdk');
  const Anthropic = A.default || A.Anthropic || A;
  return new Anthropic({ apiKey: key, timeout: TIMEOUT, maxRetries: 1 });
};
// Chỉ giữ lại client của khoá MÁY CHỦ; khoá riêng của người dùng (own) tạo client cho từng lần rồi bỏ – không nằm lại
// trong bộ nhớ máy chủ
let anthropicCache = null;
function anthropicClient(key, own) {
  if (own) return newAnthropic(key);
  if (!anthropicCache || anthropicCache.key !== key) anthropicCache = { key, client: newAnthropic(key) };
  return anthropicCache.client;
}

async function callAnthropic({ key, model, system, messages, schema, own }, make) {
  const client = make ? make(key) : anthropicClient(key, own);
  let res;
  try {
    // Người dùng có thể chọn model Claude đời cũ: chỉ gửi fallbacks / effort cho model nhận chúng (không thì API trả 400)
    const fb = FALLBACK_MODELS.test(model), eff = EFFORT_MODELS.test(model);
    res = await client.beta.messages.create({
      model,
      max_tokens: MAX_OUT,
      ...(fb ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}), // bị bộ lọc an toàn từ chối: chạy lại trên model dự phòng
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      output_config: { ...(eff ? { effort: process.env.OTOUR_AI_EFFORT || 'medium' } : {}), format: { type: 'json_schema', schema } },
      messages,
    });
  } catch (e) { throw new AiError((e && e.status) || 0); }
  if (res.stop_reason === 'refusal') return { text: '', refused: true };
  return { text: (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''), refused: false };
}

async function callAi(req, deps = {}) {
  const p = PROVIDERS[req.provider];
  if (!p) throw new AiError(400);
  if (p.api === 'anthropic') return callAnthropic(req, deps.anthropic);
  return callOpenAi(p, req, deps.fetch || fetch);
}

/** Lấy object JSON từ lời đáp (nhà cung cấp chỉ bảo đảm json_object có thể bọc trong ```json … ``` hoặc thêm chữ). */
function parseReply(text) {
  const s = String(text || '').trim();
  try { return JSON.parse(s); } catch (e) { /* thử cắt phần JSON */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { /* hỏng thật */ } }
  return null;
}

module.exports = { callAi, parseReply, AiError, TIMEOUT };
