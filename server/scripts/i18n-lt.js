#!/usr/bin/env node
/*
 * Soát chính tả – ngữ pháp chuỗi giao diện bằng LanguageTool (mã nguồn mở, LGPL; có tiếng Anh, Nga, Trung – chưa có
 * tiếng Việt: tiếng Việt soát bằng bài thử server/test/i18n-quality.test.js + bảng thuật ngữ docs/van-phong-4-ngon-ngu.md).
 *   node server/scripts/i18n-lt.js [en,ru,zh] [--out báo-cáo.md] [--server https://api.languagetool.org]
 * Mặc định gọi máy chủ công khai api.languagetool.org (miễn phí: ≤ 20 lần / phút, ≤ 20 KB / lần) – tự chia nhỏ và
 * chờ giữa các lần. Chạy LanguageTool riêng (docker / java) thì truyền --server http://localhost:8010.
 * Chỉ gửi chuỗi giao diện (đã công khai trong repo), không gửi dữ liệu người dùng.
 */
'use strict';
const fs = require('fs');
const { loadAll } = require('./i18n-load.js');

const CODE = { en: 'en-US', ru: 'ru-RU', zh: 'zh-CN' };
// Bỏ các quy tắc không hợp với chuỗi giao diện ngắn (nhãn nút không cần viết hoa đầu câu / dấu chấm cuối…)
const OFF = ['UPPERCASE_SENTENCE_START', 'PUNCTUATION_PARAGRAPH_END', 'WHITESPACE_RULE', 'DASH_RULE', 'EN_QUOTES', 'COMMA_PARENTHESIS_WHITESPACE',
  'ARROWS', 'MULTIPLICATION_SIGN', 'PLUS_MINUS', 'DOUBLE_PUNCTUATION', 'EN_UNPAIRED_BRACKETS', 'UNPAIRED_BRACKETS', 'RU_UNPAIRED_BRACKETS',
  'Cap_Letters_Name', 'TOO_LONG_SENTENCE', 'SENTENCE_WHITESPACE'];
// Tên riêng / thuật ngữ cờ – không báo sai chính tả
const NAMES = /^(Caro|Gomoku|Renju|Glicko|Lichess|Challonge|MyLeague|Rapfi|Buchholz|Sonneborn|Berger|Koya|FIDE|Elo|Bo\d+|Swiss|PDF|PNG|URL|API|Muse|Gemini|DeepSeek|OpenRouter|Anthropic|OpenAI|Zalo|Messenger|Gomocup|VCF|VCT|NNUE|ARO|TPR|APRO|SB|BH)/;

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const langs = (args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) || 'en,ru,zh').split(',');
const SERVER = opt('--server', 'https://api.languagetool.org').replace(/\/+$/, '');
const OUT = opt('--out', null);
const LIMIT = 15000; // byte mỗi lần (dưới 20 KB)
const WAIT = SERVER.includes('api.languagetool.org') ? 4000 : 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Gom chuỗi thành từng khối ≤ LIMIT, nhớ vị trí bắt đầu của mỗi khoá. */
function chunks(dict) {
  const out = [];
  let cur = { text: '', spans: [] };
  for (const [k, s0] of Object.entries(dict)) {
    const s = s0.replace(/\{(\w+)\}/g, 'X').replace(/\n/g, ' '); // {name} → X: không báo lỗi ở chỗ biến
    if (Buffer.byteLength(cur.text + s) > LIMIT && cur.text) { out.push(cur); cur = { text: '', spans: [] }; }
    cur.spans.push({ k, at: cur.text.length, len: s.length, s });
    cur.text += s + '\n\n';
  }
  if (cur.text) out.push(cur);
  return out;
}

async function check(lang, text) {
  const body = new URLSearchParams({ text, language: CODE[lang], disabledRules: OFF.join(','), level: 'default' });
  for (let n = 0; n < 4; n++) {
    const res = await fetch(SERVER + '/v2/check', { method: 'POST', body, signal: AbortSignal.timeout(60000) }).catch(() => null);
    if (res && res.ok) return (await res.json()).matches || [];
    await sleep(15000 * (n + 1)); // quá giới hạn / mạng chập chờn: chờ rồi thử lại
  }
  throw new Error('LanguageTool không trả lời');
}

(async () => {
  const { merged } = loadAll();
  const lines = ['# Soát LanguageTool – ' + new Date().toISOString().slice(0, 10), ''];
  for (const lang of langs) {
    if (!CODE[lang]) continue;
    const found = [];
    const list = chunks(merged[lang]);
    for (const [n, c] of list.entries()) {
      process.stderr.write(`${lang} ${n + 1}/${list.length}\r`);
      for (const m of await check(lang, c.text)) {
        const sp = c.spans.find((x) => m.offset >= x.at && m.offset < x.at + x.len);
        if (!sp) continue;
        const word = sp.s.substr(m.offset - sp.at, m.length);
        if (m.rule.issueType === 'misspelling' && NAMES.test(word)) continue;
        found.push({ k: sp.k, word, msg: m.message, fix: (m.replacements || []).slice(0, 3).map((r) => r.value), rule: m.rule.id, s: sp.s });
      }
      if (WAIT) await sleep(WAIT);
    }
    lines.push(`## ${lang} – ${found.length} chỗ`, '');
    for (const f of found) lines.push(`- \`${f.k}\` «${f.word}» – ${f.msg}${f.fix.length ? ' → ' + f.fix.join(' / ') : ''} (${f.rule})\n  > ${f.s}`);
    lines.push('');
  }
  const report = lines.join('\n');
  if (OUT) fs.writeFileSync(OUT, report); else process.stdout.write(report + '\n');
})().catch((e) => { console.error(e.message); process.exit(1); });
