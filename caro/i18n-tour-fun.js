/*
 * Chuỗi 4 ngôn ngữ – Giải đấu Đợt 10: dự đoán bục vinh quang, "Ai sẽ thắng?", bình chọn hạng mục, poster, mẫu giải,
 * sao chép giải, giải định kỳ; nhật ký / lỗi của máy chủ (srv_*: tour-fun.js, tour-tpl.js). Dùng bởi tour-fun.js,
 * tour-tpl.js. Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  // ================================================================ Tiếng Việt
  X('vi', {
    fun_predict: 'Dự đoán bục vinh quang', fun_predict_hint: 'Đoán trước giờ đấu: đúng vị trí 3 điểm, có trên bục nhưng sai vị trí 1 điểm. {n} người đã đoán.',
    fun_place_1: 'Vô địch', fun_place_2: 'Á quân', fun_place_3: 'Hạng ba', fun_predict_save: 'Lưu dự đoán', fun_predict_update: 'Cập nhật dự đoán',
    fun_pred_dup: 'Mỗi người chỉ chọn một vị trí.', fun_pred_top: 'Người đoán giỏi nhất', fun_my_score: 'Bạn được {n} điểm dự đoán.',
    fun_vote: 'Ai sẽ thắng?', fun_votes_n: '{n} phiếu',
    fun_awards: 'Bình chọn cuối giải', fun_awards_hint: 'Mở trong 3 ngày sau khi giải kết thúc. Bạn đổi lựa chọn được.',
    fun_award_mvp: 'Kỳ thủ xuất sắc', fun_award_game: 'Ván đẹp nhất', fun_award_pick: 'Chọn…', fun_award_none: 'Chưa có phiếu.',
    fun_poster: 'Tải poster', fun_poster_podium: 'Bục vinh quang', fun_poster_join: 'Xem và tham gia tại',
    tpl_mine: 'Mẫu của tôi', tpl_use: 'Dùng mẫu', tpl_del: 'Xoá mẫu', tpl_save: 'Lưu thành mẫu', tpl_used: 'Đã điền theo mẫu "{name}"',
    tpl_del_q: 'Xoá mẫu "{name}"?', tpl_name_q: 'Tên mẫu (mỗi người tối đa 10 mẫu):',
    clone_title: 'Sao chép giải', clone_hint: 'Tạo giải mới với cùng cài đặt (thể thức, đăng ký, thời gian ván…). Người chơi không được sao chép.', clone_btn: 'Sao chép thành giải mới',
    recur: 'Lặp lại', recur_none: 'Không lặp lại', recur_weekly: 'Hằng tuần', recur_monthly: 'Hằng tháng',
    recur_hint: 'Giải xong sẽ tự tạo kỳ sau cùng cài đặt (vẫn qua quản trị viên duyệt).', recur_tag_weekly: 'Hằng tuần · kỳ {n}', recur_tag_monthly: 'Hằng tháng · kỳ {n}',
    log_recur_created: 'Tạo tự động (giải định kỳ, kỳ {n})',
    srv_tour_vote_closed: 'Trận này không còn bình chọn được', srv_tour_predict_closed: 'Chỉ dự đoán được trước khi giải bắt đầu',
    srv_tour_award_closed: 'Bình chọn hạng mục đã đóng', srv_tour_tpl_name: 'Tên mẫu cần ít nhất 2 ký tự',
    srv_tour_tpl_limit: 'Mỗi người lưu tối đa {n} mẫu giải – hãy xoá bớt', srv_tour_recur_next: 'Đã tạo kỳ tiếp theo của giải định kỳ: {name}',
  });

  // ================================================================ English
  X('en', {
    fun_predict: 'Predict the podium', fun_predict_hint: 'Guess before the start: right place 3 points, on the podium but wrong place 1 point. {n} predictions so far.',
    fun_place_1: 'Champion', fun_place_2: 'Runner-up', fun_place_3: 'Third place', fun_predict_save: 'Save prediction', fun_predict_update: 'Update prediction',
    fun_pred_dup: 'Pick each player only once.', fun_pred_top: 'Best predictors', fun_my_score: 'You scored {n} prediction points.',
    fun_vote: 'Who will win?', fun_votes_n: '{n} votes',
    fun_awards: 'End-of-event awards', fun_awards_hint: 'Open for 3 days after the event ends. You can change your pick.',
    fun_award_mvp: 'Player of the event', fun_award_game: 'Game of the event', fun_award_pick: 'Pick…', fun_award_none: 'No votes yet.',
    fun_poster: 'Download poster', fun_poster_podium: 'Podium', fun_poster_join: 'Watch and join at',
    tpl_mine: 'My templates', tpl_use: 'Use template', tpl_del: 'Delete template', tpl_save: 'Save as template', tpl_used: 'Filled in from "{name}"',
    tpl_del_q: 'Delete template "{name}"?', tpl_name_q: 'Template name (up to 10 per person):',
    clone_title: 'Copy event', clone_hint: 'Create a new event with the same settings (format, registration, time control…). Players are not copied.', clone_btn: 'Copy as a new event',
    recur: 'Repeat', recur_none: 'Does not repeat', recur_weekly: 'Weekly', recur_monthly: 'Monthly',
    recur_hint: 'When it ends, the next edition is created with the same settings (still reviewed by an admin).', recur_tag_weekly: 'Weekly · edition {n}', recur_tag_monthly: 'Monthly · edition {n}',
    log_recur_created: 'Created automatically (recurring, edition {n})',
    srv_tour_vote_closed: 'Voting is closed for this match', srv_tour_predict_closed: 'Predictions are only open before the start',
    srv_tour_award_closed: 'Award voting is closed', srv_tour_tpl_name: 'The template name needs at least 2 characters',
    srv_tour_tpl_limit: 'You can keep up to {n} templates – delete some first', srv_tour_recur_next: 'Next edition of your recurring event created: {name}',
  });

  // ================================================================ Русский
  X('ru', {
    fun_predict: 'Прогноз призёров', fun_predict_hint: 'Угадайте до начала: точное место – 3 очка, призёр, но не то место – 1 очко. Прогнозов: {n}.',
    fun_place_1: 'Победитель', fun_place_2: '2-е место', fun_place_3: '3-е место', fun_predict_save: 'Сохранить прогноз', fun_predict_update: 'Обновить прогноз',
    fun_pred_dup: 'Каждого игрока можно выбрать один раз.', fun_pred_top: 'Лучшие прогнозисты', fun_my_score: 'У вас {n} очк. за прогноз.',
    fun_vote: 'Кто победит?', fun_votes_n: 'голосов: {n}',
    fun_awards: 'Итоговое голосование', fun_awards_hint: 'Открыто 3 дня после окончания. Выбор можно менять.',
    fun_award_mvp: 'Игрок турнира', fun_award_game: 'Партия турнира', fun_award_pick: 'Выбрать…', fun_award_none: 'Голосов пока нет.',
    fun_poster: 'Скачать постер', fun_poster_podium: 'Призёры', fun_poster_join: 'Смотреть и участвовать:',
    tpl_mine: 'Мои шаблоны', tpl_use: 'Применить', tpl_del: 'Удалить шаблон', tpl_save: 'Сохранить как шаблон', tpl_used: 'Заполнено по шаблону «{name}»',
    tpl_del_q: 'Удалить шаблон «{name}»?', tpl_name_q: 'Название шаблона (не более 10 на человека):',
    clone_title: 'Копировать турнир', clone_hint: 'Новый турнир с теми же настройками (формат, регистрация, контроль…). Игроки не копируются.', clone_btn: 'Копировать как новый',
    recur: 'Повтор', recur_none: 'Без повтора', recur_weekly: 'Еженедельно', recur_monthly: 'Ежемесячно',
    recur_hint: 'После окончания автоматически создаётся следующий выпуск (тоже на проверку).', recur_tag_weekly: 'Еженедельно · выпуск {n}', recur_tag_monthly: 'Ежемесячно · выпуск {n}',
    log_recur_created: 'Создан автоматически (повторяющийся, выпуск {n})',
    srv_tour_vote_closed: 'Голосование по этому матчу закрыто', srv_tour_predict_closed: 'Прогнозы принимаются только до начала',
    srv_tour_award_closed: 'Голосование закрыто', srv_tour_tpl_name: 'Название шаблона – не короче 2 символов',
    srv_tour_tpl_limit: 'Можно хранить не более {n} шаблонов – удалите лишние', srv_tour_recur_next: 'Создан следующий выпуск турнира: {name}',
  });

  // ================================================================ 中文
  X('zh', {
    fun_predict: '预测领奖台', fun_predict_hint: '开赛前竞猜：位置全对得 3 分，上台但位置不对得 1 分。已有 {n} 人预测。',
    fun_place_1: '冠军', fun_place_2: '亚军', fun_place_3: '季军', fun_predict_save: '保存预测', fun_predict_update: '更新预测',
    fun_pred_dup: '每位选手只能选一次。', fun_pred_top: '最佳预测者', fun_my_score: '你获得 {n} 预测分。',
    fun_vote: '谁会赢？', fun_votes_n: '{n} 票',
    fun_awards: '赛后评选', fun_awards_hint: '赛事结束后开放 3 天，可更改选择。',
    fun_award_mvp: '最佳棋手', fun_award_game: '最佳对局', fun_award_pick: '选择…', fun_award_none: '还没有投票。',
    fun_poster: '下载海报', fun_poster_podium: '领奖台', fun_poster_join: '观看与报名：',
    tpl_mine: '我的模板', tpl_use: '使用模板', tpl_del: '删除模板', tpl_save: '保存为模板', tpl_used: '已按模板“{name}”填写',
    tpl_del_q: '删除模板“{name}”？', tpl_name_q: '模板名称（每人最多 10 个）：',
    clone_title: '复制赛事', clone_hint: '以相同设置（赛制、报名、用时…）创建新赛事，不复制选手。', clone_btn: '复制为新赛事',
    recur: '重复', recur_none: '不重复', recur_weekly: '每周', recur_monthly: '每月',
    recur_hint: '结束后自动按相同设置创建下一期（仍需管理员审核）。', recur_tag_weekly: '每周 · 第 {n} 期', recur_tag_monthly: '每月 · 第 {n} 期',
    log_recur_created: '自动创建（周期赛，第 {n} 期）',
    srv_tour_vote_closed: '该对局已停止投票', srv_tour_predict_closed: '仅可在开赛前预测',
    srv_tour_award_closed: '评选已结束', srv_tour_tpl_name: '模板名称至少 2 个字',
    srv_tour_tpl_limit: '最多保存 {n} 个模板——请先删除一些', srv_tour_recur_next: '已创建周期赛的下一期：{name}',
  });
})();
