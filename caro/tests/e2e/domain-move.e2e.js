/*
 * Đổi tên miền không mất dữ liệu (server/src/domain-move.js, caro/migrate-out.js, caro/migrate-in.js): hai tên máy cùng một
 * máy chủ – 127.0.0.1 làm tên CŨ, localhost làm tên MỚI.
 *   1. Người có tài khoản đã cài service worker ở tên cũ + có tiến độ trên máy; khách chỉ có tiến độ trên máy.
 *   2. Máy chủ bật MOVED_TO: mở lại tên cũ (kèm link ?u=) → service worker cũ tự gỡ → trang chuyển → sang tên mới cùng
 *      đường dẫn; vẫn đăng nhập đúng tài khoản, khách giữ đúng khoá khách (cùng danh tính ở máy chủ) + tiến độ; URL không
 *      còn ?mig=; khoá đã có ở tên mới không bị ghi đè; mã chuyển chỉ dùng được một lần, chỉ ở trình duyệt có cookie vé
 *      (begin); link ?mig= do người khác tạo không đăng nhập hộ được (login CSRF).
 *   node caro/tests/e2e/domain-move.e2e.js
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8163;
  const OLD = `http://127.0.0.1:${PORT}`, NEW = `http://localhost:${PORT}`;
  const { browser, ok, sleep, finish } = await setup(PORT);
  const errors = [];
  const until = async (fn, ms = 20000) => { const t = Date.now(); let v; while (!(v = await fn().catch(() => null)) && Date.now() - t < ms) await sleep(200); return v; };
  const watch = (p, name) => p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  const local = (p) => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));

  // ---------------------------------------------------------------- 1. Ở tên cũ: tài khoản (có service worker) và khách
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const a = await ctxA.newPage();
  watch(a, 'tài khoản');
  await a.goto(OLD + '/');
  await a.waitForFunction(() => window.CaroOnline && window.CaroOnline.state.me, null, { timeout: 20000 });
  await a.click('#tabbar [data-tab="more"]');
  await sleep(400);
  await a.click('#go-register');
  await a.fill('#auth-form input[name=username]', 'dm_user');
  await a.fill('#auth-form input[name=password]', 'caro-pass1');
  await a.click('#auth-submit');
  const me = await until(() => a.evaluate(() => { const m = window.CaroOnline.state.me; return m && m.username === 'dm_user' && m; }));
  ok(!!me, 'tên cũ: đã đăng ký dm_user');
  await a.evaluate(() => { localStorage.setItem('caro.puzzles', JSON.stringify({ solved: [1, 2, 3] })); localStorage.setItem('caro.theme', 'dark'); });
  const sw = await until(() => a.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!(r && r.active))), 25000);
  ok(!!sw, 'tên cũ: service worker đã cài (bản app trong bộ nhớ đệm)');
  const oldA = await local(a);

  const ctxB = await browser.newContext({ viewport: { width: 390, height: 860 } });
  // Ở tên MỚI đã có sẵn một cài đặt (người này từng mở tên mới): không bị ghi đè
  await ctxB.addInitScript(() => { if (location.hostname === 'localhost' && !localStorage.getItem('caro.sound')) localStorage.setItem('caro.sound', 'off-new'); });
  const b = await ctxB.newPage();
  watch(b, 'khách');
  await b.goto(OLD + '/');
  await b.waitForFunction(() => window.CaroOnline && window.CaroOnline.state.me, null, { timeout: 20000 });
  await b.evaluate(() => {
    localStorage.setItem('caro.storm', JSON.stringify({ best: 17 }));
    localStorage.setItem('caro.sound', 'on-old');
    localStorage.setItem('caro.lg.index', JSON.stringify([{ id: 'g1', at: 1 }]));
    localStorage.setItem('caro.lg.g.g1', JSON.stringify({ moves: [[0, 0]] }));
  });
  const oldB = await local(b);
  const guestPid = await b.evaluate(() => window.CaroOnline.state.me.id);
  ok(oldB['caro.guestKey'] && guestPid, 'tên cũ: khách có khoá khách + tiến độ trên máy');

  // ---------------------------------------------------------------- 2. Máy chủ chuyển sang tên mới
  process.env.MOVED_TO = NEW;
  process.env.MOVED_FROM = '127.0.0.1';
  const bot = await fetch(OLD + '/?u=dm_user', { headers: { accept: 'text/html', 'user-agent': 'Googlebot/2.1' }, redirect: 'manual' });
  ok(bot.status === 301 && bot.headers.get('location') === NEW + '/?u=dm_user', 'máy tìm kiếm ở tên cũ: 301 sang tên mới');

  const navs = [];
  a.on('request', (r) => { if (r.isNavigationRequest()) navs.push(r.url()); });
  await a.goto(OLD + '/?u=dm_user', { waitUntil: 'commit' });
  const doneA = await until(async () => {
    const u = new URL(a.url());
    return u.host === `localhost:${PORT}` && !u.searchParams.has('mig') && a.evaluate(() => { const m = window.CaroOnline && window.CaroOnline.state.me; return m && m.username; });
  }, 40000);
  ok(doneA === 'dm_user', `tài khoản: sang tên mới và vẫn đăng nhập (${a.url()})`);
  ok(navs.includes(NEW + '/?u=dm_user'), 'giữ đường dẫn + tham số của link: ' + navs.map((x) => x.replace(/mig=[\w-]+/, 'mig=…')).join(' → '));
  const newA = await local(a);
  ok(newA['caro.token'] === oldA['caro.token'], 'mang theo phiên đăng nhập');
  ok(JSON.stringify(JSON.parse(newA['caro.puzzles'] || '{}').solved) === '[1,2,3]' && newA['caro.theme'] === 'dark', 'mang theo tiến độ giải đố + cài đặt');
  ok(!(await a.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.startsWith('http://127.'))), 'không còn service worker cũ điều khiển trang');

  await b.goto(OLD + '/', { waitUntil: 'commit' });
  const doneB = await until(async () => {
    const u = new URL(b.url());
    return u.host === `localhost:${PORT}` && !u.search && b.evaluate(() => { const m = window.CaroOnline && window.CaroOnline.state.me; return m && m.id; });
  }, 40000);
  ok(doneB === guestPid, `khách: sang tên mới, cùng danh tính khách ${doneB}`);
  const newB = await local(b);
  ok(newB['caro.guestKey'] === oldB['caro.guestKey'] && JSON.parse(newB['caro.storm'] || '{}').best === 17, 'mang theo khoá khách + tiến độ Storm');
  ok(newB['caro.lg.g.g1'] && JSON.parse(newB['caro.lg.index']).length === 1, 'mang theo ván lưu trên máy');
  ok(newB['caro.sound'] === 'off-new', 'khoá đã có ở tên mới không bị ghi đè');

  // Mã chuyển một lần, chỉ cho trình duyệt có cookie vé (begin) của chính lượt đó
  const begin = await fetch(NEW + '/api/migrate/begin?from=' + encodeURIComponent(`127.0.0.1:${PORT}`) + '&p=/', { redirect: 'manual' });
  const ticket = new URL(begin.headers.get('location')).searchParams.get('migt');
  ok(begin.status === 302 && /^caro_mig_[\w-]{8}=[\w-]{22}; Path=\/api\/migrate;.*HttpOnly/.test(begin.headers.get('set-cookie') || ''), 'begin: cookie vé HttpOnly ở tên mới');
  const r = await fetch(OLD + '/api/migrate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: ticket, keys: { 'caro.token': oldA['caro.token'], 'caro.lang': 'en' } }) });
  const { code } = await r.json();
  const cookie = { headers: { cookie: `caro_mig_${ticket.slice(0, 8)}=${ticket}` } };
  const foreign = await fetch(NEW + '/api/migrate/' + code);
  const first = await fetch(NEW + '/api/migrate/' + code, cookie), again = await fetch(NEW + '/api/migrate/' + code, cookie);
  ok(foreign.status === 403 && first.status === 200 && again.status === 404, 'mã chuyển: thiếu cookie vé → 403; đúng vé: một lần');

  // Chống đăng nhập hộ: kẻ xấu tạo mã chứa token của mình, gửi link ?mig= cho người chưa từng mở tên mới
  const b2 = await fetch(NEW + '/api/migrate/begin?from=' + encodeURIComponent(`127.0.0.1:${PORT}`) + '&p=/', { redirect: 'manual' });
  const t2 = new URL(b2.headers.get('location')).searchParams.get('migt');
  const evil = await (await fetch(OLD + '/api/migrate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: t2, keys: { 'caro.token': oldA['caro.token'], 'caro.guestKey': 'k'.repeat(32) } }) })).json();
  const ctxV = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const v = await ctxV.newPage();
  watch(v, 'nạn nhân');
  await v.goto(NEW + '/?mig=' + evil.code, { waitUntil: 'commit' });
  const doneV = await until(async () => !new URL(v.url()).searchParams.has('mig') && v.evaluate(() => { const m = window.CaroOnline && window.CaroOnline.state.me; return m && m.id; }), 30000);
  const newV = await local(v);
  ok(doneV && !newV['caro.token'] && newV['caro.guestKey'] !== 'k'.repeat(32), `link ?mig= của người khác: không nhận token / khoá khách lạ (${doneV})`);
  await ctxV.close();

  delete process.env.MOVED_TO;
  delete process.env.MOVED_FROM;
  ok(!errors.length, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctxA.close();
  await ctxB.close();
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
