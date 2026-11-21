'use strict';
// C4: câu trả lời thật của /api/v1/* khớp lược đồ trong OpenAPI (api-v1-openapi.js) – kiểm bằng một bộ đọc lược đồ nhỏ
// (type / properties / required / items / enum / allOf / additionalProperties / $ref tới components.responses).
// Mỗi đường dẫn mô tả có ít nhất một mẫu thật được kiểm; lỗi (404 / 405 / 429) khớp lược đồ Error.
const test = require('node:test');
const assert = require('node:assert');
const { ctx, account, Client, until } = require('./otour-client.js');

const base = () => `http://127.0.0.1:${ctx.app.server.address().port}`;
const uidOf = (c) => c.msgs.filter((m) => m.t === 'welcome').pop().me.uid;
const get = (p) => fetch(base() + '/api/v1' + p);

/** Trả danh sách chỗ sai (rỗng = khớp). */
function check(schema, v, where = '$', spec = {}) {
  const out = [];
  if (!schema) return out;
  if (schema.$ref) return check(schema.$ref.split('/').slice(1).reduce((o, k) => o[k], spec), v, where, spec);
  if (schema.allOf) { for (const s of schema.allOf) out.push(...check(s, v, where, spec)); return out; }
  const types = schema.type ? [].concat(schema.type) : null;
  const typeOf = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : Number.isInteger(x) ? 'integer' : typeof x);
  if (types) {
    const t = typeOf(v);
    const okType = types.includes(t) || (t === 'integer' && types.includes('number'));
    if (!okType) { out.push(`${where}: kiểu ${t}, lược đồ ${types.join('|')}`); return out; }
  }
  if (schema.enum && !schema.enum.includes(v)) out.push(`${where}: ${JSON.stringify(v)} ngoài enum`);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of schema.required || []) if (!(k in v)) out.push(`${where}.${k}: thiếu`);
    for (const [k, s] of Object.entries(schema.properties || {})) if (k in v) out.push(...check(s, v[k], `${where}.${k}`, spec));
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const [k, x] of Object.entries(v)) if (!(schema.properties || {})[k]) out.push(...check(schema.additionalProperties, x, `${where}.${k}`, spec));
    }
  }
  if (Array.isArray(v)) {
    if (schema.minItems != null && v.length < schema.minItems) out.push(`${where}: ít hơn ${schema.minItems} phần tử`);
    if (schema.maxItems != null && v.length > schema.maxItems) out.push(`${where}: nhiều hơn ${schema.maxItems} phần tử`);
    if (schema.items) v.forEach((x, i) => out.push(...check(schema.items, x, `${where}[${i}]`, spec)));
  }
  return out;
}

test('API v1: mọi câu trả lời mẫu khớp lược đồ OpenAPI (kiểu, trường, enum)', async () => {
  const hub = ctx.app.hub;
  const a = await account(), b = await account();
  const ua = hub.store.users.get(uidOf(a)), ub = hub.store.users.get(uidOf(b));
  // Điểm có phần lẻ (như sau một ván Glicko thật), ván có đồng hồ + ván không giới hạn giờ
  hub.rate(ua, ub, 1, 'blitz');
  const share = hub.store.recordGame({ kind: 'quick', timeLimit: 0, clock: '3+2', rule: 'vn', xId: ua.id, oId: ub.id, xName: ua.name, oName: ub.name, winner: 1, reason: 'win', moves: [[0, 0], [1, 1], [1, 0]] });
  hub.store.recordGame({ kind: 'casual', timeLimit: 0, rule: 'free', xId: ub.id, oId: ua.id, xName: ub.name, oName: ua.name, winner: 3, reason: 'draw', moves: [[0, 0]] });

  // Giải công khai (quản trị viên tạo – không chờ duyệt) để có giải + bảng xếp hạng + tường thuật
  for (const k of [...hub.fails.keys()]) if (k.startsWith('reg:')) hub.fails.delete(k);
  const boss = await Client.open();
  await boss.req({ t: 'register', username: 'boss', password: 'caro-pass1', name: 'Boss' }, 'welcome', undefined, 15000);
  const { id: tid } = await boss.req({ t: 'tourCreate', name: 'Schema Cup', format: 'bracket', startsAt: Date.now() + 5 * 60000, timeLimit: 30, offline: true,
    stages: [{ type: 'roundrobin', groups: 1, bestOf: 1, points: { w: 3, d: 1, l: 0 } }] }, 'tourCreated');
  await boss.req({ t: 'tourAddPlayers', id: tid, names: ['An', 'Bình', 'Chi'] }, 'tourAddResult');
  await until(() => hub.bcData(tid));

  const spec = await (await get('/openapi.json')).json();
  const samples = {
    '/player/{username}': ['/player/' + ua.username],
    '/player/{username}/rating-history': ['/player/' + ua.username + '/rating-history'],
    '/player/{username}/games': ['/player/' + ua.username + '/games', '/player/' + ua.username + '/games?max=1'],
    '/game/{id}': ['/game/' + share],
    '/game/{id}.txt': ['/game/' + share + '.txt'],
    '/tournament/{id}': ['/tournament/' + tid],
    '/tournament/{id}/standings': ['/tournament/' + tid + '/standings'],
    '/leaderboard': ['/leaderboard', '/leaderboard?pool=corr'],
    '/broadcast/{key}': ['/broadcast/' + tid],
    '/puzzle/daily': ['/puzzle/daily', '/puzzle/daily?date=2026-01-01'],
    '/openapi.json': ['/openapi.json'],
  };
  assert.deepStrictEqual(Object.keys(samples).sort(), Object.keys(spec.paths).sort(), 'mỗi đường dẫn mô tả có mẫu thử');
  const bad = [];
  for (const [p, urls] of Object.entries(samples)) {
    const r200 = spec.paths[p].get.responses[200];
    const [type, media] = Object.entries(r200.content)[0];
    for (const u of urls) {
      const r = await get(u);
      assert.strictEqual(r.status, 200, u);
      assert.ok(r.headers.get('content-type').startsWith(type), `${u}: content-type ${r.headers.get('content-type')} ≠ ${type}`);
      const body = type === 'application/json' ? await r.json() : await r.text();
      bad.push(...check(media.schema, body, u, spec));
    }
  }
  // Lỗi: 404 / 405 có dạng Error như mô tả
  const errSchema = spec.components.responses.Error.content['application/json'].schema;
  for (const [u, init] of [['/player/khong_co_ai'], ['/game/khongcoma1'], ['/tournament/abcdef0123'], ['/leaderboard', { method: 'POST' }]]) {
    const r = await fetch(base() + '/api/v1' + u, init);
    assert.ok(r.status >= 400, u);
    bad.push(...check(errSchema, await r.json(), 'lỗi ' + u, spec));
  }
  assert.deepStrictEqual(bad, [], 'câu trả lời lệch lược đồ:\n' + bad.join('\n'));
  [a, b, boss].forEach((c) => c.close());
});

test('API v1: openapi.json / ván .txt có địa chỉ gốc lấy từ Host – chưa đặt PUBLIC_URL thì chỉ trình duyệt giữ (private)', async () => {
  const r = await get('/openapi.json');
  assert.match(r.headers.get('cache-control'), /^private, max-age=3600$/);
  const ids = ctx.app.hub.store.history(ctx.app.hub.store.users.values().next().value.id, 1);
  if (ids[0]) assert.match((await get('/game/' + ids[0].share + '.txt')).headers.get('cache-control'), /^private, max-age=3600$/);
  assert.match((await get('/leaderboard')).headers.get('cache-control'), /^public, max-age=60$/, 'đường khác vẫn public');
});
