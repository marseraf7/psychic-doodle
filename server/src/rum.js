/*
 * Số đo tốc độ từ máy người chơi (bước 2 của docs/nghien-cuu-viet-lai-rust-17-11-2026.md – "đo thực địa").
 *   POST /api/rum  – caro/rum.js gửi một lần mỗi lượt mở trang (sendBeacon, text/plain nên không cần preflight CORS):
 *                    { ttfb, fcp, lcp, dcl, load, inp, cls, loaf, longest, bundle, app, desktop }. Máy chủ đọc User-Agent để xếp
 *                    loại trình duyệt (Zalo, Messenger, Chrome…) rồi bỏ – không lưu User-Agent, IP hay tài khoản.
 *   GET  /api/rum  – bảng p50 / p75 / p95 mỗi chỉ số theo loại trình duyệt (+ bản gộp / từng file), cùng độ trễ vòng lặp
 *                    sự kiện của máy chủ (trung bình, p99, lớn nhất trong giờ gần nhất). Chỉ là số gộp chung.
 * Chỉ giữ trong bộ nhớ (1000 số gần nhất mỗi chỉ số mỗi loại), mất khi khởi động lại. Mỗi IP tối đa 30 lần / phút.
 */
'use strict';
const { monitorEventLoopDelay } = require('perf_hooks');

const METRICS = ['ttfb', 'fcp', 'lcp', 'dcl', 'load', 'inp', 'cls', 'loaf', 'longest'];
const MAX_MS = 120000;
const KEEP = 1000;
const RATE = 30;
const MAX_BODY = 2048;

/** Loại trình duyệt từ User-Agent – trình duyệt trong app (Zalo, Messenger…) trước, rồi trình duyệt thường. */
function kindOf(ua, app, desktop) {
  if (desktop) return 'desktop'; // app desktop Tauri (desktop/)
  if (app) return 'app';
  const s = String(ua || '');
  if (/Zalo/i.test(s)) return 'zalo';
  if (/Messenger|FB_IAB\/MESSENGER|FBAN\/Messenger/i.test(s)) return 'messenger';
  if (/FBAN|FBAV|FB_IAB|Instagram/i.test(s)) return 'facebook';
  if (/; wv\)|WebView/i.test(s)) return 'webview';
  if (/Edg\//.test(s)) return 'edge';
  if (/Firefox\//.test(s)) return 'firefox';
  if (/Chrome\/|CriOS\//.test(s)) return 'chrome';
  if (/Safari\//.test(s)) return 'safari';
  return 'other';
}

/** Số hợp lệ của một chỉ số (cls là điểm × 1000), hoặc null. */
function clean(m, v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  if (m === 'cls') return n <= 10 ? Math.round(n * 1000) : null;
  return n <= MAX_MS ? Math.round(n) : null;
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

class Rum {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.data = new Map(); // 'chrome+b' -> { n, m: { fcp: [..] } }
    this.hits = new Map(); // ip -> { n, reset }
    this.loop = monitorEventLoopDelay({ resolution: 20 });
    this.loop.enable();
    this.loopAt = now();
  }

  /** Ghi một lượt đo (đã parse). Trả về false nếu không có số nào hợp lệ. */
  add(body, ua) {
    if (!body || typeof body !== 'object') return false;
    const key = kindOf(ua, body.app === true, body.desktop === true) + (body.bundle === true ? '+b' : '');
    const vals = {};
    for (const m of METRICS) { const v = clean(m, body[m]); if (v !== null) vals[m] = v; }
    if (!Object.keys(vals).length) return false;
    let d = this.data.get(key);
    if (!d) { d = { n: 0, m: {} }; this.data.set(key, d); }
    d.n++;
    for (const [m, v] of Object.entries(vals)) {
      const a = d.m[m] || (d.m[m] = []);
      a.push(v);
      if (a.length > KEEP) a.shift();
    }
    return true;
  }

  /** Bảng gộp, giữ 10 giây (GET /api/rum công khai: gọi dồn dập không bắt máy chủ sắp xếp lại mỗi lần). */
  cachedSummary() {
    const now = this.now();
    if (!this.cache || now - this.cache.at > 10000) this.cache = { at: now, body: this.summary() };
    return this.cache.body;
  }

  /** Bảng gộp: { kinds: { key: { n, fcp: { p50, p75, p95, n } … } }, server: { loopMean, loopP99, loopMax } }. */
  summary() {
    const kinds = {};
    for (const [key, d] of [...this.data].sort((a, b) => b[1].n - a[1].n)) {
      const row = { n: d.n };
      for (const [m, a] of Object.entries(d.m)) {
        const s = [...a].sort((x, y) => x - y);
        row[m] = { p50: pct(s, 0.5), p75: pct(s, 0.75), p95: pct(s, 0.95), n: s.length };
        if (m === 'cls') for (const k of ['p50', 'p75', 'p95']) row[m][k] /= 1000;
      }
      kinds[key] = row;
    }
    const h = this.loop, ms = (v) => Math.round(Math.max(0, v / 1e6 - 20) * 10) / 10; // trừ độ phân giải bộ đo
    const server = h.count ? { loopMean: ms(h.mean), loopP99: ms(h.percentile(99)), loopMax: ms(h.max), since: this.loopAt } : null;
    if (this.now() - this.loopAt > 3600000) { h.reset(); this.loopAt = this.now(); } // chỉ giữ ~1 giờ gần nhất
    return { kinds, server };
  }

  /** Xử lý /api/rum; trả về true nếu đã trả lời. */
  handle(req, res, url, ip) {
    if (url !== '/api/rum') return false;
    const send = (status, body) => {
      const buf = Buffer.from(body ? JSON.stringify(body) : '');
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length,
        'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      res.end(buf);
    };
    if (req.method === 'GET') { send(200, this.cachedSummary()); return true; }
    if (req.method !== 'POST') { send(405); return true; }
    const now = this.now();
    let h = this.hits.get(ip);
    if (!h || h.reset < now) { h = { n: 0, reset: now + 60000 }; this.hits.set(ip, h); }
    if (this.hits.size > 10000) for (const [k, v] of this.hits) if (v.reset < now) this.hits.delete(k);
    if (++h.n > RATE) { req.resume(); send(429); return true; }
    let size = 0, chunks = [], done = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { done = true; send(413); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      let body = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { /* bỏ qua */ }
      send(this.add(body, req.headers['user-agent']) ? 204 : 400);
    });
    req.on('error', () => {});
    return true;
  }
}

module.exports = { Rum, kindOf, METRICS };
