// Lưu toàn bộ game vào bộ nhớ đệm để chơi được cả khi mất mạng.
const CACHE = 'caro-v140';
const FILES = ['./', 'index.html', 'style.css', 'style-online.css', 'style-tour.css', 'style-tour-opts.css', 'style-study.css', 'style-extras.css', 'shell.css', 'setup.css', 'game.css', 'pages.css', 'topbar.css', 'chat-bubbles.css', 'watchdog.js', 'corners.js', 'config.js', 'theme.js', 'boardstyle.js', 'i18n.js', 'i18n-online.js', 'i18n-online-msg.js', 'i18n-play.js', 'i18n-replay.js', 'i18n-account.js', 'i18n-social.js', 'i18n-tour.js', 'i18n-tour-stages.js', 'i18n-tour-adv.js', 'i18n-tour-rules.js', 'i18n-tour-reg.js', 'i18n-tour-manage.js', 'i18n-tour-view.js', 'i18n-club.js', 'i18n-club-admin.js', 'i18n-club-talk.js', 'i18n-club-battle.js', 'i18n-tour-fun.js', 'i18n-tour-more.js', 'i18n-tour-opts.js', 'i18n-study.js', 'i18n-analysis.js', 'i18n-puzzles.js', 'i18n-bots-old.js', 'i18n-learn.js', 'i18n-rules.js', 'i18n-bots.js', 'i18n-bots-uni.js', 'i18n-demos.js', 'i18n-shell.js', 'i18n-tc.js', 'i18n-history.js', 'i18n-local.js', 'i18n-devices.js', 'i18n-live.js', 'i18n-attention.js', 'i18n-topbar.js', 'i18n-chat.js', 'timectl.js', 'local-clock.js', 'tc-picker.js', 'sound.js', 'rules.js', 'rules-ai.js', 'book-data.js', 'book.js', 'bots.js', 'bot-looks.js', 'bot-picker.js', 'player-strips.js', 'policy-data.js', 'engine-patterns.js', 'engine-position.js', 'engine-renju.js', 'engine-eval.js', 'engine-moves.js', 'engine-search.js', 'engine-vct.js', 'engine.js', 'analysis.js', 'ai-worker.js', 'board-rotate.js', 'board-view.js', 'board-replay.js', 'board-input.js', 'premove.js', 'app-clock.js', 'app-online.js', 'app-dialogs.js', 'app-ext.js', 'app-ai.js', 'app-status.js', 'app.js', 'shell.js', 'confirm.js', 'online-auth.js', 'online-friends.js', 'online-room.js', 'online.js', 'avatar.js', 'social.js', 'local-games.js', 'history.js', 'local-history.js', 'devices.js', 'match.js', 'gamex.js', 'rich-text.js', 'tour-patch.js', 'tour.js', 'tour-players.js', 'tour-stages.js', 'tour-bracket-view.js', 'dt-field.js', 'tour-stage-edit.js', 'tour-estimate.js', 'tour-form.js', 'tour-adv-reg.js', 'tour-adv-more.js', 'tour-adv-bracket.js', 'tour-adv.js', 'tour-groups.js', 'tour-disputes.js', 'tour-reg.js', 'tour-sheet.js', 'tour-score.js', 'tour-match-extra.js', 'tour-arrange.js', 'tour-manage.js', 'tour-embed.js', 'club.js', 'club-admin.js', 'club-talk.js', 'club-match.js', 'club-battle.js', 'tour-fun.js', 'tour-tpl.js', 'tour-admin.js', 'an-pool.js', 'study-trainer.js', 'puzzles.js', 'an-graph.js', 'an-explore.js', 'study.js', 'live-analysis.js', 'an-banner.js', 'attention.js', 'storm.js', 'share.js', 'swap.js', 'watch.js', 'profile.js', 'learn-demos.js', 'learn-board.js', 'learn-practice.js', 'learn.js', 'puzzle-home.js', 'habits.js', 'local-save.js', 'settings-ui.js', 'more.js', 'home.js', 'backdrop.js', 'bar-pos.js', 'matchui.js', 'focus-mode.js', 'challenge-msg.js', 'draft-mode.js', 'draw-lines.js', 'bar-menu.js', 'player-search.js', 'quick-settings.js', 'topbar.js', 'topbar-inbox.js', 'online-count.js', 'presence.js', 'chat-bubbles.js', 'img/backdrop.webp', 'puzzles.json', 'native.js', 'privacy.html', 'embed.html', 'embed.css', 'embed-boot.js', 'embed-tour.js', 'embed-run.js', 'privacy.js', 'icon.svg',
  // Ảnh đại diện nhân vật máy (bot-looks.js) – đổi ảnh thì sửa danh sách này
  'img/bots/tit.svg', 'img/bots/na.svg', 'img/bots/mo.svg', 'img/bots/bom.svg', 'img/bots/ti.svg', 'img/bots/nam.svg', 'img/bots/lan.svg', 'img/bots/cuoi.svg', 'img/bots/hung.svg', 'img/bots/tuong.svg', 'img/bots/song.svg', 'img/bots/bin.svg', 'img/bots/loc.svg', 'img/bots/da.svg', 'img/bots/mai.svg', 'img/bots/cao.svg', 'img/bots/minh.svg', 'img/bots/thanh.svg', 'img/bots/kep.svg', 'img/bots/ninja.svg', 'img/bots/rong.svg', 'img/bots/phao.svg', 'img/bots/long.svg', 'img/bots/ao.svg', 'img/bots/trinh.svg', 'img/bots/teliet.svg', 'img/bots/fifa.svg', 'img/bots/sach.svg', 'img/bots/liems.svg', 'img/bots/goat.svg', 'img/bots/boat.svg',
  // BOAT / phân tích chạy Rapfi (rapfi-board.js, rapfi-ponder.js, boat-rapfi.js, rapfi-analysis.js, rapfi-settings.js, rapfi-load.js; GPL-3). Phần nặng trong rapfi/ (engine WebAssembly 1,2 MB,
  // worker, mô hình) KHÔNG tải sẵn cho mọi người: lần đầu đấu BOAT / phân tích luật tự do – tiêu chuẩn – Renju thì trình
  // duyệt tải và bước "fetch" dưới đây tự lưu, sau đó chơi được cả khi mất mạng. Mạng NNUE ~10 MB do Worker tự lưu trong
  // bộ nhớ đệm riêng 'caro-rapfi-nets-*' (không bị xoá khi app cập nhật).
  'i18n-rapfi.js', 'rapfi-board.js', 'rapfi-ponder.js', 'boat-rapfi.js', 'eval-key.js', 'eval-cloud.js', 'rapfi-analysis.js', 'rapfi-settings.js', 'rapfi-load.js', 'licenses.html',
  'manifest.webmanifest',
  // Phông cho 4 ngôn ngữ của game; phần chữ hiếm (latin-ext, cyrillic-ext) tự được lưu khi cần
  'fonts/noto-sans-latin-wght-normal.woff2', 'fonts/noto-sans-vietnamese-wght-normal.woff2', 'fonts/noto-sans-cyrillic-wght-normal.woff2'];

