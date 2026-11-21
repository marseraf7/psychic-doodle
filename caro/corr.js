/*
 * Chơi theo lượt (C1) – phía trình duyệt. Máy chủ: server/src/hub/corr.js (luật, hết giờ, điểm loại 'corr').
 *  - Trang chủ: thẻ "Ván đang chờ bạn" (#home-corr, chèn ngay dưới thẻ Tiếp tục ván) – ván tới lượt mình + lời mời.
 *  - Xem thêm › "Chơi theo lượt": hộp #corr-dlg – thách đấu (tên đăng nhập, 1/2/3/5/7 ngày, tính điểm, quân), danh sách
 *    Đến lượt bạn · Chờ đối thủ · Lời mời (Nhận lời / Từ chối) · Đã xong.
 *  - Mở một ván: bàn cờ dạng "ext" (CaroApp.enterExt – như giải đố); dòng lượt ghi còn bao lâu; thanh dưới #ext-bar: Xin hoà / Đồng ý hoà,
 *    Xin hoà / Đồng ý hoà, Xin đi lại / Cho đi lại, Đầu hàng (hỏi lại bằng CaroConfirm), Rời bàn; lời xin của đối thủ: #corr-offer. Bàn đồng bộ mỗi khi máy chủ gửi corrGame.
 *    Đánh bằng chuột / chạm / bàn phím (a11y.js – CaroApp.tryPlay đi qua ext.onMove).
 *   window.CaroCorr = { openList(), open(id), get games() }
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  const App = window.CaroApp;
  if (!N || !App) return;
  const T = (k, a) => window.I18N.t(k, a);
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  const DAYS = [1, 2, 3, 5, 7];
  const games = new Map(); // id → ván (bản mới nhất máy chủ gửi)
  let cur = null; // { id, ctrl } ván đang mở trên bàn

  const meId = () => (N.state.me && !N.state.me.guest ? N.state.me.uid || N.state.me.id : null);
  const signedIn = () => !!meId() && N.connected;
  const oppName = (g) => (g.x === meId() ? g.oName : g.xName);
  const mySide = (g) => (g.x === meId() ? 1 : 2);
  const myTurn = (g) => g.status === 'active' && g.turn === meId();
  /** "còn 2 ngày 3 giờ" từ hạn chót. */
  function left(g, now = Date.now()) {
    const ms = Math.max(0, (g.deadline || now) - now);
    const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60;
    const t = d ? T('corr_left_d', { d, h }) : h ? T('corr_left_h', { h, m }) : T('corr_left_m', { m });
    return T('corr_left', { t });
  }
  function resultText(g) {
    if (g.reason === 'declined' || g.reason === 'expired' || g.reason === 'abort') return T('corr_res_' + g.reason);
    const r = g.winner === 3 ? T('corr_res_draw') : T(g.winner === mySide(g) ? 'corr_res_win' : 'corr_res_loss');
    return g.reason === 'timeout' || g.reason === 'resign' ? r + ' (' + T('corr_by_' + g.reason) + ')' : r;
  }

  // ------------------------------------------------------------ Danh sách + thẻ Trang chủ
  const groups = () => {
    const all = [...games.values()].sort((a, b) => (a.deadline || Infinity) - (b.deadline || Infinity) || b.updated - a.updated);
    return {
      mine: all.filter(myTurn),
      theirs: all.filter((g) => g.status === 'active' && !myTurn(g)),
      invites: all.filter((g) => g.status === 'invite'),
      done: all.filter((g) => g.status === 'done').sort((a, b) => b.updated - a.updated).slice(0, 10),
    };
  };
  function row(g) {
    const vs = `<span class="ellip"><b>${esc(T('corr_vs', { name: oppName(g) }))}</b></span>`;
    let info = '', act = '';
    if (g.status === 'invite') {
      if (g.from === meId()) info = T('corr_invite_to', { name: oppName(g) });
      else {
        info = T('corr_invite_from', { name: oppName(g), n: g.days });
        act = `<span class="corr-act"><button type="button" class="primary sm" data-acc="${esc(g.id)}">${esc(T('corr_accept'))}</button>
          <button type="button" class="ghost sm" data-dec="${esc(g.id)}">${esc(T('corr_decline'))}</button></span>`;
      }
    } else if (g.status === 'active') info = `${T('corr_days_n', { n: g.days })} · ${left(g)}`;
    else info = resultText(g);
    const open = g.status === 'invite' ? '' : ` data-open="${esc(g.id)}"`;
    return `<li class="corr-row${myTurn(g) ? ' mine' : ''}"><button type="button" class="corr-main"${open}>${vs}<small>${esc(info)}</small></button>${act}</li>`;
  }
  function listHtml() {
    const G = groups();
    const sec = (k, list) => (list.length ? `<h3 class="list-h">${esc(T(k))}</h3><ul class="corr-list">${list.map(row).join('')}</ul>` : '');
    const body = sec('corr_my_turn', G.mine) + sec('corr_invites', G.invites) + sec('corr_their_turn', G.theirs) + sec('corr_done', G.done);
    return body || `<p class="hint">${esc(T('corr_none'))}</p>`;
  }
  function homeCard() {
    let el = $('home-corr');
    const anchor = $('home-resume');
    if (!el && anchor) { el = document.createElement('div'); el.id = 'home-corr'; el.className = 'home-corr'; anchor.after(el); }
    if (!el) return;
    const G = groups();
    const list = [...G.mine, ...G.invites.filter((g) => g.from !== meId())];
    el.hidden = !signedIn() || !list.length;
    if (el.hidden) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="corr-card"><div class="corr-card-h"><b>${esc(T('corr_waiting'))}</b><small>${esc(T('corr_waiting_n', { n: G.mine.length }))}</small></div>
      <ul class="corr-list">${list.slice(0, 4).map(row).join('')}</ul>
      <button type="button" class="tb-link sm" data-corr-all>${esc(T('corr_all'))}</button></div>`;
  }

  function dlg() {
    let d = $('corr-dlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'corr-dlg'; d.className = 'wide-dlg'; document.body.appendChild(d); }
    return d;
  }
  function drawDlg() {
    const d = $('corr-dlg');
    if (!d || !d.open) return;
    const keep = d.querySelector('form') ? Object.fromEntries(new FormData(d.querySelector('form'))) : {};
    d.querySelector('.corr-body').innerHTML = listHtml();
    if (keep.username != null) d.querySelector('input[name=username]').value = keep.username;
  }
  function openList() {
    if (!signedIn()) { N.toast(T('corr_need_account')); return; }
    const d = dlg();
    const rules = ['vn', 'free', 'std', 'renju'];
    d.innerHTML = `<div class="dlg"><h2>${esc(T('corr_title'))}</h2><p class="hint">${esc(T('corr_sub'))}</p>
      <form class="corr-form" autocomplete="off">
        <label class="corr-f"><span>${esc(T('corr_user'))}</span><input name="username" required maxlength="20" spellcheck="false" autocapitalize="off"></label>
        <label class="corr-f"><span>${esc(T('corr_days'))}</span><select name="days">${DAYS.map((n) => `<option value="${n}"${n === 3 ? ' selected' : ''}>${esc(T('corr_days_n', { n }))}</option>`).join('')}</select></label>
        <label class="corr-f"><span>${esc(T('rules'))}</span><select name="rule">${rules.map((r) => `<option value="${r}">${esc(T('grule_s_' + r))}</option>`).join('')}</select></label>
        <label class="corr-f"><span>${esc(T('corr_side'))}</span><select name="side"><option value="random">${esc(T('corr_side_random'))}</option><option value="x">X</option><option value="o">O</option></select></label>
        <label class="corr-chk"><input type="checkbox" name="rated" checked> <span>${esc(T('corr_rated'))}</span></label>
        <button type="submit" class="primary">${esc(T('corr_send'))}</button>
      </form>
      <div class="corr-body"></div>
      <div class="row"><button type="button" class="ghost" data-close>${esc(T('close'))}</button></div></div>`;
    d.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.username.value.trim();
      if (!name) return;
      N.send({ t: 'corrCreate', username: name, days: Number(f.days.value), rule: f.rule.value, side: f.side.value, rated: f.rated.checked });
      N.toast(T('corr_sent', { name }));
      f.username.value = '';
    };
    d.querySelector('[data-close]').onclick = () => d.close();
    if (!d.open) d.showModal();
    drawDlg();
    if (window.CaroFit) window.CaroFit.fit(d);
    N.send({ t: 'corrList' });
  }
  /** Bấm trong danh sách (hộp + thẻ Trang chủ). */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#corr-dlg button, #home-corr button');
    if (!b) return;
    if (b.dataset.acc || b.dataset.dec) { N.send({ t: 'corrAnswer', id: b.dataset.acc || b.dataset.dec, accept: !!b.dataset.acc }); return; }
    if (b.dataset.open) { const d = $('corr-dlg'); if (d && d.open) d.close(); open(b.dataset.open); return; }
    if (b.hasAttribute('data-corr-all')) openList();
  });

  // ------------------------------------------------------------ Bàn cờ của ván đang mở
  /** Lời xin hoà / đi lại của đối thủ: một dòng nổi trên thanh dưới (#corr-offer). */
  function offerEl() {
    let el = $('corr-offer');
    if (!el) { el = document.createElement('div'); el.id = 'corr-offer'; el.className = 'corr-offer'; el.setAttribute('role', 'status'); el.hidden = true; document.body.appendChild(el); }
    return el;
  }
  /** Nút của ván ở thanh dưới dùng chung khi bàn cờ do module khác điều khiển (#ext-bar – như study-trainer.js). */
  function drawBar() {
    const g = cur && games.get(cur.id);
    const on = !!g && App.ext === cur.ctrl;
    const off = offerEl();
    if (!on) { off.hidden = true; if (cur === null && $('ext-bar') && $('ext-bar').querySelector('[data-corr]')) $('ext-bar').innerHTML = ''; return; }
    const opp = oppName(g);
    const offers = [];
    if (g.status === 'active' && g.drawOffer && g.drawOffer !== meId()) offers.push(T('corr_offer_draw', { name: opp }));
    if (g.status === 'active' && g.takebackOffer && g.takebackOffer !== meId()) offers.push(T('corr_offer_tb', { name: opp }));
    off.hidden = !offers.length;
    off.textContent = offers.join(' · ');
    const btn = (act, icon, key) => `<button type="button" data-corr="${act}"><svg class="ico" aria-hidden="true"><use href="#i-${icon}"/></svg><span>${esc(T(key))}</span></button>`;
    const parts = [];
    if (g.status === 'active') {
      parts.push(btn('draw', 'draw', g.drawOffer && g.drawOffer !== meId() ? 'corr_draw_accept' : 'corr_draw'));
      if (g.takebackOffer && g.takebackOffer !== meId()) parts.push(btn('takeback', 'undo', 'corr_takeback_accept'), btn('tbno', 'close', 'corr_decline'));
      else if (g.moves.length && g.turn !== meId() && g.turn) parts.push(btn('takeback', 'undo', 'corr_takeback'));
      parts.push(btn('resign', 'flag', 'corr_resign'));
    }
    parts.push(btn('leave', 'exit', 'corr_leave'));
    $('ext-bar').innerHTML = parts.join('');
  }
  function render() {
    const g = cur && games.get(cur.id);
    if (!g) return { turn: '' };
    const glyph = (p) => (p === 1 ? '<b class="dot x">X</b>' : '<b class="dot o">O</b>');
    const turn = g.status === 'active'
      ? (myTurn(g) ? `${glyph(mySide(g))} ${esc(T('corr_turn_you', { left: left(g) }))}` : `${glyph(3 - mySide(g))} ${esc(T('corr_turn_them', { name: oppName(g), left: left(g) }))}`)
      : esc(resultText(g));
    return { turn, score: esc(T('corr_days_n', { n: g.days })) }; // tên hai bên đã có ở dòng lượt / danh sách – thanh trên hẹp
  }
  function show(g) {
    if (!cur || cur.id !== g.id) return;
    const ctrl = cur.ctrl;
    if (App.ext !== ctrl) return;
    ctrl.moves = g.moves;
    App.extSet(g.moves); // dựng lại cả bàn (đi lại / nước đối thủ / kết quả) – vẽ dòng lượt qua render()
    drawBar();
  }
  function open(id) {
    if (!signedIn()) { N.toast(T('corr_need_account')); return; }
    const ctrl = {
      moves: (games.get(id) || { moves: [] }).moves,
      get rule() { const g = games.get(id); return g ? g.rule : 'vn'; },
      get canPlay() { const g = games.get(id); return !!g && myTurn(g); },
      onMove(x, y) {
        const g = games.get(id);
        if (!g || !myTurn(g)) return;
        N.send({ t: 'corrMove', id, x, y, n: g.moves.length });
        App.extPlace(x, y); // hiện ngay; bản của máy chủ (corrGame) dựng lại bàn chuẩn
        g.turn = null; // chờ máy chủ: không đánh thêm nước nữa
        drawBar();
      },
      onExit: () => leave(),
      render,
    };
    cur = { id, ctrl };
    if (!App.enterExt(ctrl)) { cur = null; N.toast(T('corr_busy')); return; }
    drawBar();
    N.send({ t: 'corrOpen', id });
  }
  function leave() {
    const was = cur;
    cur = null;
    drawBar();
    if (was && App.ext === was.ctrl) App.exitExt();
  }
  $('ext-bar').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-corr]');
    const g = cur && games.get(cur.id);
    if (!b || !g) return;
    const a = b.dataset.corr;
    if (a === 'leave') return leave();
    if (a === 'resign') { if (await window.CaroConfirm.ask(T('corr_resign_q'))) N.send({ t: 'corrResign', id: g.id }); return; }
    if (a === 'draw') return N.send({ t: 'corrDraw', id: g.id });
    if (a === 'takeback') return N.send({ t: 'corrTakeback', id: g.id });
    if (a === 'tbno') return N.send({ t: 'corrDecline', id: g.id, what: 'takeback' });
  });
  window.addEventListener('caro:extenter', () => { if (cur && App.ext !== cur.ctrl) { cur = null; drawBar(); } });

  // ------------------------------------------------------------ Tin từ máy chủ
  function refresh() { homeCard(); drawDlg(); drawBar(); }
  N.on('corrList', (m) => { for (const g of m.games) games.set(g.id, g); refresh(); });
  N.on('corrGame', (m) => { games.set(m.game.id, m.game); show(m.game); refresh(); });
  N.on('welcome', () => { games.clear(); refresh(); });
  N.on('close', refresh);
  window.addEventListener('caro:page', (e) => { if (e.detail && e.detail.id === 'home' && signedIn()) N.send({ t: 'corrList' }); });
  window.addEventListener('langchange', () => { refresh(); if (cur) show(games.get(cur.id) || { id: '' }); });
  setInterval(() => { if (cur) { const g = games.get(cur.id); if (g && g.status === 'active') App.extSet(g.moves); } }, 60000); // cập nhật "còn … giờ"

  // Xem thêm › Chơi theo lượt
  const more = $('more-corr');
  if (more) more.onclick = openList;

  window.CaroCorr = { openList, open, leave, get games() { return [...games.values()]; } };
})();
