/*
 * Chuỗi 4 ngôn ngữ – thư viện mẫu giải nổi tiếng của Giải đấu Offline (otour-tpl.js, dữ liệu otour-templates.js).
 * Tên mẫu chỉ mô tả thể thức ("kiểu …"), không phải giải chính thức. Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    tpl_pick: 'Mẫu giải nổi tiếng', tpl_hint: 'Chọn một mẫu để điền sẵn bộ môn và thể thức – vẫn sửa được mọi thứ bên dưới.',
    tpl_n: '{n} đội', tpl_fill: 'Điền {n} đội mẫu để thử', tpl_off: 'Bỏ mẫu', tpl_team_word: 'Đội',
    tpl_premier_league: 'Kiểu Premier League', tpl_premier_league_d: '20 đội đá vòng tròn lượt đi – về (38 vòng, 380 trận). Thắng 3, hoà 1, thua 0; bằng điểm xét hiệu số, bàn thắng, đối đầu.',
    tpl_champions_league: 'Kiểu Champions League', tpl_champions_league_d: '36 đội, league phase: mỗi đội đá 8 trận với 2 đối thủ ở mỗi nhóm hạt giống (4 nhóm), tránh đội cùng quốc gia. Hạng 1–8 vào thẳng vòng 1/8, hạng 9–24 đá play-off, từ 25 bị loại. Loại trực tiếp 2 lượt, chung kết 1 trận.',
    tpl_world_cup_2026: 'Kiểu World Cup 2026', tpl_world_cup_2026_d: '48 đội chia 12 bảng 4 đội; nhất, nhì mỗi bảng và 8 đội hạng ba tốt nhất vào vòng 32 đội loại trực tiếp, có tranh hạng ba.',
    tpl_world_cup: 'Kiểu World Cup (32 đội)', tpl_world_cup_d: '32 đội chia 8 bảng 4 đội; nhất, nhì mỗi bảng vào vòng 1/8 loại trực tiếp, có tranh hạng ba.',
    tpl_lol_worlds: 'Kiểu LoL Worlds', tpl_lol_worlds_d: '16 đội đấu Thụy Sĩ theo số thắng / thua: thắng 3 thì đi tiếp, thua 3 thì bị loại; trận quyết định Bo3, còn lại Bo1. 8 đội vào loại trực tiếp Bo5.',
    tpl_f1: 'Kiểu F1 (Grand Prix)', tpl_f1_d: '20 tay đua, 24 chặng; điểm theo hạng 25-18-15-12-10-8-6-4-2-1, có bảng xếp hạng đội đua. Ghi "Tên | Quốc gia | Đội".',
    tpl_time_trial: 'Time Trial (chạy / đua tính giờ)', tpl_time_trial_d: 'Một chặng tính thời gian: xếp theo thời gian, tự tính chênh lệch với người dẫn đầu và người ngay trên.',
    tpl_badminton_open: 'Cầu lông loại trực tiếp', tpl_badminton_open_d: '32 người loại trực tiếp, mỗi trận Bo3, set 21 điểm cách 2, chạm 30.',
    tpl_tabletennis_cup: 'Bóng bàn vòng bảng + loại trực tiếp', tpl_tabletennis_cup_d: '16 người chia 4 bảng; nhất, nhì mỗi bảng vào loại trực tiếp. Trận Bo5, set 11 điểm cách 2.',
    tpl_volleyball_league: 'Bóng chuyền vòng tròn + chung kết 4 đội', tpl_volleyball_league_d: '8 đội đá vòng tròn một lượt (thắng 3–0 / 3–1: 3 điểm, 3–2: 2 điểm, thua 2–3: 1 điểm); 4 đội đầu vào bán kết, có tranh hạng ba.',
  });

  X('en', {
    tpl_pick: 'Famous formats', tpl_hint: 'Pick one to fill in the sport and format – you can still change everything below.',
    tpl_n: '{n} teams', tpl_fill: 'Fill {n} sample teams to try', tpl_off: 'Clear template', tpl_team_word: 'Team',
    tpl_premier_league: 'Premier League style', tpl_premier_league_d: '20 teams, double round robin (38 rounds, 380 matches). Win 3, draw 1, loss 0; ties on goal difference, goals scored, head-to-head.',
    tpl_champions_league: 'Champions League style', tpl_champions_league_d: '36 teams, league phase: each plays 8 matches, 2 opponents from each of 4 pots, avoiding same-country teams. 1st–8th go straight to the round of 16, 9th–24th play a play-off, 25th+ are out. Two-legged knockouts, one-match final.',
    tpl_world_cup_2026: 'World Cup 2026 style', tpl_world_cup_2026_d: '48 teams in 12 groups of 4; group winners, runners-up and the 8 best third-placed teams reach a 32-team knockout with a third-place match.',
    tpl_world_cup: 'World Cup style (32 teams)', tpl_world_cup_d: '32 teams in 8 groups of 4; winners and runners-up reach the round of 16, with a third-place match.',
    tpl_lol_worlds: 'LoL Worlds style', tpl_lol_worlds_d: '16 teams, Swiss by wins / losses: 3 wins advance, 3 losses are out; deciding matches Bo3, others Bo1. 8 teams go to a Bo5 knockout.',
    tpl_f1: 'F1 style (Grand Prix)', tpl_f1_d: '20 drivers, 24 races; points 25-18-15-12-10-8-6-4-2-1 by position, with team standings. Write "Name | Country | Team".',
    tpl_time_trial: 'Time Trial (timed run / race)', tpl_time_trial_d: 'One timed leg: ranked by time, with the gap to the leader and to the one ahead worked out for you.',
    tpl_badminton_open: 'Badminton knockout', tpl_badminton_open_d: '32 players, single elimination, Bo3; games to 21, win by 2, capped at 30.',
    tpl_tabletennis_cup: 'Table tennis groups + knockout', tpl_tabletennis_cup_d: '16 players in 4 groups; the top two of each group reach the knockout. Bo5, games to 11, win by 2.',
    tpl_volleyball_league: 'Volleyball round robin + final four', tpl_volleyball_league_d: '8 teams, single round robin (3–0 / 3–1 win: 3 pts, 3–2: 2 pts, 2–3 loss: 1 pt); the top 4 play semi-finals, with a third-place match.',
  });

  X('ru', {
    tpl_pick: 'Известные форматы', tpl_hint: 'Выберите формат — вид спорта и этапы заполнятся сами; всё ниже можно менять.',
    tpl_n: '{n} команд', tpl_fill: 'Заполнить {n} пробных команд', tpl_off: 'Убрать шаблон', tpl_team_word: 'Команда',
    tpl_premier_league: 'Как в Премьер-лиге', tpl_premier_league_d: '20 команд, круговой турнир в два круга (38 туров, 380 матчей). Победа 3, ничья 1, поражение 0; при равенстве — разница мячей, забитые, личные встречи.',
    tpl_champions_league: 'Как в Лиге чемпионов', tpl_champions_league_d: '36 команд, общий этап: у каждой 8 матчей, по 2 соперника из каждой из 4 корзин, без команд своей страны. 1–8 места — сразу в 1/8 финала, 9–24 — стыковые матчи, с 25-го — вылет. Плей-офф из двух матчей, финал — один матч.',
    tpl_world_cup_2026: 'Как ЧМ-2026', tpl_world_cup_2026_d: '48 команд в 12 группах по 4; первые, вторые места и 8 лучших третьих выходят в плей-офф из 32 команд с матчем за третье место.',
    tpl_world_cup: 'Как ЧМ (32 команды)', tpl_world_cup_d: '32 команды в 8 группах по 4; первые и вторые места выходят в 1/8 финала, есть матч за третье место.',
    tpl_lol_worlds: 'Как LoL Worlds', tpl_lol_worlds_d: '16 команд, швейцарка по победам / поражениям: 3 победы — выход, 3 поражения — вылет; решающие матчи Bo3, остальные Bo1. 8 команд — в плей-офф Bo5.',
    tpl_f1: 'Как F1 (Гран-при)', tpl_f1_d: '20 пилотов, 24 гонки; очки за место 25-18-15-12-10-8-6-4-2-1, есть командный зачёт. Пишите «Имя | Страна | Команда».',
    tpl_time_trial: 'Гонка на время (бег / заезд)', tpl_time_trial_d: 'Один этап на время: места по времени, отставание от лидера и от предыдущего считается само.',
    tpl_badminton_open: 'Бадминтон на выбывание', tpl_badminton_open_d: '32 игрока, олимпийская система, Bo3; гейм до 21, разница 2, максимум 30.',
    tpl_tabletennis_cup: 'Настольный теннис: группы + плей-офф', tpl_tabletennis_cup_d: '16 игроков в 4 группах; по двое лучших из группы выходят в плей-офф. Bo5, партия до 11, разница 2.',
    tpl_volleyball_league: 'Волейбол: круг + финал четырёх', tpl_volleyball_league_d: '8 команд, один круг (победа 3–0 / 3–1: 3 очка, 3–2: 2 очка, поражение 2–3: 1 очко); 4 лучших играют полуфиналы и матч за третье место.',
  });

  X('zh', {
    tpl_pick: '著名赛制模板', tpl_hint: '选一个模板即可自动填好项目和赛制——下方一切仍可修改。',
    tpl_n: '{n} 队', tpl_fill: '填入 {n} 支示例队伍试试', tpl_off: '取消模板', tpl_team_word: '队伍',
    tpl_premier_league: '英超式', tpl_premier_league_d: '20 队主客场双循环（38 轮、380 场）。胜 3 平 1 负 0；同分比净胜球、进球数、相互战绩。',
    tpl_champions_league: '欧冠式', tpl_champions_league_d: '36 队联赛阶段：每队 8 场，对 4 档中每档各 2 个对手，避开同国家球队。第 1–8 名直接进 16 强，9–24 名打附加赛，25 名起淘汰。淘汰赛两回合，决赛一场。',
    tpl_world_cup_2026: '2026 世界杯式', tpl_world_cup_2026_d: '48 队分 12 个 4 队小组；各组前两名和 8 个成绩最好的小组第三进入 32 强淘汰赛，设三四名决赛。',
    tpl_world_cup: '世界杯式（32 队）', tpl_world_cup_d: '32 队分 8 个 4 队小组；各组前两名进 16 强淘汰赛，设三四名决赛。',
    tpl_lol_worlds: '英雄联盟全球总决赛式', tpl_lol_worlds_d: '16 队按胜负场数打瑞士轮：3 胜晋级，3 负淘汰；决定场 Bo3，其余 Bo1。8 队进入 Bo5 淘汰赛。',
    tpl_f1: 'F1 式（大奖赛）', tpl_f1_d: '20 名车手，24 站；按名次积分 25-18-15-12-10-8-6-4-2-1，设车队积分榜。写作“姓名 | 国家 | 车队”。',
    tpl_time_trial: '计时赛（跑步 / 计时竞速）', tpl_time_trial_d: '一站计时：按用时排名，自动计算与领先者及前一名的差距。',
    tpl_badminton_open: '羽毛球淘汰赛', tpl_badminton_open_d: '32 人单败淘汰，每场 Bo3，每局 21 分、领先 2 分、30 分封顶。',
    tpl_tabletennis_cup: '乒乓球小组赛 + 淘汰赛', tpl_tabletennis_cup_d: '16 人分 4 组；每组前两名进入淘汰赛。Bo5，每局 11 分、领先 2 分。',
    tpl_volleyball_league: '排球单循环 + 四强决赛', tpl_volleyball_league_d: '8 队单循环（3–0 / 3–1 胜得 3 分，3–2 胜得 2 分，2–3 负得 1 分）；前 4 名进半决赛，设三四名决赛。',
  });
})();
