/*
 * Bù trễ mạng cho đồng hồ ván online (Issue #110 P1 – học ý tưởng của Lichess, code viết riêng).
 *
 * Người chơi ở xa máy chủ (vd. từ Nga tới máy chủ ở Mỹ) mất một chiều đường truyền lúc nhận nước của đối thủ và một
 * chiều lúc gửi nước của mình: máy chủ tính thời gian nghĩ = nghĩ thật + thời gian khứ hồi (RTT). Mỗi nước máy chủ
 * cộng trả lại RTT đã đo, có trần:
 *  - LagMeter: RTT của một kết nối, do **máy chủ tự đo** bằng gói ping của giao thức WebSocket (server.js). Trình
 *    duyệt tự trả lời gói này, JS của trang không làm chậm được; máy khách không gửi số đo nào lên.
 *  - lagCaps(room): trần bù mỗi nước và tổng trần cả ván, theo loại thời gian. Máy khách sửa đổi cố trả lời chậm để
 *    được cộng giờ thì cũng chỉ được tới trần.
 */
'use strict';

const SAMPLE_MAX = 5000; // một lần đo quá lớn (mạng chập chờn) chỉ tính tới mức này
const SMOOTH = 0.25; // làm mượt: mỗi lần đo mới chiếm 1/4
const MOVE_MIN = 250, MOVE_MAX = 1000; // trần bù mỗi nước (ms)
const GAME_MIN = 5000; // tổng trần cả ván tối thiểu (ms)

class LagMeter {
  constructor() {
    this.avg = null; // RTT làm mượt (ms)
    this.n = 0; // số lần đã đo
  }

  sample(ms) {
    if (!(ms >= 0)) return;
    const s = Math.min(ms, SAMPLE_MAX);
    this.avg = this.avg == null ? s : this.avg + (s - this.avg) * SMOOTH;
    this.n++;
  }

  /** RTT ước lượng (ms); chưa đo lần nào thì null. */
  get value() { return this.avg == null ? null : Math.round(this.avg); }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Trần bù của một phòng: { move, game } (ms). Tính theo giây "thật" của loại thời gian (không theo secondMs thu nhỏ
 * của test), vì trễ mạng là thời gian thật.
 *  - Đồng hồ tổng: ước lượng cả ván = base + 40 lần cộng giờ; mỗi nước bù tới 0,3% (250 ms – 1 giây), cả ván tới 10%
 *    (ít nhất 5 giây). Vd. 1+0: 250 ms / 6 giây; 3+2: 780 ms / 26 giây; 10+0: 1 giây / 60 giây.
 *  - Giới hạn mỗi nước: mỗi nước tới 3% của lượt (250 ms – 1 giây), không có trần cả ván (lượt nào cũng như lượt nào).
 */
function lagCaps(room) {
  const scale = 1000 / (room.secondMs || 1000);
  if (room.clock) {
    const total = (room.clock.base + 40 * room.clock.inc) * scale;
    return { move: clamp(total * 0.003, MOVE_MIN, MOVE_MAX), game: Math.max(GAME_MIN, total * 0.1) };
  }
  if (room.timeLimit) return { move: clamp(room.timeLimit * 1000 * 0.03, MOVE_MIN, MOVE_MAX), game: Infinity };
  return { move: 0, game: 0 };
}

module.exports = { LagMeter, lagCaps, SAMPLE_MAX };
