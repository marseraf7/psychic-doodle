/*
 * Hộp xác nhận trong app — thay confirm() gốc của trình duyệt cho các hành động trong luồng ván online
 * (đầu hàng / rời phòng / đăng xuất / bỏ ván dở / nhận thách đấu khi đang bận / Berserk).
 * Lý do bỏ confirm() gốc: giao diện lạc lõng, và trong trình duyệt nhúng (Zalo, Messenger…) hộp gốc có
 * thể bị chặn hoặc tự đóng — buổi kiểm thử 25/10 hộp gốc bị công cụ tự đóng thành "Huỷ" khiến các nút
 * trông như chết. window.CaroConfirm.ask(nội dung) → Promise<boolean>: true = Đồng ý, false = Huỷ/đóng.
 * Các hộp hỏi xếp hàng nối tiếp: gọi ask() khi đang có hộp mở thì chờ hộp trước đóng mới hiện hộp sau.
 * Cùng hộp đó thay luôn prompt() / alert() gốc (cùng lý do):
 *   CaroConfirm.prompt(nội dung, giá trị sẵn, { max }) → Promise<string | null>: chữ đã nhập, null = Huỷ / đóng.
 *   CaroConfirm.info(nội dung) → Promise<void>: chỉ có nút OK.
 * QUY TẮC (CLAUDE.md): không dùng confirm() / prompt() / alert() gốc ở caro/*.js – CI chặn (tests/no-native-dialogs.js).
 */
(function () {
  'use strict';
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  let chain = Promise.resolve();

  /** mode: 'ask' (Đồng ý / Huỷ), 'prompt' (ô nhập + Đồng ý / Huỷ), 'info' (chỉ OK). */
  function open(text, mode, value = '', opts = {}) {
    const run = () => new Promise((resolve) => {
      const d = $('confirm-dlg');
      if (!d) { resolve(mode === 'prompt' ? null : false); return; } // thiếu hộp (bản cũ chưa nạp kịp): an toàn là không làm
      const input = $('confirm-in');
      $('confirm-q').textContent = text;
      $('confirm-ok').textContent = T(mode === 'info' ? 'close' : 'confirm_ok');
      $('confirm-no').textContent = T('cancel');
      $('confirm-no').hidden = mode === 'info';
      if (input) {
        input.hidden = mode !== 'prompt';
        input.value = mode === 'prompt' ? String(value == null ? '' : value) : '';
        input.maxLength = opts.max || 200;
      }
      let settled = false;
      const yes = () => (mode === 'prompt' ? (input ? input.value : '') : true);
      const no = () => (mode === 'prompt' ? null : false);
      // Esc / đóng = Huỷ. Sự kiện 'close' của hộp trước có thể tới muộn, lúc hộp này đã mở lại (hai hộp hỏi liền
      // nhau) – hộp còn đang mở thì không phải lần đóng của hộp này, bỏ qua.
      const onClose = () => { if (!d.open) done(no()); };
      const done = (v) => { if (!settled) { settled = true; d.removeEventListener('close', onClose); resolve(v); } };
      d.addEventListener('close', onClose);
      $('confirm-ok').onclick = () => { const v = yes(); d.close(); done(v); };
      $('confirm-no').onclick = () => { d.close(); done(no()); };
      if (input) input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('confirm-ok').click(); } };
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
      if (mode === 'prompt' && input) { input.focus(); input.select(); }
    });
    const p = chain.then(run, run);
    chain = p.then(() => {}, () => {});
    return p;
  }
  const ask = (text) => open(text, 'ask');
  const prompt = (text, value, opts) => open(text, 'prompt', value, opts);
  const info = (text) => open(text, 'info').then(() => {});

  window.CaroConfirm = { ask, prompt, info };
})();
