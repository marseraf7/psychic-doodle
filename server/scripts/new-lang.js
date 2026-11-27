#!/usr/bin/env node
/*
 * Tạo khung cho một ngôn ngữ giao diện mới (docs/quy-trinh-them-ngon-ngu.md). Claude chạy bước này rồi mới giao việc dịch.
 *
 *   node server/scripts/new-lang.js add <mã> [--intl xx-YY] [--dry-run]
 *   node server/scripts/new-lang.js status <mã> <hidden|mt-draft|reviewed>
 *
 * add: lấy dữ liệu từ CLDR qua ICU của Node (Node 20+ có full-icu – CLDR 48 ở Node 22): tên tự gọi (autonym), chữ viết,
 *      hướng chữ (rtl), các loại số nhiều. KHÔNG tự gõ tay danh sách, KHÔNG lấy tên từ dịch máy. Rồi:
 *        – chèn vào caro/langs.js (trên dòng `// @new-lang`) với status 'hidden' (chưa hiện ở ô chọn, chưa vào hreflang);
 *        – tạo caro/i18n/<mã>/core.js (i18n_files: '' – chưa dịch file nào);
 *        – tạo docs/dich/<mã>.md: bảng thuật ngữ + danh sách việc cho người dịch.
 *      Không bao giờ ghi đè file / mục đã có. In báo cáo: đã tạo / bỏ qua / việc còn phải làm tay.
 * status: đổi status trong langs.js và danh sách mặc định của fromTag (= ngôn ngữ đang hiện – bài thử i18n-langs bắt lệch).
 *      Chỉ đổi sang 'mt-draft' / 'reviewed' khi ngôn ngữ đã dịch đủ (i18n_files: 'all') – bài thử i18n-script bắt.
 *
 * Mã: chữ thường 2–3 ký tự ISO 639 (+ "-Xxxx" chữ viết, + "-YY" vùng nếu thật sự cần), vd. es, ar, fil, pt-BR, sr-Latn.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LANGS_FILE = path.join(ROOT, 'caro', 'langs.js');
const MARK = '    // @new-lang';
const STATUSES = ['hidden', 'mt-draft', 'reviewed'];
const CODE_RE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;

/** Viết hoa chữ đầu theo đúng ngôn ngữ (español → Español; chữ không có hoa / thường giữ nguyên). */
const cap = (s, code) => (s ? s.charAt(0).toLocaleUpperCase(code) + s.slice(1) : s);

/** Dữ liệu CLDR của mã (qua Intl) hoặc ném lỗi nếu ICU không biết ngôn ngữ này. */
function cldrInfo(code, intlOpt) {
  if (!CODE_RE.test(code)) throw new Error(`Mã "${code}" không đúng dạng (vd. es, fil, pt-BR, sr-Latn)`);
  const own = new Intl.DisplayNames([code], { type: 'language', fallback: 'none' }).of(code);
  const en = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(code);
  if (!own || !en || own === code) throw new Error(`ICU / CLDR của Node không có tên tự gọi cho "${code}" – cần người bản xứ cung cấp, không tự đoán`);
  const loc = new Intl.Locale(code);
  const max = loc.maximize();
  const ti = typeof loc.getTextInfo === 'function' ? loc.getTextInfo() : loc.textInfo;
  if (!ti || !ti.direction) throw new Error('Node này không có Intl.Locale textInfo – dùng Node 20+');
  const intl = intlOpt || (max.region ? `${max.language}-${max.region}` : code);
  if (!Intl.DateTimeFormat.supportedLocalesOf([intl]).length) throw new Error(`Intl không hỗ trợ "${intl}" – chọn --intl khác`);
  const region = intl.split('-')[1] || '';
  return {
    code,
    name: cap(own, code),
    english: en,
    html: code,
    intl,
    google: max.language, // nút Google nhận mã ngôn ngữ trần (zh_CN / zh_TW / pt_BR thì sửa tay nếu cần)
    og: region ? `${max.language}_${region}` : max.language,
    script: max.script,
    rtl: ti.direction === 'rtl',
    plurals: new Intl.PluralRules(intl).resolvedOptions().pluralCategories,
  };
}

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
/** Dòng khai báo trong LIST của caro/langs.js (status 'hidden'). */
function entryLine(x) {
  return `    { code: ${q(x.code)}, name: ${q(x.name)}, html: ${q(x.html)}, intl: ${q(x.intl)}, google: ${q(x.google)}, og: ${q(x.og)}, fallback: 'en', dir: true, script: ${q(x.script)},${x.rtl ? ' rtl: true,' : ''} status: 'hidden' },`;
}

