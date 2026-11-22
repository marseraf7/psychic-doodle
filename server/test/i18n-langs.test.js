/*
 * Ngôn ngữ thư mục (caro/langs.js `dir`: zh-Hant, ja, ko, cs) – quy trình ở docs/van-phong-4-ngon-ngu.md, mục "Thêm ngôn ngữ":
 *   – danh sách ngôn ngữ, nhận ra ngôn ngữ trình duyệt (zh-TW → zh-Hant…), Accept-Language;
 *   – i18n.js: chọn ngôn ngữ, khoá thiếu lấy tiếng Anh (không phải tiếng Việt), trang từng file tự chèn i18n/<mã>/*.js;
 *   – caro/i18n/<mã>/<chủ đề>.js: soi gương file gốc i18n-<chủ đề>.js, chỉ extend đúng ngôn ngữ, không khoá thừa, biến {x}
 *     và thẻ HTML như bản gốc, không sót chữ Việt / Anh chưa dịch; ngôn ngữ "complete" (i18n_files: 'all' trong core.js)
 *     phải đủ mọi khoá; ngôn ngữ đang dịch: i18n_files liệt kê đúng các file đã có (trang từng file chỉ tải các file đó);
 *   – chữ phía máy chủ server/src/i18n/<mã>.js (og, move, mail, widget): đúng khoá, đúng biến.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Langs = require('../src/langs.js');
const { loadAll, loadDir, topicOf } = require('../scripts/i18n-load.js');

const CARO = path.join(__dirname, '..', '..', 'caro');
const { files: baseFiles, merged } = loadAll();
const report = (bad) => bad.slice(0, 15).join('\n') + (bad.length > 15 ? `\n… và ${bad.length - 15} chỗ nữa` : '');
const vars = (s) => [...new Set(String(s).match(/\{\w+\}/g) || [])].sort().join(',');
const tags = (s) => [...new Set((String(s).match(/<\/?([a-z][a-z0-9]*)/gi) || []).map((t) => t.replace(/[</]/g, '').toLowerCase()))];
const DIRS = Langs.DIR.map((l) => ({ l, ...loadDir(l) })).filter((d) => d.files.length);
const CJK = /[぀-ヿ㐀-鿿가-힯豈-﫿]/;
// Từ tiếng Anh được giữ nguyên trong mọi ngôn ngữ (tên riêng, viết tắt, thuật ngữ quốc tế)
const KEEP = new Set(('caro gomoku renju swap swap2 soosorv taraguchi yamaguchi elo glicko buchholz sonneborn berger koya bo1 bo3 bo5 bo7 '
  + 'pdf png svg csv json ical url api mcp claude google telegram vk zalo messenger discord facebook youtube twitch github rapfi nnue '
  + 'gomocup vcf vct boat lichess fide wasm webassembly ios android chrome safari firefox ok id oauth http https www html').split(' '));

test('langs.js: 8 ngôn ngữ, tên tự gọi; trình duyệt và máy chủ dùng chung một danh sách', () => {
  assert.deepStrictEqual(Langs.LIST.map((x) => x.name), ['Tiếng Việt', 'English', 'Русский', '简体中文', '繁體中文', '日本語', '한국어', 'Čeština']);
  assert.deepStrictEqual(Langs.INLINE, ['vi', 'en', 'ru', 'zh']);
  assert.deepStrictEqual(Langs.DIR, ['zh-Hant', 'ja', 'ko', 'cs']);
  for (const l of Langs.DIR) assert.strictEqual(Langs.fallback(l), 'en', l + ': thiếu khoá thì tiếng Anh');
  assert.strictEqual(Langs.BY.zh.hreflang, 'zh-Hans');
  assert.strictEqual(Langs.BY['zh-Hant'].hreflang, 'zh-Hant');
  for (const x of Langs.LIST) assert.ok(/^[a-z]{2}(-[A-Z][a-z]{3})?$/.test(x.code) && x.intl && x.og && x.google && x.html, x.code);
});

test('fromTag: zh-TW / zh-HK / Hant → phồn thể, zh-CN / zh-SG / Hans → giản thể; Accept-Language theo q', () => {
  const want = {
    'zh-TW': 'zh-Hant', 'zh-HK': 'zh-Hant', 'zh-MO': 'zh-Hant', 'zh-Hant': 'zh-Hant', 'zh-Hant-TW': 'zh-Hant', zh_TW: 'zh-Hant', yue: 'zh-Hant',
    zh: 'zh', 'zh-CN': 'zh', 'zh-SG': 'zh', 'zh-Hans': 'zh', 'zh-Hans-HK': 'zh', 'ja-JP': 'ja', ja: 'ja', 'ko-KR': 'ko', 'cs-CZ': 'cs',
    'en-US': 'en', en_GB: 'en', 'vi-VN': 'vi', 'ru-RU': 'ru', fr: null, '': null, 'zh-hant': 'zh-Hant', sk: null,
  };
  for (const [t, l] of Object.entries(want)) assert.strictEqual(Langs.fromTag(t), l, t);
  assert.strictEqual(Langs.fromTag('zh-TW', ['vi', 'zh']), 'zh', 'chỉ có giản thể: không chọn mã không có');
  assert.strictEqual(Langs.fromAccept('fr-FR,ja;q=0.8,en;q=0.9'), 'en');
  assert.strictEqual(Langs.fromAccept('zh-TW,zh;q=0.9'), 'zh-Hant');
  assert.strictEqual(Langs.fromAccept('ja;q=0,ko;q=0.5'), 'ko');
  assert.strictEqual(Langs.fromAccept('de'), null);
  assert.strictEqual(Langs.pick({ vi: 1, en: 2 }, 'ja'), 2, 'pick: ngôn ngữ thư mục chưa có → tiếng Anh');
  assert.strictEqual(Langs.pick({ vi: 1, en: 2 }, '__proto__'), 1, 'pick: mã lạ → tiếng Việt');
});

/** Chạy caro/i18n.js (sau langs.js) trong vm với DOM giả. */
function runI18n({ stored = null, languages = ['vi'], search = '', packs = null, current = null } = {}) {
  const writes = [], added = [], events = {};
  const window = { CARO_PACKS: packs, CARO_PACK: packs ? Object.keys(packs)[0] : undefined, dispatchEvent() {} };
  const document = {
    readyState: 'loading', currentScript: current, documentElement: {}, title: '',
    write: (s) => writes.push(s), querySelectorAll: () => [], addEventListener: (k, f) => { events[k] = f; },
    createElement: () => ({}), head: { appendChild: (s) => added.push(s) },
  };
  const ctx = { window, document, navigator: { languages }, location: { search }, localStorage: { getItem: () => stored, setItem() {} }, Event: function () {} };
  vm.runInNewContext(fs.readFileSync(path.join(CARO, 'langs.js'), 'utf8'), { window, globalThis: window });
  vm.runInNewContext(fs.readFileSync(path.join(CARO, 'i18n.js'), 'utf8'), ctx);
  return { I18N: window.I18N, writes, added, document, events };
}

