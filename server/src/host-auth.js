/*
 * Đăng nhập bằng dữ liệu khởi chạy CÓ CHỮ KÝ của Telegram Mini App / VK Mini App (Đợt 3 – docs/ke-hoach-tiep-can-toan-cau-…).
 * Hàm thuần, không đụng CSDL / mạng; hub/host-login.js gọi qua makeHostAuth(env).verify(…).
 *
 * Telegram (core.telegram.org/bots/webapps → "Validating data received via the Mini App", kiểm 26/11/2026):
 *   initData là chuỗi query (Telegram.WebApp.initData). data_check_string = MỌI trường nhận được trừ `hash` (kể cả
 *   `signature` nếu có – chỉ cách kiểm "bên thứ ba" bằng Ed25519 mới bỏ signature), dạng key=<giá trị đã giải mã>, sắp theo
 *   key, nối bằng "\n". secret_key = HMAC_SHA256(key = "WebAppData", msg = bot_token); hash hợp lệ khi
 *   hex(HMAC_SHA256(key = secret_key, msg = data_check_string)) == hash. Thêm: auth_date không cũ quá maxAge giây và không ở
 *   tương lai quá 5 phút; key trùng = từ chối (tránh hai cách hiểu một chuỗi).
 * VK (dev.vk.ru → Mini Apps → Launch params → "Подпись параметров запуска"; ví dụ chính thức
 *   github.com/VKCOM/vk-apps-launch-params/examples/node.js, kiểm 26/11/2026):
 *   chỉ lấy tham số có tên bắt đầu bằng `vk_`, sắp theo key, nối "key=encodeURIComponent(giá trị)" bằng "&";
 *   sign = base64url(HMAC_SHA256(key = khoá bí mật của app, msg = chuỗi đó)) không có "=" cuối. Tham số khác (host, hash,
 *   sign…) không nằm trong chữ ký → bị bỏ qua hoàn toàn. Thêm: vk_ts bắt buộc, không cũ quá maxAge, không ở tương lai quá
 *   5 phút; vk_app_id phải khớp VK_APP_ID nếu đặt; key vk_ trùng / sign trùng = từ chối.
 * So chữ ký bằng crypto.timingSafeEqual (độ dài kiểm trước bằng biểu thức chính quy – độ dài chữ ký là công khai, không ném lỗi).
 *
 * BÍ MẬT: token bot / khoá VK chỉ nằm trong closure của makeHostAuth – đối tượng trả về không có thuộc tính nào chứa chúng
 * (JSON.stringify / console.log / util.inspect đối tượng hub không làm lộ). Kết quả từ chối chỉ có lý do ngắn (why) cho
 * kiểm thử; hub không gửi why cho máy khách, không ghi dữ liệu nhận được vào log.
 *
 * API: makeHostAuth(env) → null (không bật nền tảng nào) | { providers: ['telegram', 'vk'?], maxAgeSec, verify(provider, data, now) };
 *      tgVerify(initData, botToken, opts), vkVerify(query, secret, opts), vkSign(query, secret) – xuất ra cho kiểm thử.
 */
'use strict';
const crypto = require('crypto');

const MAX_DATA = 4096; // initData / chuỗi tham số dài hơn thì từ chối luôn (thật chỉ vài trăm ký tự)
const FUTURE_SEC = 5 * 60; // đồng hồ máy người dùng / máy nền tảng lệch: cho phép tối đa 5 phút ở tương lai
const DAY_SEC = 24 * 3600;
const PROVIDERS = ['telegram', 'vk'];

const no = (why) => ({ ok: false, why });
const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();

/** So hai Buffer cùng độ dài, thời gian không phụ thuộc nội dung; khác độ dài thì false (không ném lỗi). */
function sameBytes(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length || !a.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Mốc thời gian (giây) hợp lệ so với now (ms): không cũ quá maxAge, không ở tương lai quá FUTURE_SEC. */
function freshTs(raw, now, maxAge) {
  if (typeof raw !== 'string' || !/^\d{1,12}$/.test(raw)) return 'ts_format';
  const ts = Number(raw), sec = Math.floor(now / 1000);
  if (ts > sec + FUTURE_SEC) return 'ts_future';
  if (sec - ts > maxAge) return 'ts_expired';
  return null;
}

/** Tên / chữ ngắn từ dữ liệu nền tảng: chuỗi, bỏ ký tự điều khiển, cắt độ dài. */
const shortStr = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '');

