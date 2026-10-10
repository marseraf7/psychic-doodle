/*
 * Kiểm thử trình duyệt – giải đấu giai đoạn 1: câu lạc bộ (duyệt, xin vào, quản lý), giải Arena,
 * giải loại trực tiếp 4 người tới bục trao giải. 5 người chơi, 4 ngôn ngữ.
 * Chạy: node caro/tests/e2e/tour-basic.e2e.js   (cần Playwright + Chromium; xem helpers.js)
 */
'use strict';
const { setup, play, roomOf, sleep } = require('./helpers.js');

(async () => {
  const { user, ok, shot, finish } = await setup(Number(process.env.E2E_PORT) || 8792);
  const boss = await user('vi', 'boss', 1100), A = await user('vi', 'an_vi'), B = await user('en', 'bob_en', 390);
  // A tạo CLB -> chờ duyệt
  await A.click('#open-clubs'); await sleep(400);
  await A.click('[data-act="clubNew"]'); await sleep(200);
  await A.fill('#cf input[name=name]', 'CLB Hà Nội');
  await A.fill('#cf textarea[name=desc]', 'Chơi caro mỗi tối, giao lưu vui vẻ.');
  await A.check('#cf input[value=request]');
  await A.click('#cf button.primary'); await sleep(500);
  ok((await A.textContent('#tour-body')).includes('chờ quản trị viên duyệt'), 'A: CLB chờ duyệt');
  await shot(A, 't1-club-pending.png');
  ok(await boss.isVisible('#tour-badge') && (await boss.textContent('#tour-badge')) === '1', 'boss: số mục chờ duyệt trên nút');
  await boss.click('#open-tours'); await sleep(300);
  await boss.click('[data-ttab="admin"]'); await sleep(400);
  await shot(boss, 't2-admin-review.png');
  await boss.click('[data-act="review"][data-v="1"]'); await sleep(500);
  ok((await A.textContent('#toasts')).includes('đã được duyệt'), 'A: thông báo CLB được duyệt');
  // B xin vào CLB, A duyệt
  await B.click('#open-clubs'); await sleep(500);
  await B.click('[data-act="club"]'); await sleep(400);
  await B.click('[data-act="clubJoin"]'); await sleep(400);
  await A.click('[data-act="clubReq"][data-v="1"]'); await sleep(400);
  ok((await A.textContent('#tour-body')).includes('bob_en'), 'A: B vào CLB');
  await A.click('#club-manage summary'); await sleep(100);
  await A.fill('#club-edit input[name=announcement]', 'Giải Arena tối thứ 7 lúc 20:00!');
  await A.click('#club-edit button.primary'); await sleep(400);
  await A.click('#club-manage summary'); await sleep(100);
  await shot(A, 't3-club-page-vi.png');
  // A tạo giải Arena của CLB -> gửi duyệt -> boss duyệt
  await A.click('[data-act="tourNewClub"]'); await sleep(400);
  await A.fill('#tf input[name=name]', 'Arena CLB Hà Nội');
  await shot(A, 't4-tour-form.png');
  await A.click('#tf button.primary'); await sleep(500);
  ok((await A.textContent('#tour-body')).includes('chờ quản trị viên duyệt'), 'A: giải chờ duyệt');
  await boss.click('[data-ttab="admin"]'); await sleep(400);
  await boss.click('[data-act="review"][data-kind="tour"][data-v="1"]'); await sleep(500);
  // A + B tham gia, A bắt đầu ngay
  await A.click('[data-act="join"]'); await sleep(300);
  await B.click('#tour-back'); await sleep(200); await B.click('[data-ttab="tours"]'); await sleep(400);
  await B.click('[data-act="tour"]'); await sleep(400);
  await B.click('[data-act="join"]'); await sleep(300);
  await A.click('[data-act="start"]'); await sleep(1200);
  const ra = await A.evaluate(() => window.CaroOnline.state.room);
  ok(ra && ra.tour && ra.players.length === 2, 'Arena: A và B tự vào ván');
  ok(await A.isHidden('#tour-dlg'), 'A: hộp thoại giải tự đóng khi vào ván');
  await shot(A, 't5-arena-game.png');
  // A đầu hàng -> banner có "Xem giải", B mở xem bảng xếp hạng
  await A.click('#btn-resign'); await sleep(700);
  ok(await B.isVisible('#banner-tour') && await B.isHidden('#banner-rematch'), 'B: nút Xem giải, không có tái đấu');
  await B.click('#banner-tour'); await sleep(600);
  ok((await B.textContent('#tour-body')).includes('Standings'), 'B: bảng xếp hạng Arena (English)');
  await shot(B, 't6-arena-standings-en.png');
  // Knockout 4 người do boss tạo (duyệt luôn)
  const C = await user('zh', 'chen_zh'), Dd = await user('ru', 'dima_ru');
  await boss.click('[data-ttab="tours"]'); await sleep(300);
  await boss.click('[data-act="tourNew"]'); await sleep(300);
  await boss.fill('#tf input[name=name]', 'Cúp Mùa Thu');
  await boss.selectOption('#tf select[name=preset]', 'single'); await sleep(100);
  await boss.selectOption('#tf-stages [data-i="0"][data-k="bestOf"]', '1'); await sleep(100);
  await boss.click('#tf button.primary'); await sleep(600);
  for (const p of [A, B, C, Dd]) {
    await p.evaluate(() => { document.getElementById('banner').hidden = true; if (document.getElementById('tour-dlg').open) document.getElementById('tour-dlg').close(); });
    // Rút khỏi Arena (đang chơi giải khác) rồi rời phòng
    await p.evaluate(() => { const r = window.CaroOnline.state.room; if (r && r.tour) window.CaroOnline.send({ t: 'tourLeave', id: r.tour.id }); });
    await sleep(300);
    if (await p.evaluate(() => document.body.classList.contains('online'))) { await p.click('#btn-leave'); await sleep(400); }
    if (!(await p.isVisible('#online'))) { await p.click('#btn-online'); await sleep(300); }
    await p.click('#open-tours');
    await sleep(500);
    await p.locator('[data-act="tour"]', { hasText: 'Cúp Mùa Thu' }).click(); await sleep(400);
    await p.click('[data-act="join"]'); await sleep(300);
  }
  await shot(boss, 't7-knockout-before-vi.png');
  await boss.click('[data-act="start"]'); await sleep(1500);
  const rooms = await Promise.all([A, B, C, Dd].map((p) => p.evaluate(() => window.CaroOnline.state.room && window.CaroOnline.state.room.tour && window.CaroOnline.state.room.tour.name)));
  ok(rooms.every((n) => n === 'Cúp Mùa Thu'), 'Knockout: cả 4 người tự vào bán kết');
  await shot(boss, 't8-bracket-live-vi.png');
  await C.click('#btn-room'); await sleep(300);
  await shot(C, 't9-room-info-zh.png');
  // Đánh hết nhánh đấu: người thắng xếp 5 quân hàng 0 (gửi nước qua CaroOnline như người chơi bấm)
  const opp = async (p) => { const r = await roomOf(p); return r.players.find((x) => x.id !== p.uid).name; };
  // Bán kết: an thắng dima, chen thắng bob
  await play(A, Dd); await play(C, B);
  await sleep(1500);
  ok((await opp(A)) === 'chen_zh' && (await opp(B)) === 'dima_ru', 'Chung kết an–chen và tranh hạng 3 bob–dima tự bắt đầu');
  await play(C, A); await play(B, Dd);
  await sleep(800);
  await shot(boss, 't10-podium-vi.png');
  const champ = await boss.textContent('#tour-body .podium .p1').catch(() => '');
  ok(champ.includes('chen_zh') && await boss.isVisible('#tour-body .podium .p1 svg.ico.m1'), 'Bục trao giải: vô địch chen_zh (huy chương vàng)');
  // Trang CLB trên màn hẹp (đã sửa số thành viên / danh sách)
  await A.evaluate(() => { document.getElementById('banner').hidden = true; });
  await A.click('#btn-leave').catch(() => {}); await sleep(300);
  await A.click('#btn-online'); await sleep(300); await A.click('#open-clubs'); await sleep(500);
  await A.click('[data-act="club"]'); await sleep(500);
  ok(!(await A.textContent('#tour-body')).includes('object'), 'Trang CLB: không còn [object Object]');
  await shot(A, 't11-club-mobile.png');
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
