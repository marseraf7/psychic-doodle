/*
 * Giải đấu Offline – trợ lý AI tạo giải (docs/de-xuat-giai-offline.md mục 6): người dùng tả giải bằng lời ("giải bóng đá
 * 16 đội, 4 bảng, nhất nhì vào tứ kết"), máy chủ hỏi một mô hình AI và trả lại lời đáp + bản cấu hình JSON (đúng lược đồ
 * caro/otour-spec-io.js – SCHEMA); form tạo giải xem trước bằng lời rồi người dùng bấm "Dùng cấu hình này". AI chỉ viết
 * cấu hình – không tạo giải, không thấy dữ liệu của ai. Gọi nhà cung cấp: otour-ai-call.js (danh sách cố định
 * caro/otour-ai-providers.js).
 *
 * Hai cách dùng:
 *   1. AI của máy chủ – mặc định Muse Spark (Meta, rẻ). Khoá bí mật (không ghi log, không gửi xuống trình duyệt, không
 *      đưa vào repo): biến MODEL_API_KEY hoặc file DATA_DIR/muse-key; muốn dùng Claude thì ANTHROPIC_API_KEY hoặc file
 *      DATA_DIR/anthropic-key. Có cả hai thì OTOUR_AI_PROVIDER (muse | anthropic) chọn, mặc định muse. Không có khoá →
 *      tắt. Chi phí có trần: mỗi tài khoản OTOUR_AI_USER_DAY lượt / ngày (mặc định 20), cả máy chủ OTOUR_AI_DAY (mặc
 *      định 100). Model: OTOUR_AI_MODEL (mặc định theo nhà cung cấp).
 *   2. Khoá riêng của người dùng (own: { provider, key, model? }) – người dùng tự trả tiền cho nhà cung cấp mình chọn.
 *      Khoá đi kèm từng lần hỏi, máy chủ chỉ dùng cho đúng lần gọi đó: không lưu, không ghi log, không giữ client. Không
 *      tính vào trần của máy chủ; vẫn giới hạn OTOUR_AI_OWN_DAY lượt / tài khoản / ngày (mặc định 200) cho máy chủ đỡ tải.
 * Chung: chỉ người có tài khoản; mỗi người một yêu cầu một lúc; hội thoại tối đa MAX_TURNS lượt, mỗi tin MAX_CHARS ký tự.
 *   on_otAiInfo  → { t: 'otAiInfo', on, left, login, provider }
 *   on_otAi      { messages: [{ role, text }], spec?, own? } → { t: 'otAi', reply, spec | null, specError }
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { E } = require('../msg.js');
const { uidOf } = require('./shared.js');
const IO = require('../../../caro/otour-spec-io.js');
const { PROVIDERS, cleanModel, keyOk } = require('../../../caro/otour-ai-providers.js');
const { callAi, parseReply } = require('./otour-ai-call.js');

const MAX_TURNS = 12;
const MAX_CHARS = 2000;
const DAY = 86400000;
const num = (v, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? n : d; };

// Lời đáp có cấu trúc: lời nhắn cho người dùng + cấu hình dạng chuỗi JSON (chuỗi rỗng nếu chưa có)
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
/** Lời dặn hệ thống: vai trò + dạng lời đáp + lược đồ + vài ví dụ (cố định – nhà cung cấp có cache thì các lần sau rẻ hơn). */
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
    'Luôn trả lời bằng đúng một object JSON, không thêm chữ nào khác: {"reply": "<lời đáp>", "spec_json": "<cấu hình JSON dạng chuỗi, hoặc chuỗi rỗng>"}.',
    '',
    'Lược đồ JSON của cấu hình:',
    JSON.stringify(IO.SCHEMA),
    '',
    'Ví dụ cấu hình các giải nổi tiếng:',
    examples,
  ].join('\n');
  return systemCache;
}

const readKey = (file) => { try { return file ? fs.readFileSync(file, 'utf8').trim() || null : null; } catch (e) { return null; } };

class OTourAi {
  /**
   * AI của máy chủ: { provider, key } hoặc null (đọc mỗi lần – đặt / xoá file khoá không cần khởi động lại).
   * otAiKeyDir: DATA_DIR (server.js đặt).
   */
  otAiServer() {
    const dir = this.otAiKeyDir;
    const keys = {
      muse: process.env.MODEL_API_KEY || readKey(dir && path.join(dir, 'muse-key')),
      anthropic: process.env.ANTHROPIC_API_KEY || readKey(dir && path.join(dir, 'anthropic-key')),
    };
    const want = process.env.OTOUR_AI_PROVIDER;
    const provider = PROVIDERS[want] && keys[want] ? want : keys.muse ? 'muse' : keys.anthropic ? 'anthropic' : null;
    return provider ? { provider, key: keys[provider] } : null;
  }

  /** Gọi AI (bài thử thay bằng otAiCall giả). */
  otAiCallFn() { return this.otAiCall || callAi; }

