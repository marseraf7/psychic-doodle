/*
 * Đồng bộ tiến độ với tài khoản (A5): Giải đố (caro.puzzles – puzzles.js), Puzzle Storm (caro.storm – storm.js), chuỗi
 * ngày chơi + huy hiệu (caro.habits – habits.js), thang nhân vật máy (caro.ladder – bot-ladder.js). Vẫn lưu trên máy như cũ (khách, mất mạng: chỉ trên máy).
 *  – Đăng nhập (tin welcome có tài khoản): gửi bản trên máy; máy chủ gộp với bản đã lưu (progress-merge.js – không bao giờ
 *    mất tiến độ: số lớn nhất, hợp các tập) và trả lại; máy gộp lần nữa, ghi vào localStorage rồi báo 'caro:progress' để các
 *    module đọc lại.
 *  – Đổi tiến độ trên máy (các module gọi CaroProgressSync.dirty()): gửi lên sau vài giây (gom nhiều lần đổi).
 *  – Máy dùng chung (quán net, máy gia đình): tiến độ trên máy đã gắn với tài khoản A ('caro.progressOwner') mà tài khoản B
 *    đăng nhập thì KHÔNG gửi bản trên máy lên B (không trộn tiến độ / huy hiệu của A vào B) – chỉ xin bản của B và thay
 *    phần đồng bộ trên máy bằng bản đó (tiến độ của A vẫn nằm trong tài khoản A). Máy chưa gắn tài khoản nào (chơi khi
 *    chưa đăng nhập) thì gộp vào tài khoản đăng nhập đầu tiên như thường.
 * window.CaroProgressSync = { dirty, canSync, local, apply }.
 */
(function () {
  'use strict';
  const P = window.CaroProgress;
  const N = window.CaroOnline;
  const KEYS = { pz: 'caro.puzzles', storm: 'caro.storm', habits: 'caro.habits', ladder: 'caro.ladder' };
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const OWNER = 'caro.progressOwner'; // tài khoản (uid) mà tiến độ trên máy đang thuộc về
  const owner = () => { try { return localStorage.getItem(OWNER) || ''; } catch (e) { return ''; } };
  const setOwner = (uid) => { try { localStorage.setItem(OWNER, uid); } catch (e) { /* riêng tư */ } };

  function local() {
    const out = {};
    for (const [f, k] of Object.entries(KEYS)) out[f] = read(k) || {};
    return out;
  }
  /** Gộp bản từ máy chủ vào máy (replace: thay hẳn phần đồng bộ – máy đổi tài khoản); chỉ ghi phần đổi, báo các module đọc lại. */
  function apply(data, replace) {
    const cur = local();
    const m = replace ? P.clean(data) : P.merge(cur, data);
    let changed = false;
    for (const [f, k] of Object.entries(KEYS)) {
      // Giữ các trường chỉ máy này dùng (không đồng bộ) – ghi đè phần đồng bộ lên trên
      const next = { ...(cur[f] || {}), ...m[f] };
      if (JSON.stringify(next) === JSON.stringify(cur[f])) continue;
      try { localStorage.setItem(k, JSON.stringify(next)); changed = true; } catch (e) { /* riêng tư */ }
    }
    if (changed) window.dispatchEvent(new Event('caro:progress'));
    return m;
  }

  const uid = () => (N && N.state.me && !N.state.me.guest && N.state.me.uid) || '';
  const canSync = () => !!(N && N.connected && uid());
  // Máy chủ nhận tối đa 1 lần / 2 giây: gửi sớm quá thì hẹn lại
  let timer = 0, lastPush = 0, swap = false; // swap: đang chờ bản của tài khoản mới (máy đổi tài khoản) – chưa gửi bản trên máy
  function push() {
    if (!canSync()) return;
    const wait = lastPush + 2500 - Date.now();
    if (wait > 0) { clearTimeout(timer); timer = setTimeout(push, wait); return; }
    lastPush = Date.now();
    const me = uid(), was = owner();
    swap = !!was && was !== me;
    N.send({ t: 'progressSync', data: swap ? {} : local() });
  }
  function dirty() {
    if (!canSync()) return;
    clearTimeout(timer);
    timer = setTimeout(push, 4000);
  }

  if (N) {
    N.on('welcome', () => { if (canSync()) { clearTimeout(timer); timer = setTimeout(push, 300); } });
    N.on('progress', (m) => {
      if (!m.data) return;
      apply(m.data, swap);
      swap = false;
      if (uid()) setOwner(uid());
    });
  }
  window.CaroProgressSync = { dirty, canSync, local, apply };
})();
