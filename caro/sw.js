// Lưu toàn bộ game vào bộ nhớ đệm để chơi được cả khi mất mạng.
const CACHE = 'caro-v46';
const FILES = ['./', 'index.html', 'style.css', 'config.js', 'theme.js', 'boardstyle.js', 'i18n.js', 'i18n-rules.js', 'i18n-bots.js', 'i18n-demos.js', 'sound.js', 'rules.js', 'bots.js', 'bot-looks.js', 'bot-picker.js', 'engine.js', 'analysis.js', 'ai-worker.js', 'app.js', 'online.js', 'social.js', 'match.js', 'gamex.js', 'tour-patch.js', 'tour.js', 'tour-stages.js', 'tour-form.js', 'tour-groups.js', 'tour-disputes.js', 'club.js', 'study.js', 'storm.js', 'share.js', 'swap.js', 'watch.js', 'profile.js', 'learn-demos.js', 'learn-board.js', 'learn-practice.js', 'learn.js', 'habits.js', 'puzzles.json', 'native.js', 'privacy.html', 'privacy.js', 'icon.svg',
  // Ảnh đại diện nhân vật máy (bot-looks.js) – đổi ảnh thì sửa danh sách này
  'img/bots/tit.svg', 'img/bots/na.svg', 'img/bots/mo.svg', 'img/bots/bom.svg', 'img/bots/ti.svg', 'img/bots/nam.svg', 'img/bots/lan.svg', 'img/bots/cuoi.svg', 'img/bots/hung.svg', 'img/bots/tuong.svg', 'img/bots/song.svg', 'img/bots/bin.svg', 'img/bots/loc.svg', 'img/bots/da.svg', 'img/bots/mai.svg', 'img/bots/cao.svg', 'img/bots/minh.svg', 'img/bots/thanh.svg', 'img/bots/kep.svg', 'img/bots/ninja.svg', 'img/bots/rong.svg', 'img/bots/phao.svg', 'img/bots/long.svg', 'img/bots/ao.svg',
  'manifest.webmanifest',
  // Phông cho 4 ngôn ngữ của game; phần chữ hiếm (latin-ext, cyrillic-ext) tự được lưu khi cần
  'fonts/noto-sans-latin-wght-normal.woff2', 'fonts/noto-sans-vietnamese-wght-normal.woff2', 'fonts/noto-sans-cyrillic-wght-normal.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Ưu tiên mạng để luôn có bản mới, mất mạng thì dùng bản đã lưu.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
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
