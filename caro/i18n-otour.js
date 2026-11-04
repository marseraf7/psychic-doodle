/*
 * Chuỗi 4 ngôn ngữ – Giải đấu Offline cho mọi bộ môn (otour.js, otour-score.js; máy chủ server/src/hub/otour*.js).
 * Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  // ================================================================ Tiếng Việt
  X('vi', {
    ot_entry: 'Giải đấu Offline (mọi bộ môn)', ot_title: 'Giải đấu Offline', ot_create: 'Tạo giải đấu Offline',
    ot_intro: 'Tạo giải cho bất kỳ bộ môn nào – bóng đá, cầu lông, bóng bàn, thể thao điện tử, cờ… Ai cũng xem được bằng link, không cần đăng nhập.',
    ot_login_hint: 'Đăng nhập để tạo giải. Xem giải thì không cần.', ot_mine: 'Giải của tôi', ot_recent: 'Giải công khai gần đây', ot_none: 'Chưa có giải nào.',
    ot_by: 'Tổ chức: {name}', ot_st_draft: 'Chưa bắt đầu', ot_st_running: 'Đang diễn ra', ot_st_finished: 'Đã kết thúc',
    ot_access: 'Ai xem được', ot_acc_public: 'Công khai', ot_acc_link: 'Chỉ người có link', ot_acc_private: 'Riêng tư (chỉ mình tôi)',
    ot_slug_hint: 'Tuỳ chọn: …/?o=<url>, 3–20 ký tự a-z 0-9 - _. Để trống: dùng mã giải.',
    ot_sport: 'Bộ môn', sport_football: 'Bóng đá', sport_basketball: 'Bóng rổ', sport_volleyball: 'Bóng chuyền', sport_badminton: 'Cầu lông',
    sport_tabletennis: 'Bóng bàn', sport_tennis: 'Quần vợt', sport_esports: 'Thể thao điện tử', sport_chess: 'Cờ', sport_other: 'Môn khác',
    ot_result: 'Cách ghi kết quả', otres_score: 'Tỉ số (bàn / điểm)', otres_sets: 'Điểm từng set / ván', otres_winner: 'Chỉ người thắng',
    ot_est: '≈ {m} trận · {w} lượt đấu (với {n} đội)', ot_teams: 'Đội / người tham gia', ot_teams_ph: 'Mỗi dòng một đội\nĐội A\nĐội B',
    ot_teams_hint: 'Thứ tự trong danh sách là thứ tự hạt giống. Thêm / bớt được tới lúc bắt đầu.',
    ot_quota_hint: 'Mỗi người tối đa 10 giải chưa kết thúc, 20 lần tạo mỗi ngày; mỗi giải tối đa 512 đội.',
    ot_n_teams: '{n} đội', ot_start: 'Bắt đầu giải', ot_delete: 'Xoá giải', ot_team_del: 'Bỏ đội', ot_add_teams: 'Thêm đội',
    ot_start_confirm: 'Bắt đầu giải với {n} đội? Sau đó không thêm / bớt đội được nữa.', ot_delete_confirm: 'Xoá hẳn giải "{name}"? Không khôi phục được.',
    ot_set_rule: 'Mỗi set tới {to} điểm, cách {by} – Bo{bo}', ot_score: 'Tỉ số', ot_pen: 'Luân lưu', ot_pen_hint: 'Chỉ cần khi hoà ở vòng loại trực tiếp.',
    ot_need_score: 'Hãy nhập tỉ số hai bên',
    otlog_created: 'Tạo giải', otlog_edited: 'Sửa cài đặt', otlog_teams_added: 'Thêm {n} đội', otlog_team_removed: 'Bỏ đội {name}',
    otlog_started: 'Bắt đầu với {n} đội', otlog_score: '{a} – {b}: {s}', otlog_undo: 'Huỷ kết quả trận {match}',
    srv_ot_not_found: 'Không tìm thấy giải đấu (hoặc giải riêng tư)', srv_ot_spec_stages: 'Giải cần 1–3 giai đoạn', srv_ot_few_teams: 'Cần ít nhất 2 đội / người',
    srv_ot_many_teams: 'Tối đa {n} đội / người mỗi giải', srv_ot_many_matches: 'Thể thức này tạo quá nhiều trận (tối đa {n}) – hãy chia bảng nhỏ hơn hoặc bớt số lượt',
    srv_ot_daily_limit: 'Mỗi ngày tạo tối đa {n} giải offline', srv_ot_active_limit: 'Mỗi người có tối đa {n} giải offline chưa kết thúc',
    srv_ot_team_dup: 'Đã có đội / người trùng tên', srv_ot_need_pen: 'Hoà ở vòng loại trực tiếp: hãy nhập tỉ số luân lưu',
  });

  // ================================================================ English
  X('en', {
    ot_entry: 'Offline tournaments (any sport)', ot_title: 'Offline tournaments', ot_create: 'Create an offline tournament',
    ot_intro: 'Run a tournament for any sport – football, badminton, table tennis, esports, chess… Anyone with the link can follow it, no login needed.',
    ot_login_hint: 'Log in to create a tournament. Viewing needs no account.', ot_mine: 'My tournaments', ot_recent: 'Recent public tournaments', ot_none: 'No tournaments yet.',
    ot_by: 'Organizer: {name}', ot_st_draft: 'Not started', ot_st_running: 'In progress', ot_st_finished: 'Finished',
    ot_access: 'Who can view', ot_acc_public: 'Public', ot_acc_link: 'Link only', ot_acc_private: 'Private (only me)',
    ot_slug_hint: 'Optional: …/?o=<url>, 3–20 characters a-z 0-9 - _. Empty: the tournament code is used.',
    ot_sport: 'Sport', sport_football: 'Football', sport_basketball: 'Basketball', sport_volleyball: 'Volleyball', sport_badminton: 'Badminton',
    sport_tabletennis: 'Table tennis', sport_tennis: 'Tennis', sport_esports: 'Esports', sport_chess: 'Chess', sport_other: 'Other',
    ot_result: 'How results are recorded', otres_score: 'Score (goals / points)', otres_sets: 'Points per set / game', otres_winner: 'Winner only',
    ot_est: '≈ {m} matches · {w} rounds (with {n} teams)', ot_teams: 'Teams / participants', ot_teams_ph: 'One team per line\nTeam A\nTeam B',
    ot_teams_hint: 'The list order is the seeding order. You can add or remove teams until the start.',
    ot_quota_hint: 'Up to 10 unfinished offline tournaments per person, 20 created per day; up to 512 teams per tournament.',
    ot_n_teams: '{n} teams', ot_start: 'Start the tournament', ot_delete: 'Delete tournament', ot_team_del: 'Remove team', ot_add_teams: 'Add teams',
    ot_start_confirm: 'Start with {n} teams? Teams cannot be added or removed afterwards.', ot_delete_confirm: 'Delete "{name}" for good? This cannot be undone.',
    ot_set_rule: 'Sets to {to} points, win by {by} – Bo{bo}', ot_score: 'Score', ot_pen: 'Penalties', ot_pen_hint: 'Only needed for a draw in a knockout round.',
    ot_need_score: 'Enter both scores',
    otlog_created: 'Tournament created', otlog_edited: 'Settings edited', otlog_teams_added: '{n} teams added', otlog_team_removed: 'Team {name} removed',
    otlog_started: 'Started with {n} teams', otlog_score: '{a} – {b}: {s}', otlog_undo: 'Result of match {match} undone',
    srv_ot_not_found: 'Tournament not found (or private)', srv_ot_spec_stages: 'A tournament needs 1–3 stages', srv_ot_few_teams: 'At least 2 teams / participants are needed',
    srv_ot_many_teams: 'At most {n} teams / participants per tournament', srv_ot_many_matches: 'This format creates too many matches (max {n}) – use smaller groups or fewer legs',
    srv_ot_daily_limit: 'At most {n} offline tournaments can be created per day', srv_ot_active_limit: 'At most {n} unfinished offline tournaments per person',
    srv_ot_team_dup: 'A team / participant with this name already exists', srv_ot_need_pen: 'Draw in a knockout round: enter the penalty shoot-out score',
  });

  // ================================================================ Русский
  X('ru', {
    ot_entry: 'Офлайн-турниры (любой вид спорта)', ot_title: 'Офлайн-турниры', ot_create: 'Создать офлайн-турнир',
    ot_intro: 'Турнир по любому виду спорта – футбол, бадминтон, настольный теннис, киберспорт, шахматы… Следить можно по ссылке, без входа.',
    ot_login_hint: 'Войдите, чтобы создать турнир. Для просмотра вход не нужен.', ot_mine: 'Мои турниры', ot_recent: 'Недавние открытые турниры', ot_none: 'Турниров пока нет.',
    ot_by: 'Организатор: {name}', ot_st_draft: 'Не начат', ot_st_running: 'Идёт', ot_st_finished: 'Завершён',
    ot_access: 'Кто может смотреть', ot_acc_public: 'Открытый', ot_acc_link: 'Только по ссылке', ot_acc_private: 'Приватный (только я)',
    ot_slug_hint: 'Необязательно: …/?o=<url>, 3–20 символов a-z 0-9 - _. Пусто: используется код турнира.',
    ot_sport: 'Вид спорта', sport_football: 'Футбол', sport_basketball: 'Баскетбол', sport_volleyball: 'Волейбол', sport_badminton: 'Бадминтон',
    sport_tabletennis: 'Настольный теннис', sport_tennis: 'Теннис', sport_esports: 'Киберспорт', sport_chess: 'Шахматы', sport_other: 'Другое',
    ot_result: 'Как записывать результат', otres_score: 'Счёт (голы / очки)', otres_sets: 'Очки по сетам / партиям', otres_winner: 'Только победитель',
    ot_est: '≈ {m} матчей · {w} туров (при {n} командах)', ot_teams: 'Команды / участники', ot_teams_ph: 'Одна команда в строке\nКоманда A\nКоманда B',
    ot_teams_hint: 'Порядок в списке – порядок посева. Добавлять и убирать можно до старта.',
    ot_quota_hint: 'Не более 10 незавершённых офлайн-турниров на человека, 20 созданий в день; до 512 команд в турнире.',
    ot_n_teams: '{n} команд', ot_start: 'Начать турнир', ot_delete: 'Удалить турнир', ot_team_del: 'Убрать команду', ot_add_teams: 'Добавить команды',
    ot_start_confirm: 'Начать с {n} командами? После этого состав менять нельзя.', ot_delete_confirm: 'Удалить «{name}» навсегда? Восстановить нельзя.',
    ot_set_rule: 'Сет до {to} очков, разница {by} – Bo{bo}', ot_score: 'Счёт', ot_pen: 'Пенальти', ot_pen_hint: 'Только при ничьей в матче на выбывание.',
    ot_need_score: 'Введите счёт обеих сторон',
    otlog_created: 'Турнир создан', otlog_edited: 'Настройки изменены', otlog_teams_added: 'Добавлено команд: {n}', otlog_team_removed: 'Команда {name} убрана',
    otlog_started: 'Старт с {n} командами', otlog_score: '{a} – {b}: {s}', otlog_undo: 'Результат матча {match} отменён',
    srv_ot_not_found: 'Турнир не найден (или приватный)', srv_ot_spec_stages: 'В турнире должно быть 1–3 этапа', srv_ot_few_teams: 'Нужно хотя бы 2 команды / участника',
    srv_ot_many_teams: 'Не более {n} команд / участников в турнире', srv_ot_many_matches: 'В этом формате слишком много матчей (максимум {n}) – уменьшите группы или число кругов',
    srv_ot_daily_limit: 'В день можно создать не более {n} офлайн-турниров', srv_ot_active_limit: 'Не более {n} незавершённых офлайн-турниров на человека',
    srv_ot_team_dup: 'Команда / участник с таким именем уже есть', srv_ot_need_pen: 'Ничья в матче на выбывание: введите счёт серии пенальти',
  });

  // ================================================================ 中文
  X('zh', {
    ot_entry: '线下赛事（任何项目）', ot_title: '线下赛事', ot_create: '创建线下赛事',
    ot_intro: '为任何项目办赛——足球、羽毛球、乒乓球、电竞、棋类…… 有链接即可观看，无需登录。',
    ot_login_hint: '登录后可创建赛事。观看无需账号。', ot_mine: '我的赛事', ot_recent: '最近的公开赛事', ot_none: '暂无赛事。',
    ot_by: '主办：{name}', ot_st_draft: '未开始', ot_st_running: '进行中', ot_st_finished: '已结束',
    ot_access: '谁可以查看', ot_acc_public: '公开', ot_acc_link: '仅限有链接者', ot_acc_private: '私密（仅自己）',
    ot_slug_hint: '可选：…/?o=<url>，3–20 个字符 a-z 0-9 - _。留空：使用赛事代码。',
    ot_sport: '项目', sport_football: '足球', sport_basketball: '篮球', sport_volleyball: '排球', sport_badminton: '羽毛球',
    sport_tabletennis: '乒乓球', sport_tennis: '网球', sport_esports: '电子竞技', sport_chess: '棋类', sport_other: '其他',
    ot_result: '记录结果的方式', otres_score: '比分（进球 / 得分）', otres_sets: '每局得分', otres_winner: '只记胜者',
    ot_est: '≈ {m} 场 · {w} 轮（{n} 支队伍）', ot_teams: '队伍 / 选手', ot_teams_ph: '每行一支队伍\n队伍 A\n队伍 B',
    ot_teams_hint: '名单顺序即种子顺序。开赛前可增减队伍。',
    ot_quota_hint: '每人最多 10 个未结束的线下赛事，每天最多创建 20 个；每个赛事最多 512 支队伍。',
    ot_n_teams: '{n} 支队伍', ot_start: '开始赛事', ot_delete: '删除赛事', ot_team_del: '移除队伍', ot_add_teams: '添加队伍',
    ot_start_confirm: '以 {n} 支队伍开赛？开赛后不能再增减队伍。', ot_delete_confirm: '永久删除“{name}”？无法恢复。',
    ot_set_rule: '每局 {to} 分，需领先 {by} 分 – Bo{bo}', ot_score: '比分', ot_pen: '点球', ot_pen_hint: '仅在淘汰赛平局时需要。',
    ot_need_score: '请输入双方比分',
    otlog_created: '创建赛事', otlog_edited: '修改设置', otlog_teams_added: '添加 {n} 支队伍', otlog_team_removed: '移除队伍 {name}',
    otlog_started: '以 {n} 支队伍开赛', otlog_score: '{a} – {b}：{s}', otlog_undo: '撤销对局 {match} 的结果',
    srv_ot_not_found: '找不到赛事（或为私密赛事）', srv_ot_spec_stages: '赛事需要 1–3 个阶段', srv_ot_few_teams: '至少需要 2 支队伍 / 2 名选手',
    srv_ot_many_teams: '每个赛事最多 {n} 支队伍 / 选手', srv_ot_many_matches: '该赛制场次过多（最多 {n} 场）——请缩小分组或减少循环次数',
    srv_ot_daily_limit: '每天最多创建 {n} 个线下赛事', srv_ot_active_limit: '每人最多 {n} 个未结束的线下赛事',
    srv_ot_team_dup: '已有同名队伍 / 选手', srv_ot_need_pen: '淘汰赛平局：请输入点球比分',
  });
})();
