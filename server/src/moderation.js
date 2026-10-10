/*
 * Kiểm duyệt nội dung (học theo Lichess: security/Flood, shutup/Analyser, security/PasswordCheck – chỉ lấy ý tưởng):
 *  - weakPassword: chặn mật khẩu phổ biến và mật khẩu trùng tên đăng nhập.
 *  - badWords / mask / isOffensiveName: lọc từ tục tiếng Việt, Anh, Nga, Trung; chống viết lách (@→a, 0→o, chữ Kirin
 *    giả chữ Latin, chèn dấu chấm / gạch giữa các chữ).
 *  - Flood: tin nhắn dồn dập (5 tin trong 10 giây) hoặc lặp lại gần giống 2 tin trước thì bị từ chối.
 * Không gọi dịch vụ ngoài.
 */
'use strict';

// ---------------------------------------------------------------- Mật khẩu
const COMMON_PASSWORDS = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', '0123456789', '12345', '111111', '000000', '666666', '888888',
  '999999', '123123', '123321', '654321', '112233', '121212', '159753', '147258', '147258369', '987654321', '1q2w3e', '1q2w3e4r',
  '1qaz2wsx', 'qwerty', 'qwerty123', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbnm', 'password', 'password1', 'passw0rd',
  'abc123', 'abcdef', 'abcd1234', 'iloveyou', 'admin', 'admin123', 'welcome', 'monkey', 'dragon', 'master', 'letmein',
  'football', 'baseball', 'superman', 'sunshine', 'princess', 'starwars', 'trustno1', 'shadow', 'michael', 'whatever',
  'caro', 'caro123', 'caro1234', 'caroxo', 'gomoku', 'chess123', 'lichess', 'chesscom', 'matkhau', 'matkhau123', 'anhyeuem',
  'emyeuanh', 'yeuem', 'yeuanh', 'vietnam', 'vietnam123', 'hanoi', 'saigon', 'pass1234', 'qazwsx', 'zaq12wsx', 'aaaaaa',
  'aaaaaaaa', '11111111', '00000000', '88888888', '520520', '5201314', 'woaini', 'woaini1314', 'parol', 'parol123',
  'privet', 'qwe123', 'zxc123', 'asd123', 'qweasd', 'qweasdzxc', '1q2w3e4r5t', 'qwerty1', 'iloveu', 'loveyou',
]);
function weakPassword(password, username) {
  const p = String(password || '').toLowerCase();
  if (COMMON_PASSWORDS.has(p)) return true;
  if (username && p === String(username).toLowerCase()) return true;
  return /^(.)\1+$/.test(p); // một ký tự lặp lại
}

