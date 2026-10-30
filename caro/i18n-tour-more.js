/*
 * Chuỗi 4 ngôn ngữ – các ô "Advanced options" kiểu Challonge ở trang Cài đặt nâng cao (tab Quyền, Thông báo, Khác), tự báo
 * tỉ số, thông báo giải trong chuông (tới trận, kết quả). Dùng bởi tour-adv-more.js, tour-score.js, topbar-inbox.js.
 * Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  // ================================================================ Tiếng Việt
  X('vi', {
    tadv_tab_access: 'Quyền & hiển thị', tadv_tab_notify: 'Thông báo', tadv_tab_misc: 'Khác',
    tadv_help_notify: 'Khi nào báo cho người chơi (chuông thông báo trong app).', tadv_help_misc: 'Những mục người xem thấy trên trang giải. Ban tổ chức luôn thấy đủ.',
    adv_self_report: 'Cho người chơi có tài khoản tự báo tỉ số trận của mình',
    adv_self_report_hint: 'Giải offline: thêm người chơi bằng dòng "@tên_đăng_nhập" ở Thêm người chơi. Ban tổ chức vẫn sửa / huỷ được kết quả.',
    adv_admins: 'Chia sẻ quyền quản trị giải', adv_admins_hint: 'Tên đăng nhập, cách nhau dấu phẩy (tối đa 10). Họ thành đồng ban tổ chức đủ quyền.',
    adv_admins_edit: 'Thêm / bớt đồng ban tổ chức ở tab Quản lý → Ban tổ chức.',
    adv_notify_match: 'Báo người chơi khi tới trận của họ', adv_notify_match_hint: 'Giải offline: báo người chơi có tài khoản khi trận đã đủ hai người.',
    adv_notify_results: 'Gửi kết quả khi giải kết thúc', adv_notify_results_hint: 'Vào chuông thông báo của người chơi; ai đang offline nhận khi vào lại.',
    adv_show_news: 'Hiện mục Thông báo với người xem', adv_show_standings: 'Hiện bảng xếp hạng với người xem',
    score_self_hint: 'Bạn đang tự báo tỉ số trận của mình – hãy nhập đúng; ban tổ chức xem được và sửa nếu cần.',
    nt_tour_match: '{name}: tới trận của bạn – gặp {opp}', nt_tour_place: '{name} đã kết thúc – bạn xếp hạng {n}', nt_tour_done: '{name} đã kết thúc – vô địch: {winner}',
    log_self_score: 'Người chơi tự báo tỉ số {a} – {b}: {s}',
  });

  // ================================================================ English
  X('en', {
    tadv_tab_access: 'Permissions & visibility', tadv_tab_notify: 'Notifications', tadv_tab_misc: 'Misc',
    tadv_help_notify: 'When players get notified (the in-app notification bell).', tadv_help_misc: 'What viewers see on the event page. Organizers always see everything.',
    adv_self_report: 'Allow participants with accounts to report their own scores',
    adv_self_report_hint: 'Offline events: add players with an "@username" line in Add players. Organizers can still edit or undo results.',
    adv_admins: 'Share admin access to this event', adv_admins_hint: 'Usernames separated by commas (up to 10). They become co-organizers with full access.',
    adv_admins_edit: 'Add or remove co-organizers in the Manage tab → Organizers.',
    adv_notify_match: 'Notify players when their matches become available', adv_notify_match_hint: 'Offline events: notify players with accounts once both players of a match are known.',
    adv_notify_results: 'Send out the final results when the event ends', adv_notify_results_hint: 'Goes to players’ notifications; anyone offline gets it when they come back.',
    adv_show_news: 'Show the announcements section to viewers', adv_show_standings: 'Show standings to viewers',
    score_self_hint: 'You are reporting your own match – please enter it accurately; organizers can see and correct it.',
    nt_tour_match: '{name}: your match is ready – vs {opp}', nt_tour_place: '{name} has ended – you placed {n}', nt_tour_done: '{name} has ended – champion: {winner}',
    log_self_score: 'Player-reported score {a} – {b}: {s}',
  });

  // ================================================================ Русский
  X('ru', {
    tadv_tab_access: 'Права и видимость', tadv_tab_notify: 'Уведомления', tadv_tab_misc: 'Прочее',
    tadv_help_notify: 'Когда уведомлять игроков (колокольчик в приложении).', tadv_help_misc: 'Что видят зрители на странице турнира. Организаторы видят всё.',
    adv_self_report: 'Участники с аккаунтом сами сообщают счёт своих матчей',
    adv_self_report_hint: 'Офлайн-турнир: добавляйте игроков строкой «@логин» в «Добавить игроков». Организаторы могут исправить или отменить результат.',
    adv_admins: 'Поделиться правами администратора', adv_admins_hint: 'Логины через запятую (до 10). Они станут соорганизаторами с полными правами.',
    adv_admins_edit: 'Соорганизаторов можно менять во вкладке «Управление» → «Организаторы».',
    adv_notify_match: 'Сообщать игрокам, когда их матч готов', adv_notify_match_hint: 'Офлайн-турнир: уведомлять игроков с аккаунтом, когда известны оба соперника.',
    adv_notify_results: 'Разослать итоги после окончания', adv_notify_results_hint: 'В уведомления игроков; кто не в сети – получит при входе.',
    adv_show_news: 'Показывать зрителям объявления', adv_show_standings: 'Показывать зрителям таблицу',
    score_self_hint: 'Вы сами сообщаете счёт своего матча – вводите точно; организаторы видят и могут исправить.',
    nt_tour_match: '{name}: ваш матч готов – против {opp}', nt_tour_place: '{name} завершён – ваше место: {n}', nt_tour_done: '{name} завершён – победитель: {winner}',
    log_self_score: 'Игрок сообщил счёт {a} – {b}: {s}',
  });

  // ================================================================ 中文
  X('zh', {
    tadv_tab_access: '权限与可见性', tadv_tab_notify: '通知', tadv_tab_misc: '其他',
    tadv_help_notify: '何时通知选手（应用内通知铃）。', tadv_help_misc: '观众在赛事页面能看到的内容。组织者始终可见全部。',
    adv_self_report: '允许有账号的选手自行上报比分',
    adv_self_report_hint: '线下赛事：在“添加选手”中用“@用户名”一行添加选手。组织者仍可修改或撤销结果。',
    adv_admins: '共享赛事管理权限', adv_admins_hint: '用户名，用逗号分隔（最多 10 个）。他们将成为拥有全部权限的协办者。',
    adv_admins_edit: '在“管理”标签 → 组织团队中增减协办者。',
    adv_notify_match: '对局可开始时通知选手', adv_notify_match_hint: '线下赛事：对局双方确定后通知有账号的选手。',
    adv_notify_results: '赛事结束时发送最终结果', adv_notify_results_hint: '发送到选手的通知；离线的选手上线后收到。',
    adv_show_news: '向观众显示公告', adv_show_standings: '向观众显示排名',
    score_self_hint: '你正在自行上报对局比分——请如实填写；组织者可查看并更正。',
    nt_tour_match: '{name}：你的对局已就绪——对手 {opp}', nt_tour_place: '{name} 已结束——你获得第 {n} 名', nt_tour_done: '{name} 已结束——冠军：{winner}',
    log_self_score: '选手上报比分 {a} – {b}：{s}',
  });
})();
