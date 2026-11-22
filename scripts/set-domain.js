#!/usr/bin/env node
/*
 * Đổi tên miền chính của game bằng một lệnh (docs/doi-ten-mien.md):
 *   node scripts/set-domain.js <tên-miền-mới> [--dry-run]      (hoặc: bash scripts/set-domain.sh <tên-miền-mới>)
 * Sửa đúng các file trong scripts/domain-files.js:
 *   REPLACE – thay tên cũ (DEFAULT_HOST trong server/src/site.js) bằng tên mới, kèm mã ui.domain của connector MCP
 *             (SHA-256 của https://<tên>/mcp – server/src/mcp/widget.js);
 *   ADD     – link sâu của app Android / iOS: thêm tên mới, giữ tên cũ (link cũ đã gửi đi vẫn mở app);
 *   rồi tăng CACHE trong caro/sw.js (đổi file trong caro/ – CLAUDE.md).
 * Chỉ sửa mã nguồn; máy chủ thật đổi bằng server/deploy/move-domain.sh (biến môi trường + Caddy).
 * Dùng như thư viện (bài thử): run({ root, host, dryRun }) → { from, to, changed: [file…] }.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPLACE, ADD } = require('./domain-files.js');

const ROOT = path.resolve(__dirname, '..');
const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Tên máy đứng riêng (không phải một phần của tên dài hơn, vd. www.<tên> vẫn khớp nhưng <tên>x thì không). */
const hostRe = (h) => new RegExp(`(?<![a-z0-9-])${esc(h)}(?![a-z0-9-])`, 'g');
const uiHash = (h) => crypto.createHash('sha256').update(`https://${h}/mcp`).digest('hex').slice(0, 32);

/** Tên miền hiện tại: dòng DEFAULT_HOST của server/src/site.js. */
function currentHost(root) {
  const m = /const DEFAULT_HOST = '([^']+)'/.exec(fs.readFileSync(path.join(root, 'server/src/site.js'), 'utf8'));
  if (!m) throw new Error('server/src/site.js thiếu dòng DEFAULT_HOST');
  return m[1];
}

/** Link sâu: thêm dòng cho tên mới ngay sau mỗi dòng của tên cũ (chưa có thì thôi). */
function addHost(text, from, to) {
  if (text.includes(to)) return text;
  return text.split('\n').map((line) => (hostRe(from).test(line) ? line + '\n' + line.replace(hostRe(from), to) : line)).join('\n');
}

function run({ root = ROOT, host, dryRun = false } = {}) {
  const to = String(host || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!HOST_RE.test(to)) throw new Error('Tên miền không hợp lệ: ' + host + ' (ví dụ: caro.example.com)');
  const from = currentHost(root);
  const changed = [];
  if (from === to) return { from, to, changed };
  const write = (rel, before, after) => {
    if (before === after) return;
    changed.push(rel);
    if (!dryRun) fs.writeFileSync(path.join(root, rel), after);
  };
  for (const rel of REPLACE) {
    const before = fs.readFileSync(path.join(root, rel), 'utf8');
    write(rel, before, before.replace(hostRe(from), to).split(uiHash(from)).join(uiHash(to)));
  }
  for (const rel of ADD) {
    const before = fs.readFileSync(path.join(root, rel), 'utf8');
    write(rel, before, addHost(before, from, to));
  }
  if (changed.some((f) => f.startsWith('caro/'))) {
    const sw = path.join(root, 'caro/sw.js');
    const before = fs.readFileSync(sw, 'utf8');
    write('caro/sw.js', before, before.replace(/const CACHE = 'caro-v(\d+)';/, (m, n) => `const CACHE = 'caro-v${Number(n) + 1}';`));
  }
  return { from, to, changed };
}

/* c8 ignore start */
if (require.main === module) {
  const args = process.argv.slice(2);
  const host = args.find((a) => !a.startsWith('--'));
  try {
    const r = run({ host, dryRun: args.includes('--dry-run') });
    if (r.from === r.to) console.log(`Tên miền đã là ${r.to} – không đổi gì.`);
    else console.log(`${args.includes('--dry-run') ? '(thử) ' : ''}${r.from} → ${r.to}\n  ` + r.changed.join('\n  ')
      + '\nTiếp theo: cd server && npm test; xem docs/doi-ten-mien.md (DNS, Caddy, biến môi trường, app, Claude Directory).');
  } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
/* c8 ignore stop */

module.exports = { run, currentHost, addHost, uiHash, HOST_RE };