// ---------------------------------------------------------------- Từ tục
// Tiếng Việt: so trên chữ có dấu (tránh nhầm "lon" = cái lon, "chó" = con vật…)
const VI = ['địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đéo', 'đĩ', 'đmm', 'đcm', 'đkm', 'clgt', 'vãi lồn', 'vcl', 'vkl', 'cl', 'óc chó', 'súc vật', 'mặt lồn', 'con đĩ', 'thằng chó'];
// Tiếng Anh: so trên chữ đã "latin hoá" (chống leetspeak)
const EN = ['fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'asshole', 'dickhead', 'bastard'];
// Tiếng Nga: gốc từ (khớp trong từ)
const RU = ['хуй', 'хуе', 'пизд', 'ебат', 'ебан', 'ёб', 'бля', 'сука', 'суки', 'мудак', 'пидор', 'пидар', 'шлюх', 'гандон'];
// Tiếng Trung: khớp chuỗi
const ZH = ['操你', '肏', '傻逼', '傻b', '妈的', '他妈', '你妈', '屌', '贱人', '婊子', '草泥马', '王八蛋', '狗日'];

const LEET = { '@': 'a', '4': 'a', '$': 's', '5': 's', '0': 'o', '1': 'i', '!': 'i', '3': 'e', '7': 't', '8': 'b',
  'а': 'a', 'е': 'e', 'о': 'o', 'с': 'c', 'х': 'x', 'у': 'y', 'к': 'k', 'р': 'p', 'ı': 'i' };
const latinify = (s) => [...s].map((c) => LEET[c] || c).join('');
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Ranh giới từ cho chữ có dấu (\b của JS chỉ hiểu chữ Latin không dấu)
const L = '[\\p{L}\\p{N}]';
const wordRe = (words) => new RegExp(`(?<!${L})(?:${words.map(esc).join('|')})(?!${L})`, 'giu');
const VI_RE = wordRe(VI);
const EN_RE = wordRe(EN);
const RU_RE = new RegExp(`(?:${RU.map(esc).join('|')})`, 'giu');
const ZH_RE = new RegExp(`(?:${ZH.map(esc).join('|')})`, 'giu');

/** Bỏ ký tự chèn giữa các chữ để lách luật ("f.u.c.k", "đ_ị_t") và chữ lặp ("fuuuck"). */
function squash(s) {
  return s.replace(/(?<=\p{L})[._\-*/\\|]+(?=\p{L})/gu, '').replace(/(\p{L})\1{2,}/gu, '$1');
}

/** Danh sách từ tục tìm thấy (rỗng = sạch). */
function badWords(text) {
  const raw = String(text || '').slice(0, 2000).toLowerCase().normalize('NFC');
  const s = squash(raw);
  const found = [];
  for (const re of [VI_RE, RU_RE, ZH_RE]) for (const m of s.matchAll(re)) found.push(m[0]);
  for (const m of latinify(s).matchAll(EN_RE)) found.push(m[0]);
  return found;
}

/** Thay từ tục bằng dấu * (giữ chữ cái đầu) – dùng cho tin nhắn. */
function mask(text) {
  let out = String(text || '');
  if (!badWords(out).length) return out;
  const star = (w) => w[0] + '*'.repeat(Math.max(2, [...w].length - 1));
  for (const re of [VI_RE, RU_RE, ZH_RE]) out = out.replace(re, star);
  // Từ tiếng Anh viết lách: so vị trí trên bản latin hoá (cùng độ dài) rồi che ở bản gốc
  const lat = latinify(out.toLowerCase());
  const parts = [...out];
  for (const m of lat.matchAll(EN_RE)) {
    const start = [...lat.slice(0, m.index)].length, len = [...m[0]].length;
    for (let i = start + 1; i < start + len; i++) parts[i] = '*';
  }
  out = parts.join('');
  // Còn sót (viết lách kiểu "đ.ị.t", "fuuuck"): che cả từ chứa nó
  if (badWords(out).length) out = out.split(/(\s+)/).map((w) => (badWords(w).length ? star(w) : w)).join('');
  return out;
}

/** Tên (người chơi, câu lạc bộ, giải đấu) có từ tục không. */
const isOffensiveName = (name) => badWords(name).length > 0;

// ---------------------------------------------------------------- Chống tin nhắn dồn / lặp
/** Khoảng cách Levenshtein có giới hạn (dừng sớm khi vượt max). */
function levenshteinBelow(a, b, max) {
  if (Math.abs(a.length - b.length) >= max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best >= max) return false;
    prev = cur;
  }
  return prev[b.length] < max;
}

class Flood {
  /** Tối đa limit tin trong windowMs; nhớ tối đa maxSources người gửi gần nhất. */
  constructor({ limit = 5, windowMs = 10000, maxSources = 5000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxSources = maxSources;
    this.src = new Map(); // nguồn -> [{ text, at }] (mới nhất trước)
  }

  /** Trả về null nếu được gửi, hoặc 'too_fast' / 'duplicate'. */
  check(source, text, now = Date.now()) {
    const list = (this.src.get(source) || []).filter((m) => now - m.at < 60000);
    const t = String(text).toLowerCase().trim();
    const dup = list.slice(0, 2).some((m) => {
      if (m.text === t) return true;
      if (Math.min(m.text.length, t.length) < 6) return false; // câu ngắn ("ok", "ừ") chỉ tính trùng y hệt
      return levenshteinBelow(m.text, t, Math.max(2, Math.min(m.text.length, t.length) >> 3));
    });
    if (dup) return 'duplicate';
    if (list.length >= this.limit && now - list[this.limit - 1].at < this.windowMs) return 'too_fast'; // đã gửi đủ limit tin trong windowMs
    list.unshift({ text: t, at: now });
    this.src.delete(source);
    this.src.set(source, list.slice(0, this.limit));
    if (this.src.size > this.maxSources) this.src.delete(this.src.keys().next().value); // bỏ người gửi cũ nhất
    return null;
  }
}

module.exports = { weakPassword, badWords, mask, isOffensiveName, Flood, levenshteinBelow, COMMON_PASSWORDS };
