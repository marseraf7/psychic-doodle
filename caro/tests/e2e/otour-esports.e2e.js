/*
 * Kiểm thử trình duyệt – Esports (otour-games-ui.js): mẫu LoL Worlds (Play-In + 15 đội vào thẳng Thụy Sĩ, tránh cùng khu
 * vực) → khung trận có "Chi tiết các ván" → nhập cấm chọn 20 bước, chỉ số đội, vàng theo thời gian → thẻ ván + biểu đồ
 * vàng; ván 2 chọn lại tướng ván 1 → Fearless chặn; thống kê tướng ở tab Thống kê; sửa cấu hình ở tab Khác.
 *   node caro/tests/e2e/otour-esports.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8835;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_esport', 1100);
  const tab = (k) => boss.click(`[data-act="otTab"][data-tab="${k}"]`).then(() => sleep(400));
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="lol_worlds"]'); await sleep(300);
  ok(await boss.$eval('#otf-stages [data-i="1"][data-k="direct"]', (e) => e.value) === '15' && await boss.isChecked('#otf-stages [data-i="1"][data-k="region"]'), 'Mẫu LoL: 15 đội vào thẳng vòng Thụy Sĩ, vòng 1 tránh cùng khu vực');
  ok(/\+ 15 đội vào thẳng/.test(await boss.textContent('#otf-stages .flow')), 'Sơ đồ giai đoạn ghi "+ 15 đội vào thẳng"');
  await boss.click('[data-act="otTplTeams"]'); await sleep(300);
  ok(/Khoảng 41 trận/.test(await boss.textContent('#otf-est')), 'Ước tính 1 + 33 + 7 = 41 trận');
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.esports && t.esports.fearless === 'hard', 'Tạo giải có cấu hình cấm chọn + Fearless cứng');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  const pi = Object.values(t.st[0].matches)[0];
  ok(t.st[0].entrants.length === 2, 'Play-In: 2 đội');
  await tab('stages');
  await boss.click(`.scorable[data-mid="${pi.id}"]`); await sleep(400);
  ok(/Chi tiết các ván/.test(await boss.textContent('.score-panel')), 'Khung trận có phần chi tiết ván');
  await boss.click('[data-act="otGameEdit"][data-i="0"]'); await sleep(400);
  ok(await boss.$$eval('#otg-edit .dr-step input', (xs) => xs.length) === 20, 'Ván 1: 20 ô cấm chọn theo kịch bản LoL');
  // Điền cấm chọn: bên xanh cấm X1–X5 chọn A1–A5; bên đỏ cấm Y1–Y5 chọn B1–B5
  for (const [side, kind, p] of [['blue', 'ban', 'X'], ['blue', 'pick', 'A'], ['red', 'ban', 'Y'], ['red', 'pick', 'B']]) {
    for (let n = 0; n < 5; n++) await boss.fill(`#otg-edit [data-gk="dr.${side}.${kind}.${n}"]`, p + (n + 1));
  }
  const st = { kills: [14, 6], gold: [62000, 51000], towers: [9, 2], dragons: [4, 1], barons: [1, 0] };
  for (const [k, [b, r]] of Object.entries(st)) { await boss.fill(`#otg-edit [data-gk="st.blue.${k}"]`, String(b)); await boss.fill(`#otg-edit [data-gk="st.red.${k}"]`, String(r)); }
  await boss.fill('#otg-edit [data-gk="dur"]', '31:40');
  await boss.fill('#otg-edit [data-gk="mvp"]', 'Người đi rừng');
  await boss.fill('#otg-edit [data-gk="gold"]', '5 8100 7900\n10 17200 16100\n15 26.4k 23.9k\n20 36k 31k\n25 47k 39k\n30 58k 47k');
  await boss.click('[data-act="otGameSave"]'); await sleep(800);
  ok(pi.esp && pi.esp[0] && pi.esp[0].draft.blue.picks[0] === 'A1' && pi.esp[0].st.red.gold === 51000 && pi.esp[0].gold.length === 6 && pi.esp[0].dur === 1900, 'Lưu ván 1: cấm chọn, chỉ số, vàng, thời lượng');
  ok(await boss.isVisible('.esp-game .gold-svg') && /31:40/.test(await boss.textContent('.esp-games')), 'Thẻ ván 1: biểu đồ vàng + thời lượng');
  await boss.$eval('.esp-game', (e) => e.scrollIntoView()).catch(() => {}); await sleep(200);
  await shot(boss, 'ot-esports-game.png');
  // Ván 2: chọn lại A1 → Fearless chặn ngay trên máy (chưa gửi)
  await boss.click('[data-act="otGameEdit"][data-i="1"]'); await sleep(400);
  ok(/Không được chọn \(Fearless\): .*A1 \(ván 1\)/.test(await boss.textContent('#otg-edit')), 'Ván 2: hiện danh sách tướng bị khoá');
  await boss.$eval('#otg-edit', (e) => e.scrollIntoView()).catch(() => {}); await sleep(200);
  await shot(boss, 'ot-esports-edit.png');
  await boss.fill('#otg-edit [data-gk="dr.blue.pick.0"]', 'A1');
  for (const k of Object.keys(st)) { await boss.fill(`#otg-edit [data-gk="st.blue.${k}"]`, '1'); await boss.fill(`#otg-edit [data-gk="st.red.${k}"]`, '1'); }
  await boss.click('[data-act="otGameSave"]'); await sleep(500);
  ok(/Fearless: A1 đã được chọn ở ván 1/.test(await boss.textContent('#otg-err')) && !(pi.esp[1]), 'Fearless chặn chọn lại A1');
  await boss.fill('#otg-edit [data-gk="dr.blue.pick.0"]', 'C1');
  await boss.click('[data-act="otGameSave"]'); await sleep(700);
  ok(pi.esp[1] && pi.esp[1].draft.blue.picks[0] === 'C1', 'Đổi tướng: lưu được ván 2');
  // Nhập kết quả loạt rồi xem thống kê
  await boss.click('.score-panel [data-act="otScoreClose"]').catch(() => {});
  await boss.evaluate(([tid, mid]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, sets: [[1, 0], [1, 0], [1, 0]] }), [id, pi.id]); await sleep(900);
  ok(t.st[1] && t.st[1].entrants.length === 16, 'Hết Play-In: Thụy Sĩ 16 đội');
  await tab('stats');
  ok(/Thống kê Esports/.test(await boss.textContent('.esp-stats')) && /A1/.test(await boss.textContent('.esp-stats')) && /bên xanh thắng/.test(await boss.textContent('.esp-stats')), 'Tab Thống kê: bảng tướng + bên xanh');
  await shot(boss, 'ot-esports-stats.png');
  // Tab Khác: đổi Fearless sang mềm, thêm danh sách tướng gợi ý
  await tab('more');
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(300);
  await boss.selectOption('#otesp select[name=fearless]', 'soft');
  await boss.fill('#otesp textarea[name=pool]', 'Ahri\nZed, Lee Sin');
  await boss.click('[data-act="otEspSave"]'); await sleep(700);
  ok(t.esports.fearless === 'soft' && t.esports.pool.length === 3, 'Lưu cấu hình: Fearless mềm, 3 tướng gợi ý');
  // Gợi ý tướng trong khung trận: danh sách vừa dán + tên đã dùng trong giải
  await tab('stages');
  await boss.click(`.viewable[data-mid="${pi.id}"], .scorable[data-mid="${pi.id}"]`).catch(() => {}); await sleep(400);
  const opts = await boss.$$eval('#ot-champs option', (xs) => xs.map((x) => x.value)).catch(() => []);
  ok(opts.includes('Ahri') && opts.includes('Lee Sin') && opts.includes('A1'), 'Gợi ý tướng: danh sách dán vào + tên đã dùng');
  await finish();
})();
