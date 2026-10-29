/*
 * Chuỗi 4 ngôn ngữ – Câu lạc bộ thi đấu (Đợt 9): Team Battle, giao hữu CLB đấu CLB (đội hình theo bàn), tủ cúp, bảng
 * xếp hạng CLB; lý do huỷ / nhật ký / lỗi của máy chủ (srv_*: club-battle.js). Dùng bởi club-battle.js, club-match.js.
 * Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  // ================================================================ Tiếng Việt
  X('vi', {
    tb_title: 'Đấu đồng đội giữa các CLB (Team Battle)', tb_rule: 'Điểm mỗi CLB = tổng điểm {n} người cao điểm nhất. Không gặp người cùng CLB.',
    tb_players_n: '{n} người', tb_pick: 'Thi đấu cho CLB', tb_on: 'Bật Team Battle', tb_top: 'Số người tính điểm mỗi CLB',
    tb_on_hint: 'Chọn ít nhất 2 CLB. Chỉ thành viên các CLB này được tham gia; bạn cần quyền Giải đấu ở ít nhất một CLB.',
    tm_board_n: 'Bàn {n}', tm_boards_n: '{n} bàn', tm_accepted: 'Hai CLB đã đồng ý – ban quản lý mỗi bên xếp đội hình trước giờ đấu',
    tm_wait_accept: 'Chờ {club} chấp nhận lời mời', tm_accept: 'Chấp nhận giao hữu', tm_decline: 'Từ chối', tm_decline_q: 'Từ chối lời mời giao hữu? Giải sẽ bị huỷ.',
    tm_lineup: 'Đội hình {club}', tm_lineup_save: 'Lưu đội hình',
    cup_title: 'Tủ cúp', cup_points: '{n} điểm xếp hạng', cup_none: 'Chưa có cúp nào – thử sức ở Team Battle hoặc giao hữu!',
    cup_match_win: 'Thắng giao hữu', cup_battle_1: 'Vô địch Team Battle', cup_battle_2: 'Á quân Team Battle', cup_battle_3: 'Hạng ba Team Battle',
    cm_new: 'Thách đấu CLB khác', cm_hint: 'Giao hữu {club} với một CLB khác: bàn 1 gặp bàn 1… Cần quản trị viên duyệt và CLB kia chấp nhận.',
    cm_opp: 'CLB đối thủ', cm_boards: 'Số bàn', cm_start: 'Giờ đấu', cm_time: 'Thời gian ván', cm_bo: 'Mỗi bàn đấu', cm_send: 'Gửi lời mời',
    cm_pick_opp: 'Hãy chọn CLB đối thủ.', cm_bad_start: 'Giờ đấu phải sau lúc này ít nhất 1 phút.',
    cr_title: 'Xếp hạng CLB', cr_none: 'Chưa CLB nào có điểm.', cr_rule: 'Team Battle: hạng 1 / 2 / 3 được 10 / 6 / 4 điểm. Giao hữu: thắng 3, hoà 1.',
    cr_cups: '{g} cúp vàng · {n} danh hiệu',
    cancel_match_declined: 'CLB được mời đã từ chối', cancel_match_not_accepted: 'CLB được mời chưa chấp nhận', cancel_match_no_lineup: 'chưa đủ đội hình',
    log_match_accepted: 'CLB được mời chấp nhận giao hữu',
    srv_team_battle_few: 'Team Battle cần ít nhất 2 câu lạc bộ đã được duyệt', srv_tour_team_only: 'Giải này chỉ dành cho thành viên các câu lạc bộ tham gia',
    srv_tour_team_match: 'Giao hữu câu lạc bộ: ban quản lý hai CLB xếp đội hình', srv_club_match_invite: '{club} mời câu lạc bộ của bạn giao hữu: {name}',
  });

  // ================================================================ English
  X('en', {
    tb_title: 'Team Battle between clubs', tb_rule: 'Each club scores the sum of its top {n} players. You never meet a clubmate.',
    tb_players_n: '{n} players', tb_pick: 'Play for club', tb_on: 'Enable Team Battle', tb_top: 'Scoring players per club',
    tb_on_hint: 'Pick at least 2 clubs. Only members of these clubs can join; you need the Tournaments permission in at least one of them.',
    tm_board_n: 'Board {n}', tm_boards_n: '{n} boards', tm_accepted: 'Both clubs agreed – officers on each side set their lineup before the start',
    tm_wait_accept: 'Waiting for {club} to accept', tm_accept: 'Accept the match', tm_decline: 'Decline', tm_decline_q: 'Decline this club match? The event will be cancelled.',
    tm_lineup: '{club} lineup', tm_lineup_save: 'Save lineup',
    cup_title: 'Trophy cabinet', cup_points: '{n} ranking points', cup_none: 'No trophies yet – try a Team Battle or a club match!',
    cup_match_win: 'Club match win', cup_battle_1: 'Team Battle champion', cup_battle_2: 'Team Battle runner-up', cup_battle_3: 'Team Battle third place',
    cm_new: 'Challenge another club', cm_hint: 'A friendly match between {club} and another club: board 1 plays board 1… Needs admin approval and the other club’s acceptance.',
    cm_opp: 'Opponent club', cm_boards: 'Boards', cm_start: 'Start time', cm_time: 'Time control', cm_bo: 'Each board plays', cm_send: 'Send invitation',
    cm_pick_opp: 'Pick an opponent club.', cm_bad_start: 'The start time must be at least 1 minute from now.',
    cr_title: 'Club ranking', cr_none: 'No club has points yet.', cr_rule: 'Team Battle: 1st / 2nd / 3rd get 10 / 6 / 4 points. Club match: win 3, draw 1.',
    cr_cups: '{g} gold · {n} titles',
    cancel_match_declined: 'the invited club declined', cancel_match_not_accepted: 'the invited club did not accept', cancel_match_no_lineup: 'lineups were not complete',
    log_match_accepted: 'Invited club accepted the match',
    srv_team_battle_few: 'A Team Battle needs at least 2 approved clubs', srv_tour_team_only: 'Only members of the participating clubs can join',
    srv_tour_team_match: 'Club match: officers of both clubs set the lineups', srv_club_match_invite: '{club} invited your club to a match: {name}',
  });

  // ================================================================ Русский
  X('ru', {
    tb_title: 'Командная битва клубов', tb_rule: 'Очки клуба – сумма {n} лучших игроков. Одноклубники друг с другом не играют.',
    tb_players_n: 'игроков: {n}', tb_pick: 'Играть за клуб', tb_on: 'Включить командную битву', tb_top: 'Зачётных игроков в клубе',
    tb_on_hint: 'Выберите не менее 2 клубов. Участвовать могут только их члены; нужно право «Турниры» хотя бы в одном из них.',
    tm_board_n: 'Доска {n}', tm_boards_n: 'досок: {n}', tm_accepted: 'Оба клуба согласны – руководители расставляют составы до начала',
    tm_wait_accept: 'Ждём согласия {club}', tm_accept: 'Принять матч', tm_decline: 'Отклонить', tm_decline_q: 'Отклонить приглашение? Матч будет отменён.',
    tm_lineup: 'Состав {club}', tm_lineup_save: 'Сохранить состав',
    cup_title: 'Витрина трофеев', cup_points: 'рейтинговых очков: {n}', cup_none: 'Трофеев пока нет – сыграйте командную битву или клубный матч!',
    cup_match_win: 'Победа в клубном матче', cup_battle_1: 'Победитель командной битвы', cup_battle_2: '2-е место в командной битве', cup_battle_3: '3-е место в командной битве',
    cm_new: 'Вызвать другой клуб', cm_hint: 'Товарищеский матч {club} с другим клубом: доска 1 против доски 1… Нужны одобрение администратора и согласие соперника.',
    cm_opp: 'Клуб-соперник', cm_boards: 'Досок', cm_start: 'Начало', cm_time: 'Контроль времени', cm_bo: 'На каждой доске', cm_send: 'Отправить вызов',
    cm_pick_opp: 'Выберите клуб-соперник.', cm_bad_start: 'Начало – не раньше чем через минуту.',
    cr_title: 'Рейтинг клубов', cr_none: 'Пока ни у одного клуба нет очков.', cr_rule: 'Командная битва: 1 / 2 / 3 места – 10 / 6 / 4 очка. Клубный матч: победа 3, ничья 1.',
    cr_cups: 'золото: {g} · титулов: {n}',
    cancel_match_declined: 'приглашённый клуб отказался', cancel_match_not_accepted: 'приглашённый клуб не принял вызов', cancel_match_no_lineup: 'составы не заполнены',
    log_match_accepted: 'Приглашённый клуб принял матч',
    srv_team_battle_few: 'Для командной битвы нужно не менее 2 одобренных клубов', srv_tour_team_only: 'Участвовать могут только члены клубов-участников',
    srv_tour_team_match: 'Клубный матч: составы расставляют руководители клубов', srv_club_match_invite: '{club} вызывает ваш клуб на матч: {name}',
  });

  // ================================================================ 中文
  X('zh', {
    tb_title: '俱乐部团体战', tb_rule: '每个俱乐部得分 = 前 {n} 名成员得分之和。不会与同俱乐部成员对局。',
    tb_players_n: '{n} 人', tb_pick: '代表俱乐部', tb_on: '开启团体战', tb_top: '每个俱乐部计分人数',
    tb_on_hint: '至少选择 2 个俱乐部。仅这些俱乐部的成员可以参加；你需要在其中至少一个俱乐部拥有“赛事”权限。',
    tm_board_n: '第 {n} 台', tm_boards_n: '{n} 台', tm_accepted: '双方俱乐部已同意——各方管理员在开赛前排定阵容',
    tm_wait_accept: '等待 {club} 接受邀请', tm_accept: '接受友谊赛', tm_decline: '拒绝', tm_decline_q: '拒绝友谊赛邀请？赛事将被取消。',
    tm_lineup: '{club} 阵容', tm_lineup_save: '保存阵容',
    cup_title: '奖杯柜', cup_points: '{n} 排名积分', cup_none: '还没有奖杯——去参加团体战或友谊赛吧！',
    cup_match_win: '友谊赛获胜', cup_battle_1: '团体战冠军', cup_battle_2: '团体战亚军', cup_battle_3: '团体战季军',
    cm_new: '挑战其他俱乐部', cm_hint: '{club} 与其他俱乐部的友谊赛：第 1 台对第 1 台…需要管理员审核并由对方接受。',
    cm_opp: '对手俱乐部', cm_boards: '台数', cm_start: '开赛时间', cm_time: '用时', cm_bo: '每台赛制', cm_send: '发送邀请',
    cm_pick_opp: '请选择对手俱乐部。', cm_bad_start: '开赛时间需至少在 1 分钟之后。',
    cr_title: '俱乐部排名', cr_none: '还没有俱乐部获得积分。', cr_rule: '团体战：第 1 / 2 / 3 名得 10 / 6 / 4 分。友谊赛：胜 3 分，和 1 分。',
    cr_cups: '{g} 金杯 · {n} 项荣誉',
    cancel_match_declined: '受邀俱乐部已拒绝', cancel_match_not_accepted: '受邀俱乐部未接受', cancel_match_no_lineup: '阵容不完整',
    log_match_accepted: '受邀俱乐部接受了友谊赛',
    srv_team_battle_few: '团体战至少需要 2 个已通过审核的俱乐部', srv_tour_team_only: '仅参赛俱乐部的成员可以参加',
    srv_tour_team_match: '俱乐部友谊赛：由双方管理员排定阵容', srv_club_match_invite: '{club} 邀请你的俱乐部进行友谊赛：{name}',
  });
})();
