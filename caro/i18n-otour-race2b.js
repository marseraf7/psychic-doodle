/*
 * Chuỗi 4 ngôn ngữ – Giải đấu Offline, đợt 24 (phần 2): The Split (chia đôi bảng thành nhóm trên / dưới) và các mẫu giải mới
 * (phần 1: i18n-otour-race2.js). Nạp sau i18n-otour-race2.js (cả trang nhúng embed.html).
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    // The Split
    opt_split: 'Chia đôi thành nhóm trên / nhóm dưới theo hạng giai đoạn trước',
    opt_split_top: 'Số đội nhóm trên',
    opt_split_hint: 'Mang nguyên thành tích giai đoạn trước; nhóm trên luôn xếp trên nhóm dưới, kể cả khi đội nhóm dưới nhiều điểm hơn.',
    split_top: 'Nhóm trên (hạng {a}–{b})',
    split_bottom: 'Nhóm dưới (hạng {a}–{b})',
    ds_split: 'tách nhóm trên {n} đội và nhóm dưới theo hạng, mang nguyên thành tích, nhóm trên luôn xếp trên',
    // Mẫu
    tpl_barracuda: 'Golf Modified Stableford',
    tpl_barracuda_d: '90 người, 4 vòng nhập từng lỗ, chấm điểm albatross +8, eagle +5, birdie +2, par 0, bogey −1, double bogey −3; cắt sau vòng 2 (70 người + đồng hạng).',
    tpl_omnium: 'Omnium xe đạp lòng chảo',
    tpl_omnium_d: '20 người, 4 đua con: Scratch, Tempo, Loại dần, Points race (mang điểm 3 đua đầu, mỗi vòng hơn / kém ±20).',
    tpl_massstart: 'Mass start trượt băng tốc độ',
    tpl_massstart_d: '36 người, 2 bán kết (8 người đầu mỗi lượt vào chung kết); 16 vòng, điểm giữa đua ở vòng 4, 8, 12 (3-2-1), về đích 60-40-20-10-6-3.',
    tpl_biathlon_pursuit: 'Biathlon: Sprint → Pursuit',
    tpl_biathlon_pursuit_d: '80 người chạy Sprint tính giờ; 60 người đầu đuổi bắt, xuất phát chậm đúng số giây thua (thua quá 4 phút xuất phát đồng loạt).',
    tpl_scottish_split: 'Kiểu giải Scotland (chia đôi bảng)',
    tpl_scottish_split_d: '12 đội vòng tròn 3 lượt (33 trận), rồi tách nhóm trên / dưới 6 đội đấu thêm 5 trận (tổng 38); đội nhóm dưới không lên trên được dù nhiều điểm hơn.',
  });

  X('en', {
    opt_split: 'Split into top / bottom groups by the previous stage\'s standings (The Split)',
    opt_split_top: 'Teams in the top group',
    opt_split_hint: 'The previous stage\'s record carries over; the top group always ranks above the bottom group, even if a bottom team has more points.',
    split_top: 'Top group (places {a}–{b})',
    split_bottom: 'Bottom group (places {a}–{b})',
    ds_split: 'split into a top group of {n} teams and a bottom group by standings, records carry over, the top group always ranks higher',
    tpl_barracuda: 'Golf Modified Stableford',
    tpl_barracuda_d: '90 players, 4 rounds entered hole by hole, scoring albatross +8, eagle +5, birdie +2, par 0, bogey −1, double bogey −3; cut after round 2 (70 players plus ties).',
    tpl_omnium: 'Track cycling omnium',
    tpl_omnium_d: '20 riders, 4 races: Scratch, Tempo, Elimination, Points race (carrying points from the first 3, ±20 per lap gained / lost).',
    tpl_massstart: 'Speed skating mass start',
    tpl_massstart_d: '36 skaters, 2 semifinals (top 8 of each reach the final); 16 laps, intermediate sprints on laps 4, 8, 12 (3-2-1), finish 60-40-20-10-6-3.',
    tpl_biathlon_pursuit: 'Biathlon: Sprint → Pursuit',
    tpl_biathlon_pursuit_d: '80 athletes race a timed Sprint; the top 60 start the pursuit delayed by exactly the seconds lost (over 4 minutes back start together in a wave).',
    tpl_scottish_split: 'Scottish league style (The Split)',
    tpl_scottish_split_d: '12 teams play a triple round robin (33 matches), then split into top / bottom groups of 6 for 5 more matches (38 in total); a bottom-group team cannot rise above the top group even with more points.',
  });

  X('ru', {
    opt_split: 'Разделить на верхнюю / нижнюю группы по местам предыдущего этапа (сплит)',
    opt_split_top: 'Команд в верхней группе',
    opt_split_hint: 'Результаты предыдущего этапа переносятся; верхняя группа всегда выше нижней, даже если у команды нижней группы больше очков.',
    split_top: 'Верхняя группа (места {a}–{b})',
    split_bottom: 'Нижняя группа (места {a}–{b})',
    ds_split: 'разделение на верхнюю группу из {n} команд и нижнюю по местам, результаты переносятся, верхняя группа всегда выше',
    tpl_barracuda: 'Гольф: модифицированный Стейблфорд',
    tpl_barracuda_d: '90 игроков, 4 раунда с вводом по лункам; альбатрос +8, игл +5, бёрди +2, пар 0, боги −1, дабл-боги −3; отсечение после 2-го раунда (70 игроков и равные им).',
    tpl_omnium: 'Омниум на треке',
    tpl_omnium_d: '20 гонщиков, 4 гонки: скретч, темповая, на выбывание, гонка по очкам (очки первых трёх переносятся, ±20 за круг).',
    tpl_massstart: 'Масс-старт в конькобежном спорте',
    tpl_massstart_d: '36 участников, 2 полуфинала (первые 8 каждого выходят в финал); 16 кругов, промежуточные спринты на 4, 8, 12 кругах (3-2-1), финиш 60-40-20-10-6-3.',
    tpl_biathlon_pursuit: 'Биатлон: спринт → преследование',
    tpl_biathlon_pursuit_d: '80 спортсменов бегут спринт на время; первые 60 стартуют в гонке преследования с отставанием ровно на проигранные секунды (отстающие больше 4 минут — общим стартом).',
    tpl_scottish_split: 'Как в чемпионате Шотландии (сплит)',
    tpl_scottish_split_d: '12 команд в трёхкруговом турнире (33 матча), затем делятся на верхнюю / нижнюю группы по 6 и играют ещё 5 матчей (всего 38); команда нижней группы не поднимется выше верхней даже при большем числе очков.',
  });

  X('zh', {
    opt_split: '按上一阶段名次分为上半区 / 下半区（分区赛制）',
    opt_split_top: '上半区队数',
    opt_split_hint: '上一阶段成绩全部带入；上半区始终排在下半区之前，即使下半区球队积分更多。',
    split_top: '上半区（第 {a}–{b} 名）',
    split_bottom: '下半区（第 {a}–{b} 名）',
    ds_split: '按名次分为 {n} 队的上半区和下半区，成绩带入，上半区始终排名在前',
    tpl_barracuda: '高尔夫修正史特伯福特',
    tpl_barracuda_d: '90 人，4 轮逐洞录入；信天翁 +8、老鹰 +5、小鸟 +2、标准杆 0、柏忌 −1、双柏忌 −3；第 2 轮后晋级线（70 人及并列）。',
    tpl_omnium: '场地自行车全能赛',
    tpl_omnium_d: '20 名车手，4 项：争先赛、节奏赛、淘汰赛、记分赛（带入前 3 项得分，每套圈 / 被套圈 ±20）。',
    tpl_massstart: '速度滑冰集体出发',
    tpl_massstart_d: '36 人，2 组半决赛（每组前 8 名进入决赛）；16 圈，第 4、8、12 圈中途冲刺（3-2-1），终点 60-40-20-10-6-3。',
    tpl_biathlon_pursuit: '冬季两项：短距离 → 追逐',
    tpl_biathlon_pursuit_d: '80 名运动员进行短距离计时赛；前 60 名按落后秒数延迟出发进行追逐赛（落后超过 4 分钟者集体出发）。',
    tpl_scottish_split: '苏格兰联赛式（分区赛制）',
    tpl_scottish_split_d: '12 队三循环（33 场），之后分为上下半区各 6 队再赛 5 场（共 38 场）；下半区球队即使积分更多也不能排到上半区之上。',
  });
})();
