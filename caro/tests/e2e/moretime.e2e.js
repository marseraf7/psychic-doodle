/*
 * Kiểm thử trình duyệt: nút "+15 giây cho đối thủ" trong cửa sổ đi nước đầu (Issue #144 mục 5).
 *   node caro/tests/e2e/moretime.e2e.js
 * Buổi kiểm thử 25/10: ván xếp cặp 5+0, bấm +15 giây cho đối thủ đang phải đi nước đầu — đồng hồ hiện
 * thêm giờ nhưng đếm ngược nước đầu vẫn chạy và ván bị huỷ đúng hạn cũ. Nay cộng giờ gia hạn luôn hạn
 * nước đầu: ván sống qua hạn gốc, người được cộng đi tiếp bình thường.
 * (Hạn nước đầu chỉ có ở ván gặp người lạ — ghép nhanh / phòng công khai — nên bài thử dùng ghép nhanh.)
 * Hai người chơi ở hai hồ sơ trình duyệt riêng (helpers.user mở context mới cho mỗi người).
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8118;
  // Hạn nước đầu 2,5 giây: đủ ngắn để chờ qua hạn gốc trong bài thử.
  const { user, ok, sleep, finish } = await setup(PORT, { FIRST_MOVE_MS: 2500 });
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);
  const meId = (p) => p.evaluate(() => window.CaroOnline.state.me.id);
  async function waitRoom(p, pred, what) {
    for (let i = 0; i < 48; i++) { const r = await room(p); if (r && pred(r)) return r; await sleep(250); }
    throw new Error('quá hạn chờ: ' + what);
  }

  const a = await user('vi', 'cg_a');
  const b = await user('vi', 'cg_b');
  await send(a, { t: 'quickMatch', clock: '1+0' });
  await send(b, { t: 'quickMatch', clock: '1+0' });
  const r = await waitRoom(a, (x) => x.players.length === 2 && !!x.clock, 'ghép ván có đồng hồ');
  const first = r.actor === await meId(a) ? a : b;
  const second = first === a ? b : a;
  // Người đi sau bấm +15 giây cho người đang phải đi nước đầu.
  await send(second, { t: 'moretime' });
  const after = await waitRoom(first, (x) => x.firstMove > 10000, 'hạn nước đầu được gia hạn');
  ok(after.firstMove > 10000, '+15 giây: hạn nước đầu được gia hạn theo (còn ' + Math.round(after.firstMove / 1000) + ' giây)');
  // Chờ qua hạn nước đầu gốc (2,5 giây): ván không được tự huỷ.
  await sleep(3200);
  const alive = await room(first);
  ok(!alive.winner && alive.moves.length === 0, 'qua hạn nước đầu gốc, ván vẫn còn (không tự huỷ)');
  // Người được cộng giờ đi tiếp bình thường.
  await send(first, { t: 'move', x: 0, y: 0 }); await sleep(300);
  await send(second, { t: 'move', x: 5, y: 5 }); await sleep(300);
  ok((await room(first)).moves.length === 2, 'hai bên đi tiếp bình thường sau khi được cộng giờ');

  await finish();
})();
