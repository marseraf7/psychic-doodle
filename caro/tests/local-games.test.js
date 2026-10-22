// Kiểm thử kho Lịch sử đấu trên máy (caro/local-games.js). Chạy: node --test caro/tests/local-games.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LG = require('../local-games.js');

/** localStorage giả: quota = số ký tự tối đa (khoá + giá trị), vượt thì ném QuotaExceededError như trình duyệt. */
function fakeStorage(quota = Infinity) {
  const m = new Map();
  const size = () => [...m].reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      v = String(v);
      const before = m.get(k);
      m.set(k, v);
      if (size() > quota) {
        if (before === undefined) m.delete(k); else m.set(k, before);
        const e = new Error('đầy');
        e.name = 'QuotaExceededError';
        throw e;
      }
    },
    removeItem: (k) => { m.delete(k); },
  };
}

const game = (n, extra = {}) => ({
  kind: 'bot', bot: 'ti', me: 1, x: '', o: '', winner: 1, reason: 'win', rule: 'vn', timeLimit: 0, clock: null,
  moves: Array.from({ length: n }, (_, i) => [i, i % 2]), ...extra,
});

test('lưu, đọc, danh sách mới nhất trước, không lưu trùng', () => {
  let t = 1000;
  const s = LG.create(fakeStorage(), () => t++);
  assert.deepStrictEqual(s.settings(), { on: true, ask: true, online: 'off' });
  const a = s.add(game(9));
  const b = s.add(game(11, { winner: 2, kind: 'online', x: 'An', o: 'Bình', me: 2 }));
  assert.ok(a && b && a !== b);
  assert.deepStrictEqual(s.list().map((g) => g.id), [b, a]);
  const g = s.get(b);
  assert.strictEqual(g.n, 11);
  assert.strictEqual(g.moves.length, 11);
  assert.strictEqual(g.x, 'An');
  assert.strictEqual(g.analysis, null);
  assert.strictEqual(s.list()[0].moves, undefined, 'danh sách không chứa nước đi');
  // Cùng ván (cùng giờ kết thúc + số nước + luật): trả về id cũ
  assert.strictEqual(s.add({ ...game(11), at: g.at }), b);
  assert.strictEqual(s.count(), 2);
  assert.strictEqual(s.get('khong-co'), null);
});

test('bỏ qua ván không hợp lệ', () => {
  const s = LG.create(fakeStorage());
  assert.strictEqual(s.add(null), null);
  assert.strictEqual(s.add(game(0)), null);
  assert.strictEqual(s.add({ ...game(5), winner: 0 }), null);
  assert.strictEqual(s.add({ ...game(5), moves: [[1, 'a']] }), null);
  assert.strictEqual(s.count(), 0);
});

test('phân tích: gắn vào ván, tìm ván theo nước đi', () => {
  const s = LG.create(fakeStorage());
  const id = s.add(game(7));
  s.add(game(7, { rule: 'free' }));
  assert.strictEqual(s.findByMoves('vn', game(7).moves), id);
  assert.strictEqual(s.findByMoves('vn', game(8).moves), null);
  assert.ok(s.setAnalysis(id, { moves: [{ cls: 'best' }], evals: [] }));
  assert.strictEqual(s.list().find((g) => g.id === id).an, true);
  assert.deepStrictEqual(s.get(id).analysis.moves, [{ cls: 'best' }]);
  assert.strictEqual(s.setAnalysis('khong-co', {}), false);
  assert.strictEqual(s.usage().analyzed, 1);
});

test('ván online của tài khoản: không lưu trùng theo mã share', () => {
  const s = LG.create(fakeStorage());
  const a = s.add(game(9, { kind: 'online', share: 'abc', at: 5 }));
  assert.strictEqual(s.add(game(9, { kind: 'online', share: 'abc', at: 99 })), a, 'cùng mã share: trả về ván đã có');
  assert.strictEqual(s.findShare('abc'), a);
  assert.strictEqual(s.findShare('xyz'), null);
  assert.strictEqual(s.findShare(null), null);
  assert.ok(s.add(game(9, { kind: 'online', share: 'def', at: 5 })) !== a);
  assert.strictEqual(s.count(), 2);
});

