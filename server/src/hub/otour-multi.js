/*
 * Giải đấu Offline – "giải tổng" gom nhiều giải con (đợt 5: giải đa môn kiểu Esports World Cup – chỉ mô phỏng thể thức).
 * Giải tổng là một bản ghi giải offline có `t.multi = { table, children, st }`: không có trận của riêng nó; mỗi giải con
 * là một giải offline bình thường (thể thức riêng) mang `t.parent = <mã giải tổng>`.
 *   - Câu lạc bộ: mỗi đội ở giải con thuộc một câu lạc bộ = cột thứ 3 "Đội" của danh sách (bỏ trống: tên đội).
 *   - Bảng điểm câu lạc bộ: giải con kết thúc thì mỗi câu lạc bộ nhận điểm theo thứ hạng chung cuộc của đội xếp cao
 *     nhất của mình ở giải đó (bảng điểm `table` theo hạng – mặc định 1000-750-500-300-200-150-100-50; đồng hạng thì
 *     cùng nhận điểm của hạng đó: đồng hạng 3 nhận 500, đồng hạng 5 nhận 200); cộng dồn qua các giải con; bằng điểm thì
 *     xét số lần đạt hạng cao hơn (nhiều hạng nhất hơn, rồi hạng nhì…).
 *   - Điều kiện xếp hạng (t.multi.minTop, needWin – như giải vô địch câu lạc bộ của Esports World Cup): câu lạc bộ phải
 *     có điểm ở ít nhất `minTop` giải con mới được xếp hạng; `needWin`: phải vô địch ít nhất một giải con mới được đứng đầu.
 *   - Trang tổng: bảng điểm câu lạc bộ, các giải con (trạng thái, nhà vô địch), lịch thi đấu gộp các trận sắp tới.
 *   - Giải con không tính vào hạn mức số giải của tài khoản (store-otour.js – countActiveOTours); tối đa MAX_CHILDREN.
 * Giải con riêng tư không hiện ở trang tổng (và không cộng điểm) – trang tổng ai xem được cũng thấy như nhau.
 */
'use strict';
const crypto = require('crypto');
const { E } = require('../msg.js');
const ST = require('./stages.js');
const Spec = require('./otour-spec.js');
const { cleanPublicName } = require('./shared.js');

const TABLE = [1000, 750, 500, 300, 200, 150, 100, 50];
const MAX_CHILDREN = 30;
const MAX_TABLE = 64;
const MAX_SCHED = 40;
const MAX_KIDS_PER_DAY = 100; // giải con không tính hạn mức giải thường, nhưng vẫn có trần mỗi ngày
const real = (u) => typeof u === 'string' && u !== '-' && u !== '';

/** Bảng điểm theo hạng: số nguyên 0–100000, tối đa 64 hạng; rỗng → mặc định. */
function cleanTable(x) {
  const arr = Array.isArray(x) ? x : typeof x === 'string' ? x.split(/[\s,;]+/) : [];
  const out = arr.filter((v) => v !== '' && v != null).slice(0, MAX_TABLE).map((v) => Math.max(0, Math.min(100000, Math.floor(Number(v)) || 0)));
  return out.length ? out : [...TABLE];
}

/** Điều kiện xếp hạng câu lạc bộ: có điểm ở ít nhất minTop giải con (1 = không đòi); needWin: phải vô địch một giải mới đứng đầu. */
function cleanRule(x) {
  const n = Math.floor(Number(x && x.minTop));
  return { minTop: Number.isFinite(n) ? Math.max(1, Math.min(MAX_CHILDREN, n)) : 1, needWin: !!(x && x.needWin === true) };
}

/**
 * Thứ hạng chung cuộc của một giải đã kết thúc: [{ uid, place }] – đội bị loại cùng vòng thì đồng hạng (hai đội thua tứ
 * kết… cùng hạng 5). Loại trực tiếp: bục trao giải rồi lần ngược các vòng; vòng tròn / Thụy Sĩ / đua: bảng xếp hạng.
 */
