/*
 * Tiến độ trong tài khoản + Puzzle Storm có kiểm + bảng tuần (A5), ở 390px:
 *  1. Khách đã có tiến độ trên máy (giải đố, Storm, chuỗi ngày, huy hiệu) → đăng ký: tiến độ lên tài khoản, không mất gì.
 *  2. Máy thứ hai đăng nhập cùng tài khoản: nhận đủ tiến độ (Giải đố hiện đúng số bài).
 *  3. Storm khi đã đăng nhập: máy chủ phát bài, giải vài bài, hết giờ → máy chủ kiểm và ghi vào bảng tuần; tab Câu đố hiện
 *     bảng xếp hạng có mình; API công khai /api/storm/leaderboard có tên, không có id.
 *  4. Hồ sơ công khai (khách mở ?u=): mục Thành tích có chuỗi ngày + huy hiệu + Storm.
 *   node caro/tests/e2e/storm-sync.e2e.js
 */
'use strict';
const { setup, gotoRetry } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8145;
  const { app, browser, ok, shot, sleep, finish } = await setup(PORT);
  const URL = `http://localhost:${PORT}/`;
  const errs = [];
  const until = async (fn, ms = 10000) => { const t = Date.now(); let v; while (!(v = await fn()) && Date.now() - t < ms) await sleep(150); return v; };
  const today = await (async () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const NAME = 'ss_storm';

  async function device(seed) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN', serviceWorkers: 'block' });
    await ctx.addInitScript((s) => {
      if (localStorage.getItem('e2e.init')) return;
      localStorage.setItem('e2e.init', '1');
      localStorage.setItem('caro.lang', 'vi');
      if (s) for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
    }, seed || null);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await gotoRetry(p, URL);
    await sleep(500);
    return p;
  }
  async function auth(p, tab) {
    await p.click('#tabbar [data-tab="more"]');
    await sleep(400);
    await p.click(tab === 'login' ? '#go-login' : '#go-register');
    await sleep(150);
    await p.fill('#auth-form input[name=username]', NAME);
    await p.fill('#auth-form input[name=password]', 'caro-pass1');
    await p.click('#auth-submit');
    await until(() => p.evaluate(() => { const m = window.CaroOnline.state.me; return !!(m && !m.guest); }));
  }

  // 1. Khách có tiến độ trên máy → đăng ký
  const a = await device({
    'caro.puzzles': { r: 1210, n: 20, ok: 12, best: 5, recent: [1, 2, 3] },
    'caro.storm': { best: 7, runs: 2, last: 7 },
    'caro.habits': { days: [today], best: 1, games: 4, bots: { ti: true }, earned: { first_game: today } },
  });
  await auth(a, 'register');
  const uid = (await a.evaluate(() => window.CaroOnline.state.me.id)).replace(/^u_/, ''); // id tài khoản (bỏ tiền tố pid)
  const saved = await until(() => { const g = app.store.progressGet(uid); return g && g.pz.n === 20 ? g : null; });
  ok(saved && saved.pz.ok === 12 && saved.storm.best === 7 && saved.habits.days.includes(today) && saved.habits.earned.first_game,
    'đăng ký: tiến độ trên máy (giải đố, Storm, chuỗi ngày, huy hiệu) lên tài khoản');

  // 2. Máy thứ hai đăng nhập: nhận đủ tiến độ
  const b = await device(null);
  await auth(b, 'login');
  const got = await until(() => b.evaluate(() => { const s = JSON.parse(localStorage.getItem('caro.puzzles') || '{}'); return s.n === 20 ? s : null; }));
  ok(got && got.ok === 12 && got.r === 1210, 'máy thứ hai: nhận tiến độ giải đố từ tài khoản');
  ok(await b.evaluate(() => JSON.parse(localStorage.getItem('caro.habits') || '{}').earned.first_game !== undefined), 'máy thứ hai: nhận huy hiệu');
  await b.click('#tabbar [data-tab="puzzles"]');
  await sleep(600);
  ok(await b.evaluate(() => document.getElementById('pz-stats').textContent.includes('12/20')), 'tab Câu đố hiện đúng số bài đã giải (12/20)');

  // 3. Storm có kiểm: giải vài bài rồi cho hết giờ
  await b.evaluate(() => { window.__sent = []; const s = window.CaroOnline.send; window.CaroOnline.send = (m) => { window.__sent.push(m.t); return s(m); }; });
  await b.evaluate(() => window.CaroStorm.start());
  ok(await until(() => b.evaluate(() => window.__sent.includes('stormStart') && !!window.CaroApp.ext)), 'Storm (đã đăng nhập): xin lượt của máy chủ, mở bài đầu');
  let solved = 0;
  for (let k = 0; k < 3; k++) {
    const moved = await b.evaluate(async () => {
      const App = window.CaroApp, A = window.CaroAnalysis;
      for (let step = 0; step < 6; step++) {
        const before = App.board.moves.length;
        const p = before % 2 ? 2 : 1;
        const f = A.forced(App.board, p, 6, { deadline: Date.now() + 800 });
        if (!f || !App.ext) return false;
        App.ext.onMove(f.move[0], f.move[1]);
        await new Promise((r) => setTimeout(r, 700)); // máy chặn (450 ms) / chuyển bài (350 ms)
        if (App.board.moves.length < before) return true; // đã sang bài mới (thế cờ khác)
        if (window.CaroApp.board.moves.length === before + 1) return true; // thắng ngay: bài tiếp theo chưa bày
      }
      return true;
    });
    if (moved) solved++;
    await sleep(500);
  }
  await b.evaluate(() => { const real = Date.now; Date.now = () => real() + 5 * 60 * 1000; }); // cho hết giờ
  const res = await until(() => app.store.stormBestEver(uid), 8000);
  ok(res >= 1, `hết giờ: máy chủ kiểm và ghi lượt Storm (${res} bài, đã thử ${solved})`);
  await b.evaluate(() => { const d = document.getElementById('puzzle-dlg'); if (d.open) d.close(); window.CaroShell.go('puzzles'); });
  const board = await until(() => b.evaluate((n) => { const el = document.getElementById('storm-board'); return el && !el.hidden && el.textContent.includes(n) ? el.textContent : ''; }, NAME));
  ok(/Puzzle Storm: bảng xếp hạng tuần/.test(board) && /Bạn: \d+ bài, hạng 1/.test(board), 'tab Câu đố: bảng tuần có mình, hạng 1');
  await b.evaluate(() => document.getElementById('storm-board').scrollIntoView());
  await shot(b, 'storm-board.png');
  const a5 = await audit(b);
  ok(a5.length === 0, 'tab Câu đố + bảng tuần: 0 lỗi hiển thị ở 390px' + (a5.length ? ' – ' + JSON.stringify(a5.slice(0, 3)) : ''));
  const api = await (await fetch(URL + 'api/storm/leaderboard')).json();
  ok(api.players[0] && api.players[0].username === NAME && !('uid' in api.players[0]) && !('id' in api.players[0]), 'API công khai: bảng tuần có tên, không có id');

  // 4. Hồ sơ công khai: Thành tích
  const g = await device(null);
  await gotoRetry(g, URL + '?u=' + NAME);
  const prof = await until(() => g.evaluate(() => { const d = document.getElementById('profile-dlg'); return d.open && d.textContent.includes('Thành tích') ? d.textContent : ''; }));
  ok(/Ván đầu tiên/.test(prof) && /ngày liên tiếp/.test(prof), 'hồ sơ (khách xem): mục Thành tích có chuỗi ngày + huy hiệu');
  await shot(g, 'profile-progress.png');
  const a6 = await audit(g);
  ok(a6.length === 0, 'hồ sơ có Thành tích: 0 lỗi hiển thị ở 390px' + (a6.length ? ' – ' + JSON.stringify(a6.slice(0, 3)) : ''));

  ok(!errs.length, 'không lỗi JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await finish();
})();