test('i18n.js: chọn ngôn ngữ (trình duyệt, ?lang=, đã lưu); thiếu khoá thì tiếng Anh; ô chọn có đủ 8 ngôn ngữ', () => {
  assert.strictEqual(runI18n({ languages: ['zh-TW', 'en'] }).I18N.lang, 'zh-Hant');
  assert.strictEqual(runI18n({ languages: ['zh-CN'] }).I18N.lang, 'zh');
  assert.strictEqual(runI18n({ languages: ['fr', 'ja-JP'] }).I18N.lang, 'ja');
  assert.strictEqual(runI18n({ search: '?lang=zh-Hant', stored: 'vi' }).I18N.lang, 'zh-Hant');
  assert.strictEqual(runI18n({ search: '?x=1&lang=ko' }).I18N.lang, 'ko');
  assert.strictEqual(runI18n({ stored: 'cs', languages: ['vi'] }).I18N.lang, 'cs');
  assert.strictEqual(runI18n({ stored: 'xx', languages: ['de'] }).I18N.lang, 'vi');
  const { I18N, document } = runI18n({ stored: 'ja' });
  assert.strictEqual(JSON.stringify(I18N.LANGS.map((x) => x[1])), JSON.stringify(Langs.LIST.map((x) => x.name)));
  I18N.extend('vi', { k_a: 'Việt A', k_b: 'Việt B', k_c: 'Việt C {n}' });
  I18N.extend('en', { k_a: 'English A', k_c: 'English C {n}' });
  I18N.extend('ja', { k_a: '日本語 A' });
  assert.strictEqual(I18N.t('k_a'), '日本語 A');
  assert.strictEqual(I18N.t('k_c', { n: 3 }), 'English C 3', 'ja thiếu khoá: tiếng Anh');
  assert.strictEqual(I18N.t('k_b'), 'Việt B', 'tiếng Anh cũng thiếu: tiếng Việt');
  assert.strictEqual(I18N.t('btn_new'), 'New game', 'chuỗi lõi chưa có bản ja: tiếng Anh');
  assert.strictEqual(I18N.locale, 'ja-JP');
  assert.strictEqual(I18N.googleLocale, 'ja');
  I18N.apply(document);
  assert.strictEqual(document.documentElement.lang, 'ja');
  const zt = runI18n({ stored: 'zh-Hant' });
  zt.I18N.apply(zt.document);
  assert.strictEqual(zt.document.documentElement.lang, 'zh-Hant');
  assert.strictEqual(zt.I18N.locale, 'zh-TW');
});

