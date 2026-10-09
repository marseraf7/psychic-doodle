/*
 * Thông báo gửi cho người chơi. Máy chủ gửi kèm mã (code) + tham số (args) để giao diện
 * tự dịch sang ngôn ngữ người chơi chọn (caro/i18n.js, khoá "srv_<code>").
 * Chữ tiếng Việt ở đây chỉ là bản dự phòng khi client chưa có bản dịch.
 */
'use strict';

const VI = {
  bad_message: 'Tin nhắn không hợp lệ',
  unsupported: 'Lệnh không hỗ trợ',
  no_hello: 'Chưa chào máy chủ',
  error: 'Lỗi',
  no_guest_key: 'Thiếu mã khách',
  too_many_attempts: 'Thử sai quá nhiều lần, vui lòng đợi vài phút',
  bad_username: 'Tên đăng nhập 3–20 ký tự: chữ thường không dấu, số, dấu _ hoặc .',
  short_password: 'Mật khẩu cần ít nhất 6 ký tự',
  username_taken: 'Tên đăng nhập đã có người dùng',
  bad_login: 'Sai tên đăng nhập hoặc mật khẩu',
  google_disabled: 'Máy chủ chưa bật đăng nhập Google',
  google_failed: 'Không xác minh được tài khoản Google',
  google_taken: 'Tài khoản Google này đã liên kết với tài khoản khác',
  google_linked: 'Đã liên kết Google',
  empty_name: 'Tên không được để trống',
  need_account: 'Cần đăng nhập tài khoản để dùng tính năng này',
  player_not_found: 'Không tìm thấy người chơi này',
  friend_self: 'Không thể kết bạn với chính mình',
  already_friends: 'Hai bạn đã là bạn bè',
  friend_request_sent: 'Đã gửi lời mời kết bạn tới {name}',
  friend_request_in: '{name} muốn kết bạn với bạn',
  request_gone: 'Lời mời không còn',
  friend_accepted: '{name} đã đồng ý kết bạn',
  left_room: '{name} đã rời phòng',
  joined_room: '{name} đã vào phòng',
  match_found: 'Đã tìm được đối thủ: {name}',
  room_not_found: 'Không tìm thấy phòng {code}',
  wrong_room_password: 'Sai mật khẩu phòng',
  room_full: 'Phòng đã đủ 2 người',
  not_in_room: 'Bạn không ở trong phòng nào',
  wants_rematch: '{name} muốn tái đấu',
  challenge_friends_only: 'Chỉ thách đấu được bạn bè',
  friend_offline: '{name} đang offline',
  busy_in_game: 'Bạn đang trong một ván đấu, hãy kết thúc hoặc rời phòng trước',
  invite_expired: 'Lời thách đấu đã hết hạn',
  challenge_declined: '{name} đã từ chối thách đấu',
  inviter_offline: 'Người mời đã offline',
  invite_no_answer: '{name} không trả lời lời thách đấu',
  waiting_opponent: 'Đang chờ đối thủ',
  game_over: 'Ván đã kết thúc',
  match_over: 'Trận đấu đã kết thúc',
  not_your_turn: 'Chưa đến lượt bạn',
  bad_move: 'Nước đi không hợp lệ',
  cell_taken: 'Ô này đã có quân',
  cannot_resign: 'Không thể đầu hàng lúc này',
  cannot_rematch: 'Chưa thể tái đấu',
  next_game_auto: 'Ván tiếp theo sẽ tự bắt đầu',
  cannot_draw: 'Không thể xin hoà lúc này',
  no_draw_offer: 'Không có lời xin hoà nào',
  draw_offered: '{name} xin hoà',
  draw_declined: '{name} không đồng ý hoà',
  draw_wait: 'Đợi {n} giây nữa mới được xin hoà lại',
  blocked: 'Không thể tương tác với người chơi này',
  not_friends: 'Chỉ nhắn tin được với bạn bè',
  message_empty: 'Tin nhắn trống',
  too_fast: 'Bạn thao tác nhanh quá, đợi một chút',
  wrong_password: 'Mật khẩu hiện tại không đúng',
  password_changed: 'Đã đổi mật khẩu',
  email_invalid: 'Email không hợp lệ',
  email_taken: 'Email này đã được dùng cho tài khoản khác',
  email_saved: 'Đã lưu email',
  email_code_sent: 'Đã gửi mã xác minh tới {email}',
  email_verified: 'Đã xác minh email',
  email_bad_code: 'Mã xác minh không đúng hoặc đã hết hạn',
  reset_unavailable: 'Máy chủ chưa bật khôi phục mật khẩu qua email',
  reset_bad_code: 'Mã không đúng hoặc đã hết hạn',
  reported: 'Đã gửi báo cáo, cảm ơn bạn',
  user_blocked: 'Đã chặn {name}',
  user_unblocked: 'Đã bỏ chặn {name}',
  confirm_username: 'Nhập đúng tên đăng nhập của bạn để xác nhận',
  // Quản trị viên
  admin_only: 'Chỉ quản trị viên mới làm được việc này',
  admin_new_item: 'Có mục mới chờ duyệt: {name}',
  review_gone: 'Mục này đã được xử lý',
  // Câu lạc bộ
  club_not_found: 'Không tìm thấy câu lạc bộ',
  club_name_short: 'Tên câu lạc bộ cần ít nhất 3 ký tự',
  club_name_taken: 'Đã có câu lạc bộ trùng tên',
  club_limit: 'Mỗi người chỉ làm chủ tối đa {n} câu lạc bộ',
  club_join_limit: 'Mỗi người chỉ tham gia tối đa {n} câu lạc bộ',
  club_bad_code: 'Mã mời không đúng',
  club_request_sent: 'Đã gửi yêu cầu tham gia {club}, chờ quản lý duyệt',
  club_request_in: '{name} muốn tham gia {club}',
  club_request_accepted: 'Bạn đã được nhận vào {club}',
  club_joined: 'Đã tham gia {club}',
  club_kicked: 'Bạn đã bị mời ra khỏi {club}',
  club_owner_leave: 'Chủ câu lạc bộ không thể rời đi – hãy trao quyền chủ cho người khác hoặc giải tán',
  club_officers_only: 'Chỉ chủ hoặc quản lý câu lạc bộ mới làm được việc này',
  club_owner_only: 'Chỉ chủ câu lạc bộ mới làm được việc này',
  club_cannot_kick: 'Không thể mời người này ra',
  club_has_running_tour: 'Câu lạc bộ đang có giải đấu diễn ra',
  club_approved: 'Câu lạc bộ {name} đã được duyệt',
  club_rejected: 'Câu lạc bộ {name} không được duyệt. {note}',
  // Giải đấu
  tour_not_found: 'Không tìm thấy giải đấu',
  tour_name_short: 'Tên giải cần ít nhất 3 ký tự',
  tour_bad_start: 'Giờ bắt đầu phải sau ít nhất 1 phút và trong vòng 30 ngày',
  tour_club_officers: 'Chỉ chủ hoặc quản lý câu lạc bộ mới tạo được giải của câu lạc bộ',
  tour_limit: 'Mỗi người chỉ có tối đa {n} giải chưa kết thúc',
  tour_club_only: 'Giải này chỉ dành cho thành viên câu lạc bộ',
  tour_full: 'Giải đã đủ người',
  tour_closed: 'Giải đã đóng đăng ký',
  tour_joined: 'Đã đăng ký giải {name}',
  tour_not_joined: 'Bạn chưa đăng ký giải này',
  tour_checkin_closed: 'Chưa tới giờ điểm danh hoặc đã hết giờ',
  tour_managers_only: 'Chỉ ban tổ chức mới làm được việc này',
  tour_cannot_start: 'Không thể bắt đầu giải lúc này',
  tour_cannot_cancel: 'Không thể huỷ giải lúc này',
  tour_no_rematch: 'Không tái đấu trong giải – ván sau tự được ghép',
  tour_approved: 'Giải {name} đã được duyệt và mở đăng ký',
  tour_rejected: 'Giải {name} không được duyệt. {note}',
  tour_checkin_open: 'Giải {name} đã mở điểm danh – hãy điểm danh để được thi đấu',
  tour_started: 'Giải {name} đã bắt đầu',
  tour_no_checkin: 'Bạn không điểm danh nên không được xếp vào giải {name}',
  tour_game_start: 'Ván đấu giải {name}: bạn gặp {opp}',
  tour_noshow: 'Bạn bị xử thua ở giải {name} vì không có mặt',
  tour_kicked: 'Bạn đã bị ban tổ chức loại khỏi giải {name}',
  tour_cancelled: 'Giải {name} đã bị huỷ',
  tour_finished: 'Giải {name} đã kết thúc – vô địch: {winner}',
  tour_advanced: 'Bạn đã vào vòng {n} của giải {name}',
  tour_not_advanced: 'Bạn đã dừng bước ở giải {name}',
};

function fmt(code, args = {}) {
  const s = VI[code] || code;
  return s.replace(/\{(\w+)\}/g, (_, k) => (args[k] == null ? '' : String(args[k])));
}

class GameError extends Error {
  constructor(code, args = {}) {
    super(fmt(code, args));
    this.code = code;
    this.args = args;
  }
}

/** Lỗi gửi cho người chơi: throw E('room_full') */
const E = (code, args) => new GameError(code, args);
/** Thông báo ngắn (toast) */
const note = (code, args = {}) => ({ t: 'toast', code, args, msg: fmt(code, args) });

module.exports = { VI, fmt, E, note, GameError };
