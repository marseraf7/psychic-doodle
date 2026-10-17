/*
 * Giải đố: bài tính điểm (Elo riêng, chọn độ khó), chuỗi đúng liên tiếp, bài của ngày, luyện theo chủ đề VCF / VCT;
 * thống kê lưu trên máy (caro.puzzles), tải puzzles.json khi cần. Dùng Trainer (study-trainer.js).
 * Gắn window.CaroPuzzles; study.js đưa các hàm này ra CaroStudy như cũ.
 */
(function () {
  'use strict';
  const App = window.CaroApp;
  const C = window.Caro;
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  const toast = (m, ms) => window.CaroOnline && window.CaroOnline.toast(m, ms);
  const ico = (id) => `<svg class="ico i-in" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const Trainer = window.CaroTrainer;

  // ================================================================ Giải đố
  const PZ_STORE = 'caro.puzzles';
  const DIFFS = [-600, -300, 0, 300, 600]; // độ khó bài đố tính điểm (như Lichess): lệch so với điểm của mình
  let puzzles = null;
  let pz = loadPz();
  let session = null; // { mode, streak, used:Set, current }

  function loadPz() {
    try {
      const s = JSON.parse(localStorage.getItem(PZ_STORE) || '{}');
      return { r: +s.r || 1000, n: +s.n || 0, ok: +s.ok || 0, best: +s.best || 0, daily: s.daily || null, recent: Array.isArray(s.recent) ? s.recent.slice(-40) : [],
        diff: DIFFS.includes(+s.diff) ? +s.diff : 0 };
    } catch (e) { return { r: 1000, n: 0, ok: 0, best: 0, daily: null, recent: [], diff: 0 }; }
  }
  function savePz() { try { localStorage.setItem(PZ_STORE, JSON.stringify(pz)); } catch (e) { /* riêng tư */ } }

  async function loadPuzzles() {
    if (puzzles) return puzzles;
    const r = await fetch('puzzles.json');
    if (!r.ok) throw new Error('puzzles');
    puzzles = await r.json();
    return puzzles;
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function dailyPuzzle(list) {
    const pool = list.filter((q) => q.r >= 800 && q.r <= 1600);
    const src = pool.length ? pool : list;
    let h = 2166136261;
    for (const ch of today()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return src[h % src.length];
  }
  function pickNear(list, target, avoid) {
    const cand = list.filter((q) => !avoid.has(q.id));
    const src = cand.length ? cand : list;
    const sorted = src.slice().sort((a, b) => Math.abs(a.r - target) - Math.abs(b.r - target));
    const top = sorted.slice(0, 6);
    return top[Math.floor(Math.random() * top.length)];
  }

  function renderPzStats() {
    const dailyDone = pz.daily && pz.daily.d === today();
    $('pz-stats').innerHTML = `<div><b>${pz.r}</b><small>${esc(T('pz_rating'))}</small></div>
      <div><b>${pz.ok}/${pz.n}</b><small>${esc(T('pz_solved'))}</small></div>
      <div><b>${pz.best}</b><small>${esc(T('pz_best'))}</small></div>`;
    $('pz-daily-sub').textContent = dailyDone ? T(pz.daily.ok ? 'pz_daily_done' : 'pz_daily_tried') : T('pz_daily_d');
    $('pz-diff').value = String(pz.diff);
  }
  $('pz-diff').onchange = () => { pz.diff = DIFFS.includes(+$('pz-diff').value) ? +$('pz-diff').value : 0; savePz(); };

  function openPuzzles() {
    if (App.online) return;
    renderPzStats();
    const d = $('puzzle-dlg');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    loadPuzzles().catch(() => {});
  }

  async function startMode(mode) {
    let list;
    try { list = await loadPuzzles(); } catch (e) { toast(T('pz_load_fail')); return; }
    const d = $('puzzle-dlg');
    if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); }
    session = { mode, streak: 0, used: new Set() };
    nextPuzzle(list);
  }

  function nextPuzzle(list) {
    list = list || puzzles;
    const s = session;
    let q;
    if (s.mode === 'daily') q = dailyPuzzle(list.filter((z) => !z.rule));
    else if (s.mode === 'streak') q = pickNear(list.filter((z) => !z.rule), 600 + s.streak * 70, s.used);
    else if (s.mode === 'vcf' || s.mode === 'vct') q = pickNear(list.filter((z) => (z.t || 'vct') === s.mode), pz.r + pz.diff, s.used); // luyện theo chủ đề (không tính điểm)
    else q = pickNear(list.filter((z) => !z.rule), pz.r + pz.diff, new Set([...pz.recent, ...s.used]));
    s.used.add(q.id);
    s.current = q;
    s.delta = null;
    const p = q.m.length % 2 ? C.O : C.X;
    Trainer.start({
      moves: q.m, p, goal: 'win', left: q.len, sol: q.sol, kind: 'puzzle', rule: q.rule || 'vn',
      prompt: q.t === 'vcf' && (s.mode === 'vcf' || s.mode === 'vct') ? T('pz_vcf_task') : null,
      score: scoreLine,
      onFirst: (ok) => firstResult(q, ok),
      next: s.mode === 'daily' ? null : () => { if (s.over) { s.over = false; s.streak = 0; s.used = new Set(); } nextPuzzle(); },
      nextOnFail: s.mode !== 'daily',
      nextLabel: () => (s.over ? 'pz_streak_again' : 'tr_next'),
    });
  }

  function scoreLine() {
    const s = session;
    if (!s) return '';
    const q = s.current;
    if (s.mode === 'streak') return `${ico('fire')} ${esc(T('pz_streak_n', { n: s.streak }))}`;
    if (s.mode === 'daily') return `${ico('cal')} ${esc(T('pz_daily'))}`;
    if (s.mode === 'vcf' || s.mode === 'vct') return `${ico('puzzle')} ${esc(T('pz_' + s.mode))}${q.rule ? ' · ' + esc(T('grule_s_' + q.rule)) : ''} <span class="thinking wide-only">#${q.id} · ${q.r}</span>`;
    const d = s.delta;
    const delta = d == null ? '' : ` <span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</span>`;
    return `${ico('puzzle')} ${pz.r}${delta} <span class="thinking wide-only">#${q.id} · ${q.r}</span>`;
  }

  function firstResult(q, ok) {
    const s = session;
    if (!s) return;
    pz.n++;
    if (ok) pz.ok++;
    if (s.mode === 'rated') {
      const e = 1 / (1 + Math.pow(10, (q.r - pz.r) / 400));
      const k = pz.n <= 20 ? 40 : 20;
      const d = Math.round(k * ((ok ? 1 : 0) - e));
      pz.r = Math.max(100, pz.r + d);
      s.delta = d;
      pz.recent = [...pz.recent, q.id].slice(-40);
    } else if (s.mode === 'streak') {
      if (ok) {
        s.streak++;
        if (s.streak > pz.best) pz.best = s.streak;
      } else {
        s.over = true;
        const best = s.streak > 0 && s.streak === pz.best;
        toast(T('pz_streak_over', { n: s.streak }) + (best ? ' ' + T('pz_new_best') : ''), 4500);
      }
    } else if (s.mode === 'daily') {
      pz.daily = { d: today(), ok };
    }
    savePz();
    Trainer.refresh();
  }

  $('btn-puzzle').onclick = openPuzzles;
  document.querySelectorAll('.pz-mode').forEach((b) => { b.onclick = () => startMode(b.dataset.pz); });

  window.CaroPuzzles = { openPuzzles, startMode, loadPuzzles, pickNear, dailyPuzzle, get puzzles() { return puzzles; } };
})();
