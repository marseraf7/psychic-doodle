/*
 * Kiểm token người dùng CrazyGames (Full Launch – làm sẵn, TẮT mặc định; bật bằng CRAZYGAMES_GAME_ID – host-auth.js).
 * Theo docs.crazygames.com → SDK → User → "Get user token" / "Verify the token" (đọc 27/11/2026):
 *   – máy khách gọi SDK.user.getUserToken({ signingKeyType: 'IN_GAME_AUTH' }) → JWT, sống 1 giờ (SDK tự làm mới);
 *   – khoá công khai: JWKS https://userportal.crazygames.com/.well-known/jwks.json, kid 'ingame-auth'; ví dụ chính thức kiểm
 *     với algorithms: ['RS256']; "it may change" → nhớ đệm, gặp kid lạ thì tải lại;
 *   – payload: userId, gameId, username, profilePictureUrl, iat, exp; máy chủ PHẢI kiểm gameId khớp game của mình;
 *   – định danh là userId trong token đã kiểm (không dùng username, không dùng __dangerousUserId của getUser()).
 * Chỉ nhận đúng alg 'RS256' + kid 'ingame-auth' (không nhận 'none', HS*, khoá cũ IN_GAME_AUTH_LEGACY): không có đường nào
 * để token tự chọn thuật toán / khoá. Kiểm chữ ký TRƯỚC, đọc nội dung SAU. Không thêm thư viện: node:crypto đọc JWK.
 * Không ghi token / payload vào log.
 *
 * API: makeCgVerifier({ gameId, fetchJwks?, now? }) → { verify(token, now) → Promise<{ ok, user: { id, firstName, username,
 *      lang }, ts } | { ok: false, why }> }; parseJwt(token) xuất ra cho kiểm thử.
 */
'use strict';
const crypto = require('crypto');

const JWKS_URL = 'https://userportal.crazygames.com/.well-known/jwks.json';
const KID = 'ingame-auth';
const MAX_TOKEN = 4096; // JWT thật ~1 KB
const MAX_JWKS = 64 * 1024;
const JWKS_TTL = 60 * 60 * 1000; // tải lại khoá mỗi giờ
const REFETCH_GAP = 60 * 1000; // kid lạ / tải lỗi: tải lại tối đa mỗi phút (token rác không làm máy chủ gọi CrazyGames liên tục)
const SKEW_SEC = 60; // đồng hồ lệch: exp cho thêm 60 giây, iat ở tương lai tối đa 5 phút
const FUTURE_SEC = 5 * 60;

const no = (why) => ({ ok: false, why });
const shortStr = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '');

/** Tách JWT → { header, payload, signed, sig } | { why }. Chưa kiểm chữ ký. */
function parseJwt(token) {
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN) return { why: 'format' };
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return { why: 'format' };
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(m[2], 'base64url').toString('utf8'));
  } catch (e) { return { why: 'json' }; }
  if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object' || Array.isArray(payload)) return { why: 'json' };
  return { header, payload, signed: m[1] + '.' + m[2], sig: Buffer.from(m[3], 'base64url') };
}

/** Tải JWKS thật (Node 18+ có fetch). Giới hạn thời gian + dung lượng. */
async function fetchJwksHttp() {
  const r = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('jwks_http');
  const text = await r.text();
  if (text.length > MAX_JWKS) throw new Error('jwks_size');
  return JSON.parse(text);
}

/** JWKS → Map(kid → KeyObject) chỉ gồm khoá RSA dùng để ký (RS256 nếu có ghi alg). */
function keysOf(jwks) {
  const out = new Map();
  for (const k of (jwks && Array.isArray(jwks.keys) ? jwks.keys : []).slice(0, 20)) {
    if (!k || k.kty !== 'RSA' || typeof k.kid !== 'string' || (k.use && k.use !== 'sig') || (k.alg && k.alg !== 'RS256')) continue;
    // n ≥ 2048 bit (342 ký tự base64url), e ngắn: khoá hỏng / yếu thì bỏ, không đưa vào node:crypto
    if (typeof k.n !== 'string' || !/^[A-Za-z0-9_-]{342,1400}$/.test(k.n) || typeof k.e !== 'string' || !/^[A-Za-z0-9_-]{1,8}$/.test(k.e)) continue;
    try { out.set(k.kid, crypto.createPublicKey({ key: { kty: 'RSA', n: k.n, e: k.e }, format: 'jwk' })); } catch (e) { /* khoá hỏng: bỏ */ }
  }
  return out;
}

function makeCgVerifier({ gameId, fetchJwks = fetchJwksHttp, log = (m) => console.warn(m) }) {
  const game = String(gameId || '').trim();
  let keys = new Map(), loadedAt = 0, triedAt = 0, inflight = null;

  /** Khoá theo kid: nhớ đệm JWKS_TTL; kid lạ / hết hạn thì tải lại (một lượt tải chung, cách nhau ≥ REFETCH_GAP). */
  async function keyFor(kid, now) {
    const fresh = now - loadedAt < JWKS_TTL;
    if (keys.has(kid) && fresh) return keys.get(kid);
    if (now - triedAt >= REFETCH_GAP) {
      triedAt = now;
      inflight = inflight || Promise.resolve().then(fetchJwks).then((j) => {
        const k = keysOf(j);
        if (k.size) { keys = k; loadedAt = now; }
      }).catch(() => { log('[crazygames-auth] không tải được khoá công khai của CrazyGames'); }).finally(() => { inflight = null; });
    }
    if (inflight) await inflight;
    return keys.get(kid) || null; // tải lỗi: vẫn dùng khoá cũ đã có (nếu kid khớp)
  }

  async function verify(token, now = Date.now()) {
    if (!game) return no('disabled');
    const p = parseJwt(token);
    if (p.why) return no(p.why);
    if (p.header.alg !== 'RS256' || p.header.kid !== KID) return no('alg');
    if (p.sig.length < 128 || p.sig.length > 1024) return no('sig_format');
    const key = await keyFor(KID, now);
    if (!key) return no('no_key');
    let ok = false;
    try { ok = crypto.verify('sha256', Buffer.from(p.signed), { key, padding: crypto.constants.RSA_PKCS1_PADDING }, p.sig); } catch (e) { ok = false; }
    if (!ok) return no('sig');
    // Chỉ đọc nội dung SAU khi chữ ký đúng
    const c = p.payload, sec = Math.floor(now / 1000);
    if (!Number.isSafeInteger(c.exp) || c.exp + SKEW_SEC < sec) return no('expired');
    if (!Number.isSafeInteger(c.iat) || c.iat > sec + FUTURE_SEC) return no('iat');
    if (String(c.gameId) !== game) return no('game');
    if (typeof c.userId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(c.userId)) return no('user');
    return { ok: true, user: { id: c.userId, firstName: shortStr(c.username, 64), username: shortStr(c.username, 64), lang: '' }, ts: c.iat };
  }
  return Object.freeze({ verify });
}

module.exports = { makeCgVerifier, parseJwt, keysOf, JWKS_URL, KID };
