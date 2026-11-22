/*
 * Nhận dữ liệu chuyển từ tên miền cũ (caro/migrate-out.js → máy chủ → link ?mig=<mã>). Nạp ĐẦU TIÊN trong <head> của
 * index.html (trước theme.js và mọi file đọc localStorage):
 *  - Không có ?mig= hợp lệ: không làm gì.
 *  - Có: ghi lại các khoá đã có trên máy TRƯỚC khi app chạy, dừng nạp trang (window.stop – app chưa chạy, chưa tạo khoá
 *    khách mới), lấy GET /api/migrate/<mã> kèm cookie vé (máy chủ chỉ trả cho trình duyệt đã bắt đầu chuyển – chống link
 *    ?mig= của người khác – và xoá ngay sau lần lấy), khôi phục các khoá caro.* CHƯA có trên máy
 *    (không ghi đè dữ liệu mới hơn ở tên mới; đã có danh sách ván trên máy thì bỏ các ván kèm theo), rồi mở lại trang
 *    không kèm ?mig=. Lỗi / quá 8 giây: vẫn mở lại trang bình thường.
 * Dữ liệu nhận được coi như không tin cậy: chỉ khoá caro.<chữ, số, . _ -> ≤ 80 ký tự, giá trị là chuỗi ≤ 300 000 ký tự.
 * API: window.CaroMigrateIn = { restore(data, had) } (bài thử).
 */
(function () {
  'use strict';
  const KEY_RE = /^caro\.[\w.-]{1,80}$/;
  const SKIP = ['caro.inRoom', 'caro.launchUrl', 'caro.heroE2E'];
  const MAX_VALUE = 300000;

  /** Ghi các khoá hợp lệ chưa có (had: { khoá: true } – các khoá có sẵn lúc mở trang). → số khoá đã ghi. */
  function restore(data, had, ls) {
    const keys = data && typeof data === 'object' && data.keys && typeof data.keys === 'object' ? data.keys : null;
    if (!keys || Array.isArray(keys)) return 0;
    const lgLocal = !!had['caro.lg.index']; // đã có danh sách ván ở tên mới: ván kèm theo sẽ mồ côi
    let n = 0;
    for (const k of Object.keys(keys).slice(0, 2000)) {
      const v = keys[k];
      if (!KEY_RE.test(k) || SKIP.includes(k) || typeof v !== 'string' || v.length > MAX_VALUE || had[k]) continue;
      if (lgLocal && k.startsWith('caro.lg.g.')) continue;
      try { ls.setItem(k, v); n++; } catch (e) { /* đầy bộ nhớ: bỏ khoá này */ }
    }
    return n;
  }
  window.CaroMigrateIn = { restore };

  const m = /[?&]mig=([A-Za-z0-9_-]{22})(?:&|#|$)/.exec(location.search);
  if (!m) return;
  let ls = null;
  const had = {};
  try {
    ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) had[ls.key(i)] = true;
  } catch (e) { ls = null; }
  try { window.stop(); } catch (e) { /* trình duyệt cũ */ }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    const u = new URL(location.href);
    u.searchParams.delete('mig');
    location.replace(u.href); // địa chỉ đầy đủ: đường dẫn "//tên-lạ/" không thành link sang trang khác
  };
  setTimeout(finish, 8000);
  if (!ls) return finish();
  // credentials 'same-origin': gửi cookie vé caro_mig (máy chủ chỉ trả dữ liệu cho đúng trình duyệt đã bắt đầu chuyển)
  fetch((window.CARO_SERVER || '') + '/api/migrate/' + m[1], { cache: 'no-store', credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d) restore(d, had, ls); })
    .catch(() => {})
    .then(finish);
})();
