/*
 * Kiểm thử trình duyệt – Đợt 9: Team Battle tạo từ trang Cài đặt nâng cao (Arena + chọn CLB), chọn CLB thi đấu cho khi
 * tham gia, bảng CLB trên trang giải; giao hữu CLB đấu CLB (thách đấu từ trang CLB, chấp nhận, xếp đội hình theo bàn, bàn 1
 * gặp bàn 1); tủ cúp và bảng xếp hạng CLB.
 *   node caro/tests/e2e/club-battle.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8802;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280); // quản trị viên: CLB / giải được duyệt ngay
  const an = await user('vi', 'an_battle', 430), binh = await user('vi', 'binh_battle', 430);
  const AN = an.uid.replace(/^u_/, ''), BINH = binh.uid.replace(/^u_/, '');
  const K = (p) => p.evaluate(() => window.CaroTourKit.D);
  const mkClub = async (name) => {
    await boss.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });
    await boss.evaluate(() => document.getElementById('open-clubs').click()); await sleep(400);
    await boss.click('[data-act="clubNew"]'); await sleep(200);
    await boss.fill('#cf input[name=name]', name);
    await boss.click('#cf button.primary'); await sleep(600);
    return (await K(boss)).club.id;
  };
  const A = await mkClub('CLB Phương Đông'), B = await mkClub('CLB Phương Tây');
  for (const [p, id] of [[an, A], [binh, B]]) {
    await p.evaluate((i) => window.CaroTour.openClub(i), id); await sleep(500);
    await p.click('[data-act="clubJoin"]'); await sleep(500);
  }
  // ---------------------------------------------------------------- Team Battle từ trang Cài đặt nâng cao
  await boss.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });
  await boss.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
  await boss.click('[data-act="tourNew"]'); await sleep(300);
  await boss.fill('#tf input[name=name]', 'Đại chiến Đông Tây');
  await boss.selectOption('#tf select[name=preset]', 'custom'); await sleep(100);
  await boss.click('#tf-adv'); await sleep(300);
  await boss.click('.ta-tab[data-tab="format"]'); await sleep(100);
  await boss.selectOption('#ta select[name=preset]', 'arena'); await sleep(200);
  ok(await boss.isVisible('.tb-field'), 'Arena: có ô Team Battle ở tab Thể thức');
  await boss.check('#ta input[name=teamOn]');
  await boss.check(`[data-tbclub="${A}"]`);
  await boss.click('.ta-foot button.primary'); await sleep(500);
  ok(/ít nhất 2/.test(await boss.textContent('#ta-err')), 'Chỉ chọn 1 CLB: báo cần ít nhất 2');
  await boss.click('.ta-tab[data-tab="format"]'); await sleep(100);
  await boss.check(`[data-tbclub="${B}"]`);
  await boss.fill('#ta input[name=teamTop]', '3');
  await boss.click('.ta-foot button.primary'); await sleep(800);
  let t = (await K(boss)).tour;
  ok(t && t.teams && t.teams.length === 2 && t.teamTop === 3, 'Tạo Team Battle 2 CLB, tính 3 người');
  const tid = t.id;
  ok(await boss.isVisible('#team-pick'), 'Người thuộc cả 2 CLB: chọn CLB thi đấu cho');
  for (const p of [an, binh]) {
    await p.evaluate((i) => window.CaroTour.open(i), tid); await sleep(500);
    await p.click('[data-act="join"]'); await sleep(500);
  }
  t = app.hub.tours.get(tid);
  ok(t.players.find((p) => p.uid === AN).team === A && t.players.find((p) => p.uid === BINH).team === B, 'An đấu cho Phương Đông, Bình cho Phương Tây');
  ok((await an.$$('.team-table li')).length === 2, 'Trang giải: bảng 2 CLB');
  await shot(an, 'battle-table.png');
  // ---------------------------------------------------------------- Giao hữu: thách đấu từ trang CLB
  await boss.evaluate((i) => window.CaroTour.openClub(i), A); await sleep(600);
  ok(await boss.isVisible('.club-cup'), 'Trang CLB: có tủ cúp');
  await boss.click('[data-act="cmNew"]'); await sleep(500);
  await boss.selectOption('#cm-form select[name=opp]', B);
  await boss.fill('#cm-form input[name=boards]', '2');
  await boss.click('#cm-form button.primary'); await sleep(800);
  t = (await K(boss)).tour;
  ok(t && t.teamMatch && t.teamMatch.boards === 2 && /Phương Đông vs/.test(t.name), 'Gửi lời mời giao hữu: mở trang giải "A vs B"');
  const mid = t.id;
  await boss.click('[data-act="tmAccept"][data-v="1"]'); await sleep(500);
  ok(app.hub.tours.get(mid).teamMatch.accepted, 'Quản lý CLB được mời chấp nhận');
  // Xếp đội hình hai bên
  for (const [side, uid] of [['a', AN], ['b', BINH]]) {
    await boss.click(`details[data-lu="${mid}:${side}"] summary`); await sleep(150);
    await boss.selectOption(`[data-lineup="${side}"][data-i="0"]`, uid);
    await boss.click(`[data-act="tmLineup"][data-side="${side}"]`); await sleep(500);
  }
  const tm = app.hub.tours.get(mid).teamMatch;
  ok(tm.lineup.a.join() === AN && tm.lineup.b.join() === BINH, 'Lưu đội hình hai bên');
  ok(/An|an_battle/.test(await boss.textContent('.tm-boards')), 'Trang giải: bàn 1 hiện tên người được xếp');
  await shot(boss, 'match-lineup.png');
  // Bắt đầu: chỉ 1 bàn đủ người → bàn 1 gặp bàn 1
  await boss.click('[data-act="start"]'); await sleep(1000);
  const st = app.hub.tours.get(mid);
  ok(st.status === 'running' && st.teamMatch.pairs.length === 1 && st.teamMatch.pairs[0].join() === [AN, BINH].join(), 'Bắt đầu: bàn 1 An gặp Bình');
  // ---------------------------------------------------------------- Bảng xếp hạng CLB
  await binh.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });
  await binh.evaluate(() => document.getElementById('open-clubs').click()); await sleep(400);
  await binh.click('[data-act="clubRanking"]'); await sleep(500);
  ok(/10 \/ 6 \/ 4/.test(await binh.textContent('#tour-body')), 'Trang Xếp hạng CLB: ghi cách tính điểm');
  ok(await binh.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '430 px: không tràn ngang');
  await finish();
})();
