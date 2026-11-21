/*
 * Nút "Tường thuật trực tiếp" (C3) cạnh nút Chia sẻ ở trang giải trực tuyến và trang giải Offline: mở trang broadcast.html
 * (/?bc=<mã> | /?bc=o.<mã>) ở thẻ mới – lưới bàn đang đấu, bảng xếp hạng, kết quả gần đây, tự cập nhật; link có thẻ xem
 * trước og nên dán vào Zalo / Messenger hiện tên giải. Chỉ hiện với giải người chưa đăng nhập xem được (công khai / link).
 * Gắn qua K.binders (chạy sau mỗi lần vẽ trang giải – tour.js), không sửa tour.js / otour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const T = (k, a) => window.I18N.t(k, a);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const base = () => (window.CARO_SERVER || location.origin).replace(/\/+$/, '');

  /** Đường dẫn tường thuật của giải đang xem, hoặc null nếu giải không công khai / chưa duyệt. */
  function bcUrl() {
    const ot = K.V && K.V.page === 'ot';
    const t = ot ? K.D.ot : K.D.tour;
    if (!t || t.access === 'private' || t.access === 'club' || ['draft', 'pending', 'rejected'].includes(t.status)) return null;
    return base() + '/?bc=' + encodeURIComponent(ot ? 'o.' + (t.slug || t.id) : t.id);
  }
  K.binders.push((body) => {
    const share = body.querySelector('[data-act="share"], [data-act="otShare"]');
    if (!share || body.querySelector('.tour-bc')) return;
    const url = bcUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.className = 'ghost tour-bc';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.cssText = 'display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:inherit'; // nút dạng link, như nút bên cạnh
    a.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-tv"/></svg>${esc(T('bc_open'))}`;
    share.after(a);
  });
})();
