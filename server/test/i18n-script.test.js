/*
 * Nền đa ngôn ngữ (docs/quy-trinh-them-ngon-ngu.md) – bổ sung cho i18n-langs.test.js:
 *   – caro/langs.js: script / rtl khớp CLDR (Intl của Node), status hợp lệ, fromTag mặc định = ngôn ngữ đang hiện;
 *     ngôn ngữ đang hiện (không 'hidden') phải dịch đủ; chữ viết không phải Latin có trong bảng SCRIPT_CHARS;
 *   – phông theo chữ viết (`font`): caro/lang-scripts.css có @font-face + :lang() đúng, tệp phông có thật;
 *   – số nhiều 'khoá|loại': loại có trong CLDR của ngôn ngữ, khoá gốc có {n}, cùng biến;
 *   – chuỗi dịch không chèn HTML nguy hiểm (script, on…=, javascript:, thuộc tính lạ) – mọi ngôn ngữ;
 *   – ô chọn ngôn ngữ (caro/lang-picker.js) và công cụ tạo khung (server/scripts/new-lang.js).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Langs = require('../../caro/langs.js');
const Picker = require('../../caro/lang-picker.js');
const NL = require('../scripts/new-lang.js');
const { loadAll, loadDir, SCRIPT_CHARS } = require('../scripts/i18n-load.js');

const CARO = path.join(__dirname, '..', '..', 'caro');
const { merged, files: baseFiles } = loadAll();
const report = (bad) => bad.slice(0, 15).join('\n') + (bad.length > 15 ? `\n… và ${bad.length - 15} chỗ nữa` : '');
const vars = (s) => [...new Set(String(s).match(/\{\w+\}/g) || [])].sort().join(',');
const STATUSES = ['reviewed', 'mt-draft', 'hidden'];

test('langs.js: script / rtl khớp CLDR, status hợp lệ, fromTag mặc định = ngôn ngữ đang hiện', () => {
  const bad = [];
  for (const x of Langs.LIST) {
    if (!STATUSES.includes(x.status)) bad.push(`${x.code}: status "${x.status}" (${STATUSES.join(' | ')})`);
    const max = new Intl.Locale(x.code).maximize();
    if (x.script !== max.script) bad.push(`${x.code}: script ${x.script} – CLDR: ${max.script}`);
    const loc = new Intl.Locale(x.code);
    const ti = typeof loc.getTextInfo === 'function' ? loc.getTextInfo() : loc.textInfo;
    if (ti.direction === 'rtl' !== !!x.rtl) bad.push(`${x.code}: rtl ${!!x.rtl} – CLDR: ${ti.direction}`);
    if (x.script !== 'Latn' && !SCRIPT_CHARS[x.script]) bad.push(`${x.code}: thêm chữ viết ${x.script} vào SCRIPT_CHARS (server/scripts/i18n-load.js)`);
    if (!Intl.DateTimeFormat.supportedLocalesOf([x.intl]).length) bad.push(`${x.code}: Intl không hỗ trợ ${x.intl}`);
  }
  assert.deepStrictEqual(bad, [], report(bad));
  assert.deepStrictEqual(Langs.SHOWN, Langs.LIST.filter((x) => x.status !== 'hidden').map((x) => x.code));
  // Danh sách mặc định của fromTag (viết tay vì bản gộp chép nguyên hàm) phải đúng bằng SHOWN
  const src = fs.readFileSync(path.join(CARO, 'langs.js'), 'utf8');
  const m = /const all = codes \|\| \[([^\]]*)\]/.exec(src);
  assert.deepStrictEqual(m[1].split(',').map((s) => s.trim().replace(/'/g, '')), Langs.SHOWN, 'chạy: node server/scripts/new-lang.js status <mã> <status>');
  assert.strictEqual(Langs.dirOf('vi'), 'ltr');
  assert.strictEqual(Langs.dirOf('xx'), 'ltr');
  assert.ok(src.includes('    // @new-lang'), 'giữ dòng đánh dấu cho new-lang.js');
});

test('Ngôn ngữ đang hiện ở ô chọn phải dịch đủ (i18n_files: \'all\'); ngôn ngữ gốc là "reviewed"', () => {
  const bad = [];
  for (const x of Langs.LIST) {
    if (!x.dir) { if (x.status !== 'reviewed') bad.push(`${x.code}: ngôn ngữ gốc phải là reviewed`); continue; }
    const d = loadDir(x.code);
    if (x.status !== 'hidden' && d.status !== 'complete') bad.push(`${x.code}: status ${x.status} nhưng chưa dịch đủ (i18n_files: '${(d.listed || []).join(' ')}') – để 'hidden' tới khi xong`);
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Phông theo chữ viết: langs.js `font` ↔ caro/lang-scripts.css (@font-face, unicode-range, swap, :lang) + tệp có thật', () => {
  const css = fs.readFileSync(path.join(CARO, 'lang-scripts.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const bad = [];
  for (const f of faces) {
    const fam = (/font-family\s*:\s*['"]([^'"]+)['"]/.exec(f) || [])[1];
    if (!/font-display\s*:\s*swap/.test(f)) bad.push(`@font-face ${fam}: thiếu font-display: swap`);
    if (!/unicode-range\s*:/.test(f)) bad.push(`@font-face ${fam}: thiếu unicode-range (người dùng ngôn ngữ khác không được tải)`);
    for (const u of f.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) if (!fs.existsSync(path.join(CARO, u[1]))) bad.push(`@font-face ${fam}: không có tệp ${u[1]}`);
    if (!Langs.LIST.some((x) => x.font === fam)) bad.push(`@font-face ${fam}: không ngôn ngữ nào dùng (thêm font: '${fam}' vào langs.js hoặc xoá)`);
  }
  for (const x of Langs.LIST.filter((y) => y.font)) {
    if (!faces.some((f) => new RegExp(`font-family\\s*:\\s*['"]${x.font}['"]`).test(f))) bad.push(`${x.code}: font '${x.font}' chưa có @font-face trong lang-scripts.css`);
    const rule = new RegExp(`:lang\\(${x.html}\\)\\s*\\{[^}]*--font\\s*:\\s*['"]${x.font}['"]`);
    if (!rule.test(css)) bad.push(`${x.code}: thiếu :lang(${x.html}) { --font: '${x.font}', … }`);
  }
  assert.deepStrictEqual(bad, [], report(bad));
  for (const p of ['index.html', 'embed.html', 'broadcast.html']) assert.ok(fs.readFileSync(path.join(CARO, p), 'utf8').includes('href="lang-scripts.css"'), p);
});

const dirLangs = Langs.DIR.map((l) => ({ l, ...loadDir(l) }));
/** Mọi chuỗi đã dịch: [ngôn ngữ, khoá, chuỗi] – ngôn ngữ gốc (caro/i18n*.js) + ngôn ngữ thư mục. */
const allStrings = () => [
  ...Object.entries(merged).flatMap(([l, d]) => Object.entries(d).map(([k, s]) => [l, k, s])),
  ...dirLangs.flatMap((d) => Object.entries(d.merged).map(([k, s]) => [d.l, k, s])),
];

