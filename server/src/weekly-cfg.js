/*
 * Cấu hình + chữ mô tả của "Giải tuần" (hub/weekly-cup.js) – hàm thuần, kiểm thử được không cần máy chủ.
 *   parseCfg(env) → { cfg, warn } – đọc biến môi trường (giá trị sai: dùng mặc định, warn ghi lý do để log một lần):
 *     WEEKLY_CUP=0          tắt (mặc định bật)
 *     WEEKLY_CUP_AT         "sun 20:00" – thứ (sun mon tue wed thu fri sat, viết đủ cũng được) + giờ HH:MM
 *     WEEKLY_CUP_TZ         múi giờ IANA (mặc định Asia/Ho_Chi_Minh)
 *     WEEKLY_CUP_FORMAT     arena | swiss (Thụy Sĩ = giải theo giai đoạn, một giai đoạn Thụy Sĩ)
 *     WEEKLY_CUP_MINUTES    thời lượng Arena (15 20 30 45 60 90 120)
 *     WEEKLY_CUP_RULE       vn | free | std | renju (caro/rules.js)
 *     WEEKLY_CUP_CLOCK      đồng hồ "phút+giây" (caro/timectl.js), vd. 3+2
 *   cfgText(cfg) → "sun 20:00 Asia/Ho_Chi_Minh · arena 60' · vn · 3+2" (dòng trạng thái cho quản trị viên).
 *   tourName(n) / tourDesc(cfg, n, at) → tên trung tính hai thứ tiếng + mô tả (định dạng CaroRich – caro/rich-text.js).
 */
'use strict';
const LT = require('./local-time.js');
const TC = require('../../caro/timectl.js');
const { RULES } = require('../../caro/rules.js');

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const { ARENA_MINUTES } = require('./hub/tournaments.js');
const DEF = { on: true, day: 0, hh: 20, mm: 0, tz: 'Asia/Ho_Chi_Minh', format: 'arena', minutes: 60, rule: 'vn', clock: '3+2' };
const OFF = ['0', 'off', 'false', 'no'];
const ON = ['1', 'on', 'true', 'yes'];

function parseCfg(env = {}) {
  const cfg = { ...DEF };
  const warn = [];
  const get = (k) => String(env[k] == null ? '' : env[k]).trim();
  const bad = (k, v) => warn.push(`${k}="${v}" không hợp lệ – dùng mặc định`);
  const on = get('WEEKLY_CUP').toLowerCase();
  if (OFF.includes(on)) cfg.on = false;
  else if (on && !ON.includes(on)) bad('WEEKLY_CUP', on);
  const at = get('WEEKLY_CUP_AT');
  if (at) {
    const m = /^([a-z]{3})[a-z]*\s+(\d{1,2}):(\d{2})$/i.exec(at);
    const day = m ? DAYS.indexOf(m[1].toLowerCase()) : -1;
    if (m && day >= 0 && Number(m[2]) < 24 && Number(m[3]) < 60) Object.assign(cfg, { day, hh: Number(m[2]), mm: Number(m[3]) });
    else bad('WEEKLY_CUP_AT', at);
  }
  const tz = get('WEEKLY_CUP_TZ');
  if (tz) { if (LT.validZone(tz)) cfg.tz = tz; else bad('WEEKLY_CUP_TZ', tz); }
  const fmt = get('WEEKLY_CUP_FORMAT').toLowerCase();
  if (fmt) { if (fmt === 'arena' || fmt === 'swiss') cfg.format = fmt; else bad('WEEKLY_CUP_FORMAT', fmt); }
  const min = get('WEEKLY_CUP_MINUTES');
  if (min) { if (ARENA_MINUTES.includes(Number(min))) cfg.minutes = Number(min); else bad('WEEKLY_CUP_MINUTES', min); }
  const rule = get('WEEKLY_CUP_RULE').toLowerCase();
  if (rule) { if (RULES.includes(rule)) cfg.rule = rule; else bad('WEEKLY_CUP_RULE', rule); }
  const clock = get('WEEKLY_CUP_CLOCK');
  if (clock) { if (TC.isClock(clock)) cfg.clock = clock; else bad('WEEKLY_CUP_CLOCK', clock); }
  return { cfg, warn };
}

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (c) => `${pad(c.hh)}:${pad(c.mm)}`;
const cfgText = (c) => `${DAYS[c.day]} ${hhmm(c)} ${c.tz} · ${c.format}${c.format === 'arena' ? ` ${c.minutes}'` : ''} · ${c.rule} · ${c.clock}`;

