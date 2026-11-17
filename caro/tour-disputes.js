/*
 * Giải đấu – ván mất kết nối: người chơi mất kết nối quá 90 giây thì bị xử thua ván; ban tổ chức thấy danh sách
 * các ván này trên trang giải và chọn: Công nhận / Huỷ kết quả / Cho đấu lại.
 *   Arena: kết quả tính ngay, xử lý được tới khi giải kết thúc.
 *   Nhánh đấu: trận tạm dừng chờ quyết định, quá 5 phút thì tự công nhận.
 * Máy chủ: server/src/hub/disputes.js. Nạp sau tour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, D, icon } = K;

  function disputesHtml(t) {
    const list = t.disputes || [];
    if (!list.length) return '';
    const open = list.filter((d) => d.status === 'open');
    const now = Date.now() + (D.skew || 0);
    // Vẽ mọi bản ghi máy chủ gửi (mọi khiếu nại còn mở + các khiếu nại đã xử gần đây) – trước đây chỉ vẽ 10 nên khiếu nại mở cũ bị giấu
    const rows = list.map((d) => {
      const line = esc(T('dispute_line', { l: d.l ? d.l.name : '?', w: d.w ? d.w.name : '?' }));
      let tail;
      if (d.status === 'open') {
        // Đồng hồ đếm lùi (class cd – tour.js tick cập nhật mỗi giây; trước đây số phút đứng yên tới lần vẽ lại kế)
        const wait = d.deadline ? ` · <span class="cd" data-at="${Number(d.deadline)}" data-prefix="dispute_auto_in_t">${esc(T('dispute_auto_in', { n: Math.max(0, Math.ceil((d.deadline - now) / 60000)) }))}</span>` : '';
        tail = `<small class="loss">${esc(T('dispute_open'))}${wait}</small>`;
        if (K.can(t, 'disputes') && t.status === 'running') {
          const b = (a, cls) => `<button type="button" class="${esc(cls)} sm" data-act="dispute" data-did="${esc(d.id)}" data-v="${a}">${esc(T('dispute_' + a))}</button>`;
          tail += `<div class="row">${b('confirm', 'ghost')}${b('annul', 'ghost')}${b('replay', 'primary')}</div>`;
        }
      } else tail = `<small class="muted">${esc(T('dispute_' + d.status))}${d.auto ? ' · ' + esc(T('dispute_auto')) : ''}</small>`;
      const replay = d.share ? `<a href="#" data-act="replay" data-share="${esc(d.share)}" aria-label="${esc(T('replay'))}">${icon('play')}</a>` : '';
      return `<li class="dispute ${esc(d.status)}"><div class="pn"><b>${line}</b>${tail}</div>${replay}</li>`;
    }).join('');
    return `<details class="disputes" ${open.length ? 'open' : ''}><summary><b>${esc(T('dispute_title'))}</b>
      ${open.length ? `<span class="count">${open.length}</span>` : ''}</summary>
      ${t.canManage ? `<p class="hint">${esc(T(t.format === 'arena' ? 'dispute_help_arena' : 'dispute_help_bracket'))}</p>` : ''}
      <ul class="people">${rows}</ul></details>`;
  }

  K.acts.dispute = async (b) => {
    const v = b.dataset.v;
    if (!(await window.CaroConfirm.ask(T('dispute_confirm_' + v)))) return;
    // Khoá nút trong lúc chờ; máy chủ từ chối (khiếu nại đã xử / không còn) thì không có bản cập nhật nào tới – tự mở lại sau
    // 3 giây và xin lại trang giải để danh sách đúng với máy chủ (trước đây nút xám mãi)
    b.disabled = true;
    O.send({ t: 'tourDispute', id: D.tour.id, dispute: b.dataset.did, action: v });
    const id = D.tour.id;
    setTimeout(() => { if (b.isConnected) { b.disabled = false; O.send({ t: 'tourGet', id }); } }, 3000);
  };
  K.disputesHtml = disputesHtml;
})();
