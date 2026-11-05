/*
 * Giải đấu Offline – các nhà cung cấp AI cho trợ lý tạo giải (dùng chung trình duyệt + máy chủ: server/src/hub/otour-ai.js).
 * Danh sách CỐ ĐỊNH: máy chủ chỉ gọi đúng các địa chỉ này (người dùng không tự nhập địa chỉ – tránh dùng máy chủ để gọi
 * vào mạng nội bộ). Người dùng chỉ chọn nhà cung cấp, dán khoá API của mình và (tuỳ chọn) tên model.
 *   api:  'openai' – kiểu Chat Completions (POST <base>/chat/completions, Authorization: Bearer <khoá>)
 *         'anthropic' – Claude qua SDK chính thức @anthropic-ai/sdk
 *   fmt:  'schema' – response_format json_schema (kết quả đúng lược đồ); 'object' – json_object (chỉ bảo đảm là JSON)
 *   keyUrl: trang lấy khoá (hiện cho người dùng)
 * Mặc định của máy chủ: Muse Spark của Meta (rẻ: $1,25 / $4,25 mỗi triệu token vào / ra, dev.meta.ai/docs/pricing-rate-limits).
 */
(function (global) {
  'use strict';
  const PROVIDERS = {
    muse: { name: 'Muse Spark (Meta)', api: 'openai', base: 'https://api.meta.ai/v1', model: 'muse-spark-1.3', fmt: 'schema', keyUrl: 'https://dev.meta.ai' },
    anthropic: { name: 'Claude (Anthropic)', api: 'anthropic', base: 'https://api.anthropic.com', model: 'claude-opus-5-5', fmt: 'schema', keyUrl: 'https://platform.claude.com' },
    openai: { name: 'OpenAI', api: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-5-mini', fmt: 'schema', keyUrl: 'https://platform.openai.com/api-keys', maxKey: 'max_completion_tokens' },
    gemini: { name: 'Gemini (Google)', api: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', fmt: 'object', keyUrl: 'https://aistudio.google.com/apikey' },
    deepseek: { name: 'DeepSeek', api: 'openai', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', fmt: 'object', keyUrl: 'https://platform.deepseek.com/api_keys' },
    openrouter: { name: 'OpenRouter', api: 'openai', base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct', fmt: 'object', keyUrl: 'https://openrouter.ai/keys' },
  };
  /** Tên model người dùng gõ: chữ, số, . _ : / - (tối đa 80 ký tự); sai / trống → model mặc định của nhà cung cấp. */
  const cleanModel = (p, m) => (typeof m === 'string' && /^[\w.:\/-]{1,80}$/.test(m.trim()) ? m.trim() : PROVIDERS[p].model);
  /** Khoá API trông hợp lệ (độ dài, không khoảng trắng / ký tự lạ) – kiểm thật là việc của nhà cung cấp. */
  const keyOk = (k) => typeof k === 'string' && /^[\x21-\x7e]{8,300}$/.test(k.trim());

  const api = { PROVIDERS, cleanModel, keyOk };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourAiProviders = api;
})(typeof window !== 'undefined' ? window : globalThis);
