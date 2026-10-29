/*
 * Chuỗi 4 ngôn ngữ – Tạo giải: trang Cài đặt nâng cao (tour-adv.js), bản nháp form, dòng ước tính quy mô giải
 * (số trận / lượt đấu / thời gian – tour-estimate.js). Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  // ================================================================ Tiếng Việt
  X('vi', {
    tadv_settings: 'Cài đặt nâng cao',
    tadv_title: 'Cài đặt nâng cao',
    tadv_back_quick: 'Form nhanh',
    tadv_tab_basic: 'Thông tin cơ bản',
    tadv_tab_format: 'Thể thức',
    tadv_tab_games: 'Ván đấu',
    tadv_tab_reg: 'Đăng ký & điểm danh',
    tadv_tab_access: 'Hiển thị & quyền xem',
    tadv_help_basic: 'Tên và giới thiệu hiện ở danh sách giải và trang giải.',
    tadv_help_format: 'Chọn mẫu có sẵn hoặc tự ghép tối đa 3 giai đoạn. Số trận và thời gian ước tính cập nhật ngay ở cuối trang.',
    tadv_help_games: 'Áp dụng cho mọi ván của giải.',
    tadv_help_reg: 'Giờ bắt đầu, số người tối đa, điểm danh trước giờ đấu và cách xếp hạt giống.',
    tadv_help_access: 'Ai thấy giải trong danh sách và ai được tham gia.',
    draft_reset: 'Đặt lại',
    tour_name_required: 'Hãy đặt tên giải.',
    est_line: '≈ {m} trận · {w} lượt đấu · khoảng {t} (nếu đủ {n} người)',
    est_arena: 'Arena · {t} · tối đa {n} người',
    est_hm: '{h} giờ {m} phút',
  });

  // ================================================================ English
  X('en', {
    tadv_settings: 'Advanced settings',
    tadv_title: 'Advanced settings',
    tadv_back_quick: 'Quick form',
    tadv_tab_basic: 'Basic info',
    tadv_tab_format: 'Format',
    tadv_tab_games: 'Games',
    tadv_tab_reg: 'Registration & check-in',
    tadv_tab_access: 'Visibility & access',
    tadv_help_basic: 'The name and description appear in the tournament list and on the tournament page.',
    tadv_help_format: 'Pick a preset or combine up to 3 stages. The match count and estimated time update live at the bottom.',
    tadv_help_games: 'Applies to every game of the tournament.',
    tadv_help_reg: 'Start time, player cap, check-in before the start and seeding.',
    tadv_help_access: 'Who sees the tournament in the list and who can join.',
    draft_reset: 'Reset',
    tour_name_required: 'Please name the tournament.',
    est_line: '≈ {m} matches · {w} rounds · about {t} (with {n} players)',
    est_arena: 'Arena · {t} · up to {n} players',
    est_hm: '{h} h {m} min',
  });

  // ================================================================ Русский
  X('ru', {
    tadv_settings: 'Расширенные настройки',
    tadv_title: 'Расширенные настройки',
    tadv_back_quick: 'Быстрая форма',
    tadv_tab_basic: 'Основное',
    tadv_tab_format: 'Формат',
    tadv_tab_games: 'Партии',
    tadv_tab_reg: 'Регистрация и отметка',
    tadv_tab_access: 'Видимость и доступ',
    tadv_help_basic: 'Название и описание видны в списке турниров и на странице турнира.',
    tadv_help_format: 'Выберите шаблон или соберите до 3 этапов. Число матчей и время обновляются внизу сразу.',
    tadv_help_games: 'Действует для всех партий турнира.',
    tadv_help_reg: 'Время начала, лимит участников, отметка перед стартом и посев.',
    tadv_help_access: 'Кто видит турнир в списке и кто может участвовать.',
    draft_reset: 'Сбросить',
    tour_name_required: 'Укажите название турнира.',
    est_line: '≈ {m} матчей · {w} туров · около {t} (при {n} участниках)',
    est_arena: 'Арена · {t} · до {n} участников',
    est_hm: '{h} ч {m} мин',
  });

  // ================================================================ 中文
  X('zh', {
    tadv_settings: '高级设置',
    tadv_title: '高级设置',
    tadv_back_quick: '快速表单',
    tadv_tab_basic: '基本信息',
    tadv_tab_format: '赛制',
    tadv_tab_games: '对局',
    tadv_tab_reg: '报名与签到',
    tadv_tab_access: '可见性与权限',
    tadv_help_basic: '名称和简介显示在比赛列表和比赛页面上。',
    tadv_help_format: '选择预设，或最多组合 3 个阶段。底部的比赛场数和预计时间会实时更新。',
    tadv_help_games: '适用于本赛事的所有对局。',
    tadv_help_reg: '开始时间、人数上限、赛前签到和种子排列。',
    tadv_help_access: '谁能在列表中看到本赛事，谁可以参加。',
    draft_reset: '重置',
    tour_name_required: '请填写比赛名称。',
    est_line: '≈ {m} 场比赛 · {w} 轮 · 约 {t}（按 {n} 人计）',
    est_arena: '竞技场 · {t} · 最多 {n} 人',
    est_hm: '{h} 小时 {m} 分钟',
  });
})();
