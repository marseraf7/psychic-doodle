/* Chuỗi dịch của bảng Nguồn người chơi cho quản trị viên (src-admin.js) – 4 ngôn ngữ. */
(function () {
  'use strict';
  const I = window.I18N;
  I.extend('vi', {
    src_title: 'Nguồn người chơi',
    src_hint: '{n} ngày gần nhất, theo nguồn của lần đầu vào game. D1, D7: tỉ lệ người mới quay lại đúng ngày thứ 1, thứ 7 (chỉ tính nhóm đã đủ ngày). Không lưu IP.',
    src_col: 'Nguồn',
    src_new: 'Người mới',
    src_d1: 'D1',
    src_d7: 'D7',
    src_gpu: 'Ván / người',
    src_refs: 'Mã giới thiệu (?ref=)',
    src_daily: 'Theo ngày (nguồn của lần vào)',
    src_day: 'Ngày',
    src_active: 'Hoạt động',
    src_games: 'Ván online',
    src_empty: 'Chưa có số liệu.',
    src_na: '–',
  });
  I.extend('en', {
    src_title: 'Player sources',
    src_hint: 'Last {n} days, by the source of the first visit. D1, D7: share of new players who came back exactly on day 1 or day 7 (only groups old enough count). No IP addresses are stored.',
    src_col: 'Source',
    src_new: 'New players',
    src_d1: 'D1',
    src_d7: 'D7',
    src_gpu: 'Games per player',
    src_refs: 'Referral codes (?ref=)',
    src_daily: 'By day (source of the visit)',
    src_day: 'Day',
    src_active: 'Active',
    src_games: 'Online games',
    src_empty: 'No data yet.',
    src_na: '–',
  });
  I.extend('ru', {
    src_title: 'Источники игроков',
    src_hint: 'Последние {n} дн., по источнику первого входа. D1, D7: доля новых игроков, вернувшихся ровно на 1-й или 7-й день (учитываются только группы, для которых этот день уже прошёл). IP-адреса не хранятся.',
    src_col: 'Источник',
    src_new: 'Новые игроки',
    src_d1: 'D1',
    src_d7: 'D7',
    src_gpu: 'Партий на игрока',
    src_refs: 'Коды приглашения (?ref=)',
    src_daily: 'По дням (источник входа)',
    src_day: 'День',
    src_active: 'Активные',
    src_games: 'Партии онлайн',
    src_empty: 'Данных пока нет.',
    src_na: '–',
  });
  I.extend('zh', {
    src_title: '玩家来源',
    src_hint: '最近 {n} 天，按首次进入游戏的来源统计。D1、D7：新玩家恰好在第 1 天、第 7 天回来的比例（只统计已满天数的批次）。不保存 IP。',
    src_col: '来源',
    src_new: '新玩家',
    src_d1: 'D1',
    src_d7: 'D7',
    src_gpu: '人均对局',
    src_refs: '推荐码（?ref=）',
    src_daily: '按日（进入时的来源）',
    src_day: '日期',
    src_active: '活跃',
    src_games: '在线对局',
    src_empty: '暂无数据。',
    src_na: '–',
  });
})();
