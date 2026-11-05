/*
 * Giải đấu Offline – trợ lý AI tạo giải (docs/de-xuat-giai-offline.md mục 6): người dùng tả giải bằng lời ("giải bóng đá
 * 16 đội, 4 bảng, nhất nhì vào tứ kết"), máy chủ hỏi Claude (Anthropic API, SDK chính thức @anthropic-ai/sdk) và trả lại
 * lời đáp + bản cấu hình JSON (đúng lược đồ caro/otour-spec-io.js – SCHEMA); form tạo giải xem trước bằng lời rồi người
 * dùng bấm "Dùng cấu hình này". AI chỉ viết cấu hình – không tạo giải, không thấy dữ liệu của ai.
 *
 * Khoá API (bí mật – không ghi log, không gửi xuống trình duyệt, không đưa vào repo): biến môi trường ANTHROPIC_API_KEY,
 * hoặc file DATA_DIR/anthropic-key (server.js đặt otAiKeyFile). Không có khoá → tính năng tắt (otAiInfo: on = false).
 * Chi phí có trần: mỗi tài khoản OTOUR_AI_USER_DAY lượt / ngày (mặc định 20), cả máy chủ OTOUR_AI_DAY lượt / ngày (mặc
 * định 100), mỗi người một yêu cầu một lúc, hội thoại tối đa MAX_TURNS lượt, mỗi tin tối đa MAX_CHARS ký tự.
 * Model: OTOUR_AI_MODEL (mặc định claude-opus-5-5), effort OTOUR_AI_EFFORT (mặc định medium). Bị bộ lọc an toàn từ chối
 * thì để Anthropic tự chạy lại trên model dự phòng (fallbacks: "default").
 *   on_otAiInfo  → { t: 'otAiInfo', on, left }
 *   on_otAi      { messages: [{ role: 'user' | 'assistant', text }], spec? } → { t: 'otAi', reply, spec | null, specError }
 */
'use strict';
const fs = require('fs');
const { E } = require('../msg.js');
const { uidOf } = require('./shared.js');
const IO = require('../../../caro/otour-spec-io.js');

const MAX_TURNS = 12;
const MAX_CHARS = 2000;
const DAY = 86400000;
const num = (v, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? n : d; };

// Lời đáp có cấu trúc (structured outputs): lời nhắn cho người dùng + cấu hình dạng chuỗi JSON (chuỗi rỗng nếu chưa có)
const OUT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Lời đáp ngắn cho người dùng, cùng ngôn ngữ với người dùng' },
    spec_json: { type: 'string', description: 'Bản cấu hình giải dạng JSON đúng lược đồ, hoặc chuỗi rỗng nếu còn phải hỏi thêm' },
  },
  required: ['reply', 'spec_json'],
  additionalProperties: false,
};

let systemCache = null;
/** Lời dặn hệ thống: vai trò + lược đồ + vài ví dụ (cố định – đặt cache_control để các lần hỏi sau rẻ hơn). */
function systemPrompt() {
  if (systemCache) return systemCache;
  const TP = require('../../../caro/otour-templates.js'), { SPORTS } = require('../../../caro/otour-sports.js');
  const examples = TP.TEMPLATES.slice(0, 6).map((x) => `- ${x.id} (${x.n} đội): ${JSON.stringify(TP.specOf(x, SPORTS))}`).join('\n');
  systemCache = [
    'Bạn là trợ lý tạo cấu hình giải đấu thể thao offline cho ứng dụng Caro x Gomoku.',
    'Người dùng tả giải bằng lời; bạn viết bản cấu hình JSON đúng lược đồ dưới đây (chỉ dùng các trường có trong lược đồ).',
    'Nếu thiếu thông tin quan trọng (bộ môn, số đội, thể thức) thì hỏi lại ngắn gọn và để spec_json là chuỗi rỗng; còn lại thì tự chọn giá trị hợp lý và nói rõ trong reply.',
    'Không tự đặt tên đội, không hứa tạo giải – người dùng xem trước rồi tự bấm tạo. Trả lời cùng ngôn ngữ với người dùng, ngắn gọn.',
    'Nếu tin nhắn có kèm cấu hình hiện tại của form thì sửa từ cấu hình đó.',
    '',
    'Lược đồ JSON:',
    JSON.stringify(IO.SCHEMA),
    '',
    'Ví dụ cấu hình các giải nổi tiếng:',
    examples,
  ].join('\n');
  return systemCache;
}

class OTourAi {
  /** Khoá API (đọc mỗi lần – đổi file không cần khởi động lại); không có → null. */
  otAiKey() {
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
    try { return this.otAiKeyFile ? fs.readFileSync(this.otAiKeyFile, 'utf8').trim() || null : null; } catch (e) { return null; }
  }

