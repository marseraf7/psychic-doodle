/*
 * Chuỗi 4 ngôn ngữ – Giải đấu Offline, golf đấu gậy kiểu The Masters (đợt 4: cách tính 'golf' của hệ Race –
 * otour-golf.js, server/src/hub/stages-golf.js): vòng đấu, par, so với par, cắt, đấu phụ đột tử, thống kê từng lỗ.
 * Nạp sau i18n.js (cả trang nhúng embed.html).
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    sport_golf: 'Golf', fmt_stroke_play: 'Golf đấu gậy', race_golf: 'Golf đấu gậy (cộng số gậy)', race_name_golf: 'Golf {n} vòng',
    tpl_masters: 'Kiểu The Masters (golf)',
    tpl_masters_d: 'Khoảng 90 golfer được mời, 4 vòng × 18 lỗ par 72, xếp theo tổng số gậy so với par. Sau vòng 2 chỉ 50 người đầu và những người đồng hạng được đánh tiếp, điểm cộng dồn giữ nguyên. Bằng điểm ở hạng nhất thì đấu phụ đột tử ở lỗ 18, rồi lỗ 10, luân phiên tới khi có người thắng. Ban tổ chức nhập tổng gậy mỗi vòng (hoặc chuyển sang nhập từng lỗ).',
    opt_golf_input: 'Cách nhập', golf_input_round: 'Tổng gậy mỗi vòng', golf_input_hole: 'Từng lỗ',
    opt_golf_par: 'Par từng lỗ ({n} lỗ, par {p})', opt_golf_par_hint: 'Ghi par các lỗ, cách nhau bằng dấu cách (mỗi lỗ 3–6).',
    opt_golf_cut: 'Cắt sau một vòng (giữ điểm cộng dồn)', opt_golf_cut_after: 'Cắt sau vòng', opt_golf_cut_top: 'Số người đánh tiếp (cộng đồng hạng)',
    ds_golf: 'golf đấu gậy {n} vòng × {h} lỗ (par {p}), xếp theo tổng số gậy', ds_golf_cut: 'sau vòng {r} chỉ {n} người đầu và đồng hạng đánh tiếp', ds_golf_hole: 'nhập từng lỗ',
    golf_round_n: 'Vòng {n}', golf_r_n: 'V{n}', golf_rounds: 'Các vòng', golf_topar: 'So với par', golf_today: 'Vòng này', golf_thru: 'Lỗ',
    golf_total: 'Tổng gậy', golf_mc: 'Bị cắt', golf_wd: 'Rút lui', golf_cut_line: 'Vạch cắt: {p}', golf_par_total: 'Par {p} mỗi vòng',
    golf_cut_rule: 'cắt sau vòng {r}: {n} người đầu và đồng hạng', golf_low: 'vòng thấp nhất: {name} {s} gậy (vòng {r})',
    golf_po_tag: 'Thắng đấu phụ', golf_po_hint: 'Bằng điểm ở hạng nhất: {names}. Đấu phụ đột tử theo lỗ {holes}… rồi ghi người thắng.',
    golf_po_winner: 'Người thắng đấu phụ', golf_po_holes: 'Số lỗ đấu phụ', golf_po_save: 'Lưu kết quả đấu phụ', golf_po_won: '{name} thắng sau {n} lỗ đấu phụ.',
    golf_holes: 'Thống kê từng lỗ', golf_hole: 'Lỗ', golf_hole_n: 'Lỗ {n}', golf_par: 'Par', golf_avg: 'Trung bình', golf_eagle: 'Eagle', golf_birdie: 'Birdie',
    golf_par0: 'Par', golf_bogey: 'Bogey', golf_dbl: 'Double bogey+', golf_hardest: 'Lỗ khó nhất: lỗ {h} (trung bình +{d} so với par).',
    golf_strokes: 'Số gậy', golf_save: 'Lưu bảng điểm vòng', golf_live: 'đang đánh', golf_round_done: 'Đã xong vòng này.', golf_undo: 'Huỷ bảng điểm vòng', golf_wait_prev: 'Nhập xong vòng trước rồi mới nhập vòng này.',
    golf_form_hint_round: 'Nhập tổng số gậy của mỗi người trong vòng này; người chưa đánh xong thì để trống (lưu được nhiều lần). Vòng xong khi ai còn thi đấu cũng có điểm hoặc rút lui.',
    golf_form_hint_hole: 'Nhập số gậy từng lỗ; lỗ chưa đánh thì để trống – bảng dẫn đầu ghi "đã đánh tới lỗ". Lưu được nhiều lần trong vòng.',
    golf_paste: 'Dán cả bảng điểm', golf_paste_hint: 'Mỗi dòng: Tên | tổng gậy (ngăn bằng | hoặc tab). Ghi WD nếu rút lui.',
    golf_paste_hint_hole: 'Mỗi dòng: Tên | số gậy các lỗ cách nhau bằng dấu cách (ngăn tên bằng | hoặc tab). Ghi WD nếu rút lui.',
    golf_paste_ph: 'Golfer 1 | 68\nGolfer 2 | 71\nGolfer 3 | WD', golf_paste_ph_hole: 'Golfer 1 | 4 5 3 3 4 3 4 5 4\nGolfer 2 | 4 4 4 3 5',
    srv_ot_golf_out: 'Có golfer đã bị cắt hoặc rút lui ở vòng trước.', srv_ot_golf_bad: 'Số gậy không hợp lệ.',
    srv_ot_golf_no_po: 'Chưa cần đấu phụ (chưa xong vòng cuối hoặc không bằng điểm ở hạng nhất).', otlog_golf_po: 'Đấu phụ: {name} thắng',
  });

  X('en', {
    sport_golf: 'Golf', fmt_stroke_play: 'Golf stroke play', race_golf: 'Golf stroke play (total strokes)', race_name_golf: '{n}-round golf',
    tpl_masters: 'The Masters style (golf)',
    tpl_masters_d: 'About 90 invited golfers, 4 rounds × 18 holes at par 72, ranked by total strokes relative to par. After round 2 only the top 50 and ties play on, keeping their scores. A tie for first goes to a sudden-death playoff on hole 18, then hole 10, alternating until there is a winner. The organizer enters each round’s total strokes (or switches to hole-by-hole entry).',
    opt_golf_input: 'Entry', golf_input_round: 'Round totals', golf_input_hole: 'Hole by hole',
    opt_golf_par: 'Par per hole ({n} holes, par {p})', opt_golf_par_hint: 'Enter the par of each hole, separated by spaces (3–6 each).',
    opt_golf_cut: 'Cut after a round (scores carry over)', opt_golf_cut_after: 'Cut after round', opt_golf_cut_top: 'Players who make the cut (plus ties)',
    ds_golf: '{n} rounds × {h} holes of stroke play (par {p}), ranked by total strokes', ds_golf_cut: 'after round {r} only the top {n} and ties play on', ds_golf_hole: 'hole-by-hole entry',
    golf_round_n: 'Round {n}', golf_r_n: 'R{n}', golf_rounds: 'Rounds', golf_topar: 'To par', golf_today: 'Today', golf_thru: 'Thru',
    golf_total: 'Total', golf_mc: 'MC', golf_wd: 'WD', golf_cut_line: 'Cut line: {p}', golf_par_total: 'Par {p} per round',
    golf_cut_rule: 'cut after round {r}: top {n} and ties', golf_low: 'low round: {name} {s} (round {r})',
    golf_po_tag: 'Playoff winner', golf_po_hint: 'Tied for first: {names}. Play sudden death on holes {holes}… then record the winner.',
    golf_po_winner: 'Playoff winner', golf_po_holes: 'Playoff holes', golf_po_save: 'Save playoff result', golf_po_won: '{name} won after {n} playoff holes.',
    golf_holes: 'Hole statistics', golf_hole: 'Hole', golf_hole_n: 'Hole {n}', golf_par: 'Par', golf_avg: 'Average', golf_eagle: 'Eagles', golf_birdie: 'Birdies',
    golf_par0: 'Pars', golf_bogey: 'Bogeys', golf_dbl: 'Double bogey+', golf_hardest: 'Hardest hole: hole {h} (average +{d} over par).',
    golf_strokes: 'Strokes', golf_save: 'Save round scores', golf_live: 'in progress', golf_round_done: 'This round is complete.', golf_undo: 'Undo round scores', golf_wait_prev: 'Finish entering the previous round first.',
    golf_form_hint_round: 'Enter each player’s total strokes for this round; leave unfinished players empty (you can save several times). The round is complete when every player still in has a score or WD.',
    golf_form_hint_hole: 'Enter the strokes on each hole; leave unplayed holes empty – the leaderboard shows "thru". You can save several times during the round.',
    golf_paste: 'Paste the whole scorecard', golf_paste_hint: 'One line each: Name | total strokes (separated by | or tab). Write WD for a withdrawal.',
    golf_paste_hint_hole: 'One line each: Name | strokes per hole separated by spaces (name separated by | or tab). Write WD for a withdrawal.',
    golf_paste_ph: 'Golfer 1 | 68\nGolfer 2 | 71\nGolfer 3 | WD', golf_paste_ph_hole: 'Golfer 1 | 4 5 3 3 4 3 4 5 4\nGolfer 2 | 4 4 4 3 5',
    srv_ot_golf_out: 'A golfer already missed the cut or withdrew in an earlier round.', srv_ot_golf_bad: 'Invalid number of strokes.',
    srv_ot_golf_no_po: 'No playoff needed (the last round is not finished or there is no tie for first).', otlog_golf_po: 'Playoff: {name} won',
  });

  X('ru', {
    sport_golf: 'Гольф', fmt_stroke_play: 'Гольф, игра на счёт ударов', race_golf: 'Гольф на счёт ударов (сумма ударов)', race_name_golf: 'Гольф, раундов: {n}',
    tpl_masters: 'В стиле The Masters (гольф)',
    tpl_masters_d: 'Около 90 приглашённых гольфистов, 4 раунда по 18 лунок с паром 72, места по сумме ударов относительно пара. После 2-го раунда дальше играют только первые 50 и разделившие с ними место, результаты сохраняются. При равенстве за первое место — плей-офф до первого выигрыша лунки: лунка 18, затем 10, поочерёдно до победителя. Организатор вносит сумму ударов за раунд (или переходит на ввод по лункам).',
    opt_golf_input: 'Ввод', golf_input_round: 'Сумма за раунд', golf_input_hole: 'По лункам',
    opt_golf_par: 'Пар каждой лунки ({n} лунок, пар {p})', opt_golf_par_hint: 'Укажите пар каждой лунки через пробел (от 3 до 6).',
    opt_golf_cut: 'Отсев после раунда (результаты сохраняются)', opt_golf_cut_after: 'Отсев после раунда', opt_golf_cut_top: 'Проходят дальше (плюс равные)',
    ds_golf: 'гольф на счёт ударов: {n} раундов × {h} лунок (пар {p}), места по сумме ударов', ds_golf_cut: 'после раунда {r} дальше играют первые {n} и равные им', ds_golf_hole: 'ввод по лункам',
    golf_round_n: 'Раунд {n}', golf_r_n: 'Р{n}', golf_rounds: 'Раунды', golf_topar: 'К пару', golf_today: 'Раунд', golf_thru: 'Лунка',
    golf_total: 'Удары', golf_mc: 'Отсеян', golf_wd: 'Снялся', golf_cut_line: 'Линия отсева: {p}', golf_par_total: 'Пар {p} за раунд',
    golf_cut_rule: 'отсев после раунда {r}: первые {n} и равные', golf_low: 'лучший раунд: {name}, {s} ударов (раунд {r})',
    golf_po_tag: 'Победа в плей-офф', golf_po_hint: 'Равенство за первое место: {names}. Сыграйте плей-офф на лунках {holes}… и укажите победителя.',
    golf_po_winner: 'Победитель плей-офф', golf_po_holes: 'Лунок в плей-офф', golf_po_save: 'Сохранить итог плей-офф', golf_po_won: '{name} победил после {n} лунок плей-офф.',
    golf_holes: 'Статистика по лункам', golf_hole: 'Лунка', golf_hole_n: 'Лунка {n}', golf_par: 'Пар', golf_avg: 'В среднем', golf_eagle: 'Иглы', golf_birdie: 'Бёрди',
    golf_par0: 'Пары', golf_bogey: 'Боги', golf_dbl: 'Дабл-боги и хуже', golf_hardest: 'Самая трудная лунка: {h} (в среднем +{d} к пару).',
    golf_strokes: 'Удары', golf_save: 'Сохранить карточку раунда', golf_live: 'идёт', golf_round_done: 'Раунд завершён.', golf_undo: 'Отменить карточку раунда', golf_wait_prev: 'Сначала внесите результаты предыдущего раунда.',
    golf_form_hint_round: 'Укажите сумму ударов каждого игрока за раунд; у тех, кто ещё не закончил, оставьте пусто (сохранять можно много раз). Раунд завершён, когда у всех оставшихся есть результат или отметка о снятии.',
    golf_form_hint_hole: 'Укажите удары на каждой лунке; несыгранные оставьте пустыми — в таблице лидеров будет видно, сколько лунок пройдено. Сохранять можно много раз.',
    golf_paste: 'Вставить всю карточку', golf_paste_hint: 'По строке на игрока: Имя | сумма ударов (через | или табуляцию). Для снявшихся напишите WD.',
    golf_paste_hint_hole: 'По строке на игрока: Имя | удары по лункам через пробел (имя отделяется | или табуляцией). Для снявшихся напишите WD.',
    golf_paste_ph: 'Гольфист 1 | 68\nГольфист 2 | 71\nГольфист 3 | WD', golf_paste_ph_hole: 'Гольфист 1 | 4 5 3 3 4 3 4 5 4\nГольфист 2 | 4 4 4 3 5',
    srv_ot_golf_out: 'Один из гольфистов уже отсеян или снялся в предыдущем раунде.', srv_ot_golf_bad: 'Неверное число ударов.',
    srv_ot_golf_no_po: 'Плей-офф не нужен (последний раунд не завершён или нет равенства за первое место).', otlog_golf_po: 'Плей-офф: победил {name}',
  });

  X('zh', {
    sport_golf: '高尔夫', fmt_stroke_play: '高尔夫比杆赛', race_golf: '高尔夫比杆赛（累计杆数）', race_name_golf: '高尔夫 {n} 轮',
    tpl_masters: '大师赛式（高尔夫）',
    tpl_masters_d: '约 90 名受邀球员，4 轮 × 18 洞，标准杆 72，按相对标准杆的总杆数排名。第 2 轮后只有前 50 名及并列者晋级，成绩累计保留。并列第一时进行骤死加洞赛：先打第 18 洞，再打第 10 洞，轮流直到分出胜负。主办方录入每轮总杆数（也可改为逐洞录入）。',
    opt_golf_input: '录入方式', golf_input_round: '每轮总杆', golf_input_hole: '逐洞',
    opt_golf_par: '各洞标准杆（{n} 洞，标准杆 {p}）', opt_golf_par_hint: '填写各洞标准杆，用空格分隔（每洞 3–6）。',
    opt_golf_cut: '某轮后晋级淘汰（成绩累计）', opt_golf_cut_after: '淘汰在第几轮后', opt_golf_cut_top: '晋级人数（含并列）',
    ds_golf: '高尔夫比杆赛 {n} 轮 × {h} 洞（标准杆 {p}），按总杆数排名', ds_golf_cut: '第 {r} 轮后只有前 {n} 名及并列者晋级', ds_golf_hole: '逐洞录入',
    golf_round_n: '第 {n} 轮', golf_r_n: 'R{n}', golf_rounds: '各轮', golf_topar: '相对标准杆', golf_today: '本轮', golf_thru: '已打',
    golf_total: '总杆', golf_mc: '未晋级', golf_wd: '退赛', golf_cut_line: '晋级线：{p}', golf_par_total: '每轮标准杆 {p}',
    golf_cut_rule: '第 {r} 轮后淘汰：前 {n} 名及并列者晋级', golf_low: '单轮最低：{name} {s} 杆（第 {r} 轮）',
    golf_po_tag: '加洞赛获胜', golf_po_hint: '并列第一：{names}。在第 {holes}… 洞进行骤死加洞赛，然后录入获胜者。',
    golf_po_winner: '加洞赛获胜者', golf_po_holes: '加洞数', golf_po_save: '保存加洞赛结果', golf_po_won: '{name} 在加洞赛第 {n} 洞获胜。',
    golf_holes: '逐洞统计', golf_hole: '洞', golf_hole_n: '第 {n} 洞', golf_par: '标准杆', golf_avg: '平均', golf_eagle: '老鹰球', golf_birdie: '小鸟球',
    golf_par0: '标准杆', golf_bogey: '柏忌', golf_dbl: '双柏忌及以上', golf_hardest: '最难的洞：第 {h} 洞（平均高于标准杆 {d}）。',
    golf_strokes: '杆数', golf_save: '保存本轮记分卡', golf_live: '进行中', golf_round_done: '本轮已结束。', golf_undo: '撤销本轮记分卡', golf_wait_prev: '请先录入上一轮。',
    golf_form_hint_round: '填写每名球员本轮总杆数；未打完的留空（可多次保存）。仍在比赛的球员都有成绩或退赛后，本轮结束。',
    golf_form_hint_hole: '填写每洞杆数；未打的洞留空，排行榜会显示已打洞数。本轮内可多次保存。',
    golf_paste: '粘贴完整记分卡', golf_paste_hint: '每行一名球员：姓名 | 总杆数（用 | 或制表符分隔）。退赛写 WD。',
    golf_paste_hint_hole: '每行一名球员：姓名 | 各洞杆数用空格分隔（姓名用 | 或制表符分隔）。退赛写 WD。',
    golf_paste_ph: '球员 1 | 68\n球员 2 | 71\n球员 3 | WD', golf_paste_ph_hole: '球员 1 | 4 5 3 3 4 3 4 5 4\n球员 2 | 4 4 4 3 5',
    srv_ot_golf_out: '有球员已在之前的轮次被淘汰或退赛。', srv_ot_golf_bad: '杆数无效。',
    srv_ot_golf_no_po: '无需加洞赛（最后一轮未结束或第一名没有并列）。', otlog_golf_po: '加洞赛：{name} 获胜',
  });
})();
