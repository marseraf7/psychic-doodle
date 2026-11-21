'use strict';
// C3: Tường thuật giải đấu – dữ liệu (bàn đang đấu, kết quả gần đây, bảng xếp hạng, vòng mới tự hiện), giải riêng tư → 404,
// giải Offline → trang nhúng; trang /?bc= có thẻ og + cho phép nhúng iframe; bàn nhỏ SVG (caro/broadcast.js).
const test = require('node:test');
const assert = require('node:assert');
const { ctx, account, until } = require('./otour-client.js');
const { miniSvg } = require('../../caro/broadcast.js');
const Og = require('../src/og-meta.js');

const uidOf = (c) => c.msgs.filter((m) => m.t === 'welcome').pop().me.uid;
const base = () => `http://127.0.0.1:${ctx.app.server.address().port}`;

test('bàn nhỏ SVG: khung tối thiểu 9×9 quanh các quân, đánh dấu nước cuối, X / O xen kẽ', () => {
  const empty = miniSvg([]);
  assert.match(empty, /^<svg class="bc-svg" viewBox="0 0 180 180"/);
  const s = miniSvg([[0, 0], [1, 1], [20, 0]], { winner: 1, size: 100 });
  assert.match(s, /class="bc-svg done"/);
  assert.strictEqual((s.match(/class="bc-x"/g) || []).length, 2);
  assert.strictEqual((s.match(/class="bc-o"/g) || []).length, 1);
  assert.strictEqual((s.match(/class="bc-last"/g) || []).length, 1);
  assert.ok(!/NaN|undefined/.test(s));
});

test('og: thẻ xem trước tường thuật 4 ngôn ngữ', () => {
  for (const l of Og.LANGS) {
    const t = Og.texts({ kind: 'bc', name: 'Cúp Xuân', n: 3 }, l);
    assert.match(t.title, /Cúp Xuân/);
    assert.match(t.desc, /3/);
  }
});

