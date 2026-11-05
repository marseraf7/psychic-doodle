'use strict';
// Giải đấu Offline – JSON công khai /api/otour/<mã | link riêng>.json (trang nhúng caro/embed.html?o=, website ngoài)
const test = require('node:test');
const assert = require('node:assert');
const { ctx, account, until, teams } = require('./otour-client.js');

test('JSON công khai: giải nháp / riêng tư → 404; giải đang chạy → phần chung (không có phần riêng của ban tổ chức); mở bằng link riêng; giữ 10 giây', async () => {
  const org = await account();
  const hub = ctx.app.hub;
  const base = `http://127.0.0.1:${ctx.app.server.address().port}`;
  const get = (k) => fetch(`${base}/api/otour/${k}.json`);
  const spec = { sport: 'football', stages: [{ type: 'roundrobin', groups: 1 }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Giải nhúng', slug: 'giai-nhung', spec, teams: teams(4) }, 'otCreated');
  const t = hub.otGet(id);
  assert.strictEqual(hub.publicOTour(id), null, 'giải nháp: không công khai');
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const r = await get(id);
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('cache-control'), /max-age=10/);
  assert.strictEqual(r.headers.get('access-control-allow-origin'), '*');
  const j = await r.json();
  assert.strictEqual(j.kind, 'otour');
  assert.strictEqual(j.url, '/?o=giai-nhung');
  assert.strictEqual(j.stageViews[0].groups[0].table.length, 4);
  assert.ok(!('log' in j) && !('canManage' in j), 'không có nhật ký / quyền của ban tổ chức');
  // Link riêng (chữ hoa / thường như nhau)
  const bySlug = await get('Giai-Nhung');
  assert.strictEqual(bySlug.status, 200);
  assert.strictEqual((await bySlug.json()).id, id);
  // Giải riêng tư
  const p = await org.req({ t: 'otCreate', name: 'Giải kín', access: 'private', spec, teams: teams(4) }, 'otCreated');
  org.send({ t: 'otStart', id: p.id });
  await until(() => hub.otGet(p.id).status === 'running');
  assert.strictEqual((await get(p.id)).status, 404);
  assert.strictEqual(hub.publicOTour(p.id), null);
  // Không có / tên lạ
  assert.strictEqual((await get('khong-co-giai-nay')).status, 404);
  assert.strictEqual((await fetch(`${base}/api/otour/..%2Fx.json`)).status, 404);
  // Lược đồ vẫn trả đúng (đường riêng đứng trước)
  const sc = await (await fetch(`${base}/api/otour/schema.json`)).json();
  assert.ok(sc.examples && sc.examples.length > 0);
  org.close();
});
