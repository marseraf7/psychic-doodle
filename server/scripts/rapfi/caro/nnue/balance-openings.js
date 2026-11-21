/*
 * Lọc khai cuộc cân bằng bằng Rapfi-CARO (bản gốc): mỗi thế cho Rapfi nghĩ MS ms, giữ thế có |điểm| ≤ WINDOW (góc nhìn
 * bên tới lượt, đơn vị điểm của Rapfi; thắng / thua chắc = ±20000 bị loại).
 *   node balance-openings.js <thư mục engine> <vào.txt> <ra.txt> [ms = 200] [cửa sổ = 150] [số tiến trình = số lõi] [tối đa]
 * Vì sao: luật Việt Nam bên đi trước lợi thế rất lớn – khai cuộc ngẫu nhiên / bộ cũ X thắng 74–82 % (đo 21/11/2026). Đấu
 * chọn trên khai cuộc lệch phần lớn cặp ván "mỗi bên thắng một ván cầm X" – không mang thông tin; dữ liệu tự đấu từ thế lệch
 * dạy mạng chủ yếu "ai đi trước thắng". Thư mục engine: pbrain-rapfi + config.toml (make-config.js), thường là classic.
 * Ra: các dòng được giữ, đúng thứ tự vào; in thống kê (số thế, số giữ, phân bố |điểm|) ra stderr.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('./openings-lib.js');

const DRIVER = path.join(__dirname, '../../driver.js');

/** Nhóm |điểm| để in phân bố. */
function bucket(ev) {
  if (ev == null) return 'không có điểm';
  const a = Math.abs(ev);
  return a >= 20000 ? 'thắng/thua chắc' : a <= 50 ? '≤50' : a <= 150 ? '≤150' : a <= 300 ? '≤300' : a <= 1000 ? '≤1000' : '>1000';
}

/** Giữ thế cân bằng: điểm có và |điểm| ≤ window. */
const keep = (ev, window) => ev != null && Number.isFinite(ev) && Math.abs(ev) <= window;

async function main() {
  const [dir, inp, out, MS = '200', WIN = '150', PROCS = String(os.cpus().length), MAX] = process.argv.slice(2);
  if (!dir || !inp || !out) {
    console.error('Dùng: node balance-openings.js <thư mục engine> <vào.txt> <ra.txt> [ms] [cửa sổ] [số tiến trình] [tối đa]');
    process.exit(1);
  }
  process.env.RAPFI_DIR = path.resolve(dir);
  const { Rapfi } = require(DRIVER);
  let ops = fs.readFileSync(inp, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  if (MAX) ops = ops.slice(0, +MAX);
  const evs = new Array(ops.length).fill(null);
  let next = 0, done = 0;
  const t0 = Date.now();
  const worker = async () => {
    const r = new Rapfi(20, 8, +MS);
    await r.init();
    while (next < ops.length) {
      const i = next++;
      const mv = L.parsePos(ops[i]);
      if (!mv) continue;
      const res = await r.move(mv);
      evs[i] = res.ev;
      if (++done % 500 === 0) console.error(`[balance] ${done}/${ops.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    r.quit();
  };
  await Promise.all(Array.from({ length: Math.max(1, +PROCS) }, worker));
  const kept = ops.filter((_, i) => keep(evs[i], +WIN));
  fs.writeFileSync(out, kept.join('\n') + '\n');
  const hist = {};
  for (const ev of evs) hist[bucket(ev)] = (hist[bucket(ev)] || 0) + 1;
  console.error(`[balance] ${ops.length} thế → giữ ${kept.length} (|điểm| ≤ ${WIN}, ${MS} ms) · phân bố |điểm|: ${JSON.stringify(hist)}`);
  setTimeout(() => process.exit(0), 300);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { bucket, keep };
