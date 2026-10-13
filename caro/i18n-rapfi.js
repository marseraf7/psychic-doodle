/*
 * Chuỗi 4 ngôn ngữ cho BOAT chạy Rapfi / Rapfi-CARO (boat-rapfi.js) và trang Giấy phép mã nguồn mở (licenses.html).
 * Nạp sau i18n-bots-uni.js và config.js: ghi đè mô tả BOAT để ghi công Rapfi (trừ bản iOS – CARO_NO_RAPFI).
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    licenses: 'Giấy phép mã nguồn mở',
    boat_elo_rapfi: 'Rapfi – engine vô địch Gomocup (luật Việt Nam: Rapfi-CARO)',
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
    boat_elo_rapfi: 'Rapfi – the Gomocup champion engine (Vietnamese rule: Rapfi-CARO)',
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
    boat_elo_rapfi: 'Rapfi – движок-чемпион Gomocup (вьетнамские правила: Rapfi-CARO)',
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
    boat_elo_rapfi: 'Rapfi——Gomocup 冠军引擎（越南规则：Rapfi-CARO）',
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
    X('vi', { bot_boat_desc: 'Trùm cuối – Best of All Time. Chạy Rapfi – engine vô địch Gomocup (GPL-3) – ngay trên máy bạn: luật tự do, tiêu chuẩn, Renju lần đầu tải ~10 MB; luật Việt Nam là Rapfi-CARO – Rapfi được Cờ Caro dạy luật chặn hai đầu. Gần như bất khả chiến bại.' });
    X('en', { bot_boat_desc: 'The final boss – Best of All Time. Runs Rapfi – the Gomocup champion engine (GPL-3) – right on your device: freestyle, standard and Renju need a ~10 MB download the first time; the Vietnamese rule uses Rapfi-CARO – Rapfi taught the both-ends-blocked rule by Caro. Nearly unbeatable.' });
    X('ru', { bot_boat_desc: 'Финальный босс – Best of All Time. Играет движком Rapfi – чемпионом Gomocup (GPL-3) – прямо на вашем устройстве: для свободных, стандартных правил и Рэндзю в первый раз загрузка ~10 МБ; во вьетнамских правилах – Rapfi-CARO, Rapfi, которого Каро научил правилу блока с двух концов. Почти непобедим.' });
    X('zh', { bot_boat_desc: '最终头目——Best of All Time（史上最强）。在你的设备上运行 Gomocup 冠军引擎 Rapfi（GPL-3）：自由、标准与连珠规则首次需下载约 10 MB；越南规则使用 Rapfi-CARO——由 Caro 教会“两端被堵不算赢”规则的 Rapfi。几乎无法战胜。' });
  }
})();
