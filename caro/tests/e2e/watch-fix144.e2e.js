/*
 * Kiểm thử trình duyệt: mục Xem / khán giả (Issue #144, buổi kiểm thử chiều 25/10).
 *   node caro/tests/e2e/watch-fix144.e2e.js
 *  - A: người ngoài mở link ?room= của phòng RIÊNG có mật khẩu → hiện hộp nhập mật khẩu kèm dòng nhắc
 *    "Phòng riêng — cần mật khẩu để vào" (trước đây lỗi tham chiếu trong online.js làm chết lặng lẽ).
 *  - B: ván đang xem kết thúc → khán giả thấy thẻ kết quả rõ ràng (ai thắng, lý do); người thắng rời
 *    phòng sau đó thì tên trên thẻ và thanh trên vẫn đúng (không thành '?'); nút "Thôi xem" về mục Xem.
 *  - C: ván đang xem bị huỷ vì không đi nước đầu → thẻ kết quả ghi đúng lý do huỷ.
 * Mỗi người một hồ sơ trình duyệt riêng (helpers.user mở context mới cho mỗi người).
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8114;
  // Hạn nước đầu 3 giây để kịch bản C (ván huỷ vì không đi nước đầu) chạy nhanh.
  const { user, ok, shot, sleep, finish } = await setup(PORT, { FIRST_MOVE_MS: 3000 });
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);
  const meId = (p) => p.evaluate(() => window.CaroOnline.state.me.id);
  const quick = (p) => send(p, { t: 'quickMatch', timeLimit: -1 });
  async function waitRoom(p, pred, what) {
    for (let i = 0; i < 40; i++) { const r = await room(p); if (r && pred(r)) return r; await sleep(250); }
    throw new Error('quá hạn chờ: ' + what);
  }

  // ---------------------------------------------------------------- A: link phòng riêng có mật khẩu
  const host = await user('vi', 'xem_host');
  await send(host, { t: 'createRoom', side: 'first' });
  const hr = await waitRoom(host, (r) => r.players.length === 1, 'chủ phòng tạo phòng riêng');
  const guest = await user('vi', 'xem_guest');
  await guest.goto(`http://localhost:${PORT}/?room=${hr.code}`);
  let opened = false;
  for (let i = 0; i < 24 && !opened; i++) { opened = await guest.evaluate(() => document.getElementById('join').open); if (!opened) await sleep(250); }
  ok(opened, 'A: mở link phòng riêng thì hiện hộp nhập mật khẩu (không lặng lẽ về sảnh)');
  const hint = await guest.textContent('#join-err');
  ok(hint.includes('Phòng riêng'), 'A: hộp hiện dòng nhắc phòng riêng: ' + hint.trim());
  const filled = await guest.evaluate(() => document.querySelector('#join-form input[name=code]').value);
  ok(filled === hr.code, 'A: mã phòng được điền sẵn từ link');
  await guest.fill('#join-form input[name=password]', hr.password);
  await guest.click('#join-form button.primary');
  const jr = await waitRoom(guest, (r) => r.code === hr.code && r.players.length === 2, 'khách vào phòng riêng');
  ok(!!jr, 'A: nhập đúng mật khẩu thì vào được phòng riêng');

  // ---------------------------------------------------------------- B: thẻ kết quả cho khán giả
  const p1 = await user('vi', 'xem_p1');
  const p2 = await user('vi', 'xem_p2');
  const sp = await user('vi', 'xem_sp');
  await quick(p1); await quick(p2);
  const gr = await waitRoom(p1, (r) => r.players.length === 2, 'ghép ván công khai');
  await sp.evaluate((code) => window.CaroWatch.watch({ code }), gr.code);
  await sleep(800);
  ok(await sp.evaluate(() => window.CaroApp.watching), 'B: khán giả vào xem được ván công khai');
  const first = gr.actor === await meId(p1) ? p1 : p2;
  const second = first === p1 ? p2 : p1;
  const firstId = await meId(first);
  const winnerName = gr.players.find((pl) => pl.id === firstId).name;
  await send(first, { t: 'move', x: 0, y: 0 }); await sleep(300);
  await send(second, { t: 'move', x: 5, y: 5 }); await sleep(300);
  await send(second, { t: 'resign' }); await sleep(900);
  ok(await sp.evaluate(() => !document.getElementById('wt-result').hidden), 'B: ván kết thúc thì khán giả thấy thẻ kết quả');
  const title = await sp.textContent('#wt-result-title');
  const sub = await sp.textContent('#wt-result-sub');
  ok(title.includes('Ván đã kết thúc'), 'B: tiêu đề thẻ kết quả: ' + title.trim());
  ok(sub.includes(winnerName) && sub.includes('đầu hàng'), 'B: thẻ ghi đúng người thắng + lý do: ' + sub.trim());
  await shot(sp, 'watch-fix144-result.png');
  // Người thắng rời phòng: máy chủ tái chế phòng thành phòng chờ — thẻ và bàn cờ cuối vẫn phải giữ
  // nguyên cho khán giả (không nhảy về phòng chờ trống với tên '?'; "1200?" là điểm tạm, không phải tên).
  await send(first, { t: 'leaveRoom' }); await sleep(800);
  const sub2 = await sp.textContent('#wt-result-sub');
  ok(sub2.includes(winnerName), 'B: người thắng rời phòng, thẻ vẫn ghi đúng tên: ' + sub2.trim());
  const turnTxt = await sp.textContent('#turn');
  ok(turnTxt.includes(winnerName) && !/ \? /.test(turnTxt), 'B: thanh trên giữ đúng tên hai người chơi: ' + turnTxt.replace(/\s+/g, ' ').trim());
  ok(await sp.evaluate(() => !document.getElementById('wt-result').hidden), 'B: thẻ kết quả vẫn hiện sau khi người thắng rời phòng');
  // Nút "Thôi xem" phải về mục Xem, không mở ván với máy.
  await sp.click('#wt-leave'); await sleep(700);
  ok(await sp.evaluate(() => window.CaroShell.current === 'watch'), 'B: bấm "Thôi xem" thì về mục Xem');
  ok(!(await sp.evaluate(() => window.CaroApp.watching)), 'B: đã thôi xem sau khi bấm');

  // ---------------------------------------------------------------- C: ván huỷ vì không đi nước đầu
  const q1 = await user('vi', 'xem_q1');
  const q2 = await user('vi', 'xem_q2');
  const sp2 = await user('vi', 'xem_sp2');
  await quick(q1); await quick(q2);
  const cr = await waitRoom(q1, (r) => r.players.length === 2, 'ghép ván C');
  await sp2.evaluate((code) => window.CaroWatch.watch({ code }), cr.code);
  await sleep(600);
  ok(await sp2.evaluate(() => window.CaroApp.watching), 'C: khán giả vào xem ván sắp bị huỷ');
  await sleep(4200); // quá hạn nước đầu 3 giây → ván tự huỷ
  ok(await sp2.evaluate(() => !document.getElementById('wt-result').hidden), 'C: ván bị huỷ thì khán giả thấy thẻ kết quả');
  const subC = await sp2.textContent('#wt-result-sub');
  ok(subC.includes('không đi nước đầu'), 'C: thẻ ghi lý do huỷ vì không đi nước đầu: ' + subC.trim());

  await finish();
})();
