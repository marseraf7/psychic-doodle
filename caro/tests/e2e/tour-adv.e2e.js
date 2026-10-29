/*
 * Kiểm thử trình duyệt – tạo giải: dòng ước tính số trận / thời gian, nút "Cài đặt nâng cao" (chỉ khi Tuỳ chỉnh),
 * trang Cài đặt nâng cao (tab, chuyển qua lại với form nhanh không mất dữ liệu, kiểm tên ở tab ẩn, tạo giải),
 * bản nháp còn sau khi tải lại trang, nút Đặt lại, 4 ngôn ngữ, mọi bề rộng màn hình.
 *   node caro/tests/e2e/tour-adv.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8794;
  const { user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280);
  const est = (p, id = 'tf-est') => p.$eval('#' + id, (e) => e.textContent);
  const openNew = async (p) => {
    await p.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });
    await p.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
    await p.click('[data-act="tourNew"]'); await sleep(300);
  };

  // ---------------------------------------------------------------- Form nhanh: ước tính + nút nâng cao
  await openNew(boss);
  ok(/Arena/.test(await est(boss)), 'Arena: dòng ước tính ghi thời lượng – ' + await est(boss));
  ok(await boss.$eval('#tf-adv', (e) => e.hidden), 'Arena: chưa có nút Cài đặt nâng cao');
  await boss.selectOption('#tf select[name=preset]', 'single'); await sleep(120);
  ok(/32 trận · 5 lượt đấu/.test(await est(boss)), 'Loại trực tiếp 32 người: "≈ 32 trận · 5 lượt đấu" (31 + tranh hạng ba) – ' + await est(boss));
  ok(await boss.$eval('#tf-adv', (e) => e.hidden), 'Mẫu có sẵn: chưa có nút Cài đặt nâng cao');
  await boss.fill('#tf input[name=max]', '8'); await sleep(120);
  ok(/8 trận · 3 lượt đấu/.test(await est(boss)), 'Đổi số người tối đa → ước tính cập nhật ngay (8 người: 8 trận, 3 lượt)');
  await boss.selectOption('#tf select[name=preset]', 'custom'); await sleep(150);
  ok(!(await boss.$eval('#tf-adv', (e) => e.hidden)), 'Chọn Tuỳ chỉnh: hiện nút Cài đặt nâng cao');
  const btnBelow = await boss.evaluate(() => {
    const s = document.querySelector('#tf select[name=preset]').getBoundingClientRect(), b = document.getElementById('tf-adv').getBoundingClientRect();
    return b.top > s.bottom && b.top - s.bottom < 120;
  });
  ok(btnBelow, 'Nút Cài đặt nâng cao nằm ngay dưới ô Thể thức');
  // Tuỳ chỉnh bắt đầu từ giai đoạn đang có (loại trực tiếp); thêm vòng bảng phía trước
  await boss.click('#tf-stages [data-sact="add"]'); await sleep(120);
  ok((await boss.$$('#tf-stages .stage-card')).length === 2, 'Thêm giai đoạn: vòng tròn → loại trực tiếp');
  await boss.fill('#tf input[name=name]', 'Cúp Nâng Cao');
  await boss.fill('#tf input[name=max]', '32');
  await boss.$eval('#tf input[name=max]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(100);
  await shot(boss, 'tadv-quick.png');

  // ---------------------------------------------------------------- Trang nâng cao
  await boss.click('#tf-adv'); await sleep(300);
  ok(!!(await boss.$('#ta')), 'Bấm nút → mở trang Cài đặt nâng cao');
  ok(/Cài đặt nâng cao/.test(await boss.textContent('#tour-title')), 'Tiêu đề: Cài đặt nâng cao');
  const w = await boss.$eval('#tour-dlg', (e) => e.getBoundingClientRect().width);
  ok(w > 900, 'Hộp thoại rộng ra như trang Challonge (' + Math.round(w) + ' px)');
  ok((await boss.$$('.ta-tab')).length === 5, 'Có 5 tab cài đặt');
  ok(await boss.$eval('#ta input[name=name]', (e) => e.value) === 'Cúp Nâng Cao', 'Tên đã nhập ở form nhanh còn nguyên');
  await boss.click('.ta-tab[data-tab="format"]'); await sleep(120);
  ok(await boss.$eval('#ta select[name=preset]', (e) => e.value) === 'custom', 'Tab Thể thức: đang là Tuỳ chỉnh');
  ok((await boss.$$('#ta-stages .stage-card')).length === 2, 'Tab Thể thức: đủ 2 giai đoạn từ form nhanh');
  const before = await est(boss, 'ta-est');
  await boss.fill('#ta-stages [data-i="0"][data-k="groups"]', '4');
  await boss.$eval('#ta-stages [data-i="0"][data-k="groups"]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(120);
  const after = await est(boss, 'ta-est');
  ok(before !== after && /\d+ trận/.test(after), `Sửa số bảng → thanh tóm tắt cập nhật (${before} → ${after})`);
  // 4 bảng × 8 người: 4 × 28 = 112 trận; 8 người đi tiếp: 7 trận + tranh hạng ba
  ok(/120 trận/.test(after), '4 bảng × 8 người + loại trực tiếp 8 người: 120 trận');
  await boss.click('.ta-tab[data-tab="reg"]'); await sleep(120);
  ok(await boss.isVisible('#ta input[name=max]') && !(await boss.isVisible('#ta select[name=preset]')), 'Tab Đăng ký: chỉ hiện các ô của tab này');
  await boss.fill('#ta input[name=max]', '16'); await sleep(120);
  ok(/16 người/.test(await est(boss, 'ta-est')), 'Đổi số người ở tab Đăng ký → tóm tắt "nếu đủ 16 người"');
  // Bàn phím: mũi tên phải chuyển tab
  await boss.focus('.ta-tab[data-tab="reg"]'); await boss.keyboard.press('ArrowRight'); await sleep(100);
  ok(await boss.$eval('.ta-tab.on', (e) => e.dataset.tab) === 'access', 'Phím → chuyển sang tab kế tiếp');
  const foot = await boss.evaluate(() => { const r = document.querySelector('.ta-foot').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.height > 0; });
  ok(foot, 'Thanh tóm tắt + nút Tạo giải luôn thấy ở đáy');
  await shot(boss, 'tadv-1280.png');

  // ---------------------------------------------------------------- Về form nhanh và quay lại
  await boss.click('[data-act="tourQuick"]'); await sleep(300);
  ok(!!(await boss.$('#tf')), 'Nút "Form nhanh" → về form nhanh');
  ok(await boss.$eval('#tf input[name=max]', (e) => e.value) === '16' && await boss.$eval('#tf input[name=name]', (e) => e.value) === 'Cúp Nâng Cao', 'Form nhanh giữ tên và số người đã sửa ở trang nâng cao');
  ok(await boss.$eval('#tf-stages [data-i="0"][data-k="groups"]', (e) => e.value) === '4', 'Form nhanh giữ giai đoạn đã sửa (4 bảng)');
  await boss.click('#tf-adv'); await sleep(300);
  await boss.click('#tour-back'); await sleep(300);
  ok(!!(await boss.$('#tf')), 'Nút Quay lại ở đầu hộp thoại cũng về form nhanh');

  // ---------------------------------------------------------------- Bản nháp còn sau khi tải lại trang
  await boss.reload(); await sleep(1200);
  await openNew(boss);
  ok(await boss.$eval('#tf input[name=name]', (e) => e.value) === 'Cúp Nâng Cao' && await boss.$eval('#tf select[name=preset]', (e) => e.value) === 'custom', 'Tải lại trang: bản nháp còn (tên, Tuỳ chỉnh)');

  // ---------------------------------------------------------------- Tạo giải từ trang nâng cao
  await boss.click('#tf-adv'); await sleep(300);
  await boss.click('.ta-tab[data-tab="reg"]'); await sleep(100);
  await boss.uncheck('#ta input[name=checkin]');
  await boss.$eval('#ta input[name=name]', (e) => { e.value = ''; }); // ô tên nằm ở tab đang ẩn
  await boss.click('.ta-foot button.primary'); await sleep(250);
  ok(await boss.$eval('.ta-tab.on', (e) => e.dataset.tab) === 'basic' && /tên giải/i.test(await boss.textContent('#ta-err')), 'Thiếu tên: tự chuyển về tab Thông tin cơ bản + báo lỗi');
  await boss.fill('#ta input[name=name]', 'Cúp Nâng Cao');
  await boss.click('.ta-foot button.primary'); await sleep(800);
  const t = await boss.evaluate(() => window.CaroTourKit.D.tour);
  ok(t && t.name === 'Cúp Nâng Cao', 'Tạo giải từ trang nâng cao → mở trang giải');
  ok(t && t.stages.length === 2 && t.stages[0].groups === 4 && t.maxPlayers === 16 && !t.checkinEnabled, 'Máy chủ nhận đúng cấu hình: 4 bảng, 16 người, tắt điểm danh');
  await openNew(boss);
  ok(await boss.$eval('#tf input[name=name]', (e) => e.value) === '' && await boss.$eval('#tf select[name=preset]', (e) => e.value) === 'arena', 'Tạo xong: bản nháp đã xoá, form về mặc định');
  await boss.fill('#tf input[name=name]', 'Nháp thử');
  await boss.selectOption('#tf select[name=preset]', 'swiss'); await sleep(100);
  await boss.click('[data-act="tourReset"]'); await sleep(200);
  ok(await boss.$eval('#tf input[name=name]', (e) => e.value) === '' && await boss.$eval('#tf select[name=preset]', (e) => e.value) === 'arena', 'Nút Đặt lại: về mặc định');

  // ---------------------------------------------------------------- 4 ngôn ngữ, mọi bề rộng
  for (const [lang, name, width, title] of [['en', 'ann_en', 1280, 'Advanced settings'], ['ru', 'ivan_ru', 768, 'Расширенные настройки'], ['zh', 'li_zh', 390, '高级设置'], ['vi', 'nam_vi', 360, 'Cài đặt nâng cao']]) {
    const p = await user(lang, name, width);
    await openNew(p);
    await p.selectOption('#tf select[name=preset]', 'custom'); await sleep(150);
    ok(/\d/.test(await est(p)) && !/est_/.test(await est(p)), `${lang}: dòng ước tính đã dịch – ${await est(p)}`);
    await p.click('#tf-adv'); await sleep(300);
    ok((await p.textContent('#tour-title')).includes(title), `${lang}: tiêu đề "${title}"`);
    const r = await p.evaluate(() => {
      const tabs = [...document.querySelectorAll('.ta-tab')].map((b) => b.textContent.trim());
      const nav = document.querySelector('.ta-tabs').getBoundingClientRect();
      const body = document.getElementById('tour-body');
      return { keys: tabs.some((x) => /tadv_/.test(x)), horiz: nav.width > nav.height, wide: body.scrollWidth <= body.clientWidth + 1, page: document.documentElement.scrollWidth <= innerWidth + 1 };
    });
    ok(!r.keys && r.page && r.wide, `${lang} ${width}px: tab đã dịch, không tràn ngang – ` + JSON.stringify(r));
    if (width <= 720) ok(r.horiz, `${lang} ${width}px: tab thành dải ngang trên điện thoại`);
    await p.click('.ta-tab[data-tab="format"]'); await sleep(100);
    await shot(p, `tadv-${lang}-${width}.png`);
  }
  await finish();
})();
