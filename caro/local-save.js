/*
 * Lưu ván vào Lịch sử đấu trên máy này (kho: local-games.js, danh sách: local-history.js).
 *   Ván nào được lưu trên máy:
 *     - ván với máy / 2 người trên một máy (không bao giờ lên máy chủ) và ván online chơi bằng tài khoản khách (máy chủ
 *       chỉ lưu ván của tài khoản): theo cài đặt "Hỏi trước khi lưu" (ask) – hỏi, hoặc tự lưu;
 *     - ván online của tài khoản đã đăng nhập (máy chủ đã lưu – thẻ Online): theo cài đặt "Ván online của tài khoản"
 *       (online) – 'off' không lưu trên máy | 'all' tự lưu tất cả | 'ask' hỏi từng ván.
 *   Hết ván → thêm vào danh sách ván chờ (caro.lg.pending). Người chơi thoát ván (ván mới trên máy, rời phòng, về trang,
 *   mở lại app) → hỏi một lần cho mọi ván chờ, mỗi ván một ô chọn ("tuỳ ván"). Không bao giờ hỏi khi đang có ván online
 *   diễn ra (tái đấu / ván sau của loạt Bo3: chờ tới lúc rời phòng). Bấm Esc / chạm ra ngoài: giữ ván chờ, hỏi lại lần sau.
 *   "Đi lại" sau khi hết ván (kết quả bị huỷ) → bỏ ván đó khỏi danh sách chờ / khỏi kho nếu đã tự lưu.
 *   Phân tích ván (study.js phát 'caro:analyzed') → lưu kèm kết quả vào ván đã lưu / ván chờ: mở lại không phải phân tích lại.
 * API: window.CaroLocalSave = { capture(rec), exitGame(), valueText(), pending }
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  const L = window.CaroLocalHist;
  const LG = window.CaroLocalGames;
  if (!L) return;
  const T = window.I18N.t;
  const esc = window.CaroApp.esc;
  const $ = (id) => document.getElementById(id);
  const store = L.store;
  const toast = (m, ms) => N && N.toast(m, ms);
  const changed = () => window.dispatchEvent(new CustomEvent('caro:localhist'));

  let pend = store.pending(); // các ván vừa xong chờ hỏi (còn từ lần mở app trước thì hỏi khi vào trang đầu tiên)
  const setPend = (list) => { pend = list; store.setPending(list); };
  let asking = []; // các ván đang hiện trong hộp thoại hỏi
  // Ván trên máy vừa xong: { at, id (nếu đã tự lưu) } – để "Đi lại" huỷ đúng ván đó. Giữ trong localStorage: tải lại trang
  // (ván đã xong vẫn trên bàn) rồi mới đi lại vẫn tìm đúng ván, không đoán theo nước đi (2 ván có thể trùng nước đi).
  const LAST = 'caro.lg.last';
  let lastLocal = null;
  try { lastLocal = JSON.parse(localStorage.getItem(LAST) || 'null'); } catch (e) { /* riêng tư */ }
  const setLast = (v) => { lastLocal = v; try { if (v) localStorage.setItem(LAST, JSON.stringify(v)); else localStorage.removeItem(LAST); } catch (e) { /* riêng tư */ } };

  /** Ván online của tài khoản (máy chủ đã lưu) hay ván chỉ có trên máy. */
  const isAccount = (rec) => rec.kind === 'online' && !!rec.account;
  /** Ván này nên: 'save' tự lưu | 'ask' hỏi | 'skip' bỏ – theo cài đặt hiện tại. */
  function mode(rec) {
    const set = store.settings();
    if (!set.on) return 'skip';
    if (isAccount(rec)) return set.online === 'all' ? 'save' : set.online === 'ask' ? 'ask' : 'skip';
    return set.ask ? 'ask' : 'save';
  }

  function save(list, quiet) {
    let n = 0, full = false;
    for (const rec of list) { if (store.add(rec)) n++; else full = true; }
    if (full) toast(T('lh_full'), 4500);
    if (n) { if (!quiet) toast(n > 1 ? T('lh_saved_n', { n }) : T('lh_saved')); changed(); }
    return n;
  }

  /** Ván vừa xong. */
  function capture(rec) {
    if (!LG.valid(rec)) return;
    const m = mode(rec);
    const local = rec.kind !== 'online';
    if (local) setLast({ at: rec.at, id: null });
    if (m === 'skip') return;
    if (m === 'save') {
      const id = store.add(rec);
      if (!id) toast(T('lh_full'), 4500);
      else { changed(); if (local) setLast({ at: rec.at, id }); }
      return;
    }
    setPend(pend.filter((p) => p.at !== rec.at).concat([rec]));
  }

  /** Đang có ván online diễn ra (đủ 2 người, chưa hết ván): không hỏi lúc này. */
  function busy() {
    const r = N && N.state.room;
    return !!(r && window.CaroApp.online && !window.CaroApp.watching && r.players.length === 2 && !r.winner);
  }

  /** Người chơi rời ván: có ván chờ thì hỏi lưu (một lần cho mọi ván chờ). */
  function exitGame() {
    if (!pend.length || asking.length || $('lh-ask').open || busy()) return; // đang hỏi dở: không hỏi chồng
    const auto = pend.filter((r) => mode(r) === 'save');
    const ask = pend.filter((r) => mode(r) === 'ask');
    if (auto.length) save(auto, true);
    setPend(ask);
    if (!ask.length) return;
    asking = ask;
    open(ask);
  }

  /** Dòng đầu của câu hỏi: vì sao các ván này chưa có trong lịch sử online. */
  function why(list) {
    if (list.every(isAccount)) return T('lh_ask_account');
    if (!N || !N.connected) return T('lh_ask_offline');
    if (!N.state.me || N.state.me.guest) return T('lh_ask_guest');
    return T('lh_ask_local');
  }

  function open(list) {
    const many = list.length > 1;
    $('lh-ask-why').textContent = why(list);
    $('lh-ask-q').textContent = many ? T('lh_ask_q_n', { n: list.length }) : T('lh_ask_q');
    $('lh-ask-pick').hidden = !many;
    $('lh-ask-list').innerHTML = list.map((rec, i) => {
      const d = L.describe(rec);
      const box = many ? `<input type="checkbox" class="lh-pick" data-ask="${i}" checked aria-label="${esc(d.opp)}">` : '';
      return `<li>${box}<span class="res ${esc(d.cls)}">${esc(d.res)}</span>
        <div class="pn"><b>${esc(d.opp)}</b><small>${esc(L.when(rec.at))} · ${esc(T('lh_moves', { n: rec.moves.length }))}</small></div></li>`;
    }).join('');
    $('lh-ask-form').always.checked = false;
    const d = $('lh-ask');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  /**
   * Trả lời ngay khi bấm nút (không đợi sự kiện close: WebKit phát close trễ một nhịp – trong lúc đó một lần "thoát ván"
   * khác có thể thấy hộp thoại đã đóng mà ván chờ chưa bỏ, rồi hỏi lại lần nữa).
   */
  $('lh-ask-form').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ans]');
    if (!b || !asking.length) return;
    answer(b.dataset.ans);
    const d = $('lh-ask');
    if (d.close) d.close(); else d.removeAttribute('open');
  });
  // Esc / chạm ra ngoài: giữ ván chờ, hỏi lại lần thoát sau
  // (close đến trễ: nếu đã mở câu hỏi mới thì không xoá nó)
  $('lh-ask').addEventListener('close', () => { if (!$('lh-ask').open) asking = []; });
  function answer(rv) {
    const list = asking;
    asking = [];
    const done = new Set(list.map((r) => r.at));
    setPend(pend.filter((r) => !done.has(r.at)));
    if (rv === 'no') return;
    const boxes = [...$('lh-ask-list').querySelectorAll('[data-ask]')];
    const chosen = boxes.length ? boxes.filter((b) => b.checked).map((b) => list[Number(b.dataset.ask)]) : list;
    if ($('lh-ask-form').always.checked) {
      // Luôn lưu: không hỏi nữa (ván khách / offline / với máy), ván online của tài khoản lưu tất cả
      store.setSettings(list.some(isAccount) ? { ask: false, online: 'all' } : { ask: false });
      fillSettings();
    }
    save(chosen);
  }

  // ---------------------------------------------------------------- Bắt ván vừa xong
  // Ván trên máy (với máy / 2 người): app.js gửi kèm bản ghi
  window.addEventListener('caro:gameover', (e) => { if (e.detail && e.detail.record) capture(e.detail.record); });
  // "Đi lại" sau khi hết ván: kết quả bị huỷ – bỏ ván đó (chơi tiếp tới khi xong sẽ ghi lại)
  window.addEventListener('caro:resultundo', () => {
    if (!lastLocal) return;
    const { at, id } = lastLocal;
    setLast(null);
    if (pend.some((r) => r.at === at)) setPend(pend.filter((r) => r.at !== at));
    if (id && store.remove([id])) changed();
  });
  if (N) {
    let lastEnd = null, lastRoom = null;
    N.on('room', (m) => {
      if (m.watch) return;
      const r = m.room;
      const me = N.state.me;
      // Rời phòng (không còn phòng / sang phòng khác): thoát ván. Sang ván sau trong cùng phòng thì chưa hỏi.
      if (lastRoom && (!r || r.code !== lastRoom)) setTimeout(exitGame, 300);
      lastRoom = r ? r.code : null;
      if (!r || !r.winner || !me || !r.players.some((p) => p.id === me.id)) return;
      const key = r.code + ':' + r.gameNo;
      if (key === lastEnd) return;
      lastEnd = key;
      if (r.reason === 'abort' || r.reason === 'abandoned' || !r.moves.length) return; // ván bị huỷ: không lưu lịch sử, như máy chủ
      const side = r.seats.x === me.id ? 1 : r.seats.o === me.id ? 2 : 0;
      const nameOf = (pid) => (r.players.find((p) => p.id === pid) || {}).name || '';
      capture({
        at: Date.now(), kind: 'online', account: !me.guest, me: side, x: nameOf(r.seats.x), o: nameOf(r.seats.o), winner: r.winner,
        reason: r.reason || 'win', rule: r.rule || 'vn', timeLimit: r.timeLimit || 0, clock: r.clock || null,
        moves: r.moves.map((mv) => [mv[0], mv[1]]), share: r.share || undefined, // mã xem lại trên máy chủ: không lưu trùng
      });
    });
  }

  // Thoát ván: ván mới trên máy, về trang (cả khi mở lại app: trang đầu tiên hiện ra)
  window.addEventListener('caro:newgame', () => { setLast(null); exitGame(); }); // ván mới: không còn "đi lại" được ván cũ
  window.addEventListener('caro:page', (e) => { if (e.detail.id) setTimeout(exitGame, 300); });
  // Mở app thẳng vào bàn cờ (link xem lại, đang trong phòng): khung Trang chủ hiện sẵn từ HTML rồi home.js mới ẩn, nên xét lúc hẹn giờ
  if (pend.length) setTimeout(() => { if (!(window.CaroShell && window.CaroShell.visible)) exitGame(); }, 1500);

  // Phân tích xong: lưu kèm kết quả
  window.addEventListener('caro:analyzed', (e) => {
    const d = e.detail;
    const key = JSON.stringify(d.moves);
    const same = (rec) => (rec.rule || 'vn') === d.rule && JSON.stringify(rec.moves) === key;
    if (pend.some(same)) setPend(pend.map((r) => (same(r) ? { ...r, analysis: d.result } : r)));
    const id = d.lg || store.findByMoves(d.rule, d.moves);
    if (id && store.setAnalysis(id, d.result)) changed();
  });

  // ---------------------------------------------------------------- Cài đặt → Lịch sử đấu trên máy này
  const form = $('settings-form');
  function fillSettings() {
    if (!form || !form.lhOn) return;
    const set = store.settings();
    form.lhOn.checked = set.on;
    form.lhAsk.checked = set.ask;
    form.lhAsk.disabled = !set.on;
    $('lh-ask-row').classList.toggle('off', !set.on);
    form.querySelectorAll('input[name=lhOnline]').forEach((r) => { r.checked = r.value === set.online; r.disabled = !set.on; });
    $('lh-online-list').classList.toggle('off', !set.on);
    $('lh-set-where').textContent = L.where();
    $('lh-set-usage').textContent = L.usageText();
    $('lh-set-clear').disabled = !store.count();
  }
  function valueText() {
    const set = store.settings();
    return set.on ? L.sizeText(store.usage().bytes) : T('off');
  }
  if (form && form.lhOn) {
    form.lhOn.addEventListener('change', () => {
      store.setSettings({ on: form.lhOn.checked });
      if (!form.lhOn.checked) setPend([]);
      fillSettings();
    });
    form.lhAsk.addEventListener('change', () => { store.setSettings({ ask: form.lhAsk.checked }); fillSettings(); });
    form.querySelectorAll('input[name=lhOnline]').forEach((r) => {
      r.addEventListener('change', () => { if (r.checked) { store.setSettings({ online: r.value }); fillSettings(); } });
    });
    $('lh-set-open').onclick = () => window.CaroHistory && window.CaroHistory.openTab('local');
    $('lh-set-clear').onclick = async () => {
      const n = store.count();
      if (!n || !(await window.CaroConfirm.ask(T('lh_confirm_clear', { n })))) return;
      store.clear();
      pend = [];
      setLast(null);
      toast(T('lh_deleted', { n }));
      changed();
    };
    window.addEventListener('caro:page', (e) => { if (e.detail.id === 'settings') fillSettings(); });
    window.addEventListener('caro:localhist', fillSettings);
    window.addEventListener('langchange', fillSettings);
    fillSettings();
  }

  window.CaroLocalSave = { capture, exitGame, valueText, get pending() { return pend; } };
})();
