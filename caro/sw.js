// Lưu toàn bộ game vào bộ nhớ đệm để chơi được cả khi mất mạng.
const CACHE = 'caro-v24';
const FILES = ['./', 'index.html', 'style.css', 'config.js', 'theme.js', 'boardstyle.js', 'i18n.js', 'sound.js', 'rules.js', 'bots.js', 'analysis.js', 'ai-worker.js', 'app.js', 'online.js', 'social.js', 'match.js', 'tour-patch.js', 'tour.js', 'tour-stages.js', 'tour-form.js', 'tour-groups.js', 'club.js', 'study.js', 'share.js', 'swap.js', 'watch.js', 'profile.js', 'learn.js', 'habits.js', 'puzzles.json', 'native.js', 'privacy.html', 'icon.svg', 'manifest.webmanifest',
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
