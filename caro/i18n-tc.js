/* Chuỗi dịch của phần thời gian ván đấu (tc-picker.js) và hộp "Thiết lập ván đấu" – 4 ngôn ngữ. */
(function () {
  'use strict';
  const I = window.I18N;
  I.extend('vi', {
    tc_move: 'Mỗi nước',
    tc_clock: 'Đồng hồ',
    tc_secs: 'Số giây mỗi nước',
    tc_minutes: 'Số phút mỗi bên',
    tc_inc: 'Giây cộng mỗi nước',
    ng_title: 'Thiết lập ván đấu',
    ng_side: 'Bên',
    side_x: 'Cầm X (đi trước)',
    side_random: 'Ngẫu nhiên',
    side_o: 'Cầm O (đi sau)',
    ng_play: 'Chơi',
    qm_custom_sub: 'tự chọn thời gian',
  });
  I.extend('en', {
    tc_move: 'Per move',
    tc_clock: 'Clock',
    tc_secs: 'Seconds per move',
    tc_minutes: 'Minutes per side',
    tc_inc: 'Increment in seconds',
    ng_title: 'Game setup',
    ng_side: 'Side',
    side_x: 'Play X (first)',
    side_random: 'Random',
    side_o: 'Play O (second)',
    ng_play: 'Play',
    qm_custom_sub: 'pick your time',
  });
  I.extend('ru', {
    tc_move: 'На ход',
    tc_clock: 'Часы',
    tc_secs: 'Секунд на ход',
    tc_minutes: 'Минут на партию',
    tc_inc: 'Добавление в секундах',
    ng_title: 'Настройка партии',
    ng_side: 'Сторона',
    side_x: 'Играть X (первым)',
    side_random: 'Случайно',
    side_o: 'Играть O (вторым)',
    ng_play: 'Играть',
    qm_custom_sub: 'своё время',
  });
  I.extend('zh', {
    tc_move: '每步限时',
    tc_clock: '棋钟',
    tc_secs: '每步秒数',
    tc_minutes: '每方分钟数',
    tc_inc: '每步加秒',
    ng_title: '对局设置',
    ng_side: '执子',
    side_x: '执 X（先手）',
    side_random: '随机',
    side_o: '执 O（后手）',
    ng_play: '开始',
    qm_custom_sub: '自选时间',
  });
})();
