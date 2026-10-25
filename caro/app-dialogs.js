/*
 * Ván – bảng "Ván mới" (chế độ, cầm quân, đối thủ, luật, thời gian → bắt đầu ngay) và Cài đặt (ván chơi, hiển thị,
 * âm thanh & thao tác, ngôn ngữ, đặt lại tỉ số). app.js gọi window.CaroAppDialogs(env) một lần (gắn sự kiện); trả về { openNewGame, setSetting }.
 */
(function () {
  'use strict';
  window.CaroAppDialogs = function (env) {
    const $ = (id) => document.getElementById(id);
    const T = window.I18N.t;
    const TC = window.CaroTimeCtl; // các mức thời gian (timectl.js)
    const { X, O, ruleOf } = window.Caro;
    const { state, botAllowed, newGame, toBoard, save, updateUI, requestDraw, resetClock, maybeAI } = env;

    $('btn-new').onclick = () => openNewGame();

    // Bảng chọn nhanh khi bấm "Ván mới": chế độ, cầm quân, độ khó, thời gian – rồi bắt đầu ngay.
    // Thời gian ván trên máy dạng chữ của bộ chọn thời gian (tc-picker.js): 't0' | 't20' | 'c5+3'
    const tcValue = () => TC.toValue({ timeLimit: state.timeLimit, clock: state.clockSpec });
    function setTc(v) {
      const t = TC.fromValue(v);
      state.timeLimit = t.timeLimit;
      state.clockSpec = t.clock;
    }
    const ngDlg = $('newgame');
    const ngForm = $('newgame-form');
    function openNewGame() {
      if (state.online) return;
      ngForm.mode.value = state.mode;
      ngForm.human.value = state.sidePick;
      ngForm.rule.value = state.rule;
      renderRuleHint();
      renderBotPicker();
      window.CaroTcPicker.set($('ng-tc'), tcValue());
      ngForm.classList.toggle('pvp', state.mode === 'pvp');
      if (ngDlg.showModal) ngDlg.showModal(); else ngDlg.setAttribute('open', '');
    }
    ngForm.addEventListener('change', () => { ngForm.classList.toggle('pvp', ngForm.mode.value === 'pvp'); renderRuleHint(); });
    function renderRuleHint() { $('ng-rule-hint').textContent = T('grule_' + ngForm.rule.value + '_d'); }
    ngForm.addEventListener('submit', () => {
      state.mode = ngForm.mode.value;
      state.sidePick = ngForm.human.value;
      state.human = state.sidePick === 'r' ? (Math.random() < 0.5 ? X : O) : Number(state.sidePick); // Ngẫu nhiên: bốc thăm mỗi ván
      state.rule = ruleOf(ngForm.rule.value);
      if (botAllowed(ngForm.bot.value)) state.bot = ngForm.bot.value;
      setTc(ngForm.tc.value);
      newGame();
      toBoard();
    });
    // Bảng chọn nhân vật (lối đánh, ảnh, mô tả) nằm ở bot-picker.js, dùng chung cho Ván mới và Cài đặt
    const renderBotPicker = () => window.CaroBotPicker.render($('ng-picker'), state.bot);

    const dlg = $('settings');
    const form = $('settings-form');
    // Ngôn ngữ: mỗi thứ tiếng một hàng chọn (trang con "Ngôn ngữ" của Cài đặt)
    $('lang-list').innerHTML = window.I18N.LANGS.map(([code, label]) => `<label class="li"><span class="li-t">${label}</span><input type="radio" name="lang" value="${code}"><svg class="ico tick" aria-hidden="true"><use href="#i-check"/></svg></label>`).join('');
    function fillForm() {
      form.mode.value = state.mode;
      form.human.value = String(state.human);
      form.rule.value = state.rule;
      window.CaroBotPicker.render($('set-picker'), state.bot);
      window.CaroTcPicker.set($('set-tc'), tcValue());
      form.allowUndo.checked = state.allowUndo;
      form.sound.checked = window.CaroSound.enabled;
      form.soundStyle.value = window.CaroSound.style;
      form.soundVol.value = window.CaroSound.volume;
      form.board.value = window.CaroStyle.board;
      form.pieces.value = window.CaroStyle.pieces;
      if (window.CaroBarPos) form.barPos.value = window.CaroBarPos.saved();
      form.theme.value = window.CaroTheme.get();
      form.elements.lang.value = window.I18N.lang;
      form.confirm.checked = state.confirm;
      if (form.premove) form.premove.checked = window.CaroPremove.enabled;
      form.classList.toggle('pvp', state.mode === 'pvp');
    }
    $('btn-settings').onclick = () => {
      fillForm();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    };
    form.addEventListener('change', () => {
      const prevMode = state.mode, prevHuman = state.human, prevTime = tcValue(), prevRule = state.rule;
      state.mode = form.mode.value;
      state.rule = ruleOf(form.rule.value);
      state.human = Number(form.human.value);
      if (form.bot && botAllowed(form.bot.value)) state.bot = form.bot.value; // trang Cài đặt mở trực tiếp chưa render picker (bot/tc chỉ render khi mở bảng Cài đặt): không có ô thì bỏ qua, các ô khác vẫn áp dụng
      if (form.tc) setTc(form.tc.value);
      state.sidePick = String(state.human);
      state.allowUndo = form.allowUndo.checked;
      window.CaroSound.enabled = form.sound.checked;
      window.CaroSound.volume = form.soundVol.value;
      if (window.CaroSound.style !== form.soundStyle.value) { window.CaroSound.style = form.soundStyle.value; window.CaroSound.play('placeX'); }
      if (window.CaroStyle.board !== form.board.value || window.CaroStyle.pieces !== form.pieces.value) window.CaroStyle.set({ board: form.board.value, pieces: form.pieces.value });
      if (window.CaroBarPos && window.CaroBarPos.saved() !== form.barPos.value) window.CaroBarPos.setSaved(form.barPos.value);
      state.confirm = form.confirm.checked;
      if (form.premove) window.CaroPremove.setEnabled(form.premove.checked);
      window.CaroTheme.set(form.theme.value);
      window.I18N.setLang(form.elements.lang.value);
      if (prevTime !== tcValue()) { if (state.clocks && state.clocks.local) state.clocks = null; resetClock(); }
      state.pending = null;
      form.classList.toggle('pvp', state.mode === 'pvp');
      const changedSides = prevMode !== state.mode || prevHuman !== state.human;
      save();
      updateUI();
      requestDraw();
      if (prevRule !== state.rule) newGame(); // đổi luật: bắt đầu ván mới theo luật mới
      else if (changedSides && state.board.moves.length && !state.winner) newGame();
    });
    dlg.addEventListener('close', () => { updateUI(); maybeAI(); if (!state.clock) resetClock(); });
    $('reset-score').onclick = () => {
      state.score = { 1: 0, 2: 0 };
      save();
      updateUI();
    };

    /**
     * Đổi một mục Cài đặt từ chỗ khác (Cài đặt nhanh – quick-settings.js) đúng như khi người chơi đổi trong Cài đặt:
     * điền lại cả bảng theo trạng thái hiện tại rồi chỉ đổi ô name (các mục khác giữ nguyên, không bắt đầu ván mới).
     */
    function setSetting(name, value) {
      fillForm();
      const el = form.elements[name];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!value; else el.value = value;
      form.dispatchEvent(new Event('change'));
    }

    return { openNewGame, setSetting };
  };
})();
