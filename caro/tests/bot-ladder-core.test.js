// Thang nhân vật máy – phần tính (bot-ladder-core.js). Chạy: node --test caro/tests/bot-ladder-core.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LC = require('../bot-ladder-core.js');
const Bots = require('../bots.js');

const ids = LC.order(Bots.BOTS);

test('thứ tự thang: theo mức, trong mức Toàn diện cuối cùng, BOAT là bậc cuối', () => {
  assert.strictEqual(ids.length, 31);
  assert.strictEqual(LC.RUNGS, ids.length, 'trần bậc khi làm sạch = số nhân vật (thêm nhân vật thì tăng RUNGS)');
  assert.strictEqual(ids[0], 'bom', 'mức 1, Gài bẫy');
  assert.strictEqual(ids[4], 'trinh', 'mức 1, Toàn diện mạnh nhất mức');
  assert.strictEqual(ids[30], 'boat');
  const elo = ids.map((id) => Bots.get(id).elo);
  assert.deepStrictEqual(elo, elo.slice().sort((a, b) => a - b), 'Elo không giảm dọc thang');
});

test('thắng: lên bậc theo luật, thắng nhân vật thấp hơn không tụt, nhân vật lạ bỏ qua', () => {
  let s = LC.win(null, 'na', 'vn', ids, 5);
  assert.deepStrictEqual(s, { r: { vn: ids.indexOf('na') + 1 }, at: 5 });
  const s2 = LC.win(s, 'bom', 'vn', ids, 9);
  assert.deepStrictEqual(s2, s, 'thắng bậc thấp hơn: giữ nguyên');
  s = LC.win(s, 'goat', 'renju', ids, 10);
  assert.strictEqual(s.r.renju, ids.indexOf('goat') + 1);
  assert.strictEqual(s.r.vn, ids.indexOf('na') + 1, 'mỗi luật tính riêng');
  assert.deepStrictEqual(LC.win(s, 'khong-co', 'vn', ids), s);
  assert.strictEqual(LC.win(null, 'bom', 'la', ids, 1).r.vn, 1, 'luật lạ → luật Việt Nam');
});

test('gộp + làm sạch dữ liệu từ ngoài vào', () => {
  assert.deepStrictEqual(LC.merge({ r: { vn: 3, free: 8 }, at: 2 }, { r: { vn: 5, std: 1 }, at: 7 }), { r: { vn: 5, free: 8, std: 1 }, at: 7 });
  assert.deepStrictEqual(LC.clean({ r: { vn: '4', free: -3, x: 9, renju: 1e9 }, at: 'z' }), { r: { vn: 4, renju: LC.RUNGS }, at: 0 });
  assert.deepStrictEqual(LC.clean('rác'), { r: {}, at: 0 });
  assert.deepStrictEqual(LC.merge(null, undefined), { r: {}, at: 0 });
});

test('huy hiệu: hết mỗi mức (luật bất kỳ), hạ BOAT', () => {
  assert.deepStrictEqual(LC.badges({ r: { vn: 4 } }, Bots.BOTS), []);
  assert.deepStrictEqual(LC.badges({ r: { vn: 5 } }, Bots.BOTS), ['tier1']);
  assert.deepStrictEqual(LC.badges({ r: { vn: 5, free: 10 } }, Bots.BOTS), ['tier1', 'tier2']);
  const all = LC.badges({ r: { std: 31 } }, Bots.BOTS);
  assert.strictEqual(all.length, 7);
  assert.strictEqual(all[6], 'boat');
});