test('i18n.js trang từng file: chèn i18n/<mã>/core.js và i18n/<mã>/<chủ đề>.js đúng lúc; đổi ngôn ngữ thì tải rồi mới đổi', () => {
  const cur = { src: 'http://x/i18n.js', async: false, defer: false };
  const r = runI18n({ stored: 'ja', current: cur });
  assert.deepStrictEqual(r.writes, ['<script src="i18n/ja/core.js"><\/script>']);
  r.document.currentScript = { src: 'http://x/i18n/ja/core.js', async: false, defer: false };
  r.I18N.extend('ja', { i18n_files: 'tour' }); // core.js: chủ đề đã dịch
  r.document.currentScript = { src: 'http://x/i18n-play.js', async: false, defer: false };
  r.I18N.extend('vi', { b: 'x' });
  assert.strictEqual(r.writes.length, 1, 'chủ đề chưa dịch (không có trong i18n_files): không tải – không lỗi 404');
  r.document.currentScript = { src: 'http://x/i18n-tour.js?v=1', async: false, defer: false };
  r.I18N.extend('vi', { a: 'x' });
  r.I18N.extend('en', { a: 'y' });
  assert.deepStrictEqual(r.writes.slice(1), ['<script src="i18n/ja/tour.js"><\/script>'], 'mỗi chủ đề chèn một lần');
  r.document.currentScript = { src: 'http://x/i18n/ja/tour.js', async: false, defer: false };
  r.I18N.extend('ja', { a: 'あ' });
  assert.strictEqual(r.writes.length, 2, 'file thư mục không chèn thêm');
  // i18n_files: 'all' – mọi chủ đề
  const a = runI18n({ stored: 'ja', current: cur });
  a.I18N.extend('ja', { i18n_files: 'all' });
  a.document.currentScript = { src: 'http://x/i18n-play.js', async: false, defer: false };
  a.I18N.extend('vi', { b: 'x' });
  assert.strictEqual(a.writes[1], '<script src="i18n/ja/play.js"><\/script>');
  // Ngôn ngữ gốc: không chèn gì
  const v = runI18n({ stored: 'vi', current: cur });
  v.document.currentScript = { src: 'http://x/i18n-tour.js', async: false, defer: false };
  v.I18N.extend('vi', { a: 'x' });
  assert.deepStrictEqual(v.writes, []);
  // Đổi sang ko lúc đang dùng: tải core + các chủ đề đã có trên trang, xong mới đổi
  v.document.readyState = 'complete';
  v.document.currentScript = { src: 'http://x/i18n-play.js', async: false, defer: false };
  v.I18N.extend('vi', { b: 'x' });
  v.I18N.setLang('ko');
  assert.strictEqual(v.added.map((s) => s.src).join(), 'i18n/ko/core.js', 'core.js trước');
  v.I18N.extend('ko', { i18n_files: 'tour' });
  v.added[0].onload();
  assert.strictEqual(v.added.map((s) => s.src).join(), 'i18n/ko/core.js,i18n/ko/tour.js', 'rồi các chủ đề đã dịch có trên trang');
  assert.strictEqual(v.I18N.lang, 'vi', 'chưa tải xong: chưa đổi');
  v.I18N.extend('ko', { a: '가' });
  v.added[1].onload();
  assert.strictEqual(v.I18N.lang, 'ko');
  assert.strictEqual(v.I18N.t('a'), '가');
  // Bản gộp: không chèn file thư mục (đã nằm trong gói)
  const b = runI18n({ stored: 'ja', current: cur, packs: { ja: 'b/i18n-ja-0.js' } });
  assert.deepStrictEqual(b.writes, []);
});

