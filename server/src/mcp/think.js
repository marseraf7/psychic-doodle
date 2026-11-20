/*
 * Hàng đợi máy cờ cho connector MCP: một (hoặc vài) luồng phụ think-worker.js, mỗi luồng làm một việc một lúc.
 *  - Hàng đợi có giới hạn (MAX_QUEUE): đầy thì báo "đang bận" ngay, không để việc dồn lại làm chậm máy chủ.
 *  - Mỗi việc có hạn cứng (HARD_MS): quá hạn thì huỷ luồng, tạo luồng mới, báo lỗi rõ ràng.
 *  - Luồng được tạo khi cần lần đầu (máy chủ không bật connector thì không tốn RAM).
 *  - Mỗi IP giữ tối đa PER_KEY việc (đang chờ + đang chạy): một IP không chiếm hết máy cờ.
 *  - Yêu cầu HTTP bị huỷ (khách đóng kết nối): việc đang chờ rời hàng đợi, việc đang chạy thì dừng luồng (tạo luồng mới).
 *    IP + tín hiệu huỷ của yêu cầu đến qua requestCtx (AsyncLocalStorage – http.js đặt quanh mỗi yêu cầu).
 * Số luồng: env CARO_MCP_WORKERS (mặc định 1 – máy chủ nhỏ; ván online vẫn có lõi CPU chính).
 */
'use strict';
const path = require('path');
const { Worker } = require('worker_threads');
const { AsyncLocalStorage } = require('async_hooks');

/** Ngữ cảnh của yêu cầu HTTP đang xử lý: { key: IP, signal: AbortSignal } (http.js). */
const requestCtx = new AsyncLocalStorage();

const WORKER_FILE = path.join(__dirname, 'think-worker.js');

class BusyError extends Error {}

class Thinker {
  constructor({ workers = Number(process.env.CARO_MCP_WORKERS) || 1, maxQueue = 6, hardMs = 6000, perKey = 2 } = {}) {
    this.size = Math.max(1, Math.min(4, workers));
    this.perKey = perKey;
    this.maxQueue = maxQueue;
    this.hardMs = hardMs;
    this.pool = []; // { w, job | null }
    this.queue = [];
    this.seq = 0;
  }

  /** Số việc (đang chờ + đang chạy) của một khoá (IP). */
  held(key) {
    return this.queue.filter((q) => q.key === key).length + this.pool.filter((s) => s.cur && s.cur.key === key).length;
  }

  /**
   * Gửi một việc; trả về Promise kết quả. Hàng đợi đầy hoặc IP đã giữ đủ PER_KEY việc: BusyError. Yêu cầu bị huỷ: lỗi
   * 'aborted' (việc rời hàng đợi / luồng đang chạy nó bị dừng). IP + tín hiệu huỷ lấy từ requestCtx nếu không truyền.
   */
  run(job, ctx = requestCtx.getStore() || {}) {
    const key = ctx.key || null, signal = ctx.signal || null;
    if (this.queue.length >= this.maxQueue) return Promise.reject(new BusyError('busy'));
    if (key != null && this.held(key) >= this.perKey) return Promise.reject(new BusyError('busy'));
    if (signal && signal.aborted) return Promise.reject(new Error('aborted'));
    return new Promise((resolve, reject) => {
      const item = { job: { ...job, id: ++this.seq }, key, resolve, reject };
      if (signal) {
        const onAbort = () => this.abort(item);
        signal.addEventListener('abort', onAbort, { once: true });
        item.off = () => signal.removeEventListener('abort', onAbort);
      }
      this.queue.push(item);
      this.pump();
    });
  }

  /** Huỷ một việc: đang chờ thì bỏ khỏi hàng đợi; đang chạy thì dừng luồng (pump tạo luồng mới cho việc sau). */
  abort(item) {
    const i = this.queue.indexOf(item);
    if (i >= 0) { this.queue.splice(i, 1); item.reject(new Error('aborted')); return; }
    const slot = this.pool.find((s) => s.cur === item);
    if (slot) { this.fail(slot, new Error('aborted')); slot.w.terminate(); }
  }

  spawn() {
    const slot = { w: new Worker(WORKER_FILE), cur: null, timer: null };
    slot.w.on('message', (msg) => {
      const cur = slot.cur;
      if (!cur || msg.id !== cur.job.id) return;
      this.finish(slot);
      if (msg.ok) cur.resolve(msg.result); else cur.reject(new Error(msg.error));
    });
    slot.w.on('error', (e) => this.fail(slot, e));
    slot.w.on('exit', () => this.fail(slot, new Error('engine stopped')));
    slot.w.unref(); // không giữ tiến trình sống chỉ vì luồng phụ (gọi SAU khi gắn 'message' – gắn sau sẽ ref lại cổng)
    this.pool.push(slot);
    return slot;
  }

  finish(slot) {
    clearTimeout(slot.timer);
    if (slot.cur && slot.cur.off) slot.cur.off();
    slot.cur = null;
    setImmediate(() => this.pump());
  }

  /** Luồng lỗi / bị huỷ: bỏ khỏi nhóm, báo lỗi việc đang làm. */
  fail(slot, err) {
    const i = this.pool.indexOf(slot);
    if (i < 0) return;
    this.pool.splice(i, 1);
    const cur = slot.cur;
    this.finish(slot);
    if (cur) cur.reject(err);
  }

  pump() {
    while (this.queue.length) {
      let slot = this.pool.find((s) => !s.cur);
      if (!slot && this.pool.length < this.size) slot = this.spawn();
      if (!slot) return;
      const item = this.queue.shift();
      slot.cur = item;
      slot.timer = setTimeout(() => { this.fail(slot, new Error('engine timeout')); slot.w.terminate(); }, this.hardMs);
      slot.w.postMessage(item.job);
    }
  }

  async close() {
    const all = this.pool.splice(0);
    for (const q of this.queue.splice(0)) { if (q.off) q.off(); q.reject(new Error('closed')); }
    await Promise.all(all.map((s) => { clearTimeout(s.timer); return s.w.terminate(); }));
  }
}

module.exports = { Thinker, BusyError, requestCtx };
