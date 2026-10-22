// Lưu toàn bộ game vào bộ nhớ đệm để chơi được cả khi mất mạng.
const CACHE = 'caro-v97';
// M-F1: tách danh sách tải sẵn làm hai nhóm. Nhóm lõi (trang + mã + kiểu) cài bằng addAll —
// thiếu một file là bản dựng hỏng thật nên cài đặt phải hỏng theo. Nhóm phụ (ảnh nhân vật,
// phông chữ, dữ liệu puzzles, trang tĩnh phụ) cài từng file: một file lỗi (đổi tên, mạng
// chớp) KHÔNG được phép làm hỏng cả lượt cài như trước (addAll cũ: 1 file 404 = mất offline).
const CORE = [
  './', 'index.html', 'style.css', 'style-online.css', 'style-tour.css', 'style-study.css',
  'style-extras.css', 'shell.css', 'setup.css', 'game.css', 'pages.css', 'topbar.css',
  'chat-bubbles.css', 'corners.js', 'config.js', 'theme.js', 'boardstyle.js', 'i18n.js',
  'i18n-online.js', 'i18n-play.js', 'i18n-account.js', 'i18n-social.js', 'i18n-tour.js', 'i18n-tour-stages.js',
  'i18n-club.js', 'i18n-study.js', 'i18n-puzzles.js', 'i18n-bots-old.js', 'i18n-learn.js', 'i18n-rules.js',
  'i18n-bots.js', 'i18n-bots-uni.js', 'i18n-demos.js', 'i18n-shell.js', 'i18n-tc.js', 'i18n-history.js',
  'i18n-local.js', 'i18n-devices.js', 'i18n-live.js', 'i18n-attention.js', 'i18n-topbar.js', 'i18n-chat.js',
  'timectl.js', 'local-clock.js', 'tc-picker.js', 'sound.js', 'rules.js', 'rules-ai.js',
  'book-data.js', 'book.js', 'bots.js', 'bot-looks.js', 'bot-picker.js', 'player-strips.js',
  'policy-data.js', 'engine-patterns.js', 'engine-position.js', 'engine-renju.js', 'engine-eval.js', 'engine-moves.js',
  'engine-search.js', 'engine-vct.js', 'engine.js', 'analysis.js', 'ai-worker.js', 'board-view.js',
  'board-replay.js', 'board-input.js', 'app-clock.js', 'app-online.js', 'app-dialogs.js', 'app-ext.js',
  'app.js', 'shell.js', 'online-auth.js', 'online-friends.js', 'online-room.js', 'online.js',
  'avatar.js', 'social.js', 'local-games.js', 'history.js', 'local-history.js', 'devices.js',
  'match.js', 'gamex.js', 'tour-patch.js', 'tour.js', 'tour-stages.js', 'tour-form.js',
  'tour-groups.js', 'tour-disputes.js', 'club.js', 'tour-admin.js', 'an-pool.js', 'study-trainer.js',
  'puzzles.js', 'study.js', 'live-analysis.js', 'attention.js', 'storm.js', 'share.js',
  'swap.js', 'watch.js', 'profile.js', 'learn-demos.js', 'learn-board.js', 'learn-practice.js',
  'learn.js', 'puzzle-home.js', 'habits.js', 'local-save.js', 'settings-ui.js', 'more.js',
  'home.js', 'backdrop.js', 'player-search.js', 'quick-settings.js', 'topbar.js', 'online-count.js',
  'presence.js', 'chat-bubbles.js', 'native.js', 'icon.svg', 'caro-rapfi-nets-*', 'i18n-rapfi.js',
  'rapfi-board.js', 'rapfi-ponder.js', 'boat-rapfi.js', 'eval-key.js', 'eval-cloud.js', 'rapfi-analysis.js',
  'rapfi-settings.js', 'rapfi-load.js', 'manifest.webmanifest',
];
// Ảnh đại diện nhân vật máy (bot-looks.js) – đổi ảnh thì sửa danh sách này; cộng phông chữ,
// ảnh nền, dữ liệu puzzles và các trang tĩnh phụ.
const OPTIONAL = [
  'img/backdrop.webp', 'puzzles.json', 'privacy.html', 'privacy.js', 'img/bots/tit.svg', 'img/bots/na.svg',
  'img/bots/mo.svg', 'img/bots/bom.svg', 'img/bots/ti.svg', 'img/bots/nam.svg', 'img/bots/lan.svg', 'img/bots/cuoi.svg',
  'img/bots/hung.svg', 'img/bots/tuong.svg', 'img/bots/song.svg', 'img/bots/bin.svg', 'img/bots/loc.svg', 'img/bots/da.svg',
  'img/bots/mai.svg', 'img/bots/cao.svg', 'img/bots/minh.svg', 'img/bots/thanh.svg', 'img/bots/kep.svg', 'img/bots/ninja.svg',
  'img/bots/rong.svg', 'img/bots/phao.svg', 'img/bots/long.svg', 'img/bots/ao.svg', 'img/bots/trinh.svg', 'img/bots/teliet.svg',
  'img/bots/fifa.svg', 'img/bots/sach.svg', 'img/bots/liems.svg', 'img/bots/goat.svg', 'img/bots/boat.svg', 'licenses.html',
  'fonts/noto-sans-latin-wght-normal.woff2', 'fonts/noto-sans-vietnamese-wght-normal.woff2', 'fonts/noto-sans-cyrillic-wght-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    const rs = await Promise.allSettled(OPTIONAL.map((f) => c.add(f)));
    const bad = OPTIONAL.filter((f, i) => rs[i].status === 'rejected');
    if (bad.length) console.warn('SW: không tải sẵn được ' + bad.length + ' file phụ (vẫn cài tiếp):', bad.join(', '));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith('caro-rapfi-nets')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Chỉ lưu trữ file tĩnh (đuôi file rõ ràng) và không bao giờ lưu phản hồi /api/ — trước đây
// M-F2: mọi GET cùng nguồn thành công đều bị lưu, gồm /api/replay/<mã> chứa tên hai người
// chơi và toàn bộ nước đi, còn sót lại trên máy dùng chung sau khi đăng xuất.
const STATIC_EXT = /\.(?:js|css|html|svg|webp|png|ico|woff2|json|webmanifest|wasm)$/;
function cacheable(url) {
  if (url.pathname.includes('/rapfi/nets/')) return false; // mạng Rapfi: Worker tự lưu ở bộ nhớ đệm riêng
  if (url.pathname.startsWith('/api/')) return false; // dữ liệu API (gồm avatar): không lưu
  return STATIC_EXT.test(url.pathname);
}

// Ưu tiên mạng để luôn có bản mới; mạng lỗi HOẶC máy chủ trả lỗi HTTP thì dùng bản đã lưu
// (trước đây lỗi HTTP được trả thẳng cho trang dù bản lưu tốt vẫn còn — M-F2).
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    // Mở trang: mạng trước (bản mới + thẻ xem trước đúng ván), lỗi/mất mạng thì dùng vỏ đã lưu.
    e.respondWith(
      fetch(e.request)
        .then(async (res) => (res.ok ? res : (await caches.match('index.html', { ignoreSearch: true })) || res))
        .catch(() => caches.match('index.html', { ignoreSearch: true }))
    );
    return;
  }
  if (!cacheable(url)) return; // không can thiệp: trình duyệt tự gọi mạng
  e.respondWith(
    fetch(e.request)
      .then(async (res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        }
        const hit = await caches.match(e.request, { ignoreSearch: true });
        return hit || res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
