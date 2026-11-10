/*
 * Chuỗi 4 ngôn ngữ – Giải đấu Offline: giải nhiều mùa, đặc cách trọn đời, đăng ký theo lời mời (đợt 4 –
 * otour-next.js, server/src/hub/otour-next.js, otour-league.js). Nạp sau i18n.js.
 */
(function () {
  'use strict';
  const X = window.I18N.extend;

  X('vi', {
    ot_series_title: 'Giải nhiều mùa', ot_season_n: 'Mùa {n}', ot_season_prev: '← Mùa {n}', ot_season_next: 'Mùa {n} →',
    ot_exempt: 'Đặc cách trọn đời', ot_exempt_tag: 'Đặc cách', ot_exempt_ph: 'Mỗi dòng một tên đội / người',
    ot_exempt_hint: 'Những tên này tự có mặt ở mùa sau. Nhà vô địch tự được thêm khi tạo mùa sau và đứng đầu danh sách (như đội giữ cúp).',
    ot_exempt_save: 'Lưu danh sách đặc cách', ot_next_btn: 'Tạo mùa sau',
    ot_next_hint: 'Tạo giải mới cùng cấu hình (bộ môn, thể thức, chi tiết ván…). Nhà vô địch và người được đặc cách tự vào mùa sau.',
    ot_next_carry: 'Giữ cả danh sách đội của mùa này', ot_next_confirm: 'Tạo mùa sau từ giải này?',
    ot_reg_invite: 'Chỉ nhận đăng ký theo lời mời', ot_invite_names: 'Mời tài khoản (tên đăng nhập)', ot_invite_ph: 'Mỗi dòng một tên đăng nhập, ví dụ @tennguoichoi',
    ot_invite_send: 'Gửi lời mời', ot_invite_del: 'Bỏ lời mời', ot_invited_n: 'Đã mời {n} tài khoản:', ot_invite_done: 'Đã gửi {n} lời mời.',
    ot_invite_miss: 'Không tìm thấy: {names}.', ot_reg_invite_only: 'Giải này chỉ nhận đăng ký theo lời mời của ban tổ chức.',
    nt_ot_invite: 'Bạn được mời đăng ký giải {name}',
    srv_ot_next_not_done: 'Giải cần kết thúc trước khi tạo mùa sau.', srv_ot_next_exists: 'Giải này đã có mùa sau.',
    srv_ot_reg_invite_only: 'Giải này chỉ nhận đăng ký theo lời mời.', srv_ot_invite_full: 'Mỗi giải mời tối đa {n} tài khoản.',
    otlog_exempt: 'Cập nhật danh sách đặc cách ({n} tên)', otlog_next_season: 'Tạo mùa {n}', otlog_invite: 'Gửi {n} lời mời đăng ký',
  });

  X('en', {
    ot_series_title: 'Multi-season event', ot_season_n: 'Season {n}', ot_season_prev: '← Season {n}', ot_season_next: 'Season {n} →',
    ot_exempt: 'Lifetime exemptions', ot_exempt_tag: 'Exempt', ot_exempt_ph: 'One team or player name per line',
    ot_exempt_hint: 'These names are entered automatically next season. The champion is added when the next season is created and listed first (like a cup defender).',
    ot_exempt_save: 'Save exemptions', ot_next_btn: 'Create next season',
    ot_next_hint: 'Create a new event with the same setup (sport, format, game details…). The champion and exempt entrants join the next season automatically.',
    ot_next_carry: 'Keep this season’s whole entry list', ot_next_confirm: 'Create the next season from this event?',
    ot_reg_invite: 'Invitation-only registration', ot_invite_names: 'Invite accounts (usernames)', ot_invite_ph: 'One username per line, e.g. @playername',
    ot_invite_send: 'Send invitations', ot_invite_del: 'Withdraw invitation', ot_invited_n: '{n} accounts invited:', ot_invite_done: '{n} invitations sent.',
    ot_invite_miss: 'Not found: {names}.', ot_reg_invite_only: 'This event only accepts registrations invited by the organizer.',
    nt_ot_invite: 'You are invited to register for {name}',
    srv_ot_next_not_done: 'The event must end before creating the next season.', srv_ot_next_exists: 'This event already has a next season.',
    srv_ot_reg_invite_only: 'This event is invitation-only.', srv_ot_invite_full: 'At most {n} accounts can be invited per event.',
    otlog_exempt: 'Updated exemptions ({n} names)', otlog_next_season: 'Created season {n}', otlog_invite: 'Sent {n} registration invitations',
  });

  X('ru', {
    ot_series_title: 'Турнир из нескольких сезонов', ot_season_n: 'Сезон {n}', ot_season_prev: '← Сезон {n}', ot_season_next: 'Сезон {n} →',
    ot_exempt: 'Пожизненное право участия', ot_exempt_tag: 'Без отбора', ot_exempt_ph: 'По одному названию команды или имени в строке',
    ot_exempt_hint: 'Эти участники автоматически попадают в следующий сезон. Победитель добавляется при создании следующего сезона и стоит первым (как обладатель кубка).',
    ot_exempt_save: 'Сохранить список', ot_next_btn: 'Создать следующий сезон',
    ot_next_hint: 'Новый турнир с теми же настройками (вид спорта, формат, детали игр…). Победитель и участники без отбора попадают в него автоматически.',
    ot_next_carry: 'Сохранить весь список участников этого сезона', ot_next_confirm: 'Создать следующий сезон из этого турнира?',
    ot_reg_invite: 'Регистрация только по приглашениям', ot_invite_names: 'Пригласить аккаунты (логины)', ot_invite_ph: 'По одному логину в строке, например @igrok',
    ot_invite_send: 'Отправить приглашения', ot_invite_del: 'Отозвать приглашение', ot_invited_n: 'Приглашено аккаунтов: {n}', ot_invite_done: 'Отправлено приглашений: {n}.',
    ot_invite_miss: 'Не найдены: {names}.', ot_reg_invite_only: 'В этот турнир можно зарегистрироваться только по приглашению организатора.',
    nt_ot_invite: 'Вас пригласили зарегистрироваться на турнир {name}',
    srv_ot_next_not_done: 'Сначала турнир должен завершиться.', srv_ot_next_exists: 'У этого турнира уже есть следующий сезон.',
    srv_ot_reg_invite_only: 'Регистрация только по приглашениям.', srv_ot_invite_full: 'На один турнир можно пригласить не более {n} аккаунтов.',
    otlog_exempt: 'Обновлён список без отбора ({n})', otlog_next_season: 'Создан сезон {n}', otlog_invite: 'Отправлено приглашений: {n}',
  });

  X('zh', {
    ot_series_title: '多赛季赛事', ot_season_n: '第 {n} 季', ot_season_prev: '← 第 {n} 季', ot_season_next: '第 {n} 季 →',
    ot_exempt: '终身参赛资格', ot_exempt_tag: '免资格赛', ot_exempt_ph: '每行一个队名或姓名',
    ot_exempt_hint: '这些名字会自动进入下一季。创建下一季时冠军会自动加入并排在首位（如卫冕方）。',
    ot_exempt_save: '保存名单', ot_next_btn: '创建下一季',
    ot_next_hint: '以相同设置（项目、赛制、对局详情等）创建新赛事。冠军和免资格赛的参赛者自动进入下一季。',
    ot_next_carry: '保留本季全部参赛名单', ot_next_confirm: '要从本赛事创建下一季吗？',
    ot_reg_invite: '仅限受邀报名', ot_invite_names: '邀请账号（用户名）', ot_invite_ph: '每行一个用户名，例如 @playername',
    ot_invite_send: '发送邀请', ot_invite_del: '撤回邀请', ot_invited_n: '已邀请 {n} 个账号：', ot_invite_done: '已发送 {n} 份邀请。',
    ot_invite_miss: '未找到：{names}。', ot_reg_invite_only: '本赛事仅接受主办方邀请的报名。',
    nt_ot_invite: '你受邀报名赛事 {name}',
    srv_ot_next_not_done: '赛事结束后才能创建下一季。', srv_ot_next_exists: '本赛事已有下一季。',
    srv_ot_reg_invite_only: '本赛事仅限受邀报名。', srv_ot_invite_full: '每个赛事最多邀请 {n} 个账号。',
    otlog_exempt: '更新免资格赛名单（{n} 个）', otlog_next_season: '创建第 {n} 季', otlog_invite: '发送 {n} 份报名邀请',
  });
})();