// Không bắt đầu bằng "Giải": thông báo sẵn có viết "Giải {name} đã bắt đầu" (msg.js) – tránh "Giải Giải tuần…"
const tourName = (n) => `Cúp tuần Caro #${n} · Weekly Cup`;

const RULE_TXT = {
  vn: ['Caro Việt Nam (năm quân bị chặn hai đầu không thắng)', 'Vietnamese Caro (five blocked at both ends does not win)'],
  free: ['Gomoku tự do', 'Freestyle Gomoku'],
  std: ['Gomoku tiêu chuẩn (đúng năm quân)', 'Standard Gomoku (exactly five)'],
  renju: ['Renju', 'Renju'],
};

/** Thứ + giờ theo múi giờ cấu hình, vd. "Chủ Nhật 20:00 (GMT+7)" – trang giải và Trang chủ hiện thêm theo giờ máy người xem. */
function whenText(c, locale, at) {
  // Một Chủ nhật bất kỳ (4/1/2026) + c.day ngày: chỉ để lấy tên thứ
  const day = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 0, 4 + c.day, 12));
  // Độ lệch UTC đúng vào ngày đấu (múi có giờ mùa hè: GMT+1 hay GMT+2); c.tz đã kiểm hợp lệ ở parseCfg
  const off = new Intl.DateTimeFormat('en-US', { timeZone: c.tz, timeZoneName: 'shortOffset' }).formatToParts(at)
    .find((p) => p.type === 'timeZoneName').value;
  return `${day[0].toUpperCase() + day.slice(1)} ${hhmm(c)} (${c.tz}, ${off})`;
}

function tourDesc(c, n, at = Date.now()) {
  const [rv, re] = RULE_TXT[c.rule];
  const fv = c.format === 'arena' ? `Arena ${c.minutes} phút (xong ván là được ghép ván mới)` : 'Hệ Thụy Sĩ (mỗi vòng gặp người cùng điểm)';
  const fe = c.format === 'arena' ? `Arena, ${c.minutes} minutes (a new game is paired as soon as yours ends)` : 'Swiss system (each round you meet a player on the same score)';
  return [
    `## Cúp tuần Caro #${n}`,
    `- **Thể thức:** ${fv} · ${rv} · đồng hồ ${c.clock} · tính Elo`,
    `- **Giờ đấu:** ${whenText(c, 'vi-VN', at)} – mỗi tuần một lần, trang giải hiện theo giờ máy của bạn`,
    `- **Giải thưởng:** danh hiệu trên hồ sơ cho hạng 1–3 (Vô địch, Á quân, Hạng ba Cúp tuần Caro #${n})`,
    '- **Không thu phí, không cá cược.** Đăng ký miễn phí bằng tài khoản trong game.',
    '- **Chơi công bằng:** không dùng máy, phần mềm hay người khác hỗ trợ khi đang đấu.',
    '',
    `## Weekly Cup #${n}`,
    `- **Format:** ${fe} · ${re} · ${c.clock} clock · rated`,
    `- **Start:** ${whenText(c, 'en-GB', at)} – every week; the tournament page shows your device's time`,
    `- **Prize:** a title on your profile for places 1–3 (Champion, Runner-up, Third place of Weekly Cup #${n})`,
    '- **No entry fee, no betting.** Free to join with a game account.',
    '- **Fair play:** no engines, software or outside help during games.',
  ].join('\n');
}

module.exports = { parseCfg, cfgText, tourName, tourDesc, DEF, DAYS };
