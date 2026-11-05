/*
 * Chuỗi 4 ngôn ngữ – tự xếp lịch và chỉnh lịch thi đấu của Giải đấu Offline (otour-sched-ui.js; máy chủ
 * server/src/hub/otour-sched.js). Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    ot_sched_auto: 'Tự xếp lịch', ot_sc_start: 'Ngày bắt đầu', ot_sc_days: 'Các ngày thi đấu trong tuần', ot_sc_times: 'Giờ thi đấu',
    ot_sc_vmode: 'Địa điểm', ot_sc_vm_list: 'Các sân dùng chung', ot_sc_vm_home: 'Sân nhà của đội đứng trước',
    ot_sc_venues: 'Các sân (mỗi dòng một sân)', ot_sc_home: 'Sân nhà từng đội (để trống: dùng tên đội)',
    ot_sc_perslot: 'Số trận tối đa cùng giờ (0 = theo số sân)', ot_sc_rest: 'Số ngày nghỉ tối thiểu giữa hai trận của một đội',
    ot_sc_skip: 'Ngày không thi đấu (mỗi dòng một ngày, vd. 2026-12-24)', ot_sc_auto: 'Tự xếp lịch giai đoạn sau khi bốc thăm xong',
    ot_sc_run: 'Xếp các trận chưa có giờ', ot_sc_redo: 'Xếp lại toàn bộ', ot_sc_clear: 'Xoá lịch',
    ot_sc_redo_confirm: 'Xếp lại giờ của mọi trận chưa đấu? Giờ đã đặt tay cũng bị thay.', ot_sc_clear_confirm: 'Xoá giờ và sân của mọi trận chưa đấu?',
    ot_sc_hint: 'Trận được xếp lần lượt theo vòng vào giờ sớm nhất còn trống: mỗi đội tối đa một trận một ngày, mỗi sân một trận một giờ; loại trực tiếp đấu xong vòng trước mới tới vòng sau.',
    ot_sc_shift: 'Dời lượt đấu', ot_sc_shift_days: 'Số ngày (số âm: đá sớm hơn)', ot_sc_shift_go: 'Dời', ot_sc_stage_round: 'Giai đoạn {s} · vòng {r}',
    ot_sc_conflicts: 'Trùng lịch', ot_sc_cf_team: '{name} đá 2 trận cùng ngày {day}', ot_sc_cf_venue: '{name} có 2 trận cùng lúc {when}',
    ot_sc_postponed: 'Trận hoãn', ot_sc_postpone: 'Hoãn trận', ot_sc_postpone_confirm: 'Hoãn trận này? Giờ đấu sẽ bị bỏ.', ot_sc_makeup: 'Tìm ngày đá bù', ot_sc_pp_tag: 'Hoãn',
    ot_sc_more: 'Xem thêm {n} ngày', ot_sc_past: 'Các ngày đã qua ({n})', ot_sc_unsched: 'Còn {n} trận chưa có giờ.', ot_x_ics: 'Tải lịch (.ics)',
    srv_ot_sched_none: 'Không còn giờ trống để xếp lịch: hãy thêm ngày, giờ hoặc sân.', srv_ot_sched_nothing: 'Lượt này không có trận chưa đấu nào đã có giờ.',
    srv_ot_sched_cfg: 'Hãy tự xếp lịch một lần trước để biết ngày, giờ và sân được dùng.', srv_ot_sched_noslot: 'Không tìm được ngày đá bù trong 3 năm tới.',
    otlog_sched: 'Xếp lịch {n} trận', otlog_shift: 'Dời lượt {r} {d} ngày', otlog_sched_clear: 'Xoá lịch {n} trận', otlog_postpone: 'Hoãn trận {match}', otlog_makeup: 'Xếp ngày đá bù trận {match}',
  });

  X('en', {
    ot_sched_auto: 'Auto-schedule', ot_sc_start: 'Start date', ot_sc_days: 'Match days of the week', ot_sc_times: 'Kick-off times',
    ot_sc_vmode: 'Venue', ot_sc_vm_list: 'Shared venues', ot_sc_vm_home: 'Home venue of the first-listed team',
    ot_sc_venues: 'Venues (one per line)', ot_sc_home: 'Home venue of each team (empty: use the team name)',
    ot_sc_perslot: 'Max matches at the same time (0 = one per venue)', ot_sc_rest: 'Minimum rest days between two matches of a team',
    ot_sc_skip: 'No-play dates (one per line, e.g. 2026-12-24)', ot_sc_auto: 'Auto-schedule the next stage once it is drawn',
    ot_sc_run: 'Schedule unscheduled matches', ot_sc_redo: 'Reschedule everything', ot_sc_clear: 'Clear schedule',
    ot_sc_redo_confirm: 'Reschedule every unplayed match? Times set by hand are replaced too.', ot_sc_clear_confirm: 'Clear the time and venue of every unplayed match?',
    ot_sc_hint: 'Matches are placed round by round into the earliest free slot: at most one match per team per day and one match per venue per time slot; in knockouts a round starts only after the previous one.',
    ot_sc_shift: 'Move a matchday', ot_sc_shift_days: 'Days (negative: earlier)', ot_sc_shift_go: 'Move', ot_sc_stage_round: 'Stage {s} · round {r}',
    ot_sc_conflicts: 'Schedule clashes', ot_sc_cf_team: '{name} plays 2 matches on {day}', ot_sc_cf_venue: '{name} has 2 matches at {when}',
    ot_sc_postponed: 'Postponed matches', ot_sc_postpone: 'Postpone', ot_sc_postpone_confirm: 'Postpone this match? Its time will be cleared.', ot_sc_makeup: 'Find a makeup date', ot_sc_pp_tag: 'Postponed',
    ot_sc_more: 'Show {n} more days', ot_sc_past: 'Past days ({n})', ot_sc_unsched: '{n} matches have no time yet.', ot_x_ics: 'Download schedule (.ics)',
    srv_ot_sched_none: 'No free slots left: add days, times or venues.', srv_ot_sched_nothing: 'This round has no unplayed match with a time.',
    srv_ot_sched_cfg: 'Run auto-schedule once first so the days, times and venues are known.', srv_ot_sched_noslot: 'No makeup date found in the next 3 years.',
    otlog_sched: 'Scheduled {n} matches', otlog_shift: 'Moved round {r} by {d} days', otlog_sched_clear: 'Cleared the schedule of {n} matches', otlog_postpone: 'Postponed match {match}', otlog_makeup: 'Set a makeup date for match {match}',
  });

  X('ru', {
    ot_sched_auto: 'Автоматическое расписание', ot_sc_start: 'Дата начала', ot_sc_days: 'Игровые дни недели', ot_sc_times: 'Время начала',
    ot_sc_vmode: 'Место', ot_sc_vm_list: 'Общие площадки', ot_sc_vm_home: 'Домашняя площадка первой команды',
    ot_sc_venues: 'Площадки (по одной в строке)', ot_sc_home: 'Домашняя площадка каждой команды (пусто — название команды)',
    ot_sc_perslot: 'Матчей одновременно не больше (0 — по числу площадок)', ot_sc_rest: 'Минимум дней отдыха между матчами команды',
    ot_sc_skip: 'Дни без игр (по одной дате в строке, напр. 2026-12-24)', ot_sc_auto: 'Составлять расписание следующего этапа сразу после жеребьёвки',
    ot_sc_run: 'Распределить матчи без времени', ot_sc_redo: 'Составить заново', ot_sc_clear: 'Очистить расписание',
    ot_sc_redo_confirm: 'Заново распределить все несыгранные матчи? Время, заданное вручную, тоже заменится.', ot_sc_clear_confirm: 'Очистить время и место всех несыгранных матчей?',
    ot_sc_hint: 'Матчи ставятся по турам в самое раннее свободное время: у команды не больше одного матча в день, на площадке — одного матча в одно время; в плей-офф раунд начинается после предыдущего.',
    ot_sc_shift: 'Перенести тур', ot_sc_shift_days: 'Дней (отрицательное — раньше)', ot_sc_shift_go: 'Перенести', ot_sc_stage_round: 'Этап {s} · тур {r}',
    ot_sc_conflicts: 'Накладки в расписании', ot_sc_cf_team: '{name}: 2 матча в один день {day}', ot_sc_cf_venue: '{name}: 2 матча одновременно {when}',
    ot_sc_postponed: 'Перенесённые матчи', ot_sc_postpone: 'Перенести матч', ot_sc_postpone_confirm: 'Перенести этот матч? Время будет снято.', ot_sc_makeup: 'Найти дату переигровки', ot_sc_pp_tag: 'Перенесён',
    ot_sc_more: 'Показать ещё {n} дн.', ot_sc_past: 'Прошедшие дни ({n})', ot_sc_unsched: 'Матчей без времени: {n}.', ot_x_ics: 'Скачать расписание (.ics)',
    srv_ot_sched_none: 'Свободного времени не осталось: добавьте дни, время или площадки.', srv_ot_sched_nothing: 'В этом туре нет несыгранных матчей со временем.',
    srv_ot_sched_cfg: 'Сначала составьте расписание автоматически, чтобы знать дни, время и площадки.', srv_ot_sched_noslot: 'Дата переигровки в ближайшие 3 года не найдена.',
    otlog_sched: 'Расписание составлено для {n} матчей', otlog_shift: 'Тур {r} перенесён на {d} дн.', otlog_sched_clear: 'Расписание очищено ({n} матчей)', otlog_postpone: 'Матч {match} перенесён', otlog_makeup: 'Назначена переигровка матча {match}',
  });

  X('zh', {
    ot_sched_auto: '自动排赛程', ot_sc_start: '开始日期', ot_sc_days: '每周比赛日', ot_sc_times: '开赛时间',
    ot_sc_vmode: '场地', ot_sc_vm_list: '公用场地', ot_sc_vm_home: '排在前面一队的主场',
    ot_sc_venues: '场地（每行一个）', ot_sc_home: '各队主场（留空则用队名）',
    ot_sc_perslot: '同一时间最多场次（0 = 按场地数）', ot_sc_rest: '同一队两场比赛之间至少休息的天数',
    ot_sc_skip: '不比赛的日期（每行一个，如 2026-12-24）', ot_sc_auto: '下一阶段抽签后自动排赛程',
    ot_sc_run: '为未定时间的比赛排期', ot_sc_redo: '全部重排', ot_sc_clear: '清除赛程',
    ot_sc_redo_confirm: '重新安排所有未赛比赛的时间？手动设定的时间也会被替换。', ot_sc_clear_confirm: '清除所有未赛比赛的时间和场地？',
    ot_sc_hint: '比赛按轮次依次排入最早的空闲时段：每队每天最多一场，每块场地同一时段一场；淘汰赛上一轮结束后才开始下一轮。',
    ot_sc_shift: '整轮改期', ot_sc_shift_days: '天数（负数：提前）', ot_sc_shift_go: '改期', ot_sc_stage_round: '第 {s} 阶段 · 第 {r} 轮',
    ot_sc_conflicts: '赛程冲突', ot_sc_cf_team: '{name} 在 {day} 有 2 场比赛', ot_sc_cf_venue: '{name} 在 {when} 同时有 2 场比赛',
    ot_sc_postponed: '延期的比赛', ot_sc_postpone: '延期', ot_sc_postpone_confirm: '将这场比赛延期？比赛时间将被清除。', ot_sc_makeup: '寻找补赛日期', ot_sc_pp_tag: '延期',
    ot_sc_more: '再显示 {n} 天', ot_sc_past: '已过去的日期（{n}）', ot_sc_unsched: '还有 {n} 场比赛未定时间。', ot_x_ics: '下载赛程（.ics）',
    srv_ot_sched_none: '没有空闲时段了：请增加比赛日、时间或场地。', srv_ot_sched_nothing: '这一轮没有已定时间的未赛比赛。',
    srv_ot_sched_cfg: '请先自动排一次赛程，以确定比赛日、时间和场地。', srv_ot_sched_noslot: '未来 3 年内找不到补赛日期。',
    otlog_sched: '已为 {n} 场比赛排期', otlog_shift: '第 {r} 轮改期 {d} 天', otlog_sched_clear: '已清除 {n} 场比赛的赛程', otlog_postpone: '比赛 {match} 延期', otlog_makeup: '已为比赛 {match} 安排补赛',
  });
})();
