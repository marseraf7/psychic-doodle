/*
 * Kiểm thử trình duyệt – đợt 23 (chỉ mô phỏng thể thức):
 *   1. Mẫu BLAST Groups: GSL không loại ai, gauntlet chéo bảng, nhãn đích "Showdown"; mô tả bằng lời.
 *   2. Mẫu EVO: giai đoạn pool loại kép; tạo + bắt đầu → trang xem có 4 pool, nhánh thắng / nhánh thua.
 *   3. Mẫu TFT: xếp lại lobby sau mỗi 2 trận; mô tả.
 *   4. Mẫu ALGS: cấm Legend + draft POI trong form; bắt đầu → chọn POI trên trang xem (máy chủ ghi), ô nhập Legend.
 *   node caro/tests/e2e/otour-esports2.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8849;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_esp2', 1100);
  const S = (i, k) => `#otf-stages [data-i="${i}"][data-k="${k}"]`;
  const desc = () => boss.textContent('#otf-desc');
  const tpl = async (id) => { await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300); await boss.click(`.tpl-card[data-id="${id}"]`); await sleep(500); };
  const create = async () => {
    await boss.click('[data-act="otTplTeams"]'); await sleep(400);
    await boss.click('#otf button.primary.wide'); await sleep(1200);
    const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
    await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
    await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(700);
    return app.hub.otGet(id);
  };

  // ---------- 1. BLAST Groups
  await tpl('blast_groups');
  ok(await boss.isChecked(S(0, 'gslKeep')) && await boss.inputValue(S(1, 'shape')) === 'cross9' && await boss.inputValue(S(1, 'exitLabel')) === 'Showdown', 'BLAST: GSL không loại ai, gauntlet chéo bảng, nhãn Showdown');
  ok(/không loại ai/.test(await desc()) && /đội không đi tiếp ra Showdown/.test(await desc()), 'Mô tả BLAST Groups');

  // ---------- 2. EVO
  await tpl('evo_pools');
  ok(await boss.inputValue(S(0, 'type')) === 'pools' && await boss.inputValue(S(0, 'pool')) === '16' && await boss.inputValue(S(0, 'poolOut')) === '2', 'EVO: pool 16 người, 2 suất mỗi nhánh');
  ok(/chia pool loại kép 16 người, mỗi pool 2 suất nhánh thắng \+ 2 suất nhánh thua/.test(await desc()), 'Mô tả EVO');
  const evo = await create();
  ok(evo.st[0].type === 'pools' && evo.st[0].groups.length === 4, 'Máy chủ dựng 4 pool');
  const body = await boss.textContent('.ot-tab');
  ok(/Pool A/.test(body) && /Pool D/.test(body) && /Mỗi pool đấu loại kép/.test(body), 'Trang xem: các pool và ghi chú');
  await shot(boss, 'ot-esp2-evo.png');

  // ---------- 3. TFT
  await tpl('tft_crown');
  ok(await boss.inputValue(S(0, 'reseed')) === '2', 'TFT: xếp lại lobby sau mỗi 2 trận');
  ok(/xếp lại lobby theo bảng điểm sau mỗi 2 trận/.test(await desc()), 'Mô tả TFT');

  // ---------- 4. ALGS
  await tpl('algs_pro');
  ok(await boss.isChecked(S(0, 'legendBan')) && await boss.isChecked(S(0, 'poiOn')) && /^Map 1: POI 1, POI 2/.test(await boss.inputValue(S(0, 'poiMaps'))), 'ALGS: cấm Legend, draft POI');
  await boss.fill(S(0, 'poiMaps'), 'Map 1: Alpha, Beta, Gamma\nMap 2: X, Y');
  await boss.dispatchEvent(S(0, 'poiMaps'), 'change'); await sleep(400);
  ok(/draft điểm hạ cánh trên 2 bản đồ/.test(await desc()), 'Mô tả: 2 bản đồ sau khi sửa');
  const algs = await create();
  ok(algs.st[0].cfg.poi.maps.length === 2 && algs.st[0].cfg.legendBan, 'Máy chủ nhận cấu hình POI + cấm Legend');
  ok(/Điểm hạ cánh/.test(await boss.textContent('.ot-tab')) && /Legend bị cấm/.test(await boss.textContent('.ot-tab')), 'Trang xem: điểm hạ cánh, Legend bị cấm');
  const sel = 'select[data-poi-map="0"]';
  const team = await boss.getAttribute(sel, 'data-poi-team');
  await boss.selectOption(sel, 'Beta'); await sleep(800);
  ok(algs.st[0].poi && algs.st[0].poi[0][team] === 'Beta', 'Chọn POI → máy chủ ghi');
  ok((await boss.$$('input.r-pick')).length > 0, 'Ô nhập Legend trong khung nhập kết quả');
  await shot(boss, 'ot-esp2-algs.png');
  await finish();
})();
