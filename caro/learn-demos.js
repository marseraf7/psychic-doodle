/*
 * Dữ liệu "phim minh hoạ" của phần Học (chỉ dữ liệu; trình phát ở learn-board.js, phụ đề ở i18n-demos.js).
 * Toạ độ trên hình 9×9: x 0…8 sang phải, y 0…8 xuống dưới.
 *
 * Mỗi phim: { rule, init: [[x, y, 'x' | 'o'], …], frames: [khung, …] }
 * Mỗi khung (hiện lần lượt, quân cộng dồn):
 *   s      – quân đặt thêm ở khung này [[x, y, 'x' | 'o']]
 *   m      – dấu chỉ hiện ở khung này [[x, y, 'good' | 'bad']]
 *   line   – vẽ đường thắng [[x1, y1], [x2, y2]]
 *   expect – điều phải đúng sau khung (caro/tests/demos.test.js kiểm bằng rules.js):
 *            'win' (quân vừa đặt thắng), 'nowin', 'threat' (quân vừa đặt tạo ô thắng), 'forbid' (ô ở dấu 'bad' là ô cấm),
 *            'block' (quân O vừa đặt làm X mất hết ô thắng cũ… hoặc ít nhất một)
 * Phụ đề khung thứ n: khoá i18n "demo_<id>_<n>" (n từ 1).
 * Phim khai cuộc (kind: 'openings'): mỗi khung là một thế, phụ đề ghép từ tên trong i18n.
 */
