/*
 * Đa ngôn ngữ: Tiếng Việt (gốc), English, Русский, 中文.
 *  - I18N.t('khoá', { tham_số }) trả về chuỗi đã dịch (thiếu bản dịch thì dùng tiếng Việt).
 *  - Phần tử HTML có data-i18n="khoá" được tự điền chữ; data-i18n-html cho chuỗi có thẻ HTML;
 *    data-i18n-ph / -aria / -title cho placeholder, aria-label, title.
 *  - Thông báo từ máy chủ dùng khoá "srv_<mã>".
 * Tham số chèn vào chuỗi KHÔNG được escape: nơi nào đưa vào innerHTML phải tự escape trước.
 * File này là lõi: API + chuỗi chung (bàn cờ, ván với máy, cài đặt cơ bản). Chuỗi theo chủ đề nằm ở
 * i18n-<chủ đề>.js gọi I18N.extend(): online, play, account, social, tour, tour-stages, club, study, learn
 * (nạp ngay sau file này), rồi rules, bots, demos, shell…
 */
(function () {
  'use strict';

  const DICT = {
    vi: {
      app_title: 'Caro x Gomoku',
      board_aria: 'Bàn cờ caro',
      score_title: 'Tỉ số',
      btn_new: 'Ván mới',
      btn_undo: 'Đi lại',
      btn_center: 'Về giữa',
      btn_online: 'Online',
      btn_settings: 'Cài đặt',
      close: 'Đóng',
      settings: 'Cài đặt',
      mode: 'Chế độ chơi',
      mode_ai: 'Chơi với máy',
      mode_pvp: '2 người (cùng máy)',
      you_play: 'Bạn cầm',
      goes_first: 'đi trước',
      goes_second: 'đi sau',
      level: 'Độ khó',
      level_1: 'Dễ',
      level_2: 'Vừa',
      level_3: 'Khó',
      time_limit: 'Thời gian mỗi nước',
      time_off: 'Không giới hạn',
      seconds: '{n} giây',
      time_hint: 'Hết giờ mà chưa đánh thì bị xử thua.',
      allow_undo: 'Cho phép đi lại',
      sound: 'Âm thanh',
      on: 'Bật',
      off: 'Tắt',
      start_game: 'Bắt đầu',
      yes: 'Có',
      no: 'Không',
      controls: 'Thao tác',
      confirm_tap: 'Chạm 2 lần để đánh (tránh bấm nhầm)',
      theme: 'Giao diện',
      theme_light: 'Sáng',
      theme_dark: 'Tối',
      theme_system: 'Theo hệ thống',
      language: 'Ngôn ngữ',
      rules: 'Luật chơi',
      rules_1: 'X đi trước, hai bên lần lượt đánh vào ô trống. Bàn cờ không giới hạn – kéo để di chuyển, chụm/cuộn để phóng to.',
      rules_2: '<b>4 quân liền</b> không bị chặn đầu nào → <b>thắng</b>.',
      rules_3: '<b>5 quân liền</b> bị chặn 1 đầu → <b>thắng</b>.',
      rules_4: 'Bị chặn <b>cả 2 đầu</b> → <b>không</b> tính thắng.',
      rules_5: 'Nếu có giới hạn thời gian: hết giờ mà chưa đánh → <b>thua</b>.',
      reset_score: 'Xoá tỉ số',
      done: 'Xong',
      turn: 'Lượt {p}',
      you_tag: '(bạn)',
      ai_tag: '(máy)',
      thinking: 'đang nghĩ…',
      p_wins: '{p} thắng!',
      you_win: '🎉 Bạn thắng!',
      ai_wins: 'Máy thắng rồi!',
      p_timeout: '{p} hết giờ',
      you_timeout: 'Bạn hết giờ',
      you: 'Bạn',
      board_style: 'Bàn cờ',
      board_color: 'Màu bàn',
      board_paper: 'Giấy (theo giao diện)',
      board_wood: 'Gỗ',
      board_green: 'Xanh lá',
      board_blue: 'Xanh dương',
      board_night: 'Đêm',
      piece_style: 'Kiểu quân',
      pieces_classic: 'X/O nét mảnh',
      pieces_bold: 'X/O nét đậm',
      pieces_stones: 'Quân đá đen / trắng',
      sound_style: 'Kiểu âm thanh',
      sound_classic: 'Mặc định',
      sound_wood: 'Gõ gỗ',
      sound_soft: 'Nhẹ',
      set_g_game: "Ván chơi",
      set_g_display: "Hiển thị",
      set_g_sound: "Âm thanh & thao tác",
    },

    en: {
      app_title: 'Caro x Gomoku',
      board_aria: 'Caro board',
      score_title: 'Score',
      btn_new: 'New game',
      btn_undo: 'Undo',
      btn_center: 'Center',
      btn_online: 'Online',
      btn_settings: 'Settings',
      close: 'Close',
      settings: 'Settings',
      mode: 'Game mode',
      mode_ai: 'Play vs computer',
      mode_pvp: '2 players (same device)',
      you_play: 'You play',
      goes_first: 'goes first',
      goes_second: 'goes second',
      level: 'Difficulty',
      level_1: 'Easy',
      level_2: 'Medium',
      level_3: 'Hard',
      time_limit: 'Time per move',
      time_off: 'No limit',
      seconds: '{n} s',
      time_hint: 'Run out of time before moving and you lose.',
      allow_undo: 'Allow undo',
      sound: 'Sound',
      on: 'On',
      off: 'Off',
      start_game: 'Start',
      yes: 'Yes',
      no: 'No',
      controls: 'Controls',
      confirm_tap: 'Tap twice to place (prevents mis-taps)',
      theme: 'Theme',
      theme_light: 'Light',
      theme_dark: 'Dark',
      theme_system: 'System',
      language: 'Language',
      rules: 'Rules',
      rules_1: 'X moves first; players take turns placing on empty cells. The board is unlimited – drag to move, pinch/scroll to zoom.',
      rules_2: '<b>4 in a row</b> with both ends open → <b>win</b>.',
      rules_3: '<b>5 in a row</b> blocked at one end → <b>win</b>.',
      rules_4: 'Blocked at <b>both ends</b> → <b>not</b> a win.',
      rules_5: 'With a time limit: run out of time before moving → <b>lose</b>.',
      reset_score: 'Reset score',
      done: 'Done',
      turn: '{p} to move',
      you_tag: '(you)',
      ai_tag: '(computer)',
      thinking: 'thinking…',
      p_wins: '{p} wins!',
      you_win: '🎉 You win!',
      ai_wins: 'The computer wins!',
      p_timeout: '{p} ran out of time',
      you_timeout: 'You ran out of time',
      you: 'You',
      board_style: 'Board',
      board_color: 'Board colour',
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
    },

    ru: {
      app_title: 'Caro x Gomoku',
      board_aria: 'Игровое поле',
      score_title: 'Счёт',
      btn_new: 'Новая игра',
      btn_undo: 'Отменить',
      btn_center: 'В центр',
      btn_online: 'Онлайн',
      btn_settings: 'Настройки',
      close: 'Закрыть',
      settings: 'Настройки',
      mode: 'Режим игры',
      mode_ai: 'Против компьютера',
      mode_pvp: '2 игрока (одно устройство)',
      you_play: 'Вы играете',
      goes_first: 'ходит первым',
      goes_second: 'ходит вторым',
      level: 'Сложность',
      level_1: 'Лёгкая',
      level_2: 'Средняя',
      level_3: 'Сложная',
      time_limit: 'Время на ход',
      time_off: 'Без ограничения',
      seconds: '{n} с',
      time_hint: 'Не успели сделать ход — поражение.',
      allow_undo: 'Разрешить отмену хода',
      sound: 'Звук',
      on: 'Вкл.',
      off: 'Выкл.',
      start_game: 'Начать',
      yes: 'Да',
      no: 'Нет',
      controls: 'Управление',
      confirm_tap: 'Ход двойным касанием (защита от случайных нажатий)',
      theme: 'Тема',
      theme_light: 'Светлая',
      theme_dark: 'Тёмная',
      theme_system: 'Как в системе',
      language: 'Язык',
      rules: 'Правила',
      rules_1: 'X ходит первым, игроки по очереди ставят знаки в пустые клетки. Поле бесконечное — перетаскивайте для перемещения, сводите пальцы/крутите колесо для масштаба.',
      rules_2: '<b>4 в ряд</b>, открытые с обоих концов → <b>победа</b>.',
      rules_3: '<b>5 в ряд</b>, закрытые с одного конца → <b>победа</b>.',
      rules_4: 'Закрытые <b>с обоих концов</b> → <b>не</b> победа.',
      rules_5: 'При ограничении времени: не успели сделать ход → <b>поражение</b>.',
      reset_score: 'Сбросить счёт',
      done: 'Готово',
      turn: 'Ход {p}',
      you_tag: '(вы)',
      ai_tag: '(компьютер)',
      thinking: 'думает…',
      p_wins: '{p} победил!',
      you_win: '🎉 Вы победили!',
      ai_wins: 'Компьютер победил!',
      p_timeout: 'У {p} закончилось время',
      you_timeout: 'У вас закончилось время',
      you: 'Вы',
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
    },

    zh: {
      app_title: 'Caro x Gomoku',
      board_aria: '棋盘',
      score_title: '比分',
      btn_new: '新对局',
      btn_undo: '悔棋',
      btn_center: '回到中心',
      btn_online: '在线',
      btn_settings: '设置',
      close: '关闭',
      settings: '设置',
      mode: '游戏模式',
      mode_ai: '人机对战',
      mode_pvp: '双人（同一设备）',
      you_play: '你执',
      goes_first: '先手',
      goes_second: '后手',
      level: '难度',
      level_1: '简单',
      level_2: '中等',
      level_3: '困难',
      time_limit: '每步时间',
      time_off: '不限时',
      seconds: '{n} 秒',
      time_hint: '超时未落子判负。',
      allow_undo: '允许悔棋',
      sound: '声音',
      on: '开',
      off: '关',
      start_game: '开始',
      yes: '是',
      no: '否',
      controls: '操作',
      confirm_tap: '点两次落子（防止误触）',
      theme: '外观',
      theme_light: '浅色',
      theme_dark: '深色',
      theme_system: '跟随系统',
      language: '语言',
      rules: '规则',
      rules_1: 'X 先手，双方轮流在空格落子。棋盘无限大——拖动移动，双指捏合/滚轮缩放。',
      rules_2: '<b>连成 4 子</b>且两端都未被堵 → <b>获胜</b>。',
      rules_3: '<b>连成 5 子</b>且只被堵一端 → <b>获胜</b>。',
      rules_4: '<b>两端都被堵</b> → <b>不算</b>获胜。',
      rules_5: '限时模式下：超时未落子 → <b>判负</b>。',
      reset_score: '清空比分',
      done: '完成',
      turn: '轮到 {p}',
      you_tag: '（你）',
      ai_tag: '（电脑）',
      thinking: '思考中…',
      p_wins: '{p} 获胜！',
      you_win: '🎉 你赢了！',
      ai_wins: '电脑赢了！',
      p_timeout: '{p} 超时',
      you_timeout: '你超时了',
      you: '你',
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
    },
  };

  const LANGS = [['vi', 'Tiếng Việt'], ['en', 'English'], ['ru', 'Русский'], ['zh', '中文']];
  const HTML_LANG = { vi: 'vi', en: 'en', ru: 'ru', zh: 'zh-CN' };
  const KEY = 'caro.lang';

  function detect() {
    for (const l of navigator.languages || [navigator.language || '']) {
      const code = String(l).slice(0, 2).toLowerCase();
      if (DICT[code]) return code;
    }
    return 'vi';
  }

  let lang;
  try { lang = localStorage.getItem(KEY); } catch (e) { /* riêng tư */ }
  if (!DICT[lang]) lang = detect();
  if (DICT[window.CARO_LANG]) lang = window.CARO_LANG; // trang nhúng (embed-boot.js): ?lang= – không lưu lại

  function t(key, args) {
    const s = DICT[lang][key] ?? DICT.vi[key] ?? key;
    if (!args) return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => (args[k] == null ? '' : String(args[k])));
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-n]').forEach((el) => { el.textContent = t('seconds', { n: el.dataset.i18nN }); });
    root.querySelectorAll('[data-i18n-tc]').forEach((el) => {
      const v = el.dataset.i18nTc;
      el.textContent = v[0] === 'c' ? tc(0, v.slice(1)) : tc(Number(v.slice(1)), null);
    });
    document.documentElement.lang = HTML_LANG[lang];
    document.title = t('app_title');
  }

  /** Loại thời gian của đồng hồ tổng '3+2' (giống máy chủ: phút*60 + 40*giây cộng). */
  function poolOfClock(clock) {
    const [m, i] = String(clock).split('+').map(Number);
    const est = m * 60 + 40 * i;
    return est < 180 ? 'bullet' : est < 480 ? 'blitz' : est < 1500 ? 'rapid' : 'classical';
  }
  /** Nhãn thời gian của ván: '3+2 · Chớp', '20 giây/nước', 'Không giới hạn'. */
  function tc(timeLimit, clock) {
    if (clock) return clock + ' · ' + t('pool_' + poolOfClock(clock));
    return timeLimit ? t('per_move', { n: timeLimit }) : t('time_off');
  }

  function setLang(l) {
    if (!DICT[l] || l === lang) return;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) { /* riêng tư */ }
    apply();
    window.dispatchEvent(new Event('langchange'));
  }

  /** Bổ sung / ghi đè chuỗi cho một ngôn ngữ (i18n-rules.js, i18n-bots.js). */
  function extend(l, obj) { if (DICT[l]) Object.assign(DICT[l], obj); }
  /** ' · Renju' – nhãn luật thắng khác luật Việt Nam (để nối vào dòng thông tin ván). */
  const ruleTag = (rule) => (rule && rule !== 'vn' ? ' · ' + t('grule_s_' + rule) : '');

  window.I18N = {
    t,
    extend,
    ruleTag,
    tc,
    poolOfClock,
    apply,
    setLang,
    LANGS,
    get lang() { return lang; },
    /** Mã ngôn ngữ cho nút đăng nhập Google. */
    get googleLocale() { return { vi: 'vi', en: 'en', ru: 'ru', zh: 'zh_CN' }[lang]; },
  };
})();
