/*
 * Địa chỉ máy chủ online (thư mục server/).
 *  - Để trống '' nếu game được phục vụ bởi chính máy chủ đó (khuyên dùng).
 *  - Bản đăng trên GitHub Pages (marseraf7.github.io) không có máy chủ game
 *    tại chỗ nên tự trỏ về máy chủ chính; mọi nơi khác giữ ''.
 */
window.CARO_SERVER = location.hostname === 'marseraf7.github.io' ? 'https://caroxo.duckdns.org' : '';