test('Tường thuật giải Arena: ván đang đấu → bàn nhỏ; ván xong → kết quả + bảng xếp hạng; /?bc= có og, nhúng được; riêng tư → 404', async () => {
  const hub = ctx.app.hub;
  Object.assign(hub.T, { ARENA_REST_MS: 300, ARENA_REPEAT_MS: 0 }); // ghép lại ngay (chỉ có 2 người)
  const org = await account();
  hub.admins.add(hub.store.users.get(uidOf(org)).username);
  hub.adminIds.add(uidOf(org));
  const a = await account(), b = await account();
  const { id } = await org.req({ t: 'tourCreate', name: 'Arena tường thuật', format: 'arena', startsAt: Date.now() + 6 * 60000, timeLimit: 30, minutes: 30, rated: false }, 'tourCreated');
  await a.req({ t: 'tourJoin', id }, 'toast');
  await b.req({ t: 'tourJoin', id }, 'toast');
  org.send({ t: 'tourStart', id });
  await until(() => { const d = hub.bcData(id); return d && d.boards.length === 1; }, 5000);
  let d = hub.bcData(id);
  assert.strictEqual(d.kind, 'tour');
  assert.strictEqual(d.status, 'running');
  assert.strictEqual(d.boards[0].moves.length, 0);
  assert.deepStrictEqual(d.results, []);
  // Một nước rồi đầu hàng → bàn còn hiện (vừa xong) kèm kết quả, feed có kết quả, bảng xếp hạng có điểm
  const r = hub.rooms.get(d.boards[0].code);
  const first = r.seats[1] === 'u_' + uidOf(a) ? a : b, second = first === a ? b : a;
  first.send({ t: 'move', x: 0, y: 0 });
  await until(() => hub.bcData(id).boards[0].moves.length === 1);
  second.send({ t: 'resign' });
  await until(() => hub.bcData(id).results.length === 1, 5000);
  d = hub.bcData(id);
  assert.strictEqual(d.results[0].winner, 'x');
  assert.strictEqual(d.standings.length, 2);
  assert.ok(d.standings[0].score > 0);
  // Ván mới của vòng sau tự hiện (Arena ghép lại sau ARENA_REST_MS)
  await until(() => hub.bcData(id).boards.some((x) => !x.winner), 8000);
  // API + trang
  const api = await fetch(`${base()}/api/v1/broadcast/${id}`);
  assert.strictEqual(api.status, 200);
  assert.strictEqual((await api.json()).name, 'Arena tường thuật');
  const page = await fetch(`${base()}/?bc=${id}&lang=en`);
  const html = await page.text();
  assert.match(html, /<meta property="og:title" content="Live: Arena tường thuật/);
  assert.match(html, /broadcast\.js/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors \*/);
  assert.strictEqual(page.headers.get('x-frame-options'), null, 'nhúng iframe được');
  const plain = await fetch(`${base()}/broadcast.html?bc=${id}`);
  assert.strictEqual(plain.status, 200);
  // Giải riêng tư: không có dữ liệu, không có og
  hub.tours.get(id).access = 'private';
  assert.strictEqual(hub.bcData(id), null);
  assert.strictEqual((await fetch(`${base()}/api/v1/broadcast/${id}`)).status, 404);
  assert.doesNotMatch(await (await fetch(`${base()}/?bc=${id}`)).text(), /og:title/);
  assert.strictEqual(hub.bcData('khongco'), null);
  [org, a, b].forEach((c) => c.close());
});

test('Tường thuật giải Offline: trả đường dẫn trang nhúng; nháp → 404', async () => {
  const hub = ctx.app.hub;
  const org = await account();
  const spec = { stages: [{ type: 'single' }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Offline tường thuật', spec, teams: ['A', 'B', 'C', 'D'] }, 'otCreated');
  const t = hub.otGet(id);
  const st = t.status;
  t.status = 'draft';
  assert.strictEqual(hub.bcData('o.' + id), null);
  t.status = st === 'draft' ? 'running' : st;
  const d = hub.bcData('o.' + id);
  assert.strictEqual(d.kind, 'otour');
  assert.match(d.embed, /^\/embed\.html\?o=/);
  assert.strictEqual(hub.bcData('o.khongco'), null);
  org.close();
});

test('Tường thuật: nhiều người cùng xem dùng lại bản vừa dựng – không duyệt lại mọi phòng mỗi lần, cả lớp chung một IP không bị 429; riêng tư vẫn ẩn ngay', async () => {
  const hub = ctx.app.hub;
  const org = await account();
  hub.admins.add(hub.store.users.get(uidOf(org)).username); // giải của quản trị viên không phải chờ duyệt
  hub.adminIds.add(uidOf(org));
  const soon = Date.now() + 5 * 60 * 1000;
  const { id } = await org.req({ t: 'tourCreate', name: 'Cúp lớp học', format: 'bracket', startsAt: soon, timeLimit: 30, offline: true,
    stages: [{ type: 'single' }] }, 'tourCreated');
  hub.T.BC_CACHE_MS = 60000;
  const real = hub.publicTour;
  let built = 0;
  hub.publicTour = function (...a) { built++; return real.apply(this, a); };
  try {
    assert.ok(hub.bcData(id), 'giải công khai có dữ liệu');
    built = 0;
    hub.bcCache.clear();
    let last;
    for (let i = 0; i < 140; i++) last = await fetch(`${base()}/api/v1/broadcast/${id}`);
    assert.strictEqual(last.status, 200, 'quá 120 lần / phút từ một IP vẫn xem được bản vừa dựng');
    assert.strictEqual(built, 1, 'dựng một lần cho mọi người xem (đã dựng ' + built + ' lần)');
    hub.tours.get(id).access = 'private';
    assert.strictEqual(hub.bcData(id), null, 'chuyển riêng tư: ẩn ngay, không trả bản cũ');
  } finally {
    hub.publicTour = real;
    delete hub.T.BC_CACHE_MS;
    org.close();
  }
});
