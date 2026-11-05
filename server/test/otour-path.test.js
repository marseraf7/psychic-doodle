'use strict';
// Giải đấu Offline – nhánh theo vị trí trong bảng (caro/otour-path.js, otour-run.js – otPathSlots)
const test = require('node:test');
const assert = require('node:assert');
const P = require('../../caro/otour-path.js');
const { ctx, account, until, teams, real } = require('./otour-client.js');

const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Mọi tổ hợp k phần tử của 0..n-1. */
function* combos(n, k, start = 0, cur = []) {
  if (cur.length === k) { yield cur.slice(); return; }
  for (let i = start; i < n; i++) { cur.push(i); yield* combos(n, k, i + 1, cur); cur.pop(); }
}

test('World Cup 2026: 16 cặp vòng 32 đội đúng ô FIFA; cả 495 tổ hợp đội hạng ba đều ghép được (đúng bảng được phép, không trùng)', () => {
  const wc = P.template(12, 2, 8);
  assert.strictEqual(wc.length, 16);
  assert.deepStrictEqual(wc[0], ['1E', '3ABCDF']); // trận 74
  assert.deepStrictEqual(wc[2], ['2A', '2B']); // trận 73
  // Mỗi nhất / nhì bảng xuất hiện đúng một lần
  const fixed = wc.flat().filter((s) => s[0] !== '3').sort();
  assert.deepStrictEqual(fixed, [...LET.slice(0, 12)].flatMap((g) => ['1' + g, '2' + g]).sort());
  let n = 0;
  for (const q of combos(12, 8)) {
    const m = P.assignThirds(wc, q);
    assert.ok(m, 'ghép được: ' + q.map((g) => LET[g]).join(''));
    const got = [...m.values()];
    assert.strictEqual(new Set(got).size, 8);
    wc.forEach((pr, i) => pr.forEach((s, j) => { if (s[0] === '3') assert.ok(s.includes(LET[m.get(i + ':' + j)]), `${pr[0]} nhận bảng được phép`); }));
    n++;
  }
  assert.strictEqual(n, 495);
  assert.deepStrictEqual(P.labels([['1E', '3ABCDF']]), ['1E – 3 A/B/C/D/F']);
});

test('khuôn chung: nhất + nhì (+ hạng ba); đội cùng bảng ở hai nửa nhánh; không hợp thì null', () => {
  const half = (pairs) => {
    const side = new Map();
    pairs.forEach((pr, i) => pr.forEach((s) => side.set(s, i < pairs.length / 2 ? 0 : 1)));
    return side;
  };
  for (const [G, n] of [[4, 0], [8, 0], [16, 0], [6, 4], [12, 8]]) {
    const pairs = G === 12 ? P.template(12, 2, 0 + 8) : P.template(G, 2, n);
    assert.ok(pairs, `${G} bảng + ${n}`);
    assert.strictEqual(pairs.length * 2, 2 * G + n);
    if (G === 12) continue; // khuôn FIFA
    const side = half(pairs);
    for (let g = 0; g < G; g++) assert.notStrictEqual(side.get('1' + LET[g]), side.get('2' + LET[g]), `${G} bảng: 1${LET[g]} và 2${LET[g]} khác nửa`);
    // Nhất bảng không gặp nhì cùng bảng ngay vòng 1; ô hạng ba không nhận chính bảng của đội nhất
    for (const [a, b] of pairs) {
      assert.ok(!(a[0] === '1' && b[0] === '2' && a[1] === b[1]));
      if (b[0] === '3') assert.ok(!b.slice(1).includes(a[1]));
    }
  }
  assert.deepStrictEqual(P.template(4, 1, 0), [['1A', '1D'], ['1B', '1C']]);
  assert.strictEqual(P.template(5, 2, 0), null, '10 đội: không phải luỹ thừa của 2');
  assert.strictEqual(P.template(4, 3, 0), null);
  assert.strictEqual(P.template(6, 2, 3), null, 'số đội hạng ba lẻ');
  // resolve: thiếu đội → null
  assert.strictEqual(P.resolve([['1A', '2B']], () => null, []), null);
  assert.strictEqual(P.assignThirds([['1A', '3B']], [0]), null, 'ô chỉ nhận bảng B, đội hạng ba lại của bảng A');
});

test('trên máy chủ: vòng bảng 4 bảng → loại trực tiếp path = groups: 1A–2B, 1C–2D, 1B–2A, 1D–2C', async () => {
  const org = await account();
  const hub = ctx.app.hub;
  const spec = { sport: 'football', stages: [{ type: 'roundrobin', groupSize: 4, advance: 2 }, { type: 'single', thirdPlace: false, path: 'groups' }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Giải nhánh bảng', spec, teams: teams(16) }, 'otCreated');
  const t = hub.otGet(id);
  assert.strictEqual(t.stages[1].path, 'groups');
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  for (const m of Object.values(t.st[0].matches)) {
    if (!real(m.a) || !real(m.b)) continue;
    org.send({ t: 'otScore', id, match: m.id, score: [2, 1] });
  }
  await until(() => t.stage === 1, 8000);
  const tables = require('../src/hub/stages.js').standings(t.st[0], hub.otSeedOf(t));
  const at = (pos, g) => tables[g].list[pos - 1];
  const first = Object.values(t.st[1].matches).filter((m) => m.round === 0).sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true }));
  const want = [[at(1, 0), at(2, 1)], [at(1, 2), at(2, 3)], [at(1, 1), at(2, 0)], [at(1, 3), at(2, 2)]];
  assert.deepStrictEqual(first.map((m) => [m.a, m.b]), want);
  // Không bật path: vẫn xếp theo hạt giống như cũ (1 nhất bảng gặp nhì bảng khác)
  const spec2 = { ...spec, stages: [spec.stages[0], { type: 'single', thirdPlace: false }] };
  const r2 = await org.req({ t: 'otCreate', name: 'Giải hạt giống', spec: spec2, teams: teams(16) }, 'otCreated');
  assert.strictEqual(hub.otGet(r2.id).stages[1].path, undefined);
  org.close();
});
