/*
 * Kiểm thử trình duyệt: tái đấu sau ván xếp cặp nhanh (Issue #144 mục 3, buổi kiểm thử chiều 25/10).
 *   node caro/tests/e2e/rematch.e2e.js
 *  - Luồng 1: bấm "Tái đấu" trên thẻ kết quả → đối thủ nhận thông báo "muốn tái đấu", nút trên thẻ của
 *    đối thủ đổi thành "Đồng ý tái đấu", bấm đồng ý thì ván mới bắt đầu cho cả hai.
 *  - Luồng 2 (đúng lỗi buổi chiều): bấm "Tìm trận mới" trước (thẻ nổi "Đang tìm đối thủ…" hiện lên) rồi
 *    bấm "Tái đấu" — cú bấm phải tới được nút (trước đây thẻ nổi che nút, bấm trượt lặng lẽ) và lời mời
 *    phải tới đối thủ đang ở Trang chủ.
 *  - Luồng 3: đối thủ đã rời phòng hẳn → người bấm tái đấu được báo "Đối thủ đã rời phòng".
 * Mỗi người một hồ sơ trình duyệt riêng (helpers.user mở context mới cho mỗi người).
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8116;
  const { user, ok, shot, sleep, finish } = await setup(PORT);
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);
  const meId = (p) => p.evaluate(() => window.CaroOnline.state.me.id);
  const quick = (p) => send(p, { t: 'quickMatch', timeLimit: -1 });
  async function waitRoom(p, pred, what) {
    for (let i = 0; i < 48; i++) { const r = await room(p); if (r && pred(r)) return r; await sleep(250); }
    throw new Error('quá hạn chờ: ' + what);
  }
  // Chờ toast chứa đoạn chữ (toast chỉ sống ~3 giây nên hỏi dồn dập).
  async function waitToast(p, text, what) {
    for (let i = 0; i < 20; i++) {
      const t = await p.evaluate((needle) => {
        const hit = [...document.querySelectorAll('#toasts .toast')].find((el) => el.innerText.includes(needle));
        return hit ? hit.innerText : '';
      }, text);
      if (t) return t;
      await sleep(150);
    }
    throw new Error('quá hạn chờ toast: ' + what);
  }
  // Ghép một ván xếp cặp, đánh 2 nước rồi bên đi sau đầu hàng → ván kết thúc.
  async function finishedGame(a, b) {
    await quick(a); await quick(b);
    const r = await waitRoom(a, (x) => x.players.length === 2 && !x.winner, 'ghép ván');
    const first = r.actor === await meId(a) ? a : b;
    const second = first === a ? b : a;
    await send(first, { t: 'move', x: 0, y: 0 }); await sleep(300);
    await send(second, { t: 'move', x: 5, y: 5 }); await sleep(300);
    await send(second, { t: 'resign' });
    await waitRoom(a, (x) => !!x.winner, 'ván kết thúc');
    await sleep(500); // chờ thẻ kết quả hiện
    return { first, second };
  }

  // ---------------------------------------------------------------- Luồng 1: lời mời tới đối thủ
  const a = await user('vi', 'td_a');
  const b = await user('vi', 'td_b');
  await finishedGame(a, b);
  await b.click('#banner-rematch');
  const toast1 = await waitToast(a, 'muốn tái đấu', 'đối thủ nhận thông báo tái đấu');
  ok(toast1.includes('td_b'), 'luồng 1: đối thủ nhận thông báo "td_b muốn tái đấu": ' + toast1.trim());
  const ra = await room(a);
  ok(ra.rematch.includes(await meId(b)), 'luồng 1: trạng thái phòng ghi phiếu tái đấu của td_b');
  ok((await a.textContent('#banner-rematch')).includes('Đồng ý tái đấu'), 'luồng 1: nút trên thẻ của đối thủ đổi thành "Đồng ý tái đấu"');
  await a.click('#banner-rematch');
  const r2 = await waitRoom(a, (x) => x.gameNo === 2 && !x.winner, 'ván tái đấu bắt đầu');
  ok(!!r2, 'luồng 1: đối thủ đồng ý thì ván mới bắt đầu');
  ok((await room(b)).gameNo === 2, 'luồng 1: người bấm cũng vào ván tái đấu');

  // ---------------------------------------------------------------- Luồng 2: đang tìm trận vẫn bấm được Tái đấu
  const c = await user('vi', 'td_c');
  const d = await user('vi', 'td_d');
  await finishedGame(c, d);
  await c.evaluate(() => window.CaroShell.open('home')); // phía nhận ở Trang chủ như buổi chiều
  await d.click('#banner-quick'); // bấm "Tìm trận mới": thẻ nổi "Đang tìm đối thủ…" hiện lên
  await sleep(800);
  ok(await d.evaluate(() => window.CaroMatch.searching), 'luồng 2: người bấm đang ở trong hàng chờ');
  await d.click('#banner-rematch'); // cú bấm chuột thật: trước đây bị thẻ nổi che, không tới nút
  const toast2 = await waitToast(c, 'muốn tái đấu', 'lời mời tái đấu tới đối thủ ở Trang chủ');
  ok(toast2.includes('td_d'), 'luồng 2: đối thủ ở Trang chủ vẫn nhận lời mời tái đấu: ' + toast2.trim());
  ok((await room(c)).rematch.includes(await meId(d)), 'luồng 2: trạng thái phòng phía đối thủ ghi phiếu tái đấu');
  await send(d, { t: 'quickCancel' });

  // ---------------------------------------------------------------- Luồng 3: đối thủ đã rời phòng
  // (Đối thủ rời hẳn thì thẻ kết quả phía người còn lại cũng ẩn theo phòng tái chế — ca còn bấm được là
  // bấm cùng lúc / lệnh đang bay; gửi lệnh như nút bấm để kiểm phần máy chủ báo lại cho người bấm.)
  const e = await user('vi', 'td_e');
  const f = await user('vi', 'td_f');
  await finishedGame(e, f);
  await send(e, { t: 'leaveRoom' });
  await waitRoom(f, (x) => x.players.length === 1, 'đối thủ rời phòng');
  await sleep(400);
  await send(f, { t: 'rematch' });
  const toast3 = await waitToast(f, 'Đối thủ đã rời phòng', 'người bấm được báo đối thủ đã rời');
  ok(!!toast3, 'luồng 3: người bấm tái đấu được báo ngay "Đối thủ đã rời phòng"');
  await shot(f, 'rematch-no-opponent.png');

  await finish();
})();
