/*
 * Thang nhân vật máy – đồng bộ tiến độ theo tài khoản (cách gộp: caro/bot-ladder-core.js; lưu: store-sync.js 'ladder').
 * Ván với máy chơi trên thiết bị nên máy chủ không tự biết thắng thua: tiến độ do trình duyệt gửi lên, máy chủ chỉ gộp
 * (lấy bậc cao hơn mỗi luật) – không dùng cho xếp hạng hay phần thưởng nào, nên không cần chống gian.
 * Tin nhắn: ladderSync { data } → { t: 'ladder', data } (data đã gộp; gửi data rỗng để chỉ lấy về).
 */
'use strict';
const LD = require('../../../caro/bot-ladder-core.js');

class Ladder {
  on_ladderSync(conn, { data } = {}) {
    const me = this.requireUser(conn);
    this.throttle(conn, 'ladder', 1000);
    const merged = LD.merge(this.store.kvGet(me.id, 'ladder'), data);
    this.store.kvSet(me.id, 'ladder', merged);
    conn.send({ t: 'ladder', data: merged });
  }
}

module.exports = { Ladder };