function finalPlaces(t, seedOf) {
  const st = t.st && t.st[t.stages.length - 1];
  if (t.status !== 'finished' || !st) return [];
  const out = [], seen = new Set();
  const put = (uids, place) => { for (const u of uids) if (real(u) && !seen.has(u)) { seen.add(u); out.push({ uid: u, place }); } };
  if (st.type === 'single' || st.type === 'double') {
    const pod = t.podium && t.podium.length ? t.podium : ST.podium(st, seedOf);
    // Không có trận tranh hạng ba (loại trực tiếp): hai đội thua bán kết đồng hạng 3
    const shared3 = st.type === 'single' && !st.third;
    pod.forEach((u, i) => put([u], shared3 && i >= 2 ? 3 : i + 1));
    const rounds = st.type === 'double' ? st.lrounds || [] : st.rounds || [];
    for (let r = rounds.length - 1; r >= 0; r--) {
      const losers = rounds[r].map((id) => st.matches[id] && st.matches[id].loser).filter((u) => real(u) && !seen.has(u));
      put(losers, out.length + 1);
    }
    return out;
  }
  const tables = ST.standings(st, seedOf);
  if (tables.length === 1) tables[0].list.forEach((u, i) => put([u], i + 1));
  else (t.podium || []).forEach((u, i) => put([u], i + 1));
  return out;
}

class OTourMulti {
  /** Giải tổng mà người gửi quản lý (để thêm giải con). */
  otMultiParent(conn, id) {
    const { t } = this.otManaged(conn, id);
    if (!t.multi) throw E('ot_multi_not');
    if (t.multi.children.length >= MAX_CHILDREN) throw E('ot_multi_full', { n: MAX_CHILDREN });
    return t;
  }

  /** Hạn mức tạo giải con mỗi ngày (n giải sắp tạo). Trả hàm ghi nhận. */
  otMultiQuota(me, n) {
    const today = new Date().toISOString().slice(0, 10);
    const day = me.otKidDay && me.otKidDay.d === today ? me.otKidDay : { d: today, n: 0 };
    if (day.n + n > MAX_KIDS_PER_DAY) throw E('ot_daily_limit', { n: MAX_KIDS_PER_DAY });
    return (k = n) => { me.otKidDay = { d: today, n: day.n + k }; this.store.touch(me); };
  }

  /** Gắn giải con vào giải tổng (ghi cả hai). */
  otMultiLink(parent, child) {
    child.parent = parent.id;
    if (!parent.multi.children.includes(child.id)) parent.multi.children.push(child.id);
    parent.multi.st = { ...(parent.multi.st || {}), [child.id]: child.status };
    this.otMultiStatus(parent);
  }

  /** Trạng thái giải tổng theo các giải con: có giải đang đấu / đã xong → đang diễn ra; mọi giải con xong → kết thúc. */
  otMultiStatus(parent) {
    const ss = parent.multi.children.map((id) => (parent.multi.st || {})[id] || 'draft');
    const was = parent.status;
    parent.status = ss.length && ss.every((s) => s === 'finished') ? 'finished' : ss.some((s) => s !== 'draft') ? 'running' : 'draft';
    if (parent.status === 'finished' && was !== 'finished') parent.finishedAt = Date.now();
    if (parent.status !== 'draft' && !parent.startedAt) parent.startedAt = Date.now();
  }

  /** Giải con vừa được ghi (otour.js – otSave): cập nhật trạng thái giải tổng, báo người đang xem trang tổng. */
  otMultiChildSaved(child) {
    const parent = this.otGet(child.parent);
    if (!parent || !parent.multi || !parent.multi.children.includes(child.id)) return;
    if ((parent.multi.st || {})[child.id] !== child.status) {
      parent.multi.st = { ...(parent.multi.st || {}), [child.id]: child.status };
      this.otMultiStatus(parent);
      this.otSave(parent);
    } else this.otPush(parent);
  }

