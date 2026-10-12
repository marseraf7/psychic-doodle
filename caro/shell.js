/*
 * Khung trang kiểu Lichess: 5 tab (Trang chủ · Câu đố · Học tập · Xem · Xem thêm) và các trang con (Cài đặt).
 * Điện thoại: thanh tab dưới đáy; màn hình rộng: menu chữ trên cùng (shell.css).
 *
 * Bàn cờ (canvas) luôn nằm dưới khung. Khung hiện = đang ở trang; khung ẩn = đang chơi / xem ván.
 *   - Khi một module đưa người chơi vào bàn cờ (ván mới, vào phòng, xem lại, giải đố…), app.js phát sự kiện
 *     'caro:board' → khung ẩn đi.
 *   - Nút ‹ trên thanh trên của bàn cờ (#btn-home) đưa người chơi về trang đang xem dở.
 *
 * Hộp thoại "chuyển thành trang": các module cũ vẫn gọi showModal() / close() / .open của hộp thoại như trước
 * (online.js, study.js, learn.js…). proxy() chuyển nội dung hộp thoại vào trang và đổi showModal() thành "mở trang",
 * close() thành "trang đóng" (vẫn phát sự kiện 'close', thuộc tính open vẫn đúng) – không phải sửa các module đó.
 *
 * Mỗi lần đổi trang phát sự kiện 'caro:page' (detail: { id } – id null khi khung ẩn).
 * API: window.CaroShell = { go, hide, show, open(tab), get visible, get current }
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const shell = $('shell');
  const body = document.body;
  const pages = {}; // id -> { el, parent, dlg }
  document.querySelectorAll('#shell .page').forEach((el) => { pages[el.dataset.page] = { el, parent: el.dataset.parent || null, dlg: null }; });
  const TABS = ['home', 'puzzles', 'learn', 'watch', 'more'];
  const tabOf = (id) => (pages[id] && pages[id].parent) || id;

  let cur = null; // trang đang hiện
  let last = 'home'; // trang xem gần nhất (để nút ‹ trên bàn cờ quay về)
  let visible = false;

  const emit = (id) => window.dispatchEvent(new CustomEvent('caro:page', { detail: { id } }));

  /** Đóng hộp thoại "đã chuyển thành trang" của trang id (nếu đang mở). */
  function closeProxy(id) {
    const d = id && pages[id] && pages[id].dlg;
    if (d && d.hasAttribute('open')) d.close();
  }

  /** Hiện trang id (mở khung nếu đang ẩn). */
  function go(id) {
    if (!pages[id]) id = 'home';
    if (cur !== id) closeProxy(cur);
    cur = last = id;
    body.dataset.page = id;
    for (const [k, p] of Object.entries(pages)) p.el.hidden = k !== id;
    const tab = tabOf(id);
    document.querySelectorAll('#tabbar [data-tab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === tab);
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (!visible) {
      visible = true;
      shell.hidden = false;
      body.classList.add('shell-on');
    }
    pages[id].el.querySelector('.pg-body')?.scrollTo?.(0, 0);
    emit(id);
  }

  /** Ẩn khung, về bàn cờ. */
  function hide() {
    if (!visible) return;
    closeProxy(cur);
    visible = false;
    cur = null;
    delete body.dataset.page;
    shell.hidden = true;
    body.classList.remove('shell-on');
    emit(null);
    if (window.CaroApp) window.CaroApp.resize();
  }

  /** Mở một tab theo đúng cách của module sở hữu (để nội dung được vẽ mới). */
  const OPEN = {
    home: () => window.CaroHome && window.CaroHome.open(),
    puzzles: () => window.CaroStudy && window.CaroStudy.openPuzzles(),
    learn: () => window.CaroLearn && window.CaroLearn.open(),
  };
  function open(tab) {
    try { if (OPEN[tab]) OPEN[tab](); } catch (e) { /* vẫn mở trang */ }
    if (!visible || cur !== tab) go(tab);
  }

  /**
   * Chuyển nội dung hộp thoại dlgId vào trang pageId và đổi cách mở / đóng của hộp thoại.
   * Nội dung lấy từ .dlg (bỏ phần đầu có nút ✕), hoặc cả <form> nếu hộp thoại là một form.
   * Tiêu đề trang: từ h2 trong phần đầu hộp thoại, hoặc khoá dịch titleKey.
   */
  function proxy(dlgId, pageId, titleKey) {
    const d = $(dlgId), p = pages[pageId];
    if (!d || !p) return;
    const box = d.querySelector('.dlg') || d.querySelector('form');
    const h2 = d.querySelector('.dlg-head h2');
    if (p.el.children.length === 0) {
      const head = document.createElement('header');
      head.className = 'pg-head';
      head.innerHTML = `<button type="button" class="pg-back" data-pg-back hidden aria-label="${window.I18N.t('back')}"><svg class="ico" aria-hidden="true"><use href="#i-chevl"/></svg></button><h1 class="pg-title"></h1><span class="pg-right"></span>`;
      head.querySelector('[data-pg-back]').hidden = !p.parent;
      const title = head.querySelector('.pg-title');
      if (h2) { title.innerHTML = h2.innerHTML; }
      else if (titleKey) { title.dataset.i18n = titleKey; title.textContent = window.I18N.t(titleKey); }
      const pb = document.createElement('div');
      pb.className = 'pg-body';
      if (box && box.tagName === 'FORM') pb.appendChild(box);
      else if (box) [...box.children].forEach((c) => { if (!c.classList.contains('dlg-head')) pb.appendChild(c); });
      p.el.append(head, pb);
    }
    p.dlg = d;
    d.classList.add('proxied');
    const openIt = () => {
      if (!d.hasAttribute('open')) d.setAttribute('open', '');
      if (cur !== pageId || !visible) go(pageId);
    };
    d.showModal = openIt;
    d.show = openIt;
    d.close = () => {
      if (!d.hasAttribute('open')) return;
      d.removeAttribute('open');
      d.dispatchEvent(new Event('close'));
    };
  }

  // ---------------------------------------------------------------- Nút
  document.querySelectorAll('#tabbar [data-tab]').forEach((b) => { b.onclick = () => open(b.dataset.tab); });
  // Nút ‹ của trang con: về trang cha (trang con tự xử lý bước lùi bên trong trước – xem settings-ui.js)
  shell.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pg-back]');
    if (!b) return;
    const page = b.closest('.page');
    const ev = new CustomEvent('caro:back', { cancelable: true, detail: { id: page.dataset.page } });
    if (!window.dispatchEvent(ev)) return; // trang con đã tự lùi một bước
    open(pages[page.dataset.page].parent || 'home');
  });
  // Liên kết "đi tới tab" ở bất kỳ đâu: data-tab-go="learn"
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab-go]');
    if (b) open(b.dataset.tabGo);
  });

  // Nút ‹ trên bàn cờ: thoát chế độ đang có (giải đố, xem lại, đang xem ván người khác) rồi về trang.
  $('btn-home').onclick = () => {
    const A = window.CaroApp;
    if (A.ext && A.ext.onExit) A.ext.onExit();
    else if (A.replay) A.closeReplay();
    else if (A.watching && window.CaroWatch) window.CaroWatch.stopWatching();
    open(TABS.includes(tabOf(last)) ? last : 'home');
  };

  // Vào bàn cờ: khung ẩn đi
  window.addEventListener('caro:board', hide);

  // Hộp thoại cũ chuyển thành trang (bảng Online → Trang chủ: home.js)
  proxy('puzzle-dlg', 'puzzles');
  proxy('learn-dlg', 'learn');
  proxy('settings', 'settings', 'settings');

  /**
   * Nút Back (Android – native.js): trang con → trang cha; tab khác → Trang chủ; Trang chủ → bàn cờ.
   * Trả về true nếu đã xử lý (khung đang ẩn thì không xử lý: Back trên bàn cờ do native.js lo).
   */
  function back() {
    if (!visible) return false;
    const ev = new CustomEvent('caro:back', { cancelable: true, detail: { id: cur } });
    if (!window.dispatchEvent(ev)) return true; // trang con của Cài đặt tự lùi một bước
    if (pages[cur].parent) open(pages[cur].parent);
    else if (cur !== 'home') open('home');
    else hide();
    return true;
  }

  window.CaroShell = {
    go, hide, open, proxy, back,
    show: () => open(TABS.includes(tabOf(last)) ? last : 'home'),
    get visible() { return visible; },
    get current() { return cur; },
  };
})();
