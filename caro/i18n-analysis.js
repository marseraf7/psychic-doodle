/*
 * Chuỗi 4 ngôn ngữ – Phân tích sau ván (phần thêm): đi thử biến (an-explore.js), tìm nước tốt hơn, dòng máy gợi ý,
 * nhãn nổi của biểu đồ (an-graph.js), dòng "Phân tích nhanh" trên thẻ kết quả (an-banner.js).
 * Phần chính của bảng phân tích: i18n-study.js. Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  // ================================================================ Tiếng Việt
  X('vi', {
    an_tip: 'Nước {n} · X {w}%',
    an_tap_explore: 'Chạm một ô trống trên bàn để đi thử nước khác từ thế đang xem.',
    an_better: 'Tìm nước tốt hơn',
    an_pv: 'Dòng máy gợi ý',
    an_pv_loading: 'Máy đang tính dòng gợi ý…',
    an_pv_none: 'Máy không tìm được dòng gợi ý ở thế này.',
    an_pv_line: 'Dòng máy:',
    an_pv_try: 'Đi thử từ đây',
    an_pv_hide: 'Ẩn',
    ex_explore: 'Đi thử',
    ex_thinking: 'Máy đang chấm…',
    ex_mate: '{p} thắng chắc trong {n} nước',
    ex_suggest: 'Gợi ý cho {p}: {c}',
    ex_undo: 'Lùi',
    ex_play_best: 'Đi nước gợi ý',
    ex_return: 'Quay về ván',
    ex_won: '{p} thắng.',
    ex_better_goal: 'Tìm nước tốt hơn nước đã đi',
    ex_better_ok: 'Tốt! Nước này tốt ngang nước của máy (khả năng thắng {w}%).',
    ex_better_no: 'Chưa tốt hơn: khả năng thắng {w}% (nước của máy: {b}%).',
    ex_better_lost: 'Thế này đã khó cứu: cả nước của máy cũng chỉ còn {b}%. Thử ở nước sớm hơn.',
    an_quick: 'Phân tích nhanh: {s} — bấm để xem lại',
    an_quick_acc: 'độ chính xác {a}%',
    an_quick_clean: 'không có nước sai',
  });

  // ================================================================ English
  X('en', {
    an_tip: 'Move {n} · X {w}%',
    an_tap_explore: 'Tap an empty cell on the board to try a different move from this position.',
    an_better: 'Find a better move',
    an_pv: 'Engine line',
    an_pv_loading: 'The engine is working out its line…',
    an_pv_none: 'The engine found no line for this position.',
    an_pv_line: 'Engine line:',
    an_pv_try: 'Explore from here',
    an_pv_hide: 'Hide',
    ex_explore: 'Exploring',
    ex_thinking: 'Engine is evaluating…',
    ex_mate: '{p} wins by force in {n}',
    ex_suggest: 'Best for {p}: {c}',
    ex_undo: 'Back',
    ex_play_best: 'Play suggestion',
    ex_return: 'Back to game',
    ex_won: '{p} wins.',
    ex_better_goal: 'Find a better move than the one played',
    ex_better_ok: 'Good! As strong as the engine’s move (winning chance {w}%).',
    ex_better_no: 'Not better yet: winning chance {w}% (engine’s move: {b}%).',
    ex_better_lost: 'This position is already hard to save: even the engine’s move keeps only {b}%. Try an earlier move.',
    an_quick: 'Quick analysis: {s} — tap to review',
    an_quick_acc: 'accuracy {a}%',
    an_quick_clean: 'no mistakes',
  });

  // ================================================================ Русский
  X('ru', {
    an_tip: 'Ход {n} · X {w}%',
    an_tap_explore: 'Коснитесь пустой клетки, чтобы попробовать другой ход из этой позиции.',
    an_better: 'Найти ход лучше',
    an_pv: 'Линия движка',
    an_pv_loading: 'Движок считает линию…',
    an_pv_none: 'Движок не нашёл линию для этой позиции.',
    an_pv_line: 'Линия движка:',
    an_pv_try: 'Анализировать отсюда',
    an_pv_hide: 'Скрыть',
    ex_explore: 'Анализ варианта',
    ex_thinking: 'Движок оценивает…',
    ex_mate: '{p} выигрывает форсированно за {n}',
    ex_suggest: 'Подсказка для {p}: {c}',
    ex_undo: 'Назад',
    ex_play_best: 'Сыграть подсказку',
    ex_return: 'Вернуться к партии',
    ex_won: '{p} побеждает.',
    ex_better_goal: 'Найдите ход лучше сыгранного',
    ex_better_ok: 'Отлично! Не хуже хода движка (шанс на победу {w}%).',
    ex_better_no: 'Пока не лучше: шанс на победу {w}% (ход движка: {b}%).',
    ex_better_lost: 'Эту позицию уже трудно спасти: даже ход движка оставляет лишь {b}%. Попробуйте более ранний ход.',
    an_quick: 'Быстрый анализ: {s} — нажмите, чтобы разобрать',
    an_quick_acc: 'точность {a}%',
    an_quick_clean: 'без ошибок',
  });

  // ================================================================ 中文
  X('zh', {
    an_tip: '第 {n} 手 · X {w}%',
    an_tap_explore: '点棋盘上的空位，从当前局面试走其他着法。',
    an_better: '找更好的一手',
    an_pv: '引擎推荐变化',
    an_pv_loading: '引擎正在计算推荐变化…',
    an_pv_none: '引擎在此局面没有找到推荐变化。',
    an_pv_line: '引擎变化：',
    an_pv_try: '从这里试走',
    an_pv_hide: '隐藏',
    ex_explore: '试走',
    ex_thinking: '引擎正在评估…',
    ex_mate: '{p} 必胜，还需 {n} 手',
    ex_suggest: '{p} 推荐：{c}',
    ex_undo: '后退',
    ex_play_best: '走推荐着法',
    ex_return: '返回对局',
    ex_won: '{p} 获胜。',
    ex_better_goal: '找出比实战更好的一手',
    ex_better_ok: '很好！与引擎着法一样好（胜率 {w}%）。',
    ex_better_no: '还不够好：胜率 {w}%（引擎着法：{b}%）。',
    ex_better_lost: '此局面已难挽回：即使引擎着法也只剩 {b}%。试试更早的一手。',
    an_quick: '快速分析：{s} — 点击复盘',
    an_quick_acc: '准确率 {a}%',
    an_quick_clean: '没有失误',
  });
})();