/**
 * Kiểm initData của Telegram. opts: { now (ms), maxAgeSec }.
 * → { ok: true, user: { id, firstName, username, lang }, authDate, ts (= authDate) } | { ok: false, why }.
 */
function tgVerify(initData, botToken, { now = Date.now(), maxAgeSec = DAY_SEC } = {}) {
  if (typeof botToken !== 'string' || !botToken) return no('disabled');
  if (typeof initData !== 'string' || !initData || initData.length > MAX_DATA) return no('format');
  const fields = new Map();
  let hash = null;
  for (const [k, v] of new URLSearchParams(initData)) {
    if (k === 'hash') {
      if (hash !== null) return no('dup');
      hash = v;
      continue;
    }
    if (fields.has(k)) return no('dup');
    fields.set(k, v);
  }
  if (hash === null) return no('no_hash');
  if (!/^[0-9a-f]{64}$/i.test(hash)) return no('hash_format');
  // Sắp theo key (so từng đơn vị mã – key của Telegram là chữ thường ASCII, trùng thứ tự byte)
  const dcs = [...fields.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((k) => k + '=' + fields.get(k)).join('\n');
  const secret = hmac('WebAppData', botToken);
  if (!sameBytes(hmac(secret, dcs), Buffer.from(hash.toLowerCase(), 'hex'))) return no('sig');
  // Chỉ đọc nội dung SAU khi chữ ký đúng
  const old = freshTs(fields.get('auth_date'), now, maxAgeSec);
  if (old) return no(old);
  let u;
  try { u = JSON.parse(fields.get('user') || 'null'); } catch (e) { return no('user_json'); }
  if (!u || typeof u !== 'object' || !Number.isSafeInteger(u.id) || u.id <= 0) return no('user');
  return {
    ok: true,
    user: { id: String(u.id), firstName: shortStr(u.first_name, 64), username: shortStr(u.username, 64), lang: shortStr(u.language_code, 16) },
    authDate: Number(fields.get('auth_date')),
    ts: Number(fields.get('auth_date')), // mốc chung với VK (hub/host-login.js – chống phát lại)
  };
}

/** Tách chuỗi tham số VK như ví dụ chính thức (giải mã từng phần) → { sign, pairs } | { why }. */
function vkParse(query) {
  if (typeof query !== 'string' || !query || query.length > MAX_DATA) return { why: 'format' };
  let sign = null;
  const pairs = new Map();
  for (const seg of query.replace(/^\?/, '').split('&')) {
    if (!seg) continue;
    const i = seg.indexOf('=');
    let k, v;
    try {
      k = decodeURIComponent(i < 0 ? seg : seg.slice(0, i));
      v = decodeURIComponent(i < 0 ? '' : seg.slice(i + 1));
    } catch (e) { return { why: 'format' }; }
    if (k === 'sign') {
      if (sign !== null) return { why: 'dup' };
      sign = v;
    } else if (k.startsWith('vk_')) {
      if (pairs.has(k)) return { why: 'dup' };
      pairs.set(k, v);
    } // tham số khác (host, hash, room…): không nằm trong chữ ký – bỏ qua
  }
  return { sign, pairs };
}

/** Chữ ký VK tính được cho các tham số vk_ của chuỗi (base64url, không "="); null nếu không có tham số vk_ nào. */
function vkSign(query, secret) {
  const p = vkParse(query);
  if (p.why || !p.pairs.size) return null;
  return vkSignPairs(p.pairs, secret);
}
function vkSignPairs(pairs, secret) {
  const str = [...pairs.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((k) => k + '=' + encodeURIComponent(pairs.get(k))).join('&');
  return hmac(secret, str).toString('base64url');
}

/**
 * Kiểm tham số khởi chạy VK. opts: { now (ms), maxAgeSec, appId ('' = không kiểm) }.
 * → { ok: true, user: { id, lang }, ts } | { ok: false, why }.
 */
function vkVerify(query, secret, { now = Date.now(), maxAgeSec = DAY_SEC, appId = '' } = {}) {
  if (typeof secret !== 'string' || !secret) return no('disabled');
  const p = vkParse(query);
  if (p.why) return no(p.why);
  if (p.sign === null) return no('no_sign');
  const sign = p.sign.replace(/=$/, ''); // ví dụ chính thức bỏ "=" cuối; nhận cả khi còn
  if (!/^[A-Za-z0-9_-]{43}$/.test(sign)) return no('sign_format'); // 32 byte → 43 ký tự base64url
  if (!p.pairs.size) return no('no_params');
  if (!sameBytes(Buffer.from(vkSignPairs(p.pairs, secret)), Buffer.from(sign))) return no('sig');
  const old = freshTs(p.pairs.get('vk_ts'), now, maxAgeSec);
  if (old) return no(old);
  if (appId && p.pairs.get('vk_app_id') !== appId) return no('app_id');
  const id = p.pairs.get('vk_user_id');
  if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id)) return no('user');
  return { ok: true, user: { id, firstName: '', username: '', lang: shortStr(p.pairs.get('vk_language'), 16) }, ts: Number(p.pairs.get('vk_ts')) };
}

