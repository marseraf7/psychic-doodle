'use strict';
// Thư viện mẫu giải dạng ô gọn + hộp chi tiết (caro/otour-tpl-art.js, otour-tpl-lib.js): nhóm mẫu, số đội từng giai đoạn,
// hình SVG từng kiểu thể thức, link giải thích thể thức, luật chơi bằng lời đủ 4 ngôn ngữ (không lộ {x}, undefined).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ART = require('../../caro/otour-tpl-art.js');
const TP = require('../../caro/otour-templates.js');
const IO = require('../../caro/otour-spec-io.js');
const { SPORTS } = require('../../caro/otour-sports.js');

// Chuỗi dịch thật của mọi file i18n-otour*.js (+ tên thể thức fmt_*), đủ 4 ngôn ngữ
const CARO = path.join(__dirname, '..', '..', 'caro');
const D = {};
global.window = { I18N: { extend: (l, o) => { D[l] = Object.assign(D[l] || {}, o); } } };
for (const f of fs.readdirSync(CARO).filter((x) => /^i18n-(otour.*|tour-stages)\.js$/.test(x))) require(path.join(CARO, f));
delete global.window;
const LANGS = ['vi', 'en', 'ru', 'zh'];
const missing = new Set();
const T = (lang) => (k, a = {}) => { const s = D[lang][k]; if (s == null) { missing.add(lang + ':' + k); return k; } return s.replace(/\{(\w+)\}/g, (_, x) => (a[x] != null ? a[x] : '{' + x + '}')); };
const LEAK = /\{\w+\}|undefined|NaN/;

test('Mỗi mẫu thuộc một nhóm, mọi nhóm đều có mẫu', () => {
  const seen = new Set(TP.TEMPLATES.map((x) => ART.category(x)));
  for (const c of seen) assert.ok(ART.CATS.includes(c), c);
  assert.deepStrictEqual([...seen].sort(), [...ART.CATS].sort());
  assert.strictEqual(ART.category(TP.byId('premier_league')), 'football');
  assert.strictEqual(ART.category(TP.byId('pgc')), 'br');
  assert.strictEqual(ART.category(TP.byId('cs_major')), 'esports');
  assert.strictEqual(ART.category(TP.byId('f1')), 'race');
  assert.strictEqual(ART.category(TP.byId('baku_open')), 'mind');
  assert.strictEqual(ART.category(TP.byId('nba')), 'sports');
});

test('Số đội từng giai đoạn suy từ thông số mẫu (bảng × đi tiếp, đội vào thẳng, Thụy Sĩ thắng 3 / thua 3)', () => {
  const n = (id) => ART.flow(TP.byId(id)).map((f) => [f.n, f.out, f.groups]);
  assert.deepStrictEqual(n('world_cup_2026'), [[48, 32, 12], [32, 0, 1]]); // 12 bảng × 2 + 8 đội hạng ba
  assert.deepStrictEqual(n('champions_league'), [[36, 24, 1], [24, 0, 1]]);
  assert.deepStrictEqual(n('lol_worlds'), [[2, 1, 1], [16, 8, 1], [8, 0, 1]]); // 15 đội vào thẳng vòng Thụy Sĩ
  assert.deepStrictEqual(n('cs_major'), [[16, 8, 1], [16, 8, 1], [16, 8, 1], [8, 0, 1]]);
  // Đua có dải hạng đi nhiều nơi: không ghi số đoán mò
  assert.strictEqual(ART.flow(TP.byId('pgc'))[1].n, 0);
  assert.strictEqual(ART.advanceOf({ type: 'single' }, 0), 0);
  assert.strictEqual(ART.advanceOf({ type: 'swiss', advance: 8 }, 20), 8);
  assert.strictEqual(ART.advanceOf({ type: 'swiss', record: { win: 3, lose: 2 } }, 16), 0);
  assert.strictEqual(ART.advanceOf({ type: 'roundrobin' }, 10), 0);
  assert.strictEqual(ART.advanceOf({ type: 'race', advance: 4, groups: 2 }, 20), 8);
  assert.strictEqual(ART.advanceOf({ type: 'race' }, 20), 0);
  assert.deepStrictEqual(ART.flow({ n: 8, stages: [{ type: 'single' }] }), [{ n: 8, groups: 1, out: 0, direct: 0 }]);
});

