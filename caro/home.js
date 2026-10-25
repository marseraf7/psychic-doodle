/*
 * Trang chủ (như trang chủ Lichess):
 *   cột giữa – 3 thẻ: Xếp cặp nhanh (lưới ô thời gian, match.js) · Phòng chờ (tạo phòng + sảnh) · Với máy (lưới ô luật × sức cờ)
 *   cột phải – nút lớn: Tạo phòng, Thách đấu một người bạn, Chơi với máy (bảng Ván mới), 2 người một máy
 *   cột trái – thẻ giải đấu, giới thiệu
 *   trên cùng – thẻ "Tiếp tục ván" (ván với máy đang dở / ván online đang chơi), lời mời
 * Bảng Online cũ (#online) được chuyển thành trang này: mở bảng Online = mở Trang chủ (shell.js proxy).
 * API: window.CaroHome = { open, pane(id), render }
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = window.I18N.t;
  const App = window.CaroApp;
  const Shell = window.CaroShell;
  const N = window.CaroOnline;
  const Bots = window.CaroBots;
  const { X } = window.Caro;
  const esc = App.esc;
  const RULES = ['vn', 'free', 'std', 'renju'];
  const KEY = 'caro.homePane';
  const noOnline = () => document.body.classList.contains('no-online');

  Shell.proxy('online', 'home');

  // ---------------------------------------------------------------- 3 thẻ
  let pane = 'quick';
  try { pane = localStorage.getItem(KEY) || 'quick'; } catch (e) { /* riêng tư */ }
  function showPane(id) {
    if (noOnline() && id !== 'bot') id = 'bot';
    pane = id;
    try { localStorage.setItem(KEY, id); } catch (e) { /* riêng tư */ }
    document.querySelectorAll('.home-tabs [data-hpane]').forEach((b) => {
      b.classList.toggle('on', b.dataset.hpane === id);
      b.setAttribute('aria-selected', String(b.dataset.hpane === id));
    });
    document.querySelectorAll('.hpane').forEach((p) => { p.hidden = p.dataset.hpane !== id; });
    if (id === 'bot') renderBots();
  }
  document.querySelectorAll('.home-tabs [data-hpane]').forEach((b) => { b.onclick = () => showPane(b.dataset.hpane); });

  // ---------------------------------------------------------------- Với máy: ô luật × sức cờ
  // 4 hàng luật × 3 cột: 3 mức cao nhất đã mở khoá (mới chơi: 600 · 900 · 1200). Nhân vật theo lối đánh đang chọn.
  function tiers() {
    const n = App.unlockedTiers();
    return [n - 2, n - 1, n].filter((t) => t >= 1);
  }
  function styleNow() {
    const b = Bots.get(App.local.bot);
    return b ? b.style : 'atk';
  }
  function renderBots() {
    const st = styleNow();
    const ts = tiers();
    $('home-bots').innerHTML = RULES.map((rule) => ts.map((tier) => {
      const b = Bots.of(tier, st); // mức trùm cuối chỉ có BOAT
      return `<button type="button" class="qm-tile" data-bot-rule="${rule}" data-bot="${b.id}" title="${esc(T('bot_' + b.id))}">
        <b>~${b.elo}</b><small>${esc(T('grule_s_' + rule))}</small></button>`;
    }).join('')).join('');
    $('home-bot-hint').textContent = T('home_bot_hint', { style: T('style_' + st) });
  }
  $('home-bots').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bot-rule]');
    if (!b) return;
    App.startPreset({ rule: b.dataset.botRule, bot: b.dataset.bot, human: X, moves: [] });
  });

  // ---------------------------------------------------------------- Nút cột phải
  const ACT = {
    create: () => { showPane('lobby'); $('create-card').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
    challenge: () => { Shell.open('more'); setTimeout(() => $('friends').scrollIntoView({ block: 'start', behavior: 'smooth' }), 50); },
    bot: () => App.openNewGame(),
    pvp: () => App.startPreset({ rule: App.local.rule, mode: 'pvp', moves: [] }),
  };
  document.querySelectorAll('[data-home]').forEach((b) => { b.onclick = () => ACT[b.dataset.home](); });
  // Ô "Tuỳ chỉnh" của lưới ghép trận: tạo phòng với thời gian tự chọn
  $('qm-custom').onclick = ACT.create;

  // ---------------------------------------------------------------- Thẻ "Tiếp tục ván"
  function renderResume() {
    const el = $('home-resume');
    const on = App.online;
    let html = '';
    if (on && !App.watching) {
      // Ván đã có kết quả: thẻ không còn là "đang chơi" — đổi nhãn thành xem kết quả (trước đây ván
      // xong lâu rồi thẻ vẫn ghi "Quay lại ván đang chơi"). Phòng đang chờ / ván đang đánh giữ nhãn cũ.
      const r = on.room;
      const done = !!r.winner;
      const opp = r.players.find((p) => p.id !== on.me);
      const wantsRematch = done && opp && (r.rematch || []).includes(opp.id);
      const small = `${esc(T('room_code_label'))} ${esc(r.code || '')}` + (wantsRematch ? ` · ${esc(T('home_resume_rematch'))}` : '');
      html = `<button type="button" class="resume-card" data-resume><svg class="ico" aria-hidden="true"><use href="#i-play"/></svg>
        <span><b>${esc(T(done ? 'home_resume_result' : 'home_resume_online'))}</b><small>${small}</small></span></button>`;
    } else if (!on && !App.replay && !App.ext) {
      const L = App.local;
      if (L.moves && !L.winner) {
        const sub = L.mode === 'ai' ? T('home_resume_bot', { name: T('bot_' + L.bot), n: L.moves }) : T('home_resume_pvp', { n: L.moves });
        const av = L.mode === 'ai' && window.CaroBotPicker ? window.CaroBotPicker.avatarHtml(L.bot, 'sm') : '<svg class="ico" aria-hidden="true"><use href="#i-play"/></svg>';
        html = `<button type="button" class="resume-card" data-resume>${av}
          <span><b>${esc(T('home_resume'))}</b><small>${esc(sub)}${esc(window.I18N.ruleTag(L.rule))}</small></span></button>`;
      }
    }
    el.innerHTML = html;
    el.hidden = !html;
  }
  $('home-resume').addEventListener('click', (e) => { if (e.target.closest('[data-resume]')) App.toBoard(); });

  function render() {
    showPane(pane);
    renderResume();
  }

  /** Mở Trang chủ: kết nối máy chủ (để có sảnh, ghép trận) rồi hiện trang. */
  function open() {
    if (N && !noOnline()) {
      N.connect();
      N.render();
    }
    render();
    if (N) N.openDlg('online'); else Shell.go('home');
  }

  // Chấm đỏ trên tab Trang chủ khi có lời mời (giống chấm trên nút Online cũ)
  const badge = $('online-badge');
  if (badge) new MutationObserver(() => { $('home-badge').hidden = badge.hidden; }).observe(badge, { attributes: true, attributeFilter: ['hidden'] });

  window.addEventListener('caro:page', (e) => { if (e.detail.id === 'home') render(); });
  // Phòng đổi (ghép trận mới, ván xong…) trong lúc đang ở Trang chủ: vẽ lại thẻ "Quay lại ván" – trước đây thẻ giữ mã
  // phòng của ván trước tới khi mở lại trang
  if (N) N.on('room', () => { if (Shell.current === 'home') renderResume(); });
  // Bản tĩnh không có máy chủ (online.js gắn class no-online sau khi hỏi máy chủ): chuyển sang thẻ Với máy
  new MutationObserver(() => { if (noOnline() && pane !== 'bot' && Shell.current === 'home') render(); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('langchange', () => { if (Shell.current === 'home') render(); });

  window.CaroHome = { open, pane: showPane, render };

  // Mở app: vào Trang chủ (trừ khi đã vào bàn cờ – link xem lại, đang trong phòng…)
  if (!App.online && !App.replay && !App.ext) open();
  else Shell.hide(); // khung hiện sẵn từ HTML (index.html): mở thẳng vào bàn cờ thì ẩn đi
})();
