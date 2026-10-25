/*
 * Hộp xác nhận trong app — thay confirm() gốc của trình duyệt cho các hành động trong luồng ván online
 * (đầu hàng / rời phòng / đăng xuất / bỏ ván dở / nhận thách đấu khi đang bận / Berserk).
 * Lý do bỏ confirm() gốc: giao diện lạc lõng, và trong trình duyệt nhúng (Zalo, Messenger…) hộp gốc có
 * thể bị chặn hoặc tự đóng — buổi kiểm thử 25/10 hộp gốc bị công cụ tự đóng thành "Huỷ" khiến các nút
 * trông như chết. window.CaroConfirm.ask(nội dung) → Promise<boolean>: true = Đồng ý, false = Huỷ/đóng.
 * Các hộp hỏi xếp hàng nối tiếp: gọi ask() khi đang có hộp mở thì chờ hộp trước đóng mới hiện hộp sau.
 */
(function () {
  'use strict';
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  let chain = Promise.resolve();

  function ask(text) {
    const run = () => new Promise((resolve) => {
      const d = $('confirm-dlg');
      if (!d) { resolve(false); return; } // thiếu hộp (bản cũ chưa nạp kịp): an toàn là không làm
      $('confirm-q').textContent = text;
      $('confirm-ok').textContent = T('confirm_ok');
      $('confirm-no').textContent = T('cancel');
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      d.addEventListener('close', () => done(false), { once: true }); // Esc / đóng = Huỷ
      $('confirm-ok').onclick = () => { d.close(); done(true); };
      $('confirm-no').onclick = () => { d.close(); done(false); };
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    });
    const p = chain.then(run, run);
    chain = p.then(() => {}, () => {});
    return p;
  }

  window.CaroConfirm = { ask };
})();
