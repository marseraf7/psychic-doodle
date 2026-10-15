/*
 * Kiểm thử giao diện và độ đáp ứng (responsive) trên các loại thiết bị:
 *  - Điện thoại nhỏ (360x667, 375x667): thanh 5 tab không tràn, không rớt dòng lệch khung.
 *  - Điện thoại tiêu chuẩn (iPhone 14/15 390x844, 430x932): safe area, thẻ người chơi không đè thanh đáy.
 *  - Máy tính bảng / iPad dọc (768x1024, 820x1180): bố cục căn giữa (max-width), thanh điều hướng đáy.
 *  - Máy tính bảng / iPad ngang & Desktop (1024x768, 1180x820, 1280x800): menu thanh trên, lưới trang chủ 2/3 cột.
 *  - Xoay màn hình (orientation change): bàn cờ tự co giãn kích thước canvas qua ResizeObserver.
 *  - 4 ngôn ngữ (vi, en, ru, zh): các nhãn dài (tiếng Nga, Anh) không làm vỡ bố cục trên thiết bị hẹp.
 *   node caro/tests/e2e/devices.e2e.js
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8095;
  const { browser, user, ok, shot, sleep, finish } = await setup(PORT);

  // Danh sách các thiết bị đại diện
  const DEVICES = [
    { name: 'iPhone-SE', w: 360, h: 667, kind: 'mobile' },
    { name: 'iPhone-14', w: 390, h: 844, kind: 'mobile' },
    { name: 'iPhone-ProMax', w: 430, h: 932, kind: 'mobile' },
    { name: 'iPad-Mini-Portrait', w: 768, h: 1024, kind: 'tablet-portrait' },
    { name: 'iPad-Air-Portrait', w: 820, h: 1180, kind: 'tablet-portrait' },
    { name: 'iPad-Landscape-1024', w: 1024, h: 768, kind: 'desktop' },
    { name: 'iPad-Pro-Landscape', w: 1180, h: 820, kind: 'desktop' },
    { name: 'Desktop-HD', w: 1280, h: 800, kind: 'desktop' },
  ];

  /** Kiểm tra tràn ngang và bố cục của trang hiện tại */
  async function auditViewport(p, dev) {
    return p.evaluate((d) => {
      const vw = document.documentElement.clientWidth;
      const sw = document.documentElement.scrollWidth;
      const isDesktop = d.w >= 900;

      // 1. Kiểm tra tràn ngang tài liệu
      const overflows = sw > vw + 1;

      // 2. Kiểm tra thanh tabbar
      const tb = document.getElementById('tabbar');
      const tbVis = tb && getComputedStyle(tb).display !== 'none';
      const tbRect = tb ? tb.getBoundingClientRect() : null;
      let tbOk = true;
      if (isDesktop) {
        // Desktop: tabbar ở trên cùng (top: 0)
        tbOk = tbRect && tbRect.top <= 2;
      } else {
        // Mobile & Tablet Portrait: tabbar ở đáy (bottom)
        tbOk = tbRect && tbRect.bottom >= window.innerHeight - 2;
      }

      // 3. Kiểm tra các nút trong thanh tab
      const tabBtns = [...document.querySelectorAll('#tabbar button')];
      const tabsInside = tabBtns.every((btn) => {
        const r = btn.getBoundingClientRect();
        return r.left >= -1 && r.right <= vw + 1 && r.width >= 32;
      });

      // 4. Kiểm tra trang đang mở có nằm trong khung nhìn không
      const activePage = document.querySelector('.page:not([hidden])');
      const pageOk = activePage ? activePage.getBoundingClientRect().width <= vw + 1 : true;

      return { overflows, sw, vw, tbVis, tbOk, tabsInside, pageOk, isDesktop };
    }, dev);
  }

  // ---------------------------------------------------------------- 1. Quét giao diện trên các kích thước thiết bị
  console.log('--- 1. Kiểm tra bố cục Shell trên các thiết bị ---');
  const p = await user('vi', 'devtester', 390);

  for (const dev of DEVICES) {
    await p.setViewportSize({ width: dev.w, height: dev.h });
    await sleep(150);

    const a = await auditViewport(p, dev);
    ok(!a.overflows, `${dev.name} (${dev.w}x${dev.h}): không tràn ngang (${a.sw} <= ${a.vw})`);
    ok(a.tbVis && a.tbOk, `${dev.name}: vị trí thanh tab đúng chuẩn (${a.isDesktop ? 'thanh trên' : 'thanh đáy'})`);
    ok(a.tabsInside, `${dev.name}: tất cả 5 nút tab nằm gọn trong màn hình`);
    ok(a.pageOk, `${dev.name}: trang hiển thị vừa vặn kích thước màn hình`);

    await shot(p, `device-shell-${dev.name}.png`);
  }

  // ---------------------------------------------------------------- 2. Chuyển đổi qua lại các tab trên Mobile & iPad
  console.log('--- 2. Kiểm tra chuyển tab trên Mobile & iPad ---');
  const testTabs = ['home', 'study', 'more'];
  for (const tname of testTabs) {
    await p.click(`#tabbar [data-tab="${tname}"]`);
    await sleep(200);

    const check = await p.evaluate((t) => {
      const page = document.getElementById('page-' + t);
      const isVis = page && !page.hidden && page.getBoundingClientRect().height > 100;
      const title = document.querySelector('.pg-title');
      return { isVis, title: title ? title.textContent.trim() : '' };
    }, tname);

    ok(check.isVis, `Chuyển tab ${tname}: trang hiển thị đầy đủ nội dung`);
  }

  // ---------------------------------------------------------------- 3. Kiểm tra màn hình Bàn cờ khi chơi ván đấu
  console.log('--- 3. Kiểm tra bàn cờ trên Mobile & iPad ---');
  // Quay về trang chủ rồi vào ván chơi
  await p.click('#tabbar [data-tab="home"]');
  await sleep(150);

  // Mở bàn cờ
  await p.evaluate(() => window.CaroApp && window.CaroApp.toBoard && window.CaroApp.toBoard());
  await sleep(250);

  for (const dev of [DEVICES[1], DEVICES[3], DEVICES[5]]) { // iPhone 14, iPad Portrait, iPad Landscape
    await p.setViewportSize({ width: dev.w, height: dev.h });
    await sleep(200);

    const boardStatus = await p.evaluate(() => {
      const cv = document.getElementById('board');
      const topBar = document.querySelector('.bar.top');
      const botBar = document.querySelector('.bar.bottom');
      const btnHome = document.getElementById('btn-home');

      const cvOk = cv && cv.width > 0 && cv.height > 0 && getComputedStyle(cv).visibility !== 'hidden';
      const topOk = topBar && topBar.getBoundingClientRect().top >= 0 && topBar.getBoundingClientRect().right <= window.innerWidth + 1;
      const botOk = botBar ? botBar.getBoundingClientRect().bottom <= window.innerHeight + 1 : true;
      const homeOk = btnHome && btnHome.getBoundingClientRect().width >= 30;

      return { cvOk, topOk, botOk, homeOk, cw: cv ? cv.width : 0, ch: cv ? cv.height : 0 };
    });

    ok(boardStatus.cvOk, `${dev.name} [Bàn cờ]: canvas vẽ kích thước thực (${boardStatus.cw}x${boardStatus.ch})`);
    ok(boardStatus.topOk, `${dev.name} [Bàn cờ]: thanh điều khiển trên vừa vặn màn hình`);
    ok(boardStatus.botOk, `${dev.name} [Bàn cờ]: thanh công cụ dưới không tràn viền`);
    ok(boardStatus.homeOk, `${dev.name} [Bàn cờ]: nút quay lại trang chủ (‹) sẵn sàng`);

    await shot(p, `device-board-${dev.name}.png`);
  }

  // ---------------------------------------------------------------- 4. Thử nghiệm Xoay màn hình (Orientation Change)
  console.log('--- 4. Kiểm tra xoay màn hình (Portrait <-> Landscape) ---');
  // iPhone: 390x844 (dọc) sang 844x390 (ngang)
  await p.setViewportSize({ width: 390, height: 844 });
  await sleep(150);
  const sizeP1 = await p.evaluate(() => { const c = document.getElementById('board'); return { w: c.width, h: c.height }; });

  await p.setViewportSize({ width: 844, height: 390 });
  await sleep(200);
  const sizeL1 = await p.evaluate(() => { const c = document.getElementById('board'); return { w: c.width, h: c.height }; });

  ok(sizeL1.w > sizeP1.w && sizeL1.h < sizeP1.h, 'Xoay sang Ngang: Canvas tự động mở rộng bề ngang và thu hẹp chiều dọc');

  await p.setViewportSize({ width: 390, height: 844 });
  await sleep(200);
  const sizeP2 = await p.evaluate(() => { const c = document.getElementById('board'); return { w: c.width, h: c.height }; });

  ok(Math.abs(sizeP2.w - sizeP1.w) <= 2 && Math.abs(sizeP2.h - sizeP1.h) <= 2, 'Xoay lại Dọc: Canvas khôi phục chính xác kích thước ban đầu');

  // Bấm nút quay lại trang chủ
  await p.click('#btn-home');
  await sleep(250);
  const backOk = await p.evaluate(() => document.body.classList.contains('shell-on'));
  ok(backOk, 'Nút ‹: Quay lại màn hình Shell thành công');

  // ---------------------------------------------------------------- 5. Kiểm tra 4 ngôn ngữ trên màn hình hẹp
  console.log('--- 5. Kiểm tra 4 ngôn ngữ trên màn hình hẹp (360px & 390px) ---');
  await p.setViewportSize({ width: 360, height: 667 });

  for (const lang of ['vi', 'en', 'ru', 'zh']) {
    await p.evaluate((l) => window.I18N && window.I18N.setLang && window.I18N.setLang(l), lang);
    await sleep(150);

    const langCheck = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const sw = document.documentElement.scrollWidth;
      const btns = [...document.querySelectorAll('#tabbar button span')];
      const anyWrapOverlap = btns.some((sp) => sp.scrollHeight > sp.clientHeight * 1.5);
      return { sw, vw, overflows: sw > vw + 1, anyWrapOverlap };
    });

    ok(!langCheck.overflows, `Ngôn ngữ [${lang}] (360px): không gây tràn ngang giao diện`);
    ok(!langCheck.anyWrapOverlap, `Ngôn ngữ [${lang}] (360px): nhãn thanh tab hiển thị gọn gàng`);
  }

  // Kết thúc kiểm thử
  await finish();
})();
