#!/usr/bin/env node
/*
 * Đóng gói bản cổng game (PORTAL_MODE) – thư mục tĩnh tự đủ + file ZIP để tải lên CrazyGames / itch.io:
 *   node server/scripts/build-portal.js crazygames|itch [--server https://máy-chủ] [--out thư-mục] [--zip file.zip] [--test]
 * Máy chủ online (WebSocket, API): --server, không có thì CARO_SERVER_URL, rồi PUBLIC_URL, mặc định https://caroxo.duckdns.org
 * (chỉ giao thức + tên miền; http chỉ nhận khi --test – bài thử trên máy). Mặc định ra dist/portal-<cổng>/ và
 * dist/caro-<cổng>.zip ở gốc repo (dist/ không đưa lên git).
 *
 * Gói gồm: caro/ (bỏ bài thử, service worker, README, mạng Rapfi tự đặt, các trang chỉ chạy khi có máy chủ của mình: api,
 * connector, broadcast, embed), index.html là bản gộp (server/src/web-bundle.js) dựng từ chính thư mục gói, cộng:
 *   – portal-config.js trong <head> (trước mọi script): CARO_PORTAL, CARO_SERVER, CARO_LANG0 = 'en' – cờ đặt lúc đóng gói,
 *     không phải tham số URL; config.js của gói cũng trỏ về máy chủ đó;
 *   – portal.js (đăng nhập, link ra ngoài – xem file đó); bản 'crazygames' thêm thẻ SDK v3 của CrazyGames
 *     (https://sdk.crazygames.com/crazygames-sdk-v3.js – docs.crazygames.com → SDK → Intro) và portal-crazygames.js;
 *   – bỏ <link rel="manifest"> (không cài PWA, không link cửa hàng); không sw.js.
 * Kiểm: mọi đường dẫn trong HTML / CSS của gói là tương đối; số file / dung lượng so với giới hạn của cổng (CrazyGames:
 * tổng ≤ 250 MB, tải ban đầu ≤ 50 MB, ≤ 1500 file – docs.crazygames.com → Requirements → Technical; itch.io: ≤ 500 MB,
 * ≤ 1000 file – itch.io/docs/creators/html5). Vượt giới hạn hay còn đường dẫn tuyệt đối: báo lỗi, mã thoát 1.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { build } = require('../src/web-bundle.js');
const { zipFiles, listDir } = require('./zip-lite.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CARO = path.join(ROOT, 'caro');
const MB = 1024 * 1024;
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const LIMITS = {
  crazygames: { total: 250 * MB, initial: 50 * MB, files: 1500 },
  itch: { total: 500 * MB, initial: null, files: 1000 },
};
// Không chép vào gói (đường dẫn tương đối trong caro/)
const SKIP = new Set(['tests', 'README.md', 'sw.js', 'config.js', path.join('rapfi', 'nets'),
  'api.html', 'api-page.css', 'connector.html', 'broadcast.html', 'broadcast.js', 'broadcast.css',
  'embed.html', 'embed.css', 'embed-boot.js', 'embed-run.js', 'embed-tour.js']);

/** Địa chỉ máy chủ: chỉ giao thức + tên miền (+ cổng); http chỉ khi allowHttp. */
function serverOriginOf(raw, allowHttp) {
  let u;
  try { u = new URL(raw || 'https://caroxo.duckdns.org'); } catch (e) { throw new Error('Địa chỉ máy chủ không hợp lệ: ' + raw); }
  if (!['https:', 'http:'].includes(u.protocol) || u.pathname !== '/' || u.search || u.hash) {
    throw new Error('Địa chỉ máy chủ chỉ gồm giao thức + tên miền (+ cổng), ví dụ https://caro.example.com');
  }
  if (u.protocol === 'http:' && !allowHttp) throw new Error('Máy chủ phải dùng https (http chỉ cho bài thử: --test)');
  return u.origin;
}

const flagsJs = (mode, server) => [
  '// Tạo tự động bởi server/scripts/build-portal.js – không sửa tay.',
  `window.CARO_PORTAL = ${JSON.stringify(mode)};`,
  `window.CARO_SERVER = ${JSON.stringify(server)};`,
  "window.CARO_LANG0 = 'en';",
  '',
].join('\n');

/** Sửa index.html của gói (trước khi gộp mã). */
function portalHtml(html, mode) {
  const sub = (from, to) => {
    if (!html.includes(from)) throw new Error('index.html thiếu ' + from);
    html = html.replace(from, to);
  };
  html = html.replace(/^[ \t]*<link rel="manifest"[^>]*>\r?\n/m, '');
  sub('<html lang="vi">', '<html lang="en">');
  const sdk = mode === 'crazygames' ? `<script src="${SDK_URL}"></script>\n  ` : '';
  sub('<script src="watchdog.js"></script>', `${sdk}<script src="portal-config.js"></script>\n  <script src="watchdog.js"></script>`);
  if (mode === 'crazygames') sub('<script src="host-detect.js"></script>', '<script src="host-detect.js"></script>\n  <script src="portal-crazygames.js"></script>');
  sub('</body>', '  <script src="portal.js"></script>\n</body>');
  return html;
}

