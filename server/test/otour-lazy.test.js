'use strict';
// Giải đấu Offline – tải lười các trận của vòng tròn nhiều bảng (hub/otour-lazy.js)
const test = require('node:test');
const assert = require('node:assert');
const { ctx, Client, account, until, teams, real } = require('./otour-client.js');

test('Vòng tròn > 8 bảng: trang chung chỉ có bảng xếp hạng; mở bảng thì tải các trận; bảng đang mở được đẩy cập nhật; tải đủ để xuất', async () => {
  const org = await account();
  const hub = ctx.app.hub;
  const spec = { sport: 'football', stages: [{ type: 'roundrobin', groupSize: 4, advance: 2 }, { type: 'single', thirdPlace: false }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Giải 16 bảng', spec, teams: teams(64) }, 'otCreated');
  const t = hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const viewer = await Client.open();
  const first = await viewer.req({ t: 'otGet', id }, 'ot');
  const v0 = first.tour.stageViews[0];
  assert.strictEqual(v0.lazy, true);
  assert.strictEqual(v0.groups.length, 16);
  assert.ok(v0.groups.every((g) => g.rounds === null && g.table.length === 4), 'không gửi các trận, vẫn có bảng xếp hạng');
  // Giải ít bảng: không tải lười
  const small = await org.req({ t: 'otCreate', name: 'Giải 2 bảng', spec, teams: teams(8) }, 'otCreated');
  org.send({ t: 'otStart', id: small.id });
  await until(() => hub.otGet(small.id).status === 'running');
  const sv = (await viewer.req({ t: 'otGet', id: small.id }, 'ot')).tour.stageViews[0];
  assert.ok(!sv.lazy && sv.groups[0].rounds.length > 0);
  await viewer.req({ t: 'otGet', id }, 'ot');
  // Mở bảng 3
  const g3 = await viewer.req({ t: 'otGroup', id, stage: 0, g: 3 }, 'otGroup');
  assert.deepStrictEqual([g3.stage, g3.groups.length, g3.groups[0].g], [0, 1, 3]);
  const ids = g3.groups[0].rounds.flat().map((m) => m.id);
  assert.strictEqual(ids.length, 6, '4 đội: 6 trận');
  // Nhập kết quả một trận bảng 3 → người xem nhận lại bảng 3 (đã có kết quả) + bản vá bảng xếp hạng
  const m = t.st[0].matches[ids[0]];
  const before = viewer.msgs.length;
  org.send({ t: 'otScore', id, match: m.id, score: [2, 0] });
  await until(() => viewer.msgs.slice(before).some((x) => x.t === 'otGroup' && x.groups[0].g === 3 && x.groups[0].rounds.flat().find((y) => y.id === m.id).done));
  await until(() => viewer.ot[id].stageViews[0].groups[3].table.some((r) => r.mp === 1));
  // Trận ở bảng khác (chưa mở): không đẩy bảng đó
  const other = Object.values(t.st[0].matches).find((x) => x.group === 5 && real(x.a) && real(x.b) && !x.done);
  const mark = viewer.msgs.length;
  org.send({ t: 'otScore', id, match: other.id, score: [1, 1] });
  await until(() => other.done);
  await until(() => viewer.ot[id].stageViews[0].groups[5].table.some((r) => r.mp === 1));
  assert.ok(!viewer.msgs.slice(mark).some((x) => x.t === 'otGroup' && x.groups[0].g === 5), 'bảng chưa mở: không gửi các trận');
  // Tải đủ mọi bảng (xuất CSV)
  const all = await viewer.req({ t: 'otGroup', id, stage: 0, g: 'all' }, 'otGroup');
  assert.strictEqual(all.groups.length, 16);
  assert.strictEqual(all.groups.reduce((n, x) => n + x.rounds.flat().length, 0), 96);
  assert.strictEqual((await viewer.req({ t: 'otGroup', id, stage: 0, g: 99 }, 'error')).code, 'bad_message');
  // Giải riêng tư: người ngoài không lấy được các trận
  await org.req({ t: 'otEdit', id, name: t.name, access: 'private' }, 'otEdited');
  assert.strictEqual((await viewer.req({ t: 'otGroup', id, stage: 0, g: 1 }, 'error')).code, 'ot_not_found');
  // Cỡ trang chung nhỏ hơn hẳn bản đầy đủ
  const lite = JSON.stringify(hub.otShared(t)).length, full = JSON.stringify(hub.otFull(t)).length;
  assert.ok(lite < full / 2, `trang chung ${lite} B < một nửa bản đầy đủ ${full} B`);
  [org, viewer].forEach((c) => c.close());
});
