/*
 * Chuỗi 4 ngôn ngữ cho BOAT chạy Rapfi (boat-rapfi.js) và trang Giấy phép mã nguồn mở (licenses.html).
 * Nạp sau i18n-bots-uni.js và config.js: ghi đè mô tả BOAT để ghi công Rapfi (trừ bản iOS – CARO_NO_RAPFI).
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    licenses: 'Giấy phép mã nguồn mở',
    boat_elo_rapfi: '~{elo} Elo (luật Việt Nam) · Rapfi (tự do / tiêu chuẩn / Renju)',
    badge_beat_boat_rapfi: 'Đánh chìm BOAT–Rapfi',
    badge_beat_boat_rapfi_d: 'Thắng BOAT khi Rapfi – engine vô địch Gomocup – cầm quân',
    an_refining_rapfi: 'Kết quả nhanh · Rapfi (engine vô địch Gomocup) đang phân tích kỹ… {p}%',
    an_by_rapfi: 'Phân tích bởi Rapfi – engine vô địch Gomocup',
    rapfi_loading: 'BOAT đang tải bộ não Rapfi (~{mb} MB, chỉ lần đầu)…',
    rapfi_ready: 'BOAT đã sẵn sàng với Rapfi – engine vô địch Gomocup ⛵',
    rapfi_failed: 'Không tải được Rapfi – BOAT dùng engine của game',
  });

  X('en', {
    licenses: 'Open-source licenses',
    boat_elo_rapfi: '~{elo} Elo (Vietnamese rule) · Rapfi (freestyle / standard / Renju)',
    badge_beat_boat_rapfi: 'Sink BOAT–Rapfi',
    badge_beat_boat_rapfi_d: 'Beat BOAT while Rapfi – the Gomocup champion engine – is playing',
    an_refining_rapfi: 'Quick result · Rapfi (Gomocup champion engine) is refining… {p}%',
    an_by_rapfi: 'Analysed by Rapfi – the Gomocup champion engine',
    rapfi_loading: 'BOAT is downloading its Rapfi brain (~{mb} MB, first time only)…',
    rapfi_ready: 'BOAT is ready with Rapfi – the Gomocup champion engine ⛵',
    rapfi_failed: 'Could not load Rapfi – BOAT uses the game\'s own engine',
  });

  X('ru', {
    licenses: 'Лицензии открытого ПО',
    boat_elo_rapfi: '~{elo} Эло (вьетнамские правила) · Rapfi (свободные / стандартные / Рэндзю)',
    badge_beat_boat_rapfi: 'Потопить BOAT–Rapfi',
    badge_beat_boat_rapfi_d: 'Победить BOAT, когда играет Rapfi – движок-чемпион Gomocup',
    an_refining_rapfi: 'Быстрый результат · Rapfi (движок-чемпион Gomocup) уточняет… {p}%',
    an_by_rapfi: 'Анализ: Rapfi – движок-чемпион Gomocup',
    rapfi_loading: 'BOAT загружает мозг Rapfi (~{mb} МБ, только в первый раз)…',
    rapfi_ready: 'BOAT готов с Rapfi – движком-чемпионом Gomocup ⛵',
    rapfi_failed: 'Не удалось загрузить Rapfi – BOAT играет собственным движком игры',
  });

  X('zh', {
    licenses: '开源许可',
    boat_elo_rapfi: '~{elo} Elo（越南规则）· Rapfi（自由 / 标准 / 连珠）',
    badge_beat_boat_rapfi: '击沉 BOAT–Rapfi',
    badge_beat_boat_rapfi_d: '在 Gomocup 冠军引擎 Rapfi 执棋时战胜 BOAT',
    an_refining_rapfi: '快速结果 · Rapfi（Gomocup 冠军引擎）正在细化分析… {p}%',
    an_by_rapfi: '由 Gomocup 冠军引擎 Rapfi 分析',
    rapfi_loading: 'BOAT 正在下载 Rapfi 大脑（约 {mb} MB，仅首次）…',
    rapfi_ready: 'BOAT 已就绪：搭载 Gomocup 冠军引擎 Rapfi ⛵',
    rapfi_failed: '无法加载 Rapfi——BOAT 改用游戏自带引擎',
  });

  // Mô tả BOAT ghi công Rapfi – trừ bản iOS (không kèm Rapfi: app/scripts/strip-rapfi-ios.js), nơi giữ mô tả cũ
  if (!window.CARO_NO_RAPFI) {
    X('vi', { bot_boat_desc: 'Trùm cuối – Best of All Time. Luật tự do, tiêu chuẩn, Renju: chạy Rapfi – engine vô địch Gomocup (GPL-3) – ngay trên máy bạn, lần đầu tải ~10 MB. Luật Việt Nam: engine mạnh nhất của game, học từ hàng trăm nghìn ván vô địch. Gần như bất khả chiến bại.' });
    X('en', { bot_boat_desc: 'The final boss – Best of All Time. Freestyle, standard and Renju: runs Rapfi – the Gomocup champion engine (GPL-3) – right on your device, ~10 MB download the first time. Vietnamese rule: the game\'s strongest engine, trained on hundreds of thousands of champion games. Nearly unbeatable.' });
    X('ru', { bot_boat_desc: 'Финальный босс – Best of All Time. Свободные, стандартные правила и Рэндзю: играет движком Rapfi – чемпионом Gomocup (GPL-3) – прямо на вашем устройстве, в первый раз загрузка ~10 МБ. Вьетнамские правила: сильнейший движок игры, обученный на сотнях тысяч чемпионских партий. Почти непобедим.' });
    X('zh', { bot_boat_desc: '最终头目——Best of All Time（史上最强）。自由、标准与连珠规则：在你的设备上运行 Gomocup 冠军引擎 Rapfi（GPL-3），首次需下载约 10 MB。越南规则：游戏最强引擎，学习了数十万盘冠军对局。几乎无法战胜。' });
  }
})();
