// Chẩn đoán tạm (chỉ trên nhánh claude/webkit-crash): WebKit có sập khi terminate() một Worker đang bận tính không?
//   A: ai-worker.js (engine JS) đang chấm thế → terminate sau 20–140 ms
//   B: rapfi/worker.js (Rapfi-CARO, WebAssembly, luật Việt Nam – không tải mạng) đang nghĩ nước → terminate
// Chạy: E2E_BROWSER=webkit KIEU=A|B N=200 node caro/tests/e2e/diag-terminate.js
'use strict';
const { start } = require('../../../server/server.js');
const pw = require('playwright');
const kind = process.env.E2E_BROWSER || 'webkit';
const KIEU = process.env.KIEU || 'A';
const N = Number(process.env.N) || 200;
(async () => {
  const app = start({ port: 8199, dataFile: null });
  await new Promise((r) => (app.server.listening ? r() : app.server.once('listening', r)));
  const browser = await pw[kind].launch();
  const p = await (await browser.newContext()).newPage();
  let crashed = false;
  p.on('crash', () => { crashed = true; });
  await p.goto('http://localhost:8199/', { waitUntil: 'domcontentloaded' });
  let done = 0;
  try {
    for (; done < N && !crashed; done += 10) {
      await p.evaluate(async ([kieu]) => {
        const moves = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 2], [-1, -1], [3, 0], [0, 3], [2, -1], [-2, 1]];
        for (let j = 0; j < 10; j++) {
          let w;
          if (kieu === 'A') {
            w = new Worker('ai-worker.js');
            w.postMessage({ type: 'eval', id: 'd' + j, gid: 'g' + j, rule: 'vn', ms: 3000, moves });
            await new Promise((r) => setTimeout(r, 20 + Math.random() * 120));
          } else {
            w = new Worker('rapfi/worker.js');
            await new Promise((r) => { w.onmessage = (e) => { if (e.data.type === 'ready' || e.data.type === 'error') r(); }; w.postMessage({ type: 'init', rule: 'vn' }); setTimeout(r, 8000); });
            w.postMessage({ type: 'move', id: 1, size: 15, ms: 3000, moves: moves.map(([x, y]) => [x + 7, y + 7]) });
            await new Promise((r) => setTimeout(r, 20 + Math.random() * 300));
          }
          w.terminate();
        }
      }, [KIEU]);
    }
  } catch (e) { console.log('lỗi: ' + e.message.split('\n')[0]); }
  console.log(`KIỂU ${KIEU}: ${crashed ? 'SẬP' : 'không sập'} sau ${done} lần terminate Worker đang bận`);
  await browser.close().catch(() => {});
  app.stop();
  process.exit(0);
})();
