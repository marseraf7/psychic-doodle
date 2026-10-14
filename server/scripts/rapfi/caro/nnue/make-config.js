/*
 * Ghi config.toml cho Rapfi-CARO bản gốc (luật Việt Nam): bảng cổ điển model-caro.bin, và mạng NNUE mix9svq nếu có.
 *   node make-config.js <thư mục chạy> [file mạng .bin.lz4 trong thư mục đó] [bảng băm MB = 64]
 * Dựa trên cấu hình của app (caro/rapfi/worker.js · config) để bản gốc và bản WebAssembly giống nhau.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const W = require('../../../../../caro/rapfi/worker.js');
const [dir, net, mb = '64'] = process.argv.slice(2);
let cfg = W.config('vn').replace(/default_tt_size_kb = \d+/, `default_tt_size_kb = ${+mb * 1024}`);
if (net) {
  cfg = cfg.replace('caro_binary_file = "model-caro.bin"', `caro_binary_file = "model-caro.bin"

[model.evaluator]
type = "mix9svq"
draw_black_winrate = 0.5
draw_ratio = 1.0

[[model.evaluator.weights]]
weight_file = "${net}"`);
}
// Ghi file tạm rồi đổi tên: tiến trình tự đấu đang khởi động không đọc phải file ghi dở
const tmp = path.join(dir, `config.toml.${process.pid}.tmp`);
fs.writeFileSync(tmp, cfg);
fs.renameSync(tmp, path.join(dir, 'config.toml'));
