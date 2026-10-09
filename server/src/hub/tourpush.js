/*
 * Gửi cập nhật trang giải cho người đang xem – phải nhẹ để chạy được trên VPS nhỏ với giải tới 512 người:
 *   - gom các thay đổi liền nhau: giải nhỏ ~0,3 giây, giải đông người giãn dần tới 2 giây;
 *   - trang giải chia phần chung (giống mọi người xem, dựng một lần) và phần riêng từng người (nhỏ);
 *   - chỉ gửi phần đổi so với lần gửi trước ("bản vá": trận đổi, dòng bảng xếp hạng đổi, người chơi đổi…);
 *     ai mới mở trang giải thì nhận bản đầy đủ, rồi nhận thêm một bản đầy đủ ở lần cập nhật kế tiếp
 *     (để chắc chắn khớp với bản mọi người đang có). Áp bản vá: caro/tour-patch.js (dùng chung với client).
 */
'use strict';
const { uidOf } = require('./shared.js');

/** Chuỗi JSON của một dòng bảng xếp hạng, bỏ hạng (client tính lại theo vị trí). */
const rowJson = (r) => JSON.stringify({ ...r, rank: 0 });
const isMatch = (x) => x && typeof x === 'object' && 'wa' in x && 'id' in x;

/** Tách một giai đoạn thành: khung (không có nội dung trận / bảng), từng trận, từng bảng xếp hạng. */
function stageParts(v) {
  const matches = new Map();
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (isMatch(x)) matches.set(x.id, x);
  };
  walk([v.rounds, v.lrounds, v.gf, v.third, (v.groups || []).map((g) => g.rounds)]);
  const tables = v.table ? [{ key: 't', rows: v.table }] : (v.groups || []).map((g, i) => ({ key: 'g' + i, rows: g.table }));
  return {
    skel: JSON.stringify(v, (k, x) => (isMatch(x) ? x.id : k === 'table' || k === 'done' ? null : x)),
    done: v.done,
    matches: new Map([...matches].map(([id, m]) => [id, { obj: m, json: JSON.stringify(m) }])),
    tables: tables.map((tb) => ({ key: tb.key, order: tb.rows.map((r) => r.uid).join(','), rows: tb.rows, json: new Map(tb.rows.map((r) => [r.uid, rowJson(r)])) })),
  };
}

/** Tách cả trang giải (phần chung) để so lần sau. */
function viewParts(shared) {
  const top = {};
  for (const [k, v] of Object.entries(shared)) if (k !== 'players' && k !== 'stageViews' && k !== 'now') top[k] = JSON.stringify(v);
  return {
    top,
    order: shared.players.map((p) => p.uid).join(','),
    players: new Map(shared.players.map((p) => [p.uid, JSON.stringify(p)])),
    stages: shared.stageViews.map(stageParts),
  };
}

/** Bản vá từ lần trước (prev) tới bây giờ (next). */
function diffParts(prev, next, shared) {
  const patch = { now: shared.now };
  for (const k of Object.keys(next.top)) if (prev.top[k] !== next.top[k]) patch[k] = shared[k];
  const upd = shared.players.filter((p) => prev.players.get(p.uid) !== next.players.get(p.uid));
  if (upd.length) patch.playerUpd = upd;
  if (prev.order !== next.order) patch.playerOrder = shared.players.map((p) => p.uid);
  const stages = [];
  next.stages.forEach((st, i) => {
    const old = prev.stages[i];
    if (!old || old.skel !== st.skel) { stages.push({ index: i, full: shared.stageViews[i] }); return; }
    const s = { index: i };
    if (old.done !== st.done) s.done = st.done;
    const matches = [];
    for (const [id, m] of st.matches) if (old.matches.get(id)?.json !== m.json) matches.push(m.obj);
    if (matches.length) s.matches = matches;
    const tables = [];
    st.tables.forEach((tb, j) => {
      const o = old.tables[j];
      const rows = tb.rows.filter((r) => o.json.get(r.uid) !== tb.json.get(r.uid));
      const order = o.order !== tb.order;
      if (rows.length || order) tables.push({ key: tb.key, ...(rows.length ? { rows } : {}), ...(order ? { order: tb.rows.map((r) => r.uid) } : {}) });
    });
    if (tables.length) s.tables = tables;
    if (Object.keys(s).length > 1) stages.push(s);
  });
  if (stages.length) patch.stages = stages;
  return patch;
}

class TourPush {
  pushTour(t) {
    if (this.closed) return;
    if (!this.tourPushTimers) this.tourPushTimers = new Map();
    if (this.tourPushTimers.has(t.id)) return;
    const timer = setTimeout(() => {
      this.tourPushTimers.delete(t.id);
      if (!this.closed) this.flushTour(t.id);
    }, this.pushDelay(t));
    timer.unref?.();
    this.tourPushTimers.set(t.id, timer);
  }

  /** Nhịp gom cập nhật: 4 ms mỗi người, tối thiểu TOUR_PUSH_MS, tối đa 2 giây (512 người). */
  pushDelay(t) {
    const n = t.players.filter((p) => !p.withdrawn).length;
    return Math.max(this.T.TOUR_PUSH_MS, Math.min(2000, n * 4));
  }

  /** Người vừa mở trang giải: bản đầy đủ ngay, và bản đầy đủ thêm một lần ở cập nhật kế tiếp. */
  watchTour(conn, t, uid) {
    conn.watchTour = t.id;
    conn.tourFull = true;
    conn.send({ t: 'tour', id: t.id, tour: this.tourView(t, uid) });
  }

  /** Gửi cập nhật: phần chung (đầy đủ hoặc bản vá) chuyển JSON một lần, mỗi người xem chỉ thêm phần riêng. */
  flushTour(id) {
    if (!this.tourSnaps) this.tourSnaps = new Map();
    const t = this.tours.get(id);
    const watchers = [];
    for (const set of this.byPid.values()) for (const conn of set) if (conn.watchTour === id) watchers.push(conn);
    if (!watchers.length || !t) {
      this.tourSnaps.delete(id); // không ai xem: bỏ bản lưu để đỡ tốn bộ nhớ (lần sau gửi đầy đủ)
      for (const conn of watchers) conn.send({ t: 'tour', id, tour: null });
      return;
    }
    const shared = this.tourShared(t);
    const next = viewParts(shared);
    const prev = this.tourSnaps.get(id);
    this.tourSnaps.set(id, next);
    let fullHead = null, patchHead = null;
    for (const conn of watchers) {
      const uid = uidOf(conn.pid);
      if (!this.canSeeTour(t, uid)) { conn.send({ t: 'tour', id, tour: null }); continue; }
      let head;
      if (!prev || conn.tourFull) {
        fullHead = fullHead || `{"t":"tour","id":${JSON.stringify(id)},"tour":${JSON.stringify(shared)},"mine":`;
        head = fullHead;
        conn.tourFull = false;
      } else {
        patchHead = patchHead || `{"t":"tourPatch","id":${JSON.stringify(id)},"patch":${JSON.stringify(diffParts(prev, next, shared))},"mine":`;
        head = patchHead;
      }
      const raw = head + JSON.stringify(this.tourMine(t, uid)) + '}';
      if (conn.sendRaw) conn.sendRaw(raw); else conn.send(JSON.parse(raw));
    }
  }
}

module.exports = { TourPush, viewParts, diffParts };
