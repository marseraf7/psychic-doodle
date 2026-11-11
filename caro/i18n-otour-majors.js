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
  });

  X('en', {
    pair_valve: 'CS Major style (round 1: seed 1 vs 9, 2 vs 10…; then same record, by difficulty – highest vs lowest)',
    ds_valve: 'CS Major style pairing (by the difficulty of opponents faced)',
    tpl_cs_major: 'CS Major style', tpl_cs_major_d: '32 teams as at the 2025–2026 Majors: three 16-team Swiss stages (3 wins advance, 3 losses are out; deciding matches Bo3, others Bo1, stage 3 all Bo3). Seeds 17–32 start in stage 1; 9–16 go straight to stage 2; 1–8 go straight to stage 3. CS Major style pairing. 8 teams go to a Bo3 knockout with a Bo5 final.',
  });

  X('ru', {
    pair_valve: 'Как на CS Major (1-й тур: 1-й номер против 9-го, 2-й против 10-го…; далее при равном счёте — по сложности, сильнейший против слабейшего)',
    ds_valve: 'жеребьёвка как на CS Major (по сложности уже встреченных соперников)',
    tpl_cs_major: 'Как CS Major', tpl_cs_major_d: '32 команды, как на мейджорах 2025–2026: три швейцарских этапа по 16 команд (3 победы — проход, 3 поражения — вылет; решающие матчи Bo3, остальные Bo1, на 3-м этапе все Bo3). Номера посева 17–32 начинают с 1-го этапа; 9–16 сразу попадают во 2-й этап; 1–8 — сразу в 3-й. Жеребьёвка как на CS Major. 8 команд выходят в плей-офф Bo3, финал Bo5.',
  });

  X('zh', {
    pair_valve: 'CS Major 式（第 1 轮：1 号种子对 9 号、2 号对 10 号……；之后同战绩按难度分高低，最高对最低）',
    ds_valve: 'CS Major 式配对（按已遇对手的难度）',
    tpl_cs_major: 'CS Major 式', tpl_cs_major_d: '32 队，与 2025–2026 Major 相同：3 个 16 队瑞士轮阶段（3 胜晋级、3 负淘汰；决定性比赛三局两胜，其余一局定胜负，第 3 阶段全部三局两胜）。17–32 号种子从第 1 阶段开始；9–16 号直接进入第 2 阶段；1–8 号直接进入第 3 阶段。采用 CS Major 式配对。8 队进入三局两胜淘汰赛，决赛五局三胜。',
  });
})();
