'use strict';
// Giải đấu Offline – treo giò tự động (hub/otour-disc.js)
const test = require('node:test');
const assert = require('node:assert');
const { suspensions } = require('../src/hub/otour-disc.js');
const { ctx, account, until, teams } = require('./otour-client.js');

const players = ['A', 'B', 'C', 'D'].map((u) => ({ uid: u, name: 'Đội ' + u }));
const mk = (id, round, a, b, done, events = [], extra = {}) => ({ id, round, a, b, done, events, ...extra });
const Y = (side, who) => ({ type: 'yellow', side, who });
const R = (side, who) => ({ type: 'red', side, who });

test('thẻ vàng tích luỹ: đủ 2 thẻ → treo giò trận kế tiếp; thẻ đỏ → treo giò; trận đã đá → đã chấp hành', () => {
  const t = {
    players,
    st: [{
      matches: {
        m1: mk('m1', 0, 'A', 'B', true, [Y('a', 'An'), R('b', 'Bảo')]),
        m2: mk('m2', 1, 'A', 'C', true, [Y('a', 'an')]), // cùng người (không phân biệt hoa thường) – đủ 2 thẻ
        m3: mk('m3', 2, 'A', 'D', false),
        m4: mk('m4', 1, 'B', 'D', true),
        m5: mk('m5', 2, 'B', 'C', false),
      },
    }],
  };
  const s = suspensions(t);
  const an = s.list.find((x) => x.who === 'An');
  assert.deepStrictEqual([an.match, an.vs, an.served, an.why], ['m3', 'Đội D', false, 'yc'], 'An ngồi ngoài trận m3');
  const bao = s.list.find((x) => x.who === 'Bảo');
  assert.deepStrictEqual([bao.match, bao.served, bao.why], ['m4', true, 'red'], 'Bảo đã chấp hành ở m4');
  assert.strictEqual(s.list.length, 2);
  assert.strictEqual(s.list[0].who, 'An', 'án sắp tới lên đầu');
  assert.deepStrictEqual(s.warn, []);
});

test('2 thẻ vàng trong một trận = thẻ đỏ gián tiếp (không tích luỹ); luật red = 2; chưa có trận kế tiếp; cảnh báo người bị treo giò vẫn ra sân', () => {
  const t = {
    players,
    disc: { y: 2, red: 2, reset: false },
    st: [{
      matches: {
        m1: mk('m1', 0, 'A', 'B', true, [Y('a', 'Cường'), Y('a', 'Cường')]),
        m2: mk('m2', 1, 'A', 'C', true, [{ type: 'goal', side: 'a', who: 'Cường' }]),
      },
    }],
  };
  const s = suspensions(t);
  assert.strictEqual(s.list.length, 2, 'red = 2: hai trận');
  assert.ok(s.list.some((x) => x.match === 'm2' && x.served) && s.list.some((x) => x.match === null && !x.served), 'm2 đã chấp hành, còn một trận tới');
  assert.deepStrictEqual(s.warn.map((w) => [w.match, w.who]), [['m2', 'Cường']], 'ghi bàn khi đang bị treo giò → cảnh báo');
});

test('y = 0: không tính thẻ vàng; reset: sang giai đoạn mới xoá thẻ vàng đang tích; giải không có thẻ → null', () => {
  const base = () => ({
    players,
    st: [
      { matches: { a1: mk('s0a', 0, 'A', 'B', true, [Y('a', 'Dũng')]) } },
      { matches: { b1: mk('s1a', 0, 'A', 'C', true, [Y('a', 'Dũng')]), b2: mk('s1b', 1, 'A', 'D', false) } },
    ],
  });
  assert.strictEqual(suspensions({ ...base(), disc: { y: 0, red: 1 } }), null, 'y = 0: hai thẻ vàng ở hai trận không bị gì');
  const s = suspensions(base());
  assert.deepStrictEqual(s.list.map((x) => x.match), ['s1b'], 'không reset: thẻ thứ 2 ở giai đoạn 2 → treo giò');
  assert.strictEqual(suspensions({ ...base(), disc: { y: 2, red: 1, reset: true } }), null, 'reset: thẻ giai đoạn 1 bị xoá');
  assert.strictEqual(suspensions({ players, st: [{ matches: { x: mk('x', 0, 'A', 'B', true, [{ type: 'goal', side: 'a', who: 'An' }]) } }] }), null);
  // Nhánh thua (lb) xếp sau nhánh thắng cùng vòng; chung kết tổng sau cùng
  const t = { players, st: [{ matches: {
    w0: mk('w0', 0, 'A', 'B', true, [R('a', 'Em')]),
    gf: mk('gf', 0, 'A', 'C', false, [], { gf: true }),
    l0: mk('l0', 0, 'A', 'D', false, [], { lb: true }),
  } }] };
  assert.strictEqual(suspensions(t).list[0].match, 'l0');
});

test('trên máy chủ: luật treo giò (otDisc) + danh sách kèm trang giải, đổi luật tính lại ngay', async () => {
  const org = await account();
  const hub = ctx.app.hub;
  const spec = { sport: 'football', stages: [{ type: 'roundrobin', groups: 1 }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Giải thẻ', spec, teams: teams(4) }, 'otCreated');
  const t = hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const first = Object.values(t.st[0].matches).find((m) => m.round === 0);
  org.send({ t: 'otEvent', id, match: first.id, type: 'red', side: 'a', who: 'Tuấn', min: 30 });
  await until(() => first.events && first.events.length === 1);
  let s = hub.otShared(t);
  assert.strictEqual(s.susp.list.length, 1);
  assert.strictEqual(s.susp.list[0].who, 'Tuấn');
  assert.strictEqual(s.disc, null);
  org.send({ t: 'otDisc', id, y: 3, red: 2, reset: true });
  await until(() => t.disc && t.disc.red === 2);
  s = hub.otShared(t);
  assert.deepStrictEqual(s.disc, { y: 3, red: 2, reset: true });
  assert.strictEqual(s.susp.list.length, 2, 'thẻ đỏ treo 2 trận');
  const err = await org.req({ t: 'otDisc', id, y: 3, red: 9 }, 'error');
  assert.strictEqual(err.code, 'bad_message');
  org.close();
});
