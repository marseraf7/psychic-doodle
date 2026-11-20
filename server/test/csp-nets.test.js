/*
 * I-11 (rà soát bảo mật 20/11/2026): CSP connect-src chỉ mở đúng thư mục mạng Rapfi ở commit đã ghim, không mở cả origin
 * cdn.jsdelivr.net / raw.githubusercontent.com. Danh sách ở server/src/csp-nets.js phải khớp nguồn tải trong
 * caro/rapfi/worker.js (NETS_COMMIT, REPOS) và commit ghim trong server/deploy/update.sh – lệch là BOAT không tải được mạng.
 * Chạy: npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { NETS_COMMIT, REPOS, rapfiNetSources } = require('../src/csp-nets.js');
const { CSP } = require('../src/web.js');

const ROOT = path.join(__dirname, '..', '..');
const worker = fs.readFileSync(path.join(ROOT, 'caro', 'rapfi', 'worker.js'), 'utf8');

test('csp-nets khớp NETS_COMMIT / REPOS của caro/rapfi/worker.js và commit ghim của update.sh', () => {
  assert.strictEqual(/const NETS_COMMIT = '([0-9a-f]{40})'/.exec(worker)[1], NETS_COMMIT);
  assert.deepStrictEqual(JSON.parse(/const REPOS = (\[[^\]]*\]);/.exec(worker)[1].replace(/'/g, '"')), REPOS);
  const upd = fs.readFileSync(path.join(ROOT, 'server', 'deploy', 'update.sh'), 'utf8');
  assert.ok(upd.includes(`rapfi-networks/${NETS_COMMIT}/mix9svq`), 'update.sh tải đúng commit đã ghim');
});

test('CSP connect-src: không mở cả origin CDN; mọi URL tải mạng của worker.js đều nằm trong một nguồn được phép', () => {
  const connect = CSP.split('; ').find((d) => d.startsWith('connect-src')).split(' ').slice(1);
  assert.ok(!connect.includes('https://cdn.jsdelivr.net'), 'không còn mở cả cdn.jsdelivr.net');
  assert.ok(!connect.includes('https://raw.githubusercontent.com'), 'không còn mở cả raw.githubusercontent.com');
  for (const src of rapfiNetSources().split(' ')) assert.ok(connect.includes(src), src);
  // Dựng lại đúng các URL worker.js gọi (hàm sources) rồi so theo luật tiền tố đường dẫn của CSP
  const files = ['mix9svqfreestyle_bsmix.bin.lz4', 'mix9svqrenju_bs15_white.bin.lz4'];
  for (const f of files) {
    const urls = [
      ...REPOS.map((r) => `https://cdn.jsdelivr.net/gh/${r}@${NETS_COMMIT}/mix9svq/${f}`),
      ...REPOS.map((r) => `https://raw.githubusercontent.com/${r}/${NETS_COMMIT}/mix9svq/${f}`),
    ];
    for (const u of urls) {
      assert.ok(connect.some((s) => s.endsWith('/') && u.startsWith(s)), 'CSP cho phép ' + u);
      assert.ok(worker.includes('https://cdn.jsdelivr.net/gh/${r}@${NETS_COMMIT}/mix9svq/${f}'), 'worker.js vẫn dựng URL như trên');
    }
  }
  // URL khác trên cùng CDN (kênh đưa dữ liệu ra ngoài) không khớp nguồn nào
  for (const u of ['https://cdn.jsdelivr.net/gh/evil/x@1/a', 'https://raw.githubusercontent.com/evil/x/main/a',
    `https://cdn.jsdelivr.net/gh/marseraf7/rapfi-networks@${NETS_COMMIT}/other/x`]) {
    assert.ok(!connect.some((s) => (s.endsWith('/') ? u.startsWith(s) : u === s || u.startsWith(s + '/'))), u);
  }
});
