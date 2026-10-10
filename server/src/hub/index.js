/*
 * Trung tâm xử lý tin nhắn realtime, chia theo chủ đề:
 *   core.js        – trạng thái chung, kết nối, phiên, giới hạn tần suất, dọn dẹp
 *   auth.js        – tài khoản, mật khẩu, email, xoá tài khoản
 *   social.js      – bạn bè, lịch sử, chặn/báo cáo, tin nhắn
 *   profile.js     – bảng xếp hạng (chung + theo loại thời gian), trang hồ sơ người chơi
 *   rooms.js       – phòng chơi, ván đấu, thách đấu, tính điểm, xin hoà
 *   matchmaking.js – tìm trận nhanh và phòng công khai
 *   clubs.js       – câu lạc bộ
 *   tournaments.js – giải đấu: phần chung (tạo, đăng ký, xem, ban tổ chức, nhịp chạy)
 *   arena.js       – giải Arena
 *   bracket.js     – giải theo giai đoạn (dùng logic thể thức trong stages.js)
 *   tourpush.js    – gửi cập nhật trang giải cho người đang xem (gom, chỉ gửi phần đổi)
 *   admin.js       – quản trị viên duyệt câu lạc bộ / giải đấu
 *   watch.js       – xem trực tiếp ván đang đấu, danh sách ván hay
 * Mỗi phần là một lớp chỉ chứa phương thức; ở đây gộp tất cả vào Hub.prototype.
 * Tin nhắn loại X do phương thức on_X xử lý. Không phụ thuộc thư viện WebSocket:
 * mỗi kết nối chỉ cần có conn.send(obj) và conn.ip.
 */
'use strict';
const { Hub } = require('./core.js');
const { Auth } = require('./auth.js');
const { Social } = require('./social.js');
const { Rooms } = require('./rooms.js');
const { Matchmaking } = require('./matchmaking.js');
const { Clubs } = require('./clubs.js');
const { Tournaments } = require('./tournaments.js');
const { Arena } = require('./arena.js');
const { Bracket } = require('./bracket.js');
const { TourPush } = require('./tourpush.js');
const { Admin } = require('./admin.js');
const { Watch } = require('./watch.js');
const { Profile } = require('./profile.js');
const { compareVersions, verifyGoogleToken } = require('./shared.js');

for (const part of [Auth, Social, Rooms, Matchmaking, Clubs, Tournaments, Arena, Bracket, TourPush, Admin, Watch, Profile]) {
  for (const name of Object.getOwnPropertyNames(part.prototype)) {
    if (name === 'constructor') continue;
    if (Object.prototype.hasOwnProperty.call(Hub.prototype, name)) throw new Error('Hub: trùng phương thức ' + name);
    Object.defineProperty(Hub.prototype, name, Object.getOwnPropertyDescriptor(part.prototype, name));
  }
}

module.exports = { Hub, verifyGoogleToken, compareVersions };
