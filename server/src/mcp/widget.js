/*
 * Connector MCP – dựng widget bàn cờ (MCP App) thành MỘT file HTML tự chứa, phục vụ dưới dạng tài nguyên ui://:
 * widget.html + widget.css + bộ SDK MCP Apps (@modelcontextprotocol/ext-apps, bản gộp sẵn phụ thuộc – lớp App)
 * + chuỗi dịch (widget-i18n.js) + mã widget (widget-app.js). Không tải gì từ mạng (CSP mặc định của Claude chặn hết).
 * Dựng một lần rồi giữ trong bộ nhớ (~560 KB, phần lớn là SDK).
 * uiDomain(): tên miền khung cô lập Claude yêu cầu – 32 ký tự hex đầu của SHA-256(địa chỉ máy chủ MCP) + .claudemcpcontent.com.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UI = path.join(__dirname, 'ui');
const read = (f) => fs.readFileSync(path.join(UI, f), 'utf8');

/** Bản gộp SDK là module ES kết thúc bằng `export{a as App,…}`: đổi thành gán vào globalThis.McpExtApps để mã widget dùng. */
function sdkScript() {
  const file = require.resolve('@modelcontextprotocol/ext-apps/app-with-deps');
  const src = fs.readFileSync(file, 'utf8');
  const m = /export\s*\{([^}]*)\}\s*;?\s*(\/\/#[^\n]*\s*)?$/.exec(src);
  if (!m) throw new Error('ext-apps bundle format changed: no trailing export list');
  const pairs = m[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [local, as] = s.split(/\s+as\s+/);
    return `${JSON.stringify(as || local)}:${local}`;
  });
  return src.slice(0, m.index) + `;globalThis.McpExtApps={${pairs.join(',')}};`;
}

// Chặn chuỗi "</script" trong mã nhúng để không đóng thẻ <script> sớm
const inline = (js) => js.replace(/<\/script/gi, '<\\/script');

let cached = null;
function widgetHtml() {
  if (!cached) {
    cached = read('widget.html')
      .replace('/*CSS*/', () => read('widget.css'))
      .replace('/*SDK*/', () => inline(sdkScript()))
      .replace('/*I18N*/', () => inline(read('widget-i18n.js')))
      .replace('/*APP*/', () => inline(read('widget-app.js')));
  }
  return cached;
}

/** Địa chỉ công khai của máy chủ MCP (CARO_MCP_URL, hoặc PUBLIC_URL + /mcp, mặc định tên miền chính). */
function serverUrl() {
  if (process.env.CARO_MCP_URL) return process.env.CARO_MCP_URL;
  return String(process.env.PUBLIC_URL || 'https://caroxo.duckdns.org').replace(/\/+$/, '') + '/mcp';
}

function uiDomain(url = serverUrl()) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 32) + '.claudemcpcontent.com';
}

/** Biểu tượng 128 px (PNG, < 10 KB) gửi kèm serverInfo dạng data: URI – Claude không tải biểu tượng từ link. */
let icon = null;
function iconDataUri() {
  if (icon === null) {
    try { icon = 'data:image/png;base64,' + fs.readFileSync(path.join(UI, 'icon-128.png')).toString('base64'); } catch (e) { icon = ''; }
  }
  return icon;
}

module.exports = { widgetHtml, uiDomain, serverUrl, iconDataUri, sdkScript };
