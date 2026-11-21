// Chuỗi giao diện: tiến độ trong tài khoản, Puzzle Storm có kiểm + bảng xếp hạng tuần (storm.js, storm-board.js),
// mục Thành tích trong hồ sơ (profile-badges.js) – A5.
(function () {
  'use strict';
  const X = window.I18N.extend;
  X('vi', {
    sb_title: 'Puzzle Storm: bảng xếp hạng tuần',
    sb_week: 'Tuần {w}. Bảng mới bắt đầu lúc 0:00 thứ Hai (giờ Việt Nam)',
    sb_empty: 'Tuần này chưa có ai. Chơi Storm để lên bảng!',
    sb_score: '{n} bài',
    sb_me: 'Bạn: {n} bài, hạng {rank}',
    sb_me_none: 'Tuần này bạn chưa có lượt Storm nào',
    sb_guest: 'Đăng nhập để lên bảng xếp hạng',
    storm_rank: 'Đã ghi vào bảng tuần: hạng {rank} ({n} bài)',
    storm_rejected: 'Lượt này không được ghi vào bảng xếp hạng',
    srv_storm_limit: 'Hôm nay bạn đã chơi {n} lượt Storm. Mai chơi tiếp nhé!',
    pf_progress: 'Thành tích',
    pf_streak: 'ngày liên tiếp · dài nhất {n}',
    pf_storm: 'Storm cao nhất · tuần này {n}',
  });
  X('en', {
    sb_title: 'Puzzle Storm: weekly leaderboard',
    sb_week: 'Week {w}. A new board starts at 0:00 on Monday (Vietnam time)',
    sb_empty: 'Nobody yet this week. Play Storm to get on the board!',
    sb_score: '{n} puzzles',
    sb_me: 'You: {n} puzzles, rank {rank}',
    sb_me_none: 'You have no Storm runs this week',
    sb_guest: 'Sign in to join the leaderboard',
    storm_rank: 'Added to the weekly board: rank {rank} ({n} puzzles)',
    storm_rejected: 'This run was not added to the leaderboard',
    srv_storm_limit: 'You have played {n} Storm runs today. Come back tomorrow!',
    pf_progress: 'Achievements',
    pf_streak: 'day streak · longest {n}',
    pf_storm: 'Storm best · this week {n}',
  });
  X('ru', {
    sb_title: 'Puzzle Storm: рейтинг недели',
    sb_week: 'Неделя {w}. Новая таблица начинается в 0:00 в понедельник (время Вьетнама)',
    sb_empty: 'На этой неделе пока никого нет. Сыграйте в Storm, чтобы попасть в таблицу!',
    sb_score: 'задач: {n}',
    sb_me: 'Вы: задач {n}, место {rank}',
    sb_me_none: 'На этой неделе у вас нет попыток Storm',
    sb_guest: 'Войдите, чтобы попасть в рейтинг',
    storm_rank: 'Результат в таблице недели: место {rank} (задач: {n})',
    storm_rejected: 'Эта попытка не попала в рейтинг',
    srv_storm_limit: 'Сегодня вы сыграли {n} попыток Storm. Возвращайтесь завтра!',
    pf_progress: 'Достижения',
    pf_streak: 'дней подряд · рекорд {n}',
    pf_storm: 'рекорд Storm · за неделю {n}',
  });
  X('zh', {
    sb_title: 'Puzzle Storm：每周排行榜',
    sb_week: '第 {w} 周。新榜单在周一 0:00（越南时间）开始',
    sb_empty: '本周还没有人上榜。玩 Storm 来上榜吧！',
    sb_score: '{n} 题',
    sb_me: '你：{n} 题，第 {rank} 名',
    sb_me_none: '本周你还没有 Storm 成绩',
    sb_guest: '登录后即可上榜',
    storm_rank: '已计入本周榜单：第 {rank} 名（{n} 题）',
    storm_rejected: '本次成绩未计入排行榜',
    srv_storm_limit: '你今天已玩了 {n} 次 Storm，明天再来吧！',
    pf_progress: '成就',
    pf_streak: '连续天数 · 最长 {n}',
    pf_storm: 'Storm 最高 · 本周 {n}',
  });
})();