  /** Đếm lượt trong ngày – sang ngày mới thì đặt lại. */
  otAiCount() {
    const day = Math.floor(Date.now() / DAY);
    if (!this.otAiUse || this.otAiUse.day !== day) this.otAiUse = { day, all: 0, users: new Map(), own: new Map(), busy: new Set() };
    return this.otAiUse;
  }

  otAiLimits() {
    return { user: num(process.env.OTOUR_AI_USER_DAY, 20), all: num(process.env.OTOUR_AI_DAY, 100), own: num(process.env.OTOUR_AI_OWN_DAY, 200) };
  }

  on_otAiInfo(conn) {
    const uid = uidOf(conn.pid);
    const me = uid ? this.store.users.get(uid) : null;
    const srv = this.otAiServer();
    const c = this.otAiCount(), lim = this.otAiLimits();
    const left = me && srv ? Math.max(0, Math.min(lim.user - (c.users.get(me.id) || 0), lim.all - c.all)) : 0;
    conn.send({ t: 'otAiInfo', on: !!srv, provider: srv ? srv.provider : null, left, login: !!me });
  }

  /** Chuẩn hoá hội thoại: [{ role, content }], bắt đầu và kết thúc bằng tin của người dùng. */
  otAiMessages(messages, spec) {
    if (!Array.isArray(messages) || !messages.length || messages.length > MAX_TURNS) throw E('bad_message');
    const msgs = messages.map((m) => {
      const text = String((m && m.text) || '').slice(0, MAX_CHARS).trim();
      if (!text) throw E('bad_message');
      return { role: m && m.role === 'assistant' ? 'assistant' : 'user', content: text };
    });
    if (msgs[0].role !== 'user' || msgs[msgs.length - 1].role !== 'user') throw E('bad_message');
    // Cấu hình đang có trên form (để AI sửa tiếp): gắn vào tin cuối, cắt cho gọn
    if (spec && typeof spec === 'object') msgs[msgs.length - 1].content += `\n\n[Cấu hình hiện tại của form]\n${JSON.stringify(spec).slice(0, 6000)}`;
    return msgs;
  }

  async on_otAi(conn, { messages, spec, own }) {
    const me = this.requireUser(conn);
    // Khoá riêng của người dùng hoặc AI của máy chủ
    let target;
    if (own != null) {
      if (typeof own !== 'object' || !PROVIDERS[own.provider] || !keyOk(own.key)) throw E('ot_ai_key_bad');
      target = { provider: own.provider, key: own.key.trim(), model: cleanModel(own.provider, own.model), own: true };
    } else {
      const srv = this.otAiServer();
      if (!srv) throw E('ot_ai_off');
      target = { ...srv, model: cleanModel(srv.provider, process.env.OTOUR_AI_MODEL), own: false };
    }
    const msgs = this.otAiMessages(messages, spec);
    const c = this.otAiCount(), lim = this.otAiLimits();
    if (c.busy.has(me.id)) throw E('ot_ai_busy');
    if (target.own) {
      if ((c.own.get(me.id) || 0) >= lim.own) throw E('ot_ai_limit');
      c.own.set(me.id, (c.own.get(me.id) || 0) + 1);
    } else {
      if ((c.users.get(me.id) || 0) >= lim.user || c.all >= lim.all) throw E('ot_ai_limit');
      c.users.set(me.id, (c.users.get(me.id) || 0) + 1);
      c.all++;
    }
    c.busy.add(me.id);
    let res;
    try {
      res = await this.otAiCallFn()({ ...target, system: systemPrompt(), messages: msgs, schema: OUT_SCHEMA });
    } catch (e) {
      // Không đưa nội dung lỗi của nhà cung cấp xuống trình duyệt, không ghi khoá ra log – chỉ mã lỗi chung
      const st = (e && e.status) || 0;
      if (!target.own) console.error('[otour-ai]', target.provider, st);
      if (target.own && (st === 401 || st === 403)) throw E('ot_ai_key_bad');
      if (st === 429) throw E(target.own ? 'ot_ai_rate' : 'ot_ai_limit');
      throw E('ot_ai_failed');
    } finally {
      c.busy.delete(me.id);
    }
    if (res.refused) throw E('ot_ai_refused');
    const out = parseReply(res.text);
    if (!out || typeof out !== 'object' || Array.isArray(out) || typeof out.reply !== 'string') throw E('ot_ai_failed');
    let sp = null, specError = null;
    const sj = out.spec_json;
    if (sj && (typeof sj === 'object' || String(sj).trim())) {
      // Vài model trả spec_json là object thay vì chuỗi – nhận cả hai
      const r = IO.parseSpec(typeof sj === 'object' ? JSON.stringify(sj) : String(sj));
      if (r.error) specError = r.error; else sp = r.spec;
    }
    conn.send({ t: 'otAi', reply: out.reply.slice(0, 4000), spec: sp, specError });
  }
}

module.exports = { OTourAi, OUT_SCHEMA, systemPrompt, MAX_TURNS, MAX_CHARS };
