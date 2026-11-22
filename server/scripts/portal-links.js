/*
 * Link trong trang tĩnh của bản cổng game (build-portal.js gọi sau khi dựng gói). Quy định của CrazyGames: không link ra
 * ngoài, không quảng bá chéo – link trong app đã ẩn / chặn bằng portal.js + host.css, nhưng privacy.html, licenses.html…
 * là HTML tĩnh, mở thẳng trong khung của cổng nên phải sửa ngay trong file:
 *   – <a href="https://…" | "//…" | "mailto:…" | scheme khác> → <span class="ext-link">chữ cũ</span>. Chữ của link không
 *     chứa địa chỉ thì thêm " (địa chỉ)" sau chữ (bỏ https://, mailto:, dấu / cuối) – giấy phép cần thấy địa chỉ mã nguồn
 *     dưới dạng chữ, không cần link bấm được;
 *   – link tương đối tới trang không có trong gói (connector.html, api.html… đã bỏ khi đóng gói) → chữ thường, không kèm địa chỉ.
 * Trang có đổi thì thêm một <style> nhỏ cho .ext-link (địa chỉ dài xuống dòng được). Link nội bộ (#vi, ./, licenses.html,
 * javascript:…) giữ nguyên. Kết quả chỉ phụ thuộc nội dung vào (dựng lại ra y hệt).
 *   unlinkHtml(html, exists?) → html mới · externalLinks(dir) → ['file: href'] (bài thử + kiểm cuối lúc đóng gói)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { listDir } = require('./zip-lite.js');

const A_RE = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const CLASS_RE = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const LOCAL = ['javascript:', 'data:', 'blob:', 'about:'];
const EXT_CSS = '<style>.ext-link { overflow-wrap: anywhere; }</style>';

/** href dẫn ra khỏi gói: có scheme (trừ javascript: / data: / blob: / about:) hoặc bắt đầu bằng //. */
function isExternal(href) {
  const h = String(href).trim().toLowerCase();
  if (h.startsWith('//')) return true;
  const m = /^([a-z][a-z0-9+.-]*):/.exec(h);
  return !!m && !LOCAL.includes(m[1] + ':');
}

/** Địa chỉ hiện thành chữ: bỏ https:// · // · mailto: và dấu / cuối. */
const shownUrl = (href) => href.trim().replace(/^mailto:/i, '').replace(/^(?:[a-z][a-z0-9+.-]*:)?\/\//i, '').replace(/\/$/, '');

/** Đường dẫn tương đối → file trong gói (bỏ ?…, #…); rỗng (chỉ #…) → null. */
const localFile = (href) => {
  const p = href.trim().replace(/[?#].*$/, '');
  return p && p !== '.' && p !== './' && !p.endsWith('/') ? p : null;
};

/**
 * Bỏ link ra ngoài trong một trang HTML. exists(relPath) → true nếu file có trong gói (không truyền: coi như có hết).
 */
function unlinkHtml(html, exists = () => true) {
  let changed = false;
  const out = html.replace(A_RE, (all, attrs, inner) => {
    const m = HREF_RE.exec(attrs);
    if (!m) return all;
    const href = m[1] ?? m[2] ?? m[3];
    let tail = '';
    if (isExternal(href)) {
      const url = shownUrl(href);
      const text = inner.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');
      if (url && !text.includes(url.replace(/&amp;/g, '&'))) tail = ` (${url})`;
    } else {
      const f = localFile(href);
      if (!f || /^[a-z][a-z0-9+.-]*:/i.test(f) || exists(f)) return all;
    }
    const c = CLASS_RE.exec(attrs);
    const cls = [c && (c[1] ?? c[2]), 'ext-link'].filter(Boolean).join(' ');
    changed = true;
    return `<span class="${cls}">${inner}${tail}</span>`;
  });
  // Địa chỉ dài (github.com/…/tree/<mã commit>) phải xuống dòng được ở màn 390px – trang giấy phép không nạp policy-page.css
  if (!changed || out.includes(EXT_CSS) || !/<\/head>/i.test(out)) return out;
  return out.replace(/<\/head>/i, `${EXT_CSS}\n</head>`);
}

/** Mọi <a> còn href ra ngoài trong các file .html của thư mục: ['tên: href']. */
function externalLinks(dir) {
  const bad = [];
  for (const { name, file } of listDir(dir)) {
    if (!/\.html?$/i.test(name)) continue;
    for (const [, attrs] of fs.readFileSync(file, 'utf8').matchAll(/<a\b([^>]*)>/gi)) {
      const m = HREF_RE.exec(attrs);
      const href = m && (m[1] ?? m[2] ?? m[3]);
      if (href && isExternal(href)) bad.push(`${name}: ${href}`);
    }
  }
  return bad;
}

/** Sửa tại chỗ các trang tĩnh .html trong gói (trừ index.html – link của app do portal.js + host.css lo, đổi thẻ ở đó
 *  có thể làm hỏng mã đang tìm thẻ <a>; externalLinks vẫn soát cả index.html). → số file đã đổi. */
function unlinkDir(dir) {
  let n = 0;
  for (const { name, file } of listDir(dir)) {
    if (!/\.html?$/i.test(name) || name === 'index.html') continue;
    const s = fs.readFileSync(file, 'utf8');
    const base = path.posix.dirname(name);
    const t = unlinkHtml(s, (rel) => {
      try { return fs.existsSync(path.join(dir, path.posix.normalize(path.posix.join(base, decodeURIComponent(rel))))); } catch (e) { return false; }
    });
    if (t !== s) { fs.writeFileSync(file, t); n++; }
  }
  return n;
}

module.exports = { isExternal, shownUrl, unlinkHtml, unlinkDir, externalLinks };
