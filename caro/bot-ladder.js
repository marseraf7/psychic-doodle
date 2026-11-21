/*
 * Thang nhân vật máy (hộp "Thang nhân vật máy" – tab Xem thêm): 31 nhân vật xếp theo sức cờ, tiến độ "đã thắng tới bậc N"
 * theo từng luật, bậc đã qua / bậc kế tiếp / bậc chưa tới (chỉ hiển thị – không khoá ván), huy hiệu, nút "Thử thách tiếp".
 * Thắng một ván với máy (sự kiện caro:gameover của app-ai.js) thì cập nhật tiến độ. Lưu trên máy (localStorage 'caro.ladder')
 * và đồng bộ với tài khoản (máy chủ: server/src/hub/ladder.js – gộp lấy bậc cao hơn). Phần tính: bot-ladder-core.js.
 * API: window.CaroBotLadder = { open(rule?), state, next(rule) }
 */
(function () {
  'use strict';
  const F = window.CaroFeat, LC = window.CaroLadderCore, Bots = window.CaroBots;
  const N = window.CaroOnline;
  const T = window.I18N.t;
  const esc = F.esc;
  const KEY = 'caro.ladder';
  const ids = LC.order(Bots.BOTS);
  const dlg = F.dialog('ladder-dlg', 'lad_title', 'medal');
  const body = dlg.body;
  let rule = 'vn';

  let state;
  try { state = LC.clean(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { state = LC.clean(null); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* riêng tư */ } }

  const signed = () => !!(N && N.state && N.state.me && !N.state.me.guest && N.connected);
  // Máy chủ nhận tối đa 1 lần / giây: gom các lần gửi sát nhau thành một
  let lastSync = 0, syncTimer = 0;
  function sync() {
    if (!signed()) return;
    const wait = lastSync + 1200 - Date.now();
    if (wait > 0) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, wait); return; }
    lastSync = Date.now();
    N.send({ t: 'ladderSync', data: state });
  }
  if (N) {
    N.on('ladder', (m) => { state = LC.merge(state, m.data); save(); if (dlg.isOpen()) render(); });
    // vào lại / đăng nhập / đăng ký: gộp tiến độ máy này với tài khoản
    for (const t of ['welcome', 'auth']) N.on(t, () => setTimeout(sync, 500));
  }

  /** Thắng một ván với máy: lên bậc (nếu nhân vật đó cao hơn bậc đã qua). */
  window.addEventListener('caro:gameover', (e) => {
    const d = e.detail || {};
    if (d.mode !== 'ai' || !d.won || !d.bot) return;
    const r = (d.record && d.record.rule) || 'vn';
    const before = state.r[r] || 0;
    const had = LC.badges(state, Bots.BOTS);
    state = LC.win(state, d.bot, r, ids);
    if ((state.r[r] || 0) === before) return;
    save();
    sync();
    const got = LC.badges(state, Bots.BOTS).filter((b) => !had.includes(b));
    setTimeout(() => {
      if (N && N.toast) N.toast(T('lad_up', { n: state.r[r], total: ids.length, rule: T('grule_s_' + r) }));
      for (const b of got) if (N && N.toast) N.toast(T('lad_badge_got', { name: T('lad_b_' + b) }));
    }, 1600);
    if (dlg.isOpen()) render();
  });

  const next = (r) => ids[Math.min(ids.length - 1, state.r[r] || 0)];

  function open(r) {
    if (r && LC.RULES.includes(r)) rule = r;
    else if (window.CaroApp && window.CaroApp.local && LC.RULES.includes(window.CaroApp.local.rule)) rule = window.CaroApp.local.rule;
    render();
    dlg.open();
    sync();
  }

  function render() {
    const done = state.r[rule] || 0;
    const tabs = LC.RULES.map((k) => `<button type="button" class="ghost sm${k === rule ? ' on' : ''}" data-lr="${k}" aria-pressed="${k === rule}">${esc(T('grule_s_' + k))} · ${state.r[k] || 0}</button>`).join('');
    const badges = LC.badges(state, Bots.BOTS).map((b) => `<span class="feat-tag up">${esc(T('lad_b_' + b))}</span>`).join('');
    const pick = window.CaroBotPicker;
    const rows = ids.map((id, i) => {
      const b = Bots.get(id);
      const st = i < done ? 'beaten' : i === done ? 'next' : 'locked';
      return `<li class="${st === 'locked' ? 'locked' : st === 'next' ? 'me' : 'up'}"><span class="rk">${i + 1}</span>
        <span class="nm lad-nm">${pick ? pick.avatarHtml(id, 'sm') : ''}<span class="lad-t"><b>${esc(T('bot_' + id))}</b><small>${esc(T('lad_elo', { elo: b.elo }))} · ${esc(T('lad_s_' + st))}</small></span></span>
        <span class="pt">${st === 'beaten' ? '✓' : st === 'next' ? `<button type="button" class="primary sm" data-lgo="${esc(id)}">${esc(T('lad_play'))}</button>` : ''}</span></li>`;
    }).join('');
    const nx = next(rule);
    body.innerHTML = `<p class="hint">${esc(T('lad_hint'))}</p>
      <div class="row lad-tabs" role="group" aria-label="${esc(T('lad_rule'))}">${tabs}</div>
      <p class="lad-sum"><b>${esc(T('lad_progress', { n: done, total: ids.length }))}</b></p>
      ${badges ? `<div class="feat-badges">${badges}</div>` : ''}
      <div class="row"><button type="button" class="primary" data-lgo="${esc(nx)}">${esc(T(done >= ids.length ? 'lad_again' : 'lad_next', { name: T('bot_' + nx) }))}</button></div>
      <ol class="feat-list lad-list">${rows}</ol>`;
  }

  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lr]');
    if (t) { rule = t.dataset.lr; render(); return; }
    const g = e.target.closest('[data-lgo]');
    if (!g) return;
    dlg.close();
    const App = window.CaroApp;
    // Nhân vật chưa mở khoá theo cách cũ (app.js) thì mở khoá tới mức đó – thang không khoá ván
    const b = Bots.get(g.dataset.lgo);
    if (App && App.setBot) App.setBot(b.id, b.tier);
    if (!App || !App.startPreset({ mode: 'ai', bot: b.id, rule, moves: [] })) { if (N && N.toast) N.toast(T('lad_busy')); }
  });

  window.addEventListener('langchange', () => { if (dlg.isOpen()) render(); });
  F.row('more-ladder', 'lad_title', 'medal', () => open());
  window.CaroBotLadder = { open, get state() { return state; }, next, ids };
})();