  /** Client Anthropic (bài thử thay bằng otAiClient giả). */
  otAiApi() {
    if (this.otAiClient) return this.otAiClient;
    const key = this.otAiKey();
    if (!key) return null;
    if (!this.otAiReal || this.otAiReal.key !== key) {
      const A = require('@anthropic-ai/sdk');
      const Anthropic = A.default || A.Anthropic || A;
      this.otAiReal = { key, client: new Anthropic({ apiKey: key, timeout: 90000, maxRetries: 1 }) };
    }
    return this.otAiReal.client;
  }

  /** Đếm lượt trong ngày: { day, all, users: Map } – sang ngày mới thì đặt lại. */
  otAiCount() {
    const day = Math.floor(Date.now() / DAY);
    if (!this.otAiUse || this.otAiUse.day !== day) this.otAiUse = { day, all: 0, users: new Map(), busy: new Set() };
    return this.otAiUse;
  }

  otAiLimits() {
    return { user: num(process.env.OTOUR_AI_USER_DAY, 20), all: num(process.env.OTOUR_AI_DAY, 100) };
  }

  on_otAiInfo(conn) {
    const uid = uidOf(conn.pid);
    const me = uid ? this.store.users.get(uid) : null;
    const on = !!(this.otAiClient || this.otAiKey());
    const c = this.otAiCount(), lim = this.otAiLimits();
    const left = me ? Math.max(0, Math.min(lim.user - (c.users.get(me.id) || 0), lim.all - c.all)) : 0;
    conn.send({ t: 'otAiInfo', on, left, login: !!me });
  }

  async on_otAi(conn, { messages, spec }) {
    const me = this.requireUser(conn);
    const api = this.otAiApi();
    if (!api) throw E('ot_ai_off');
    if (!Array.isArray(messages) || !messages.length || messages.length > MAX_TURNS) throw E('bad_message');
    const msgs = [];
    for (const m of messages) {
      const role = m && m.role === 'assistant' ? 'assistant' : 'user';
      const text = String((m && m.text) || '').slice(0, MAX_CHARS).trim();
      if (!text) throw E('bad_message');
      msgs.push({ role, content: text });
    }
    if (msgs[0].role !== 'user' || msgs[msgs.length - 1].role !== 'user') throw E('bad_message');
    // Cấu hình đang có trên form (để AI sửa tiếp): gắn vào tin cuối, cắt cho gọn
    if (spec && typeof spec === 'object') {
      const cur = JSON.stringify(spec).slice(0, 6000);
      msgs[msgs.length - 1].content += `\n\n[Cấu hình hiện tại của form]\n${cur}`;
    }
    const c = this.otAiCount(), lim = this.otAiLimits();
    if (c.busy.has(me.id)) throw E('ot_ai_busy');
    if ((c.users.get(me.id) || 0) >= lim.user || c.all >= lim.all) throw E('ot_ai_limit');
    c.busy.add(me.id);
    c.users.set(me.id, (c.users.get(me.id) || 0) + 1);
    c.all++;
    let res;
    try {
      res = await api.beta.messages.create({
        model: process.env.OTOUR_AI_MODEL || 'claude-opus-5-5',
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // bộ lọc an toàn từ chối thì chạy lại trên model dự phòng Anthropic khuyên dùng
        system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
        output_config: { effort: process.env.OTOUR_AI_EFFORT || 'medium', format: { type: 'json_schema', schema: OUT_SCHEMA } },
        messages: msgs,
      });
    } catch (e) {
      // Không đưa nội dung lỗi của API xuống trình duyệt (có thể nhắc tới khoá / tài khoản) – chỉ mã lỗi chung
      console.error('[otour-ai]', e && e.status, e && e.name);
      throw E(e && e.status === 429 ? 'ot_ai_limit' : 'ot_ai_failed');
    } finally {
      c.busy.delete(me.id);
    }
    if (res.stop_reason === 'refusal') throw E('ot_ai_refused');
    const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    let out;
    try { out = JSON.parse(text); } catch (e) { throw E('ot_ai_failed'); }
    const reply = String(out.reply || '').slice(0, 4000);
    let sp = null, specError = null;
    if (out.spec_json && String(out.spec_json).trim()) {
      const r = IO.parseSpec(String(out.spec_json));
      if (r.error) specError = r.error; else sp = r.spec;
    }
    conn.send({ t: 'otAi', reply, spec: sp, specError });
  }
}

module.exports = { OTourAi, OUT_SCHEMA, systemPrompt, MAX_TURNS, MAX_CHARS };
