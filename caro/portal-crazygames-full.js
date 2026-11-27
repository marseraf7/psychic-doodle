/*
 * Bản CrazyGames FULL LAUNCH – LÀM SẴN, TẮT MẶC ĐỊNH (Minh chốt 27/11/2026: chỉ bật khi CrazyGames mời Full Launch và Minh
 * đồng ý). Chỉ chạy khi gói dựng bằng `build-portal.js crazygames --full` (window.CARO_CG_FULL = true); gói thường và bản
 * web / app không nạp / không chạy file này. Theo docs.crazygames.com (SDK → Video ads, User, Game; Requirements → Ads,
 * Account integration – đọc 27/11/2026):
 *  – Quảng cáo midgame CHỈ ở điểm nghỉ: hết ván với máy (không bao giờ trong / ngay sau ván online, không ở nút điều hướng).
 *    SDK tự giới hạn tần suất (≤ 1 lần / 3 phút); ở đây thêm khoảng cách tối thiểu cho chắc. Tắt tiếng + che màn hình CHỈ khi
 *    quảng cáo thật sự bắt đầu (adStarted), mở lại khi adFinished / adError. Bị chặn quảng cáo / lỗi: chơi tiếp bình thường.
 *    Không có quảng cáo thưởng.
 *  – Tài khoản CrazyGames: người chơi đã đăng nhập CrazyGames → lấy token (getUserToken IN_GAME_AUTH, sống 1 giờ – không lưu)
 *    → máy chủ kiểm (server/src/crazygames-auth.js) → vào / tạo tài khoản Caro gắn với tài khoản CrazyGames (tiến độ lưu ở máy
 *    chủ – cách "backend qua User module" của CrazyGames). Chưa đăng nhập: chơi khách; nút nhỏ "Đăng nhập bằng CrazyGames" ở
 *    thẻ tài khoản (không phải nút chính, không tự bật hộp đăng nhập). Phiên trong game luôn theo tài khoản CrazyGames: CrazyGames
 *    đăng xuất / đổi người → game đăng xuất phiên cũ (máy dùng chung không vào nhầm tài khoản người khác). Không có nút Đăng
 *    xuất trong game (CrazyGames không cho) – host.css ẩn.
 *  – Link mời phòng: SDK game.inviteLink({ room }) thay link máy chủ; mở game từ link mời → vào phòng (getInviteParam).
 *  – Chữ "không quảng cáo" ở Trang chủ đổi sang câu không nhắc quảng cáo (home_intro_free).
 * Hàm thuần (kiểm thử trên Node – caro/tests/portal-crazygames-full.test.js): adAllowed, sessionAction.
 */