/**
 * Đọc cấu hình từ biến môi trường. Không đặt bí mật nào → null (tính năng tắt hẳn).
 *   TELEGRAM_BOT_TOKEN – token của bot (BotFather); VK_APP_SECRET – khoá bí mật (Защищённый ключ) của VK Mini App;
 *   VK_APP_ID – mã app VK (tuỳ chọn, đặt thì vk_app_id phải khớp); HOST_AUTH_MAX_AGE – số giây dữ liệu còn hiệu lực
 *   (60…86400, mặc định 86400 = 24 giờ – chỉ rút ngắn được, không kéo dài).
 * log(msg): báo cấu hình sai (KHÔNG BAO GIỜ kèm giá trị bí mật).
 */
function makeHostAuth(env = process.env, log = (m) => console.warn(m)) {
  let tgToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const vkSecret = String(env.VK_APP_SECRET || '').trim();
  let vkAppId = String(env.VK_APP_ID || '').trim();
  // Token bot có dạng <số>:<chuỗi>; sai dạng thì tắt Telegram (không in giá trị)
  if (tgToken && !/^\d{3,20}:[A-Za-z0-9_-]{20,100}$/.test(tgToken)) {
    log('[host-auth] TELEGRAM_BOT_TOKEN sai định dạng – tắt đăng nhập bằng Telegram');
    tgToken = '';
  }
  if (vkAppId && !/^\d{1,20}$/.test(vkAppId)) {
    log('[host-auth] VK_APP_ID không phải số – bỏ qua (không kiểm vk_app_id)');
    vkAppId = '';
  }
  let maxAgeSec = DAY_SEC;
  if (env.HOST_AUTH_MAX_AGE !== undefined && env.HOST_AUTH_MAX_AGE !== '') {
    const n = Number(env.HOST_AUTH_MAX_AGE);
    if (Number.isInteger(n) && n >= 60 && n <= DAY_SEC) maxAgeSec = n;
    else log('[host-auth] HOST_AUTH_MAX_AGE phải là số giây 60…86400 – dùng mặc định 86400');
  }
  const providers = [];
  if (tgToken) providers.push('telegram');
  if (vkSecret) providers.push('vk');
  if (!providers.length) return null;
  return Object.freeze({
    providers: Object.freeze(providers),
    maxAgeSec,
    /** Kiểm dữ liệu khởi chạy của nền tảng provider. */
    verify(provider, data, now = Date.now()) {
      if (provider === 'telegram' && tgToken) return tgVerify(data, tgToken, { now, maxAgeSec });
      if (provider === 'vk' && vkSecret) return vkVerify(data, vkSecret, { now, maxAgeSec, appId: vkAppId });
      return no('disabled');
    },
  });
}

module.exports = { PROVIDERS, MAX_DATA, FUTURE_SEC, makeHostAuth, tgVerify, vkVerify, vkSign, sameBytes };
