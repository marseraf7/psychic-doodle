// Chuỗi giao diện: Lớp học / Nghiên cứu (classroom.js, class-view.js – C2).
(function () {
  'use strict';
  const X = window.I18N.extend;
  X('vi', {
    cls_title: 'Lớp học',
    cls_sub: 'Soạn bài nghiên cứu nhiều chương: thế cờ, các biến, lời bình, dấu ô và mũi tên; học viên theo dõi trực tiếp',
    cls_mine: 'Bài của tôi', cls_club_list: 'Lớp của CLB', cls_public: 'Bài công khai', cls_none: 'Chưa có bài nào',
    cls_title_f: 'Tiêu đề', cls_vis: 'Ai xem được', cls_club: 'Lớp của CLB', cls_no_club: 'Không (bài riêng của tôi)',
    cls_vis_public: 'Công khai', cls_vis_unlisted: 'Ai có link', cls_vis_private: 'Chỉ mình tôi', cls_vis_club: 'Thành viên CLB',
    cls_chapters_n: '{n} chương', cls_create: 'Tạo bài', cls_need_account: 'Đăng nhập tài khoản để tạo bài; bài công khai thì ai cũng xem được',
    cls_mode: 'Bấm bàn cờ để', cls_mode_move: 'Đi nước', cls_mode_mark: 'Đánh dấu ô', cls_mode_arrow: 'Vẽ mũi tên (2 ô)',
    cls_del_move: 'Xoá từ nước này', cls_promote: 'Làm nhánh chính', cls_add_chapter: 'Thêm chương', cls_import: 'Nhập ván',
    cls_del_chapter: 'Xoá chương', cls_delete: 'Xoá bài', cls_save_comment: 'Lưu lời bình', cls_follow: 'Theo giáo viên',
    cls_leave: 'Rời bài', cls_share: 'Chia sẻ', cls_chapter: 'Chương', cls_moves: 'Các nước', cls_empty: 'Chưa có nước nào – bấm bàn cờ để đi',
    cls_copied: 'Đã sao chép link bài', cls_chapter_name: 'Tên chương', cls_del_chapter_q: 'Xoá chương này?', cls_delete_q: 'Xoá cả bài nghiên cứu này?',
    cls_import_q: 'Dán các nước (vd. h8 i9 i8) hoặc mã / link xem lại ván', cls_import_bad: 'Không đọc được ván này', cls_gone: 'Bài nghiên cứu đã bị xoá',
    srv_cls_not_found: 'Không thấy bài nghiên cứu này (hoặc bạn không có quyền xem)', srv_cls_too_big: 'Bài quá lớn – hãy tách bớt sang chương / bài khác',
    srv_cls_too_many: 'Tối đa {n} bài nghiên cứu mỗi người', srv_cls_title_short: 'Tiêu đề cần ít nhất 3 ký tự',
  });
  X('en', {
    cls_title: 'Classroom',
    cls_sub: 'Build multi-chapter studies: positions, variations, comments, cell marks and arrows; students follow live',
    cls_mine: 'My studies', cls_club_list: 'Club classes', cls_public: 'Public studies', cls_none: 'No studies yet',
    cls_title_f: 'Title', cls_vis: 'Who can see it', cls_club: 'Club class', cls_no_club: 'None (my own study)',
    cls_vis_public: 'Public', cls_vis_unlisted: 'Anyone with the link', cls_vis_private: 'Only me', cls_vis_club: 'Club members',
    cls_chapters_n: '{n} chapters', cls_create: 'Create study', cls_need_account: 'Log in to create studies; anyone can view public ones',
    cls_mode: 'Clicking the board will', cls_mode_move: 'Play a move', cls_mode_mark: 'Mark a cell', cls_mode_arrow: 'Draw an arrow (2 cells)',
    cls_del_move: 'Delete from here', cls_promote: 'Make main line', cls_add_chapter: 'Add chapter', cls_import: 'Import game',
    cls_del_chapter: 'Delete chapter', cls_delete: 'Delete study', cls_save_comment: 'Save comment', cls_follow: 'Follow the teacher',
    cls_leave: 'Leave study', cls_share: 'Share', cls_chapter: 'Chapter', cls_moves: 'Moves', cls_empty: 'No moves yet – click the board to play',
    cls_copied: 'Study link copied', cls_chapter_name: 'Chapter name', cls_del_chapter_q: 'Delete this chapter?', cls_delete_q: 'Delete this whole study?',
    cls_import_q: 'Paste moves (e.g. h8 i9 i8) or a replay id / link', cls_import_bad: 'Could not read this game', cls_gone: 'The study was deleted',
    srv_cls_not_found: 'Study not found (or you cannot view it)', srv_cls_too_big: 'The study is too large – move some of it to another chapter or study',
    srv_cls_too_many: 'At most {n} studies per person', srv_cls_title_short: 'The title needs at least 3 characters',
  });
  X('ru', {
    cls_title: 'Класс',
    cls_sub: 'Создавайте исследования из нескольких глав: позиции, варианты, комментарии, отметки и стрелки; ученики следят вживую',
    cls_mine: 'Мои исследования', cls_club_list: 'Занятия клуба', cls_public: 'Открытые исследования', cls_none: 'Исследований пока нет',
    cls_title_f: 'Название', cls_vis: 'Кто видит', cls_club: 'Занятие клуба', cls_no_club: 'Нет (моё исследование)',
    cls_vis_public: 'Все', cls_vis_unlisted: 'Все, у кого есть ссылка', cls_vis_private: 'Только я', cls_vis_club: 'Члены клуба',
    cls_chapters_n: 'глав: {n}', cls_create: 'Создать', cls_need_account: 'Войдите, чтобы создавать исследования; открытые доступны всем',
    cls_mode: 'Нажатие на доску', cls_mode_move: 'Ход', cls_mode_mark: 'Отметка клетки', cls_mode_arrow: 'Стрелка (2 клетки)',
    cls_del_move: 'Удалить отсюда', cls_promote: 'Сделать главной линией', cls_add_chapter: 'Добавить главу', cls_import: 'Импорт партии',
    cls_del_chapter: 'Удалить главу', cls_delete: 'Удалить исследование', cls_save_comment: 'Сохранить комментарий', cls_follow: 'Следить за учителем',
    cls_leave: 'Выйти', cls_share: 'Поделиться', cls_chapter: 'Глава', cls_moves: 'Ходы', cls_empty: 'Ходов пока нет — нажмите на доску',
    cls_copied: 'Ссылка скопирована', cls_chapter_name: 'Название главы', cls_del_chapter_q: 'Удалить эту главу?', cls_delete_q: 'Удалить всё исследование?',
    cls_import_q: 'Вставьте ходы (например, h8 i9 i8) или код / ссылку на просмотр партии', cls_import_bad: 'Не удалось прочитать партию', cls_gone: 'Исследование удалено',
    srv_cls_not_found: 'Исследование не найдено (или нет доступа)', srv_cls_too_big: 'Исследование слишком большое — вынесите часть в другую главу или исследование',
    srv_cls_too_many: 'Не больше {n} исследований на человека', srv_cls_title_short: 'В названии нужно не меньше 3 символов',
  });
  X('zh', {
    cls_title: '课堂',
    cls_sub: '编写多章节研究：局面、变着、评注、格子标记和箭头；学生可实时跟随',
    cls_mine: '我的研究', cls_club_list: '俱乐部课程', cls_public: '公开研究', cls_none: '还没有研究',
    cls_title_f: '标题', cls_vis: '可见范围', cls_club: '俱乐部课程', cls_no_club: '无（我自己的研究）',
    cls_vis_public: '公开', cls_vis_unlisted: '持有链接者', cls_vis_private: '仅自己', cls_vis_club: '俱乐部成员',
    cls_chapters_n: '{n} 章', cls_create: '创建研究', cls_need_account: '登录后可创建研究；公开研究人人可看',
    cls_mode: '点击棋盘用于', cls_mode_move: '走棋', cls_mode_mark: '标记格子', cls_mode_arrow: '画箭头（2 格）',
    cls_del_move: '从此步删除', cls_promote: '设为主线', cls_add_chapter: '添加章节', cls_import: '导入对局',
    cls_del_chapter: '删除章节', cls_delete: '删除研究', cls_save_comment: '保存评注', cls_follow: '跟随老师',
    cls_leave: '离开研究', cls_share: '分享', cls_chapter: '章节', cls_moves: '着法', cls_empty: '还没有着法——点击棋盘走棋',
    cls_copied: '已复制研究链接', cls_chapter_name: '章节名称', cls_del_chapter_q: '删除此章节？', cls_delete_q: '删除整个研究？',
    cls_import_q: '粘贴着法（如 h8 i9 i8）或回放代码 / 链接', cls_import_bad: '无法读取此对局', cls_gone: '该研究已被删除',
    srv_cls_not_found: '找不到该研究（或你无权查看）', srv_cls_too_big: '研究过大——请把部分内容移到其他章节或研究',
    srv_cls_too_many: '每人最多 {n} 个研究', srv_cls_title_short: '标题至少需要 3 个字符',
  });
})();