/** Chèn dòng vào langs.js (nguồn src) → src mới; ném lỗi nếu mã đã có hoặc mất dòng đánh dấu. */
function addToLangs(src, x) {
  if (new RegExp(`code: '${x.code}'`).test(src)) throw new Error(`caro/langs.js đã có "${x.code}"`);
  if (!src.includes(MARK)) throw new Error('caro/langs.js mất dòng "// @new-lang"');
  return src.replace(MARK, entryLine(x) + '\n' + MARK);
}

/** Đổi status của mã trong langs.js và đồng bộ danh sách mặc định của fromTag (= các mã không 'hidden'). */
function setStatus(src, code, status) {
  if (!STATUSES.includes(status)) throw new Error(`status phải là ${STATUSES.join(' | ')}`);
  const re = new RegExp(`(\\{ code: '${code.replace(/-/g, '\\-')}',[^\\n]*status: ')([a-z-]+)(')`);
  if (!re.test(src)) throw new Error(`caro/langs.js không có "${code}"`);
  src = src.replace(re, `$1${status}$3`);
  const shown = [...src.matchAll(/\{ code: '([^']+)',[^\n]*status: '([a-z-]+)'/g)].filter((m) => m[2] !== 'hidden').map((m) => m[1]);
  return src.replace(/const all = codes \|\| \[[^\]]*\];/, `const all = codes || [${shown.map(q).join(', ')}];`);
}

function coreJs(x) {
  return `// ${x.english} (${x.code}) – chuỗi lõi của caro/i18n.js. Mỗi file trong thư mục này soi gương một file caro/i18n-<chủ đề>.js
// (cùng khoá, cùng biến {x}); văn phong + thuật ngữ: docs/dich/${x.code}.md và docs/van-phong-4-ngon-ngu.md.
window.I18N.extend(${q(x.code)}, {
  i18n_files: '', // các chủ đề đã dịch, cách nhau dấu cách (vd. 'online play'); đủ hết thì 'all' – i18n.js, bài thử i18n-langs
});
`;
}

function guideMd(x) {
  const plural = x.plurals.join(', ');
  return `# ${x.name} (${x.code}) – ghi chú dịch

Tạo bằng \`node server/scripts/new-lang.js add ${x.code}\` (dữ liệu CLDR qua ICU của Node). Quy trình: \`docs/quy-trinh-them-ngon-ngu.md\`.

| Mục | Giá trị |
| --- | --- |
| Tên tự gọi (CLDR) | ${x.name} – **người bản xứ xác nhận** trước khi đổi status |
| Tên tiếng Anh | ${x.english} |
| Chữ viết (ISO 15924) | ${x.script} |
| Hướng chữ | ${x.rtl ? '**phải sang trái (RTL)**' : 'trái sang phải'} |
| Loại số nhiều (CLDR) | ${plural} |
| Intl (ngày giờ, số) | ${x.intl} |
| Trạng thái | hidden (chưa hiện ở ô chọn) |

## Thuật ngữ (điền trước khi dịch)

| Tiếng Anh | ${x.name} | Ghi chú |
| --- | --- | --- |
| Caro | Caro | giữ chữ Latin; lần đầu giải thích "Caro (cờ năm quân kiểu Việt Nam)" |
| Gomoku / Renju | | |
| X / O (quân) | X / O | giữ nguyên |
| five in a row | | |
| undo | | nghĩa "hoàn tác nước vừa đi", không phải "chơi lại" |
| resign | | |
| draw | | |
| rematch | | |
| tournament / bracket / round | | |
| rating (Elo) | | |
| puzzle | | |
| room / room code | | |

## Số nhiều

Ngôn ngữ này có các loại: **${plural}**. Mặc định viết theo mẫu "Nhãn: {n}" để không phải chia số nhiều. Khi cần đúng ngữ
pháp, thêm dạng riêng cạnh khoá gốc (chỉ với chuỗi có \`{n}\`): \`'khoá|one': '…'\`, \`'khoá|few': '…'\` – i18n.js tự chọn theo
Intl.PluralRules; thiếu dạng thì dùng khoá gốc.

## Danh sách việc

- [ ] Điền bảng thuật ngữ ở trên.
- [ ] Dịch từng file \`caro/i18n-<chủ đề>.js\` → \`caro/i18n/${x.code}/<chủ đề>.js\`; thêm tên chủ đề vào \`i18n_files\` của \`core.js\`.
- [ ] Đủ hết thì \`i18n_files: 'all'\`.
- [ ] Chữ phía máy chủ \`server/src/i18n/${x.code}.js\` (mẫu \`server/src/i18n/ja.js\`).
- [ ] Trang tĩnh privacy / connector / licenses / api (xem \`docs/van-phong-4-ngon-ngu.md\`, mục "Thêm ngôn ngữ").
${x.rtl ? '- [ ] Kiểm RTL: `E2E_LANG=' + x.code + ' node caro/tests/e2e/rtl-layout.e2e.js` (Claude).\n' : ''}- [ ] Phông theo chữ viết nếu chữ ${x.script} thiếu trên máy phổ biến (Claude – \`caro/lang-scripts.css\`).
- [ ] Bài thử: \`cd server && node --test test/i18n-langs.test.js test/i18n-script.test.js\` xanh.
- [ ] Ảnh chụp 390px: Trang chủ, trong ván, Cài đặt → Ngôn ngữ.
- [ ] Claude đổi status: \`node server/scripts/new-lang.js status ${x.code} mt-draft\`; có người bản xứ soát trong game thì \`reviewed\`.
`;
}

