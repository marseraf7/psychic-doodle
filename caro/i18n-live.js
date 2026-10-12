/* Chuỗi dịch của phân tích ngầm lúc chơi (live-analysis.js) và phân tích hai lượt (study.js) – 4 ngôn ngữ. */
(function () {
  'use strict';
  const I = window.I18N;
  I.extend('vi', {
    live_an: 'Phân tích ngầm khi chơi',
    live_an_d: 'Engine chấm từng nước ngay trên máy này trong lúc chơi, hết ván là có phân tích. Tắt nếu muốn tiết kiệm pin.',
    an_refining: 'Kết quả nhanh · đang phân tích kỹ hơn… {p}%',
  });
  I.extend('en', {
    live_an: 'Analyse while playing',
    live_an_d: 'The engine checks each move on this device during the game, so the analysis is ready when it ends. Turn off to save battery.',
    an_refining: 'Quick result · refining… {p}%',
  });
  I.extend('ru', {
    live_an: 'Анализ во время игры',
    live_an_d: 'Движок оценивает каждый ход на этом устройстве прямо во время партии, и анализ готов сразу после неё. Отключите для экономии батареи.',
    an_refining: 'Быстрый результат · уточняем… {p}%',
  });
  I.extend('zh', {
    live_an: '对局中后台分析',
    live_an_d: '引擎在对局进行时就在本设备上逐手评估，终局即可看到分析。如需省电可关闭。',
    an_refining: '快速结果 · 正在细化分析… {p}%',
  });
})();
