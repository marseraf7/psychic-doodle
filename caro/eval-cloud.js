/*
 * Bộ nhớ điểm dùng chung trên máy chủ cho phân tích ván bằng Rapfi (như "cloud eval" của Lichess – máy chủ:
 * server/src/evalcache.js, tin nhắn evalGet / evalPut). Thế nào đã có người chấm (cùng bản engine, cùng số nút) và được
 * hai tài khoản xác nhận thì lấy ngay, khỏi chấm lại; chấm xong thì gửi kết quả lên. Chỉ khi đã đăng nhập (xem
 * privacy.html). Chạy ngầm: không kết nối / máy chủ chậm thì coi như không có, phân tích vẫn chạy bình thường trên máy.
 *   CaroEvalCloud.get(rule, nodes, list) → Promise<Map(chỉ số trong list → { move, score, mate })> · list: [moves, …]
 *   CaroEvalCloud.put(rule, nodes, items)  · items: [{ moves, move, score, mate }]
 * Thế cờ gửi lên chỉ là các nước đi (không kèm tên người chơi / ván nào).
 */
(function (global) {
  'use strict';
  const O = () => global.CaroOnline;
  const ENGINE = () => global.CaroEvalKey && global.CaroEvalKey.ENGINE;
  const CHUNK = 200; // máy chủ nhận tối đa 200 thế mỗi tin (evalcache.js MAX_LIST)
  const GET_GAP = 450, PUT_GAP = 2100; // giới hạn tần suất của máy chủ (evals.js: 400 ms / 2 giây)
  const WAIT = 2500; // chờ trả lời tối đa – quá thì chấm trên máy như thường
  let rid = 0, hooked = false;
  const pending = new Map();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Chỉ khi đã đăng nhập (trang quyền riêng tư: chưa đăng nhập thì phân tích chỉ chạy trên máy)
  const ready = () => {
    const o = O(), S = o && o.state;
    return !!(o && o.connected && ENGINE() && S && S.me && !S.me.guest);
  };
  function hook() {
    if (hooked || !O()) return;
    hooked = true;
    O().on('evalGot', (m) => {
      const p = pending.get(m.rid);
      if (p) { pending.delete(m.rid); p(m.hits || []); }
    });
  }

  let lastGet = 0, lastPut = 0;
  async function ask(rule, nodes, list) {
    const wait = lastGet + GET_GAP - Date.now();
    if (wait > 0) await sleep(wait);
    lastGet = Date.now();
    const id = ++rid;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { pending.delete(id); resolve([]); }, WAIT);
      pending.set(id, (hits) => { clearTimeout(timer); resolve(hits); });
      if (!ready() || !O().send({ t: 'evalGet', rid: id, rule, eng: ENGINE(), nodes, list })) { clearTimeout(timer); pending.delete(id); resolve([]); }
    });
  }

  async function get(rule, nodes, list) {
    const out = new Map();
    if (!list.length || !ready()) return out;
    hook();
    for (let k = 0; k < list.length && ready(); k += CHUNK) {
      for (const h of await ask(rule, nodes, list.slice(k, k + CHUNK))) {
        if (h && Number.isInteger(h.i) && Array.isArray(h.move)) out.set(k + h.i, { move: h.move, score: h.score, mate: h.mate === undefined ? null : h.mate });
      }
    }
    return out;
  }

  async function put(rule, nodes, items) {
    if (!items.length || !ready()) return;
    for (let k = 0; k < items.length && ready(); k += CHUNK) {
      const wait = lastPut + PUT_GAP - Date.now();
      if (wait > 0) await sleep(wait);
      lastPut = Date.now();
      O().send({ t: 'evalPut', rule, eng: ENGINE(), nodes, items: items.slice(k, k + CHUNK) });
    }
  }

  global.CaroEvalCloud = { get, put };
})(window);
