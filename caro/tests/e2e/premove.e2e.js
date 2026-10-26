/*
 * Kiểm thử trình duyệt: đặt trước nước đi (premove.js) và Cài đặt nhanh trong ván (menu ☰ → bảng nổi).
 *   node caro/tests/e2e/premove.e2e.js
 *  - Chưa tới lượt: bấm chuột vào một ô → ô đặt trước; đối thủ đi xong thì nước đó được đánh ngay, không cần bấm thêm.
 *  - Đối thủ đánh đúng ô đã đặt trước → tự huỷ (không đánh gì). Bấm lại đúng ô → huỷ.
 *  - Tắt trong Cài đặt → bấm lúc chưa tới lượt không đặt trước nữa.
 *  - Menu ☰ → "Cài đặt nhanh": bảng nổi hiện trong ván, đổi bàn cờ được, bấm ra ngoài thì đóng và trả bảng về thanh trên.
 * Hai người chơi ở hai hồ sơ trình duyệt riêng (helpers.user mở context mới cho mỗi người).
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8131;
  const { user, ok, shot, sleep, finish } = await setup(PORT);
  const a = await user('vi', 'pm_a', 1100);
  const b = await user('vi', 'pm_b', 1100);
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);
  const meId = (p) => p.evaluate(() => window.CaroOnline.state.me.id);
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const pm = (p) => p.evaluate(() => window.CaroPremove.cell());
  const has = (r, x, y) => r.moves.some((m) => m[0] === x && m[1] === y); // room.moves: [x, y, …]
  async function click(p, x, y) {
    const [sx, sy] = await p.evaluate(([x, y]) => window.CaroApp.screenOf(x, y), [x, y]);
    await p.mouse.click(sx, sy);
    await sleep(150);
  }
  async function waitMoves(p, n) {
    for (let i = 0; i < 40; i++) { if ((await room(p)).moves.length >= n) return; await sleep(100); }
  }

  await send(a, { t: 'quickMatch', timeLimit: -1 }); await send(b, { t: 'quickMatch', timeLimit: -1 });
  await sleep(1200);
  let r = await room(a);
  ok(r && r.players.length === 2, 'ghép được ván');
  const first = r.actor === await meId(a) ? a : b;
  const second = first === a ? b : a;
  for (const p of [a, b]) await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

  // ---------------------------------------------------------------- Đặt trước rồi tự đánh
  await send(first, { t: 'move', x: 0, y: 0 });
  await waitMoves(second, 1);
  // Bên kia (first) chưa tới lượt: bấm ô (1, 1) = đặt trước
  await click(first, 1, 1);
  ok(JSON.stringify(await pm(first)) === '[1,1]', 'chưa tới lượt: bấm ô là đặt trước (1, 1)');
  await shot(first, 'premove-set.png');
  ok((await room(first)).moves.length === 1, 'đặt trước chưa gửi nước nào');
  await send(second, { t: 'move', x: 7, y: 7 });
  await waitMoves(first, 3);
  r = await room(first);
  ok(r.moves.length === 3 && has(r, 1, 1), 'đối thủ đi xong: nước đặt trước được đánh ngay – ' + JSON.stringify(r.moves));
  ok((await pm(first)) === null, 'đánh xong thì hết ô đặt trước');

  // ---------------------------------------------------------------- Bấm lại đúng ô = huỷ
  await click(first, 2, 2);
  await click(first, 2, 2);
  ok((await pm(first)) === null, 'bấm lại đúng ô: huỷ đặt trước');

  // ---------------------------------------------------------------- Đối thủ chiếm đúng ô đã đặt trước → tự huỷ
  await click(first, 3, 3);
  ok(JSON.stringify(await pm(first)) === '[3,3]', 'đặt trước ô (3, 3)');
  await send(second, { t: 'move', x: 3, y: 3 });
  await waitMoves(first, 4);
  await sleep(400);
  r = await room(first);
  ok(r.moves.length === 4 && (await pm(first)) === null, 'đối thủ đánh đúng ô đó: đặt trước tự huỷ, không đánh thêm');

  // ---------------------------------------------------------------- Tắt trong Cài đặt
  await send(first, { t: 'move', x: 4, y: 0 });
  await waitMoves(second, 5);
  await first.evaluate(() => window.CaroApp.setSetting('premove', false));
  await click(first, 5, 5);
  ok((await pm(first)) === null && !(await first.evaluate(() => window.CaroPremove.enabled)), 'tắt trong Cài đặt: bấm lúc chưa tới lượt không đặt trước');
  await first.evaluate(() => window.CaroApp.setSetting('premove', true));

  // ---------------------------------------------------------------- Menu ☰: công tắc + Quay bàn cờ
  await first.evaluate(() => [...document.querySelectorAll('.bar-menu-btn')].find((x) => x.offsetParent).click());
  await sleep(200);
  const rows = await first.$$eval('#bar-menu [data-act]', (bs) => bs.map((b) => ({ a: b.dataset.act, sw: !!b.querySelector('.qs-sw'), t: b.textContent.trim() })));
  ok(rows.map((r) => r.a).join() === 'rotate,focus,draftX,draftO,clearDrafts,quickset'
    && rows.filter((r) => r.sw).map((r) => r.a).join() === 'rotate,focus,draftX,draftO'
    && rows[0].t === 'Quay bàn cờ' && !!(await first.$('#bar-menu [data-act="rotate"] use[href="#i-rotate"]')),
    'menu ☰: Quay bàn cờ (icon hình vuông) thay 2 mục lật; các mục bật tắt có công tắc – ' + JSON.stringify(rows));
  const [cx, cy] = await first.evaluate(() => window.CaroApp.screenOf(0, 0));
  await first.click('#bar-menu [data-act="rotate"]');
  await sleep(200);
  const rot = await first.evaluate(() => ({ f: window.CaroApp.getFlip(), aria: document.querySelector('#bar-menu [data-act="rotate"]').getAttribute('aria-checked'), sw: document.querySelector('#bar-menu [data-act="rotate"] .qs-sw').classList.contains('on'), open: !document.getElementById('bar-menu').hidden }));
  const [rx, ry] = await first.evaluate(() => window.CaroApp.screenOf(0, 0));
  ok(rot.f.h && rot.f.v && rot.aria === 'true' && rot.sw && rot.open && (Math.abs(rx - cx) > 1 || Math.abs(ry - cy) > 1),
    'Quay bàn cờ: quay 180°, công tắc bật, menu vẫn mở – ' + JSON.stringify({ rot, before: [cx, cy], after: [rx, ry] }));
  await shot(first, 'bar-menu-rotate.png');
  await first.click('#bar-menu [data-act="rotate"]');
  await sleep(150);
  ok(await first.evaluate(() => { const f = window.CaroApp.getFlip(); return !f.h && !f.v && document.querySelector('#bar-menu [data-act="rotate"]').getAttribute('aria-checked') === 'false'; }), 'bấm lần nữa: quay về như cũ, công tắc tắt');
  await first.click('#bar-menu [data-act="draftX"]');
  await sleep(150);
  ok(await first.evaluate(() => window.CaroDraft.current() === 'X' && document.querySelector('#bar-menu [data-act="draftX"] .qs-sw.on') && !document.querySelector('#bar-menu [data-act="draftO"] .qs-sw.on')), 'Quân nháp X: công tắc bật (O tắt)');
  await first.click('#bar-menu [data-act="draftX"]');
  await sleep(150);
  await first.keyboard.press('Escape');
  await sleep(150);

  // ---------------------------------------------------------------- Cài đặt nhanh trong ván
  await first.evaluate(() => [...document.querySelectorAll('.bar-menu-btn')].find((x) => x.offsetParent).click()); // nút ☰ của thanh đang hiện
  await sleep(200);
  await first.click('#bar-menu [data-act="quickset"]');
  await sleep(300);
  const fl = await first.evaluate(() => { const q = document.getElementById('qs'); const rc = q.getBoundingClientRect(); return { open: !q.hidden, float: q.classList.contains('qs-float'), inBody: q.parentElement === document.body, w: rc.width, x: rc.x, right: rc.right, vw: innerWidth }; });
  ok(fl.open && fl.float && fl.inBody && fl.x >= 0 && fl.right <= fl.vw, 'menu ☰ → Cài đặt nhanh: bảng nổi hiện trong ván, nằm gọn màn hình – ' + JSON.stringify(fl));
  await shot(first, 'premove-quickset.png');
  ok(!(await first.$('#qs [data-all]')), 'bảng nổi trong ván: không có "Tất cả cài đặt" (bấm là rời bàn cờ)');
  await first.click('#qs [data-sub="board"]');
  await sleep(150);
  await first.click('#qs [data-v="wood"]');
  await sleep(150);
  ok(await first.evaluate(() => window.CaroStyle.board === 'wood'), 'đổi bàn cờ ngay trong ván');
  await first.mouse.click(5, 300);
  await sleep(200);
  const back = await first.evaluate(() => { const q = document.getElementById('qs'); return { hidden: q.hidden, float: q.classList.contains('qs-float'), home: q.parentElement.classList.contains('tb-tools') }; });
  ok(back.hidden && !back.float && back.home, 'bấm ra ngoài: đóng bảng và trả về thanh trên – ' + JSON.stringify(back));
  await finish();
})();
