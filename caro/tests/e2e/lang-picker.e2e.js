/*
 * Kiểm thử trình duyệt: ô chọn ngôn ngữ (caro/lang-picker.js) và nền đa ngôn ngữ (docs/quy-trinh-them-ngon-ngu.md).
 *   1. 8 ngôn ngữ hiện có: tên tự gọi + tên theo ngôn ngữ giao diện, nhãn "Bản dịch máy" cho status 'mt-draft', không ô tìm,
 *      không tràn ngang ở 390px; đổi ngôn ngữ thì nhãn đổi theo.
 *   2. Danh sách dài (giả lập thêm 15 ngôn ngữ bằng new-lang.js, chặn langs.js): có ô tìm, tìm bỏ dấu / theo mã, không thấy
 *      thì hiện "Không tìm thấy"; ngôn ngữ 'hidden' không có trong danh sách.
 *   3. ?lang=<mã hidden, RTL> (ar): mở được để người dịch xem, <html dir="rtl">, có trong danh sách và đang chọn.
 *   node caro/tests/e2e/lang-picker.e2e.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { setup, sleep, gotoRetry } = require('./helpers');
const NL = require('../../../server/scripts/new-lang.js');

const PORT = 8131;
const ROOT = path.join(__dirname, '..', '..');

(async () => {
  const { browser, ok, shot, finish } = await setup(PORT);
  const errors = [];

  /** Trang mới ở 390px; langsSrc: thay caro/langs.js (trang từng file ?bundle=0). */
  async function open(lang, query = '', langsSrc = null) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript((l) => { if (l) localStorage.setItem('caro.lang', l); }, lang);
    if (langsSrc) await ctx.route('**/langs.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: langsSrc }));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    // Ngôn ngữ giả lập chưa có file dịch: i18n/<mã>/core.js 404 (máy chủ trả text/plain) là đúng – bỏ qua lỗi tải đó
    p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION|404|Failed to load resource|Refused to execute script from '[^']*\/i18n\//.test(m.text())) errors.push('console: ' + m.text()); });
    await gotoRetry(p, `http://localhost:${PORT}/${query}`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.CaroShell && window.CaroLangPicker && document.querySelector('#lang-list .li'), null, { timeout: 30000 });
    await sleep(400);
    return p;
  }
  async function toLangPage(p) {
    await p.evaluate(() => document.getElementById('btn-settings').click());
    await sleep(250);
    await p.click('#settings-form [data-go="lang"]');
    await sleep(250);
  }
  const rows = (p) => p.$$eval('#lang-list label.li', (ls) => ls.filter((l) => !l.hidden).map((l) => ({
    code: l.dataset.code, name: l.querySelector('.li-t > span').textContent, sub: (l.querySelector('.li-t small') || {}).textContent || '',
    lang: l.querySelector('.li-t > span').getAttribute('lang'), checked: l.querySelector('input').checked,
  })));
  const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

  // ---------------------------------------------------------------- 1. 8 ngôn ngữ hiện có
  const p1 = await open('vi');
  await toLangPage(p1);
  let r = await rows(p1);
  ok(r.length === 8, '8 ngôn ngữ trong ô chọn: ' + r.map((x) => x.code).join(' '));
  ok(r.find((x) => x.code === 'vi').checked, 'đang chọn tiếng Việt');
  const mt = r.filter((x) => /Bản dịch máy/.test(x.sub)).map((x) => x.code).sort().join(' ');
  ok(mt === 'cs ja ko zh-Hant', 'nhãn "Bản dịch máy" đúng các ngôn ngữ mt-draft: ' + mt);
  ok(/Tiếng Nhật/.test(r.find((x) => x.code === 'ja').sub) && r.find((x) => x.code === 'ja').name === '日本語', 'tên tự gọi + tên tiếng Việt: ' + JSON.stringify(r.find((x) => x.code === 'ja')));
  ok(r.find((x) => x.code === 'vi').sub === '', 'tiếng Việt khi giao diện tiếng Việt: không lặp tên');
  ok(r.every((x) => x.lang), 'mọi tên có lang="…"');
  ok(!(await p1.$('#lang-list .lang-q')), '8 ngôn ngữ: không có ô tìm');
  ok(await noHScroll(p1), 'không tràn ngang ở 390px');
  await shot(p1, 'lang-picker-vi-390.png');
  await p1.click('#lang-list label:has(input[value="en"])');
  await sleep(400);
  r = await rows(p1);
  ok(r.find((x) => x.code === 'en').checked && /Machine translation/.test(r.find((x) => x.code === 'cs').sub) && /Czech/.test(r.find((x) => x.code === 'cs').sub),
    'đổi sang tiếng Anh: vẽ lại, nhãn + tên theo tiếng Anh: ' + r.find((x) => x.code === 'cs').sub);
  ok(await p1.evaluate(() => document.documentElement.dir) === 'ltr', 'tiếng Anh: dir="ltr"');

  // ---------------------------------------------------------------- 2. Danh sách dài: ô tìm
  let src = fs.readFileSync(path.join(ROOT, 'langs.js'), 'utf8');
  const extra = ['es', 'fr', 'de', 'pt', 'it', 'pl', 'uk', 'tr', 'id', 'nl', 'hi', 'th', 'he', 'fa', 'sw'];
  // ngôn ngữ đã có khung (status hidden – vd. es, fr…) thì chỉ đổi status
  for (const c of extra) src = NL.setStatus(new RegExp(`code: '${c}'`).test(src) ? src : NL.addToLangs(src, NL.cldrInfo(c)), c, 'mt-draft');
  src = NL.addToLangs(src, NL.cldrInfo('ar')); // ar còn hidden
  const p2 = await open('vi', '?bundle=0', src);
  await toLangPage(p2);
  r = await rows(p2);
  ok(r.length === 23 && !r.some((x) => x.code === 'ar'), `23 ngôn ngữ đang hiện, không có ar (hidden): ${r.length}`);
  ok(!!(await p2.$('#lang-list .lang-q')), 'trên 20 ngôn ngữ: có ô tìm');
  ok(r.find((x) => x.code === 'he').lang === 'he' && !!(await p2.$('#lang-list [data-code="he"] .li-t > span > bdi')), 'tên tiếng Do Thái: lang="he", tách hướng bằng <bdi>');
  await p2.fill('#lang-list .lang-q', 'tay ban');
  await sleep(150);
  r = await rows(p2);
  ok(r.length === 1 && r[0].code === 'es', 'tìm "tay ban" (bỏ dấu, tên tiếng Việt): Español – ' + r.map((x) => x.code).join(' '));
  await p2.fill('#lang-list .lang-q', 'Deu');
  await sleep(150);
  r = await rows(p2);
  ok(r.length === 1 && r[0].code === 'de', 'tìm theo tên tự gọi "Deu": Deutsch');
  await p2.fill('#lang-list .lang-q', 'zzzz');
  await sleep(150);
  ok((await rows(p2)).length === 0 && await p2.isVisible('#lang-list .lang-none'), 'không thấy: "Không tìm thấy ngôn ngữ nào."');
  await p2.press('#lang-list .lang-q', 'Enter');
  await sleep(150);
  ok(await p2.isVisible('#page-settings') && await p2.evaluate(() => window.I18N.lang) === 'vi', 'Enter trong ô tìm không nộp / không đổi ngôn ngữ');
  await p2.fill('#lang-list .lang-q', '');
  await sleep(150);
  ok((await rows(p2)).length === 23, 'xoá ô tìm: hiện lại hết');
  ok(await noHScroll(p2), 'không tràn ngang ở 390px (danh sách dài)');
  await shot(p2, 'lang-picker-long-390.png');

  // ---------------------------------------------------------------- 3. ?lang=ar (hidden, RTL)
  const p3 = await open(null, '?bundle=0&lang=ar', src);
  ok(await p3.evaluate(() => [window.I18N.lang, document.documentElement.lang, document.documentElement.dir].join(' ')) === 'ar ar rtl', '?lang=ar: mở được, <html lang="ar" dir="rtl">');
  await toLangPage(p3);
  r = await rows(p3);
  ok(r.some((x) => x.code === 'ar' && x.checked), 'ar (hidden) có trong danh sách khi đang dùng, đang chọn');
  // RTL: tên chữ Latin vẫn căn phải như cả trang (không bị dồn trái); dấu chọn ở bên trái
  const al = await p3.evaluate(() => {
    const row = document.querySelector('#lang-list [data-code="en"]'), name = row.querySelector('bdi'), tick = row.querySelector('.tick');
    const rr = row.getBoundingClientRect(), nr = name.getBoundingClientRect(), tr = tick.getBoundingClientRect();
    return { right: rr.right - nr.right, left: nr.left - rr.left, tick: tr.left - rr.left < rr.width / 2 };
  });
  ok(al.right < al.left && al.tick, 'RTL: "English" căn phải, dấu chọn bên trái ' + JSON.stringify(al));
  await shot(p3, 'lang-picker-ar-rtl-390.png');

  ok(!errors.length, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await finish();
})();
