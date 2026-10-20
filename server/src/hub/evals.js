/*
 * Bộ nhớ điểm dùng chung cho phân tích ván bằng Rapfi (server/src/evalcache.js – cách giữ an toàn ghi ở đó).
 * Tin nhắn (chạy ngầm: sai / quá nhanh thì bỏ qua, không báo lỗi):
 *   evalGet { rid, rule, eng, nodes, list: [moves, …] } → { t: 'evalGot', rid, hits: [{ i, move, score, mate }] }
 *            ai cũng hỏi được (kể cả khách) – tối đa 1 lần / GET_MS mỗi kết nối
 *   evalPut { rule, eng, nodes, items: [{ moves, move, score, mate }] } → { t: 'evalPut', accepted, confirmed }
 *            chỉ tài khoản tạo ≥ MIN_AGE (chống tạo tài khoản ảo để tự xác nhận), tối đa 1 lần / PUT_MS và PUT_HOUR thế
 *            mỗi giờ mỗi tài khoản
 */
'use strict';
const { EvalCache } = require('../evalcache.js');
const { uidOf } = require('./shared.js');

const GET_MS = 400, PUT_MS = 2000, PUT_HOUR = 3000;
const MIN_AGE = 24 * 3600 * 1000;

class Evals {
  evalCache() {
    return this.evalStore || (this.evalStore = new EvalCache(this.store.db));
  }

  /** true nếu kết nối gọi lệnh key chưa tới ms kể từ lần trước (bỏ qua lặng lẽ, khác throttle() báo lỗi). */
  evalBusy(conn, key, ms) {
    const now = Date.now(), t = conn.evalAt || (conn.evalAt = {});
    if (t[key] && now - t[key] < ms * this.T.THROTTLE_SCALE) return true;
    t[key] = now;
    return false;
  }

  on_evalGet(conn, { rid, rule, eng, nodes, list } = {}) {
    if (this.evalBusy(conn, 'get', GET_MS)) return;
    const hits = this.evalCache().lookup(rule, eng, nodes, list);
    conn.send({ t: 'evalGot', rid: typeof rid === 'number' ? rid : null, hits });
  }

  on_evalPut(conn, { rule, eng, nodes, items } = {}) {
    const uid = uidOf(conn.pid);
    const u = uid && this.store.users.get(uid);
    if (!u || !(Date.now() - (u.created || 0) >= MIN_AGE) || this.evalBusy(conn, 'put', PUT_MS)) return;
    if (!Array.isArray(items)) return;
    // Hạn mức mỗi giờ theo tài khoản (nhiều kết nối / thiết bị dùng chung một hạn mức)
    const now = Date.now(), q = this.evalQuota || (this.evalQuota = new Map());
    let b = q.get(u.id);
    if (!b || now - b.t > 3600 * 1000) { b = { t: now, n: 0 }; q.set(u.id, b); }
    if (b.n + items.length > PUT_HOUR) return;
    b.n += items.length;
    const r = this.evalCache().submit(EvalCache.who(u.id), rule, eng, nodes, items);
    conn.send({ t: 'evalPut', ...r });
  }

  /** Dọn bộ nhớ điểm (gọi từ sweep mỗi phút; thật sự dọn mỗi giờ). */
  evalSweep(now) {
    if (this.evalSwept && now - this.evalSwept < 3600 * 1000) return;
    this.evalSwept = now;
    this.evalCache().prune(now);
    if (this.evalQuota) for (const [k, b] of this.evalQuota) if (now - b.t > 3600 * 1000) this.evalQuota.delete(k);
  }
}

module.exports = { Evals };
