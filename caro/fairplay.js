/*
 * Soát chơi đẹp – phía người chơi: trong ván online (tài khoản), đếm số lần rời tab / chuyển ứng dụng / mất tiêu điểm
 * cửa sổ KHI ĐANG TỚI LƯỢT MÌNH và tổng thời gian rời đi, gom lại rồi báo máy chủ (fpBlur, tối đa 1 tin / 4 giây).
 * Máy chủ lưu kèm ván cho quản trị viên tham khảo (server/src/hub/fairplay.js) – không tự xử phạt. Ghi trong privacy.html.
 */
(function () {
  'use strict';
  const N = window.CaroOnline, FC = window.CaroFairCore;
  if (!N || !FC) return;
  const MIN_GAP = 4000;

  function myTurn() {
    const r = N.state.room, me = N.state.me;
    if (!r || !me || me.guest || r.winner || !r.moves || !r.moves.length || !r.seats) return false;
    const side = r.seats.x === me.id ? 1 : r.seats.o === me.id ? 2 : 0;
    return !!side && r.turn === side;
  }
  const tr = FC.blurTracker(myTurn);
  let pend = null, last = 0, timer = 0;

  function flush() {
    clearTimeout(timer);
    if (!pend) return;
    const wait = last + MIN_GAP - Date.now();
    if (wait > 0) { timer = setTimeout(flush, wait); return; }
    if (!N.connected || !N.state.room) { pend = null; return; } // đã rời ván / mất mạng: bỏ
    N.send({ t: 'fpBlur', n: pend.n, ms: pend.ms });
    last = Date.now();
    pend = null;
  }
  function show() {
    const r = tr.onShow(Date.now());
    if (!r) return;
    pend = pend ? { n: pend.n + r.n, ms: pend.ms + r.ms } : r;
    flush();
  }
  const hide = () => tr.onHide(Date.now());

  document.addEventListener('visibilitychange', () => (document.hidden ? hide() : show()));
  window.addEventListener('blur', hide);
  window.addEventListener('focus', show);
  window.CaroFairplay = { get pending() { return pend; }, flush };
})();
