/*
 * Dựng thư mục tài nguyên của sidecar Rapfi cho app desktop: desktop/src-tauri/resources/rapfi/ (Tauri gói vào bundle
 * thành <resource_dir>/rapfi/ – xem tauri.conf.json · bundle.resources).
 *   node desktop/scripts/rapfi-resources.js
 *   RAPFI_NETS=<thư mục mạng .bin.lz4>   (vd. rapfi-networks/mix9svq) – thiếu thì luật tự do / tiêu chuẩn / Renju chạy
 *                                        bằng đánh giá cổ điển (yếu hơn hẳn) và script in cảnh báo
 * Gồm:
 *  - config.toml (Rapfi nguyên bản, đủ 3 mạng NNUE – Rapfi nạp mạng của luật khi cần) và config-caro.toml (Rapfi-CARO,
 *    luật Việt Nam, đánh giá cổ điển) – sinh từ config() của caro/rapfi/worker.js để cùng cấu hình với bản WASM;
 *  - mô hình cổ điển model210901.bin + model-caro.bin (CC0, từ caro/rapfi/) và mạng NNUE (CC0, kiểm SHA-256 như worker.js);
 *  - giấy phép và mã nguồn tương ứng của Rapfi (GPL-3): COPYING.txt, AUTHORS.txt, source/ (gói nguồn đúng commit,
 *    bản vá, script dựng) và NGUON-RAPFI.txt (nơi lấy mã nguồn).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CARO, fail } = require('../../app/scripts/web-common.js');

const DESK = path.resolve(__dirname, '..');
const OUT = path.join(DESK, 'src-tauri', 'resources', 'rapfi');
const RDIR = path.join(CARO, 'rapfi');
const W = require(path.join(RDIR, 'worker.js'));
const RAPFI_COMMIT = '3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7'; // cùng commit với bản WASM (caro/rapfi/SOURCE.md)
const NETS_COMMIT = 'e32ad77a5364363b3e3a02b3f9e8610ade19ea98';
const HASH_MB = 128; // bảng băm mỗi tiến trình (bản WASM: 16 MB)

/** Kiểm kích thước + SHA-256 theo worker.js · SPEC (mạng hỏng thì Rapfi lặng lẽ tắt NNUE). */
function checked(file) {
  const buf = fs.readFileSync(file);
  const spec = W.SPEC[path.basename(file)];
  if (spec && (buf.length !== spec[0] || crypto.createHash('sha256').update(buf).digest('hex') !== spec[1])) {
    fail(`${path.basename(file)} sai kích thước / SHA-256 – tải lại từ rapfi-networks@${NETS_COMMIT.slice(0, 7)}`);
  }
  return buf;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'source'), { recursive: true });

// ---------------------------------------------------------------- Mạng + mô hình (CC0)
const netsDir = process.env.RAPFI_NETS;
const nets = [...W.NETS.free, ...W.NETS.std, ...W.NETS.renju];
const haveNets = !!netsDir && nets.every((f) => fs.existsSync(path.join(netsDir, f)));
if (netsDir && !haveNets) fail('RAPFI_NETS thiếu một trong: ' + nets.join(', '));
if (haveNets) for (const f of nets) fs.writeFileSync(path.join(OUT, f), checked(path.join(netsDir, f)));
else console.warn('⚠ Chưa có RAPFI_NETS: bản này chạy luật tự do / tiêu chuẩn / Renju KHÔNG có mạng NNUE (yếu hơn bản web)');
for (const f of ['model210901.bin', 'model-caro.bin']) fs.writeFileSync(path.join(OUT, f), checked(path.join(RDIR, f)));

// ---------------------------------------------------------------- Cấu hình (từ worker.js)
let plain = W.config('free', { hashMb: HASH_MB });
const weights = '[[model.evaluator.weights]]\nweight_file = "' + W.NETS.free[0] + '"';
if (!plain.includes(weights)) fail('worker.js · config() đổi dạng – sửa rapfi-resources.js cho khớp');
plain = haveNets
  // Đủ 3 mạng theo thứ tự tự do / tiêu chuẩn / Renju (như rapfi-networks/config-example/config.toml)
  ? plain.replace(weights, weights + `\n\n[[model.evaluator.weights]]\nweight_file = "${W.NETS.std[0]}"\n\n` +
    `[[model.evaluator.weights]]\nweight_file_black = "${W.NETS.renju[0]}"\nweight_file_white = "${W.NETS.renju[1]}"`)
  // Không mạng: bỏ cả mục [model.evaluator] – chỉ còn mô hình cổ điển
  : plain.replace(/\n\[model\.evaluator\][\s\S]*?(?=\n\[search\])/, '\n');
