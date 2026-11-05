'use strict';
// Giải đấu Offline – phần kiểu MyLeague (hub/otour-league.js): lịch & sân, đội hình, sự kiện trận, thống kê, đăng ký đội
const test = require('node:test');
const assert = require('node:assert');
const { ctx, Client, account, until, teams, real } = require('./otour-client.js');
const { parseRoster } = require('../src/hub/otour-league.js');

test('Đội hình: đọc "số áo tên | vị trí", bỏ dòng trống, tối đa 40 người', () => {
  assert.deepStrictEqual(parseRoster('10 Nguyễn Văn A | Tiền đạo\n\nTrần B\n7  Lê <C>'), [
    { no: 10, name: 'Nguyễn Văn A', pos: 'Tiền đạo' }, { no: null, name: 'Trần B', pos: '' }, { no: 7, name: 'Lê C', pos: '' }]);
  assert.strictEqual(parseRoster(Array.from({ length: 50 }, (_, i) => 'P' + i)).length, 40);
});

test('Giải offline kiểu MyLeague: lịch & sân, đội hình, sự kiện trận → vua phá lưới / thẻ phạt; người xem thấy; đăng ký đội + duyệt', async () => {
  const org = await account();
  const fan = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Giải phủi quận', spec: { sport: 'football', stages: [{ type: 'single', thirdPlace: false }] }, teams: teams(3) }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  // Đăng ký: chưa mở thì bị chặn; mở → gửi đơn; trùng tài khoản bị chặn; duyệt → thêm đội (kèm đội hình)
  assert.strictEqual((await fan.req({ t: 'otRegister', id, name: 'FC Phường' }, 'error')).code, 'ot_reg_closed');
  org.send({ t: 'otRegOpen', id, open: true });
  await until(() => t.reg && t.reg.open);
  const seen = await fan.req({ t: 'otGet', id }, 'ot');
  assert.deepStrictEqual(seen.tour.reg, { open: true });
  fan.send({ t: 'otRegister', id, name: 'FC Phường', roster: '1 Thủ môn A\n9 Tiền đạo B | FW' });
  await until(() => t.regs && t.regs.length === 1);
  assert.strictEqual((await fan.req({ t: 'otRegister', id, name: 'FC Khác' }, 'error')).code, 'ot_reg_dup');
  assert.strictEqual((await org.req({ t: 'otRegister', id, name: 'Đội 1' }, 'error')).code, 'ot_team_dup');
  const mine = await org.req({ t: 'otGet', id }, 'ot');
  assert.strictEqual(mine.mine.regs[0].name, 'FC Phường', 'ban tổ chức thấy đơn');
  org.send({ t: 'otRegDecide', id, reg: t.regs[0].id, ok: true });
  await until(() => t.players.length === 4);
  assert.deepStrictEqual(t.players[3].roster.map((x) => x.no), [1, 9]);
  // Đội hình đội 1
  org.send({ t: 'otRoster', id, team: t.players[0].uid, lines: '10 Messi Phủi\n7 Ronaldo Phủi | FW' });
  await until(() => t.players[0].roster && t.players[0].roster.length === 2);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const m = Object.values(t.st[0].matches).find((x) => real(x.a) && real(x.b));
  // Lịch & sân
  const when = Date.UTC(2026, 10, 20, 12, 0);
  assert.strictEqual((await org.req({ t: 'otMatchInfo', id, match: m.id, when: 5 }, 'error')).code, 'bad_message');
  org.send({ t: 'otMatchInfo', id, match: m.id, when, venue: 'Sân Chi Lăng' });
  await until(() => m.venue === 'Sân Chi Lăng' && m.when === when);
  // Sự kiện: 2 bàn + 1 phản lưới + thẻ
  const viewer = await Client.open();
  await viewer.req({ t: 'otGet', id }, 'ot');
  for (const e of [{ type: 'goal', side: 'a', who: 'Messi Phủi', min: 10 }, { type: 'goal', side: 'a', who: 'Messi Phủi', min: 80 }, { type: 'own', side: 'b', who: 'Hậu vệ X', min: 50 }, { type: 'yellow', side: 'b', who: 'Hậu vệ X', min: 30 }, { type: 'red', side: 'b', who: 'Hậu vệ X', min: 85 }]) {
    org.send({ t: 'otEvent', id, match: m.id, ...e });
  }
  await until(() => m.events && m.events.length === 5);
  assert.deepStrictEqual(m.events.map((e) => e.min), [10, 30, 50, 80, 85], 'xếp theo phút');
  assert.strictEqual((await org.req({ t: 'otEvent', id, match: m.id, type: 'foul', side: 'a' }, 'error')).code, 'bad_message');
  assert.strictEqual((await fan.req({ t: 'otEvent', id, match: m.id, type: 'goal', side: 'a' }, 'error')).code, 'tour_managers_only');
  org.send({ t: 'otEventDel', id, match: m.id, i: 2 }); // bỏ bàn phản lưới
  await until(() => m.events.length === 4);
  const stats = ctx.app.hub.otStats(t);
  assert.deepStrictEqual(stats.scorers[0], { who: 'Messi Phủi', team: (t.players.find((p) => p.uid === m.a) || {}).name, n: 2 });
  assert.deepStrictEqual([stats.cards[0].who, stats.cards[0].y, stats.cards[0].r], ['Hậu vệ X', 1, 1]);
  // Chờ người xem nhận đủ (kể cả bản vá bỏ sự kiện) rồi mới kiểm
  const vmOf = () => { const v = viewer.ot[id]; return v && v.stageViews[0] && v.stageViews[0].rounds.flat().find((x) => x && x.id === m.id); };
  await until(() => { const v = viewer.ot[id], x = vmOf(); return v && v.stats && v.stats.scorers.length === 1 && x && x.events && x.events.length === 4; });
  const vm = vmOf();
  assert.deepStrictEqual([vm.when, vm.venue, vm.events.length], [when, 'Sân Chi Lăng', 4], 'người xem thấy lịch, sân, sự kiện');
  assert.ok(viewer.ot[id].players[0].roster, 'người xem thấy đội hình');
  // Kết quả vẫn nhập riêng; sự kiện giữ lại sau khi huỷ kết quả
  org.send({ t: 'otScore', id, match: m.id, score: [2, 0] });
  await until(() => m.done);
  org.send({ t: 'otUndo', id, match: m.id });
  await until(() => !m.done);
  assert.strictEqual(m.events.length, 4);
  [org, fan, viewer].forEach((c) => c.close());
});
