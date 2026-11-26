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
 *   corr.js        – Chơi theo lượt (C1): ván 1–7 ngày mỗi nước, lưu CSDL (store-corr.js), quét hết giờ mỗi phút
 *   broadcast.js   – Tường thuật giải đấu (C3): bàn đang đấu, bảng xếp hạng, kết quả gần đây cho caro/broadcast.html
 *   classroom.js   – Lớp học / Nghiên cứu (C2): chương, cây nước có biến, lời bình, dấu / mũi tên, theo dõi giáo viên
 *   api-v1.js      – API công khai v1 (C4): hồ sơ, biểu đồ điểm, ván gần đây, ván dạng chữ, giải, bảng xếp hạng, bài đố của ngày
 *   og.js          – dữ liệu thẻ xem trước link chia sẻ (Zalo / Messenger): ván, phòng, giải, CLB, hồ sơ
 *   progress.js    – tiến độ Giải đố / Storm / chuỗi ngày / huy hiệu trong tài khoản, Storm có kiểm + bảng tuần
 *   evals.js       – bộ nhớ điểm dùng chung cho phân tích ván bằng Rapfi (evalcache.js)
 *   avatar.js      – ảnh đại diện của tài khoản (kiểm ảnh: ../avatar.js; phục vụ ảnh: web.js)
 *   lobby.js       – ping (độ trễ máy chủ, số người online / số ván đang đấu), tìm kỳ thủ theo tên
 *   league.js      – Hạng đấu tuần: điểm từ ván tính điểm, nhóm 30 người, lên / xuống bậc cuối tuần (chốt tuần không lặp)
 *   fairplay.js    – Soát chơi đẹp: rời tab trong ván, hàng chờ quản trị viên xem (không xử phạt tự động)
 *   recap.js       – Tổng kết tháng / năm của chính mình (số ván, thắng đẹp nhất, chuỗi thắng, đối thủ gặp nhiều nhất)
 *   sources.js     – Nguồn người chơi (src / ref trong hello): người mới, D1 / D7, số ván theo nguồn – bảng cho quản trị viên
 *   insights.js    – Thống kê cá nhân: thắng / hoà / thua theo màu, luật, loại thời gian, sức đối thủ, khai cuộc, độ dài ván
 *   weekly-cup.js  – Giải tuần: máy chủ tự tạo một giải mỗi tuần (giờ theo múi giờ cấu hình), danh hiệu hạng 1–3
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
const { OTour } = require('./otour.js');
const { OTourRun } = require('./otour-run.js');
const { OTourUndo } = require('./otour-undo.js'); // huỷ kết quả trận giải offline (kiểm khoá trước, sửa sau)
const { OTourRace } = require('./otour-race.js');
const { OTourLeague } = require('./otour-league.js');
const { OTourSched } = require('./otour-sched.js');
const { OTourGames } = require('./otour-games.js');
const { OTourNext } = require('./otour-next.js');
const { OTourMulti } = require('./otour-multi.js');
const { OTourLazy } = require('./otour-lazy.js');
const { OTourDisc } = require('./otour-disc.js');
const { OTourAi } = require('./otour-ai.js');
const { Tournaments } = require('./tournaments.js');
const { TourRun } = require('./tour-run.js');
const { Arena } = require('./arena.js');
const { Bracket } = require('./bracket.js');
const { BracketMark } = require('./bracket-mark.js'); // trình bày riêng giải offline (vòng vớt, pool, đánh dấu đi tiếp)
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
const { Corr } = require('./corr.js'); // Chơi theo lượt (C1)
const { Broadcast } = require('./broadcast.js'); // Tường thuật giải đấu (C3)
const { Classroom } = require('./classroom.js'); // Lớp học / Nghiên cứu (C2)
const { ApiV1 } = require('./api-v1.js'); // API công khai v1 (C4 – HTTP ở ../api-v1-http.js)
const { Og } = require('./og.js'); // thẻ xem trước link chia sẻ (A3)
const { Progress } = require('./progress.js'); // tiến độ trong tài khoản + Puzzle Storm có kiểm (A5)
const { Evals } = require('./evals.js');
const { Lobby } = require('./lobby.js');
const { AvatarPart } = require('./avatar.js');
const { Insights } = require('./insights.js');
const { League } = require('./league.js');
const { Fairplay } = require('./fairplay.js');
const { Recap } = require('./recap.js');
const { Sources } = require('./sources.js'); // nguồn người chơi (Đợt 0)
const { WeeklyCup } = require('./weekly-cup.js'); // giải tuần tự động (Đợt 2)
const { compareVersions, verifyGoogleToken } = require('./shared.js');

for (const part of [Auth, Social, History, Devices, Rooms, Challenges, Matchmaking, Clubs, ClubManage, ClubTalk, ClubBattle, Tournaments, TourRun, Arena, Bracket, BracketMark, TourReg, TourScore, TourManage, TourFun, TourTpl, TourNotes, TourOpts, TourImg, TourArrange, OTour, OTourRun, OTourUndo, OTourRace, OTourLeague, OTourSched, OTourGames, OTourNext, OTourMulti, OTourLazy, OTourDisc, OTourAi, TourPush, Admin, Watch, Profile, Playban, Api, ApiV1, Corr, Broadcast, Classroom, Og, Progress, Disputes, Evals, Lobby, AvatarPart, Insights, League, Fairplay, Recap, Sources, WeeklyCup]) {
  for (const name of Object.getOwnPropertyNames(part.prototype)) {
    if (name === 'constructor') continue;
    if (Object.prototype.hasOwnProperty.call(Hub.prototype, name)) throw new Error('Hub: trùng phương thức ' + name);
    Object.defineProperty(Hub.prototype, name, Object.getOwnPropertyDescriptor(part.prototype, name));
  }
}

module.exports = { Hub, verifyGoogleToken, compareVersions };
