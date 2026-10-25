/*
 * Kiểm thử trình duyệt: thẻ "Quay lại ván đang chơi" ở Trang chủ (Issue #144 mục 4).
 *   node caro/tests/e2e/resume-card.e2e.js
 *  - Ván đang đánh / phòng đang chờ: thẻ ghi "Quay lại ván đang chơi" + mã phòng (giữ nguyên như cũ).
 *  - Ván đã có kết quả: thẻ đổi thành "Xem kết quả ván vừa rồi" (trước đây ván xong lâu rồi vẫn ghi
 *    "đang chơi"); nếu đối thủ đã bấm tái đấu, thẻ ghi thêm "Đối thủ muốn tái đấu".
 *  - Bấm thẻ khi ván đã xong: vào bàn cờ và thấy thẻ kết quả.
 * Hai người chơi ở hai hồ sơ trình duyệt riêng (helpers.user mở context mới cho mỗi người).
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8117;
  const { user, ok, sleep, finish } = await setup(PORT);
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);
  const meId = (p) => p.evaluate(() => window.CaroOnline.state.me.id);
  const quick = (p) => send(p, { t: 'quickMatch', timeLimit: -1 });
  async function waitRoom(p, pred, what) {
    for (let i = 0; i < 48; i++) { const r = await room(p); if (r && pred(r)) return r; await sleep(250); }
    throw new Error('quá hạn chờ: ' + what);
  }
  const cardText = async (p) => {
    await p.evaluate(() => window.CaroShell.open('home'));
    await sleep(500);
    return (await p.textContent('#home-resume')).replace(/\s+/g, ' ').trim();
  };

  const a = await user('vi', 'th_a');
  const b = await user('vi', 'th_b');
  await quick(a); await quick(b);
  const r = await waitRoom(a, (x) => x.players.length === 2 && !x.winner, 'ghép ván');
  const first = r.actor === await meId(a) ? a : b;
  const second = first === a ? b : a;

  // Ván đang diễn ra: nhãn cũ "Quay lại ván đang chơi" + mã phòng
  const during = await cardText(a);
  ok(during.includes('Quay lại ván đang chơi') && during.includes(r.code), 'ván đang đánh: thẻ ghi "Quay lại ván đang chơi" + mã phòng: ' + during);

  // Đánh 2 nước, bên đi sau đầu hàng, đối thủ bấm tái đấu
  await a.evaluate(() => window.CaroApp.toBoard());
  await send(first, { t: 'move', x: 0, y: 0 }); await sleep(300);
  await send(second, { t: 'move', x: 5, y: 5 }); await sleep(300);
  await send(second, { t: 'resign' });
  await waitRoom(a, (x) => !!x.winner, 'ván kết thúc');
  await send(second, { t: 'rematch' });
  await sleep(600);

  // Ván đã xong: thẻ đổi nhãn + ghi lời mời tái đấu của đối thủ.
  // Kiểm thẻ từ phía người đi trước (first): người bấm tái đấu là second, nên first mới là phía
  // thấy "Đối thủ muốn tái đấu". Kiểm từ phía a sẽ sai khi a chính là second (người đi trước
  // được chọn ngẫu nhiên khi ghép trận) vì khi đó người bấm tái đấu là a, không phải đối thủ.
  const after = await cardText(first);
  ok(after.includes('Xem kết quả ván vừa rồi'), 'ván đã xong: thẻ đổi thành "Xem kết quả ván vừa rồi": ' + after);
  ok(!after.includes('Quay lại ván đang chơi'), 'ván đã xong: không còn ghi "đang chơi"');
  ok(after.includes('Đối thủ muốn tái đấu'), 'thẻ ghi thêm "Đối thủ muốn tái đấu" khi đối thủ đã bấm tái đấu');

  // Bấm thẻ: vào bàn cờ, thấy thẻ kết quả của ván
  await first.click('#home-resume [data-resume]');
  await sleep(700);
  ok(await first.evaluate(() => !document.getElementById('banner').hidden), 'bấm thẻ kết quả thì vào bàn cờ và thấy thẻ kết quả ván');

  await finish();
})();