test('xoá nhiều ván, xoá tất cả: xoá hẳn khỏi bộ nhớ', () => {
  const st = fakeStorage();
  const s = LG.create(st);
  const ids = [1, 2, 3, 4].map((i) => s.add(game(5 + i, { at: i })));
  s.setPending([game(5)]);
  assert.strictEqual(s.remove([ids[0], ids[2], 'khong-co']), 2);
  assert.deepStrictEqual(s.list().map((g) => g.id).sort(), [ids[1], ids[3]].sort());
  assert.strictEqual(st.getItem(LG.KEYS.game(ids[0])), null, 'dữ liệu ván đã xoá không còn trong máy');
  s.setSettings({ ask: false });
  assert.strictEqual(s.clear(), 2);
  const left = [...st.m.keys()];
  assert.deepStrictEqual(left, [LG.KEYS.set], 'chỉ còn cài đặt');
  assert.strictEqual(s.settings().ask, false);
  assert.deepStrictEqual(s.usage(), { games: 0, bytes: 0, analyzed: 0 });
});

test('giữ tối đa MAX ván: ván cũ nhất tự xoá', () => {
  const st = fakeStorage();
  const s = LG.create(st);
  let first = null;
  for (let i = 0; i < LG.MAX + 3; i++) { const id = s.add(game(5, { at: 10 + i })); if (!first) first = id; }
  assert.strictEqual(s.count(), LG.MAX);
  assert.strictEqual(s.get(first), null);
  assert.strictEqual(st.getItem(LG.KEYS.game(first)), null);
});

test('bộ nhớ đầy: bỏ phân tích ván cũ trước, rồi tới ván cũ nhất', () => {
  const st = fakeStorage(4500);
  const s = LG.create(st);
  const big = { evals: 'x'.repeat(1500) };
  const a = s.add(game(10, { at: 1 }));
  s.setAnalysis(a, big);
  const b = s.add(game(10, { at: 2 }));
  s.setAnalysis(b, big);
  // Thêm phân tích thứ 3 không vừa: phân tích của ván cũ nhất (a) bị bỏ
  const c = s.add(game(10, { at: 3 }));
  assert.ok(s.setAnalysis(c, big));
  assert.strictEqual(s.get(a).analysis, null);
  assert.ok(s.get(c).analysis);
  // Ván dài không vừa nữa: xoá dần ván cũ cho tới khi vừa
  const d = s.add(game(200, { at: 4 }));
  assert.ok(d);
  assert.ok(s.get(d));
  assert.ok(s.usage().analyzed < 2, "phân tích ván cũ bị bỏ trước");
  assert.ok(s.usage().bytes <= 4500 * 2);
  assert.strictEqual(s.setAnalysis(d, { evals: 'y'.repeat(20000) }), false, 'phân tích quá lớn: không lưu, ván vẫn còn');
  assert.ok(s.get(d));
  // Một ván lớn hơn cả bộ nhớ (thực tế không xảy ra: tối đa 2.000 nước ≈ 20 KB): báo không lưu được, kho không hỏng
  assert.strictEqual(s.add(game(900, { at: 5 })), null);
  assert.ok(s.list().every((g) => s.get(g.id)), 'mọi ván trong danh sách đều đọc được');
});

