/*
 * Chuỗi 4 ngôn ngữ – thư viện mẫu giải dạng ô gọn + hộp xem chi tiết (otour-tpl-lib.js) và form tạo giải Offline chia
 * bước (otour-new-ui.js). Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    otl_tile: 'Mẫu giải nổi tiếng · {n} mẫu', otl_tile_h: 'Bóng đá, thể thao điện tử, sinh tồn, cờ… Bấm để xem luật, sơ đồ rồi chọn.',
    otl_title: 'Mẫu giải nổi tiếng', otl_search: 'Tìm mẫu theo tên hoặc bộ môn', otl_all: 'Tất cả', otl_none: 'Không có mẫu nào khớp. Hãy thử từ khác.',
    otl_cat_football: 'Bóng đá', otl_cat_esports: 'Thể thao điện tử', otl_cat_br: 'Sinh tồn và đấu nhiều đội', otl_cat_sports: 'Thể thao khác',
    otl_cat_race: 'Đua và tính điểm', otl_cat_mind: 'Cờ và trí tuệ',
    otl_stages: '{n} giai đoạn', otl_back: 'Quay lại danh sách', otl_close: 'Đóng', otl_use: 'Dùng mẫu này', otl_info: 'Xem chi tiết mẫu',
    otl_fig: 'Sơ đồ thể thức', otl_fig_note: 'Hình minh hoạ vẽ từ thông số của mẫu ({n} đội). Chỉ mô phỏng thể thức, không dùng tên, logo hay dữ liệu của giải thật.',
    otl_rules: 'Luật chơi', otl_detail: 'Từng giai đoạn', otl_links: 'Tìm hiểu thể thức', otl_link_en: '(tiếng Anh)',
    otl_wiki_rr: 'Thi đấu vòng tròn', otl_wiki_single: 'Loại trực tiếp', otl_wiki_double: 'Nhánh thắng – nhánh thua', otl_wiki_swiss: 'Hệ Thụy Sĩ', otl_wiki_page: 'Page playoff',
    otl_st: 'Giai đoạn {n}', otl_out: '{n} đi tiếp', otl_direct: '+{n} vào thẳng',
    otl_k_rr: 'Vòng tròn', otl_k_groups: 'Vòng bảng ({n} bảng)', otl_k_single: 'Loại trực tiếp', otl_k_double: 'Nhánh thắng – nhánh thua', otl_k_swiss: 'Hệ Thụy Sĩ',
    otl_k_race: 'Đua tính điểm', otl_k_ladder: 'Thang leo bậc',
    otn_quick: 'Bắt đầu nhanh', otn_quick_h: 'Dùng một mẫu có sẵn hoặc nhờ trợ lý AI. Mọi thứ vẫn sửa được ở các bước dưới.',
    otn_s1: 'Thông tin cơ bản', otn_s1_h: 'Tên giải, link riêng, lời giới thiệu và ai được xem.',
    otn_s2: 'Bộ môn và thể thức', otn_s2_h: 'Chọn môn và cách thi đấu. Cần thì chỉnh từng giai đoạn ở dưới.',
    otn_s3: 'Đội hoặc người chơi', otn_s3_h: 'Mỗi dòng một đội. Trước khi bắt đầu vẫn thêm hoặc bớt được.',
    otn_s4: 'Tuỳ chọn nâng cao', otn_s4_h: 'Nhập hoặc xuất cấu hình JSON. Thường không cần.',
    otn_fmt_pick: 'Chọn nhanh thể thức', otn_fmt_all: 'Tất cả thể thức (kể cả đua và tuỳ chỉnh)', otn_stages: 'Chi tiết các giai đoạn',
    otn_fmt_single_h: 'Thua là bị loại. Nhanh, ít trận.', otn_fmt_double_h: 'Thua 2 trận mới bị loại. Công bằng hơn.',
    otn_fmt_roundrobin_h: 'Ai cũng gặp nhau, xếp hạng theo điểm.', otn_fmt_swiss_h: 'Mỗi vòng ghép đội cùng thành tích. Hợp giải đông.',
    otn_fmt_groups_single_h: 'Đá bảng, đội đầu bảng vào loại trực tiếp.', otn_fmt_swiss_single_h: 'Hệ Thụy Sĩ chọn đội, rồi đá loại trực tiếp.',
    otn_sum: 'Giải của bạn', otn_sum_line: '{n} đội · {fmt} · khoảng {m} trận', otn_sum_none: 'Chưa có đội · {fmt}',
  });

  X('en', {
    otl_tile: 'Famous tournament templates · {n}', otl_tile_h: 'Football, esports, battle royale, chess… Tap to see the rules and a diagram, then pick one.',
    otl_title: 'Famous tournament templates', otl_search: 'Search by name or sport', otl_all: 'All', otl_none: 'No templates match. Try another word.',
    otl_cat_football: 'Football', otl_cat_esports: 'Esports', otl_cat_br: 'Battle royale and free-for-all', otl_cat_sports: 'Other sports',
    otl_cat_race: 'Racing and points', otl_cat_mind: 'Chess and mind games',
    otl_stages: '{n} stages', otl_back: 'Back to the list', otl_close: 'Close', otl_use: 'Use this template', otl_info: 'Template details',
    otl_fig: 'Format diagram', otl_fig_note: 'Illustration drawn from the template settings ({n} teams). It only simulates the format and uses no names, logos or data of real events.',
    otl_rules: 'Rules', otl_detail: 'Stage by stage', otl_links: 'Learn about the format', otl_link_en: '(in English)',
    otl_wiki_rr: 'Round-robin tournament', otl_wiki_single: 'Single elimination', otl_wiki_double: 'Double elimination', otl_wiki_swiss: 'Swiss system', otl_wiki_page: 'Page playoff',
    otl_st: 'Stage {n}', otl_out: '{n} advance', otl_direct: '+{n} enter directly',
    otl_k_rr: 'Round-robin', otl_k_groups: 'Groups ({n})', otl_k_single: 'Single elimination', otl_k_double: 'Double elimination', otl_k_swiss: 'Swiss',
    otl_k_race: 'Points race', otl_k_ladder: 'Stepladder',
    otn_quick: 'Quick start', otn_quick_h: 'Use a ready-made template or ask the AI assistant. You can still change everything in the steps below.',
    otn_s1: 'Basic info', otn_s1_h: 'Name, custom link, description and who can view the tournament.',
    otn_s2: 'Sport and format', otn_s2_h: 'Pick the sport and how matches are played. Fine-tune each stage below if needed.',
    otn_s3: 'Teams or players', otn_s3_h: 'One team per line. You can add or remove teams until the tournament starts.',
    otn_s4: 'Advanced options', otn_s4_h: 'Import or export the JSON configuration. Usually not needed.',
    otn_fmt_pick: 'Quick format choice', otn_fmt_all: 'All formats (including racing and custom)', otn_stages: 'Stage details',
    otn_fmt_single_h: 'Lose once and you are out. Fast, few matches.', otn_fmt_double_h: 'Out after two losses. Fairer.',
    otn_fmt_roundrobin_h: 'Everyone plays everyone, ranked by points.', otn_fmt_swiss_h: 'Each round pairs teams with the same record. Good for big events.',
    otn_fmt_groups_single_h: 'Group stage, then the top teams play a knockout.', otn_fmt_swiss_single_h: 'Swiss rounds pick the teams, then a knockout.',
    otn_sum: 'Your tournament', otn_sum_line: '{n} teams · {fmt} · about {m} matches', otn_sum_none: 'No teams yet · {fmt}',
  });

  X('ru', {
    otl_tile: 'Шаблоны известных турниров · {n}', otl_tile_h: 'Футбол, киберспорт, королевская битва, шахматы… Нажмите, чтобы посмотреть правила и схему.',
    otl_title: 'Шаблоны известных турниров', otl_search: 'Поиск по названию или виду спорта', otl_all: 'Все', otl_none: 'Подходящих шаблонов нет. Попробуйте другое слово.',
    otl_cat_football: 'Футбол', otl_cat_esports: 'Киберспорт', otl_cat_br: 'Королевская битва и игры на много команд', otl_cat_sports: 'Другие виды спорта',
    otl_cat_race: 'Гонки и зачёт по очкам', otl_cat_mind: 'Шахматы и интеллектуальные игры',
    otl_stages: 'Этапов: {n}', otl_back: 'Назад к списку', otl_close: 'Закрыть', otl_use: 'Использовать шаблон', otl_info: 'Подробнее о шаблоне',
    otl_fig: 'Схема формата', otl_fig_note: 'Иллюстрация построена по настройкам шаблона (команд: {n}). Это только модель формата, без названий, логотипов и данных реальных турниров.',
    otl_rules: 'Правила', otl_detail: 'По этапам', otl_links: 'Подробнее о формате', otl_link_en: '(на английском)',
    otl_wiki_rr: 'Круговая система', otl_wiki_single: 'Олимпийская система', otl_wiki_double: 'Система с выбыванием после двух поражений', otl_wiki_swiss: 'Швейцарская система', otl_wiki_page: 'Плей-офф Пейджа',
    otl_st: 'Этап {n}', otl_out: 'проходят дальше: {n}', otl_direct: '+{n} сразу',
    otl_k_rr: 'Круговая система', otl_k_groups: 'Группы ({n})', otl_k_single: 'Олимпийская система', otl_k_double: 'Двойное выбывание', otl_k_swiss: 'Швейцарская система',
    otl_k_race: 'Гонка по очкам', otl_k_ladder: 'Лесенка',
    otn_quick: 'Быстрый старт', otn_quick_h: 'Возьмите готовый шаблон или спросите ИИ-помощника. Всё можно изменить на шагах ниже.',
    otn_s1: 'Основное', otn_s1_h: 'Название, своя ссылка, описание и кто видит турнир.',
    otn_s2: 'Вид спорта и формат', otn_s2_h: 'Выберите вид спорта и формат. Если нужно, настройте каждый этап ниже.',
    otn_s3: 'Команды или игроки', otn_s3_h: 'Одна команда в строке. До старта турнира можно добавлять и убирать команды.',
    otn_s4: 'Дополнительно', otn_s4_h: 'Импорт и экспорт настроек в JSON. Обычно не требуется.',
    otn_fmt_pick: 'Быстрый выбор формата', otn_fmt_all: 'Все форматы (включая гонки и свою схему)', otn_stages: 'Настройка этапов',
    otn_fmt_single_h: 'Одно поражение — и команда выбывает. Быстро, мало матчей.', otn_fmt_double_h: 'Выбывание после двух поражений. Справедливее.',
    otn_fmt_roundrobin_h: 'Каждый играет с каждым, место по очкам.', otn_fmt_swiss_h: 'В каждом туре встречаются команды с равным счётом. Для больших турниров.',
    otn_fmt_groups_single_h: 'Групповой этап, затем лучшие играют на выбывание.', otn_fmt_swiss_single_h: 'Швейцарская система отбирает команды, затем плей-офф.',
    otn_sum: 'Ваш турнир', otn_sum_line: 'Команд: {n} · {fmt} · около {m} матчей', otn_sum_none: 'Команд пока нет · {fmt}',
  });

  X('zh', {
    otl_tile: '知名赛事模板 · {n} 个', otl_tile_h: '足球、电子竞技、大逃杀、棋类…点击查看规则和赛制图，再选择模板。',
    otl_title: '知名赛事模板', otl_search: '按名称或项目搜索', otl_all: '全部', otl_none: '没有匹配的模板。请换个词试试。',
    otl_cat_football: '足球', otl_cat_esports: '电子竞技', otl_cat_br: '大逃杀与多队混战', otl_cat_sports: '其他运动',
    otl_cat_race: '竞速与积分赛', otl_cat_mind: '棋牌与智力运动',
    otl_stages: '{n} 个阶段', otl_back: '返回列表', otl_close: '关闭', otl_use: '使用此模板', otl_info: '查看模板详情',
    otl_fig: '赛制图', otl_fig_note: '插图根据模板参数绘制（{n} 队）。仅模拟赛制，不使用真实赛事的名称、标志或数据。',
    otl_rules: '比赛规则', otl_detail: '各阶段', otl_links: '了解赛制', otl_link_en: '（英文）',
    otl_wiki_rr: '循环赛', otl_wiki_single: '单败淘汰', otl_wiki_double: '双败淘汰', otl_wiki_swiss: '瑞士制', otl_wiki_page: '佩奇制',
    otl_st: '第 {n} 阶段', otl_out: '{n} 队晋级', otl_direct: '另有 {n} 队直接进入',
    otl_k_rr: '单循环', otl_k_groups: '小组赛（{n} 组）', otl_k_single: '单败淘汰', otl_k_double: '双败淘汰', otl_k_swiss: '瑞士制',
    otl_k_race: '积分赛', otl_k_ladder: '阶梯赛',
    otn_quick: '快速开始', otn_quick_h: '使用现成模板或询问 AI 助手。之后仍可在下方的步骤中修改所有内容。',
    otn_s1: '基本信息', otn_s1_h: '赛事名称、专属链接、介绍以及谁可以查看。',
    otn_s2: '项目与赛制', otn_s2_h: '选择项目和比赛方式。如有需要，可在下方调整各阶段。',
    otn_s3: '队伍或选手', otn_s3_h: '每行一个队伍。开赛前仍可添加或移除。',
    otn_s4: '高级选项', otn_s4_h: '导入或导出 JSON 配置。通常不需要。',
    otn_fmt_pick: '快速选择赛制', otn_fmt_all: '全部赛制（包括竞速和自定义）', otn_stages: '各阶段设置',
    otn_fmt_single_h: '输一场即被淘汰。快速，场次少。', otn_fmt_double_h: '输两场才被淘汰。更公平。',
    otn_fmt_roundrobin_h: '每队互相交手，按积分排名。', otn_fmt_swiss_h: '每轮让战绩相同的队伍对阵。适合大型赛事。',
    otn_fmt_groups_single_h: '先打小组赛，小组前列进入淘汰赛。', otn_fmt_swiss_single_h: '先用瑞士制选出队伍，再打淘汰赛。',
    otn_sum: '你的赛事', otn_sum_line: '{n} 队 · {fmt} · 约 {m} 场', otn_sum_none: '暂无队伍 · {fmt}',
  });
})();
