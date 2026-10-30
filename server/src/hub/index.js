/*
 * Trung tâm xử lý tin nhắn realtime, chia theo chủ đề:
 *   core.js        – trạng thái chung, kết nối, phiên, giới hạn tần suất, dọn dẹp
 *   auth.js        – tài khoản, mật khẩu, email, xoá tài khoản
 *   social.js      – bạn bè, chặn/báo cáo, tin nhắn
 *   history.js     – Lịch sử đấu: xem của mình / người khác theo quyền riêng tư (Công khai · Bạn bè · Chỉ mình tôi)
 *   devices.js     – Thiết bị: tài khoản đang đăng nhập ở đâu, đăng xuất từ xa
 *   profile.js     – bảng xếp hạng (chung + theo loại thời gian), trang hồ sơ người chơi
 *   rooms.js       – phòng chơi, ván đấu, tính điểm
 *   challenges.js  – thách đấu bạn bè, xin hoà, chat nhanh
 *   matchmaking.js – tìm trận nhanh và phòng công khai
 *   clubs.js       – câu lạc bộ
 *   tournaments.js – giải đấu: phần chung (tạo, đăng ký, xem, dữ liệu gửi client)
 *   tour-run.js    – giải đấu: ban tổ chức, nhịp chạy, phòng cho ván của giải, kết thúc giải
 *   arena.js       – giải Arena
 *   bracket.js     – giải theo giai đoạn (dùng logic thể thức trong stages.js)
 *   tour-reg.js    – đăng ký nâng cao: điều kiện, câu hỏi, duyệt tay, danh sách chờ, Bulk Add (cả giải offline)
 *   tour-score.js  – giải offline: ban tổ chức nhập tỉ số theo set, huỷ kết quả; ghi đè kết quả trận trực tuyến
 *   tour-manage.js – khu quản trị: nhật ký, thông báo, hạt giống thủ công, lịch, sửa cài đặt, tạm dừng, đặt lại, xoá, nháp
 *   tourpush.js    – gửi cập nhật trang giải cho người đang xem (gom, chỉ gửi phần đổi)
 *   admin.js       – quản trị viên duyệt câu lạc bộ / giải đấu
 *   watch.js       – xem trực tiếp ván đang đấu, danh sách ván hay
 *   disputes.js    – ván giải đấu mất kết nối: ban tổ chức công nhận / huỷ kết quả / cho đấu lại
 *   playban.js     – chống bỏ ván: ghi cư xử, cấm tìm trận tạm thời
 *   api.js         – số liệu máy chủ cho quản trị viên, API công khai chỉ đọc
 *   evals.js       – bộ nhớ điểm dùng chung cho phân tích ván bằng Rapfi (evalcache.js)
 *   avatar.js      – ảnh đại diện của tài khoản (kiểm ảnh: ../avatar.js; phục vụ ảnh: web.js)
 *   lobby.js       – ping (độ trễ máy chủ, số người online / số ván đang đấu), tìm kỳ thủ theo tên
 * Mỗi phần là một lớp chỉ chứa phương thức; ở đây gộp tất cả vào Hub.prototype.
 * Tin nhắn loại X do phương thức on_X xử lý. Không phụ thuộc thư viện WebSocket:
 * mỗi kết nối chỉ cần có conn.send(obj) và conn.ip.
 */
'use strict';
const { Hub } = require('./core.js');
const { Auth } = require('./auth.js');
const { Social } = require('./social.js');
const { History } = require('./history.js');
const { Devices } = require('./devices.js');
const { Rooms } = require('./rooms.js');
const { Challenges } = require('./challenges.js');
const { Matchmaking } = require('./matchmaking.js');
const { Clubs } = require('./clubs.js');
const { ClubManage } = require('./club-manage.js');
const { ClubTalk } = require('./club-talk.js');
const { ClubBattle } = require('./club-battle.js');
const { TourFun } = require('./tour-fun.js');
const { TourTpl } = require('./tour-tpl.js');
const { TourNotes } = require('./tour-notes.js');
const { TourOpts } = require('./tour-opts.js');
const { TourImg } = require('./tour-img.js');
const { TourArrange } = require('./tour-arrange.js');
const { Tournaments } = require('./tournaments.js');
const { TourRun } = require('./tour-run.js');
const { Arena } = require('./arena.js');
const { Bracket } = require('./bracket.js');
const { TourReg } = require('./tour-reg.js');
const { TourScore } = require('./tour-score.js');
const { TourManage } = require('./tour-manage.js');
const { TourPush } = require('./tourpush.js');
const { Admin } = require('./admin.js');
const { Watch } = require('./watch.js');
const { Profile } = require('./profile.js');
const { Playban } = require('./playban.js');
const { Disputes } = require('./disputes.js');
const { Api } = require('./api.js');
const { Evals } = require('./evals.js');
const { Lobby } = require('./lobby.js');
const { AvatarPart } = require('./avatar.js');
const { compareVersions, verifyGoogleToken } = require('./shared.js');

for (const part of [Auth, Social, History, Devices, Rooms, Challenges, Matchmaking, Clubs, ClubManage, ClubTalk, ClubBattle, Tournaments, TourRun, Arena, Bracket, TourReg, TourScore, TourManage, TourFun, TourTpl, TourNotes, TourOpts, TourImg, TourArrange, TourPush, Admin, Watch, Profile, Playban, Api, Disputes, Evals, Lobby, AvatarPart]) {
  for (const name of Object.getOwnPropertyNames(part.prototype)) {
    if (name === 'constructor') continue;
    if (Object.prototype.hasOwnProperty.call(Hub.prototype, name)) throw new Error('Hub: trùng phương thức ' + name);
    Object.defineProperty(Hub.prototype, name, Object.getOwnPropertyDescriptor(part.prototype, name));
  }
}

module.exports = { Hub, verifyGoogleToken, compareVersions };
