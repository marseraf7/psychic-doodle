'use strict';
// Sẵn sàng cho chatbot AI (caro/otour-spec-io.js): lược đồ JSON khớp máy chủ, mô tả bằng lời, đọc cấu hình JSON
const test = require('node:test');
const assert = require('node:assert');
const IO = require('../../caro/otour-spec-io.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS, RESULTS } = require('../../caro/otour-sports.js');
const ST = require('../src/hub/stages.js');
const Spec = require('../src/hub/otour-spec.js');

// Chuỗi dịch tiếng Việt thật (để chắc mọi khoá describeSpec dùng đều có)
const D = {};
global.window = { I18N: { extend: (l, o) => { D[l] = Object.assign(D[l] || {}, o); } } };
require('../../caro/i18n-otour.js');
require('../../caro/i18n-otour-tpl.js');
require('../../caro/i18n-otour-playoff.js');
require('../../caro/i18n-otour-esports.js');
require('../../caro/i18n-otour-special.js');
require('../../caro/i18n-otour-cycling.js');
require('../../caro/i18n-otour-golf.js');
require('../../caro/i18n-otour-next.js');
require('../../caro/i18n-otour-multi.js');
require('../../caro/i18n-otour-formats.js');
require('../../caro/i18n-otour-majors.js');
require('../../caro/i18n-otour-msi.js');
require('../../caro/i18n-otour-ties.js');
require('../../caro/i18n-otour-graph.js');
require('../../caro/i18n-otour-swiss.js');
delete global.window;
const missing = new Set();
const T = (lang) => (k, a = {}) => { const s = D[lang][k]; if (s == null) { missing.add(lang + ':' + k); return k; } return s.replace(/\{(\w+)\}/g, (_, x) => (a[x] != null ? a[x] : '')); };

test('Lược đồ JSON khớp máy chủ: bộ môn, kiểu kết quả, tie-break, thể thức', () => {
  const p = IO.SCHEMA.properties;
  assert.deepStrictEqual(p.sport.enum, Object.keys(SPORTS));
  assert.deepStrictEqual(p.result.enum, RESULTS);
  assert.deepStrictEqual(IO.TIEBREAKS, ST.TIEBREAKS, 'tie-break như stages-tiebreak.js');
  assert.deepStrictEqual(p.stages.items.properties.type.enum, [...ST.TYPES, 'race', ...ST.Kinds.TYPES]);
  // Mọi khoá mẫu giải dùng đều có trong lược đồ
  const keys = new Set(Object.keys(p.stages.items.properties));
  for (const tpl of TP.TEMPLATES) for (const c of TP.specOf(tpl, SPORTS).stages) for (const k of Object.keys(c)) assert.ok(keys.has(k), `${tpl.id}: khoá ${k} có trong lược đồ`);
  // Cả các giải con của mẫu giải tổng (bảng GSL, điểm hạ gục, match point, vào thẳng giai đoạn 3)
  for (const g of TP.byId('esports_world_cup').multi.games) for (const c of TP.specOf(g, SPORTS).stages) for (const k of Object.keys(c)) assert.ok(keys.has(k), `${g.key}: khoá ${k} có trong lược đồ`);
});

test('describeSpec: mọi mẫu giải mô tả được bằng lời (đủ chuỗi 4 ngôn ngữ); parseSpec đọc lại cấu hình xuất ra', () => {
  for (const lang of ['vi', 'en', 'ru', 'zh']) {
    for (const tpl of TP.TEMPLATES) {
      const spec = Spec.normalizeSpec(TP.specOf(tpl, SPORTS));
      const lines = IO.describeSpec(spec, T(lang));
      assert.ok(lines.length >= 1 + spec.stages.length, tpl.id);
      assert.ok(lines.every((x) => !/\{\w+\}/.test(x)), `${lang} ${tpl.id}: không còn {chỗ trống}`);
    }
  }
  assert.deepStrictEqual([...missing], [], 'đủ chuỗi dịch');
  const cl = IO.describeSpec(Spec.normalizeSpec(TP.specOf(TP.byId('champions_league'), SPORTS)), T('vi'));
  assert.match(cl.join(' | '), /vòng phân hạng: mỗi đội 8 trận, 4 nhóm hạt giống/);
  assert.match(cl.join(' | '), /24 đội đi tiếp/);
  assert.match(cl.join(' | '), /2 lượt/);
  // Đọc cấu hình: đúng / sai JSON / sai hình dạng / thể thức lạ; nhận cả { spec }
  const spec = TP.specOf(TP.byId('lol_worlds'), SPORTS);
  assert.deepStrictEqual(IO.parseSpec(JSON.stringify(spec)).spec.stages, spec.stages);
  assert.strictEqual(IO.parseSpec(JSON.stringify({ spec })).spec.sport, 'esports');
  assert.strictEqual(IO.parseSpec('{oops').error, 'ds_err_json');
  assert.strictEqual(IO.parseSpec('[1]').error, 'ds_err_shape');
  assert.strictEqual(IO.parseSpec('{"stages":[]}').error, 'srv_ot_spec_stages');
  assert.strictEqual(IO.parseSpec('{"stages":[{"type":"ladder"}]}').error, 'ds_err_type');
  assert.strictEqual(IO.parseSpec('{"sport":"quidditch","stages":[{"type":"single"}]}').spec.sport, 'other');
});
