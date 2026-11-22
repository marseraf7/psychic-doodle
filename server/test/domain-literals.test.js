// Tên miền chính chỉ được ghi thẳng ở các file trong scripts/domain-files.js; scripts/set-domain.js đổi được hết bằng một lệnh.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DEFAULT_HOST } = require('../src/site.js');
const { REPLACE, ADD, keep } = require('../../scripts/domain-files.js');
const SD = require('../../scripts/set-domain.js');

const ROOT = path.resolve(__dirname, '..', '..');

function tracked() {
  try { return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); } catch (e) { return null; }
}

test('tên miền chính chỉ nằm ở các file đã khai (REPLACE / ADD / KEEP), và file đã khai đều còn chứa nó', (t) => {
  const files = tracked();
  if (!files) return t.skip('không có git');
  const listed = new Set([...REPLACE, ...ADD]);
  const stray = files.filter((f) => fs.existsSync(path.join(ROOT, f)) && !listed.has(f) && !keep(f)
    && !/\.(png|jpe?g|webp|woff2?|wasm|gz|lz4|bin|ico|jar|keystore)$/i.test(f)
    && fs.readFileSync(path.join(ROOT, f), 'utf8').includes(DEFAULT_HOST));
  assert.deepStrictEqual(stray, [], 'đọc tên miền từ server/src/site.js, hoặc thêm file vào scripts/domain-files.js');
  for (const f of listed) assert.ok(fs.readFileSync(path.join(ROOT, f), 'utf8').includes(DEFAULT_HOST), f + ' không còn chứa tên miền – bỏ khỏi danh sách');
});

test('set-domain.js: đổi hết tên miền + ui.domain, giữ link sâu cũ, tăng CACHE; chạy lại không đổi gì', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-domain-'));
  for (const f of [...REPLACE, ...ADD, 'caro/sw.js']) {
    fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  }
  const cache = (s) => Number(/const CACHE = 'caro-v(\d+)'/.exec(s)[1]);
  const swBefore = cache(fs.readFileSync(path.join(tmp, 'caro/sw.js'), 'utf8'));
  assert.throws(() => SD.run({ root: tmp, host: 'not a domain' }), /không hợp lệ/);
  const dry = SD.run({ root: tmp, host: 'caro-test.example', dryRun: true });
  assert.ok(dry.changed.length > 0);
  assert.strictEqual(SD.currentHost(tmp), DEFAULT_HOST, '--dry-run không ghi');
  const r = SD.run({ root: tmp, host: 'https://Caro-Test.example/' });
  assert.strictEqual(r.from, DEFAULT_HOST);
  assert.strictEqual(r.to, 'caro-test.example');
  assert.strictEqual(SD.currentHost(tmp), 'caro-test.example');
  for (const f of REPLACE) {
    const s = fs.readFileSync(path.join(tmp, f), 'utf8');
    assert.ok(!s.includes(DEFAULT_HOST) && s.includes('caro-test.example'), f);
    assert.ok(!s.includes(SD.uiHash(DEFAULT_HOST)), f + ': mã ui.domain cũ');
  }
  const sub = fs.readFileSync(path.join(tmp, 'docs/claude-directory/SUBMISSION.md'), 'utf8');
  assert.ok(sub.includes(SD.uiHash('caro-test.example')), 'mã ui.domain mới');
  for (const f of ADD) {
    const s = fs.readFileSync(path.join(tmp, f), 'utf8');
    assert.ok(s.includes(DEFAULT_HOST) && s.includes('caro-test.example'), f + ': giữ tên cũ, thêm tên mới');
  }
  assert.strictEqual(cache(fs.readFileSync(path.join(tmp, 'caro/sw.js'), 'utf8')), swBefore + 1);
  assert.deepStrictEqual(SD.run({ root: tmp, host: 'caro-test.example' }).changed, [], 'chạy lại: không đổi');
  assert.strictEqual(SD.addHost('a x.org b', 'x.org', 'y.org'), 'a x.org b\na y.org b');
  assert.strictEqual(SD.addHost('x.org y.org', 'x.org', 'y.org'), 'x.org y.org', 'đã có thì thôi');
  fs.rmSync(tmp, { recursive: true, force: true });
});