test('caro/i18n/<mã>/: mỗi file soi gương một file gốc, chỉ extend đúng ngôn ngữ, không khoá thừa', () => {
  const topics = new Map(baseFiles.map((f) => [topicOf(f.file), f.langs.vi]));
  const bad = [];
  for (const d of DIRS) {
    if (!d.status) bad.push(`i18n/${d.l}/core.js: thiếu khoá i18n_files ('all' hoặc danh sách chủ đề đã dịch)`);
    if (d.listed) {
      const have = d.files.map((f) => f.topic).filter((t) => t !== 'core').sort();
      if (have.join(' ') !== [...d.listed].sort().join(' ')) bad.push(`i18n/${d.l}/core.js: i18n_files '${d.listed.join(' ')}' ≠ các file đã có '${have.join(' ')}'`);
    }
    for (const f of d.files) {
      if (!topics.has(f.topic)) { bad.push(`${f.file}: không có file gốc ${f.topic === 'core' ? 'i18n.js' : 'i18n-' + f.topic + '.js'}`); continue; }
      if (f.other.length) bad.push(`${f.file}: extend cho ngôn ngữ khác (${f.other.join(', ')})`);
      const vi = topics.get(f.topic);
      for (const k of Object.keys(f.strings)) if (!(k in vi)) bad.push(`${f.file}: khoá ${k} không có trong file gốc (đã xoá / đổi tên?)`);
    }
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Ngôn ngữ "complete" có đủ mọi khoá của từng file gốc', () => {
  const bad = [];
  for (const d of DIRS.filter((x) => x.status === 'complete')) {
    const mine = new Map(d.files.map((f) => [f.topic, f.strings]));
    for (const f of baseFiles) {
      const t = topicOf(f.file), have = mine.get(t) || {};
      for (const k of Object.keys(f.langs.vi)) if (!(k in have)) bad.push(`${d.l}: thiếu ${k} (i18n/${d.l}/${t}.js)`);
    }
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Ngôn ngữ thư mục: biến {x}, thẻ HTML, khoảng trắng như bản gốc', () => {
  const bad = [];
  for (const d of DIRS) {
    for (const f of d.files) {
      for (const [k, s] of Object.entries(f.strings)) {
        const vi = merged.vi[k], en = merged.en[k];
        if (vi == null) continue;
        const id = `${d.l}.${k}`;
        if (typeof s !== 'string' || !s.trim()) { bad.push(`${id}: rỗng`); continue; }
        if (vars(s) !== vars(vi)) bad.push(`${id}: biến ${vars(s)} ≠ vi ${vars(vi)}`);
        const allowed = new Set([...tags(vi), ...tags(en)]);
        for (const t of tags(s)) if (!allowed.has(t)) bad.push(`${id}: thẻ <${t}> không có ở bản gốc`);
        if (/^\s/.test(s) && !/^ [·–—(]/.test(s)) bad.push(`${id}: khoảng trắng đầu chuỗi`);
        if (/^ [·–—(]/.test(en || '') && !/^ /.test(s)) bad.push(`${id}: bản gốc bắt đầu bằng " · …" (phần nối thêm) – giữ dấu cách đầu`);
        if (/\s$/.test(s)) bad.push(`${id}: khoảng trắng cuối chuỗi`);
        if (/[^\s] {2,}[^\s]/.test(s)) bad.push(`${id}: hai dấu cách liền nhau`);
      }
    }
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Ngôn ngữ thư mục: không sót chữ Việt / chữ Anh chưa dịch; ja, zh-Hant dùng dấu câu toàn khổ', () => {
  const VI = /[ăâđêôơưĂÂĐÊÔƠƯẠ-ỹ]/;
  const bad = [];
  for (const d of DIRS) {
    for (const [k, s0] of Object.entries(d.merged)) {
      const en = merged.en[k];
      if (en == null) continue;
      const s = s0.replace(/<[^>]+>/g, ' ').replace(/\{\w+\}/g, ' ');
      // Chữ có dấu tiếng Việt chỉ được giữ khi bản tiếng Anh cũng giữ (tên riêng: "Khá Bảnh", "Cờ Caro")
      for (const w of s.match(/[A-Za-zÀ-ỹ]+/g) || []) if (VI.test(w) && !String(en).includes(w)) bad.push(`${d.l}.${k}: chữ Việt «${w}»`);
      // Chưa dịch: giống hệt tiếng Anh, có từ tiếng Anh thường (không phải tên riêng / viết tắt trong KEEP)
      const words = (s.match(/[A-Za-z][A-Za-z']{2,}/g) || []).filter((w) => !KEEP.has(w.toLowerCase()) && w !== w.toUpperCase());
      if (s0 === en && words.length) bad.push(`${d.l}.${k}: giống hệt tiếng Anh «${String(en).slice(0, 40)}»`);
      else if (d.l !== 'cs' && !CJK.test(s) && words.length >= 2) bad.push(`${d.l}.${k}: không có chữ ${d.l} «${s0.slice(0, 40)}»`);
      if ((d.l === 'ja' || d.l === 'zh-Hant') && /[぀-ヿ㐀-鿿][,;:?!](?![\d/])/.test(s0)) bad.push(`${d.l}.${k}: dấu câu nửa khổ sau chữ Hán / kana «${s0.slice(0, 30)}»`);
    }
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Chữ phía máy chủ server/src/i18n/<mã>.js: đúng khoá, đúng biến; ngôn ngữ "complete" thì đủ', () => {
  const Og = require('../src/og-meta.js');
  const W = {};
  new Function('globalThis', fs.readFileSync(path.join(__dirname, '..', 'src', 'mcp', 'ui', 'widget-i18n.js'), 'utf8'))(W);
  const enOg = Og.STRINGS.en, enW = W.CARO_MCP_I18N.en;
  const bad = [];
  for (const l of Langs.DIR) {
    const file = path.join(__dirname, '..', 'src', 'i18n', l + '.js');
    if (!fs.existsSync(file)) continue;
    const T = Langs.serverTexts(l);
    const complete = (DIRS.find((d) => d.l === l) || {}).status === 'complete';
    for (const [name, en] of [['og', enOg], ['widget', enW]]) {
      const mine = T[name] || {};
      for (const k of Object.keys(mine)) if (!(k in en)) bad.push(`${l}.${name}.${k}: khoá thừa`); else if (vars(mine[k]) !== vars(en[k])) bad.push(`${l}.${name}.${k}: biến ${vars(mine[k])} ≠ ${vars(en[k])}`);
      if (complete) for (const k of Object.keys(en)) if (!(k in mine)) bad.push(`${l}.${name}.${k}: thiếu`);
    }
    if (T.move && (T.move.length !== 2 || !T.move[1].includes('{host}'))) bad.push(`${l}.move: [chữ, nút có {host}]`);
    for (const kind of ['verify', 'reset']) {
      const m = T.mail && T.mail[kind];
      if (!m) { if (complete) bad.push(`${l}.mail.${kind}: thiếu`); continue; }
      const body = typeof m.body === 'function' ? m.body('USER', '123456') : '';
      if (!m.subject || !body.includes('USER') || !body.includes('123456')) bad.push(`${l}.mail.${kind}: cần subject + body(u, c) có tên và mã`);
    }
    if (complete && !T.move) bad.push(`${l}.move: thiếu`);
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Trang tĩnh (privacy, connector, api, licenses): mục ngôn ngữ có mã của langs.js; mục thêm sau có data-label', () => {
  const bad = [];
  for (const page of ['privacy.html', 'connector.html', 'api.html', 'licenses.html']) {
    const html = fs.readFileSync(path.join(CARO, page), 'utf8');
    for (const m of html.matchAll(/<section id="([^"]+)" lang="([^"]+)"([^>]*)>/g)) {
      const x = Langs.BY[m[1]];
      if (!x) bad.push(`${page}: mục #${m[1]} không phải mã của langs.js`);
      else if (m[2] !== x.html) bad.push(`${page}: #${m[1]} lang="${m[2]}" – nên là "${x.html}"`);
      else if (x.dir && !/data-label="[^"]+"/.test(m[3])) bad.push(`${page}: #${m[1]} thiếu data-label (tên trên thanh ngôn ngữ)`);
    }
    if (!html.includes('<script src="langs.js"></script>')) bad.push(`${page}: thiếu langs.js trước privacy.js`);
  }
  assert.deepStrictEqual(bad, [], report(bad));
});
