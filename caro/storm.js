/*
 * Puzzle Storm (học ý tưởng từ Lichess): giải càng nhiều bài đố càng tốt trong 3 phút.
 *  - Bài đầu dễ, mỗi bài giải được thì bài sau khó hơn một chút.
 *  - Đi sai: mất 10 giây, sang bài khác ngay. Không có gợi ý / xem lời giải.
 *  - Chuỗi đúng liên tiếp (combo) 5 / 12 / 20 / 30 bài: được cộng 3 / 5 / 7 / 10 giây.
 *  - Kỷ lục lưu trên máy (localStorage).
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
  function save() { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* riêng tư */ } }

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
    s = { list: list.filter((q) => q.len <= 3), endAt: Date.now() + DURATION, solved: 0, wrong: 0, combo: 0, maxCombo: 0, used: new Set(), over: false, bonus: null };
    clearInterval(ticker);
    ticker = setInterval(tick, 250);
    next();
  }

  function next() {
    if (!s || s.over) return;
    const q = St.pickNear(s.list, 500 + s.solved * 45, s.used);
    s.used.add(q.id);
    s.cur = q;
    St.Trainer.start({
      moves: q.m, p: q.m.length % 2 ? C.O : C.X, goal: 'win', left: q.len, sol: q.sol, kind: 'storm', noHelp: true,
      score: scoreLine,
      onFirst: (ok) => { if (!ok) wrong(); },
      onSolved: (clean) => { if (clean) right(); },
      onExit: () => { stop(false); App.exitExt(); },
      exitLabel: 'storm_quit',
    });
  }

  function right() {
    if (!s || s.over) return;
    s.solved++;
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    const add = COMBO_BONUS[s.combo];
    if (add) { s.endAt += add * 1000; s.bonus = { text: '+' + add + 's', until: Date.now() + 1500 }; }
    setTimeout(next, 350);
  }

  function wrong() {
    if (!s || s.over) return;
    s.wrong++;
    s.combo = 0;
    s.endAt -= PENALTY;
    s.bonus = { text: '−10s', until: Date.now() + 1500, bad: true };
    setTimeout(next, 700);
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
      St.Trainer.exit();
      const msg = T('storm_over', { n: r.solved, w: r.wrong, c: r.maxCombo }) + (best ? ' ' + T('pz_new_best') : '');
      window.CaroOnline ? window.CaroOnline.toast(msg, 6000) : alert(msg);
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
