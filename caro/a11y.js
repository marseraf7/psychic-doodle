/*
 * Trợ năng (C5): chơi bằng bàn phím và chế độ không nhìn bàn (người dùng trình đọc màn hình).
 *  - Con trỏ bàn phím: bàn cờ nhận Tab (tabindex=0); khi bàn được chọn (hoặc bật "Luôn dùng phím mũi tên") thì
 *    mũi tên dời một khung viền tương phản cao trên ô, Enter / Space đánh vào ô đó (đúng lượt, đúng luật – CaroApp.tryPlay).
 *    Mỗi lần dời đọc tên ô qua vùng aria-live (#a11y-live), vd. "h8: ô trống". Xem lại ván: mũi tên vẫn tua nước như cũ.
 *  - Phím tắt trên bàn cờ: ? (bảng phím tắt), U (đi lại), F (quay bàn), A (phân tích), L (nước vừa đi), T (đe doạ),
 *    K (đọc ô đang chọn), B (chế độ không nhìn bàn). N (ván mới), C (về giữa), Ctrl+Z vẫn do board-input.js lo.
 *  - Chế độ không nhìn bàn: ẩn canvas, hiện khung #a11y-panel: trạng thái, danh sách nước đi, ô gõ lệnh (tên ô "h8"
 *    hoặc undo / new / last / list / threats / status / help – a11y-coords.js). Mọi nước mới (của mình, máy, đối thủ
 *    online) được đọc ra, kèm nước đe doạ (ô mà bên vừa đi đánh tiếp là thắng).
 *  - Cài đặt (localStorage 'caro.a11y'): hàng "Trợ năng" ở Cài đặt › Thêm mở hộp #a11y-dlg.
 * Chạy ở mọi kiểu ván: trên máy, với máy, online (đánh bằng CaroApp.tryPlay như khi bấm bàn cờ).
 *   window.CaroA11y = { open(), help(), setBlind(on), get settings(), cursor(), announce(text) }
 */
