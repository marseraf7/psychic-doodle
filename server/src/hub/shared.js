/* Hằng số và hàm tiện ích dùng chung cho các phần của Hub. */
'use strict';
const crypto = require('crypto');

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const OFFLINE_FORFEIT_MS = 90 * 1000; // mất kết nối quá 90s khi đang đánh -> xử thua
const NEXT_GAME_MS = 4000; // Bo3/Bo5: ván sau tự bắt đầu sau 4s
const INVITE_TTL_MS = 60 * 1000;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const SEAT_IDLE_MS = 10 * 60 * 1000;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const TIME_LIMITS = [0, 10, 20, 30]; // giây mỗi nước, 0 = không giới hạn
const OPENINGS = ['free', 'swap2']; // luật khai cuộc
const DRAW_COOLDOWN_MS = 30 * 1000; // bị từ chối hoà thì 30 giây sau mới được xin lại
// Chống cày Elo bằng 2 tài khoản: ván kết thúc sớm (đầu hàng, hoà, rời phòng…) dưới 10 nước
// không tính điểm, và mỗi cặp chỉ tính điểm tối đa 5 ván mỗi ngày.
const MIN_RATED_MOVES = 10;
const MAX_RATED_PER_PAIR_DAY = 5;
const QUICK = ['hello', 'nice', 'gg', 'rematch', 'hurry', 'oops', 'thanks', 'wow']; // câu chat nhanh trong phòng
const REPORT_REASONS = ['spam', 'abuse', 'cheat', 'other'];
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,24}$/i;
const RESET_TTL_MS = 15 * 60 * 1000;
const VERIFY_TTL_MS = 30 * 60 * 1000; // mã xác minh email có hiệu lực 30 phút
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
// Email xác minh địa chỉ (chỉ email đã xác minh mới dùng để khôi phục mật khẩu)
const VERIFY_MAIL = {
  vi: { subject: 'Mã xác minh email Cờ Caro', body: (u, c) => `Xin chào ${u},\n\nMã xác minh email của bạn là: ${c}\nMã có hiệu lực trong 30 phút.\n\nNếu bạn không thêm email này vào tài khoản Cờ Caro, hãy bỏ qua thư này.` },
  en: { subject: 'Caro email verification code', body: (u, c) => `Hi ${u},\n\nYour email verification code is: ${c}\nIt expires in 30 minutes.\n\nIf you did not add this email to a Caro account, you can ignore this message.` },
  ru: { subject: 'Код подтверждения почты Каро', body: (u, c) => `Здравствуйте, ${u}!\n\nВаш код подтверждения почты: ${c}\nКод действует 30 минут.\n\nЕсли вы не добавляли эту почту в аккаунт Каро, просто проигнорируйте письмо.` },
  zh: { subject: '五子棋 Caro 邮箱验证码', body: (u, c) => `${u}，你好：\n\n你的邮箱验证码是：${c}\n验证码 30 分钟内有效。\n\n如果你没有在 Caro 账号中添加此邮箱，请忽略此邮件。` },
};
// Email đặt lại mật khẩu theo ngôn ngữ người dùng đang chọn
const RESET_MAIL = {
  vi: { subject: 'Mã đặt lại mật khẩu Cờ Caro', body: (u, c) => `Xin chào ${u},\n\nMã đặt lại mật khẩu của bạn là: ${c}\nMã có hiệu lực trong 15 phút.\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.` },
  en: { subject: 'Caro password reset code', body: (u, c) => `Hi ${u},\n\nYour password reset code is: ${c}\nIt expires in 15 minutes.\n\nIf you did not request this, you can ignore this email.` },
  ru: { subject: 'Код для сброса пароля Каро', body: (u, c) => `Здравствуйте, ${u}!\n\nВаш код для сброса пароля: ${c}\nКод действует 15 минут.\n\nЕсли вы не запрашивали сброс, просто проигнорируйте это письмо.` },
  zh: { subject: '五子棋 Caro 密码重置验证码', body: (u, c) => `${u}，你好：\n\n你的密码重置验证码是：${c}\n验证码 15 分钟内有效。\n\n如果这不是你本人的操作，请忽略此邮件。` },
};
/** Lựa chọn thời gian / luật khai cuộc gửi từ client: giới hạn mỗi nước, đồng hồ tổng '3+2', luật khai cuộc. */
function cleanTc({ timeLimit, clock, opening } = {}, CLOCKS = require('../rating.js').CLOCKS) {
  const ck = CLOCKS.includes(clock) ? clock : null;
  return {
    timeLimit: ck ? 0 : TIME_LIMITS.includes(Number(timeLimit)) ? Number(timeLimit) : 0,
    clock: ck,
    opening: OPENINGS.includes(opening) ? opening : 'free',
  };
}
const cleanText = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

const { isOffensiveName, mask } = require('../moderation.js');
/** Chữ công khai (mô tả CLB / giải, thông báo): che từ tục. */
const cleanPublicText = (s, max) => mask(cleanText(s, max));
/** Tên người chơi / CLB / giải: có từ tục thì báo lỗi bad_name. */
function cleanPublicName(s) {
  const n = cleanName(s);
  if (n && isOffensiveName(n)) throw require('../msg.js').E('bad_name');
  return n;
}
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const userPid = (uid) => 'u_' + uid;
const uidOf = (pid) => (pid && pid.startsWith('u_') ? pid.slice(2) : null);

/** So sánh phiên bản dạng 1.2.3: âm nếu a < b. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Xác minh ID token của Google Identity Services qua API tokeninfo. */
async function verifyGoogleToken(credential, clientId) {
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!r.ok) throw new Error('invalid');
  const j = await r.json();
  if (j.aud !== clientId) throw new Error('aud');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(j.iss)) throw new Error('iss');
  if (Number(j.exp) * 1000 < Date.now()) throw new Error('exp');
  return { sub: j.sub, email: j.email_verified === 'true' || j.email_verified === true ? j.email : '', name: j.name };
}

module.exports = {
  USERNAME_RE, OPENINGS, cleanTc, cleanPublicText, cleanPublicName, OFFLINE_FORFEIT_MS, NEXT_GAME_MS, INVITE_TTL_MS, ROOM_IDLE_MS, SEAT_IDLE_MS, FAIL_WINDOW_MS, TIME_LIMITS, DRAW_COOLDOWN_MS, MIN_RATED_MOVES, MAX_RATED_PER_PAIR_DAY, QUICK, REPORT_REASONS, EMAIL_RE, RESET_TTL_MS, VERIFY_TTL_MS, sha256, VERIFY_MAIL, RESET_MAIL, cleanText, cleanName, userPid, uidOf, compareVersions, verifyGoogleToken,
};