test('ván chờ hỏi lưu, cài đặt, dữ liệu hỏng', () => {
  const st = fakeStorage();
  const s = LG.create(st);
  assert.deepStrictEqual(s.pending(), []);
  s.setPending([game(6), { bad: 1 }, game(7)]);
  assert.deepStrictEqual(s.pending().map((g) => g.moves.length), [6, 7], 'bỏ bản ghi hỏng');
  s.setPending(Array.from({ length: LG.MAX_PENDING + 5 }, (_, i) => game(5 + i)));
  assert.strictEqual(s.pending().length, LG.MAX_PENDING, 'giữ tối đa MAX_PENDING ván chờ (mới nhất)');
  assert.strictEqual(s.pending()[0].moves.length, 10);
  s.setPending([]);
  assert.deepStrictEqual(s.pending(), []);
  st.setItem(LG.KEYS.pending, JSON.stringify(game(8))); // bản cũ: 1 ván, không phải mảng
  assert.strictEqual(s.pending()[0].moves.length, 8);
  assert.deepStrictEqual(s.setSettings({ on: false }), { on: false, ask: true, online: 'off' });
  assert.strictEqual(s.setSettings({ online: 'all' }).online, 'all');
  assert.strictEqual(s.setSettings({ online: 'lạ' }).online, 'off', 'giá trị lạ: về mặc định');
  st.setItem(LG.KEYS.index, '{hỏng');
  assert.deepStrictEqual(s.list(), []);
  st.setItem(LG.KEYS.index, '{"a":1}');
  assert.deepStrictEqual(s.list(), []);
  // Bộ nhớ bị chặn (chế độ riêng tư): không lỗi
  const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  const b = LG.create(blocked);
  assert.deepStrictEqual(b.list(), []);
  assert.strictEqual(b.add(game(5)), null);
  assert.deepStrictEqual(b.setSettings({ on: false }), { on: false, ask: true, online: 'off' });
  b.setPending([game(5)]);
  assert.strictEqual(b.clear(), 0);
});

test('ca biên: toạ độ không nguyên, ván quá 2000 nước, kết quả lạ, dữ liệu pending dị thường', () => {
  const s = LG.create(fakeStorage());
  // Ván quá 2000 nước
  assert.strictEqual(s.add(game(2001)), null);
  // Toạ độ không nguyên / NaN / Infinity / string
  assert.strictEqual(s.add({ ...game(5), moves: [[0, 0], [1.5, 2]] }), null);
  assert.strictEqual(s.add({ ...game(5), moves: [[0, 0], [NaN, 2]] }), null);
  assert.strictEqual(s.add({ ...game(5), moves: [[0, 0], [Infinity, 2]] }), null);
  assert.strictEqual(s.add({ ...game(5), moves: [[0, 0], ['0', '1']] }), null);
  // Kết quả ngoài 1, 2, 3
  assert.strictEqual(s.add({ ...game(5), winner: 4 }), null);
  assert.strictEqual(s.add({ ...game(5), winner: -1 }), null);
  assert.strictEqual(s.add({ ...game(5), winner: 0 }), null);
  // Pending với các kiểu dữ liệu dị thường
  const st = fakeStorage();
  const s2 = LG.create(st);
  st.setItem(LG.KEYS.pending, '123'); // số nguyên
  assert.deepStrictEqual(s2.pending(), []);
  st.setItem(LG.KEYS.pending, '"string"'); // chuỗi
  assert.deepStrictEqual(s2.pending(), []);
  st.setItem(LG.KEYS.pending, 'true'); // boolean
  assert.deepStrictEqual(s2.pending(), []);
  st.setItem(LG.KEYS.pending, '{"not":"valid"}'); // object không hợp lệ
  assert.deepStrictEqual(s2.pending(), []);
  st.setItem(LG.KEYS.pending, JSON.stringify([null, 123, 'abc', { invalid: true }, []])); // mảng JSON hợp lệ chứa các phần tử không phải ván hợp lệ
  assert.deepStrictEqual(s2.pending(), []);
  st.setItem(LG.KEYS.pending, '{hỏng JSON'); // chuỗi JSON hỏng cú pháp
  assert.deepStrictEqual(s2.pending(), []);
});


test('M-E1: ván có toạ độ vượt biên chung 512 bị coi là không hợp lệ khi lưu/tải', () => {
  const s = LG.create(fakeStorage());
  assert.strictEqual(s.add(game(5, { moves: [[0, 0], [600, 0], [1, 1], [2, 2], [3, 3]] })), null, 'một nước ở x=600: cả ván bị từ chối');
  assert.strictEqual(s.add(game(5, { moves: [[0, 0], [0, -513], [1, 1], [2, 2], [3, 3]] })), null, 'một nước ở y=-513: cả ván bị từ chối');
  const ok = s.add(game(5, { moves: [[512, -512], [0, 0], [1, 1], [2, 2], [3, 3]] }));
  assert.ok(ok, 'nước ở đúng biên (512, -512) vẫn hợp lệ');
  assert.strictEqual(s.get(ok).moves.length, 5);
  assert.strictEqual(s.count(), 1);
});
