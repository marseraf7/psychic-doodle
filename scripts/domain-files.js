/*
 * Danh sách file còn ghi THẲNG tên miền chính (không đọc được biến môi trường / server/src/site.js lúc chạy) – để đổi tên
 * miền bằng một lệnh (scripts/set-domain.js). Bài thử server/test/domain-literals.test.js báo đỏ khi tên miền xuất hiện ở
 * file nào ngoài danh sách này (thêm chỗ mới thì: đọc từ site.js nếu được, không được thì thêm file vào đây).
 *   REPLACE – thay tên cũ bằng tên mới (kèm mã ui.domain của connector MCP).
 *   ADD     – giữ tên cũ, THÊM tên mới (link sâu của app: link cũ đã gửi đi vẫn mở được app).
 *   KEEP    – tài liệu lịch sử / riêng cho DuckDNS: cố ý giữ tên cũ.
 */
'use strict';

const REPLACE = [
  'server/src/site.js', // DEFAULT_HOST – nguồn cho máy chủ, MCP, app/desktop (web-common.js), bài thử
  'caro/config.js', // bản GitHub Pages trỏ về máy chủ chính
  'caro/index.html', // <link rel="canonical"> của bản tĩnh (GitHub Pages) – máy chủ tự thay bằng địa chỉ đúng (seo.js)
  'caro/connector.html', // hướng dẫn thêm connector (4 ngôn ngữ)
  'caro/privacy.html', // địa chỉ connector trong chính sách riêng tư (4 ngôn ngữ)
  'app/README.md',
  'docs/claude-directory/SUBMISSION.md',
  'docs/claude-directory/listing.md',
];

const ADD = [
  'app/android/app/src/main/AndroidManifest.xml', // App Links (intent-filter android:host)
  'app/ios/App/App/App.entitlements', // Universal Links (applinks:)
];

// Báo cáo có ngày trong tên (…-20-11-2026.md) là lịch sử; CHUYEN-MAY-CHU.md là đổi máy giữ tên DuckDNS; doi-ten-mien.md kể tên cũ
const KEEP = [/^docs\/.*-\d{1,2}-\d{1,2}-\d{4}\.md$/, /^server\/deploy\/CHUYEN-MAY-CHU\.md$/, /^docs\/doi-ten-mien\.md$/];

const keep = (file) => KEEP.some((re) => re.test(file));

module.exports = { REPLACE, ADD, KEEP, keep };
