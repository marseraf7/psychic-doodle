/*
 * Hàng đợi máy cờ cho connector MCP: một (hoặc vài) luồng phụ think-worker.js, mỗi luồng làm một việc một lúc.
 *  - Hàng đợi có giới hạn (MAX_QUEUE): đầy thì báo "đang bận" ngay, không để việc dồn lại làm chậm máy chủ.
 *  - Mỗi việc có hạn cứng (HARD_MS): quá hạn thì huỷ luồng, tạo luồng mới, báo lỗi rõ ràng.
 *  - Luồng được tạo khi cần lần đầu (máy chủ không bật connector thì không tốn RAM).
 * Số luồng: env CARO_MCP_WORKERS (mặc định 1 – máy chủ nhỏ; ván online vẫn có lõi CPU chính).
 */
'use strict';
const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_FILE = path.join(__dirname, 'think-worker.js');

class BusyError extends Error {}

class Thinker {
  constructor({ workers = Number(process.env.CARO_MCP_WORKERS) || 1, maxQueue = 6, hardMs = 6000 } = {}) {
    this.size = Math.max(1, Math.min(4, workers));
    this.maxQueue = maxQueue;
    this.hardMs = hardMs;
    this.pool = []; // { w, job | null }
    this.queue = [];
    this.seq = 0;
  }

  /** Gửi một việc; trả về Promise kết quả. Hàng đợi đầy: BusyError. */
  run(job) {
    if (this.queue.length >= this.maxQueue) return Promise.reject(new BusyError('busy'));
    return new Promise((resolve, reject) => {
      this.queue.push({ job: { ...job, id: ++this.seq }, resolve, reject });
      this.pump();
    });
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
    for (const q of this.queue.splice(0)) q.reject(new Error('closed'));
    await Promise.all(all.map((s) => { clearTimeout(s.timer); return s.w.terminate(); }));
  }
}

module.exports = { Thinker, BusyError };
