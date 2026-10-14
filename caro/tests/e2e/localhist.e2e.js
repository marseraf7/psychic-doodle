/*
 * Kiểm thử trình duyệt: Lịch sử đấu trên máy này (local-games.js, local-history.js, local-save.js) và mục Thiết bị (devices.js).
 *   - Khách chơi xong một ván rồi thoát → hỏi "Bạn đang chơi bằng tài khoản khách… lưu lịch sử đấu trên máy này?";
 *     Không lưu / Lưu / "Luôn lưu, không hỏi lại" (sau đó tự lưu); offline thì câu hỏi ghi "Bạn đang offline".
 *   - Thẻ "Trên máy này": nơi lưu + dung lượng, phân tích ván (lưu kèm kết quả), chọn nhiều ván để xoá (xoá hẳn khỏi bộ nhớ).
 *   - Cài đặt → Lịch sử đấu trên máy này: tắt lưu, xoá toàn bộ.
 *   - Ván online của khách được lưu trên máy; Thiết bị: xem nơi đăng nhập, đăng xuất thiết bị khác từ xa.
 *   node caro/tests/e2e/localhist.e2e.js
 */
'use strict';
const { setup, play, roomOf } = require('./helpers');

const PORT = 8106;
// X xếp 4 quân hàng 0, O đánh hàng 5; nước cuối (3, 0) của X thắng (luật Việt Nam: 4 quân hai đầu trống – bị chặn thì thêm)
const GAME = [[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [5, 5]];
const WIN = [3, 0];

(async () => {
  const { browser, user, ok, shot, sleep, finish } = await setup(PORT);
  const errors = [];

  // E2E_MOBILE=1: giả lập điện thoại cảm ứng (isMobile, hasTouch, UA Android) – bấm vẫn qua mouse.click / tap của Playwright
  const MOBILE = process.env.E2E_MOBILE ? {
    isMobile: process.env.E2E_BROWSER !== 'firefox', hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  } : {};
  async function page(init, width = 430) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, ...MOBILE });
    // Xoá dữ liệu một lần cho mỗi hồ sơ trình duyệt (mở trang mới trong cùng hồ sơ thì giữ – như mở lại app)
    await ctx.addInitScript(() => { if (!localStorage.getItem('e2e.init')) { localStorage.clear(); localStorage.setItem('e2e.init', '1'); localStorage.setItem('caro.lang', 'vi'); } });
    if (init) await ctx.addInitScript(init);
    return open(ctx);
  }
  async function open(ctx) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION/.test(m.text())) errors.push('console: ' + m.text()); });
    p.on('dialog', (d) => d.accept());
    await p.goto(`http://localhost:${PORT}/`);
    await sleep(600);
    return p;
  }
  /**
   * Đóng app rồi mở lại: trang mới trong cùng hồ sơ trình duyệt (localStorage giữ nguyên). Không dùng reload: Firefox
   * (Playwright) có khi không bao giờ xong điều hướng khi trang cũ còn Worker (phân tích ngầm) – như boat-rapfi.e2e.js.
   */
  async function reopen(old) {
    const p = await open(old.context());
    await old.close();
    await sleep(1500);
    return p;
  }
  // Treo (page.evaluate không có giới hạn thời gian): báo lỗi thay vì chạy tới khi CI tự huỷ – bước cuối là dòng OK cuối
  setTimeout(() => { console.log('FAIL kịch bản treo quá 20 phút'); process.exit(1); }, 20 * 60 * 1000).unref();
  const click = async (p, x, y) => {
    const [sx, sy] = await p.evaluate(([x, y]) => window.CaroApp.screenOf(x, y), [x, y]);
    await p.mouse.click(sx, sy);
    await sleep(120);
    await p.mouse.click(sx, sy);
    await sleep(200);
  };
  /** Ván 2 người trên máy: bày sẵn rồi bấm nước thắng trên bàn cờ thật. */
  async function winLocal(p) {
    await p.evaluate((g) => window.CaroApp.startPreset({ mode: 'pvp', human: 1, moves: g }), GAME);
    await sleep(200);
    await click(p, ...WIN);
    await sleep(300);
  }
  const count = (p) => p.evaluate(() => window.CaroLocalHist.store.count());
  const askOpen = (p) => p.evaluate(() => document.getElementById('lh-ask').open);
  const lgKeys = (p) => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('caro.lg.g.')).length);
  async function waitFor(p, fn, arg, ms = 8000) {
    for (let t = 0; t < ms; t += 200) { if (await p.evaluate(fn, arg)) return true; await sleep(200); }
    return false;
  }

  // ---------------------------------------------------------------- Khách: hỏi lưu khi thoát ván
  let p = await page();
  ok(await waitFor(p, () => window.CaroOnline.connected), 'khách đã kết nối máy chủ');
  await winLocal(p);
  ok(await p.evaluate(() => window.CaroApp.local.winner === 1), 'X thắng ván 2 người trên máy');
  ok(await p.evaluate(() => !!window.CaroLocalSave.pending) && await count(p) === 0, 'hết ván: giữ làm ván chờ, chưa lưu');
  ok(!(await askOpen(p)), 'chưa thoát ván: chưa hỏi');
  await p.click('#btn-home'); // về trang = thoát ván
  await sleep(700);
  ok(await askOpen(p), 'thoát ván: hỏi có lưu không');
  ok(/tài khoản khách/.test(await p.textContent('#lh-ask-why')), 'khách: "Bạn đang chơi bằng tài khoản khách"');
  ok(/X thắng/.test(await p.textContent('#lh-ask-list')), 'tóm tắt ván: ' + (await p.textContent('#lh-ask-list')).replace(/\s+/g, ' ').trim());
  ok(await p.locator('#lh-ask-list .lh-pick').count() === 0, '1 ván: không cần ô chọn');
  await shot(p, 'lh-ask.png');
  await p.click('#lh-ask button[value=yes]');
  await sleep(300);
  ok(await count(p) === 1 && !(await askOpen(p)), 'Lưu: có 1 ván trên máy');

  // Esc / chạm ra ngoài: giữ ván chờ, hỏi lại lần thoát sau
  await winLocal(p);
  await p.click('#btn-home');
  await sleep(700);
  ok(await askOpen(p), 'ván thứ hai: hỏi');
  await p.keyboard.press('Escape');
  await sleep(300);
  ok(!(await askOpen(p)) && await p.evaluate(() => window.CaroLocalSave.pending.length === 1) && await count(p) === 1, 'Esc: chưa lưu nhưng vẫn giữ ván chờ');
  await p.evaluate(() => window.CaroShell.open('more'));
  await sleep(700);
  ok(await askOpen(p), 'lần thoát sau: hỏi lại');
  await p.click('#lh-ask button[value=no]');
  await sleep(300);
  // Đi lại sau khi thắng: kết quả bị huỷ – bỏ ván chờ
  await winLocal(p);
  ok(await p.evaluate(() => window.CaroLocalSave.pending.length === 1), 'thắng: có ván chờ');
  await p.evaluate(() => document.getElementById('btn-undo').click());
  await sleep(300);
  ok(await p.evaluate(() => window.CaroLocalSave.pending.length === 0 && !window.CaroApp.local.winner), 'Đi lại sau khi thắng: bỏ ván chờ (kết quả đã huỷ)');

  // Không lưu
  await winLocal(p);
  await p.evaluate(() => window.CaroApp.startPreset({ mode: 'pvp', moves: [] })); // ván mới = thoát ván
  await sleep(400);
  ok(await askOpen(p), 'ván mới: hỏi lưu ván vừa xong');
  await p.click('#lh-ask button[value=no]');
  await sleep(300);
  ok(await count(p) === 1, 'Không lưu: vẫn 1 ván');

  // Luôn lưu, không hỏi lại
  await winLocal(p);
  await p.click('#btn-home');
  await sleep(700);
  await p.check('#lh-ask-form input[name=always]');
  await p.click('#lh-ask button[value=yes]');
  await sleep(300);
  ok(await count(p) === 2 && await p.evaluate(() => window.CaroLocalHist.store.settings().ask === false), '"Luôn lưu": lưu + tắt hỏi');
  await winLocal(p);
  ok(await count(p) === 3 && !(await askOpen(p)), 'đã tắt hỏi: hết ván là tự lưu, không hỏi');
  // Đi lại sau khi đã tự lưu: xoá ván vừa lưu; thắng lại thì lưu lại – không trùng
  await p.evaluate(() => document.getElementById('btn-undo').click());
  await sleep(300);
  ok(await count(p) === 2, 'đã tự lưu rồi Đi lại: xoá ván vừa lưu');
  await click(p, ...WIN);
  await sleep(400);
  ok(await count(p) === 3, 'thắng lại: lưu 1 ván, không trùng');
  // Tải lại trang rồi mới Đi lại: vẫn tìm đúng ván đã lưu để xoá
  p = await reopen(p);
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await p.evaluate(() => window.dispatchEvent(new Event('caro:board')));
  await sleep(200);
  ok(await p.evaluate(() => window.CaroApp.local.winner === 1), 'tải lại trang: ván đã thắng vẫn trên bàn');
  await p.evaluate(() => document.getElementById('btn-undo').click());
  await sleep(300);
  ok(await count(p) === 2, 'tải lại trang rồi Đi lại: xoá ván đã tự lưu');
  await click(p, ...WIN);
  await sleep(400);
  ok(await count(p) === 3, 'thắng lại: lưu lại 1 ván');

  // ---------------------------------------------------------------- Thẻ "Trên máy này"
  await p.evaluate(() => window.CaroShell.open('more'));
  await sleep(300);
  await p.click('#page-more [data-social="history"]');
  await sleep(400);
  ok(await p.isVisible('#history-tabs') && await p.isChecked('input[name=hist-tab][value=local]'), 'khách: mở Lịch sử đấu ở thẻ "Trên máy này"');
  ok(await p.locator('#history-local .lh-list li').count() === 3, 'danh sách có 3 ván');
  const head = await p.textContent('#history-local .lh-head');
  ok(/trình duyệt/.test(head) && /localhost/.test(head) && /3 ván/.test(head) && /(B|KB)/.test(head), 'hiện nơi lưu + dung lượng: ' + head.replace(/\s+/g, ' ').trim());
  await shot(p, 'lh-list.png');
  // Thẻ Online khi là khách: giải thích cần đăng nhập
  await p.click('#history-tabs label:has(input[value=online])');
  await sleep(300);
  ok(/Đăng nhập/.test(await p.textContent('#history-note')), 'thẻ Online (khách): cần đăng nhập');
  await p.click('#history-tabs label:has(input[value=local])');
  await sleep(300);

  // Phân tích ván đã lưu: lưu kèm kết quả
  await p.click('#history-local [data-analyze]');
  await sleep(300);
  ok(await p.evaluate(() => !!window.CaroApp.replay && !!window.CaroApp.replay.data.lg), 'mở ván đã lưu để phân tích');
  ok(await waitFor(p, () => window.CaroLocalHist.store.list()[0].an, null, 60000), 'phân tích xong: kết quả lưu kèm ván');
  await p.click('#btn-home');
  await sleep(400);
  await p.click('#page-more [data-social="history"]');
  await sleep(400);
  ok(/Đã phân tích/.test(await p.textContent('#history-local .lh-list li:first-child')), 'ván có nhãn "Đã phân tích"');
  ok(/có phân tích/.test(await p.textContent('#history-local .lh-head')), 'dung lượng ghi số ván có phân tích');
  // Mở lại: phân tích hiện ngay (không chạy lại)
  await p.click('#history-local [data-analyze]');
  await sleep(500);
  ok(await p.evaluate(() => !document.querySelector('#an-body .an-prog')), 'mở lại ván đã phân tích: hiện kết quả ngay');
  await p.click('#btn-home');
  await sleep(300);

  // Chọn nhiều ván để xoá
  await p.click('#page-more [data-social="history"]');
  await sleep(300);
  await p.click('#history-local [data-lh="select"]');
  await sleep(200);
  ok(await p.locator('#history-local .lh-pick').count() === 3, 'chế độ chọn: mỗi ván một ô chọn');
  ok(await p.isDisabled('#history-local [data-lh="del"]'), 'chưa chọn ván nào: nút Xoá tắt');
  await p.locator('#history-local .lh-pick').nth(0).check();
  await sleep(150);
  await p.locator('#history-local .lh-pick').nth(1).check();
  await sleep(150);
  ok(/Xoá \(2\)/.test(await p.textContent('#history-local [data-lh="del"]')), 'nút Xoá (2)');
  await shot(p, 'lh-select.png');
  await p.click('#history-local [data-lh="del"]');
  await sleep(300);
  ok(await count(p) === 1 && await lgKeys(p) === 1, 'xoá 2 ván: xoá hẳn khỏi bộ nhớ máy (còn đúng 1 khoá ván)');
  await p.click('#history-local [data-lh="select"]');
  await p.click('#history-local [data-lh="all"]');
  await sleep(150);
  ok(await p.locator('#history-local .lh-pick:checked').count() === 1, 'Chọn tất cả');
  await p.keyboard.press('Escape');

  // ---------------------------------------------------------------- Cài đặt
  await p.evaluate(() => window.CaroShell.open('more'));
  await sleep(300);
  await p.click('#more-settings');
  await sleep(300);
  await p.click('#settings-form [data-go="localhist"]');
  await sleep(300);
  ok(/1 ván/.test(await p.textContent('#lh-set-usage')) && /trình duyệt/.test(await p.textContent('#lh-set-where')), 'Cài đặt: nơi lưu + dung lượng');
  ok(!(await p.isChecked('#settings-form input[name=lhAsk]')) && await p.isChecked('#settings-form input[name=lhOn]'), 'Cài đặt khớp: đang lưu, không hỏi');
  await shot(p, 'lh-settings.png');
  await p.click('#lh-set-clear');
  await sleep(300);
  ok(await count(p) === 0 && await lgKeys(p) === 0, 'Xoá toàn bộ: không còn dữ liệu ván trong máy');
  await p.click('#settings-form label:has(input[name=lhAsk])');
  await p.click('#settings-form label:has(input[name=lhOn])');
  await sleep(200);
  ok(await p.evaluate(() => { const s = window.CaroLocalHist.store.settings(); return !s.on && s.ask; }), 'tắt lưu lịch sử trên máy');
  await winLocal(p);
  await p.click('#btn-home');
  await sleep(700);
  ok(await count(p) === 0 && !(await askOpen(p)), 'đã tắt: không lưu, không hỏi');
  await p.context().close();

  // ---------------------------------------------------------------- Offline
  {
    // Không kết nối được máy chủ (mất mạng)
    let q = await page(() => {
      window.WebSocket = function () { const o = { readyState: 3, send() {}, close() {} }; setTimeout(() => o.onclose && o.onclose(), 20); return o; };
    });
    await winLocal(q);
    await q.click('#btn-home');
    await sleep(700);
    ok(await askOpen(q) && /offline/.test(await q.textContent('#lh-ask-why')), 'offline: "Bạn đang offline"');
    await q.click('#lh-ask button[value=yes]');
    await sleep(300);
    await q.evaluate(() => window.CaroHistory.open());
    await sleep(300);
    ok(await q.locator('#history-local .lh-list li').count() === 1, 'offline: Lịch sử đấu mở được, có ván vừa lưu');
    await q.click('#history-tabs label:has(input[value=online])');
    await sleep(200);
    ok(/Không có mạng/.test(await q.textContent('#history-note')), 'thẻ Online khi offline: báo cần kết nối');
    // Mở lại app khi còn ván chờ: hỏi tiếp
    await q.keyboard.press('Escape');
    await winLocal(q);
    q = await reopen(q);
    await sleep(1500);
    ok(await askOpen(q), 'đóng app khi chưa trả lời: mở lại thì hỏi tiếp');
    await q.context().close();
  }

  // ---------------------------------------------------------------- Ván online của khách
  {
    const a = await page();
    const b = await page();
    for (const x of [a, b]) await waitFor(x, () => window.CaroOnline.connected);
    a.uid = await a.evaluate(() => window.CaroOnline.state.me.id);
    b.uid = await b.evaluate(() => window.CaroOnline.state.me.id);
    await a.evaluate(() => window.CaroOnline.send({ t: 'createRoom', timeLimit: 0, public: true }));
    await sleep(500);
    const r0 = await roomOf(a);
    await a.keyboard.press('Escape');
    await b.evaluate((code) => window.CaroOnline.send({ t: 'joinRoom', code }), r0.code);
    await sleep(600);
    const r = await roomOf(a);
    const [w, l] = r.seats.x === a.uid ? [a, b] : [b, a];
    await play(w, l);
    await sleep(500);
    ok(await a.evaluate(() => window.CaroLocalSave.pending.length === 1 && window.CaroLocalSave.pending[0].kind === 'online'), 'khách hết ván online: giữ làm ván chờ');
    // Tái đấu: ván sau bắt đầu – không hỏi giữa ván
    await a.evaluate(() => window.CaroOnline.send({ t: 'rematch' }));
    await b.evaluate(() => window.CaroOnline.send({ t: 'rematch' }));
    ok(await waitFor(a, (n) => { const r = window.CaroOnline.state.room; return r && r.gameNo > n && !r.winner; }, r.gameNo), 'tái đấu: ván sau bắt đầu');
    await sleep(500);
    ok(!(await askOpen(a)) && !(await askOpen(b)), 'đang có ván online: không hỏi lưu');
    await a.evaluate(() => window.CaroShell.open('more')); // về trang giữa ván: vẫn chưa hỏi
    await sleep(700);
    ok(!(await askOpen(a)), 'về trang khi ván online đang diễn ra: chưa hỏi');
    await a.evaluate(() => window.dispatchEvent(new Event('caro:board')));
    const r2 = await roomOf(a);
    const [w2, l2] = r2.seats.x === a.uid ? [a, b] : [b, a];
    await play(w2, l2);
    await sleep(500);
    ok(await a.evaluate(() => window.CaroLocalSave.pending.length === 2), '2 ván chờ (không ghi đè nhau)');
    // Đang trong phòng: mở ván đã lưu trên máy thì báo rời phòng trước
    await a.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
    await sleep(900);
    ok(await askOpen(a), 'rời phòng: hỏi lưu một lần cho cả 2 ván');
    ok(await a.locator('#lh-ask-list .lh-pick').count() === 2 && await a.isVisible('#lh-ask-pick'), 'nhiều ván: mỗi ván một ô chọn (tuỳ ván)');
    await a.locator('#lh-ask-list .lh-pick').nth(0).uncheck();
    await shot(a, 'lh-ask-many.png');
    await a.click('#lh-ask button[value=yes]');
    await sleep(300);
    const g = await a.evaluate(() => window.CaroLocalHist.store.list());
    ok(g.length === 1 && g[0].kind === 'online' && g[0].x && g[0].o && g[0].n >= 7, 'chỉ lưu ván được chọn (tên 2 bên, nước đi): ' + JSON.stringify(g[0]));
    ok(await a.evaluate(() => window.CaroLocalSave.pending.length === 0), 'đã trả lời: hết ván chờ');
    await a.context().close();
    await b.context().close();
  }

  // ---------------------------------------------------------------- Ván online của tài khoản
  {
    const a = await user('vi', 'lh_acc_a');
    const b = await user('vi', 'lh_acc_b');
    await a.evaluate(() => window.CaroLocalHist.store.setSettings({ online: 'off' }));
    async function onlineGame() {
      await a.evaluate(() => window.CaroOnline.send({ t: 'createRoom', timeLimit: 0, public: true }));
      await sleep(500);
      const r0 = await roomOf(a);
      await a.keyboard.press('Escape');
      await b.evaluate((code) => window.CaroOnline.send({ t: 'joinRoom', code }), r0.code);
      await sleep(600);
      const r = await roomOf(a);
      const [w, l] = r.seats.x === a.uid ? [a, b] : [b, a];
      await play(w, l);
      await sleep(500);
      await a.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
      await b.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
      await sleep(900);
    }
    await onlineGame();
    ok(await count(a) === 0 && !(await askOpen(a)), 'tài khoản, mặc định "Không lưu trên máy": không lưu, không hỏi');
    // Cài đặt: Hỏi từng ván
    await a.evaluate(() => window.CaroShell.open('more'));
    await sleep(300);
    await a.click('#more-settings');
    await sleep(300);
    await a.click('#settings-form [data-go="localhist"]');
    await sleep(200);
    ok(await a.isChecked('#settings-form input[name=lhOnline][value=off]'), 'Cài đặt: ván online của tài khoản – Không lưu trên máy');
    await a.click('#settings-form label:has(input[name=lhOnline][value=ask])');
    await sleep(200);
    ok(await a.evaluate(() => window.CaroLocalHist.store.settings().online === 'ask'), 'chọn "Hỏi từng ván"');
    await shot(a, 'lh-settings-online.png');
    await a.evaluate(() => window.dispatchEvent(new Event('caro:board')));
    await onlineGame();
    ok(await askOpen(a) && /tài khoản/.test(await a.textContent('#lh-ask-why')), 'Hỏi từng ván: rời phòng thì hỏi ("đã có trong lịch sử tài khoản")');
    await a.click('#lh-ask button[value=yes]');
    await sleep(300);
    ok(await count(a) === 1 && await a.evaluate(() => !!window.CaroLocalHist.store.list()[0].share), 'lưu ván online của tài khoản (kèm mã ván trên máy chủ)');
    // Lưu tất cả
    await a.evaluate(() => window.CaroLocalHist.store.setSettings({ online: 'all' }));
    await onlineGame();
    ok(await count(a) === 2 && !(await askOpen(a)), '"Lưu tất cả": tự lưu, không hỏi');
    // Thẻ Online: lưu từng ván / tất cả về máy – ván đã lưu có dấu ✓, không lưu trùng
    await a.evaluate(() => window.CaroLocalHist.store.clear());
    await a.evaluate(() => window.CaroHistory.open());
    await sleep(700);
    ok(await a.isChecked('input[name=hist-tab][value=online]'), 'tài khoản: mở thẻ Online');
    ok(await a.locator('#history-list [data-save]').count() === 3 && await a.isVisible('#history-save-all'), 'mỗi ván online có nút "Lưu về máy" + nút lưu tất cả');
    await a.click('#history-list [data-save="0"]');
    ok(await waitFor(a, () => window.CaroLocalHist.store.count() === 1), 'Lưu về máy: 1 ván');
    await sleep(300);
    ok(await a.locator('#history-list .lh-saved').count() === 1, 'ván đã lưu có dấu ✓');
    await a.click('#history-save-all button');
    ok(await waitFor(a, () => window.CaroLocalHist.store.count() === 3), 'Lưu tất cả: đủ 3 ván, không trùng');
    await sleep(300);
    ok(!(await a.isVisible('#history-save-all')), 'đã lưu hết: ẩn nút lưu tất cả');
    await a.context().close();
    await b.context().close();
  }

  // ---------------------------------------------------------------- Quét 4 ngôn ngữ × 2 cỡ (có dữ liệu thật)
  /** Khoá i18n lọt ra màn hình, phần tử tràn ngang, chữ tràn khỏi nút / nhãn (như journey.e2e.js). */
  const audit = (pg) => pg.evaluate(() => {
    const keyRe = /^[a-z][a-z0-9]*(_[a-z0-9-]+)+$/;
    const raw = [], wide = [], clip = [];
    const vis = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) {
      const t = n.textContent.trim();
      if (t && keyRe.test(t) && n.parentElement && vis(n.parentElement) && !n.parentElement.closest('script,style')) raw.push(t);
    }
    document.querySelectorAll('[aria-label],[title]').forEach((el) => {
      for (const a of ['aria-label', 'title']) { const v = el.getAttribute(a); if (v && keyRe.test(v)) raw.push(a + ':' + v); }
    });
    const vw = document.documentElement.clientWidth;
    document.querySelectorAll('dialog[open] *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !vis(el) || r.right <= vw + 1) return;
      for (let q = el.parentElement; q; q = q.parentElement) if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(q).overflowX)) return;
      wide.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + el.className) + ' ' + Math.round(r.right) + '>' + vw);
    });
    document.querySelectorAll('dialog[open] button, dialog[open] label, .page:not([hidden]) button, .page:not([hidden]) label').forEach((el) => {
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      for (const c of el.querySelectorAll('*')) {
        const q = c.getBoundingClientRect();
        if (vis(c) && q.width && (q.right > r.right + 1 || q.left < r.left - 1)) { clip.push('tràn "' + el.textContent.trim().slice(0, 30) + '"'); break; }
      }
    });
    return [...new Set(raw)].concat([...new Set(wide)].slice(0, 4), [...new Set(clip)]);
  });
  for (const lang of ['vi', 'en', 'ru', 'zh']) {
    for (const width of [360, 1280]) {
      let q = await page(null, width);
      await q.evaluate((l) => window.I18N.setLang(l), lang);
      await q.evaluate(() => {
        const s = window.CaroLocalHist.store;
        const mv = (n) => Array.from({ length: n }, (_, i) => [i, i % 2]);
        const id = s.add({ at: 1, kind: 'bot', bot: 'boat', me: 2, winner: 1, reason: 'timeout', rule: 'renju', timeLimit: 30, moves: mv(41) });
        s.setAnalysis(id, { moves: [], evals: [] });
        s.add({ at: 2, kind: 'pvp', me: 0, winner: 2, reason: 'win', rule: 'free', clock: '5+3', moves: mv(23) });
        s.add({ at: 3, kind: 'online', account: true, me: 1, x: 'Người chơi có tên rất rất dài', o: 'Đối thủ cũng dài không kém', winner: 3, reason: 'draw', rule: 'vn', moves: mv(120), share: 'abc' });
      });
      const bad = [];
      const check = async (where) => { const a = await audit(q); if (a.length) bad.push(where + ': ' + a.join(', ')); };
      await q.evaluate(() => window.CaroHistory.openTab('local'));
      await sleep(250);
      await check('thẻ Trên máy này');
      await q.click('#history-local [data-lh="select"]');
      await q.click('#history-local [data-lh="all"]');
      await sleep(150);
      await check('chọn để xoá');
      if (width === 360) await shot(q, `lh-${lang}-select-360.png`);
      await q.evaluate(() => window.CaroHistory.openTab('online'));
      await sleep(200);
      await check('thẻ Online (khách)');
      await q.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
      // Hỏi lưu nhiều ván
      await q.evaluate(() => {
        const mv = (n) => Array.from({ length: n }, (_, i) => [i, i % 2]);
        window.CaroLocalHist.store.setPending([
          { at: 10, kind: 'bot', bot: 'ti', me: 1, winner: 1, reason: 'win', rule: 'vn', moves: mv(9) },
          { at: 11, kind: 'online', me: 2, x: 'Khách-AB12', o: 'Khách-CD34', winner: 1, reason: 'resign', rule: 'std', moves: mv(30) },
        ]);
      });
      q = await reopen(q);
      await sleep(1000);
      await q.evaluate((l) => window.I18N.setLang(l), lang);
      await q.evaluate(() => window.CaroShell.open('more'));
      await sleep(700);
      ok(await askOpen(q), `${lang} ${width}px: hỏi lưu 2 ván chờ`);
      await check('hỏi lưu 2 ván');
      if (width === 360) await shot(q, `lh-${lang}-ask-360.png`);
      await q.click('#lh-ask button[value=no]');
      await q.click('#more-settings');
      await sleep(200);
      await q.click('#settings-form [data-go="localhist"]');
      await sleep(200);
      await check('Cài đặt → Lịch sử đấu trên máy này');
      if (width === 360) await shot(q, `lh-${lang}-settings-360.png`);
      ok(!bad.length, `${lang} ${width}px: lịch sử trên máy sạch (khoá dịch, tràn)` + (bad.length ? '\n    ' + bad.join('\n    ') : ''));
      await q.context().close();
    }
  }

  // ---------------------------------------------------------------- Thiết bị
  {
    const pc = await user('vi', 'maythu2');
    // Đăng nhập cùng tài khoản trên "điện thoại" khác
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36' });
    const phone = await phoneCtx.newPage();
    phone.on('pageerror', (e) => errors.push('phone: ' + e.message));
    await phone.goto(`http://localhost:${PORT}/`);
    await sleep(500);
    await waitFor(phone, () => window.CaroOnline.connected);
    await phone.evaluate(() => window.CaroOnline.send({ t: 'login', username: 'maythu2', password: 'caro-pass1' }));
    await sleep(800);
    ok(await phone.evaluate(() => !window.CaroOnline.state.me.guest), 'điện thoại đã đăng nhập');
    await pc.click('#tabbar [data-tab="more"]');
    await sleep(300);
    await pc.click('#page-more [data-social="devices"]');
    await sleep(800);
    ok(await pc.locator('#devices-list li.dev').count() === 2, 'mục Thiết bị: 2 nơi đăng nhập');
    const txt = (await pc.textContent('#devices-list')).replace(/\s+/g, ' ');
    ok(/Thiết bị này/.test(txt) && /Samsung Internet trên Android 14/.test(txt) && /SM-S918B/.test(txt) && /Đang trực tuyến/.test(txt) && /IP /.test(txt), 'tên thiết bị, trạng thái, IP: ' + txt.slice(0, 200));
    await shot(pc, 'devices.png');
    // Mục Thiết bị ở 4 ngôn ngữ: không lọt khoá dịch, không tràn
    for (const lang of ['en', 'ru', 'zh', 'vi']) {
      await pc.evaluate((l) => window.I18N.setLang(l), lang);
      await sleep(200);
      const a = await audit(pc);
      ok(!a.length && !/dev_|lh_/.test(await pc.textContent('#devices-card')), `Thiết bị (${lang}): sạch` + (a.length ? ' – ' + a.join(', ') : ''));
    }
    await pc.click('#devices-list [data-drop]');
    await sleep(800);
    ok(await pc.locator('#devices-list li.dev').count() === 1, 'đăng xuất điện thoại: còn 1 thiết bị');
    ok(await waitFor(phone, () => window.CaroOnline.state.me && window.CaroOnline.state.me.guest), 'điện thoại về làm khách ngay');
    ok(await phone.evaluate(() => !localStorage.getItem('caro.token')), 'điện thoại đã xoá token');
    await phoneCtx.close();
  }

  ok(!errors.length, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await finish();
})();
