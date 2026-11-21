/*
 * Cài ứng dụng (A4 – pwa-install.js) và dòng chẩn đoán service worker trong ô số đo (?perf=1), ở 390px:
 *  - Chrome có hộp cài (beforeinstallprompt): hàng "Cài ứng dụng" ở Cài đặt mở hộp cài; thẻ Trang chủ chỉ từ lần mở thứ 2,
 *    bấm ✕ thì ẩn hẳn.
 *  - Safari iPhone: gợi ý "Chia sẻ → Thêm vào MH chính" (không có nút cài).
 *  - Trình duyệt trong Zalo: gợi ý "Mở bằng trình duyệt"; đã cài (display-mode standalone): không hiện gì.
 *  - ?perf=1: dòng "Đăng ký SW: đang chạy · điều khiển trang: Có · phạm vi …".
 *   node caro/tests/e2e/pwa-install.e2e.js
 */
'use strict';
const { setup, gotoRetry } = require('./helpers');
const { audit } = require('./ui-audit');

const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ZALO = 'Mozilla/5.0 (Linux; Android 12; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36 Zalo android/12100737 ZaloTheme/light ZaloLanguage/vi';

(async () => {
  const PORT = 8143;
  const { browser, ok, sleep, finish } = await setup(PORT);
  const URL = `http://localhost:${PORT}/`;
  const errs = [];
  async function open({ ua, visits = 0, standalone = false, sw = 'block', q = '' } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN', serviceWorkers: sw, ...(ua ? { userAgent: ua } : {}) });
    await ctx.addInitScript(([v, st]) => {
      if (!localStorage.getItem('e2e.init')) { localStorage.setItem('e2e.init', '1'); localStorage.setItem('caro.lang', 'vi'); if (v) localStorage.setItem('caro.visits', String(v)); }
      if (st) { const mm = window.matchMedia.bind(window); window.matchMedia = (x) => (/display-mode: standalone/.test(x) ? { matches: true, addEventListener() {}, addListener() {} } : mm(x)); }
    }, [visits, standalone]);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await gotoRetry(p, URL + q);
    await sleep(900);
    p.ctx = ctx;
    return p;
  }
  const state = (p) => p.evaluate(() => {
    const c = document.getElementById('install-card'), r = document.getElementById('set-install');
    return { kind: window.CaroInstall.kind(), row: !r.hidden, rowV: document.getElementById('set-install-v').textContent,
      card: !!c && !c.hidden, text: c ? c.innerText : '', go: !!c && !c.querySelector('.ic-go').hidden };
  });
  // Hộp cài giả của trình duyệt (Playwright không bắn được beforeinstallprompt thật)
  const fakePrompt = (p) => p.evaluate(() => {
    window.__prompted = 0;
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = async () => { window.__prompted++; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });

  // 1. Chrome, lần mở đầu: có hộp cài → hàng ở Cài đặt; thẻ Trang chủ chưa hiện
  let p = await open();
  ok((await state(p)).kind === 'none' && !(await state(p)).row, 'chưa có hộp cài của trình duyệt: không hiện nút cài');
  await fakePrompt(p);
  let s = await state(p);
  ok(s.kind === 'prompt' && s.row, 'có hộp cài: hàng "Cài ứng dụng" ở Cài đặt');
  ok(!s.card, 'lần mở đầu: chưa hiện thẻ cài ở Trang chủ');
  await p.click('#tabbar [data-tab="more"]');
  await p.evaluate(() => window.CaroShell.go('settings'));
  await sleep(300);
  ok((await audit(p)).length === 0, 'Cài đặt có hàng cài ứng dụng: 0 lỗi hiển thị ở 390px');
  await p.click('#set-install');
  await sleep(300);
  s = await state(p);
  ok(await p.evaluate(() => window.__prompted === 1) && !s.row, 'bấm "Cài ứng dụng": mở hộp cài; cài xong thì ẩn nút');
  await p.ctx.close();

  // 2. Lần mở thứ 2: thẻ Trang chủ, bấm ✕ thì ẩn hẳn (cả lần sau)
  p = await open({ visits: 1 });
  await fakePrompt(p);
  s = await state(p);
  ok(s.card && s.go && /Cài ứng dụng/.test(s.text), 'lần mở thứ 2: thẻ "Cài ứng dụng" ở Trang chủ có nút Cài đặt');
  ok((await audit(p)).length === 0, 'Trang chủ có thẻ cài: 0 lỗi hiển thị ở 390px');
  await p.click('#install-card .ic-x');
  ok(!(await state(p)).card, 'bấm ✕: thẻ ẩn');
  await p.reload();
  await sleep(900);
  await fakePrompt(p);
  ok(!(await state(p)).card && (await state(p)).row, 'tải lại: thẻ vẫn ẩn, hàng ở Cài đặt vẫn còn');
  await p.ctx.close();

  // 3. Safari iPhone: gợi ý Thêm vào MH chính, không có nút làm thay
  p = await open({ ua: SAFARI_IPHONE, visits: 2 });
  s = await state(p);
  ok(s.kind === 'ios' && s.row && s.card && !s.go && /Thêm vào MH chính/.test(s.text), 'iPhone: gợi ý "Chia sẻ → Thêm vào MH chính"');
  ok((await audit(p)).length === 0, 'iPhone, thẻ gợi ý: 0 lỗi hiển thị ở 390px');
  await p.ctx.close();

  // 4. Zalo: gợi ý mở bằng trình duyệt
  p = await open({ ua: ZALO, visits: 2 });
  await fakePrompt(p); // có hộp cài cũng không dùng được trong trình duyệt nhúng
  s = await state(p);
  ok(s.kind === 'inapp' && s.rowV === 'Mở bằng trình duyệt' && s.card && /Mở bằng trình duyệt/.test(s.text), 'Zalo: gợi ý "Mở bằng trình duyệt"');
  ok((await audit(p)).length === 0, 'Zalo, thẻ gợi ý: 0 lỗi hiển thị ở 390px');
  await p.ctx.close();

  // 5. Đã cài (display-mode standalone): không hiện gì
  p = await open({ visits: 3, standalone: true });
  await fakePrompt(p);
  s = await state(p);
  ok(s.kind === 'none' && !s.row && !s.card, 'đã cài (standalone): không hiện nút / thẻ cài');
  await p.ctx.close();

  // 6. Ô số đo ?perf=1: dòng chẩn đoán service worker
  p = await open({ sw: 'allow' });
  await p.evaluate(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100)); });
  await gotoRetry(p, URL + '?perf=1');
  let t = '';
  for (let i = 0; i < 40 && !t; i++) { await sleep(100); t = await p.evaluate(() => { const b = document.querySelector('.perf-box pre'); return b ? b.textContent : ''; }); }
  ok(/Đăng ký SW: đang chạy · điều khiển trang: Có · phạm vi http:\/\/localhost:\d+\//.test(t), 'ô số đo: dòng đăng ký SW (' + (t.split('\n').find((l) => l.startsWith('Đăng ký SW')) || '') + ')');
  ok((await audit(p)).length === 0, 'ô số đo: 0 lỗi hiển thị ở 390px');
  await p.ctx.close();
  const q = await open({ q: '?perf=1' });
  let t2 = '';
  for (let i = 0; i < 40 && !t2; i++) { await sleep(100); t2 = await q.evaluate(() => { const b = document.querySelector('.perf-box pre'); return b ? b.textContent : ''; }); }
  ok(/Đăng ký SW: chưa đăng ký · điều khiển trang: Không/.test(t2), 'service worker bị chặn: "chưa đăng ký · điều khiển trang: Không"');
  await q.ctx.close();

  ok(!errs.length, 'không lỗi JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await finish();
})();
