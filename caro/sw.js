// Lưu toàn bộ game vào bộ nhớ đệm để chơi được cả khi mất mạng.
const CACHE = 'caro-v277';
const FILES = ['./', 'index.html', 'sched.js', 'sw-boot.js', 'migrate-in.js', 'migrate-out.js', 'style.css', 'style-online.css', 'style-tour.css', 'style-tour-opts.css', 'style-otour-new.css', 'style-study.css', 'style-extras.css', 'shell.css', 'setup.css', 'game.css', 'pages.css', 'topbar.css', 'chat-bubbles.css', 'watchdog.js', 'corners.js', 'config.js', 'src-track.js', 'theme.js', 'boardstyle.js', 'langs.js', 'i18n.js', 'i18n-look.js', 'i18n-online.js', 'i18n-online-msg.js', 'i18n-play.js', 'i18n-replay.js', 'i18n-account.js', 'i18n-social.js', 'i18n-tour.js', 'i18n-tour-stages.js', 'i18n-tour-adv.js', 'i18n-tour-rules.js', 'i18n-tour-reg.js', 'i18n-tour-manage.js', 'i18n-tour-view.js', 'i18n-club.js', 'i18n-club-admin.js', 'i18n-club-talk.js', 'i18n-club-battle.js', 'i18n-tour-fun.js', 'i18n-tour-more.js', 'i18n-tour-opts.js', 'i18n-otour.js', 'i18n-otour-tpl.js', 'i18n-otour-lib.js', 'i18n-otour-playoff.js', 'i18n-otour-sched.js', 'i18n-otour-esports.js', 'i18n-otour-special.js', 'i18n-otour-cycling.js', 'i18n-otour-golf.js', 'i18n-otour-next.js', 'i18n-otour-multi.js', 'i18n-otour-formats.js', 'i18n-otour-majors.js', 'i18n-otour-msi.js', 'i18n-otour-ties.js', 'i18n-otour-graph.js', 'i18n-otour-swiss.js', 'i18n-otour-chess.js', 'i18n-otour-esports2.js', 'i18n-otour-race2.js', 'i18n-otour-race2b.js', 'i18n-otour-niche.js', 'i18n-otour-niche2.js', 'i18n-otour-extra.js', 'i18n-study.js', 'i18n-analysis.js', 'i18n-puzzles.js', 'i18n-bots-old.js', 'i18n-learn.js', 'i18n-rules.js', 'i18n-bots.js', 'i18n-bots-uni.js', 'i18n-demos.js', 'i18n-shell.js', 'i18n-share.js', 'i18n-install.js', 'i18n-progress.js', 'i18n-tc.js', 'i18n-history.js', 'i18n-local.js', 'i18n-devices.js', 'i18n-live.js', 'i18n-attention.js', 'i18n-perf.js', 'i18n-topbar.js', 'i18n-chat.js', 'timectl.js', 'local-clock.js', 'tc-picker.js', 'sound.js', 'rules.js', 'rules-ai.js', 'book-data.js', 'book.js', 'bots.js', 'bot-looks.js', 'bot-picker.js', 'player-strips.js', 'policy-data.js', 'engine-patterns.js', 'engine-position.js', 'engine-renju.js', 'engine-eval.js', 'engine-moves.js', 'engine-search.js', 'engine-vct.js', 'engine.js', 'analysis.js', 'ai-worker.js', 'board-rotate.js', 'board-view.js', 'board-replay.js', 'board-input.js', 'premove.js', 'app-clock.js', 'app-online.js', 'app-dialogs.js', 'app-ext.js', 'app-ai.js', 'app-status.js', 'app.js', 'shell.js', 'confirm.js', 'share-link.js', 'online-auth.js', 'online-friends.js', 'online-room.js', 'online.js', 'progress-merge.js', 'progress-sync.js', 'avatar.js', 'social.js', 'local-games.js', 'history.js', 'local-history.js', 'devices.js', 'match.js', 'gamex.js', 'rich-text.js', 'tour-patch.js', 'fit-input.js', 'tour.js', 'tour-players.js', 'tour-stages.js', 'tour-bracket-view.js', 'dt-field.js', 'tour-stage-fold.js', 'tour-stage-edit.js', 'otour-race-edit.js', 'tour-estimate.js', 'tour-form.js', 'tour-adv-reg.js', 'tour-adv-more.js', 'tour-adv-bracket.js', 'tour-adv.js', 'tour-groups.js', 'tour-disputes.js', 'tour-reg.js', 'tour-sheet.js', 'tour-score.js', 'tour-match-extra.js', 'tour-arrange.js', 'otour-sports.js', 'otour-season.js', 'otour-rules.js', 'otour-templates-more.js', 'otour-templates.js', 'otour-tpl-art.js', 'otour-spec-io.js', 'otour-path.js', 'otour-season-edit.js', 'otour-playoff-edit.js', 'otour-route-edit.js', 'otour-pick.js', 'otour-graph.js', 'otour-graph-ui.js', 'otour-pools-ui.js', 'otour-knock-ui.js', 'otour-mtg-ui.js', 'otour-swiss-edit.js', 'otour-ladder.js', 'otour-bridge.js', 'otour-seedrank.js', 'otour-seedtool.js', 'otour.js', 'otour-score.js', 'otour-bridge-ui.js', 'otour-ladder-ui.js', 'otour-race.js', 'otour-algs-ui.js', 'otour-race-plug.js', 'otour-race-plug2.js', 'otour-gt.js', 'otour-golf.js', 'otour-next.js', 'otour-multi.js', 'otour-tpl.js', 'otour-tpl-lib.js', 'otour-new-ui.js', 'otour-ai-providers.js', 'otour-ai.js', 'otour-league.js', 'otour-sched.js', 'otour-sched-ui.js', 'otour-draft.js', 'otour-games-ui.js', 'otour-disc.js', 'otour-export.js', 'otour-share.js', 'pdf-lite.js', 'otour-pdf.js', 'tour-manage.js', 'tour-embed.js', 'club.js', 'club-admin.js', 'club-talk.js', 'club-match.js', 'club-battle.js', 'tour-fun.js', 'tour-tpl.js', 'tour-admin.js', 'an-pool.js', 'study-trainer.js', 'puzzles.js', 'an-graph.js', 'an-explore.js', 'study.js', 'live-analysis.js', 'an-banner.js', 'attention.js', 'perf-box.js', 'rum.js', 'storm.js', 'storm-board.js', 'share.js', 'video-core.js', 'video-draw.js', 'video-maker.js', 'i18n-video.js', 'video.css', 'swap.js', 'watch.js', 'profile.js', 'profile-bio.js', 'profile-badges.js', 'learn-demos.js', 'learn-board.js', 'learn-practice.js', 'learn.js', 'puzzle-home.js', 'habits.js', 'local-save.js', 'settings-ui.js', 'pwa-install.js', 'more.js', 'home.js', 'home-hero.js', 'backdrop.js', 'bar-pos.js', 'matchui.js', 'focus-mode.js', 'challenge-msg.js', 'draft-mode.js', 'draw-lines.js', 'bar-menu.js', 'player-search.js', 'quick-settings.js', 'topbar.js', 'topbar-inbox.js', 'online-count.js', 'presence.js', 'chat-bubbles.js', 'img/backdrop.webp', 'puzzles.json', 'native.js', 'privacy.html', 'policy-page.css', 'connector.html', 'embed.html', 'embed.css', 'embed-boot.js', 'embed-tour.js', 'embed-run.js', 'privacy.js', 'icon.svg', 'i18n-recap.js', 'recap-core.js', 'recap.js', 'i18n-fairplay.js', 'fairplay-core.js', 'fairplay.js', 'fairplay-admin.js', 'i18n-src.js', 'src-admin.js', 'i18n-ladder.js', 'bot-ladder-core.js', 'bot-ladder.js', 'i18n-coach.js', 'coach.js', 'coach-ui.js', 'i18n-league.js', 'league.js', 'style-stats.css', 'i18n-insights.js', 'feat-dlg.js', 'insights-core.js', 'insights-an.js', 'insights.js', 'class.css', 'i18n-class.js', 'game-text.js', 'class-tree.js', 'classroom.js', 'class-view.js', 'i18n-broadcast.js', 'tour-broadcast.js', 'broadcast.html', 'broadcast.js', 'broadcast.css', 'corr.css', 'i18n-corr.js', 'corr.js', 'i18n-api.js', 'api.html', 'api-page.css', 'a11y.css', 'i18n-a11y.js', 'a11y-coords.js', 'a11y.js',
  // Chạy trong nền tảng khác: bản cổng game, Telegram / VK Mini App (host-*.js, VK Bridge tự phục vụ). portal.js và
  // portal-crazygames.js chỉ có trong gói bản cổng game (server/scripts/build-portal.js) – trang chính không nạp nên không lưu
  'host-detect.js', 'host.css', 'i18n-host.js', 'host.js', 'host-telegram.js', 'host-vk.js', 'vendor/vk-bridge.js',
  // Ảnh đại diện nhân vật máy (bot-looks.js) – đổi ảnh thì sửa danh sách này
  'img/bots/tit.svg', 'img/bots/na.svg', 'img/bots/mo.svg', 'img/bots/bom.svg', 'img/bots/ti.svg', 'img/bots/nam.svg', 'img/bots/lan.svg', 'img/bots/cuoi.svg', 'img/bots/hung.svg', 'img/bots/tuong.svg', 'img/bots/song.svg', 'img/bots/bin.svg', 'img/bots/loc.svg', 'img/bots/da.svg', 'img/bots/mai.svg', 'img/bots/cao.svg', 'img/bots/minh.svg', 'img/bots/thanh.svg', 'img/bots/kep.svg', 'img/bots/ninja.svg', 'img/bots/rong.svg', 'img/bots/phao.svg', 'img/bots/long.svg', 'img/bots/ao.svg', 'img/bots/trinh.svg', 'img/bots/teliet.svg', 'img/bots/fifa.svg', 'img/bots/sach.svg', 'img/bots/liems.svg', 'img/bots/goat.svg', 'img/bots/boat.svg',
  // BOAT / phân tích chạy Rapfi (rapfi-board.js, rapfi-ponder.js, native-boat.js, boat-rapfi.js, rapfi-analysis.js, rapfi-settings.js, rapfi-load.js; GPL-3). Phần nặng trong rapfi/ (engine WebAssembly 1,2 MB,
  // worker, mô hình) KHÔNG tải sẵn cho mọi người: lần đầu đấu BOAT / phân tích luật tự do – tiêu chuẩn – Renju thì trình
  // duyệt tải và bước "fetch" dưới đây tự lưu, sau đó chơi được cả khi mất mạng. Mạng NNUE ~10 MB do Worker tự lưu trong
  // bộ nhớ đệm riêng 'caro-rapfi-nets-*' (không bị xoá khi app cập nhật).
  'i18n-rapfi.js', 'rapfi-board.js', 'rapfi-ponder.js', 'native-boat.js', 'boat-rapfi.js', 'eval-key.js', 'eval-cloud.js', 'rapfi-analysis.js', 'rapfi-settings.js', 'rapfi-load.js', 'licenses.html',
  'manifest.webmanifest',
  // Phông cho 4 ngôn ngữ của game; phần chữ hiếm (latin-ext, cyrillic-ext) tự được lưu khi cần
  'fonts/noto-sans-latin-wght-normal.woff2', 'fonts/noto-sans-vietnamese-wght-normal.woff2', 'fonts/noto-sans-cyrillic-wght-normal.woff2'];

