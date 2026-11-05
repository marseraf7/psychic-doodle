/*
 * Chuỗi 4 ngôn ngữ – playoff kiểu nhà nghề Mỹ của Giải đấu Offline (otour-playoff-edit.js, tour-stages.js; máy chủ
 * server/src/hub/stages-playoff.js): nhánh riêng từng miền, nhất bảng con giữ hạt giống đầu, play-in, vé vớt, Bo từng vòng.
 * Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    opt_po: 'Playoff kiểu nhà nghề Mỹ (nhánh riêng từng miền)',
    opt_po_mode: 'Cách xếp nhánh', po_mode_seed: 'Theo hạt giống trong miền', po_mode_div: 'Theo bảng con (kiểu NHL)',
    opt_po_per: 'Số đội mỗi miền vào nhánh chính', opt_po_divwin: 'Nhất các bảng con giữ các hạt giống đầu',
    opt_po_playin: 'Play-in', po_pi_none: 'Không có', po_pi_nba: 'Kiểu NBA (hạt giống {a}–{b})', po_pi_one: 'Một trận (hạt giống {a} gặp {b})',
    opt_po_playin_bo: 'Bo trận play-in', opt_po_reseed: 'Xếp lại cặp sau mỗi vòng (hạt giống cao nhất còn lại gặp thấp nhất)',
    opt_bo_rounds: 'Bo từng vòng', opt_bo_rounds_hint: 'Các số lẻ cách nhau bởi dấu phẩy, tính từ vòng 1 (vd. 3, 5, 7, 7). Để trống thì mọi vòng như Bo của giai đoạn.',
    po_need: 'Mùa giải cho {n} đội mỗi miền đi tiếp.', po_err_size: 'Mỗi miền chỉ có {cs} đội, không đủ {n} đội cho playoff.',
    po_hint: 'Hai đội vô địch miền gặp nhau ở chung kết. Nhánh thiếu đội thì hạt giống cao được miễn đấu vòng đầu. Kiểu NHL: mỗi bảng con lấy 3 đội đầu, thêm 2 vé vớt mỗi miền.',
    pi_title: 'Play-in', pi_main: 'Nhánh chính', pi_78: 'Play-in · cặp trên', pi_910: 'Play-in · cặp dưới', pi_last: 'Play-in · trận quyết định', pi_89: 'Play-in',
    pi_hint_nba: 'Cặp trên: đội thắng lấy suất hạt giống áp chót, đội thua đá trận quyết định. Cặp dưới: đội thua bị loại. Trận quyết định: đội thắng lấy suất cuối.',
    pi_hint_one: 'Đội thắng lấy suất cuối cùng vào nhánh chính.',
    fmt_playoff: 'Playoff theo miền ({n} đội mỗi miền)', fmt_playoff_div: 'Playoff theo bảng con (8 đội mỗi miền)', tag_playin: 'có play-in',
    ds_playoff: 'playoff theo miền, {n} đội mỗi miền, hai đội vô địch miền gặp nhau ở chung kết', ds_po_div: 'playoff theo bảng con kiểu NHL (3 đội đầu mỗi bảng con + 2 vé vớt mỗi miền)',
    ds_po_divwin: 'nhất bảng con giữ hạt giống đầu', ds_po_pi_nba: 'play-in kiểu NBA', ds_po_pi_one: 'play-in một trận',
    ds_po_reseed: 'xếp lại cặp sau mỗi vòng', ds_bo_rounds: 'Bo từng vòng: {list}',
  });

  X('en', {
    opt_po: 'US pro-style playoffs (a bracket for each conference)',
    opt_po_mode: 'Bracket layout', po_mode_seed: 'By seed within the conference', po_mode_div: 'By division (NHL style)',
    opt_po_per: 'Teams per conference in the main bracket', opt_po_divwin: 'Division winners get the top seeds',
    opt_po_playin: 'Play-in', po_pi_none: 'None', po_pi_nba: 'NBA style (seeds {a}–{b})', po_pi_one: 'One game (seed {a} vs {b})',
    opt_po_playin_bo: 'Play-in best of', opt_po_reseed: 'Reseed after each round (highest remaining seed plays the lowest)',
    opt_bo_rounds: 'Best of per round', opt_bo_rounds_hint: 'Odd numbers separated by commas, from round 1 (e.g. 3, 5, 7, 7). Leave empty to use the stage best of for every round.',
    po_need: 'The season sends {n} teams per conference through.', po_err_size: 'Each conference has only {cs} teams, not enough for {n} playoff teams.',
    po_hint: 'The two conference champions meet in the final. When the bracket is not full, the top seeds get a first-round bye. NHL style: top 3 of each division plus 2 wild cards per conference.',
    pi_title: 'Play-in', pi_main: 'Main bracket', pi_78: 'Play-in · upper game', pi_910: 'Play-in · lower game', pi_last: 'Play-in · deciding game', pi_89: 'Play-in',
    pi_hint_nba: 'Upper game: the winner takes the second-to-last seed, the loser plays the deciding game. Lower game: the loser is out. Deciding game: the winner takes the last seed.',
    pi_hint_one: 'The winner takes the last spot in the main bracket.',
    fmt_playoff: 'Conference playoffs ({n} teams each)', fmt_playoff_div: 'Division playoffs (8 teams per conference)', tag_playin: 'with play-in',
    ds_playoff: 'conference playoffs, {n} teams each, the two conference champions meet in the final', ds_po_div: 'NHL-style division playoffs (top 3 of each division + 2 wild cards per conference)',
    ds_po_divwin: 'division winners get the top seeds', ds_po_pi_nba: 'NBA-style play-in', ds_po_pi_one: 'one-game play-in',
    ds_po_reseed: 'reseeding after each round', ds_bo_rounds: 'best of per round: {list}',
  });

  X('ru', {
    opt_po: 'Плей-офф как в лигах США (своя сетка у каждой конференции)',
    opt_po_mode: 'Схема сетки', po_mode_seed: 'По посеву внутри конференции', po_mode_div: 'По дивизионам (как в НХЛ)',
    opt_po_per: 'Команд от конференции в основной сетке', opt_po_divwin: 'Победители дивизионов получают верхние номера посева',
    opt_po_playin: 'Плей-ин', po_pi_none: 'Нет', po_pi_nba: 'Как в НБА (посев {a}–{b})', po_pi_one: 'Один матч (посев {a} против {b})',
    opt_po_playin_bo: 'Матчи плей-ин до побед', opt_po_reseed: 'Перепосев после каждого раунда (самый высокий посев играет с самым низким)',
    opt_bo_rounds: 'Bo по раундам', opt_bo_rounds_hint: 'Нечётные числа через запятую, начиная с 1-го раунда (напр. 3, 5, 7, 7). Пусто — во всех раундах Bo этапа.',
    po_need: 'Из регулярного сезона выходят по {n} команд от конференции.', po_err_size: 'В каждой конференции всего {cs} команд — мало для {n} мест в плей-офф.',
    po_hint: 'Победители двух конференций встречаются в финале. Если сетка не заполнена, верхние номера посева пропускают первый раунд. Как в НХЛ: по 3 лучших из каждого дивизиона и 2 уайлд-кард от конференции.',
    pi_title: 'Плей-ин', pi_main: 'Основная сетка', pi_78: 'Плей-ин · верхняя пара', pi_910: 'Плей-ин · нижняя пара', pi_last: 'Плей-ин · решающий матч', pi_89: 'Плей-ин',
    pi_hint_nba: 'Верхняя пара: победитель получает предпоследний номер посева, проигравший играет решающий матч. Нижняя пара: проигравший выбывает. Решающий матч: победитель получает последнее место.',
    pi_hint_one: 'Победитель получает последнее место в основной сетке.',
    fmt_playoff: 'Плей-офф по конференциям (по {n} команд)', fmt_playoff_div: 'Плей-офф по дивизионам (по 8 команд от конференции)', tag_playin: 'с плей-ин',
    ds_playoff: 'плей-офф по конференциям, по {n} команд, победители конференций встречаются в финале', ds_po_div: 'плей-офф по дивизионам, как в НХЛ (по 3 лучших из дивизиона + 2 уайлд-кард от конференции)',
    ds_po_divwin: 'победители дивизионов получают верхние номера посева', ds_po_pi_nba: 'плей-ин как в НБА', ds_po_pi_one: 'плей-ин из одного матча',
    ds_po_reseed: 'перепосев после каждого раунда', ds_bo_rounds: 'Bo по раундам: {list}',
  });

  X('zh', {
    opt_po: '美国职业联赛式季后赛（每个分区单独一张对阵图）',
    opt_po_mode: '对阵方式', po_mode_seed: '按分区内种子', po_mode_div: '按赛区（NHL 式）',
    opt_po_per: '每个分区进入正赛的队数', opt_po_divwin: '赛区第一占据前几号种子',
    opt_po_playin: '附加赛', po_pi_none: '无', po_pi_nba: 'NBA 式（{a}–{b} 号种子）', po_pi_one: '单场（{a} 号种子对 {b} 号）',
    opt_po_playin_bo: '附加赛赛制', opt_po_reseed: '每轮后重新排位（剩余最高种子对最低种子）',
    opt_bo_rounds: '每轮赛制', opt_bo_rounds_hint: '用逗号分隔的奇数，从第 1 轮起（如 3, 5, 7, 7）。留空则各轮都用本阶段的赛制。',
    po_need: '常规赛每个分区晋级 {n} 队。', po_err_size: '每个分区只有 {cs} 队，不够季后赛的 {n} 个名额。',
    po_hint: '两个分区冠军在决赛相遇。对阵图不满时，高位种子首轮轮空。NHL 式：每个赛区前 3 名，另加每个分区 2 个外卡。',
    pi_title: '附加赛', pi_main: '正赛', pi_78: '附加赛 · 上半场次', pi_910: '附加赛 · 下半场次', pi_last: '附加赛 · 决胜场', pi_89: '附加赛',
    pi_hint_nba: '上半场次：胜者获得倒数第二个种子席位，负者进入决胜场。下半场次：负者出局。决胜场：胜者获得最后一个席位。',
    pi_hint_one: '胜者获得正赛的最后一个席位。',
    fmt_playoff: '分区季后赛（每区 {n} 队）', fmt_playoff_div: '赛区季后赛（每个分区 8 队）', tag_playin: '含附加赛',
    ds_playoff: '分区季后赛，每区 {n} 队，两个分区冠军在决赛相遇', ds_po_div: 'NHL 式赛区季后赛（每个赛区前 3 名 + 每个分区 2 个外卡）',
    ds_po_divwin: '赛区第一占据前几号种子', ds_po_pi_nba: 'NBA 式附加赛', ds_po_pi_one: '单场附加赛',
    ds_po_reseed: '每轮后重新排位', ds_bo_rounds: '每轮赛制：{list}',
  });
})();