test('Số nhiều "khoá|loại": loại có trong CLDR của ngôn ngữ, khoá gốc có {n}, cùng biến', () => {
  const bad = [];
  for (const [l, k, s] of allStrings()) {
    if (!k.includes('|')) continue;
    const [base, cat, more] = k.split('|');
    const cats = new Intl.PluralRules(Langs.BY[l].intl).resolvedOptions().pluralCategories;
    const ref = merged.vi[base];
    if (more !== undefined || !cats.includes(cat) || cat === 'other') bad.push(`${l}.${k}: loại "${cat}" không có trong ${l} (${cats.filter((c) => c !== 'other').join(', ')}; "other" = khoá gốc)`);
    else if (ref == null) bad.push(`${l}.${k}: không có khoá gốc ${base}`);
    else if (!/\{n\}/.test(ref)) bad.push(`${l}.${k}: khoá gốc không có {n} – số nhiều chỉ chọn theo {n}`);
    else if (vars(s) !== vars(ref) && vars(s) !== vars(ref).split(',').filter((v) => v !== '{n}').join(',')) bad.push(`${l}.${k}: biến ${vars(s)} ≠ ${vars(ref)}`);
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Chuỗi dịch không chèn HTML nguy hiểm; thẻ chỉ có thuộc tính như bản gốc', () => {
  const DANGER = /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|img|svg|math|form|input|base)\b|\son\w+\s*=|javascript\s*:|data\s*:\s*text\/html|srcdoc\s*=/i;
  const attrs = (s) => [...String(s).matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)].flatMap((m) => [...m[2].matchAll(/([a-z-]+)\s*=/gi)].map((a) => m[1].toLowerCase() + '@' + a[1].toLowerCase()));
  const bad = [];
  for (const [l, k, s] of allStrings()) {
    if (typeof s !== 'string') continue;
    if (DANGER.test(s)) bad.push(`${l}.${k}: có mã HTML nguy hiểm «${s.slice(0, 60)}»`);
    if (l === 'vi' || l === 'en') continue;
    const base = k.split('|')[0];
    const ok = new Set([...attrs(merged.vi[base] || ''), ...attrs(merged.en[base] || '')]);
    for (const a of attrs(s)) if (!ok.has(a)) bad.push(`${l}.${k}: thuộc tính ${a} không có ở bản gốc`);
    if (/href\s*=\s*["']?(?!https:\/\/|#|\/)/i.test(s) && !/href\s*=/i.test(merged.en[base] || '')) bad.push(`${l}.${k}: link lạ`);
  }
  assert.deepStrictEqual(bad, [], report(bad));
  assert.ok(baseFiles.length > 50);
});

test('Ô chọn ngôn ngữ: ẩn ngôn ngữ hidden (trừ đang dùng), tìm theo tên tự gọi / tên giao diện / mã, bỏ dấu', () => {
  const list = [{ code: 'vi', name: 'Tiếng Việt', status: 'reviewed' }, { code: 'cs', name: 'Čeština', status: 'mt-draft' }, { code: 'ar', name: 'العربية', status: 'hidden' }];
  assert.deepStrictEqual(Picker.items(list, 'vi').map((x) => x.code), ['vi', 'cs']);
  assert.deepStrictEqual(Picker.items(list, 'ar').map((x) => x.code), ['vi', 'cs', 'ar']);
  assert.strictEqual(Picker.norm(' Čeština '), 'cestina');
  assert.ok(Picker.matches({ ...list[1], local: 'Czech' }, 'ces'));
  assert.ok(Picker.matches({ ...list[1], local: 'Tiếng Séc' }, 'tieng sec'));
  assert.ok(Picker.matches({ ...list[2], local: 'Arabic' }, 'arab'));
  assert.ok(Picker.matches({ ...list[2], local: '' }, 'ar'), 'tìm theo mã');
  assert.ok(Picker.matches({ ...list[2], local: '' }, 'عرب'));
  assert.ok(!Picker.matches({ ...list[0], local: 'Vietnamese' }, 'czech'));
  assert.ok(Picker.matches({ ...list[0], local: '' }, ''), 'ô tìm trống: hiện hết');
  assert.strictEqual(Picker.SEARCH_MIN, 20);
});

test('new-lang.js: dữ liệu CLDR, chèn vào langs.js (hidden), đổi status đồng bộ fromTag; không bịa mã lạ', () => {
  const ar = NL.cldrInfo('ar');
  assert.deepStrictEqual([ar.name, ar.script, ar.rtl, ar.english], ['العربية', 'Arab', true, 'Arabic']);
  assert.ok(ar.plurals.includes('few') && ar.plurals.includes('zero'));
  assert.strictEqual(NL.cldrInfo('es').name, 'Español', 'viết hoa chữ đầu');
  assert.strictEqual(NL.cldrInfo('fil').rtl, false);
  assert.throws(() => NL.cldrInfo('xx'), /không có tên tự gọi/);
  assert.throws(() => NL.cldrInfo('EN'), /không đúng dạng/);
  const src0 = fs.readFileSync(path.join(CARO, 'langs.js'), 'utf8');
  const src1 = NL.addToLangs(src0, ar);
  assert.throws(() => NL.addToLangs(src1, ar), /đã có/);
  // Chạy được, ar hidden: không vào SHOWN / fromTag
  const load = (src) => { const m = { exports: {} }; new Function('module', 'window', 'globalThis', src)(m, undefined, {}); return m.exports; };
  const L1 = load(src1);
  assert.strictEqual(L1.BY.ar.status, 'hidden');
  assert.strictEqual(L1.dirOf('ar'), 'rtl');
  assert.ok(!L1.SHOWN.includes('ar') && L1.CODES.includes('ar') && L1.DIR.includes('ar'));
  assert.strictEqual(L1.fromTag('ar-EG'), null);
  const L2 = load(NL.setStatus(src1, 'ar', 'mt-draft'));
  assert.ok(L2.SHOWN.includes('ar'));
  assert.strictEqual(L2.fromTag('ar-EG'), 'ar', 'đổi status thì fromTag mặc định nhận luôn');
  const L3 = load(NL.setStatus(NL.setStatus(src1, 'ar', 'mt-draft'), 'ar', 'hidden'));
  assert.strictEqual(L3.fromTag('ar-EG'), null);
  assert.throws(() => NL.setStatus(src1, 'ar', 'done'), /status/);
  assert.throws(() => NL.setStatus(src1, 'xx', 'hidden'), /không có/);
  assert.ok(NL.coreJs(ar).includes("i18n_files: ''"));
  assert.ok(NL.guideMd(ar).includes('RTL') && NL.guideMd(ar).includes('few'));
});
