/*
 * Kiểm thử trình duyệt – trang tạo giải như Challonge (đợt Advanced options 2): URL riêng (gợi ý ngẫu nhiên, đổi được),
 * mô tả có định dạng (thanh công cụ, xem trước, hiện trên trang giải), chọn từng cặp hạng của trận xếp hạng, Bo chung
 * kết tự nhập, tab Nhánh đấu (Quick advance, đính kèm, ẩn nhánh xem trước, xếp theo danh sách), nhánh xem trước, mở giải
 * bằng link riêng, ảnh chia sẻ kết quả trận, đính kèm trận; Thụy Sĩ: 5 cấp tie-break, giải thích, cách xếp cặp.
 *   node caro/tests/e2e/tour-opts.e2e.js
 */
'use strict';
const { setup, sleep, gotoRetry } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8806;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280);
  const guest = await user('vi', 'xem_link', 430);

  await boss.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
  await boss.click('[data-act="tourNew"]'); await sleep(300);
  await boss.fill('#tf input[name=name]', 'Cúp Link Riêng');
  await boss.selectOption('#tf select[name=preset]', 'single'); await sleep(100);
  await boss.selectOption('#tf select[name=preset]', 'custom'); await sleep(100);
  await boss.click('#tf-adv'); await sleep(300);

  // ---- Thông tin cơ bản: URL + mô tả có định dạng
  const slug0 = await boss.$eval('#ta input[name=slug]', (e) => e.value);
  ok(/^[a-z0-9]{8}$/.test(slug0), 'URL: gợi ý sẵn link ngẫu nhiên ' + slug0);
  await boss.click('#ta [data-act="slugShuffle"]'); await sleep(80);
  ok(await boss.$eval('#ta input[name=slug]', (e) => e.value) !== slug0, 'Nút đổi ngẫu nhiên: link mới');
  await boss.fill('#ta input[name=slug]', 'Cup Link 1');
  await boss.$eval('#ta input[name=slug]', (e) => e.dispatchEvent(new Event('input', { bubbles: true }))); await sleep(80);
  ok(await boss.$eval('#ta input[name=slug]', (e) => e.value) === 'cup-link-1', 'Gõ link: tự chữ thường, khoảng trắng → "-"');
  ok((await boss.$$('#ta .rt-bar .rt-b')).length >= 14 && !!(await boss.$('#ta .rt-para')), 'Mô tả: thanh công cụ như Challonge (kiểu đoạn, đậm, nghiêng, danh sách, link, ảnh, căn lề…)');
  await boss.fill('#ta textarea[name=desc]', 'Giải hay');
  await boss.$eval('#ta textarea[name=desc]', (e) => e.setSelectionRange(0, e.value.length));
  await boss.click('#ta .rt-bold'); await sleep(80);
  ok(await boss.$eval('#ta textarea[name=desc]', (e) => e.value) === '**Giải hay**', 'Nút Đậm: bọc chữ đang chọn');
  await boss.$eval('#ta textarea[name=desc]', (e) => { e.setSelectionRange(e.value.length, e.value.length); });
  await boss.click('#ta .rt-ul'); await sleep(80); // dòng đang đứng thành mục danh sách
  await boss.click('#ta .rt-preview'); await sleep(80);
  ok(await boss.$eval('#ta .rt-view', (e) => !e.hidden && !!e.querySelector('b') && e.querySelector('b').textContent === 'Giải hay'), 'Xem trước: hiện chữ đậm');
  await boss.click('#ta .rt-preview'); await sleep(80);
  ok(await boss.isVisible('#ta textarea[name=desc]'), 'Bấm lại: về ô soạn');

  // ---- Thể thức: chọn cặp hạng, Bo chung kết tự nhập
  await boss.click('.ta-tab[data-tab="reg"]'); await sleep(80);
  await boss.check('#ta input[name=offline]'); await sleep(80);
  await boss.fill('#ta input[name=max]', '8');
  await boss.$eval('#ta input[name=max]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(120);
  await boss.click('.ta-tab[data-tab="format"]'); await sleep(100);
  ok((await boss.$$('#ta-stages .place-pick .chip')).length === 3, 'Trận xếp hạng (8 người): 3 ô 3–4, 5–6, 7–8');
  await shot(boss, 'opts-places.png');
  await boss.click('#ta-stages [data-sact="placeNone"]'); await sleep(80);
  await boss.check('#ta-stages [data-k="place"][data-p="5"]'); await sleep(120);
  ok(/10 trận/.test(await boss.textContent('#ta-est')), 'Chỉ đấu hạng 5–6: 7 trận chính + bán kết nhánh 5–8 (2) + trận hạng 5 = 10 trận');
  ok(/Giống các vòng khác \(Bo3\)/.test(await boss.textContent('#ta-stages [data-k="boFinal"]')), 'Bo chung kết: "Giống các vòng khác (Bo3)" thay cho "Như giai đoạn"');
  await boss.selectOption('#ta-stages [data-k="boFinal"]', 'c'); await sleep(100);
  await boss.fill('#ta-stages [data-k="boFinalN"]', '10');
  await boss.$eval('#ta-stages [data-k="boFinalN"]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(100);
  ok(await boss.$eval('#ta-stages [data-k="boFinalN"]', (e) => e.value) === '11', 'Tự nhập Bo chung kết: số chẵn 10 → 11');

  // ---- Tab Nhánh đấu
  await boss.click('.ta-tab[data-tab="bracket"]'); await sleep(100);
  ok(await boss.isVisible('#ta input[name=quickAdvance]') && await boss.isChecked('#ta input[name=shareImages]'), 'Tab Nhánh đấu: Quick advance (giải offline), ảnh chia sẻ (mặc định bật)');
  await boss.check('#ta input[name=quickAdvance]');
  await boss.check('#ta input[name=attachments]');
  await boss.check('#ta input[name=hideBracket]');
  await boss.selectOption('#ta select[name=placeBy]', 'list');
  await shot(boss, 'opts-bracket-tab.png');
  await boss.click('.ta-foot button.primary'); await sleep(800);
  const id = await boss.evaluate(() => window.CaroTourKit.D.tour && window.CaroTourKit.D.tour.id);
  const t = app.hub.tours.get(id);
  ok(t && t.slug === 'cup-link-1' && t.desc === '- **Giải hay**' && String(t.stages[0].places) === '5' && t.stages[0].boFinal === 11,
    'Máy chủ nhận: link riêng, mô tả, cặp hạng 5–6, chung kết Bo11');
  ok(t && t.quickAdvance && t.attachments && t.hideBracket && t.placeBy === 'list' && t.shareImages, 'Máy chủ nhận: các ô tab Nhánh đấu');
  ok(await boss.$eval('#tour-body .tdesc.rich', (e) => !!e.querySelector('b') && !!e.querySelector('ul')), 'Trang giải: mô tả hiện chữ đậm + danh sách');

  // ---- Nhánh xem trước: ban tổ chức thấy, người xem (đã ẩn) không thấy
  await boss.fill('#bulk-names', 'P1\nP2\nP3\nP4\nP5\nP6');
  await boss.click('[data-act="bulkAdd"]'); await sleep(500);
  const bt = await boss.textContent('#tour-body');
  ok(/Nhánh đấu dự kiến/.test(bt) && /Chỉ ban tổ chức thấy/.test(bt), 'Ban tổ chức: thấy nhánh dự kiến (ghi rõ đã ẩn với người xem)');
  await gotoRetry(guest, `http://localhost:${PORT}/?t=cup-link-1`); await sleep(1500);
  ok(await guest.evaluate(() => window.CaroTourKit.D.tour && window.CaroTourKit.D.tour.name) === 'Cúp Link Riêng', 'Mở bằng link riêng ?t=cup-link-1');
  ok(!/Nhánh đấu dự kiến/.test(await guest.textContent('#tour-body')), 'Người xem: không thấy nhánh dự kiến (đã ẩn)');
  await shot(guest, 'opts-guest-link.png');

  // ---- Bắt đầu: xếp theo danh sách, Quick advance, ảnh chia sẻ, đính kèm
  await boss.click('[data-act="start"]'); await sleep(800);
  const r0 = t.st[0].rounds[0].map((mid) => t.st[0].matches[mid]);
  ok(app.hub.player(t, r0[0].a).name === 'P1' && app.hub.player(t, r0[0].b).name === 'P2', 'Xếp theo thứ tự danh sách: P1 gặp P2');
  await boss.click(`.scorable[data-mid="${r0[0].id}"]`); await sleep(300);
  ok((await boss.$$('.score-panel [data-act="scoreQuick"]')).length === 2 && !(await boss.$('#sp-sets')), 'Quick advance: chỉ 2 nút chọn người thắng, không ô tỉ số');
  await boss.click('.score-panel [data-act="scoreQuick"]'); await sleep(500);
  ok(r0[0].done && r0[0].quick, 'Bấm người thắng: trận xong');
  await boss.click(`[data-act="matchImg"][data-mid="${r0[0].id}"]`); await sleep(500);
  ok(await boss.$eval('.mx-img img', (e) => e.naturalWidth === 1200), 'Ảnh chia sẻ kết quả: ảnh 1200×630');
  await shot(boss, 'opts-share-img.png');
  await boss.click('.mx-dlg .mx-x'); await sleep(150);
  await boss.click(`[data-act="matchAtt"][data-mid="${r0[0].id}"]`); await sleep(300);
  await boss.fill('.mx-add input[name=text]', 'Biên bản đã ký');
  await boss.fill('.mx-add input[name=url]', 'https://example.com/bb');
  await boss.click('.mx-add button.primary'); await sleep(600);
  ok(r0[0].att && r0[0].att.length === 1 && /Biên bản đã ký/.test(await boss.textContent('.mx-dlg .mx-list')), 'Đính kèm trận: thêm ghi chú + link, hiện ngay trong danh sách');
  await boss.click('.mx-dlg .mx-x'); await sleep(150);

  // ---- Thụy Sĩ: 5 cấp tie-break + giải thích + cách xếp cặp
  await boss.evaluate(() => window.CaroTourKit.acts.tourNew()); await sleep(300);
  await boss.fill('#tf input[name=name]', 'Swiss FIDE');
  await boss.selectOption('#tf select[name=preset]', 'swiss'); await sleep(100);
  await boss.selectOption('#tf select[name=preset]', 'custom'); await sleep(100);
  await boss.click('#tf-adv'); await sleep(300);
  await boss.click('.ta-tab[data-tab="format"]'); await sleep(100);
  ok((await boss.$$('#ta-stages select[data-k^="tb"]')).length === 5, 'Thụy Sĩ: 5 ô tie-break');
  const opts = await boss.$$eval('#ta-stages select[data-k="tb0"] option', (x) => x.map((o) => o.value));
  ok(['bh1', 'mbh2', 'fb', 'aob', 'ps', 'won', 'bpg', 'aro', 'aroc1', 'tpr', 'apro'].every((k) => opts.includes(k)) && !opts.includes('koya'), 'Có đủ hệ số FIDE (Koya chỉ ở vòng tròn)');
  ok(await boss.$eval('#ta-stages select[data-k="pairing"]', (e) => e.value) === 'dutch' && await boss.$eval('#ta-stages select[data-k="unplayed"]', (e) => e.value) === 'fide', 'Mặc định: xếp cặp Hà Lan, trận không đấu theo FIDE');
  await boss.click('#ta-stages .tb-help summary'); await sleep(80);
  ok(/Buchholz Cut-1/.test(await boss.textContent('#ta-stages .tb-help')) && /Elo thành tích/.test(await boss.textContent('#ta-stages .tb-help')), 'Bảng giải thích các hệ số phụ');
  await shot(boss, 'opts-swiss-tb.png');
  await boss.click('.ta-tab[data-tab="bracket"]'); await sleep(80);
  await shot(boss, 'opts-bracket-tab2.png');
  await finish();
})();