// Cài từng file một (không dùng addAll "tất cả hoặc không"): mạng chập chờn (vd. từ Nga tới máy chủ ở Mỹ) rớt một file
// thì các file khác vẫn được lưu, file thiếu sẽ tự lưu ở lần tải sau (bước fetch). cache: 'no-cache' – luôn hỏi máy chủ
// bản mới nhất, không lấy bản cũ trong bộ nhớ HTTP của trình duyệt.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(FILES.map((f) =>
    fetch(new Request(f, { cache: 'no-cache' })).then((res) => (res.ok ? c.put(f, res) : null))))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith('caro-rapfi-nets')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// File của game: lấy ngay từ bộ nhớ đệm (mở / tải lại trang tức thì, không phải chờ 118 file đi qua mạng mỗi lần),
// chưa có thì tải rồi lưu. Không sợ dùng bản cũ: bộ nhớ đệm đi theo phiên bản CACHE – đổi file nào trong caro/ là tăng CACHE,
// trình duyệt thấy sw.js mới thì cài bộ mới và xoá bộ cũ (activate). Mất mạng mà chưa có thì thôi.
// /api/… (ván xem lại, bảng xếp hạng, số người online…) là dữ liệu sống: luôn hỏi mạng, không lưu.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/rapfi/nets/')) return; // mạng Rapfi tự đặt sẵn trên máy chủ: Worker tự lưu, không lưu trùng
  if (url.pathname.startsWith('/api/')) return;
  // Trang có tham số (?replay=… – máy chủ chèn thẻ xem trước của ván) vẫn mở được khi mất mạng nhờ bản index đã lưu
  const nav = e.request.mode === 'navigate';
  e.respondWith(
    caches.match(e.request, { ignoreSearch: nav }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && !url.search) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