function writeNew(file, content, dry, report) {
  const rel = path.relative(ROOT, file);
  if (fs.existsSync(file)) { report.push(`bỏ qua (đã có): ${rel}`); return; }
  if (!dry) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
  report.push(`tạo: ${rel}`);
}

function main(argv) {
  const [cmd, code, ...rest] = argv;
  const dry = rest.includes('--dry-run');
  const iIntl = rest.indexOf('--intl');
  if (cmd === 'add' && code) {
    const x = cldrInfo(code, iIntl >= 0 ? rest[iIntl + 1] : null);
    const report = [];
    const src = fs.readFileSync(LANGS_FILE, 'utf8');
    if (new RegExp(`code: '${code}'`).test(src)) report.push('bỏ qua (đã có): caro/langs.js');
    else { if (!dry) fs.writeFileSync(LANGS_FILE, addToLangs(src, x)); report.push('thêm vào: caro/langs.js (status hidden)'); }
    writeNew(path.join(ROOT, 'caro', 'i18n', code, 'core.js'), coreJs(x), dry, report);
    writeNew(path.join(ROOT, 'docs', 'dich', code + '.md'), guideMd(x), dry, report);
    console.log(`${x.name} – ${x.english} (${code}) · chữ ${x.script} · ${x.rtl ? 'RTL' : 'LTR'} · số nhiều: ${x.plurals.join(', ')} · Intl ${x.intl}${dry ? ' · THỬ, không ghi' : ''}`);
    for (const r of report) console.log('  ' + r);
    console.log('Còn làm tay: tăng CACHE trong caro/sw.js; ' + (x.rtl ? 'kiểm RTL; ' : '') + 'phông theo chữ viết nếu cần; giao việc dịch (docs/quy-trinh-them-ngon-ngu.md).');
    return 0;
  }
  if (cmd === 'status' && code && rest[0]) {
    const src = fs.readFileSync(LANGS_FILE, 'utf8');
    fs.writeFileSync(LANGS_FILE, setStatus(src, code, rest[0]));
    console.log(`${code}: status ${rest[0]}. Chạy lại: cd server && node --test test/i18n-langs.test.js test/i18n-script.test.js`);
    return 0;
  }
  console.error('Dùng: new-lang.js add <mã> [--intl xx-YY] [--dry-run] | new-lang.js status <mã> <hidden|mt-draft|reviewed>');
  return 2;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error('Lỗi: ' + e.message); process.exitCode = 1; }
}
module.exports = { cldrInfo, entryLine, addToLangs, setStatus, coreJs, guideMd, CODE_RE };
