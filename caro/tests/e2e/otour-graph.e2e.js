/*
 * Kiểm thử trình duyệt – đợt 19–20: nhánh đồ thị (chỉ mô phỏng thể thức).
 *   1. Form: chọn thể thức "Nhánh đặc biệt" ở giai đoạn cuối, đổi khuôn sang thang leo bậc → hiện bảng các bậc; đặt Bo và
 *      trận tặng cho bậc 1; mô tả bằng lời ghi đúng.
 *   2. Mẫu kiểu AFL Final Eight: chạy vòng tròn, sang nhánh 9 trận – trang giải vẽ 4 cột, mỗi trận ghi "Thắng → / Thua →";
 *      đấu hết thì có bảng thứ hạng.
 *   3. Mẫu thang leo bậc kiểu KBO: ô nhập loạt Wild Card nói rõ trận tặng và luật hoà; nhập hoà trận 1 → hạng 4 đi tiếp.
 *   node caro/tests/e2e/otour-graph.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const ST = require('../../../server/src/hub/stages.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8846;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_graph', 1100);
  const S = (i, k) => `#otf-stages [data-i="${i}"][data-k="${k}"]`;
  const desc = () => boss.textContent('#otf-desc');
  const tpl = async (id) => { await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300); await boss.click(`.tpl-card[data-id="${id}"]`); await sleep(500); };
  const create = async () => {
    await boss.click('[data-act="otTplTeams"]'); await sleep(400);
    await boss.click('#otf button.primary.wide'); await sleep(1200);
    const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
    await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
    return id;
  };
  const send = (id, mid, x) => boss.evaluate(([tid, m, y]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: m, ...y }), [id, mid, x]);
  /** Đấu các trận đang mở (hạt giống cao thắng) tới khi sang giai đoạn upto hoặc xong giải. */
  async function play(id, t, upto = 99) {
    const so = app.hub.otSeedOf(t);
    for (let g = 0; t.status === 'running' && t.stage < upto && g < 80; g++) {
      const st = t.st[t.stage];
      for (const m of ST.playable(st)) {
        const hi = so(m.a) < so(m.b), bo = ST.boOf(st, m);
        await send(id, m.id, t.result === 'winner' ? { winner: hi ? m.a : m.b } : ST.linked(st.type) && bo > 1 ? { sets: Array.from({ length: (bo + 1) / 2 }, () => (hi ? [3, 1] : [1, 3])) } : { score: hi ? [2, 1] : [1, 2] });
        for (let k = 0; !m.done && k < 40; k++) await sleep(50);
      }
    }
  }

  // ---------- 1. Form: nhánh đặc biệt, thang leo bậc
  await tpl('compass8');
  ok(await boss.inputValue(S(0, 'type')) === 'graph' && await boss.inputValue(S(0, 'shape')) === 'compass8', 'Mẫu Compass: thể thức nhánh đặc biệt, khuôn Compass');
  ok(/nhánh Compass draw/.test(await desc()), 'Mô tả: nhánh Compass');
  await boss.selectOption(S(0, 'shape'), 'gauntlet'); await sleep(300);
  ok(!!(await boss.$(S(0, 'grBo0'))), 'Khuôn thang leo bậc: hiện bảng các bậc');
  await boss.selectOption(S(0, 'grBo0'), '3'); await sleep(200);
  await boss.selectOption(S(0, 'grGift0'), '1'); await sleep(200);
  await boss.check(S(0, 'grTie0')); await sleep(300);
  const d = await desc();
  ok(/bậc 1: Bo3/.test(d) && /tặng 1 trận cho hạt giống cao/.test(d) && /hoà loạt thì hạt giống cao đi tiếp/.test(d), 'Mô tả: Bo, trận tặng, luật hoà loạt của bậc 1');
  await shot(boss, 'ot-graph-form.png');

  // ---------- 2. AFL Final Eight
  await tpl('afl_final8');
  const id = await create();
  const t = app.hub.otGet(id);
  await play(id, t, 1);
  ok(t.stage === 1 && t.st[1].type === 'graph' && Object.keys(t.st[1].matches).length === 9, 'Sang nhánh Final Eight: 9 trận');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(700);
  const cols = await boss.$$eval('.gr-bracket .b-col', (cs) => cs.length);
  const routes = await boss.textContent('.gr-bracket');
  ok(cols === 4 && /Thắng → Preliminary/.test(routes) && /Thua → Bán kết/.test(routes) && /Thua → hạng 7/.test(routes), 'Vẽ 4 cột; mỗi trận ghi thắng / thua đi đâu');
  await play(id, t);
  await sleep(800);
  ok(t.status === 'finished', 'Đấu hết nhánh: giải kết thúc');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(700);
  const rows = await boss.$$eval('.gr-tab tbody tr', (rs) => rs.map((r) => r.firstElementChild.textContent));
  ok(rows.join(',') === '1,2,3,3,5,5,7,7', 'Bảng thứ hạng 1, 2, 3, 3, 5, 5, 7, 7');
  await boss.$eval('.gr-bracket', (e) => e.scrollIntoView()); await sleep(200);
  await shot(boss, 'ot-graph-afl8.png');

  // ---------- 3. Thang leo bậc kiểu KBO: Wild Card có trận tặng
  await tpl('kbo_ladder');
  const kid = await create();
  const k = app.hub.otGet(kid);
  await play(kid, k, 1);
  const st = k.st[1], wc = Object.values(st.matches).find((m) => m.gk === 'g0');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(700);
  await boss.click(`.b-match[data-mid="${wc.id}"]`); await sleep(500);
  const hint = await boss.textContent('.score-panel');
  ok(/tặng sẵn 1 trận thắng/.test(hint) && /ô trên đi tiếp/.test(hint) && /Trận hoà vẫn tính là đã đấu/.test(hint), 'Ô nhập loạt: nói rõ trận tặng, luật hoà loạt, trận hoà');
  await boss.fill('#ots-sets [data-set="0"][data-side="0"]', '2');
  await boss.fill('#ots-sets [data-set="0"][data-side="1"]', '2');
  await boss.click('#ots button.primary'); await sleep(1000);
  ok(wc.done && wc.winner === st.entrants[3], 'Hoà trận 1: hạng 4 đi tiếp');
  await shot(boss, 'ot-graph-kbo.png');

  // ---------- 4. Vòng vớt kiểu Olympic
  await tpl('judo_rep');
  ok(await boss.isChecked(S(0, 'repOn')) && await boss.inputValue(S(0, 'repFrom')) === 'r16' && /vòng vớt kiểu Olympic/.test(await desc()), 'Form: vòng vớt từ vòng 1/8, mô tả bằng lời');
  const jid = await create();
  const j = app.hub.otGet(jid);
  for (let g = 0; j.status === 'running' && !j.st[0].rep && g < 10; g++) {
    const st0 = j.st[0], so = app.hub.otSeedOf(j);
    for (const m of ST.playable(st0).filter((x) => !st0.rep && x.round < st0.rounds.length - 1)) { await send(jid, m.id, { winner: so(m.a) < so(m.b) ? m.a : m.b }); for (let q = 0; !m.done && q < 40; q++) await sleep(50); }
  }
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(700);
  const body = await boss.textContent('.ot-tab');
  ok(j.st[0].rep && (body.match(/Vòng vớt – phía/g) || []).length === 2 && /Tranh huy chương đồng/.test(body), 'Xong bán kết: hai nhánh vớt, trận tranh huy chương đồng');
  await play(jid, j);
  await sleep(800);
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(700);
  const pl = await boss.$$eval('.gr-tab tbody tr', (rs) => rs.map((r) => r.firstElementChild.textContent));
  ok(j.status === 'finished' && pl.filter((x) => x === '3').length === 2, 'Đấu hết: bảng hạng có hai hạng 3');
  await shot(boss, 'ot-graph-judo.png');
  await finish();
})();
