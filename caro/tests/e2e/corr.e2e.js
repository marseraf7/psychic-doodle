/*
 * Kiểm thử trình duyệt: Chơi theo lượt (C1 – corr.js).
 *   node caro/tests/e2e/corr.e2e.js
 *  - A: Xem thêm › Chơi theo lượt → thách B (3 ngày, cầm X). B: thẻ "Ván đang chờ bạn" ở Trang chủ → Nhận lời.
 *  - A mở ván từ thẻ Trang chủ, bấm bàn cờ đánh; B nhận thông báo "Đến lượt bạn" ở chuông → bấm là mở đúng ván, đánh.
 *  - A xin hoà, B thấy lời xin + nút "Đồng ý hoà" → ván kết thúc "Hoà"; khách không mở được.
 *  - Soát giao diện 390 px: hộp Chơi theo lượt, thẻ Trang chủ, thanh dưới của ván.
 */
'use strict';
const { setup } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8135;
  const { user, ok, sleep, shot, finish } = await setup(PORT);
  const a = await user('vi', 'corr_a', 390);
  const b = await user('vi', 'corr_b', 390);
  const games = (p) => p.evaluate(() => window.CaroCorr.games);
  async function waitFor(p, fn, what, arg) {
    for (let i = 0; i < 60; i++) { if (await p.evaluate(fn, arg)) return true; await sleep(150); }
    ok(false, 'quá hạn chờ: ' + what);
    return false;
  }
  const home = (p) => p.evaluate(() => window.CaroShell.open('home'));
  // Giữ lại tin "corrGame" máy chủ gửi về A (mạng / máy chậm như trên CI): dòng lượt phải đổi ngay khi đánh, không chờ
  // bản của máy chủ. holdA: null = chuyển tiếp ngay; mảng = các tin corrGame đang giữ (releaseA() gửi tiếp theo đúng thứ tự)
  let holdA = null, releaseA = () => {};
  await a.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => { if (holdA && typeof m === 'string' && m.startsWith('{"t":"corrGame"')) holdA.push(m); else ws.send(m); });
    server.onClose(() => ws.close());
    ws.onClose(() => server.close());
    releaseA = () => { const q = holdA || []; holdA = null; q.forEach((m) => ws.send(m)); };
  });
  await a.reload(); // kết nối lại qua móc ở trên (vẫn đăng nhập bằng mã lưu trên máy)
  await waitFor(a, () => !!(window.CaroOnline.state.me && !window.CaroOnline.state.me.guest && window.CaroOnline.connected), 'A đăng nhập lại sau khi tải trang');

  // A thách đấu từ Xem thêm › Chơi theo lượt
  await a.click('#tabbar [data-tab="more"]');
  await sleep(300);
  await a.click('#more-corr');
  await sleep(300);
  ok(await a.evaluate(() => document.getElementById('corr-dlg').open), 'Xem thêm › Chơi theo lượt mở hộp thách đấu');
  ok((await audit(a, '#corr-dlg')).length === 0, 'hộp Chơi theo lượt 390px: 0 lỗi hiển thị');
  await a.fill('#corr-dlg input[name=username]', 'corr_b');
  await a.selectOption('#corr-dlg select[name=side]', 'x');
  await a.click('#corr-dlg button[type=submit]');
  await waitFor(a, () => window.CaroCorr.games.some((g) => g.status === 'invite'), 'A thấy lời mời đã gửi');
  ok((await a.textContent('#corr-dlg .corr-body')).includes('Đang chờ corr_b nhận lời'), 'danh sách của A: "Đang chờ … nhận lời"');
  await shot(a, 'corr-dlg-390.png');
  await a.click('#corr-dlg [data-close]');

  // B: thẻ Trang chủ có lời mời → Nhận lời
  await home(b);
  await waitFor(b, () => !document.getElementById('home-corr').hidden, 'B thấy thẻ "Ván đang chờ bạn"');
  ok((await b.textContent('#home-corr')).includes('mời bạn chơi theo lượt (3 ngày mỗi nước)'), 'thẻ Trang chủ ghi lời mời 3 ngày');
  ok((await audit(b, '#home-corr')).length === 0, 'thẻ "Ván đang chờ bạn" 390px: 0 lỗi hiển thị');
  await b.click('#home-corr [data-acc]');
  await waitFor(a, () => window.CaroCorr.games.some((g) => g.status === 'active'), 'ván bắt đầu');
  const id = (await games(a)).find((g) => g.status === 'active').id;

  // A: thẻ Trang chủ "Đến lượt bạn" → mở ván → bấm bàn cờ
  await home(a);
  await waitFor(a, () => !document.getElementById('home-corr').hidden, 'A thấy ván đến lượt mình ở Trang chủ');
  await a.click(`#home-corr [data-open="${id}"]`);
  await sleep(500);
  ok(await a.evaluate(() => document.body.classList.contains('ext') && !!document.querySelector('#ext-bar [data-corr="resign"]')), 'mở ván: bàn cờ + thanh dưới có Đầu hàng');
  ok((await a.textContent('#turn')).includes('Đến lượt bạn'), 'dòng lượt: "Đến lượt bạn · còn …"');
  const [sx, sy] = await a.evaluate(() => window.CaroApp.screenOf(0, 0));
  holdA = [];
  await a.mouse.click(sx, sy);
  await waitFor(b, (gid) => (window.CaroCorr.games.find((g) => g.id === gid) || { moves: [] }).moves.length === 1, 'B nhận nước của A', id);
  ok((await a.textContent('#turn')).includes('Chờ corr_b đánh'), 'vừa đánh, máy chủ chưa trả lời A: dòng lượt đã là "Chờ … đánh" – ' + (await a.textContent('#turn')));
  ok(await a.evaluate(() => window.CaroApp.board.moves.length === 1), 'vừa đánh: nước của A hiện ngay trên bàn');
  releaseA();
  await waitFor(a, (gid) => window.CaroCorr.games.find((g) => g.id === gid).moves.length === 1, 'A nhận bản của máy chủ', id);
  ok((await a.textContent('#turn')).includes('Chờ corr_b đánh'), 'sau khi đánh: "Chờ … đánh"');
  await shot(a, 'corr-board-390.png');
  ok((await audit(a, '#ext-bar')).length === 0 && (await audit(a, 'header.bar.top')).length === 0, 'thanh dưới + thanh trên của ván 390px: 0 lỗi hiển thị');
  ok(await a.evaluate(() => document.getElementById('a11y-cursor').hidden), 'bấm chuột vào bàn: không hiện khung viền bàn phím');

  // B: chuông Thông báo có "Đến lượt bạn" → bấm mở đúng ván → đánh
  await waitFor(b, () => !document.querySelector('#tb-bell .tb-count').hidden, 'chuông có thông báo');
  await b.click('#tb-bell');
  await sleep(200);
  ok((await b.textContent('#tb-pop')).includes('Đến lượt bạn trong ván với corr_a'), 'chuông: "Đến lượt bạn trong ván với …"');
  await b.click('#tb-pop [data-item="0"]');
  await sleep(500);
  ok(await b.evaluate(() => document.body.classList.contains('ext') && window.CaroApp.board.moves.length === 1), 'bấm thông báo: mở đúng ván, thấy nước của A');
  const [bx, by] = await b.evaluate(() => window.CaroApp.screenOf(3, 3));
  await b.mouse.click(bx, by);
  await waitFor(a, (gid) => window.CaroCorr.games.find((g) => g.id === gid).moves.length === 2, 'A nhận nước của B (bàn đồng bộ)', id);
  ok(await a.evaluate(() => window.CaroApp.board.moves.length === 2), 'bàn của A tự cập nhật nước mới');
  // Phím tắt A (phân tích – a11y.js) giữa ván theo lượt đang chơi: không mở bảng phân tích (máy gợi ý nước = gian lận)
  await a.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await a.keyboard.press('a');
  await sleep(300);
  ok(await a.evaluate(() => !window.CaroApp.replay && document.body.classList.contains('ext')), 'phím A giữa ván theo lượt: không mở phân tích');

  // A xin hoà → B đồng ý
  await a.click('#ext-bar [data-corr="draw"]');
  await waitFor(b, () => !document.getElementById('corr-offer').hidden, 'B thấy lời xin hoà');
  ok((await b.textContent('#corr-offer')).includes('corr_a xin hoà'), 'dòng lời xin: "… xin hoà"');
  await b.click('#ext-bar [data-corr="draw"]');
  await waitFor(a, (gid) => window.CaroCorr.games.find((g) => g.id === gid).status === 'done', 'ván kết thúc', id);
  ok((await a.textContent('#turn')).includes('Hoà'), 'kết quả: Hoà');
  await a.click('#ext-bar [data-corr="leave"]');
  await sleep(300);
  ok(await a.evaluate(() => !document.body.classList.contains('ext')), 'Rời bàn: về bàn cờ thường');

  await finish();
})();
