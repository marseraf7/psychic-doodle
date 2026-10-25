/*
 * Kiểm thử trình duyệt: hộp xác nhận trong app thay confirm() gốc (Issue #144 mục 8, Minh duyệt 25/10).
 *   node caro/tests/e2e/confirm-dlg.e2e.js
 * Đầu hàng / Rời phòng / Đăng xuất khi đang có ván dở phải hiện hộp của app (#confirm-dlg) — không phải
 * hộp gốc của trình duyệt (hộp gốc bị trình duyệt nhúng chặn / công cụ kiểm thử tự đóng thành "Huỷ"
 * khiến nút trông như chết). Kiểm cả hai nhánh: bấm Huỷ thì không có gì xảy ra, bấm Đồng ý thì làm thật.
 * helpers tự accept() mọi hộp thoại gốc: nếu còn confirm() gốc, hộp của app sẽ không bao giờ mở và
 * nhánh Huỷ sẽ thành Đồng ý — bài thử này bắt được cả hai lỗi đó.
 * Mỗi người một hồ sơ trình duyệt riêng (helpers.user mở context mới cho mỗi người).
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8122;
  const { user, ok, sleep, finish } = await setup(PORT);
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);
  const meId = (p) => p.evaluate(() => window.CaroOnline.state.me.id);
  const quick = (p) => send(p, { t: 'quickMatch', timeLimit: -1 });
  async function waitRoom(p, pred, what) {
    for (let i = 0; i < 48; i++) { const r = await room(p); if (r && pred(r)) return r; await sleep(250); }
    throw new Error('quá hạn chờ: ' + what);
  }
  const dlgOpen = (p) => p.evaluate(() => document.getElementById('confirm-dlg').open);
  async function play2(first, second) {
    await send(first, { t: 'move', x: 0, y: 0 }); await sleep(300);
    await send(second, { t: 'move', x: 5, y: 5 }); await sleep(300);
  }

  // ---------------------------------------------------------------- Đầu hàng: Huỷ rồi Đồng ý
  const a = await user('vi', 'hx_a');
  const b = await user('vi', 'hx_b');
  a.autoConfirm = b.autoConfirm = false; // bài này tự bấm Huỷ / Đồng ý ở hộp xác nhận
  await quick(a); await quick(b);
  const r1 = await waitRoom(a, (x) => x.players.length === 2 && !x.winner, 'ghép ván 1');
  const f1 = r1.actor === await meId(a) ? a : b;
  const s1 = f1 === a ? b : a;
  await play2(f1, s1);
  await a.click('#btn-resign');
  await sleep(600);
  ok(await dlgOpen(a), 'đầu hàng: hộp xác nhận trong app hiện lên');
  ok((await a.textContent('#confirm-q')).includes('Đầu hàng'), 'đầu hàng: hộp hỏi đúng nội dung');
  await a.click('#confirm-no');
  await sleep(500);
  ok(!(await room(a)).winner, 'đầu hàng + Huỷ: ván vẫn tiếp tục');
  await a.click('#btn-resign');
  await sleep(600);
  await a.click('#confirm-ok');
  await waitRoom(b, (x) => !!x.winner, 'đầu hàng có hiệu lực');
  const end1 = await waitRoom(a, (x) => !!x.winner, 'A nhận kết quả đầu hàng'); // B nhận trước A thì đọc ngay phòng của A còn cũ
  ok(end1.winner === (r1.seats.x === await meId(b) ? 1 : 2), 'đầu hàng + Đồng ý: ván kết thúc, đối thủ là người thắng');

  // ---------------------------------------------------------------- Rời phòng giữa ván: Huỷ rồi Đồng ý
  await send(a, { t: 'rematch' }); await send(b, { t: 'rematch' });
  const r2 = await waitRoom(a, (x) => x.gameNo === 2 && !x.winner, 'ván tái đấu');
  const f2 = r2.actor === await meId(a) ? a : b;
  const s2 = f2 === a ? b : a;
  await play2(f2, s2);
  await a.click('#btn-leave');
  await sleep(600);
  ok(await dlgOpen(a), 'rời phòng: hộp xác nhận trong app hiện lên');
  await a.click('#confirm-no');
  await sleep(500);
  ok((await room(a)).players.length === 2, 'rời phòng + Huỷ: vẫn ở trong phòng');
  await a.click('#btn-leave');
  await sleep(600);
  await a.click('#confirm-ok');
  await sleep(800);
  ok((await room(a)) === null, 'rời phòng + Đồng ý: đã ra khỏi phòng');

  // ---------------------------------------------------------------- Đăng xuất giữa ván: Huỷ rồi Đồng ý
  const c = await user('vi', 'hx_c');
  const d = await user('vi', 'hx_d');
  c.autoConfirm = d.autoConfirm = false;
  await quick(c); await quick(d);
  const r3 = await waitRoom(c, (x) => x.players.length === 2 && !x.winner, 'ghép ván 3');
  const f3 = r3.actor === await meId(c) ? c : d;
  const s3 = f3 === c ? d : c;
  await play2(f3, s3);
  const cId = await meId(c);
  await c.evaluate(() => document.getElementById('logout').click());
  await sleep(600);
  ok(await dlgOpen(c), 'đăng xuất: hộp xác nhận trong app hiện lên');
  ok((await c.textContent('#confirm-q')).includes('Đăng xuất'), 'đăng xuất: hộp hỏi đúng nội dung');
  await c.click('#confirm-no');
  await sleep(500);
  ok((await meId(c)) === cId, 'đăng xuất + Huỷ: vẫn đăng nhập');
  await c.evaluate(() => document.getElementById('logout').click());
  await sleep(600);
  await c.click('#confirm-ok');
  let guest = false;
  for (let i = 0; i < 20 && !guest; i++) {
    guest = await c.evaluate(() => { const me = window.CaroOnline.state.me; return !me || me.guest === true || String(me.id).startsWith('g_'); });
    if (!guest) await sleep(250);
  }
  ok(guest, 'đăng xuất + Đồng ý: đã đăng xuất (về khách)');

  await finish();
})();
