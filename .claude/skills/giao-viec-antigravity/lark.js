#!/usr/bin/env node
/*
 * Gửi một tin vào nhóm Lark chung (người dùng + Claude Code + Antigravity) qua webhook bot tuỳ chỉnh.
 *   node .claude/skills/giao-viec-antigravity/lark.js "Đã giao Issue #50 cho Antigravity"
 *   node .claude/skills/giao-viec-antigravity/lark.js --duyet "PR #52 cần bạn duyệt: …"   (tag cả nhóm = tag người dùng)
 *
 * Link webhook là bí mật (ai có link cũng gửi được vào nhóm): KHÔNG ghi vào repo, chỉ đọc từ biến môi trường
 *   LARK_WEBHOOK_URL   (bắt buộc)
 *   LARK_SECRET        (tuỳ chọn – khi bot bật "Signature verification")
 * Webhook chỉ GỬI được, không đọc được tin trong nhóm: việc cần trả lời vẫn đi qua Issue / PR trên GitHub.
 */
'use strict';
const crypto = require('crypto');

const args = process.argv.slice(2);
const duyet = args[0] === '--duyet';
const text = (duyet ? args.slice(1) : args).join(' ').trim();
const url = process.env.LARK_WEBHOOK_URL;
if (!url) { console.error('Thiếu biến môi trường LARK_WEBHOOK_URL'); process.exit(2); }
if (!text) { console.error('Cách dùng: lark.js [--duyet] "<nội dung>"'); process.exit(2); }

const body = { msg_type: 'text', content: { text: (duyet ? '<at user_id="all">Mọi người</at> ' : '') + text } };
if (process.env.LARK_SECRET) {
  // Ký theo tài liệu Lark: khoá HMAC-SHA256 = "<timestamp>\n<secret>", nội dung rỗng, kết quả base64
  const timestamp = String(Math.floor(Date.now() / 1000));
  body.timestamp = timestamp;
  body.sign = crypto.createHmac('sha256', `${timestamp}\n${process.env.LARK_SECRET}`).update('').digest('base64');
}

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then((r) => r.json())
  .then((j) => {
    if (j.code !== 0) { console.error('Lark từ chối:', JSON.stringify(j)); process.exit(1); }
    console.log('Đã gửi Lark');
  })
  .catch((e) => { console.error('Gửi Lark lỗi:', e.message); process.exit(1); });