const head = '# Tạo tự động bởi desktop/scripts/rapfi-resources.js (từ caro/rapfi/worker.js) – không sửa tay.\n';
fs.writeFileSync(path.join(OUT, 'config.toml'), head + plain);
fs.writeFileSync(path.join(OUT, 'config-caro.toml'), head + W.config('vn', { hashMb: HASH_MB }));

// ---------------------------------------------------------------- Giấy phép + mã nguồn tương ứng (GPL-3)
for (const f of ['COPYING.txt', 'AUTHORS.txt']) fs.copyFileSync(path.join(RDIR, f), path.join(OUT, f));
for (const f of ['rapfi-src-3c94c2a.tar.gz', 'rapfi-caro.patch', 'rapfi-mt.patch']) {
  fs.copyFileSync(path.join(RDIR, 'build', f), path.join(OUT, 'source', f));
}
fs.copyFileSync(path.join(__dirname, 'build-rapfi.sh'), path.join(OUT, 'source', 'build-rapfi.sh'));
fs.writeFileSync(path.join(OUT, 'NGUON-RAPFI.txt'), `Rapfi trong app Caro x Gomoku (desktop) – mã nguồn và giấy phép
=================================================================

pbrain-rapfi và pbrain-rapfi-caro (đặt cạnh file chạy của app) là Rapfi – engine Gomoku / Renju,
Copyright (C) Rapfi developers (xem AUTHORS.txt) – phát hành theo GNU General Public License phiên bản 3
(COPYING.txt). App chạy Rapfi như một chương trình riêng, chỉ trao đổi qua stdin / stdout (giao thức
Gomocup); phần còn lại của app không chứa mã Rapfi.

Mã nguồn tương ứng (Corresponding Source) – kèm ngay trong thư mục source/ cạnh file này:
  - rapfi-src-${RAPFI_COMMIT.slice(0, 7)}.tar.gz : mã Rapfi đúng commit ${RAPFI_COMMIT}, không sửa đổi
  - rapfi-mt.patch   : bản vá của Cờ Caro (GPL-3) cho cả hai file – lệnh gửi ngay sau nước đi không bị mất
  - rapfi-caro.patch : bản vá của Cờ Caro (GPL-3) thêm luật Việt Nam – chỉ cho pbrain-rapfi-caro
  - build-rapfi.sh   : lệnh dựng đúng như bản trong app (CMake preset x64-clang-AVX2 / arm64-clang-NEON)
Cùng mã nguồn trên mạng:
  https://github.com/marseraf7/rapfi/tree/${RAPFI_COMMIT}  (bản sao lưu của Cờ Caro)
  https://github.com/dhbloo/rapfi/tree/${RAPFI_COMMIT}     (kho gốc của tác giả)
  Bản vá và script dựng: thư mục caro/rapfi/build/ và desktop/scripts/ của kho mã Cờ Caro.

Bạn có quyền sao chép, sửa đổi và phân phối lại Rapfi theo các điều khoản của GPL-3. Rapfi được cung cấp
KHÔNG KÈM BẤT KỲ BẢO ĐẢM NÀO (xem mục 15–16 của COPYING.txt).

Mô hình cổ điển (model210901.bin, model-caro.bin) và mạng NNUE mix9svq*.bin.lz4: CC0 1.0
(https://github.com/dhbloo/rapfi-networks, commit ${NETS_COMMIT}; model-caro.bin do Cờ Caro học bằng tuner của Rapfi).
`);

console.log(`✓ Tài nguyên Rapfi: ${path.relative(process.cwd(), OUT) || OUT}${haveNets ? ' (đủ 3 mạng NNUE)' : ' (không mạng NNUE)'}`);
