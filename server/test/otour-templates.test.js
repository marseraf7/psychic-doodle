'use strict';
// Thư viện mẫu giải nổi tiếng (caro/otour-templates.js): mỗi mẫu chuẩn hoá được, đúng cỡ, dựng được giai đoạn đầu
const test = require('node:test');
const assert = require('node:assert');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const Spec = require('../src/hub/otour-spec.js');
const ST = require('../src/hub/stages.js');

test('Mọi mẫu giải: chuẩn hoá được, đủ cỡ với số đội gợi ý, dựng được giai đoạn đầu', () => {
  const ids = new Set();
  for (const tpl of TP.TEMPLATES) {
    assert.ok(!ids.has(tpl.id), 'mã mẫu không trùng: ' + tpl.id);
    ids.add(tpl.id);
    assert.ok(SPORTS[tpl.sport], 'bộ môn có thật: ' + tpl.sport);
    const spec = Spec.normalizeSpec(TP.specOf(tpl, SPORTS));
    assert.strictEqual(spec.stages.length, tpl.stages.length, tpl.id);
    spec.stages.forEach((c, i) => assert.strictEqual(c.type, tpl.stages[i].type, `${tpl.id}: giai đoạn ${i + 1} giữ đúng thể thức`));
    const e = Spec.checkSize(spec, tpl.n);
    assert.ok(e.matches > 0, tpl.id);
    const seeds = TP.sampleTeams(tpl, 'T').map((_, i) => 'u' + i);
    const st = ST.buildStage(spec.stages[0], 0, seeds, { seedOf: (u) => seeds.indexOf(u) + 1, countryOf: (u) => (tpl.countries ? tpl.countries[seeds.indexOf(u) % tpl.countries.length] : '') });
    assert.ok(st.type === 'race' ? st.events.length > 0 : Object.keys(st.matches).length > 0, tpl.id + ': có trận / chặng');
  }
  // Con số đặc trưng của các mẫu nổi tiếng
  const est = (id) => Spec.checkSize(Spec.normalizeSpec(TP.specOf(TP.byId(id), SPORTS)), TP.byId(id).n).stages;
  assert.strictEqual(est('premier_league')[0].matches, 380, 'Premier League: 20 đội lượt đi – về = 380 trận');
  assert.deepStrictEqual([est('champions_league')[0].matches, est('champions_league')[0].advance], [144, 24], 'CL: 144 trận league phase, 24 đội đi tiếp');
  assert.deepStrictEqual([est('world_cup_2026')[0].matches, est('world_cup_2026')[0].advance], [72, 32], 'World Cup 2026: 72 trận vòng bảng, 32 đội vào loại trực tiếp');
  assert.deepStrictEqual([est('lol_worlds')[0].matches, est('lol_worlds')[0].advance], [33, 8], 'LoL Worlds: Thụy Sĩ 33 trận, 8 đội');
  assert.strictEqual(est('f1')[0].matches, 24, 'F1: 24 chặng');
  // Giải nhà nghề Mỹ: 2 nhánh vòng tròn rồi playoff
  assert.deepStrictEqual([est('nba')[0].matches, est('nba')[0].advance, est('nba')[1].matches], [420, 16, 15], 'NBA: 2 bảng 15 đội lượt đi – về, 16 đội playoff');
  assert.deepStrictEqual([est('nfl')[0].matches, est('nfl')[0].advance, est('nfl')[1].matches], [240, 14, 13], 'NFL: 2 bảng 16 đội một lượt, 14 đội playoff (2 đội miễn vòng đầu)');
  assert.deepStrictEqual([est('mlb')[0].advance, est('mlb')[1].matches], [12, 11], 'MLB: 12 đội playoff');
  assert.deepStrictEqual([est('nhl')[0].matches, est('nhl')[0].advance], [480, 16], 'NHL: 2 bảng 16 đội lượt đi – về, 16 đội playoff');
  assert.deepStrictEqual([est('mls')[0].matches, est('mls')[0].advance], [420, 16], 'MLS: 2 bảng 15 đội lượt đi – về, 16 đội playoff');
  // Bóng rổ / bóng chày / khúc côn cầu: loạt Bo theo trận, không luật set; MLB vòng đầu Bo5, bán kết – chung kết Bo7
  for (const id of ['nba', 'mlb', 'nhl']) {
    const sp = Spec.normalizeSpec(TP.specOf(TP.byId(id), SPORTS));
    assert.deepStrictEqual([sp.result, sp.set], ['sets', null], id + ': mỗi "set" là một trận trong loạt');
  }
  const mlb = Spec.normalizeSpec(TP.specOf(TP.byId('mlb'), SPORTS)).stages[1];
  assert.deepStrictEqual([mlb.bestOf, mlb.boSemi, mlb.boFinal], [5, 7, 7]);
  assert.strictEqual(Spec.normalizeSpec(TP.specOf(TP.byId('nfl'), SPORTS)).sport, 'amfootball');
  // Đội mẫu
  const cl = TP.sampleTeams(TP.byId('champions_league'), 'Đội');
  assert.deepStrictEqual([cl.length, cl[0], cl[9]], [36, 'Đội 1 | ENG', 'Đội 10 | ENG']);
  assert.match(TP.sampleTeams(TP.byId('f1'), 'Tay đua')[0], /^Tay đua 1 \| {2}\| Tay đua A$/);
});