(function (root) {
  'use strict';
  const AD_GAP_MS = 3 * 60 * 1000;
  const AD_DELAY_MS = 1200; // để thẻ kết quả hiện trước

  /** Được xin quảng cáo midgame không: s = { full, playing, online, replay, busy, now, last }. */
  function adAllowed(s) {
    return !!s && !!s.full && !s.playing && !s.online && !s.replay && !s.busy && s.now - (s.last || 0) >= AD_GAP_MS;
  }

  /**
   * Phiên trong game so với tài khoản CrazyGames → việc cần làm:
   *   cg: id người dùng CrazyGames (getUser – chỉ để so sánh trên máy, không dùng để xác thực) hoặc null (chưa đăng nhập);
   *   guest: phiên game đang là khách; mine: id CrazyGames lúc phiên game hiện tại được cấp (lưu trên máy) hoặc ''.
   * → 'login' (khách + có CrazyGames) | 'logout' (phiên tài khoản không thuộc người CrazyGames hiện tại) | 'none'.
   */
  function sessionAction({ cg, guest, mine }) {
    if (guest) return cg ? 'login' : 'none';
    if (!cg) return mine ? 'logout' : 'none'; // tài khoản Caro không đến từ CrazyGames (vd. còn từ trước): để nguyên
    return mine === cg ? 'none' : 'logout';
  }

  const api = { adAllowed, sessionAction, AD_GAP_MS };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.CaroCrazyFull = api;
  if (root.CARO_PORTAL !== 'crazygames' || root.CARO_CG_FULL !== true) return;
  document.documentElement.classList.add('cg-full');

  const LS = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* riêng tư */ } },
  };
  const MINE = 'caro.cgUser'; // id CrazyGames của phiên game đang đăng nhập (so sánh, không phải bí mật)
  const T = (k, a) => root.I18N.t(k, a);

  // Trang chủ: câu giới thiệu không nhắc "không quảng cáo"
  function introFree() {
    const el = document.querySelector('[data-i18n="home_intro"]');
    if (el) { el.setAttribute('data-i18n', 'home_intro_free'); el.textContent = T('home_intro_free'); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', introFree); else introFree();

  // SDK thường sẵn sàng TRƯỚC khi mã game (online.js…) chạy xong: chờ cả sự kiện load của trang
  const loaded = new Promise((r) => { if (document.readyState === 'complete') r(); else root.addEventListener('load', r, { once: true }); });
  Promise.all([root.CaroCrazy.ready, loaded]).then(([SDK]) => {
    if (!SDK) return; // SDK không có: chơi khách như bản Basic, không quảng cáo
    ads(SDK);
    invites(SDK);
    account(SDK);
  });

  // ------------------------------------------------------------ Quảng cáo midgame
  function ads(SDK) {
    if (!SDK.ad || typeof SDK.ad.requestAd !== 'function') return;
    let busy = false, last = 0, cover = null, safety = 0;
    const playing = () => {
      const App = root.CaroApp;
      return !!(App && App.local && !App.local.winner && !(root.CaroShell && root.CaroShell.visible));
    };
    const online = () => { const on = root.CaroApp && root.CaroApp.online; return !!(on && on.room); };
    function end() {
      clearTimeout(safety);
      busy = false;
      last = Date.now();
      if (cover) { cover.remove(); cover = null; }
      let st = null;
      try { st = SDK.game.settings; } catch (e) { st = null; }
      if (root.CaroSound) root.CaroSound.hostMute = !!(st && st.muteAudio); // trả lại đúng cài đặt tắt tiếng của cổng
    }
    function request() {
      if (!adAllowed({ full: true, playing: playing(), online: online(), replay: !!(root.CaroApp && root.CaroApp.replay), busy, now: Date.now(), last })) return;
      busy = true;
      safety = setTimeout(end, 120000); // SDK không gọi lại (lỗi hiếm): không kẹt cờ busy
      try {
        SDK.ad.requestAd('midgame', {
          adStarted: () => {
            if (root.CaroSound) root.CaroSound.hostMute = true;
            cover = document.createElement('div');
            cover.id = 'cg-ad-cover';
            cover.setAttribute('aria-hidden', 'true');
            document.body.appendChild(cover); // chặn chạm vào game tới khi quảng cáo xong
          },
          adFinished: end,
          adError: end, // bị chặn quảng cáo, hết quảng cáo, chưa tới lượt…: chơi tiếp
        });
      } catch (e) { end(); }
    }
    root.addEventListener('caro:gameover', () => setTimeout(request, AD_DELAY_MS));
  }

  // ------------------------------------------------------------ Link mời
  function invites(SDK) {
    const G = SDK.game;
    if (!G) return;
    if (typeof G.inviteLink === 'function') {
      root.CaroInvite = (code) => { const l = G.inviteLink({ room: String(code) }); return typeof l === 'string' ? l : ''; };
    }
    let room = null;
    try { room = typeof G.getInviteParam === 'function' ? G.getInviteParam('room') : null; } catch (e) { room = null; }
    if (room && /^\d{4,6}$/.test(room) && root.CaroOnline) root.CaroOnline.openRoomLink(room);
  }

  // ------------------------------------------------------------ Tài khoản CrazyGames
  function account(SDK) {
    const U = SDK.user, N = root.CaroOnline;
    if (!U || !N || !U.isUserAccountAvailable) return;
    let providers = [], cgUser = undefined, running = false, created = false;

    async function token() {
      try { return await U.getUserToken({ signingKeyType: 'IN_GAME_AUTH' }); } catch (e) { return null; }
    }
    async function sync() {
      if (running || !providers.includes('crazygames') || N.state.status !== 'online' || !N.state.me) return;
      running = true;
      try {
        let u = null;
        try { u = await U.getUser(); } catch (e) { u = null; }
        cgUser = u;
        const me = N.state.me;
        const act = sessionAction({ cg: u && u.__dangerousUserId ? String(u.__dangerousUserId) : null, guest: !!me.guest, mine: LS.get(MINE) || '' });
        if (act === 'logout') { LS.set(MINE, null); N.send({ t: 'logout' }); return; } // welcome khách đến sau → sync lại
        if (act === 'login') {
          const tk = await token();
          if (tk) N.send({ t: 'hostLogin', provider: 'crazygames', data: tk, mode: 'auto' });
        }
      } finally {
        running = false;
        renderCard();
      }
    }
    async function create() {
      if (created) return;
      created = true;
      const tk = await token();
      if (tk) N.send({ t: 'hostLogin', provider: 'crazygames', data: tk, mode: 'create', name: cgUser && cgUser.username ? String(cgUser.username).slice(0, 64) : '' });
    }

    N.on('welcome', (m) => {
      providers = Array.isArray(m.hostAuth) ? m.hostAuth : [];
      // Vừa đăng nhập bằng CrazyGames (không phải khách): ghi id CrazyGames của phiên này để lần mở sau so sánh
      if (!m.me.guest && cgUser && cgUser.__dangerousUserId && (m.me.hosts || []).includes('crazygames')) LS.set(MINE, String(cgUser.__dangerousUserId));
      if (m.me.guest) created = false;
      sync();
    });
    N.on('hostState', (m) => { if (m.provider === 'crazygames' && m.state === 'unlinked') create(); });
    try { U.addAuthListener(() => { cgUser = undefined; sync(); }); } catch (e) { /* bản SDK không có */ }
    // SDK sẵn sàng SAU tin welcome đầu tiên (thường gặp): đọc danh sách nền tảng đã nhận rồi đồng bộ ngay
    providers = Array.isArray(N.state.hostAuth) ? N.state.hostAuth : [];
    sync();

    /** Khách chưa đăng nhập CrazyGames: nút nhỏ "Đăng nhập bằng CrazyGames" ở thẻ tài khoản (không phải nút chính). */
    function renderCard() {
      const old = document.getElementById('cg-login-row');
      if (old) old.remove();
      const el = document.getElementById('account');
      const me = N.state.me;
      if (!el || !me || !me.guest || cgUser !== null || !providers.includes('crazygames') || typeof U.showAuthPrompt !== 'function') return;
      el.insertAdjacentHTML('beforeend', `<div id="cg-login-row" class="row"><button type="button" class="ghost sm" id="cg-login"></button></div>`);
      const b = document.getElementById('cg-login');
      b.textContent = T('cg_login');
      b.onclick = async () => {
        b.disabled = true;
        try { await U.showAuthPrompt(); } catch (e) { /* người chơi huỷ / đang mở */ }
        b.disabled = false;
        cgUser = undefined;
        sync();
      };
    }
    root.addEventListener('caro:online', renderCard);
  }
})(this);
