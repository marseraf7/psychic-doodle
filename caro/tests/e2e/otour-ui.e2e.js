/*
 * Soát giao diện tự động trang giải offline (chuẩn giao diện – docs/chuan-giao-dien.md; chỉ mô phỏng thể thức):
 * tạo giải từ một số mẫu đại diện (vòng tròn có cột Phong độ, loại kép, Thụy Sĩ, sinh tồn nhiều giai đoạn, xe đạp nhiều
 * chặng, đua thuyền Bo9/Bo13), bắt đầu, mở lần lượt mọi tab (mở cả khối thu gọn) ở màn rộng 1920 và màn điện thoại 390 –
 * ui-audit.js không được báo lỗi nào: chữ bị cắt không có "…", gợi ý ô nhập / lựa chọn bị cắt, nút đè chữ, chuỗi mẫu chưa
 * thay biến ({bo}, undefined…), thông báo bàn cờ cũ trong vùng đọc màn hình.
 * Thêm: tiêu đề dài có "…" (E1), mở trận rồi khung nhập kết quả không bị thanh tab dính che (L1).
 * Lỗi gốc: danh sách kiểm thử 12–13/11/2026 (E1–E3, L1–L7, N1–N6, A1).
 *   node caro/tests/e2e/otour-ui.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const { audit, coverAt } = require('./ui-audit.js');

const TPLS = ['premier_league', 'lol_msi', 'baku_open', 'pgc23', 'tour_de_france', 'americas_cup'];
const LONG = 'Giải giao hữu mùa đông các câu lạc bộ phía Bắc mở rộng lần 3'; // 59 ký tự (tối đa 60)

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8861;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_ui', 1920);
  const all = [];
  let L1 = 0;
  const report = (where, list) => {
    const uniq = [...new Map(list.map((x) => [x.kind + x.el + x.text, x])).values()];
    for (const x of uniq) all.push(`${where}: ${x.kind} ${x.el} | ${x.text}${x.why ? ' (' + x.why + ')' : ''}`);
    return uniq.length;
  };
  const openAll = () => boss.evaluate(() => document.querySelectorAll('#page-otour details:not([open]), .otp-body details:not([open])').forEach((d) => { d.open = true; }));

  for (const [k, id] of TPLS.entries()) {
    await boss.setViewportSize({ width: 1920, height: 998 });
    await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
    await boss.click(`.tpl-card[data-id="${id}"]`); await sleep(500);
    await boss.click('[data-act="otTplTeams"]').catch(() => {}); await sleep(300);
    // Form tạo giải (cả phần giai đoạn đã mở): gợi ý ô nhập, hộp chọn
    await openAll(); await sleep(200);
    report(`${id} [form]`, await audit(boss, '#otf'));
    if (k === 0) await boss.fill('#otf input[name="name"]', LONG);
    await boss.click('#otf button.primary.wide'); await sleep(1200);
    const tid = await boss.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id);
    ok(!!tid, `${id}: tạo được giải`);
    await boss.evaluate(() => window.CaroTourKit.acts.otStart && window.CaroTourKit.acts.otStart()); await sleep(1500);
    if (k === 0) {
      // E1: tiêu đề dài 60 ký tự lưu đủ, trên thanh tiêu đề cắt có "…" (không cắt cụt)
      ok(app.hub.otGet(tid).name === LONG, 'E1: máy chủ lưu đủ tên dài (không cắt 24 ký tự)');
      const t = await boss.evaluate(() => { const e = document.querySelector('.pg-title > .ellip'); if (!e) return null; const s = getComputedStyle(e); return { cut: e.scrollWidth > e.clientWidth, ell: s.textOverflow, disp: s.display }; });
      ok(t && (!t.cut || (t.ell === 'ellipsis' && !/flex|grid/.test(t.disp))), 'E1: tiêu đề dài có "…" ' + JSON.stringify(t));
    }
    for (const w of [1920, 390]) {
      await boss.setViewportSize({ width: w, height: w > 500 ? 998 : 844 }); await sleep(300);
      const tabs = await boss.$$eval('.ot-tabs [data-tab]', (b) => b.map((x) => x.dataset.tab));
      for (const tab of tabs) {
        await boss.click(`.ot-tabs [data-tab="${tab}"]`); await sleep(600);
        await openAll(); await sleep(200);
        const n = report(`${id} [${tab} @${w}]`, await audit(boss));
        if (n) await shot(boss, `ui-${id}-${tab}-${w}.png`);
      }
    }
    // L1: mở một trận ở tab Giai đoạn (đã cuộn xuống) → khung nhập kết quả không nằm dưới thanh tab dính
    await boss.setViewportSize({ width: 1920, height: 998 }); await sleep(200);
    await boss.click('.ot-tabs [data-tab="stages"]').catch(() => {}); await sleep(500);
    // Trận ở giữa danh sách (trang đã cuộn): app tự cuộn tới khung nhập và đặt con trỏ vào ô đầu (otour-score.js).
    // Giải chỉ có race (nhập theo chặng) không có trận để mở
    const ms = await boss.$$('.scorable');
    if (ms.length) {
      const m = ms[Math.min(ms.length - 1, 5)];
      await m.scrollIntoViewIfNeeded(); await boss.mouse.wheel(0, 300); await sleep(200);
      await m.click({ position: { x: 4, y: 4 } }); await sleep(800);
      ok(!!(await boss.$('.score-panel')), `${id}: mở được khung nhập kết quả`);
      for (const sel of ['.score-panel .sp-head', '.score-panel input']) {
        if (!(await boss.$(sel))) continue;
        const c = await coverAt(boss, sel);
        ok(!c, `${id}: L1 ${sel} không bị thanh tab dính che ${JSON.stringify(c)}`);
      }
      report(`${id} [score-panel]`, await audit(boss, '.score-panel'));
      L1++;
      await boss.click('[data-act="otScoreClose"]').catch(() => {}); await sleep(300);
    }
  }
  ok(L1 >= 3, `L1: đã thử mở khung nhập ở ${L1} giải`);
  // Danh sách giải (thẻ có tên dài – E1 cũng gặp ở thẻ danh sách): rộng và hẹp
  for (const w of [1920, 390]) {
    await boss.setViewportSize({ width: w, height: w > 500 ? 998 : 844 });
    await boss.evaluate(() => window.CaroOTour.list()); await sleep(1200);
    ok(await boss.evaluate((s) => document.body.textContent.includes(s), LONG.slice(0, 40)), `danh sách giải có giải tên dài @${w}`);
    const n = report(`list @${w}`, await audit(boss));
    if (n) await shot(boss, `ui-list-${w}.png`);
  }
  if (all.length) console.log(all.join('\n'));
  ok(all.length === 0, `Soát giao diện: ${all.length} lỗi hiển thị`);
  await finish();
})();
