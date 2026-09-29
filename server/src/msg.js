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
  reset_unavailable: 'Máy chủ chưa bật khôi phục mật khẩu qua email',
  reset_bad_code: 'Mã không đúng hoặc đã hết hạn',
  reported: 'Đã gửi báo cáo, cảm ơn bạn',
  user_blocked: 'Đã chặn {name}',
  user_unblocked: 'Đã bỏ chặn {name}',
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