// Vỏ tối thiểu – lưu ngay lúc cài: trang chính, CSS, biểu tượng, các khối mã của bản gộp (b/core-…, b/boot-… do
// server/src/web-bundle.js thêm vào FILES). Phần còn lại (gói chuỗi dịch, ảnh, phông, file lẻ…) lưu SAU khi trang đã tải
// xong và rảnh: trang nhắn { t: 'precache', lang } (sw-boot.js) – lần mở đầu không phải chia băng thông với ~300 file.
const SHELL = /^(\.\/|index\.html|manifest\.webmanifest|icon\.svg|[\w-]+\.css|b\/(core|boot)-[0-9a-f]+\.js)$/;
const isShell = (f) => SHELL.test(f);

// Cài / lưu từng file một (không dùng addAll "tất cả hoặc không"): mạng chập chờn (vd. từ Nga tới máy chủ ở Mỹ) rớt một
// file thì các file khác vẫn được lưu, file thiếu sẽ được lưu bù ở lần nhắn precache sau hoặc lần tải sau (bước fetch).
// cache: 'no-cache' – luôn hỏi máy chủ bản mới nhất, không lấy bản cũ trong bộ nhớ HTTP của trình duyệt.
const store = (c, f) => fetch(new Request(f, { cache: 'no-cache' })).then((res) => (res.ok ? c.put(f, res) : null));