test('SVG cho mọi giai đoạn của mọi mẫu: đúng dạng, không NaN / undefined, có nhãn đọc màn hình', () => {
  const kinds = new Set();
  for (const x of TP.TEMPLATES) {
    const fl = ART.flow(x);
    x.stages.forEach((c, i) => {
      const s = ART.stageSvg(c, fl[i], 'Giai đoạn ' + (i + 1));
      kinds.add(ART.kind(c));
      assert.ok(s.startsWith('<svg') && s.endsWith('</svg>'), x.id);
      assert.ok(!LEAK.test(s), `${x.id} giai đoạn ${i + 1}: ${s.match(LEAK)}`);
      assert.match(s, /role="img" aria-label="Giai đoạn \d+"/);
    });
  }
  assert.deepStrictEqual([...kinds].sort(), ['double', 'ladder', 'race', 'rr', 'single', 'swiss']);
  // Vòng bảng nhiều bảng: vẽ 4 bảng + ghi tổng số bảng; Thụy Sĩ theo thắng – thua có ô 2-2
  assert.match(ART.stageSvg(TP.byId('world_cup_2026').stages[0], ART.flow(TP.byId('world_cup_2026'))[0]), />×12</);
  assert.match(ART.stageSvg(TP.byId('cs_major').stages[0], { n: 16 }), />2-2</);
  assert.match(ART.stageSvg({ type: 'race', events: 18, table: [10, 6, 5] }), />×18</);
  assert.match(ART.stageSvg({ type: 'swiss', rounds: 5 }), /^<svg/); // Thụy Sĩ theo số vòng
  assert.match(ART.stageSvg({ type: 'graph', shape: 'gauntlet', ladder: [{ bo: 3 }, { bo: 5 }] }), /class="a-on"/);
  assert.match(ART.stageSvg({ type: 'race', score: 'time' }), /^<svg/);
  // Bảng dài hơn số dòng vẽ: tô đi tiếp theo tỉ lệ (36 đội, 24 đi tiếp → 7 / 10 dòng)
  const cl = ART.stageSvg(TP.byId('champions_league').stages[0], ART.flow(TP.byId('champions_league'))[0]);
  assert.strictEqual((cl.match(/class="a-on"/g) || []).length, 7 * 2);
});

test('Link giải thích thể thức: Wikipedia đúng ngôn ngữ, không có bài thì tiếng Anh; mỗi kiểu một link; đua không có link', () => {
  const st = TP.byId('lol_worlds').stages; // vòng tròn → Thụy Sĩ → loại trực tiếp
  for (const l of LANGS) {
    const ls = ART.links(st, l);
    assert.deepStrictEqual(ls.map((x) => x.key), ['rr', 'swiss', 'single']);
    for (const x of ls) assert.match(x.url, new RegExp(`^https://${x.lang}\\.wikipedia\\.org/wiki/`));
  }
  assert.strictEqual(ART.links(st, 'vi')[2].lang, 'en'); // chưa có bài tiếng Việt về loại trực tiếp
  assert.strictEqual(ART.links(st, 'ru')[1].url, 'https://ru.wikipedia.org/wiki/' + encodeURIComponent('Швейцарская_система'));
  assert.deepStrictEqual(ART.links(TP.byId('f1').stages, 'en'), []);
  assert.deepStrictEqual(ART.links([{ type: 'graph', shape: 'page' }, { type: 'double' }], 'zh').map((x) => x.key), ['page', 'double']);
  assert.deepStrictEqual(ART.links(null, 'vi'), []);
});

test('Luật chơi của mọi mẫu đủ 4 ngôn ngữ, sinh từ chính cấu hình mẫu (mỗi giai đoạn một câu), không lộ {x}', () => {
  for (const l of LANGS) {
    const t = T(l);
    for (const x of TP.TEMPLATES) {
      const intro = t('tpl_' + x.id + '_d');
      const lines = IO.describeSpec({ ...TP.specOf(x, SPORTS), n: x.n }, t);
      assert.ok(intro && !LEAK.test(intro), `${l} ${x.id}: ${intro}`);
      for (const s of lines) assert.ok(!LEAK.test(s), `${l} ${x.id}: ${s}`);
      assert.ok(lines.length >= x.stages.length + 1, `${l} ${x.id}: thiếu câu cho giai đoạn`);
    }
  }
  assert.deepStrictEqual([...missing], []);
});

test('Chuỗi mới (otl_*, otn_*) đủ 4 ngôn ngữ, cùng biến', () => {
  const keys = Object.keys(D.vi).filter((k) => /^ot[ln]_/.test(k));
  assert.ok(keys.length > 50);
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const l of LANGS) for (const k of keys) {
    assert.ok(typeof D[l][k] === 'string' && D[l][k].trim(), `${l}:${k}`);
    assert.strictEqual(vars(D[l][k]), vars(D.vi[k]), `${l}:${k}`);
  }
  // Tên thể thức và nhãn kiểu hình dùng trong hộp / thẻ chọn nhanh đều có
  for (const l of LANGS) {
    for (const k of ['rr', 'groups', 'single', 'double', 'swiss', 'race', 'ladder']) assert.ok(D[l]['otl_k_' + k], l + k);
    for (const k of ART.CATS) assert.ok(D[l]['otl_cat_' + k], l + k);
    for (const k of ['single', 'double', 'roundrobin', 'swiss', 'groups_single', 'swiss_single']) assert.ok(D[l]['fmt_' + k] && D[l]['otn_fmt_' + k + '_h'], l + k);
  }
});
