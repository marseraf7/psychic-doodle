/*
 * Chuỗi giao diện: kiểu bàn cờ, kiểu quân, kiểu âm thanh và tên các nhóm trong Cài đặt (settings-ui.js, index.html).
 * Tách khỏi lõi caro/i18n.js (giữ lõi dưới ~400 dòng – skill chia-file-hub). Đủ 4 ngôn ngữ (docs/van-phong-4-ngon-ngu.md);
 * ngôn ngữ thư mục: caro/i18n/<mã>/look.js.
 */
(function () {
  'use strict';
  const I = window.I18N;
  I.extend('vi', {
    board_style: 'Bàn cờ',
    board_color: 'Màu bàn',
    board_paper: 'Giấy (theo giao diện)',
    board_wood: 'Gỗ',
    board_green: 'Xanh lá',
    board_blue: 'Xanh dương',
    board_night: 'Đêm',
    piece_style: 'Kiểu quân',
    pieces_classic: 'X / O nét mảnh',
    pieces_bold: 'X / O nét đậm',
    pieces_stones: 'Quân đá đen và trắng',
    sound_style: 'Kiểu âm thanh',
    sound_classic: 'Mặc định',
    sound_wood: 'Tiếng gõ gỗ',
    sound_soft: 'Nhẹ nhàng',
    set_g_game: "Ván chơi",
    set_g_display: "Hiển thị",
    set_g_sound: 'Âm thanh và thao tác',
  });
  I.extend('en', {
    board_style: 'Board',
    board_color: 'Board color',
    board_paper: 'Paper (follows theme)',
    board_wood: 'Wood',
    board_green: 'Green',
    board_blue: 'Blue',
    board_night: 'Night',
    piece_style: 'Pieces',
    pieces_classic: 'Thin X/O',
    pieces_bold: 'Bold X/O',
    pieces_stones: 'Black / white stones',
    sound_style: 'Sound style',
    sound_classic: 'Default',
    sound_wood: 'Wood knock',
    sound_soft: 'Soft',
    set_g_game: "Game",
    set_g_display: "Display",
    set_g_sound: "Sound & controls",
  });
  I.extend('ru', {
    board_style: 'Доска',
    board_color: 'Цвет доски',
    board_paper: 'Бумага (по теме)',
    board_wood: 'Дерево',
    board_green: 'Зелёная',
    board_blue: 'Синяя',
    board_night: 'Ночь',
    piece_style: 'Фигуры',
    pieces_classic: 'Тонкие X/O',
    pieces_bold: 'Жирные X/O',
    pieces_stones: 'Чёрные / белые камни',
    sound_style: 'Звуки',
    sound_classic: 'Обычные',
    sound_wood: 'Стук дерева',
    sound_soft: 'Тихие',
    set_g_game: "Партия",
    set_g_display: "Внешний вид",
    set_g_sound: "Звук и управление",
  });
  I.extend('zh', {
    board_style: '棋盘',
    board_color: '棋盘颜色',
    board_paper: '纸（跟随主题）',
    board_wood: '木纹',
    board_green: '绿色',
    board_blue: '蓝色',
    board_night: '夜间',
    piece_style: '棋子',
    pieces_classic: '细 X/O',
    pieces_bold: '粗 X/O',
    pieces_stones: '黑白棋子',
    sound_style: '音效',
    sound_classic: '默认',
    sound_wood: '木头敲击',
    sound_soft: '轻柔',
    set_g_game: "对局",
    set_g_display: "显示",
    set_g_sound: "声音与操作",
  });
})();
