/*
 * Chuỗi 4 ngôn ngữ – xem nhánh đấu (phóng to, toàn màn hình, tải ảnh PNG), dải phong độ, tiến độ + thống kê giải,
 * trang nhúng (embed.html) và khu "Nhúng vào website" của tab Quản lý. Dùng bởi tour-bracket-view.js, tour-stages.js,
 * embed-tour.js, tour-embed.js. Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  // ================================================================ Tiếng Việt
  X('vi', {
    st_progress: 'Tiến độ giải', st_matches: 'Trận đã xong', st_sets: 'Set đã đấu', st_games: 'Ván đã đấu',
    st_live: 'Đang đấu', st_draws: 'Trận hoà', st_walkovers: 'Xử thắng',
    bv_zoom_out: 'Thu nhỏ', bv_zoom_reset: 'Về cỡ gốc', bv_zoom_in: 'Phóng to', bv_full: 'Toàn màn hình', bv_png: 'Tải ảnh PNG',
    col_form: 'Phong độ', col_form_t: '5 trận gần nhất (cũ → mới)',
    form_W: 'Thắng', form_D: 'Hoà', form_L: 'Thua', form_W1: 'T', form_D1: 'H', form_L1: 'B',
    embed_open: 'Xem trên Caro x Gomoku', embed_loading: 'Đang tải…', embed_not_found: 'Không tìm thấy giải, hoặc giải không công khai.',
    embed_retry: 'Mất kết nối, đang thử lại…', embed_updated: 'Cập nhật {t}',
    mg_embed: 'Nhúng vào website',
    mg_embed_hint: 'Dán mã này vào trang web (WordPress, Blogger, Google Sites…) để hiện giải; trang nhúng tự cập nhật khi có kết quả mới.',
    mg_embed_view: 'Hiện', mg_embed_bracket: 'Nhánh đấu / bảng đấu', mg_embed_standings: 'Bảng xếp hạng', mg_embed_players: 'Người chơi',
    mg_embed_theme: 'Giao diện', mg_embed_auto: 'Theo máy người xem', mg_embed_light: 'Sáng', mg_embed_dark: 'Tối',
    mg_embed_code: 'Mã nhúng', mg_embed_json: 'Dữ liệu JSON (cho lập trình viên)', mg_embed_copy: 'Chép', mg_embed_copied: 'Đã chép',
    mg_embed_private: 'Giải riêng tư / chỉ thành viên CLB thì không nhúng được (đổi ở Cài đặt → Hiển thị & quyền xem).',
    mg_embed_wait: 'Nhúng được sau khi giải được duyệt.',
  });

  // ================================================================ English
  X('en', {
    st_progress: 'Tournament progress', st_matches: 'Matches played', st_sets: 'Sets played', st_games: 'Games played',
    st_live: 'In progress', st_draws: 'Draws', st_walkovers: 'Walkovers',
    bv_zoom_out: 'Zoom out', bv_zoom_reset: 'Reset zoom', bv_zoom_in: 'Zoom in', bv_full: 'Full screen', bv_png: 'Download PNG',
    col_form: 'Form', col_form_t: 'Last 5 matches (oldest → newest)',
    form_W: 'Win', form_D: 'Draw', form_L: 'Loss', form_W1: 'W', form_D1: 'D', form_L1: 'L',
    embed_open: 'View on Caro x Gomoku', embed_loading: 'Loading…', embed_not_found: 'Tournament not found, or it is not public.',
    embed_retry: 'Connection lost, retrying…', embed_updated: 'Updated {t}',
    mg_embed: 'Embed on a website',
    mg_embed_hint: 'Paste this code into a web page (WordPress, Blogger, Google Sites…) to show the tournament; the embed updates itself as results come in.',
    mg_embed_view: 'Show', mg_embed_bracket: 'Bracket / groups', mg_embed_standings: 'Standings', mg_embed_players: 'Players',
    mg_embed_theme: 'Theme', mg_embed_auto: 'Viewer’s device', mg_embed_light: 'Light', mg_embed_dark: 'Dark',
    mg_embed_code: 'Embed code', mg_embed_json: 'JSON data (for developers)', mg_embed_copy: 'Copy', mg_embed_copied: 'Copied',
    mg_embed_private: 'Private / club-only tournaments cannot be embedded (change it in Settings → Visibility & access).',
    mg_embed_wait: 'Embedding is available once the tournament is approved.',
  });

  // ================================================================ Русский
  X('ru', {
    st_progress: 'Ход турнира', st_matches: 'Сыграно матчей', st_sets: 'Сыграно сетов', st_games: 'Сыграно партий',
    st_live: 'Идут сейчас', st_draws: 'Ничьи', st_walkovers: 'Технические победы',
    bv_zoom_out: 'Уменьшить', bv_zoom_reset: 'Исходный размер', bv_zoom_in: 'Увеличить', bv_full: 'Во весь экран', bv_png: 'Скачать PNG',
    col_form: 'Форма', col_form_t: 'Последние 5 матчей (старые → новые)',
    form_W: 'Победа', form_D: 'Ничья', form_L: 'Поражение', form_W1: 'В', form_D1: 'Н', form_L1: 'П',
    embed_open: 'Открыть на Caro x Gomoku', embed_loading: 'Загрузка…', embed_not_found: 'Турнир не найден или не является публичным.',
    embed_retry: 'Нет связи, повторяем…', embed_updated: 'Обновлено {t}',
    mg_embed: 'Встроить на сайт',
    mg_embed_hint: 'Вставьте этот код на веб-страницу (WordPress, Blogger, Google Sites…), чтобы показать турнир; встройка обновляется сама по мере появления результатов.',
    mg_embed_view: 'Показать', mg_embed_bracket: 'Сетка / группы', mg_embed_standings: 'Таблица', mg_embed_players: 'Участники',
    mg_embed_theme: 'Тема', mg_embed_auto: 'Как у зрителя', mg_embed_light: 'Светлая', mg_embed_dark: 'Тёмная',
    mg_embed_code: 'Код для вставки', mg_embed_json: 'Данные JSON (для разработчиков)', mg_embed_copy: 'Копировать', mg_embed_copied: 'Скопировано',
    mg_embed_private: 'Приватные турниры и турниры только для клуба встроить нельзя (измените в Настройках → Видимость и доступ).',
    mg_embed_wait: 'Встраивание станет доступно после одобрения турнира.',
  });

  // ================================================================ 中文
  X('zh', {
    st_progress: '赛事进度', st_matches: '已完成对局', st_sets: '已赛局数', st_games: '已下盘数',
    st_live: '进行中', st_draws: '平局', st_walkovers: '判胜',
    bv_zoom_out: '缩小', bv_zoom_reset: '原始大小', bv_zoom_in: '放大', bv_full: '全屏', bv_png: '下载 PNG',
    col_form: '近况', col_form_t: '最近 5 场（旧 → 新）',
    form_W: '胜', form_D: '平', form_L: '负', form_W1: '胜', form_D1: '平', form_L1: '负',
    embed_open: '在 Caro x Gomoku 查看', embed_loading: '加载中…', embed_not_found: '找不到该赛事，或赛事未公开。',
    embed_retry: '连接中断，正在重试…', embed_updated: '更新于 {t}',
    mg_embed: '嵌入网站',
    mg_embed_hint: '将此代码粘贴到网页（WordPress、Blogger、Google Sites…）即可展示赛事；有新结果时嵌入页会自动更新。',
    mg_embed_view: '显示', mg_embed_bracket: '对阵图 / 小组', mg_embed_standings: '排名', mg_embed_players: '选手',
    mg_embed_theme: '外观', mg_embed_auto: '跟随访客设备', mg_embed_light: '浅色', mg_embed_dark: '深色',
    mg_embed_code: '嵌入代码', mg_embed_json: 'JSON 数据（供开发者）', mg_embed_copy: '复制', mg_embed_copied: '已复制',
    mg_embed_private: '私密 / 仅俱乐部成员的赛事无法嵌入（可在 设置 → 可见性与权限 中修改）。',
    mg_embed_wait: '赛事通过审核后即可嵌入。',
  });
})();
