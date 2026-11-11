/*
 * Chuỗi 4 ngôn ngữ – Giải đấu Offline, thể thức của các giải Esports lớn (đợt 10–12): ghép cặp Thụy Sĩ kiểu CS Major
 * (stages-valve.js), giải 4 giai đoạn, mẫu kiểu CS Major… Nạp sau i18n-otour-formats.js (cả trang nhúng embed.html).
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    pair_valve: 'Kiểu CS Major (vòng 1: hạt giống 1 gặp 9, 2 gặp 10…; sau đó cùng thành tích, theo độ khó – cao gặp thấp)',
    ds_valve: 'ghép cặp kiểu CS Major (theo độ khó của các đối thủ đã gặp)',
    tpl_cs_major: 'Kiểu CS Major', tpl_cs_major_d: '32 đội như Major 2025–2026: 3 giai đoạn Thụy Sĩ 16 đội (thắng 3 trận thì đi tiếp, thua 3 trận thì bị loại; trận quyết định Bo3, còn lại Bo1, giai đoạn 3 toàn Bo3). Hạt giống 17–32 đá giai đoạn 1; 9–16 vào thẳng giai đoạn 2; 1–8 vào thẳng giai đoạn 3. Ghép cặp kiểu CS Major. 8 đội vào vòng loại trực tiếp Bo3, chung kết Bo5.',
    opt_br_groups: 'Chia bảng cố định (0 = không chia; mỗi bảng đấu riêng)', opt_br_tb: 'Bằng điểm thì xét',
    br_tb_countback: 'Số lần về nhất, nhì… rồi số hạ gục', br_tb_pubg: 'Kiểu PUBG: tổng điểm hạng, điểm trận gần nhất, điểm hạng trận gần nhất',
    br_tb_pubg_note: 'Bằng điểm: xét tổng điểm hạng (không tính hạ gục), rồi điểm trận gần nhất, điểm hạng trận gần nhất.',
    br_groups_note: 'Chia {n} bảng cố định: mỗi trận chỉ một bảng đấu; xếp hạng và suất đi tiếp tính theo từng bảng.',
    ds_race_groups: 'chia {n} bảng cố định, mỗi bảng {m} trận; đi tiếp tính theo từng bảng', ds_tb_pubg: 'bằng điểm xét kiểu PUBG (tổng điểm hạng, trận gần nhất)',
    srv_ot_race_groups_few: 'Chia bảng cố định cần ít nhất {n} đội (mỗi bảng ít nhất 2 đội).',
    tpl_pgc: 'Kiểu PGC (sinh tồn PC)', tpl_pgc_d: '33 đội như giải vô địch sinh tồn PC 2025: đội đầu danh sách là đội đặc cách, vào thẳng chung kết. 32 đội còn lại chia 2 bảng cố định 16 đội, mỗi bảng 18 trận: hạng 1–5 mỗi bảng vào thẳng chung kết, hạng 6–13 đá vòng vớt (16 đội, 18 trận, lấy 5), hạng 14–16 bị loại. Chung kết 16 đội, 18 trận, chỉ tính điểm chung kết. Điểm hạng 10-6-5-4-3-2-1-1, mỗi lần hạ gục 1 điểm; bằng điểm xét kiểu PUBG.',
  });

  X('en', {
    pair_valve: 'CS Major style (round 1: seed 1 vs 9, 2 vs 10…; then same record, by difficulty – highest vs lowest)',
    ds_valve: 'CS Major style pairing (by the difficulty of opponents faced)',
    tpl_cs_major: 'CS Major style', tpl_cs_major_d: '32 teams as at the 2025–2026 Majors: three 16-team Swiss stages (3 wins advance, 3 losses are out; deciding matches Bo3, others Bo1, stage 3 all Bo3). Seeds 17–32 start in stage 1; 9–16 go straight to stage 2; 1–8 go straight to stage 3. CS Major style pairing. 8 teams go to a Bo3 knockout with a Bo5 final.',
    opt_br_groups: 'Fixed groups (0 = none; each group plays separately)', opt_br_tb: 'Tiebreak on equal points',
    br_tb_countback: 'Wins, second places… then kills', br_tb_pubg: 'PUBG style: total placement points, last match points, last match placement points',
    br_tb_pubg_note: 'Equal points: total placement points (kills not counted), then last match points, then last match placement points.',
    br_groups_note: '{n} fixed groups: only one group plays each match; standings and qualifying spots are per group.',
    ds_race_groups: '{n} fixed groups, {m} matches each; qualifying per group', ds_tb_pubg: 'PUBG-style tiebreak (total placement points, last match)',
    srv_ot_race_groups_few: 'Fixed groups need at least {n} teams (at least 2 per group).',
    tpl_pgc: 'PGC style (PC battle royale)', tpl_pgc_d: '33 teams as at the 2025 PC battle royale championship: the first team on the list is a wildcard, straight into the final. The other 32 play in 2 fixed groups of 16, 18 matches each: places 1–5 of each group go straight to the final, 6–13 play a last stage (16 teams, 18 matches, top 5), 14–16 are out. Final: 16 teams, 18 matches, only final points count. Placement points 10-6-5-4-3-2-1-1, 1 point per kill; PUBG-style tiebreak.',
  });

  X('ru', {
    pair_valve: 'Как на CS Major (1-й тур: 1-й номер против 9-го, 2-й против 10-го…; далее при равном счёте — по сложности, сильнейший против слабейшего)',
    ds_valve: 'жеребьёвка как на CS Major (по сложности уже встреченных соперников)',
    tpl_cs_major: 'Как CS Major', tpl_cs_major_d: '32 команды, как на мейджорах 2025–2026: три швейцарских этапа по 16 команд (3 победы — проход, 3 поражения — вылет; решающие матчи Bo3, остальные Bo1, на 3-м этапе все Bo3). Номера посева 17–32 начинают с 1-го этапа; 9–16 сразу попадают во 2-й этап; 1–8 — сразу в 3-й. Жеребьёвка как на CS Major. 8 команд выходят в плей-офф Bo3, финал Bo5.',
    opt_br_groups: 'Постоянные группы (0 — без групп; каждая группа играет отдельно)', opt_br_tb: 'При равенстве очков',
    br_tb_countback: 'Число побед, вторых мест… затем убийства', br_tb_pubg: 'Как в PUBG: сумма очков за места, очки последнего матча, очки за место в последнем матче',
    br_tb_pubg_note: 'При равенстве очков: сумма очков за места (без убийств), затем очки последнего матча, затем очки за место в последнем матче.',
    br_groups_note: '{n} постоянные группы: в каждом матче играет одна группа; таблица и путёвки — по группам.',
    ds_race_groups: '{n} постоянные группы по {m} матчей; проход по группам', ds_tb_pubg: 'при равенстве — как в PUBG (очки за места, последний матч)',
    srv_ot_race_groups_few: 'Для постоянных групп нужно не менее {n} команд (не менее 2 в группе).',
    tpl_pgc: 'Как PGC (королевская битва на ПК)', tpl_pgc_d: '33 команды, как на чемпионате по королевской битве на ПК 2025: первая команда списка — по приглашению, сразу в финал. Остальные 32 играют в 2 постоянных группах по 16, по 18 матчей: места 1–5 каждой группы — сразу в финал, 6–13 играют последний этап (16 команд, 18 матчей, проходят 5), 14–16 выбывают. Финал: 16 команд, 18 матчей, считаются только очки финала. Очки за места 10-6-5-4-3-2-1-1, 1 очко за убийство; при равенстве — как в PUBG.',
  });

  X('zh', {
    pair_valve: 'CS Major 式（第 1 轮：1 号种子对 9 号、2 号对 10 号……；之后同战绩按难度分高低，最高对最低）',
    ds_valve: 'CS Major 式配对（按已遇对手的难度）',
    tpl_cs_major: 'CS Major 式', tpl_cs_major_d: '32 队，与 2025–2026 Major 相同：3 个 16 队瑞士轮阶段（3 胜晋级、3 负淘汰；决定性比赛三局两胜，其余一局定胜负，第 3 阶段全部三局两胜）。17–32 号种子从第 1 阶段开始；9–16 号直接进入第 2 阶段；1–8 号直接进入第 3 阶段。采用 CS Major 式配对。8 队进入三局两胜淘汰赛，决赛五局三胜。',
    opt_br_groups: '固定分组（0 = 不分组；各组单独比赛）', opt_br_tb: '积分相同时比较',
    br_tb_countback: '第一名次数、第二名次数……然后击杀数', br_tb_pubg: 'PUBG 式：排名分总和、最近一场积分、最近一场排名分',
    br_tb_pubg_note: '积分相同：比较排名分总和（不含击杀），然后最近一场积分，再看最近一场排名分。',
    br_groups_note: '固定分为 {n} 组：每场只有一组比赛；排名和晋级名额按组计算。',
    ds_race_groups: '固定分为 {n} 组，每组 {m} 场；按组晋级', ds_tb_pubg: '积分相同按 PUBG 式比较（排名分、最近一场）',
    srv_ot_race_groups_few: '固定分组至少需要 {n} 队（每组至少 2 队）。',
    tpl_pgc: 'PGC 式（PC 大逃杀）', tpl_pgc_d: '33 队，与 2025 PC 大逃杀全球总决赛相同：名单第一队为外卡，直接进入决赛。其余 32 队分为 2 个固定小组，每组 16 队、18 场：每组第 1–5 名直接进入决赛，第 6–13 名进入最后阶段（16 队、18 场，取前 5），第 14–16 名淘汰。决赛 16 队、18 场，只计决赛积分。排名分 10-6-5-4-3-2-1-1，每次击杀 1 分；积分相同按 PUBG 式比较。',
  });
})();
