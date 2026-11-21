/*
 * Puzzle Storm (học ý tưởng từ Lichess): giải càng nhiều bài đố càng tốt trong 3 phút.
 *  - Bài đầu dễ, mỗi bài giải được thì bài sau khó hơn một chút.
 *  - Đi sai: mất 10 giây, sang bài khác ngay. Không có gợi ý / xem lời giải.
 *  - Chuỗi đúng liên tiếp (combo) 5 / 12 / 20 / 30 bài: được cộng 3 / 5 / 7 / 10 giây.
 *  - Kỷ lục lưu trên máy (localStorage) và đồng bộ với tài khoản (progress-sync.js).
 *  - Đã đăng nhập (A5): máy chủ phát thứ tự bài của lượt (stormStart), hết giờ thì gửi các bài đã giải kèm nước đi
 *    (stormEnd) – máy chủ tự kiểm rồi ghi vào bảng xếp hạng tuần (storm-board.js). Khách / mất mạng: chơi như cũ, chỉ lưu máy.
 * Dùng chung bộ bài đố và khung giải đố (Trainer) của study.js.
 */
(function () {
  'use strict';
  const St = window.CaroStudy;
  const App = window.CaroApp;
  if (!St || !App) return;
  const T = window.I18N.t;
  const esc = App.esc;
  const C = window.Caro;
  const $ = (id) => document.getElementById(id);

  const KEY = 'caro.storm';
  const DURATION = 3 * 60 * 1000;
  const PENALTY = 10 * 1000;
  const COMBO_BONUS = { 5: 3, 12: 5, 20: 7, 30: 10 }; // combo -> giây cộng thêm
  let rec = load();
  let s = null; // phiên đang chơi
  let ticker = 0;

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { best: +v.best || 0, runs: +v.runs || 0, last: +v.last || 0 };
    } catch (e) { return { best: 0, runs: 0, last: 0 }; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* riêng tư */ }
    if (window.CaroProgressSync) window.CaroProgressSync.dirty();
  }
  window.addEventListener('caro:progress', () => { rec = load(); subLine(); }); // vừa gộp với tài khoản

  /** Lượt có kiểm của máy chủ (đã đăng nhập, đang kết nối): { run, ids } hoặc null (chờ tối đa 2 giây). */
  function serverRun() {
    const N = window.CaroOnline, PS = window.CaroProgressSync;
    if (!N || !PS || !PS.canSync()) return Promise.resolve(null);
    return new Promise((done) => {
      let over = false;
      const fin = (v) => { if (!over) { over = true; done(v); } };
      pendingRun = (m) => fin(m.run && Array.isArray(m.ids) ? { run: m.run, ids: m.ids } : null);
      setTimeout(() => fin(null), 2000);
      if (!N.send({ t: 'stormStart' })) fin(null);
    });
  }
  let pendingRun = null;
  if (window.CaroOnline) {
    window.CaroOnline.on('stormRun', (m) => { if (pendingRun) { const f = pendingRun; pendingRun = null; f(m); } });
    window.CaroOnline.on('stormResult', (m) => {
      const N = window.CaroOnline;
      if (m.rejected) N.toast(T('storm_rejected'), 4000);
      else if (m.rank) N.toast(T('storm_rank', { rank: m.rank, n: m.weekBest }), 5000);
      window.dispatchEvent(new CustomEvent('caro:stormresult', { detail: m })); // storm-board.js vẽ lại bảng
    });
  }

  const left = () => Math.max(0, s.endAt - Date.now());
  const clock = (ms) => { const sec = Math.ceil(ms / 1000); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };

  function subLine() {
    $('storm-sub').textContent = rec.runs ? T('storm_rec', { best: rec.best, last: rec.last }) : T('storm_d');
  }

  async function start() {
    let list;
    try { list = await St.loadPuzzles(); } catch (e) { window.CaroOnline?.toast(T('pz_load_fail')); return; }
    const d = $('puzzle-dlg');
    if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); }
    const sr = await serverRun();
    const pool = list.filter((q) => q.len <= 3 && !q.rule);
    const byId = new Map(pool.map((q) => [q.id, q]));
    // Lượt có kiểm: máy chủ kiểm bài thứ i theo danh sách của nó – bỏ bài máy này không có thì số thứ tự lệch, mọi lời giải
    // sau đó bị từ chối. Bộ câu đố trên máy khác bản máy chủ (service worker còn bản cũ…): chơi như lượt trên máy, báo rõ
    let ids = sr ? sr.ids.map((id) => byId.get(id)) : null;
    if (ids && (!ids.length || ids.some((q) => !q))) {
      ids = null;
      window.CaroOnline?.toast(T('storm_old_ver'), 5000);
    }
    s = { list: pool, endAt: Date.now() + DURATION, solved: 0, wrong: 0, combo: 0, maxCombo: 0, used: new Set(), over: false, bonus: null,
      run: ids ? sr.run : null, ids, idx: 0, good: [] };
    clearInterval(ticker);
    ticker = setInterval(tick, 250);
    next();
  }

  function next() {
    if (!s || s.over) return;
    // Lượt có kiểm: theo thứ tự máy chủ phát (bài thứ idx); không thì chọn trên máy như cũ
    const q = s.ids ? s.ids[s.idx] : St.pickNear(s.list, 500 + s.solved * 45, s.used);
    if (!q) { stop(false); return; } // danh sách lọc rỗng: kết thúc phiên êm thay vì crash ở q.id (đợt 7, mục 53)
    s.used.add(q.id);
    s.cur = q;
    s.curIdx = s.idx++;
    St.Trainer.start({
      moves: q.m, p: q.m.length % 2 ? C.O : C.X, goal: 'win', left: q.len, sol: q.sol, kind: 'storm', noHelp: true,
      score: scoreLine,
      onFirst: (ok) => { if (!ok) wrong(); },
      onSolved: (clean) => {
        if (!clean) return;
        // Nước đã đi (sau thế cờ của bài) – máy chủ kiểm lại lời giải
        if (s && s.run) s.good.push({ i: s.curIdx, line: App.board.moves.slice(q.m.length).map((m) => [m.x, m.y]) });
        right();
      },
      onExit: () => { stop(false); App.exitExt(); },
      exitLabel: 'storm_quit',
    });
  }

  /** Sang bài kế sau ms – chỉ khi vẫn là phiên này (hẹn giờ của phiên cũ không được đổi bài của phiên mới). */
  function later(ms) { const cur = s; setTimeout(() => { if (s === cur) next(); }, ms); }

  function right() {
    if (!s || s.over) return;
    s.solved++;
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    const add = COMBO_BONUS[s.combo];
    if (add) { s.endAt += add * 1000; s.bonus = { text: '+' + add + 's', until: Date.now() + 1500 }; }
    later(350);
  }

  function wrong() {
    if (!s || s.over) return;
    s.wrong++;
    s.combo = 0;
    s.endAt -= PENALTY;
    s.bonus = { text: '−10s', until: Date.now() + 1500, bad: true };
    later(700);
  }

  function scoreLine() {
    if (!s) return '';
    const b = s.bonus && s.bonus.until > Date.now() ? ` <span class="${s.bonus.bad ? 'down' : 'up'}">${esc(s.bonus.text)}</span>` : '';
    return `<span class="storm-line"><b>⚡ ${s.solved}</b> · ⏱ <b class="${left() < 20000 ? 'down' : ''}">${clock(left())}</b>${b}`
      + ` · ${esc(T('storm_combo', { n: s.combo }))}</span>`;
  }

  function tick() {
    if (!s) return clearInterval(ticker);
    if (left() <= 0) return stop(true);
    St.Trainer.refresh();
  }

  /** Hết giờ (done = true) hoặc bỏ dở. */
  function stop(done) {
    clearInterval(ticker);
    if (!s || s.over) return;
    s.over = true;
    const r = s;
    if (done) {
      rec.runs++;
      rec.last = r.solved;
      const best = r.solved > rec.best;
      if (best) rec.best = r.solved;
      save();
      // Lượt có kiểm: gửi máy chủ (trả stormResult – hạng tuần)
      if (r.run && window.CaroOnline) window.CaroOnline.send({ t: 'stormEnd', run: r.run, solved: r.good, wrong: r.wrong });
      St.Trainer.exit();
      const msg = T('storm_over', { n: r.solved, w: r.wrong, c: r.maxCombo }) + (best ? ' ' + T('pz_new_best') : '');
      if (window.CaroOnline) window.CaroOnline.toast(msg, 6000); else window.CaroConfirm.info(msg);
      subLine();
      St.openPuzzles();
    }
    s = null;
  }

  document.querySelectorAll('[data-storm]').forEach((b) => { b.onclick = start; });
  window.addEventListener('langchange', subLine);
  subLine();
  window.CaroStorm = { start, get active() { return !!s; } };
})();
