'use strict';
// Esports (caro/otour-draft.js + hub/otour-games.js): kịch bản cấm chọn, Fearless cứng / mềm / theo giai đoạn, chi tiết ván
// (chỉ số đội bắt buộc, K/D/A, vàng theo thời gian), thống kê tướng; đội vào thẳng giai đoạn sau; Thụy Sĩ vòng 1 tránh cùng
// khu vực; mẫu LoL Worlds 2025 chạy qua máy chủ thật.
const test = require('node:test');
const assert = require('node:assert');
const DR = require('../../caro/otour-draft.js');
const ST = require('../src/hub/stages.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { ctx, account, until } = require('./otour-client.js');

const LOL = DR.cleanEsports({});
/** Một ván đầy đủ: bên xanh là đội `blue`, chọn picks theo bên. */
const game = (blue, bluePicks, redPicks, extra = {}) => ({
  blue, dur: 1900,
  draft: { blue: { bans: ['b1', 'b2', 'b3', 'b4', 'b5'].map((x) => x + blue), picks: bluePicks }, red: { bans: ['r1', 'r2', 'r3', 'r4', 'r5'].map((x) => x + blue), picks: redPicks } },
  st: { blue: { kills: 12, gold: 61000, towers: 9, dragons: 3, barons: 1 }, red: { kills: 5, gold: 52000, towers: 3, dragons: 1, barons: 0 } },
  ...extra,
});
const P = (p) => [1, 2, 3, 4, 5].map((i) => p + i);

test('Kịch bản cấm chọn: LoL 20 bước, tự chọn (cấm xen kẽ, chọn kiểu rắn), tắt', () => {
  assert.deepStrictEqual([LOL.draft, LOL.fearless, LOL.scope, LOL.stats.length, LOL.players], ['lol', 'hard', 'series', 5, false], 'mặc định: LoL, Fearless cứng trong loạt');
  const s = DR.script(LOL);
  assert.strictEqual(s.length, 20);
  assert.deepStrictEqual(s.slice(6, 12).map((x) => x[1][0]).join(''), 'brrbbr', 'chọn đợt 1: B1 R1 R2 B2 B3 R3');
  assert.deepStrictEqual(s.slice(12, 16).map((x) => x[1][0]).join(''), 'rbrb', 'cấm đợt 2 đỏ trước');
  assert.deepStrictEqual(DR.counts(LOL), { blue: { ban: 5, pick: 5 }, red: { ban: 5, pick: 5 } });
  const c = DR.cleanEsports({ draft: 'custom', bans: 2, picks: 3, stats: 'kills, Rùa, <b>' });
  assert.deepStrictEqual(DR.script(c).map((x) => x[0][0] + x[1][0]).join(' '), 'bb br bb br pb pr pr pb pb pr');
  assert.deepStrictEqual(c.stats, ['kills', 'Rùa', 'b'], 'chỉ số tự đặt được làm sạch');
  assert.deepStrictEqual(DR.script({ draft: 'off' }), []);
  const pool = DR.cleanEsports({ pool: 'Ahri, ahri\nZed;  Lee   Sin ' }).pool;
  assert.deepStrictEqual(pool, ['Ahri', 'Zed', 'Lee Sin'], 'danh sách tướng: bỏ trùng không phân biệt hoa thường');
});

test('Chi tiết ván: kiểm bên, thời lượng, số lượt, trùng tướng, chỉ số đội bắt buộc, vàng, K/D/A', () => {
  const ok = DR.cleanGame(game('a', P('A'), P('B'), { mvp: ' Faker ', gold: [[5, 8000, 8100], [10, 17000, 16000]] }), LOL);
  assert.ok(ok.game && ok.game.draft && ok.game.mvp === 'Faker' && ok.game.gold.length === 2);
  assert.strictEqual(DR.cleanGame({}, LOL).code, 'ot_g_side');
  assert.strictEqual(DR.cleanGame(game('a', P('A'), P('B'), { dur: 99999 }), LOL).code, 'ot_g_dur');
  assert.strictEqual(DR.cleanGame(game('a', [...P('A'), 'X'], P('B')), LOL).code, 'ot_g_many');
  assert.deepStrictEqual(DR.cleanGame(game('a', ['A1', 'A2', 'A3', 'A4', 'B1'], P('B')), LOL), { code: 'ot_g_dup', args: { c: 'B1' } });
  const noStat = game('a', P('A'), P('B'));
  delete noStat.st.red.barons;
  assert.deepStrictEqual(DR.cleanGame(noStat, LOL), { code: 'ot_g_stats', args: { k: 'barons' } });
  assert.strictEqual(DR.cleanGame(game('a', P('A'), P('B'), { gold: [[10, 1, 1], [5, 1, 1]] }), LOL).code, 'ot_g_gold', 'phút phải tăng dần');
  // Ván chỉ nhập bên + chỉ số (không cấm chọn): không có draft
  const bare = DR.cleanGame({ blue: 'b', st: game('a', [], []).st }, LOL);
  assert.ok(bare.game && !bare.game.draft && bare.game.blue === 'b');
  // K/D/A chỉ khi bật
  const pl = { blue: [{ n: 'Mid', c: 'Ahri', k: 7, d: 1, a: 9 }, { n: '', c: '' }], red: [] };
  assert.strictEqual(DR.cleanGame(game('a', P('A'), P('B'), { players: pl }), LOL).game.players, undefined);
  assert.deepStrictEqual(DR.cleanGame(game('a', P('A'), P('B'), { players: pl }), { ...LOL, players: true }).game.players, { blue: [{ n: 'Mid', c: 'Ahri', k: 7, d: 1, a: 9 }], red: [] });
  assert.deepStrictEqual(DR.parseGold('5 8000 8100\n10: 17.5k 16k'), { gold: [[5, 8000, 8100], [10, 17500, 16000]] });
  assert.deepStrictEqual(DR.parseGold('5 8000\n'), { error: 1 });
  assert.deepStrictEqual([DR.parseDur('32:15'), DR.parseDur('28'), DR.parseDur('1:99'), DR.fmtDur(1935)], [1935, 1680, null, '32:15']);
});

test('Fearless: cứng (không ai chọn lại), mềm (chỉ đội đã chọn), tắt; phạm vi cả giai đoạn', () => {
  const m = { a: 'x', b: 'y', esp: [DR.cleanGame(game('a', P('A'), P('B')), LOL).game] };
  // Ván 2: đội y (ô dưới) đứng bên xanh và chọn A1 – đội x đã chọn ở ván 1
  const g2 = game('b', ['A1', 'C2', 'C3', 'C4', 'C5'], P('D'));
  assert.deepStrictEqual(DR.cleanGame(g2, LOL, DR.priorPicks(m, 1, LOL)), { code: 'ot_g_fearless', args: { c: 'A1', n: 1 } });
  const soft = { ...LOL, fearless: 'soft' };
  assert.ok(DR.cleanGame(g2, soft, DR.priorPicks(m, 1, soft)).game, 'mềm: đội y chọn tướng đội x đã dùng được');
  const g2b = game('b', P('C'), ['B1', 'D2', 'D3', 'D4', 'D5']); // đội x (bên đỏ ván 2) chọn lại B1 – đội y đã chọn
  assert.ok(DR.cleanGame(g2b, soft, DR.priorPicks(m, 1, soft)).game);
  const g2c = game('b', P('C'), ['A1', 'D2', 'D3', 'D4', 'D5']); // đội x chọn lại A1 của chính mình
  assert.strictEqual(DR.cleanGame(g2c, soft, DR.priorPicks(m, 1, soft)).code, 'ot_g_fearless');
  const off = { ...LOL, fearless: 'off' };
  assert.ok(DR.cleanGame(g2c, off, DR.priorPicks(m, 1, off)).game);
  // Tướng bị cấm ở ván trước vẫn chọn được
  assert.ok(DR.cleanGame(game('b', ['b1a', 'C2', 'C3', 'C4', 'C5'], P('D')), LOL, DR.priorPicks(m, 1, LOL)).game);
  // Phạm vi giai đoạn: trận trước của đội x (gặp z) đã dùng Z1 → trận x – y ván 1 không chọn được
  const stage = { ...LOL, scope: 'stage', fearless: 'soft' };
  const before = { a: 'z', b: 'x', esp: [DR.cleanGame(game('a', P('E'), ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']), LOL).game] };
  const fresh = { a: 'x', b: 'y', esp: [] };
  assert.deepStrictEqual(DR.cleanGame(game('a', ['Z1', 'A2', 'A3', 'A4', 'A5'], P('B')), stage, DR.priorPicks(fresh, 0, stage, [before])), { code: 'ot_g_fearless_stage', args: { c: 'Z1', n: 0 } });
  assert.ok(DR.cleanGame(game('b', ['Z1', 'A2', 'A3', 'A4', 'A5'], P('B')), stage, DR.priorPicks(fresh, 0, stage, [before])).game, 'đội y chưa dùng Z1');
});

test('Thống kê: chọn / cấm / thắng theo tướng, bên xanh thắng, thời lượng, MVP', () => {
  const g1 = DR.cleanGame(game('a', P('A'), P('B'), { mvp: 'Mid' }), LOL).game;
  const g2 = DR.cleanGame(game('b', P('C'), ['A1', 'D2', 'D3', 'D4', 'D5'], { dur: 2100, mvp: 'mid' }), { ...LOL, fearless: 'off' }).game;
  const s = DR.stats([{ a: 'x', b: 'y', sets: [[1, 0], [0, 1]], esp: [g1, g2] }]);
  assert.deepStrictEqual([s.games, s.decided, s.blueWins, s.avgDur], [2, 2, 2, 2000]);
  const a1 = s.champs.find((x) => x.c === 'A1');
  assert.deepStrictEqual([a1.pick, a1.win], [2, 1], 'A1: x thắng ván 1 (xanh), ván 2 x ở bên đỏ thua');
  assert.strictEqual(s.champs.find((x) => x.c === 'b1a').ban, 1);
  assert.deepStrictEqual(s.mvp, [{ who: 'Mid', n: 2 }], 'MVP gộp không phân biệt hoa thường');
});

test('Vào thẳng giai đoạn sau: chia đội, ước tính, giới hạn', () => {
  const stages = ST.normalizeStages([{ type: 'roundrobin', groups: 1, advance: 1 }, { type: 'swiss', record: { win: 3, lose: 3 }, direct: 15 }, { type: 'single', direct: 2 }], { offline: true });
  assert.deepStrictEqual(stages.map((c) => c.direct), [undefined, 15, 2]);
  const uids = Array.from({ length: 19 }, (_, i) => 'u' + i);
  const dp = ST.directPlan(stages, uids);
  assert.deepStrictEqual([dp.direct[2], dp.direct[1].length, dp.direct[1][0], dp.first], [['u0', 'u1'], 15, 'u2', ['u17', 'u18']], 'giai đoạn sau cùng lấy hạt giống cao nhất trước');
  assert.strictEqual(ST.directTotal(stages), 17);
  assert.strictEqual(ST.normalizeStages([{ type: 'swiss', direct: 4 }, { type: 'single' }], { offline: true })[0].direct, undefined, 'giai đoạn đầu không có vào thẳng');
  const Spec = require('../src/hub/otour-spec.js');
  assert.throws(() => Spec.checkSize({ stages }, 18), (e) => e.code === 'ot_direct_many');
});

test('Thụy Sĩ vòng 1 tránh cùng khu vực', () => {
  const [cfg] = ST.normalizeStages([{ type: 'swiss', record: { win: 3, lose: 3, bo: 3 }, region: true }, { type: 'single' }], { offline: true });
  const seeds = Array.from({ length: 16 }, (_, i) => 'u' + String(i).padStart(2, '0'));
  const cty = (u) => ['KR', 'CN', 'EU', 'NA'][seeds.indexOf(u) % 4];
  for (let k = 0; k < 5; k++) {
    const st = ST.buildStage(cfg, 0, seeds, { seedOf: (u) => seeds.indexOf(u) + 1, countryOf: cty });
    const ms = st.rounds[0].map((id) => st.matches[id]);
    assert.ok(ms.every((m) => cty(m.a) !== cty(m.b)), 'không cặp nào cùng khu vực');
  }
  const [noRegion] = ST.normalizeStages([{ type: 'swiss', record: { win: 3, lose: 3 } }, { type: 'single' }], { offline: true });
  assert.strictEqual(noRegion.region, undefined);
});

test('Máy chủ: mẫu LoL Worlds – Play-In → 15 đội vào thẳng Thụy Sĩ; nhập chi tiết ván, Fearless, thống kê, cấu hình', async () => {
  const org = await account();
  const tpl = TP.byId('lol_worlds');
  const { id } = await org.req({ t: 'otCreate', name: 'Kiểu Worlds', spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  assert.deepStrictEqual([t.esports.draft, t.esports.fearless], ['lol', 'hard']);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  assert.deepStrictEqual(t.st[0].entrants, [t.players[15].uid, t.players[16].uid], 'Play-In: hạt giống 16 và 17');
  assert.strictEqual(t.direct[1].length, 15);
  const pi = Object.values(t.st[0].matches)[0];
  // Chi tiết ván 1 trước khi có kết quả loạt; ván 2 chọn lại tướng ván 1 → Fearless chặn
  org.send({ t: 'otGame', id, match: pi.id, i: 0, game: game('a', P('A'), P('B'), { gold: [[5, 8000, 8100], [10, 17000, 16000]] }) });
  await until(() => pi.esp && pi.esp[0]);
  const e1 = await org.req({ t: 'otGame', id, match: pi.id, i: 1, game: game('b', ['B1', 'C2', 'C3', 'C4', 'C5'], P('D')) }, 'error');
  assert.deepStrictEqual([e1.code, e1.args], ['ot_g_fearless', { c: 'B1', n: 1 }]);
  assert.strictEqual((await org.req({ t: 'otGame', id, match: pi.id, i: 5, game: game('a', P('A'), P('B')) }, 'error')).code, 'ot_g_index', 'Bo5: chỉ ván 0–4');
  org.send({ t: 'otGame', id, match: pi.id, i: 1, game: game('b', P('C'), P('D')) });
  await until(() => pi.esp[1]);
  // Kết quả loạt 3–0 → ván 3 hợp lệ, ván 4 thì không (loạt đã xong ở ván 3)
  org.send({ t: 'otScore', id, match: pi.id, sets: [[1, 0], [1, 0], [1, 0]] });
  await until(() => t.st[1]);
  assert.strictEqual((await org.req({ t: 'otGame', id, match: pi.id, i: 3, game: game('a', P('E'), P('F')) }, 'error')).code, 'ot_g_index');
  const sw = t.st[1];
  assert.strictEqual(sw.entrants.length, 16, 'Thụy Sĩ 16 đội');
  assert.deepStrictEqual(sw.entrants.slice(0, 15), t.players.slice(0, 15).map((p) => p.uid), '15 đội vào thẳng đứng đầu');
  assert.strictEqual(sw.entrants[15], pi.winner);
  const cty = new Map(t.players.map((p) => [p.uid, p.country]));
  assert.ok(sw.rounds[0].map((x) => sw.matches[x]).every((m) => cty.get(m.a) !== cty.get(m.b)), 'vòng 1 không gặp đội cùng khu vực');
  assert.ok(t.players[16].out === 'not_advanced' || t.players[15].out === 'not_advanced', 'đội thua Play-In bị loại');
  // Trang giải: chi tiết ván + thống kê + cấu hình; xoá ván; đổi cấu hình
  const v = await org.req({ t: 'otGet', id }, 'ot');
  assert.ok(v.tour.esports && v.tour.esp && v.tour.esp.games === 2 && v.tour.stageViews[0].groups[0].rounds[0][0].esp.length === 2);
  org.send({ t: 'otGameDel', id, match: pi.id, i: 1 });
  await until(() => pi.esp.length === 1);
  org.send({ t: 'otEspCfg', id, esports: { draft: 'custom', bans: 3, picks: 5, fearless: 'soft', pool: 'Ahri\nZed' } });
  await until(() => t.esports.draft === 'custom');
  assert.deepStrictEqual([t.esports.bans, t.esports.fearless, t.esports.pool], [3, 'soft', ['Ahri', 'Zed']]);
  org.send({ t: 'otEspCfg', id, esports: null });
  await until(() => t.esports === null);
  assert.strictEqual((await org.req({ t: 'otGame', id, match: pi.id, i: 0, game: game('a', P('A'), P('B')) }, 'error')).code, 'ot_g_off');
  org.close();
});

test('Fearless phạm vi giai đoạn (máy chủ): chỉ tính trận vòng trước của hai đội, Play-In tính trước vòng 1', () => {
  const { OTourGames } = require('../src/hub/otour-games.js');
  const others = OTourGames.prototype.otGameOthers;
  const mk = (id, round, a, b, esp, pre) => ({ id, round, a, b, ...(esp ? { esp: [{}] } : {}), ...(pre ? { pre: true } : {}) });
  const st = { matches: Object.fromEntries([mk('p', 0, 'x', 'q', 1, 1), mk('r0', 0, 'x', 'z', 1), mk('r1', 1, 'y', 'w', 1), mk('r1b', 1, 'x', 'y'), mk('r2', 2, 'x', 'y', 1), mk('r0b', 0, 'k', 'l', 1)].map((m) => [m.id, m])) };
  const m = st.matches.r1b;
  assert.deepStrictEqual(others(st, m).map((x) => x.id).sort(), ['p', 'r0'], 'trận vòng trước có chi tiết ván của x hoặc y (cùng vòng, vòng sau, đội khác: không tính)');
  assert.deepStrictEqual(others(st, st.matches.p).map((x) => x.id), [], 'Play-In là trận đầu tiên');
});

test('Rà soát: nhãn chỉ số đặc biệt bị bỏ; vào thẳng không đi cùng playoff kiểu Mỹ', () => {
  assert.deepStrictEqual(DR.cleanEsports({ stats: ['__proto__', 'constructor', 'Rùa'] }).stats, ['Rùa']);
  const st = ST.normalizeStages([{ type: 'roundrobin', season: { confs: 2 }, advance: 4 }, { type: 'single', playoff: { per: 4 }, direct: 2 }], { offline: true });
  assert.deepStrictEqual([!!st[1].playoff, st[1].direct], [true, undefined]);
});

test('Máy chủ: cấu hình esports chỉ cho giải esports; sửa giải nháp không gửi esports thì giữ nguyên', async () => {
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Bóng đá', spec: { sport: 'football', stages: [{ type: 'single' }] }, teams: ['A', 'B'] }, 'otCreated');
  assert.strictEqual((await org.req({ t: 'otEspCfg', id, esports: {} }, 'error')).code, 'ot_g_off');
  const { id: id2 } = await org.req({ t: 'otCreate', name: 'Giải LMHT', spec: { sport: 'esports', stages: [{ type: 'single' }], esports: { fearless: 'soft' } }, teams: ['A', 'B'] }, 'otCreated');
  const t2 = ctx.app.hub.otGet(id2);
  await org.req({ t: 'otEdit', id: id2, name: 'Giải LMHT 2', spec: { sport: 'esports', stages: [{ type: 'single', bestOf: 3 }] } }, 'otEdited');
  assert.deepStrictEqual([t2.name, t2.stages[0].bestOf, t2.esports && t2.esports.fearless], ['Giải LMHT 2', 3, 'soft']);
  org.close();
});