// Gói chuỗi dịch của bản gộp (b/i18n-<ngôn ngữ>-<băm>.js – tên có mã băm nội dung, không bao giờ đổi): trang vừa nạp gói của
// ngôn ngữ đang dùng nên gói đó đã có trên máy (bộ nhớ HTTP, hoặc bộ đệm của bản app trước) → lưu luôn lúc cài mà không ra
// mạng. Không thì mở lần đầu rồi mất mạng trước lượt precache: app mở được nhưng không có chữ giao diện. Gói chưa có: để precache.
const PACK = /^b\/i18n-[A-Za-z]{2}(?:-[A-Za-z]{4})?-[0-9a-f]+\.js$/; // mã ngôn ngữ: langs.js (vd. ja, zh-Hant)
const keep = (c, f) => caches.match(f)
  .then((hit) => hit || fetch(new Request(f, { cache: 'only-if-cached', mode: 'same-origin' })).then((res) => (res.ok ? res : null), () => null))
  .then((res) => (res ? c.put(f, res) : null));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(FILES.filter(isShell).map((f) => store(c, f))
    .concat(FILES.filter((f) => PACK.test(f)).map((f) => keep(c, f))))).then(() => self.skipWaiting()));
});

// Lưu nốt các file chưa có, mỗi lúc vài file (không chiếm hết mạng khi người chơi đang dùng). Gói chuỗi dịch của ngôn
// ngữ đang dùng lưu trước. Đang chạy thì lần nhắn sau chờ chung lượt đó.
let filling = null;
function precacheRest(lang) {
  if (filling) return filling;
  const mine = (f) => f.startsWith('b/i18n-' + lang + '-') && /^[0-9a-f]+\.js$/.test(f.slice(8 + lang.length)); // 'zh' không lẫn 'zh-Hant'
  const rest = FILES.filter((f) => !isShell(f));
  rest.sort((a, b) => mine(b) - mine(a)); // sort ổn định: còn lại giữ thứ tự FILES
  filling = caches.open(CACHE).then(async (c) => {
    const todo = [];
    for (const f of rest) if (!(await c.match(f))) todo.push(f);
    let i = 0;
    const worker = async () => { while (i < todo.length) { const f = todo[i++]; await store(c, f).catch(() => {}); } };
    await Promise.all([worker(), worker(), worker()]);
    return todo.length;
  }).finally(() => { filling = null; });
  return filling;
}

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.t === 'precache') e.waitUntil(precacheRest(typeof d.lang === 'string' ? d.lang : ''));
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
  // /?bc=… (Tường thuật giải – C3): máy chủ trả broadcast.html chứ không phải trang chính (web.js) – SW cũng vậy, không thì
  // máy đã cài app mở link tường thuật lại ra Trang chủ (ignoreSearch khớp './')
  const bc = nav && /\/(index\.html)?$/.test(url.pathname) && url.searchParams.get('bc');
  // Mở làm Mini App Telegram / VK (?host=tg|vk, ?tgWebAppStartParam=, ?vk_app_id=…&sign=): máy chủ trả header cho phép nhúng
  // trong Telegram Web / VK (server/src/host-embed.js) – hỏi mạng trước; bản đã lưu (header cũ) chỉ dùng khi mất mạng
  const sp = url.searchParams;
  if (nav && /\/(index\.html)?$/.test(url.pathname) && (/^(tg|vk)$/.test(sp.get('host') || '') || sp.has('tgWebAppStartParam') || (sp.has('vk_app_id') && sp.has('sign')))) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || Response.error())));
    return;
  }
  e.respondWith(
    (bc ? caches.match('broadcast.html') : caches.match(e.request, { ignoreSearch: nav })).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && !url.search) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
