/*
 * Chuỗi 4 ngôn ngữ – Giải đấu Offline, các thể thức của giải Esports còn thiếu (đợt 7): bảng đấu loại kép 4 đội kiểu GSL
 * (stages-gsl.js), sinh tồn tính điểm hạng + hạ gục và kết thúc kiểu match point (stages-race.js), các đội đầu vào thẳng
 * giai đoạn sau nữa – vòng vớt (cfg.skip). Nạp sau i18n.js (cả trang nhúng embed.html).
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    fmt_gsl: 'Bảng đấu loại kép 4 đội (kiểu GSL)', opt_gsl_decider: 'Bo trận quyết định',
    opt_gsl_hint: 'Mỗi bảng 4 đội, 5 trận: thắng 2 trận thì đi tiếp, thua 2 trận thì bị loại. Số đội phải chia hết cho 4.',
    gsl_note: 'Mỗi bảng: hai trận mở màn; hai đội thắng gặp nhau (đội thắng nhất bảng), hai đội thua gặp nhau (đội thua bị loại); trận quyết định chọn đội nhì bảng.',
    gsl_wl: 'Thắng – thua', gsl_through: 'Đi tiếp', gsl_out: 'Bị loại',
    gsl_open: 'Trận mở màn', gsl_win: 'Trận nhánh thắng', gsl_lose: 'Trận nhánh thua', gsl_dec: 'Trận quyết định',
    ds_gsl: 'các bảng đấu loại kép 4 đội (Bo{bo}): thắng 2 trận đi tiếp, thua 2 trận bị loại', ds_gsl_dec: 'trận quyết định Bo{bo}',
    srv_ot_gsl_four: 'Bảng đấu loại kép cần số đội chia hết cho 4 (đang có {n} đội ở giai đoạn này).', srv_ot_gsl_many: 'Giai đoạn bảng đấu loại kép có tối đa {n} đội.',
    opt_br_kill: 'Điểm mỗi lần hạ gục (0 = không tính)', br_kills: 'Hạ gục', br_kills_n: '{n} hạ gục',
    opt_mp: 'Kết thúc kiểu match point', mp_none: 'Không – đấu hết số trận', mp_at: 'Ngưỡng điểm cố định', mp_after: 'Theo đội dẫn đầu sau một số trận',
    opt_mp_at: 'Ngưỡng điểm', opt_mp_after: 'Đặt ngưỡng sau trận thứ', opt_mp_plus: 'Cộng thêm vào điểm đội dẫn đầu',
    opt_mp_hint: 'Đội đã đạt ngưỡng mà thắng một trận thì vô địch ngay. Hết số trận mà chưa ai làm được thì xếp theo tổng điểm.',
    mp_tag: 'Match point', mp_note: 'Match point: đội đã có {n} điểm trở lên mà thắng một trận thì vô địch.',
    mp_wait: 'Match point: ngưỡng = điểm đội dẫn đầu sau trận {n} cộng {p}.', mp_won: '{name} vô địch theo match point.',
    ds_kill: 'mỗi lần hạ gục {n} điểm', ds_mp_at: 'match point: đạt {n} điểm rồi thắng một trận thì vô địch', ds_mp_after: 'match point: ngưỡng = điểm đội dẫn đầu sau trận {n} cộng {p}',
    opt_skip: 'Số đội đầu vào thẳng giai đoạn 3', opt_skip_group: 'Số đội đầu mỗi bảng vào thẳng giai đoạn 3',
    adv_skip: '({n} đội đầu vào thẳng giai đoạn 3)', adv_skip_tag: 'Vào thẳng giai đoạn 3', ds_skip: '{n} đội đầu vào thẳng giai đoạn 3, các đội đi tiếp còn lại đá giai đoạn 2',
  });

  X('en', {
    fmt_gsl: 'Double-elimination groups of 4 (GSL style)', opt_gsl_decider: 'Decider match Bo',
    opt_gsl_hint: 'Groups of 4 with 5 matches: two wins advance, two losses eliminate. The number of teams must be a multiple of 4.',
    gsl_note: 'In each group: two opening matches; the winners meet (winner tops the group), the losers meet (loser is out); a decider settles second place.',
    gsl_wl: 'W–L', gsl_through: 'Advances', gsl_out: 'Eliminated',
    gsl_open: 'Opening match', gsl_win: 'Winners’ match', gsl_lose: 'Elimination match', gsl_dec: 'Decider match',
    ds_gsl: 'double-elimination groups of 4 (Bo{bo}): two wins advance, two losses eliminate', ds_gsl_dec: 'decider match Bo{bo}',
    srv_ot_gsl_four: 'Double-elimination groups need a multiple of 4 teams (this stage has {n}).', srv_ot_gsl_many: 'A double-elimination group stage takes at most {n} teams.',
    opt_br_kill: 'Points per kill (0 = none)', br_kills: 'Kills', br_kills_n: '{n} kills',
    opt_mp: 'Match point finish', mp_none: 'Off – play every match', mp_at: 'Fixed points threshold', mp_after: 'Based on the leader after some matches',
    opt_mp_at: 'Points threshold', opt_mp_after: 'Set the threshold after match', opt_mp_plus: 'Added to the leader’s points',
    opt_mp_hint: 'A team that has reached the threshold wins the title by winning a match. If nobody does before the matches run out, total points decide.',
    mp_tag: 'Match point', mp_note: 'Match point: a team with {n} points or more wins the title by winning a match.',
    mp_wait: 'Match point: threshold = the leader’s points after match {n} plus {p}.', mp_won: '{name} won on match point.',
    ds_kill: '{n} point(s) per kill', ds_mp_at: 'match point: reach {n} points, then win a match to take the title', ds_mp_after: 'match point: threshold = the leader’s points after match {n} plus {p}',
    opt_skip: 'Top teams sent straight to stage 3', opt_skip_group: 'Top teams per group sent straight to stage 3',
    adv_skip: '(top {n} go straight to stage 3)', adv_skip_tag: 'Straight to stage 3', ds_skip: 'the top {n} go straight to stage 3, the other qualifiers play stage 2',
  });

  X('ru', {
    fmt_gsl: 'Группы по 4 с двойным выбыванием (формат GSL)', opt_gsl_decider: 'Bo решающего матча',
    opt_gsl_hint: 'В группе 4 команды и 5 матчей: две победы — выход, два поражения — вылет. Число команд должно делиться на 4.',
    gsl_note: 'В каждой группе: два стартовых матча; победители играют между собой (победитель — первый в группе), проигравшие — между собой (проигравший выбывает); решающий матч определяет второе место.',
    gsl_wl: 'Победы – поражения', gsl_through: 'Проходит дальше', gsl_out: 'Выбывает',
    gsl_open: 'Стартовый матч', gsl_win: 'Матч победителей', gsl_lose: 'Матч на вылет', gsl_dec: 'Решающий матч',
    ds_gsl: 'группы по 4 с двойным выбыванием (Bo{bo}): две победы — выход, два поражения — вылет', ds_gsl_dec: 'решающий матч Bo{bo}',
    srv_ot_gsl_four: 'Для групп с двойным выбыванием число команд должно делиться на 4 (на этом этапе {n}).', srv_ot_gsl_many: 'На этапе групп с двойным выбыванием может быть не более {n} команд.',
    opt_br_kill: 'Очки за убийство (0 = не считать)', br_kills: 'Убийства', br_kills_n: 'убийств: {n}',
    opt_mp: 'Завершение по матч-пойнту', mp_none: 'Нет — играются все матчи', mp_at: 'Фиксированный порог очков', mp_after: 'По лидеру после нескольких матчей',
    opt_mp_at: 'Порог очков', opt_mp_after: 'Порог задаётся после матча', opt_mp_plus: 'Добавить к очкам лидера',
    opt_mp_hint: 'Команда, набравшая порог, становится чемпионом, как только выиграет матч. Если до конца матчей этого не случилось, места определяет сумма очков.',
    mp_tag: 'Матч-пойнт', mp_note: 'Матч-пойнт: команда, у которой {n} очков и больше, становится чемпионом, выиграв матч.',
    mp_wait: 'Матч-пойнт: порог = очки лидера после матча {n} плюс {p}.', mp_won: '{name} побеждает по матч-пойнту.',
    ds_kill: 'за убийство — {n} очк.', ds_mp_at: 'матч-пойнт: набрать {n} очков и затем выиграть матч', ds_mp_after: 'матч-пойнт: порог = очки лидера после матча {n} плюс {p}',
    opt_skip: 'Лучшие команды сразу в этап 3', opt_skip_group: 'Лучшие команды каждой группы сразу в этап 3',
    adv_skip: '(первые {n} — сразу в этап 3)', adv_skip_tag: 'Сразу в этап 3', ds_skip: 'первые {n} проходят сразу в этап 3, остальные прошедшие играют этап 2',
  });

  X('zh', {
    fmt_gsl: '4 队双败小组（GSL 赛制）', opt_gsl_decider: '决胜场 Bo',
    opt_gsl_hint: '每组 4 队、5 场比赛：两胜晋级，两负淘汰。队伍数必须是 4 的倍数。',
    gsl_note: '每组：两场首轮；两支胜队交手（胜者小组第一），两支负队交手（负者淘汰）；决胜场决出小组第二。',
    gsl_wl: '胜–负', gsl_through: '晋级', gsl_out: '淘汰',
    gsl_open: '首轮', gsl_win: '胜者组比赛', gsl_lose: '败者组比赛', gsl_dec: '决胜场',
    ds_gsl: '4 队双败小组（Bo{bo}）：两胜晋级，两负淘汰', ds_gsl_dec: '决胜场 Bo{bo}',
    srv_ot_gsl_four: '双败小组需要队伍数为 4 的倍数（本阶段有 {n} 队）。', srv_ot_gsl_many: '双败小组阶段最多 {n} 队。',
    opt_br_kill: '每次击杀得分（0 = 不计）', br_kills: '击杀', br_kills_n: '{n} 次击杀',
    opt_mp: '赛点制结束', mp_none: '不使用——打完所有场次', mp_at: '固定积分门槛', mp_after: '按若干场后的领先者设定',
    opt_mp_at: '积分门槛', opt_mp_after: '在第几场后设定门槛', opt_mp_plus: '在领先者积分上增加',
    opt_mp_hint: '已达到门槛的队伍只要再赢一场即夺冠。若打完所有场次仍无人做到，则按总积分排名。',
    mp_tag: '赛点', mp_note: '赛点制：积分达到 {n} 分的队伍再赢一场即夺冠。',
    mp_wait: '赛点制：门槛 = 第 {n} 场后领先者的积分加 {p}。', mp_won: '{name} 凭赛点夺冠。',
    ds_kill: '每次击杀 {n} 分', ds_mp_at: '赛点制：达到 {n} 分后再赢一场即夺冠', ds_mp_after: '赛点制：门槛 = 第 {n} 场后领先者的积分加 {p}',
    opt_skip: '直接进入第 3 阶段的前几名', opt_skip_group: '每组直接进入第 3 阶段的前几名',
    adv_skip: '（前 {n} 名直接进入第 3 阶段）', adv_skip_tag: '直接进入第 3 阶段', ds_skip: '前 {n} 名直接进入第 3 阶段，其余晋级者参加第 2 阶段',
  });
})();
