/*
 * Chạy một kịch bản e2e; nếu trên WebKit nó đỏ CHỈ vì trang bị sập (trình duyệt chết giữa chừng) thì chạy lại đúng một lần.
 *   node caro/tests/e2e/retry-crash.js caro/tests/e2e/localhist.e2e.js   (biến môi trường E2E_* giữ nguyên)
 *
 * Vì sao: WebKit Linux (WPE) của Playwright trên CI thỉnh thoảng tự sập (segfault / "trap invalid opcode" trong
 * libWPEWebKit) – không tái hiện được trên máy thật (Windows 0/40 lần, báo cáo reports/31-webkit-benchmark.md).
 * Bước kiểm thử không đạt (dòng "FAIL ...") vẫn đỏ ngay, không chạy lại. Mỗi lần sập in annotation ::warning để thống kê.
 */
'use strict';
const { spawn } = require('child_process');

const script = process.argv[2];
const extra = process.argv.slice(3);
const webkit = process.env.E2E_BROWSER === 'webkit';
const GH = !!process.env.GITHUB_ACTIONS;
// Dấu hiệu trang / trình duyệt chết (helpers.js in "trang bị sập (crash)"; Playwright báo "Target ... has been closed")
const CRASH = /trang bị sập \(crash\)|Target page, context or browser has been closed|Browser has been closed/;

function run() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...extra], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let out = '';
    const keep = (buf, dst) => { const s = buf.toString(); out += s; dst.write(s); };
    child.stdout.on('data', (b) => keep(b, process.stdout));
    child.stderr.on('data', (b) => keep(b, process.stderr));
    child.on('close', (code) => resolve({ code: code === null ? 1 : code, out }));
  });
}

/** Đỏ chỉ vì sập: có dấu hiệu sập, và mọi dòng FAIL (nếu có) đều là hệ quả của sập. */
function crashOnly(out) {
  if (!CRASH.test(out)) return false;
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL '));
  return fails.every((l) => CRASH.test(l));
}

(async () => {
  const first = await run();
  if (first.code === 0 || !webkit || !crashOnly(first.out)) process.exit(first.code);
  const msg = `${script}: trang WebKit bị sập (lỗi riêng WebKit Linux trên CI) – chạy lại 1 lần`;
  console.log(GH ? `::warning title=WebKit sập::${msg}` : `\n*** ${msg} ***\n`);
  const second = await run();
  process.exit(second.code);
})();
