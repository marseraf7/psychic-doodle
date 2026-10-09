/*
 * Kiểm thử trình duyệt – giải đấu theo giai đoạn: form tạo giải (mẫu + tuỳ chỉnh, chia theo số người mỗi bảng),
 * xếp bảng như Challonge, vòng bảng → playoff loại trực tiếp, Thụy Sĩ → nhánh thắng – thua.
 * 7 người chơi, 4 ngôn ngữ, đánh hết tới bục trao giải.
 * Chạy: node caro/tests/e2e/tour-stages.e2e.js   (cần Playwright + Chromium; xem helpers.js)
 */
'use strict';
const { setup, play, roomOf, sleep } = require('./helpers.js');

(async () => {
  const { app, user, ok, shot, finish } = await setup(Number(process.env.E2E_PORT) || 8793);
  const boss = await user('vi', 'boss', 1100);
  const ps = [await user('vi', 'an_vi'), await user('en', 'bob_en', 390), await user('ru', 'dima_ru'), await user('zh', 'chen_zh', 360), await user('vi', 'eve_vi'), await user('en', 'fay_en')];
  const setStage = async (i, k, v) => {
    const sel = `#tf-stages [data-i="${i}"][data-k="${k}"]`;
    const tag = await boss.$eval(sel, (e) => e.tagName);
    if (tag === 'SELECT') await boss.selectOption(sel, String(v)); else { await boss.fill(sel, String(v)); await boss.$eval(sel, (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); }
    await sleep(80);
  };
  async function create(name, preset, edit) {
    await boss.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });
    await boss.click('#open-tours'); await sleep(300);
    await boss.click('[data-act="tourNew"]'); await sleep(300);
    await boss.fill('#tf input[name=name]', name);
    await boss.selectOption('#tf select[name=preset]', preset); await sleep(100);
    await edit();
    await boss.uncheck('#tf input[name=checkin]');
  }
  async function joinAll(name) {
    for (const p of ps) {
      await p.evaluate(() => { const b = document.getElementById('banner'); if (b) b.hidden = true; if (document.getElementById('tour-dlg').open) document.getElementById('tour-dlg').close(); });
      if (await p.evaluate(() => document.body.classList.contains('online'))) { await p.click('#btn-leave'); await sleep(300); }
      if (!(await p.isVisible('#online'))) { await p.click('#btn-online'); await sleep(300); }
      await p.click('#open-tours'); await sleep(500);
      await p.locator('[data-act="tour"]', { hasText: name }).first().click(); await sleep(400);
      await p.click('[data-act="join"]'); await sleep(250);
    }
  }
  /** Đánh mọi trận đang mở; strength(name) lớn hơn thì thắng. Dừng khi giải có bục trao giải. */
  async function drive(tname, strength, onEach) {
    for (let k = 0; k < 400; k++) {
      if (await boss.evaluate(() => !!document.querySelector('#tour-body .podium'))) return true;
      let played = false;
      for (const p of ps) {
        const r = await roomOf(p);
        if (!r || !r.tour || r.tour.name !== tname || r.winner || r.players.length !== 2) continue;
        const o = ps.find((x) => x.uid === r.players.find((y) => y.id !== p.uid).id);
        const [w, l] = strength(p.uname) >= strength(o.uname) ? [p, o] : [o, p];
        await play(w, l);
        played = true;
        if (onEach) await onEach();
      }
      if (!played) await sleep(300);
    }
    return false;
  }
  // ---------------- Giải 1: vòng bảng (2 bảng × 3) -> playoff loại trực tiếp
  await create('Cúp Bảng Đấu', 'groups_single', async () => {
    ok((await boss.$$('#tf-stages .stage-card')).length === 2, 'Mẫu "Vòng bảng + loại trực tiếp": 2 giai đoạn');
    await setStage(0, 'gmode', 'size');
    ok(await boss.$eval('#tf select[name=preset]', (e) => e.value) === 'custom', 'Sửa giai đoạn -> chuyển sang "Tuỳ chỉnh"');
    await setStage(0, 'groupSize', 3);
    await setStage(1, 'bestOf', 1);
    ok((await boss.textContent('#tf-stages .flow')).includes('3 người/bảng'), 'Chia theo số người mỗi bảng: "Vòng tròn (3 người/bảng) → … → Loại trực tiếp"');
    await shot(boss, 'p1-stage-editor-vi.png');
  });
  await boss.click('#tf button.primary'); await sleep(600);
  ok((await boss.textContent('#tour-body')).includes('Giai đoạn 1'), 'Trang giải: hiện các giai đoạn');
  await joinAll('Cúp Bảng Đấu');
  // Xếp bảng như Challonge: chuyển người đầu bảng B sang bảng A rồi lưu
  const tid1 = await boss.evaluate(() => { const d = document.querySelector('#tour-body details.fold[data-k$=":grp"]'); return d && d.dataset.k.split(':')[0]; });
  ok(!!tid1, 'Ban tổ chức thấy khung "Xếp bảng"');
  const cards = () => boss.$$eval('#tour-body .grp-card', (cs) => cs.map((c) => [...c.querySelectorAll('li[data-uid]')].map((li) => li.dataset.uid)));
  let before = await cards();
  for (let k = 0; k < 30 && before.flat().length < 6; k++) { await sleep(100); before = await cards(); } // chờ lượt đăng ký cuối tới trang
  ok(before.length === 2 && before.every((g) => g.length === 3), '6 người, 3 người/bảng -> 2 bảng × 3 ' + JSON.stringify(before.map((g) => g.length)));
  const moved = before[1][0];
  await boss.selectOption(`#tour-body .grp-card[data-grp="1"] select.grp-move[data-uid="${moved}"]`, '0'); await sleep(200);
  ok((await cards())[0].length === 4 && (await boss.textContent('#tour-body')).includes('chưa lưu'), 'Chuyển người sang bảng A (chưa lưu)');
  await shot(boss, 'p0-group-editor-vi.png');
  await boss.click('[data-act="grpSave"]'); await sleep(600);
  const t1 = app.hub.tours.get(tid1);
  ok(t1.groupPlan && t1.groupPlan[0].includes(moved) && t1.groupPlan[0].length === 4, 'Máy chủ lưu cách xếp bảng');
  ok((await boss.textContent('#tour-body')).includes('Đã xếp tay'), 'Trang giải: "Đã xếp tay"');
  await boss.click('[data-act="start"]'); await sleep(1500);
  ok(t1.st && t1.st[0].groups[0].players.length === 4 && t1.st[0].groups[0].players.includes(moved), 'Bốc thăm theo bảng đã xếp');
  await shot(boss, 'p2-groups-live-vi.png');
  const S1 = { an_vi: 6, bob_en: 5, dima_ru: 4, chen_zh: 3, eve_vi: 2, fay_en: 1 };
  let shotPlayoff = false;
  const done1 = await drive('Cúp Bảng Đấu', (n) => S1[n], async () => {
    if (!shotPlayoff && await boss.evaluate(() => document.querySelectorAll('#tour-body details.fold')[1]?.open)) {
      await sleep(300); shotPlayoff = true;
      await shot(boss, 'p3-playoff-vi.png');
    }
  });
  ok(done1, 'Giải 1 kết thúc');
  await sleep(500);
  const txt1 = await boss.textContent('#tour-body');
  ok(txt1.includes('Bảng A') && txt1.includes('Bảng B') && txt1.includes('Chung kết') && txt1.includes('Tranh hạng 3'), 'Bảng A/B + nhánh playoff + tranh hạng 3');
  ok(/🥇\s*an_vi/.test(txt1), 'Vô địch an_vi');
  const B = ps[1];
  await B.evaluate(() => window.CaroTour.open(window.CaroOnline.state.room.tour.id)); await sleep(700);
  await B.evaluate(() => document.querySelectorAll('#tour-body details.fold').forEach((d) => { d.open = true; }));
  await sleep(200);
  const tb = await B.textContent('#tour-body');
  ok(tb.includes('Group A') && tb.includes('Stage 2') && tb.includes('Pts'), 'Tiếng Anh: Group A, Stage 2, cột Pts');
  await shot(B, 'p4-groups-en-mobile.png');
  // Người bị loại ở vòng bảng thấy "Không vào vòng sau"
  ok((await boss.textContent('#tour-body')).includes('Không vào vòng sau'), 'Danh sách người chơi: "Không vào vòng sau"');

  // ---------------- Giải 2: Thụy Sĩ 3 vòng (top 4) -> nhánh thắng-thua
  await create('Swiss Masters', 'swiss_single', async () => {
    await setStage(0, 'rounds', 3);
    await setStage(0, 'advance', 4);
    await setStage(1, 'type', 'double');
    await setStage(1, 'bestOf', 1);
    ok(await boss.isVisible('#tf-stages [data-k="reset"]'), 'Nhánh thắng-thua: có tuỳ chọn reset');
  });
  await boss.click('#tf button.primary'); await sleep(600);
  ok((await boss.textContent('#tour-body')).includes('Nhánh thắng – thua · Bo1'), 'Đổi Bo bằng ô chọn được lưu (Bo1)');
  await joinAll('Swiss Masters');
  await boss.click('[data-act="start"]'); await sleep(1500);
  const S2 = { an_vi: 6, bob_en: 5, dima_ru: 4, chen_zh: 3, eve_vi: 2, fay_en: 1 };
  const done2 = await drive('Swiss Masters', (n) => S2[n]);
  ok(done2, 'Giải 2 kết thúc');
  await sleep(500);
  await boss.evaluate(() => document.querySelectorAll('#tour-body details.fold').forEach((d) => { d.open = true; }));
  const t2 = await boss.textContent('#tour-body');
  ok(t2.includes('Nhánh thắng') && t2.includes('Nhánh thua') && t2.includes('Chung kết tổng') && t2.includes('Buchholz'), 'Thụy Sĩ (Bh) + nhánh thắng / thua / chung kết tổng');
  await shot(boss, 'p5-swiss-double-vi.png');
  const C = ps[3];
  await C.evaluate(() => window.CaroTour.open(window.CaroOnline.state.room.tour.id)); await sleep(700);
  await shot(C, 'p6-swiss-double-zh-mobile.png');
  ok((await C.textContent('#tour-body')).includes('瑞士制'), 'Tiếng Trung: 瑞士制');
  const R = ps[2];
  await R.evaluate(() => window.CaroTour.open(window.CaroOnline.state.room.tour.id)); await sleep(700);
  ok((await R.textContent('#tour-body')).includes('Нижняя сетка'), 'Tiếng Nga: Нижняя сетка');
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
