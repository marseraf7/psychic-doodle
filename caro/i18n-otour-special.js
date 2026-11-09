/*
 * Chuỗi 4 ngôn ngữ – các thể thức đặc biệt của Giải đấu Offline (từ đợt 2): đua thuyền kiểu America's Cup (đội giữ cúp
 * vào thẳng trận tranh cúp, vòng loại đội thách đấu, bên vào sân, thời gian về đích). Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    srv_ot_stage_few: 'Giai đoạn {n} chỉ còn chưa tới 2 đội: hãy cho thêm đội đi tiếp hoặc vào thẳng.',
    esp_race_n: 'Race {n}', esp_title_ps: 'Chi tiết các race',
    sport_sailing: 'Đua thuyền buồm', tpl_americas_cup: 'Kiểu America’s Cup (đua thuyền buồm)',
    tpl_americas_cup_d: 'Đội đầu danh sách là đội giữ cúp, vào thẳng trận tranh cúp. 5 đội thách đấu đá vòng tròn 2 lượt (thắng mỗi race 1 điểm); 4 đội đầu vào bán kết, ai thắng 5 race trước thì đi tiếp (Bo9); chung kết đội thách đấu ai thắng 7 race trước (Bo13). Đội thắng gặp đội giữ cúp trong trận tranh cúp, ai thắng 7 race trước (Bo13) giành cúp. Mỗi race ghi bên vào sân và thời gian về đích.',
    esp_port: 'Vào từ mạn trái', esp_stbd: 'Vào từ mạn phải', esp_side_pick_ps: 'Thuyền vào từ mạn trái', esp_sides: 'Cách gọi hai bên',
    esp_st_finish: 'Thời gian về đích (giây)', esp_margin: 'Cách biệt về đích: {s} giây', esp_sum_ps: '{g} race · thời lượng trung bình {d} · vào từ mạn trái thắng {b}%',
  });

  X('en', {
    srv_ot_stage_few: 'Stage {n} would have fewer than 2 teams: let more teams advance or enter directly.',
    esp_race_n: 'Race {n}', esp_title_ps: 'Race details',
    sport_sailing: 'Sailing', tpl_americas_cup: 'America’s Cup style (sailing)',
    tpl_americas_cup_d: 'The first team listed is the defender and goes straight to the match. 5 challengers race a double round robin (1 point per race win); the top 4 reach the semi-finals, first to 5 wins (Bo9); the challenger final is first to 7 (Bo13). The winner meets the defender in the match, first to 7 (Bo13) takes the cup. Each race records the entry side and finishing times.',
    esp_port: 'Port entry', esp_stbd: 'Starboard entry', esp_side_pick_ps: 'Boat entering from port', esp_sides: 'Side names',
    esp_st_finish: 'Finishing time (seconds)', esp_margin: 'Finishing margin: {s} seconds', esp_sum_ps: '{g} races · average duration {d} · port entry wins {b}%',
  });

  X('ru', {
    srv_ot_stage_few: 'На этапе {n} оказывается меньше 2 команд: пусть проходит больше команд или часть входит напрямую.',
    esp_race_n: 'Гонка {n}', esp_title_ps: 'Подробности гонок',
    sport_sailing: 'Парусный спорт', tpl_americas_cup: 'Как Кубок Америки (парусный спорт)',
    tpl_americas_cup_d: 'Первая команда в списке — защитник Кубка, она сразу выходит в матч за Кубок. 5 претендентов проводят двухкруговой турнир (1 очко за победу в гонке); 4 лучших выходят в полуфинал до 5 побед (Bo9); финал претендентов — до 7 побед (Bo13). Победитель встречается с защитником в матче за Кубок до 7 побед (Bo13). В каждой гонке отмечаются сторона входа и время финиша.',
    esp_port: 'Вход с левого борта', esp_stbd: 'Вход с правого борта', esp_side_pick_ps: 'Яхта, входящая с левого борта', esp_sides: 'Названия сторон',
    esp_st_finish: 'Время финиша (секунды)', esp_margin: 'Отрыв на финише: {s} с', esp_sum_ps: 'Гонок: {g} · средняя длительность {d} · вход с левого борта выигрывает {b}%',
  });

  X('zh', {
    srv_ot_stage_few: '第 {n} 阶段不足 2 队：请让更多队伍晋级或直接进入。',
    esp_race_n: '第 {n} 场比赛', esp_title_ps: '每场比赛详情',
    sport_sailing: '帆船', tpl_americas_cup: '美洲杯式（帆船）',
    tpl_americas_cup_d: '名单第一的队伍是卫冕方，直接进入美洲杯对决。5 支挑战队进行双循环赛（每赢一场比赛得 1 分）；前 4 名进入半决赛，先赢 5 场者晋级（9 场制）；挑战者决赛先赢 7 场者胜出（13 场制）。胜者与卫冕方进行美洲杯对决，先赢 7 场者夺杯（13 场制）。每场比赛记录入场方向和完赛时间。',
    esp_port: '左舷入场', esp_stbd: '右舷入场', esp_side_pick_ps: '从左舷入场的船', esp_sides: '两方的称呼',
    esp_st_finish: '完赛时间（秒）', esp_margin: '完赛差距：{s} 秒', esp_sum_ps: '{g} 场比赛 · 平均时长 {d} · 左舷入场胜率 {b}%',
  });
})();