/** Đường dẫn tuyệt đối (bắt đầu bằng '/') trong HTML / CSS của gói: [file: chỗ]. */
function absolutePaths(out) {
  const bad = [];
  for (const { name, file } of listDir(out)) {
    if (!/\.(html|css)$/.test(name)) continue;
    const s = fs.readFileSync(file, 'utf8');
    for (const m of s.matchAll(/\b(?:src|href|action)\s*=\s*["']\/(?!\/)[^"']*["']|url\(\s*["']?\/(?!\/)[^)"']*/g)) bad.push(`${name}: ${m[0]}`);
  }
  return bad;
}

/** File trang tải ngay lúc mở (thẻ trong index.html + gói chuỗi tiếng Anh): tổng byte. */
function initialBytes(out, html) {
  const refs = new Set([...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((r) => !/^[a-z]+:/i.test(r)));
  let sum = fs.statSync(path.join(out, 'index.html')).size;
  for (const r of refs) { const f = path.join(out, r); if (fs.existsSync(f)) sum += fs.statSync(f).size; }
  const en = fs.readdirSync(path.join(out, 'b')).find((f) => /^i18n-en-/.test(f));
  if (en) sum += fs.statSync(path.join(out, 'b', en)).size;
  return sum;
}

/**
 * Dựng gói. → { out, zip, mode, server, files, total, initial, zipBytes, limits, problems: [chuỗi] }
 * (problems rỗng = đạt). Ném lỗi khi tham số sai.
 */
function buildPortal({ mode, server, out, zip, allowHttp = false, src = CARO } = {}) {
  if (!LIMITS[mode]) throw new Error('Cổng phải là crazygames hoặc itch');
  server = serverOriginOf(server, allowHttp);
  out = path.resolve(out || path.join(ROOT, 'dist', 'portal-' + mode));
  zip = zip === false ? null : path.resolve(zip || path.join(path.dirname(out), 'caro-' + mode + '.zip'));

  fs.rmSync(out, { recursive: true, force: true });
  const skip = (rel) => SKIP.has(rel) || SKIP.has(rel.split(path.sep)[0]);
  fs.cpSync(src, out, { recursive: true, filter: (f) => f === src || !skip(path.relative(src, f)) });
  fs.writeFileSync(path.join(out, 'config.js'), flagsJs(mode, server));
  fs.writeFileSync(path.join(out, 'portal-config.js'), flagsJs(mode, server));
  if (mode !== 'crazygames') fs.rmSync(path.join(out, 'portal-crazygames.js'), { force: true });
  fs.writeFileSync(path.join(out, 'index.html'), portalHtml(fs.readFileSync(path.join(src, 'index.html'), 'utf8'), mode));

  // Bản gộp dựng từ chính thư mục gói (config.js của gói nằm trong khối mã); cần sw.js tạm để đọc FILES / CACHE
  fs.copyFileSync(path.join(src, 'sw.js'), path.join(out, 'sw.js'));
  let B;
  try { B = build(out); } finally { fs.rmSync(path.join(out, 'sw.js'), { force: true }); }
  fs.writeFileSync(path.join(out, 'index.html'), B.html);
  fs.mkdirSync(path.join(out, 'b'), { recursive: true });
  for (const [name, buf] of B.files) fs.writeFileSync(path.join(out, name), buf);

  const list = listDir(out);
  const total = list.reduce((s, f) => s + fs.statSync(f.file).size, 0);
  const initial = initialBytes(out, B.html);
  const lim = LIMITS[mode];
  const problems = absolutePaths(out).map((s) => 'đường dẫn tuyệt đối: ' + s);
  if (list.length > lim.files) problems.push(`quá nhiều file: ${list.length} > ${lim.files}`);
  if (total > lim.total) problems.push(`quá dung lượng: ${(total / MB).toFixed(1)} MB > ${lim.total / MB} MB`);
  if (lim.initial && initial > lim.initial) problems.push(`tải ban đầu quá lớn: ${(initial / MB).toFixed(1)} MB > ${lim.initial / MB} MB`);

  let zipBytes = 0;
  if (zip) {
    const buf = zipFiles(list.map(({ name, file }) => ({ name, data: fs.readFileSync(file) })));
    fs.mkdirSync(path.dirname(zip), { recursive: true });
    fs.writeFileSync(zip, buf);
    zipBytes = buf.length;
  }
  return { out, zip, mode, server, files: list.length, total, initial, zipBytes, limits: lim, problems };
}

function report(r) {
  const mb = (n) => (n / MB).toFixed(2) + ' MB';
  const lines = [
    `Bản cổng ${r.mode} · máy chủ ${r.server}`,
    `  thư mục: ${r.out}`,
    r.zip ? `  ZIP:     ${r.zip} (${mb(r.zipBytes)})` : '',
    `  số file: ${r.files} / tối đa ${r.limits.files}`,
    `  tổng:    ${mb(r.total)} / tối đa ${r.limits.total / MB} MB`,
    `  tải ban đầu (trang + CSS + khối mã + gói chuỗi tiếng Anh): ${mb(r.initial)}` + (r.limits.initial ? ` / tối đa ${r.limits.initial / MB} MB` : ''),
    '  (máy cờ Rapfi ~1,3 MB và mạng NNUE ~10 MB chỉ tải khi đấu BOAT / phân tích; mạng NNUE tải từ jsDelivr / GitHub)',
  ].filter(Boolean);
  if (r.problems.length) lines.push('✗ Chưa đạt:', ...r.problems.map((p) => '  – ' + p));
  else lines.push('✓ Đạt giới hạn của cổng, mọi đường dẫn trong gói là tương đối');
  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  try {
    const r = buildPortal({
      mode: args[0], out: opt('--out'), zip: opt('--zip'), allowHttp: args.includes('--test'),
      server: opt('--server') || process.env.CARO_SERVER_URL || process.env.PUBLIC_URL,
    });
    console.log(report(r));
    if (r.problems.length) process.exitCode = 1;
  } catch (e) {
    console.error('✗ ' + e.message);
    console.error('Dùng: node server/scripts/build-portal.js crazygames|itch [--server https://máy-chủ] [--out thư-mục] [--zip file.zip] [--test]');
    process.exitCode = 1;
  }
}

module.exports = { buildPortal, report, portalHtml, absolutePaths, serverOriginOf, LIMITS, SDK_URL };
