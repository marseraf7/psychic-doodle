/*
 * Nguồn tải mạng NNUE của Rapfi (caro/rapfi/worker.js – BOAT) được phép trong CSP connect-src (I-11, rà soát 20/11/2026).
 * Trước đây CSP mở cả hai origin https://cdn.jsdelivr.net và https://raw.githubusercontent.com: nếu một ngày có XSS, đó là
 * kênh sẵn để đưa dữ liệu ra (ai cũng tạo được repo GitHub). Nay chỉ mở đúng thư mục mix9svq của hai kho mạng ở đúng
 * commit đã ghim (CSP so khớp đường dẫn theo tiền tố khi nguồn kết thúc bằng '/').
 * Phải khớp NETS_COMMIT và REPOS trong caro/rapfi/worker.js – test server/test/csp-nets.test.js báo đỏ nếu lệch.
 * Dùng chung: server/src/web.js (CSP máy chủ) và desktop/scripts/build-web.js (CSP app desktop).
 */
'use strict';

const NETS_COMMIT = 'e32ad77a5364363b3e3a02b3f9e8610ade19ea98';
const REPOS = ['marseraf7/rapfi-networks', 'dhbloo/rapfi-networks'];

/** Danh sách nguồn CSP (cách nhau dấu cách) cho connect-src. */
function rapfiNetSources() {
  return [
    ...REPOS.map((r) => `https://cdn.jsdelivr.net/gh/${r}@${NETS_COMMIT}/mix9svq/`),
    ...REPOS.map((r) => `https://raw.githubusercontent.com/${r}/${NETS_COMMIT}/mix9svq/`),
  ].join(' ');
}

module.exports = { NETS_COMMIT, REPOS, rapfiNetSources };