  /** Xoá giải (otour.js – on_otDelete): giải con rời giải tổng; giải tổng bị xoá thì các giải con thành giải thường. */
  otMultiForget(t) {
    if (t.parent) {
      const parent = this.otGet(t.parent);
      if (parent && parent.multi) {
        parent.multi.children = parent.multi.children.filter((id) => id !== t.id);
        if (parent.multi.st) delete parent.multi.st[t.id];
        this.otMultiStatus(parent);
        this.otSave(parent);
      }
    }
    if (t.multi) {
      for (const id of t.multi.children) {
        const c = this.otGet(id);
        if (c && c.parent === t.id) { delete c.parent; this.otSave(c); }
      }
    }
  }

  /** Tạo các giải con kèm theo khi tạo giải tổng từ mẫu: games = [{ name, spec, teams }] (bỏ qua mục sai cấu hình). */
  otMultiGames(parent, me, games) {
    const list = (Array.isArray(games) ? games : []).slice(0, 12);
    if (!list.length) return;
    const commit = this.otMultiQuota(me, list.length);
    let made = 0;
    for (const g of list) {
      const name = cleanPublicName(g && g.name).slice(0, 60);
      let spec;
      try { spec = Spec.normalizeSpec(g.spec); } catch (e) { continue; }
      if (name.length < 3 || parent.multi.children.length >= MAX_CHILDREN) continue;
      const now = Date.now();
      const c = { id: crypto.randomBytes(5).toString('hex'), kind: 'otour', name, desc: '', slug: null, access: parent.access, ...spec, owner: parent.owner,
        status: 'draft', created: now, updated: now, players: [], st: null, stage: 0, podium: null, log: [] };
      this.otAddTeams(c, g.teams);
      this.otMultiLink(parent, c);
      this.otAdd(c, me.id);
      made++;
    }
    commit(made);
  }

  /** Sửa bảng điểm theo hạng của giải tổng. */
  on_otMultiCfg(conn, { id, table, minTop, needWin }) {
    const { t, me } = this.otManaged(conn, id);
    if (!t.multi) throw E('ot_multi_not');
    t.multi.table = cleanTable(table);
    Object.assign(t.multi, cleanRule({ minTop, needWin }));
    this.otLog(t, me.id, 'multi_cfg');
    this.otSave(t);
  }

  /** Gắn một giải có sẵn của mình vào giải tổng. */
  on_otMultiAttach(conn, { id, child }) {
    const parent = this.otMultiParent(conn, id);
    const { t: c, me } = this.otManaged(conn, child);
    if (c.multi || c.parent || c.id === parent.id) throw E('ot_multi_bad_child');
    this.otMultiLink(parent, c);
    this.otLog(parent, me.id, 'multi_add', { name: c.name });
    this.otSave(c);
    this.otSave(parent);
  }

  /** Gỡ một giải con khỏi giải tổng (giải con vẫn còn, thành giải thường). */
  on_otMultiDetach(conn, { id, child }) {
    const { t: parent, me } = this.otManaged(conn, id);
    if (!parent.multi || !parent.multi.children.includes(child)) throw E('bad_message');
    const c = this.otGet(child);
    // Giải con chưa kết thúc rời giải tổng sẽ tính vào hạn mức giải thường của chủ giải
    if (c && c.status !== 'finished') this.otActiveCheck(c.owner);
    parent.multi.children = parent.multi.children.filter((x) => x !== child);
    if (parent.multi.st) delete parent.multi.st[child];
    this.otMultiStatus(parent);
    if (c && c.parent === parent.id) { delete c.parent; this.otSave(c); }
    this.otLog(parent, me.id, 'multi_del', { name: c ? c.name : '?' });
    this.otSave(parent);
  }

  /** Kết quả một giải con cho bảng điểm: câu lạc bộ → hạng tốt nhất (nhớ theo lần ghi cuối của giải con). */
  otMultiResult(c) {
    if (!this.otMultiMemo) this.otMultiMemo = new Map();
    const hit = this.otMultiMemo.get(c.id);
    if (hit && hit.v === c.updated) return hit.r;
    const club = new Map(c.players.map((p) => [p.uid, p.team || p.name]));
    const best = new Map(); // khoá chữ thường → { name, place }
    for (const { uid, place } of finalPlaces(c, this.otSeedOf(c))) {
      const name = club.get(uid);
      if (!name) continue;
      const k = name.toLowerCase();
      if (!best.has(k) || place < best.get(k).place) best.set(k, { name, place });
    }
    const r = [...best.values()];
    this.otMultiMemo.set(c.id, { v: c.updated, r });
    if (this.otMultiMemo.size > 500) this.otMultiMemo.delete(this.otMultiMemo.keys().next().value);
    return r;
  }

