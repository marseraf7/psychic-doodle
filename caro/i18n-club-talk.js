/*
 * Chuỗi 4 ngôn ngữ – Câu lạc bộ Đợt 8: chat CLB, diễn đàn CLB (chủ đề, bài viết, ghim / khoá), kiểm duyệt (xoá, cấm nói)
 * và lỗi của máy chủ (srv_*: club-talk.js). Dùng bởi club-talk.js, club.js. Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  // ================================================================ Tiếng Việt
  X('vi', {
    talk_chat: 'Chat CLB', talk_chat_empty: 'Chưa có tin nào – chào mọi người đi!', talk_chat_ph: 'Nhắn cho cả CLB…', talk_send: 'Gửi',
    talk_delete: 'Xoá', talk_edit: 'Sửa', talk_edited: 'đã sửa',
    talk_chat_readonly: 'Chỉ ban quản lý viết được ở chat này.', talk_muted_me: 'Bạn đang bị cấm nói ở chat và diễn đàn của CLB.',
    talk_forum: 'Diễn đàn', talk_topic_new: 'Chủ đề mới', talk_forum_empty: 'Chưa có chủ đề nào.', talk_posts_n: '{n} bài',
    talk_page: 'Trang {a}/{b}', talk_pinned: 'Ghim', talk_locked: 'Khoá',
    talk_pin: 'Ghim', talk_unpin: 'Bỏ ghim', talk_lock: 'Khoá chủ đề', talk_unlock: 'Mở khoá', talk_topic_delete: 'Xoá chủ đề',
    talk_topic_delete_q: 'Xoá chủ đề này và mọi bài trong đó?', talk_post_delete_q: 'Xoá bài này?',
    talk_reply: 'Trả lời', talk_locked_hint: 'Chủ đề đã khoá – không trả lời được nữa.', talk_forum_readonly: 'Bạn chỉ đọc được diễn đàn này.',
    talk_title: 'Tiêu đề', talk_content: 'Nội dung', talk_post: 'Đăng',
    talk_mute: 'Cấm nói (chat, diễn đàn)', talk_unmute: 'Bỏ cấm nói',
    srv_club_talk_denied: 'Bạn không viết được ở đây (câu lạc bộ đã tắt / chỉ ban quản lý / bạn bị cấm nói)',
    srv_club_topic_short: 'Tiêu đề cần ít nhất 3 ký tự và có nội dung', srv_club_topic_limit: 'Diễn đàn đã đủ {n} chủ đề – hãy xoá bớt chủ đề cũ',
    srv_club_topic_gone: 'Chủ đề không còn', srv_club_topic_locked: 'Chủ đề đã khoá',
  });

  // ================================================================ English
  X('en', {
    talk_chat: 'Club chat', talk_chat_empty: 'No messages yet – say hi!', talk_chat_ph: 'Message the whole club…', talk_send: 'Send',
    talk_delete: 'Delete', talk_edit: 'Edit', talk_edited: 'edited',
    talk_chat_readonly: 'Only officers can write in this chat.', talk_muted_me: 'You are muted in this club’s chat and forum.',
    talk_forum: 'Forum', talk_topic_new: 'New topic', talk_forum_empty: 'No topics yet.', talk_posts_n: '{n} posts',
    talk_page: 'Page {a}/{b}', talk_pinned: 'Pinned', talk_locked: 'Locked',
    talk_pin: 'Pin', talk_unpin: 'Unpin', talk_lock: 'Lock topic', talk_unlock: 'Unlock', talk_topic_delete: 'Delete topic',
    talk_topic_delete_q: 'Delete this topic and all its posts?', talk_post_delete_q: 'Delete this post?',
    talk_reply: 'Reply', talk_locked_hint: 'This topic is locked – no more replies.', talk_forum_readonly: 'You can only read this forum.',
    talk_title: 'Title', talk_content: 'Content', talk_post: 'Post',
    talk_mute: 'Mute (chat, forum)', talk_unmute: 'Unmute',
    srv_club_talk_denied: 'You can’t write here (turned off / officers only / you are muted)',
    srv_club_topic_short: 'The title needs at least 3 characters and the post needs content', srv_club_topic_limit: 'The forum already has {n} topics – delete some old ones',
    srv_club_topic_gone: 'This topic no longer exists', srv_club_topic_locked: 'This topic is locked',
  });

  // ================================================================ Русский
  X('ru', {
    talk_chat: 'Чат клуба', talk_chat_empty: 'Сообщений пока нет – поздоровайтесь!', talk_chat_ph: 'Написать всему клубу…', talk_send: 'Отправить',
    talk_delete: 'Удалить', talk_edit: 'Изменить', talk_edited: 'изменено',
    talk_chat_readonly: 'В этом чате пишут только руководители.', talk_muted_me: 'Вам запрещено писать в чате и на форуме клуба.',
    talk_forum: 'Форум', talk_topic_new: 'Новая тема', talk_forum_empty: 'Тем пока нет.', talk_posts_n: 'сообщений: {n}',
    talk_page: 'Стр. {a}/{b}', talk_pinned: 'Закреплено', talk_locked: 'Закрыто',
    talk_pin: 'Закрепить', talk_unpin: 'Открепить', talk_lock: 'Закрыть тему', talk_unlock: 'Открыть', talk_topic_delete: 'Удалить тему',
    talk_topic_delete_q: 'Удалить тему со всеми сообщениями?', talk_post_delete_q: 'Удалить сообщение?',
    talk_reply: 'Ответить', talk_locked_hint: 'Тема закрыта – ответить нельзя.', talk_forum_readonly: 'Этот форум доступен только для чтения.',
    talk_title: 'Заголовок', talk_content: 'Текст', talk_post: 'Опубликовать',
    talk_mute: 'Запретить писать (чат, форум)', talk_unmute: 'Разрешить писать',
    srv_club_talk_denied: 'Здесь писать нельзя (выключено / только руководители / вам запрещено)',
    srv_club_topic_short: 'Заголовок – от 3 символов, текст не может быть пустым', srv_club_topic_limit: 'На форуме уже {n} тем – удалите старые',
    srv_club_topic_gone: 'Темы больше нет', srv_club_topic_locked: 'Тема закрыта',
  });

  // ================================================================ 中文
  X('zh', {
    talk_chat: '俱乐部聊天', talk_chat_empty: '还没有消息——打个招呼吧！', talk_chat_ph: '发给全体成员…', talk_send: '发送',
    talk_delete: '删除', talk_edit: '编辑', talk_edited: '已编辑',
    talk_chat_readonly: '此聊天仅管理团队可发言。', talk_muted_me: '你已被禁止在本俱乐部聊天和论坛发言。',
    talk_forum: '论坛', talk_topic_new: '新主题', talk_forum_empty: '还没有主题。', talk_posts_n: '{n} 帖',
    talk_page: '第 {a}/{b} 页', talk_pinned: '置顶', talk_locked: '已锁定',
    talk_pin: '置顶', talk_unpin: '取消置顶', talk_lock: '锁定主题', talk_unlock: '解锁', talk_topic_delete: '删除主题',
    talk_topic_delete_q: '删除此主题及其中所有帖子？', talk_post_delete_q: '删除此帖？',
    talk_reply: '回复', talk_locked_hint: '主题已锁定，无法回复。', talk_forum_readonly: '你只能阅读此论坛。',
    talk_title: '标题', talk_content: '内容', talk_post: '发布',
    talk_mute: '禁言（聊天、论坛）', talk_unmute: '解除禁言',
    srv_club_talk_denied: '你无法在此发言（已关闭 / 仅管理团队 / 你被禁言）',
    srv_club_topic_short: '标题至少 3 个字，且需有内容', srv_club_topic_limit: '论坛已有 {n} 个主题——请删除一些旧主题',
    srv_club_topic_gone: '主题已不存在', srv_club_topic_locked: '主题已锁定',
  });
})();
