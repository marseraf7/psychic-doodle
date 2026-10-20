/*
 * Tuỳ chọn "Rapfi đa luồng" (Cài đặt › Cài đặt bàn cờ) và gợi ý tắt nó khi máy giật.
 *
 * Bản đa luồng (rapfi/worker.js – chỉ khi trang được cô lập cross-origin, nay là Chrome / Edge máy tính) dùng gần hết các
 * lõi: máy yếu / đang chạy nhiều việc thì trang có thể giật trong lúc BOAT nghĩ hoặc nghĩ trước. Trong lúc bản đa luồng
 * đang chạy (CaroRapfi.working), đo khoảng cách giữa hai khung hình: JANK_LIMIT lần khựng ≥ JANK_MS trong JANK_WINDOW thì
 * báo một lần (mỗi phiên) gợi ý tắt đa luồng. Không chạy gì khi Rapfi một luồng / không có Rapfi.
 *
 *   CaroRapfiSettings.sync()  – điền lại ô trong Cài đặt (ẩn khi không có Rapfi; khoá khi trình duyệt chỉ chạy một luồng)
 *   CaroRapfiSettings.hinted  – đã báo gợi ý trong phiên này chưa (kiểm thử)
 */
(function (global) {
  'use strict';
  const R = global.CaroRapfi;
  if (!R) return;
  const T = (k, v) => (global.I18N ? global.I18N.t(k, v) : k);
  const $ = (id) => document.getElementById(id);
  const HINT_KEY = 'caro.rapfiLagHint';
  const JANK_MS = 120; // khung hình trễ ngần này (≈ 7 khung 60 Hz) là người chơi thấy khựng
  const JANK_MAX = 1000; // trễ hơn: thường là trình duyệt tạm dừng vẽ (đổi thẻ, ngủ máy) – không tính
  const JANK_LIMIT = 6;
  const JANK_WINDOW = 15000;

  // ------------------------------------------------------------ Ô trong Cài đặt
  const box = () => { const f = $('settings-form'); return f && f.elements.rapfiMt; };
  function sync() {
    const el = box();
    if (!el) return;
    const row = el.closest('.li');
    row.hidden = !R.supported(); // bản iOS / trình duyệt không chạy được Rapfi
    const iso = global.crossOriginIsolated === true;
    el.disabled = !iso;
    el.checked = iso && R.mtOn();
    // Trình duyệt chưa hỗ trợ (Safari, Firefox, điện thoại): ghi rõ là luôn một luồng
    const note = row.querySelector('small');
    note.dataset.i18n = iso ? 'rapfi_mt_d' : 'rapfi_mt_na';
    note.textContent = T(note.dataset.i18n);
  }
  const el = box();
  if (el) {
    sync();
    el.addEventListener('change', () => R.setMt(el.checked));
  }
  global.addEventListener('caro:page', (e) => { if (e.detail.id === 'settings') sync(); });
  global.addEventListener('langchange', sync);

  // ------------------------------------------------------------ Phát hiện giật khi bản đa luồng chạy
  let hinted = false;
  try { hinted = sessionStorage.getItem(HINT_KEY) === '1'; } catch (e) { /* riêng tư */ }
  let hits = [], raf = 0, last = 0, poll = 0;

  function hint() {
    hinted = true;
    try { sessionStorage.setItem(HINT_KEY, '1'); } catch (e) { /* riêng tư */ }
    clearInterval(poll);
    if (global.CaroOnline) global.CaroOnline.toast(T('rapfi_mt_lag'), 9000);
  }
  function frame(t) {
    raf = 0;
    if (hinted || !R.working() || document.hidden) { last = 0; return; } // hết việc: thôi đo (đỡ pin)
    const dt = last ? t - last : 0;
    last = t;
    if (dt >= JANK_MS && dt < JANK_MAX) {
      const now = Date.now();
      hits = hits.filter((h) => now - h < JANK_WINDOW);
      hits.push(now);
      if (hits.length >= JANK_LIMIT) { hint(); return; }
    }
    raf = requestAnimationFrame(frame);
  }
  // Chỉ theo dõi khi Worker chạy bản đa luồng; mỗi giây xem nó có đang nghĩ không để bắt đầu đo khung hình
  function watch() {
    if (hinted || poll) return;
    poll = setInterval(() => {
      if (!R.mtActive()) { clearInterval(poll); poll = 0; return; }
      if (!raf && R.working() && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); }
    }, 1000);
  }
  global.addEventListener('caro:rapfi', (e) => { if (e.detail.state === 'ready' && e.detail.mt) watch(); });

  global.CaroRapfiSettings = { sync, get hinted() { return hinted; } };
})(window);