(function (global) {
  'use strict';
  const DEMOS = {
    // Luật Việt Nam: 3 mở là đe doạ, 4 mở thắng ngay
    vn: {
      rule: 'vn',
      init: [[2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [3, 6, 'o'], [6, 2, 'o']],
      frames: [
        { m: [[1, 4, 'good'], [5, 4, 'good']] },
        { s: [[6, 6, 'o']], m: [[6, 6, 'bad']] },
        { s: [[5, 4, 'x']], expect: 'win', line: [[2, 4], [5, 4]] },
      ],
    },
    // Luật Việt Nam: chặn hai đầu là không tính
    vnblock: {
      rule: 'vn',
      init: [[1, 4, 'o'], [2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [4, 6, 'o'], [2, 2, 'x']],
      frames: [
        { s: [[7, 4, 'o']], m: [[7, 4, 'good']] },
        { s: [[6, 4, 'x']], expect: 'nowin', m: [[6, 4, 'bad']] },
      ],
    },
    // Luật tự do: cùng thế đó, 5 quân bị chặn hai đầu vẫn thắng
    free: {
      rule: 'free',
      init: [[1, 4, 'o'], [2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [4, 6, 'o'], [2, 2, 'x']],
      frames: [
        { s: [[7, 4, 'o']], m: [[7, 4, 'bad']] },
        { s: [[6, 4, 'x']], expect: 'win', line: [[2, 4], [6, 4]] },
      ],
    },
    // Luật tiêu chuẩn: quá năm không thắng
    std: {
      rule: 'std',
      init: [[1, 4, 'x'], [2, 4, 'x'], [3, 4, 'x'], [5, 4, 'x'], [6, 4, 'x'], [3, 6, 'o'], [5, 2, 'o'], [7, 6, 'o']],
      frames: [
        { m: [[4, 4, 'bad']] },
        { s: [[4, 4, 'x']], expect: 'nowin' },
      ],
    },
    // Renju: ô 3-3 bị cấm, nước 4-3 được phép và thắng
    renju: {
      rule: 'renju',
      init: [[1, 4, 'x'], [2, 4, 'x'], [3, 4, 'x'], [4, 2, 'x'], [4, 3, 'x'], [6, 6, 'x'], [7, 6, 'x'], [5, 7, 'x'], [5, 8, 'x'],
        [0, 4, 'o'], [8, 0, 'o'], [0, 8, 'o'], [7, 1, 'o'], [1, 1, 'o'], [8, 8, 'o'], [2, 7, 'o'], [8, 3, 'o'], [0, 0, 'o']],
      frames: [
        { m: [[5, 6, 'bad']], expect: 'forbid' },
        { s: [[4, 4, 'x']], expect: 'threat' },
        { s: [[5, 4, 'o']], expect: 'block' },
        { s: [[4, 5, 'x']], expect: 'threat' },
        { s: [[4, 1, 'o']] },
        { s: [[4, 6, 'x']], expect: 'win', line: [[4, 2], [4, 6]] },
      ],
    },
    // Hoa Nguyệt (trực chỉ số 4) và Phố Nguyệt (gián chỉ số 7)
    moon1: { rule: 'renju', init: [], frames: [{ s: [[4, 4, 'x']] }, { s: [[4, 3, 'o']] }, { s: [[5, 3, 'x']] }] },
    moon2: { rule: 'renju', init: [], frames: [{ s: [[4, 4, 'x']] }, { s: [[5, 3, 'o']] }, { s: [[5, 5, 'x']] }] },
    // 26 thế khai cuộc: lần lượt từng vị trí X3
    open_direct: { kind: 'openings', which: 'direct' },
    open_indirect: { kind: 'openings', which: 'indirect' },
    // Thế nón lá (luật tự do): đối thủ chỉ chặn ngọn, X thắng từ đáy bằng chuỗi nước bốn
    nonla: {
      rule: 'free',
      init: [[4, 1, 'x'], [3, 2, 'x'], [5, 2, 'x'], [2, 3, 'x'], [6, 3, 'x'], [3, 4, 'x'], [5, 4, 'x'], [5, 0, 'o'], [3, 0, 'o'], [0, 0, 'o'], [8, 0, 'o']],
      frames: [
        { s: [[1, 4, 'x']], expect: 'threat' },
        { s: [[0, 5, 'o']], expect: 'block' },
        { s: [[7, 4, 'x']], expect: 'threat' },
        { s: [[8, 5, 'o']], expect: 'block' },
        { s: [[4, 4, 'x']], expect: 'threat', m: [[2, 4, 'good'], [6, 4, 'good']] },
        { s: [[2, 4, 'o']] },
        { s: [[6, 4, 'x']], expect: 'win', line: [[3, 4], [7, 4]] },
      ],
    },
    // VCF (luật tự do): bốn → chặn → bốn đôi → thắng
    vcf: {
      rule: 'free',
      init: [[2, 4, 'x'], [3, 4, 'x'], [4, 4, 'x'], [5, 2, 'x'], [5, 3, 'x'], [6, 6, 'x'], [7, 7, 'x'], [1, 4, 'o'], [5, 1, 'o'], [8, 8, 'o'], [1, 7, 'o']],
      frames: [
        { s: [[5, 4, 'x']], expect: 'threat' },
        { s: [[6, 4, 'o']], expect: 'block' },
        { s: [[5, 5, 'x']], expect: 'threat', m: [[5, 6, 'good'], [3, 3, 'good']] },
        { s: [[5, 6, 'o']] },
        { s: [[3, 3, 'x']], expect: 'win', line: [[3, 3], [7, 7]] },
      ],
    },
    // VCT (luật Việt Nam): một nước tạo hai đường 3 mở
    vct: {
      rule: 'vn',
      init: [[2, 4, 'x'], [3, 4, 'x'], [4, 2, 'x'], [4, 3, 'x'], [2, 6, 'o'], [6, 6, 'o'], [7, 1, 'o'], [1, 1, 'o']],
      frames: [
        { s: [[4, 4, 'x']], expect: 'threat' },
        { s: [[5, 4, 'o']] },
        { s: [[4, 5, 'x']], expect: 'win', line: [[4, 2], [4, 5]] },
      ],
    },
    // 4 lối đánh (máy cầm O, bạn cầm X)
    st_atk: {
      rule: 'vn',
      init: [[3, 4, 'o'], [4, 4, 'o'], [4, 5, 'x'], [2, 2, 'x'], [6, 6, 'x']],
      frames: [
        { s: [[5, 4, 'o']], expect: 'threat' },
        { s: [[6, 4, 'x']] },
        { s: [[2, 4, 'o']], expect: 'threat' },
        { s: [[1, 4, 'x']] },
      ],
    },
    st_def: {
      rule: 'vn',
      init: [[3, 4, 'x'], [4, 4, 'x'], [4, 6, 'o']],
      frames: [
        { s: [[5, 4, 'o']], m: [[5, 4, 'good']] },
        { s: [[4, 3, 'x']] },
        { s: [[4, 2, 'o']], m: [[4, 2, 'good']] },
        { s: [[2, 2, 'x']] },
        { s: [[5, 5, 'o']] },
      ],
    },
    st_dbl: {
      rule: 'vn',
      init: [[2, 4, 'o'], [3, 4, 'o'], [4, 2, 'o'], [4, 3, 'o'], [2, 6, 'x'], [6, 6, 'x'], [7, 1, 'x'], [1, 1, 'x'], [8, 8, 'x']],
      frames: [
        { s: [[4, 4, 'o']], expect: 'threat', m: [[1, 4, 'good'], [5, 4, 'good'], [4, 1, 'good'], [4, 5, 'good']] },
        { s: [[5, 4, 'x']] },
        { s: [[4, 5, 'o']], expect: 'win', line: [[4, 2], [4, 5]] },
      ],
    },
    st_trap: {
      rule: 'vn',
      init: [[2, 5, 'x'], [2, 6, 'x'], [6, 1, 'o'], [6, 4, 'o'], [3, 4, 'o']],
      frames: [
        { s: [[3, 6, 'x']] },
        { s: [[6, 2, 'o']], m: [[6, 2, 'bad']] },
        { s: [[4, 7, 'x']] },
        { s: [[6, 3, 'o']], expect: 'win', line: [[6, 1], [6, 4]] },
      ],
    },
  };
  // Vị trí X3 của 13 thế trực chỉ (O2 ở (4,3)) và 13 thế gián chỉ (O2 ở (5,3)), theo thứ tự tên
  const OPENINGS = {
    direct: { o2: [4, 3], x3: [[4, 2], [5, 2], [6, 2], [5, 3], [6, 3], [5, 4], [6, 4], [4, 5], [5, 5], [6, 5], [4, 6], [5, 6], [6, 6]],
      xwin: [1, 2, 4, 6, 7], owin: [13] },
    indirect: { o2: [5, 3], x3: [[6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [5, 4], [5, 5], [5, 6], [4, 5], [4, 6], [3, 5], [3, 6], [2, 6]],
      xwin: [2, 3, 4, 6, 7, 8, 10], owin: [13] },
  };
  const CaroLearnDemos = { DEMOS, OPENINGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroLearnDemos;
  else global.CaroLearnDemos = CaroLearnDemos;
})(typeof window !== 'undefined' ? window : globalThis);