  /** Phần giải tổng gửi cho người xem: bảng điểm câu lạc bộ, các giải con, lịch gộp. */
  otMultiView(t) {
    const table = t.multi.table;
    const kids = t.multi.children.map((id) => this.otGet(id)).filter((c) => c && c.parent === t.id && c.access !== 'private');
    const clubs = new Map();
    const sched = [];
    const children = kids.map((c) => {
      const name = new Map(c.players.map((p) => [p.uid, p.name]));
      for (const x of this.otMultiResult(c)) {
        const k = x.name.toLowerCase();
        if (!clubs.has(k)) clubs.set(k, { name: x.name, pts: 0, res: {}, cnt: [], scored: 0 });
        const cl = clubs.get(k), pts = table[x.place - 1] || 0;
        cl.pts += pts;
        if (pts > 0) cl.scored++;
        cl.res[c.id] = { place: x.place, pts };
        cl.cnt[x.place - 1] = (cl.cnt[x.place - 1] || 0) + 1;
      }
      // Lịch gộp: các trận chưa đấu đã có giờ
      if (c.status === 'running') {
        for (const st of c.st || []) for (const m of Object.values((st && st.matches) || {})) {
          if (m.when && !m.done && real(m.a) && real(m.b)) sched.push({ id: c.id, game: c.name, when: m.when, venue: m.venue || null, a: name.get(m.a) || '?', b: name.get(m.b) || '?' });
        }
      }
      const champ = c.status === 'finished' && c.podium && c.podium[0];
      return { id: c.id, slug: c.slug || null, name: c.name, sport: c.sport, status: c.status, n: c.players.length, ...(champ ? { champ: name.get(champ) || '?' } : {}) };
    });
    // Bằng điểm: nhiều hạng nhất hơn, rồi hạng nhì… rồi tên
    const minTop = t.multi.minTop || 1, needWin = !!t.multi.needWin;
    const ok = (c) => c.scored >= minTop;
    const all = [...clubs.values()].sort((a, b) => {
      if (ok(a) !== ok(b)) return ok(a) ? -1 : 1; // chưa đủ điều kiện: xếp sau
      if (b.pts !== a.pts) return b.pts - a.pts;
      for (let k = 0; k < Math.max(a.cnt.length, b.cnt.length); k++) if ((b.cnt[k] || 0) !== (a.cnt[k] || 0)) return (b.cnt[k] || 0) - (a.cnt[k] || 0);
      return a.name.localeCompare(b.name);
    });
    // Phải vô địch ít nhất một giải con mới được đứng đầu: đưa câu lạc bộ đủ điều kiện có chức vô địch, nhiều điểm nhất lên hạng 1
    if (needWin && all.length && !(all[0].cnt[0] > 0)) {
      const k = all.findIndex((c) => ok(c) && c.cnt[0] > 0);
      if (k > 0) all.unshift(...all.splice(k, 1));
    }
    const list = all.slice(0, 200).map((c, i) => ({ rank: i + 1, name: c.name, pts: c.pts, wins: c.cnt[0] || 0, res: c.res, ...(ok(c) ? {} : { inel: true }) }));
    sched.sort((a, b) => a.when - b.when);
    return { table, minTop, needWin, children, clubs: list, sched: sched.slice(0, MAX_SCHED), hidden: t.multi.children.length - kids.length, max: MAX_CHILDREN };
  }

  /** Liên kết về giải tổng cho trang giải con. */
  otParentView(t) {
    const p = t.parent && this.otGet(t.parent);
    return p && p.multi && p.access !== 'private' ? { id: p.id, slug: p.slug || null, name: p.name } : null;
  }
}

module.exports = { OTourMulti, cleanTable, cleanRule, finalPlaces, TABLE, MAX_CHILDREN };
