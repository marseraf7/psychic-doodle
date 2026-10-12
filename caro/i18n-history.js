/* Chuỗi dịch của Lịch sử đấu (history.js) – 4 ngôn ngữ. */
(function () {
  'use strict';
  const I = window.I18N;
  I.extend('vi', {
    history_title: 'Lịch sử đấu',
    hist_of: 'Lịch sử đấu của {name}',
    hist_vis: 'Ai xem được lịch sử đấu của bạn',
    hist_vis_public: 'Công khai',
    hist_vis_friends: 'Bạn bè',
    hist_vis_private: 'Chỉ mình tôi',
    hist_vis_saved: 'Lịch sử đấu: {v}',
    hist_hidden: '{name} không công khai lịch sử đấu.',
    hist_more: 'Tải thêm',
    hist_analyze: 'Phân tích',
    hist_open: 'Lịch sử đấu',
  });
  I.extend('en', {
    history_title: 'Game history',
    hist_of: "{name}'s games",
    hist_vis: 'Who can see your game history',
    hist_vis_public: 'Everyone',
    hist_vis_friends: 'Friends',
    hist_vis_private: 'Only me',
    hist_vis_saved: 'Game history: {v}',
    hist_hidden: "{name}'s game history is not public.",
    hist_more: 'Load more',
    hist_analyze: 'Analyse',
    hist_open: 'Game history',
  });
  I.extend('ru', {
    history_title: 'История партий',
    hist_of: 'Партии: {name}',
    hist_vis: 'Кто видит вашу историю партий',
    hist_vis_public: 'Все',
    hist_vis_friends: 'Друзья',
    hist_vis_private: 'Только я',
    hist_vis_saved: 'История партий: {v}',
    hist_hidden: '{name} скрывает историю партий.',
    hist_more: 'Загрузить ещё',
    hist_analyze: 'Анализ',
    hist_open: 'История партий',
  });
  I.extend('zh', {
    history_title: '对局记录',
    hist_of: '{name} 的对局记录',
    hist_vis: '谁可以查看你的对局记录',
    hist_vis_public: '所有人',
    hist_vis_friends: '好友',
    hist_vis_private: '仅自己',
    hist_vis_saved: '对局记录：{v}',
    hist_hidden: '{name} 未公开对局记录。',
    hist_more: '加载更多',
    hist_analyze: '分析',
    hist_open: '对局记录',
  });
})();
