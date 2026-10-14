/*
 * Lưu ván vào Lịch sử đấu trên máy này (kho: local-games.js, danh sách: local-history.js).
 *   Ván nào được lưu trên máy: ván với máy / 2 người trên một máy (không bao giờ lên máy chủ), và ván online chơi bằng
 *   tài khoản khách (máy chủ chỉ lưu ván của tài khoản). Ván online của tài khoản đã đăng nhập: máy chủ lưu (thẻ Online).
 *   Hết ván → giữ làm "ván chờ" (caro.lg.pending). Người chơi thoát ván (ván mới, rời phòng / sang ván sau, về trang,
 *   hoặc mở lại app) → hỏi: "Bạn đang offline / đang chơi bằng tài khoản khách… có muốn lưu lịch sử đấu trên máy này?"
 *   Cài đặt → Lịch sử đấu trên máy này: bật / tắt lưu, bật / tắt hỏi (tắt hỏi = tự lưu mọi ván), nơi lưu + dung lượng, xoá.
 *   Phân tích ván (study.js phát 'caro:analyzed') → lưu kèm kết quả vào ván đã lưu / ván chờ: mở lại không phải phân tích lại.
 * API: window.CaroLocalSave = { capture(rec), exitGame(), valueText() }
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

  let pend = store.pending(); // ván vừa xong chờ hỏi (còn từ lần mở app trước thì hỏi khi vào trang đầu tiên)
  const setPend = (rec) => { pend = rec; store.setPending(rec); };

  function save(rec, quiet) {
    const id = store.add(rec);
    if (!id) toast(T('lh_full'), 4500);
    else { if (!quiet) toast(T('lh_saved')); changed(); }
    return id;
  }

  /** Ván vừa xong. */
  function capture(rec) {
    const set = store.settings();
    if (!set.on || !LG.valid(rec)) return;
    if (!set.ask) { save(rec, true); return; } // không hỏi: tự lưu ngay
    setPend(rec);
  }

  /** Vì sao ván này không có trong lịch sử online (dòng đầu của câu hỏi). */
  function why() {
    if (!N || !N.connected) return T('lh_ask_offline');
    if (!N.state.me || N.state.me.guest) return T('lh_ask_guest');
    return T('lh_ask_local');
  }

  /** Người chơi rời ván: có ván chờ thì hỏi lưu. */
  function exitGame() {
    if (!pend || $('lh-ask').open) return;
    const set = store.settings();
    if (!set.on) return setPend(null);
    if (!set.ask) { save(pend, true); return setPend(null); }
    ask(pend);
  }

  function ask(rec) {
    const L2 = L.describe(rec);
    $('lh-ask-why').textContent = why();
    $('lh-ask-game').innerHTML = `<span class="res ${L2.cls}">${esc(L2.res)}</span> ${esc(L2.opp)} · ${esc(T('lh_moves', { n: rec.moves.length }))}`;
    $('lh-ask-form').always.checked = false;
    const d = $('lh-ask');
    d.returnValue = '';
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  $('lh-ask').addEventListener('close', () => {
    const rec = pend;
    setPend(null);
    if (!rec || $('lh-ask').returnValue !== 'yes') return; // Không lưu / Esc: bỏ ván này
    if ($('lh-ask-form').always.checked) { store.setSettings({ ask: false }); fillSettings(); }
    save(rec);
  });

  // ---------------------------------------------------------------- Bắt ván vừa xong
  // Ván trên máy (với máy / 2 người): app.js gửi kèm bản ghi
  window.addEventListener('caro:gameover', (e) => { if (e.detail && e.detail.record) capture(e.detail.record); });
  if (N) {
    let lastEnd = null;
    N.on('room', (m) => {
      const r = m.room;
      const me = N.state.me;
      // Rời phòng / sang ván sau: thoát ván online đang chờ hỏi
      if (pend && pend.kind === 'online' && (!r || r.code !== pend.code || r.gameNo !== pend.gameNo)) exitGame();
      if (m.watch || !r || !r.winner || !me || !r.players.some((p) => p.id === me.id)) return;
      const key = r.code + ':' + r.gameNo;
      if (key === lastEnd) return;
      lastEnd = key;
      if (!me.guest || r.reason === 'abort' || !r.moves.length) return; // tài khoản: máy chủ đã lưu (thẻ Online)
      const side = r.seats.x === me.id ? 1 : r.seats.o === me.id ? 2 : 0;
      const nameOf = (pid) => (r.players.find((p) => p.id === pid) || {}).name || '';
      capture({
        at: Date.now(), kind: 'online', me: side, x: nameOf(r.seats.x), o: nameOf(r.seats.o), winner: r.winner, reason: r.reason || 'win',
        rule: r.rule || 'vn', timeLimit: r.timeLimit || 0, clock: r.clock || null, moves: r.moves.map((mv) => [mv[0], mv[1]]),
        code: r.code, gameNo: r.gameNo,
      });
    });
  }

  // Thoát ván: ván mới trên máy, về trang (cả khi mở lại app: trang đầu tiên hiện ra)
  window.addEventListener('caro:newgame', exitGame);
  window.addEventListener('caro:page', (e) => { if (e.detail.id) setTimeout(exitGame, 300); });
  if (pend && !(window.CaroShell && window.CaroShell.visible)) setTimeout(exitGame, 1500); // mở app thẳng vào bàn cờ

  // Phân tích xong: lưu kèm kết quả
  window.addEventListener('caro:analyzed', (e) => {
    const d = e.detail;
    const same = (rec) => rec && (rec.rule || 'vn') === d.rule && JSON.stringify(rec.moves) === JSON.stringify(d.moves);
    if (same(pend)) setPend({ ...pend, analysis: d.result });
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
      if (!form.lhOn.checked) setPend(null);
      fillSettings();
    });
    form.lhAsk.addEventListener('change', () => { store.setSettings({ ask: form.lhAsk.checked }); fillSettings(); });
    $('lh-set-open').onclick = () => window.CaroHistory && window.CaroHistory.openTab('local');
    $('lh-set-clear').onclick = () => {
      const n = store.count();
      if (!n || !confirm(T('lh_confirm_clear', { n }))) return;
      store.clear();
      pend = null;
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
