/*
 * I-7 (rà soát bảo mật 20/11/2026): update.sh chỉ nhận mạng Rapfi đúng SHA-256 đã ghim kèm commit (ngoài 4 byte magic
 * LZ4 như trước). Mã băm trong update.sh phải trùng SPEC của caro/rapfi/worker.js (đã đối chiếu với file tải thật ở commit
 * ghim ngày 20/11/2026). Phần chạy thật: gọi ensure_nets với nguồn file:// giả – file sai mã băm không được đặt vào,
 * file cũ sai mã băm bị tải lại, file cũ đúng được ghi dấu .ok.
 * Chạy: npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const UPDATE = path.join(ROOT, 'server', 'deploy', 'update.sh');
const upd = fs.readFileSync(UPDATE, 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'caro', 'rapfi', 'worker.js'), 'utf8');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

test('mã băm SHA-256 trong update.sh trùng SPEC của caro/rapfi/worker.js (đủ 4 mạng)', () => {
  const pinned = {};
  for (const m of upd.matchAll(/\[(mix9svq\w+)\]=([0-9a-f]{64})/g)) pinned[m[1]] = m[2];
  assert.strictEqual(Object.keys(pinned).length, 4);
  for (const [name, hash] of Object.entries(pinned)) {
    const m = new RegExp(`'${name}\\.bin\\.lz4': \\[\\d+, '([0-9a-f]{64})'\\]`).exec(worker);
    assert.ok(m, 'worker.js có ' + name);
    assert.strictEqual(hash, m[1], name);
  }
  assert.match(upd, /04224d18/, 'vẫn giữ kiểm 4 byte magic LZ4');
});

const haveTools = (() => { try { execFileSync('bash', ['-c', 'command -v curl && command -v sha256sum && command -v od'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();

test('ensure_nets: chỉ đặt file đúng mã băm; file cũ sai thì tải lại; file cũ đúng thì ghi dấu', { skip: !haveTools && 'thiếu bash/curl/sha256sum' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-nets-'));
  try {
    const src = path.join(dir, 'src'), repo = path.join(dir, 'repo'), nets = path.join(repo, 'caro', 'rapfi', 'nets');
    fs.mkdirSync(src);
    fs.mkdirSync(nets, { recursive: true });
    const magic = Buffer.from([0x04, 0x22, 0x4d, 0x18]);
    const good = Buffer.concat([magic, Buffer.from('mang-tot')]);
    const evil = Buffer.concat([magic, Buffer.from('mang-bi-thay')]); // đúng magic nhưng sai nội dung
    fs.writeFileSync(path.join(src, 'mix9svqfreestyle_bsmix.bin.lz4'), good);
    fs.writeFileSync(path.join(src, 'mix9svqstandard_bs15.bin.lz4'), evil);
    fs.writeFileSync(path.join(src, 'mix9svqrenju_bs15_black.bin.lz4'), good);
    fs.writeFileSync(path.join(src, 'mix9svqrenju_bs15_white.bin.lz4'), good);
    // Có sẵn từ trước khi có kiểm băm: black sai (bị thay) → phải tải lại; white đúng → chỉ ghi dấu
    fs.writeFileSync(path.join(nets, 'mix9svqrenju_bs15_black.bin.lz4'), evil);
    fs.writeFileSync(path.join(nets, 'mix9svqrenju_bs15_white.bin.lz4'), good);
    const h = sha(good);
    // Nạp các hàm của update.sh (bỏ dòng gọi main ở cuối), ghim mã băm giả cho cả 4 mạng = mã của "good"
    const script = `
      set -euo pipefail
      source <(sed '/^main "\\$@"$/,$d' "$1")
      for k in "\${!NETS_SHA256[@]}"; do NETS_SHA256[$k]=${h}; done
      NETS_BASE="file://$2" ensure_nets "$3"
    `;
    const out = execFileSync('bash', ['-c', script, 'x', UPDATE, src, repo], { encoding: 'utf8' });
    const read = (f) => (fs.existsSync(path.join(nets, f)) ? fs.readFileSync(path.join(nets, f)) : null);
    assert.deepStrictEqual(read('mix9svqfreestyle_bsmix.bin.lz4'), good);
    assert.strictEqual(read('mix9svqstandard_bs15.bin.lz4'), null, 'đúng magic nhưng sai mã băm: không đặt vào');
    assert.deepStrictEqual(read('mix9svqrenju_bs15_black.bin.lz4'), good, 'file cũ sai mã băm đã được tải lại');
    assert.deepStrictEqual(read('mix9svqrenju_bs15_white.bin.lz4'), good);
    assert.strictEqual(String(read('.mix9svqrenju_bs15_white.ok')).trim(), h, 'file cũ đúng: ghi dấu, lần sau khỏi băm lại');
    assert.ok(!fs.readdirSync(nets).some((f) => f.endsWith('.tmp')), 'không để lại file tạm');
    assert.match(out, /sai mã băm SHA-256/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