(function () {
  'use strict';
  const C = window.CaroA11yCoords;
  const app = () => window.CaroApp;
  const T = (k, a) => window.I18N.t(k, a);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'caro.a11y';
  const canvas = $('board');
  if (!C || !canvas) return;

  let set = { kb: false, blind: false, threats: true };
  try { set = { ...set, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* riêng tư */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) { /* riêng tư */ } };

  let cur = null; // [x, y] ô đang chọn
  let used = false; // đã dùng bàn phím / chế độ không nhìn bàn ở phiên này → đọc nước mới
  let seen = -1; // số nước đã đọc
  let kbMode = false; // đang dùng bàn phím (Tab / phím) – bấm chuột / chạm thì ẩn khung viền, không làm phiền người dùng chuột

  // ------------------------------------------------------------ Vùng đọc, khung con trỏ, khung không nhìn bàn
  const live = document.createElement('div');
  live.id = 'a11y-live'; live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  const ring = document.createElement('div');
  ring.id = 'a11y-cursor'; ring.hidden = true; ring.setAttribute('aria-hidden', 'true');
  const panel = document.createElement('section');
  panel.id = 'a11y-panel'; panel.hidden = true;
  document.body.append(live, ring, panel);
  canvas.tabIndex = 0;

  const boardOn = () => !document.body.classList.contains('shell-on');
  const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  /** Chỉ đọc khi đang ở bàn cờ (không đọc thông báo của trang khác – chuẩn giao diện). */
  function announce(text) {
    if (!text || !boardOn()) return;
    live.textContent = '';
    // Đổi nội dung ở khung hình sau để trình đọc màn hình đọc cả khi câu giống lần trước
    requestAnimationFrame(() => { live.textContent = text; });
    if (set.blind) { const s = panel.querySelector('.a11y-say'); if (s) s.textContent = text; }
  }
  const stoneName = (p) => (p === window.Caro.X ? 'X' : 'O');
  const moves = () => (app() && app().board ? app().board.moves : []);
  function cellText(x, y) {
    const p = app().board.get(x, y);
    return p ? T('a11y_cell_stone', { cell: C.name(x, y), p: stoneName(p) }) : T('a11y_cell_empty', { cell: C.name(x, y) });
  }
  function lastText() {
    const m = moves()[moves().length - 1];
    return m ? T('a11y_at', { p: stoneName(m.p), cell: C.name(m.x, m.y) }) : T('a11y_none');
  }
  function threatText(p) {
    const list = C.threats(window.Caro, app().board, p);
    return list.length ? T('a11y_threat', { p: stoneName(p), cells: list.map(([x, y]) => C.name(x, y)).join(', ') }) : '';
  }
  function threatsBoth() {
    const t = [window.Caro.X, window.Caro.O].map(threatText).filter(Boolean);
    return t.length ? t.join('. ') : T('a11y_no_threat');
  }
  const statusText = () => ($('turn') ? $('turn').textContent.replace(/\s+/g, ' ').trim() : '');
  const recentText = () => (moves().length ? T('a11y_recent', { list: moves().slice(-8).map((m) => stoneName(m.p) + ' ' + C.name(m.x, m.y)).join(', ') }) : T('a11y_none'));

  /** Vẽ khung viền lên ô đang chọn (theo toạ độ màn hình – bàn đã dời / phóng / quay vẫn đúng). */
  function placeRing() {
    const show = !!cur && boardOn() && !set.blind && (set.kb || (document.activeElement === canvas && kbMode));
    ring.hidden = !show;
    if (!show) return;
    const [sx, sy] = app().screenOf(cur[0], cur[1]);
    const [ax, ay] = app().screenOf(cur[0] + 1, cur[1]);
    const size = Math.max(12, Math.hypot(ax - sx, ay - sy));
    const r = canvas.getBoundingClientRect();
    ring.style.width = ring.style.height = size + 'px';
    ring.style.left = (r.left + sx - size / 2) + 'px';
    ring.style.top = (r.top + sy - size / 2) + 'px';
  }
  let raf = 0;
  function loop() { raf = 0; placeRing(); if (!ring.hidden) raf = requestAnimationFrame(loop); }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  function startCursor() {
    used = true;
    if (!cur) { const m = moves()[moves().length - 1]; cur = m ? [m.x, m.y] : [0, 0]; }
    kick();
  }
  function moveCursor(key, far) {
    startCursor();
    const unrot = app().unrot ? (a, b) => app().unrot(a, b) : null;
    for (let i = 0; i < (far ? 5 : 1); i++) cur = C.step(cur, key, unrot);
    app().show(cur[0], cur[1]);
    kick();
    announce(cellText(cur[0], cur[1]));
  }
  function playAt(x, y) {
    used = true;
    if (!app().tryPlay(x, y)) { announce(T('a11y_cant', { cell: C.name(x, y) })); return false; }
    cur = [x, y];
    kick();
    return true; // nước mới được đọc ở watch() như mọi nước khác
  }

  // ------------------------------------------------------------ Đọc nước mới (mình, máy, đối thủ online, xem ván)
  function watch() {
    if (!app() || !app().board) return;
    const list = moves();
    if (seen < 0 || list.length < seen) { seen = list.length; drawPanel(); return; } // lần đầu / ván mới / đi lại: không đọc lại cả ván
    if (list.length === seen) return;
    const fresh = list.slice(seen);
    seen = list.length;
    drawPanel();
    if (!(used || set.blind)) return;
    const last = fresh[fresh.length - 1];
    let text = fresh.map((m) => T('a11y_at', { p: stoneName(m.p), cell: C.name(m.x, m.y) })).join('. ');
    if (set.threats) { const th = threatText(last.p); if (th) text += '. ' + th; }
    setTimeout(() => { const st = statusText(); announce(st ? text + '. ' + st : text); }, 60); // chờ dòng lượt / kết quả cập nhật
  }
  setInterval(watch, 250);

  // ------------------------------------------------------------ Chế độ không nhìn bàn
  function drawPanel() {
    if (!set.blind) return;
    const list = moves();
    const ol = panel.querySelector('.a11y-moves');
    if (!ol) return;
    ol.innerHTML = list.map((m, i) => `<li>${i + 1}. ${stoneName(m.p)} ${esc(C.name(m.x, m.y))}</li>`).join('') || `<li>${esc(T('a11y_none'))}</li>`;
    ol.scrollTop = ol.scrollHeight;
    panel.querySelector('.a11y-status').textContent = statusText();
  }
  function buildPanel() {
    panel.innerHTML = `<h2 class="a11y-h">${esc(T('a11y_blind'))}</h2>
      <p class="a11y-status"></p>
      <form class="a11y-form" autocomplete="off"><label class="sr-only" for="a11y-cmd">${esc(T('a11y_input'))}</label>
        <input id="a11y-cmd" type="text" inputmode="text" placeholder="${esc(T('a11y_input'))}" spellcheck="false">
        <button type="submit" class="primary">${esc(T('a11y_play'))}</button></form>
      <p class="hint a11y-say" role="status"></p>
      <p class="hint">${esc(T('a11y_cmds'))}</p>
      <h3 class="a11y-h3">${esc(T('a11y_moves'))}</h3>
      <ol class="a11y-moves" aria-label="${esc(T('a11y_moves'))}"></ol>
      <div class="row"><button type="button" class="ghost" data-a11y="help">${esc(T('a11y_keys'))}</button>
        <button type="button" class="ghost" data-a11y="off">${esc(T('a11y_blind_btn'))}</button></div>`;
    panel.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const inp = $('a11y-cmd');
      run(inp.value);
      inp.value = '';
    };
    panel.querySelector('[data-a11y="help"]').onclick = help;
    panel.querySelector('[data-a11y="off"]').onclick = () => setBlind(false);
    drawPanel();
  }
  /** Lệnh gõ chữ (ô gõ lệnh của chế độ không nhìn bàn). */
  function run(text) {
    const c = C.command(text);
    if (!c) return announce(T('a11y_bad_cmd'));
    used = true;
    if (c.kind === 'move') return playAt(c.x, c.y);
    if (c.kind === 'undo') return $('btn-undo') && $('btn-undo').click();
    if (c.kind === 'new') return app().openNewGame();
    if (c.kind === 'last') return announce(lastText());
    if (c.kind === 'list') return announce(recentText());
    if (c.kind === 'threats') return announce(threatsBoth());
    if (c.kind === 'status') return announce(statusText());
    if (c.kind === 'help') return help();
  }
  function setBlind(on) {
    set.blind = !!on;
    save();
    document.body.classList.toggle('a11y-blind', set.blind);
    panel.hidden = !set.blind;
    if (set.blind) { used = true; buildPanel(); } else panel.innerHTML = '';
    placeRing();
    announce(T(set.blind ? 'a11y_blind_on' : 'a11y_blind_off'));
    if (set.blind && boardOn()) setTimeout(() => $('a11y-cmd') && $('a11y-cmd').focus(), 50);
    else if (!set.blind && boardOn()) canvas.focus();
  }

  // ------------------------------------------------------------ Hộp Cài đặt trợ năng + bảng phím tắt
  function dialog(id) {
    let d = $(id);
    if (!d) { d = document.createElement('dialog'); d.id = id; document.body.appendChild(d); }
    return d;
  }
  const SHORTCUTS = [['← ↑ → ↓', 'a11y_k_move'], ['Enter / Space', 'a11y_k_place'], ['U · Ctrl+Z', 'a11y_k_undo'], ['N', 'a11y_k_new'],
    ['F', 'a11y_k_flip'], ['A', 'a11y_k_an'], ['C', 'a11y_k_center'], ['L', 'a11y_k_last'], ['T', 'a11y_k_threat'], ['K', 'a11y_k_cell'],
    ['B', 'a11y_k_blind'], ['?', 'a11y_k_help']];
  function help() {
    const d = dialog('a11y-help');
    d.innerHTML = `<div class="dlg"><h2>${esc(T('a11y_keys'))}</h2>
      <table class="a11y-keys"><tbody>${SHORTCUTS.map(([k, t]) => `<tr><th scope="row"><kbd>${esc(k)}</kbd></th><td><span>${esc(T(t))}</span></td></tr>`).join('')}</tbody></table>
      <p class="hint">${esc(T('a11y_coords'))}</p>
      <div class="row"><button type="button" class="ghost" data-a11y="set">${esc(T('a11y_title'))}</button>
        <button type="button" class="primary" data-a11y="close">${esc(T('close'))}</button></div></div>`;
    d.querySelector('[data-a11y="close"]').onclick = () => d.close();
    d.querySelector('[data-a11y="set"]').onclick = () => { d.close(); open(); };
    if (!d.open) d.showModal();
    d.querySelector('[data-a11y="close"]').focus();
  }
  function open() {
    const d = dialog('a11y-dlg');
    const row = (name, t, desc) => `<label class="a11y-opt"><input type="checkbox" name="${name}"${set[name] ? ' checked' : ''}>
      <span><b>${esc(T(t))}</b>${desc ? `<small>${esc(T(desc))}</small>` : ''}</span></label>`;
    d.innerHTML = `<form method="dialog" class="dlg"><h2>${esc(T('a11y_title'))}</h2>
      ${row('kb', 'a11y_kb', 'a11y_kb_d')}${row('blind', 'a11y_blind', 'a11y_blind_d')}${row('threats', 'a11y_threats')}
      <p class="hint">${esc(T('a11y_coords'))}</p>
      <div class="row"><button type="button" class="ghost" data-a11y="help">${esc(T('a11y_keys'))}</button>
        <button type="submit" class="primary">${esc(T('close'))}</button></div></form>`;
    d.querySelector('form').onchange = (e) => {
      const el = e.target;
      if (el.name === 'blind') return setBlind(el.checked);
      set[el.name] = el.checked;
      save();
      placeRing();
    };
    d.querySelector('[data-a11y="help"]').onclick = () => { d.close(); help(); };
    if (!d.open) d.showModal();
  }
  const btn = $('set-a11y');
  if (btn) btn.onclick = open;

  // ------------------------------------------------------------ Phím (chạy trước board-input.js: bắt ở pha capture)
  window.addEventListener('keydown', (e) => {
    if (!app() || !boardOn() || document.querySelector('dialog[open]') || typing() || e.altKey) return;
    if (e.ctrlKey || e.metaKey) return; // Ctrl+Z: board-input.js
    const st = app();
    const cursorOn = set.kb || set.blind || document.activeElement === canvas;
    const k = e.key;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    // Gõ phím trên bàn đang được chọn (kể cả khi bàn được chọn bằng chuột trước đó): bật chế độ bàn phím, có ô đang chọn
    if (cursorOn && !st.replay && (/^Arrow/.test(k) || k === 'Enter' || k === ' ') && (document.activeElement === canvas || set.kb || set.blind)) { kbMode = true; if (!cur) startCursor(); }
    if (/^Arrow/.test(k) && cursorOn && !st.replay) { stop(); return moveCursor(k, e.shiftKey); }
    if ((k === 'Enter' || k === ' ') && cursorOn && !st.replay && document.activeElement !== document.body && document.activeElement !== canvas) return; // nút đang được chọn: để nút tự xử lý
    if ((k === 'Enter' || k === ' ') && cursorOn && !st.replay && cur) { stop(); return playAt(cur[0], cur[1]); }
    const act = {
      '?': help,
      u: () => $('btn-undo') && $('btn-undo').click(),
      f: () => st.rotateBoard(),
      a: () => $('btn-analyze') && $('btn-analyze').click(),
      l: () => { used = true; announce(lastText()); },
      t: () => { used = true; announce(threatsBoth()); },
      k: () => { startCursor(); announce(cellText(cur[0], cur[1])); },
      b: () => setBlind(!set.blind),
    }[k.length === 1 ? k.toLowerCase() : k];
    if (act && !(st.replay && k !== '?')) { stop(); act(); }
  }, true);
  // Chọn bàn bằng Tab (focus-visible) mới hiện khung + đọc ô; bấm chuột vào bàn chỉ là đánh như thường
  canvas.addEventListener('focus', () => { if (!canvas.matches(':focus-visible')) return; kbMode = true; startCursor(); announce(cellText(cur[0], cur[1])); });
  window.addEventListener('pointerdown', () => { if (kbMode) { kbMode = false; placeRing(); } }, true);
  canvas.addEventListener('blur', placeRing);
  window.addEventListener('caro:page', () => { live.textContent = ''; setTimeout(placeRing, 0); }); // trang khác: bỏ thông báo cũ của bàn cờ
  window.addEventListener('langchange', () => { if (set.blind) buildPanel(); });
  if (set.blind) { document.body.classList.add('a11y-blind'); panel.hidden = false; buildPanel(); }

  window.CaroA11y = {
    open, help, setBlind, announce, run,
    get settings() { return { ...set }; },
    cursor: () => (cur ? [...cur] : null),
  };
})();
