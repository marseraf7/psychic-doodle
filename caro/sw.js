// Lưu toàn bộ game vào bộ nhớ đệm để chơi được cả khi mất mạng.
const CACHE = 'caro-v76';
const FILES = ['./', 'index.html', 'style.css', 'shell.css', 'setup.css', 'game.css', 'pages.css', 'config.js', 'theme.js', 'boardstyle.js', 'i18n.js', 'i18n-rules.js', 'i18n-bots.js', 'i18n-bots-uni.js', 'i18n-demos.js', 'i18n-shell.js', 'i18n-tc.js', 'i18n-history.js', 'i18n-local.js', 'i18n-devices.js', 'i18n-live.js', 'i18n-attention.js', 'timectl.js', 'local-clock.js', 'tc-picker.js', 'sound.js', 'rules.js', 'book-data.js', 'book.js', 'bots.js', 'bot-looks.js', 'bot-picker.js', 'player-strips.js', 'policy-data.js', 'engine-patterns.js', 'engine-position.js', 'engine-renju.js', 'engine-eval.js', 'engine-moves.js', 'engine-search.js', 'engine-vct.js', 'engine.js', 'analysis.js', 'ai-worker.js', 'app.js', 'shell.js', 'online.js', 'social.js', 'local-games.js', 'history.js', 'local-history.js', 'devices.js', 'match.js', 'gamex.js', 'tour-patch.js', 'tour.js', 'tour-stages.js', 'tour-form.js', 'tour-groups.js', 'tour-disputes.js', 'club.js', 'an-pool.js', 'study.js', 'live-analysis.js', 'attention.js', 'storm.js', 'share.js', 'swap.js', 'watch.js', 'profile.js', 'learn-demos.js', 'learn-board.js', 'learn-practice.js', 'learn.js', 'puzzle-home.js', 'habits.js', 'local-save.js', 'settings-ui.js', 'more.js', 'home.js', 'puzzles.json', 'native.js', 'privacy.html', 'privacy.js', 'icon.svg',
  // Ảnh đại diện nhân vật máy (bot-looks.js) – đổi ảnh thì sửa danh sách này
  'img/bots/tit.svg', 'img/bots/na.svg', 'img/bots/mo.svg', 'img/bots/bom.svg', 'img/bots/ti.svg', 'img/bots/nam.svg', 'img/bots/lan.svg', 'img/bots/cuoi.svg', 'img/bots/hung.svg', 'img/bots/tuong.svg', 'img/bots/song.svg', 'img/bots/bin.svg', 'img/bots/loc.svg', 'img/bots/da.svg', 'img/bots/mai.svg', 'img/bots/cao.svg', 'img/bots/minh.svg', 'img/bots/thanh.svg', 'img/bots/kep.svg', 'img/bots/ninja.svg', 'img/bots/rong.svg', 'img/bots/phao.svg', 'img/bots/long.svg', 'img/bots/ao.svg', 'img/bots/trinh.svg', 'img/bots/teliet.svg', 'img/bots/fifa.svg', 'img/bots/sach.svg', 'img/bots/liems.svg', 'img/bots/goat.svg', 'img/bots/boat.svg',
  // BOAT / phân tích chạy Rapfi (boat-rapfi.js, rapfi-analysis.js; GPL-3). Phần nặng trong rapfi/ (engine WebAssembly 1,2 MB,
  // worker, mô hình) KHÔNG tải sẵn cho mọi người: lần đầu đấu BOAT / phân tích luật tự do – tiêu chuẩn – Renju thì trình
  // duyệt tải và bước "fetch" dưới đây tự lưu, sau đó chơi được cả khi mất mạng. Mạng NNUE ~10 MB do Worker tự lưu trong
  // bộ nhớ đệm riêng 'caro-rapfi-nets-*' (không bị xoá khi app cập nhật).
  'i18n-rapfi.js', 'boat-rapfi.js', 'rapfi-analysis.js', 'licenses.html',
  'manifest.webmanifest',
  // Phông cho 4 ngôn ngữ của game; phần chữ hiếm (latin-ext, cyrillic-ext) tự được lưu khi cần
  'fonts/noto-sans-latin-wght-normal.woff2', 'fonts/noto-sans-vietnamese-wght-normal.woff2', 'fonts/noto-sans-cyrillic-wght-normal.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith('caro-rapfi-nets')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Ưu tiên mạng để luôn có bản mới, mất mạng thì dùng bản đã lưu.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/rapfi/nets/')) return; // mạng Rapfi tự đặt sẵn trên máy chủ: Worker tự lưu, không lưu trùng
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
