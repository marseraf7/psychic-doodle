/*
 * Link chia sẻ (A3 – Zalo / Messenger): dựng link, gửi link, đón người mở link.
 * window.CaroShareLink:
 *   url(kind, id)              – link tuyệt đối: kind 'replay' | 'room' | 't' | 'o' | 'club' | 'u' (hồ sơ, tên đăng nhập).
 *   send({ url, title, text }) – bảng chia sẻ của máy (navigator.share) nếu có; không thì sao chép "lời nhắn + link" và
 *                                báo; không sao chép được (trình duyệt nhúng chặn) thì hiện link trong hộp để tự chép.
 *   landing                    – loại link trang được mở bằng (đọc lúc nạp, trước khi các module xoá tham số) hoặc null.
 * Khách mở link (chưa đăng nhập): nội dung hiện ngay (ván, phòng, giải, CLB, hồ sơ – không cần đăng nhập), kèm một thẻ nhỏ
 * có nút hành động: "Chơi ngay" (ván / CLB / hồ sơ), "Vào phòng" (phòng còn ghế), "Đăng ký giải" (giải đấu).
 * Link hồ sơ ?u=<tên đăng nhập>: mở hồ sơ ngay khi kết nối xong (profile.js). Máy chủ: thẻ xem trước og (server/src/og-meta.js).
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const $ = (id) => document.getElementById(id);
  const KINDS = ['replay', 'room', 't', 'o', 'club', 'u'];
  const q = new URLSearchParams(location.search);
  const landing = KINDS.find((k) => q.get(k)) || null;
  const landId = landing ? String(q.get(landing)).slice(0, 40) : null;
  const N = () => window.CaroOnline;
  const toast = (m) => N() && N().toast(m);

  function url(kind, id) {
    const base = N() && N().base;
    const u = new URL(base ? base + '/' : location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set(kind, id);
    return u.toString();
  }

  async function send({ url: link, title, text }) {
    if (navigator.share) {
      try { await navigator.share({ title: title || T('app_title'), text, url: link }); return 'shared'; } catch (e) {
        if (e && e.name === 'AbortError') return 'cancel'; // người dùng tự đóng bảng chia sẻ
      }
    }
    try {
      await navigator.clipboard.writeText(text ? text + '\n' + link : link);
      toast(T('sl_copied'));
      return 'copied';
    } catch (e) { /* trình duyệt nhúng chặn clipboard */ }
    await window.CaroConfirm.prompt(title || T('share_game'), link, { max: 500 });
    return 'shown';
  }

  // ------------------------------------------------------------ Thẻ mời khách mở link
  const guest = () => { const S = N() && N().state; return !(S && S.me && !S.me.guest); };
  let card = null, closed = false;

  /** Nút hành động theo loại link (và trạng thái hiện tại – phòng còn ghế mới "Vào phòng"). */
  function ctaKind() {
    if (landing === 't' || landing === 'o') return 'reg';
    if (landing === 'room') { const j = $('wt-join'); return j && !j.hidden ? 'room' : 'play'; }
    return 'play';
  }
  function act(kind) {
    const App = window.CaroApp, O = N();
    hide(true);
    if (kind === 'room') { const j = $('wt-join'); if (j && !j.hidden) j.click(); return; }
    if (kind === 'reg') { if (O && O.openAuth) O.openAuth('register'); return; }
    // Chơi ngay: rời ván đang xem / hồ sơ đang mở, mở bảng Ván mới (chơi với máy, không cần tài khoản)
    if (O && O.isOpen && O.isOpen('profile-dlg')) O.closeDlg('profile-dlg');
    if (App.replay) App.closeReplay(true);
    if (App.watching) { const l = $('wt-leave'); if (l) l.click(); }
    App.openNewGame();
  }
  function render() {
    if (!card) return;
    const k = ctaKind();
    card.querySelector('.lc-hint').textContent = T(k === 'reg' ? 'sl_cta_hint_reg' : k === 'room' ? 'sl_cta_hint_room' : 'sl_cta_hint_play');
    const b = card.querySelector('.lc-go');
    b.textContent = T(k === 'reg' ? 'sl_cta_reg' : k === 'room' ? 'sl_cta_room' : 'sl_cta_play');
    b.dataset.kind = k;
    card.querySelector('.lc-x').setAttribute('aria-label', T('sl_cta_close'));
  }
  function show() {
    if (closed || !landing || !guest()) return;
    if (!card) {
      card = document.createElement('div');
      card.className = 'link-cta';
      card.id = 'link-cta';
      card.setAttribute('role', 'region');
      card.innerHTML = '<span class="lc-hint"></span><button type="button" class="primary sm lc-go"></button><button type="button" class="ghost sm lc-x">✕</button>';
      card.querySelector('.lc-go').onclick = (e) => act(e.currentTarget.dataset.kind);
      card.querySelector('.lc-x').onclick = () => hide(true);
      document.body.appendChild(card);
    }
    render();
    card.hidden = false;
    place();
  }
  function hide(forever) {
    if (forever) closed = true;
    if (card) card.hidden = true;
  }
  // Trang giải / CLB / hồ sơ mở bằng hộp thoại modal (lớp trên cùng, phần còn lại của trang không bấm được): thẻ nằm
  // trong hộp thoại modal mở sau cùng, không thì trong <body>
  let topModal = null;
  const isModal = (d) => { try { return d.open && d.matches(':modal'); } catch (e) { return false; } };
  function place() {
    if (!card) return;
    if (topModal && !isModal(topModal)) topModal = [...document.querySelectorAll('dialog[open]')].filter(isModal).pop() || null;
    const host = topModal || document.body;
    if (card.parentNode !== host) host.appendChild(card);
  }
  new MutationObserver((list) => {
    for (const m of list) if (m.target.tagName === 'DIALOG' && isModal(m.target)) topModal = m.target;
    place();
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });

  // Gắn các móc khi mọi file đã nạp (file này nạp sớm – trước online.js – để kịp đọc tham số link trước khi bị xoá)
  function hook() {
    if (landing) {
      // Nội dung đã mở (ván xem lại / trang giải…) rồi mới hiện thẻ – không che lúc đang nạp
      const later = () => setTimeout(show, 1500);
      if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
      window.addEventListener('caro:online', () => { if (!guest()) hide(true); else render(); }); // vừa đăng nhập: thôi mời
      window.addEventListener('langchange', render);
      if (N()) N().on('room', () => setTimeout(render, 0)); // phòng đổi (ghế trống / đã ngồi): đổi nút cho đúng
    }
    // Link hồ sơ ?u=<tên đăng nhập>: mở hồ sơ khi kết nối xong (khách cũng xem được)
    if (landing === 'u' && N()) {
      const name = landId.replace(/[^\w.]/g, '').slice(0, 20);
      let done = false;
      const openIt = () => {
        if (done || !name || !window.CaroProfile) return;
        done = true;
        const u = new URL(location.href);
        u.searchParams.delete('u');
        history.replaceState(null, '', u);
        window.CaroProfile.openName(name);
      };
      N().on('welcome', openIt);
      if (N().connected) setTimeout(openIt, 0);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook, { once: true }); else setTimeout(hook, 0);

  window.CaroShareLink = { url, send, landing, show, hide };
})();
