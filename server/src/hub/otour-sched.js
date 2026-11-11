/*
 * Giải đấu Offline – tự xếp lịch và chỉnh lịch thi đấu (thuật toán dùng chung: caro/otour-sched.js; giao diện:
 * caro/otour-sched-ui.js). Giờ đấu / sân của từng trận vẫn là m.when / m.venue (otour-league.js – sửa tay từng trận).
 *   otSchedAuto   { id, sched, mode }      – lưu cấu hình lịch (t.sched) rồi xếp: mode 'empty' chỉ các trận chưa có giờ,
 *                                            'all' xếp lại mọi trận chưa đấu. Trận đã đấu giữ nguyên.
 *   otSchedShift  { id, stage, round, days } – dời cả một lượt đấu (mọi bảng) thêm / bớt days ngày
 *   otSchedClear  { id }                   – xoá giờ / sân của mọi trận chưa đấu
 *   otPostpone    { id, match }            – hoãn trận (bỏ giờ, đánh dấu "hoãn")
 *   otMakeup      { id, match }            – tìm ngày đá bù: ô giờ sớm nhất từ hôm nay không trùng lịch hai đội / sân
 *   otTeamHome    { id, team, home }       – sân nhà của đội (lịch "đá trên sân nhà")
 * Giai đoạn sau bốc thăm xong (hoặc Thụy Sĩ bốc thăm vòng mới) mà t.sched.auto: tự xếp các trận mới chưa có giờ
 * (otSchedNext – otour-run.js gọi).
 */
'use strict';
const { E } = require('../msg.js');
const { cleanPublicText } = require('./shared.js');
const ST = require('./stages.js');
const SC = require('../../../caro/otour-sched.js');

const clean = (s, n) => cleanPublicText(String(s == null ? '' : s), n).replace(/[<>|]/g, '').trim();

/** Các trận của một giai đoạn theo thứ tự đấu, kèm mức (lvl) và có phải chờ mức trước không (seq). */
function stageItems(st, s) {
  const out = [];
  const push = (id, lvl, seq) => {
    const m = st.matches[id];
    if (!m || m.bye || m.skipped || m.a === ST.BYE || m.b === ST.BYE) return;
    out.push({ m, id, a: m.a, b: m.b, stage: s, lvl, seq });
  };
  if (st.type === 'roundrobin' || st.type === 'gsl') { // bảng GSL: trận sau chờ kết quả lượt trước
    const R = Math.max(0, ...st.groups.map((g) => g.rounds.length));
    for (let r = 0; r < R; r++) for (const g of st.groups) for (const id of g.rounds[r] || []) push(id, r, st.type === 'gsl');
  } else if (st.type === 'swiss') {
    (st.rounds || []).forEach((ids, r) => ids.forEach((id) => push(id, r, true)));
  } else if (st.type === 'single' || st.type === 'double') {
    const pre = (st.pre || []).length ? 2 : 0; // play-in: mức 0 (cặp đầu), 1 (trận quyết định)
    for (const id of st.pre || []) push(id, st.matches[id].tag === 'pi_last' ? 1 : 0, true);
    const main = (r) => pre + (st.type === 'double' ? 2 * r : r);
    (st.rounds || []).forEach((ids, r) => ids.forEach((id) => push(id, main(r), true)));
    // Nhánh thua: vòng 0 sau vòng 0 nhánh thắng, vòng j sau vòng j − 1 (và người thua nhánh thắng tương ứng)
    (st.lrounds || []).forEach((ids, j) => ids.forEach((id) => push(id, pre + (j === 0 ? 1 : j + 2), true)));
    const last = out.reduce((x, it) => Math.max(x, it.lvl), 0);
    (st.gf || []).forEach((id, i) => push(id, last + 1 + i, true)); // trận đấu thêm (reset) sau chung kết tổng
    if (st.third) push(st.third, main((st.rounds || []).length - 1), true);
    for (const p of st.places || []) p.rounds.forEach((ids) => ids.forEach((id) => push(id, last, true)));
  }
  return out.sort((x, y) => x.lvl - y.lvl); // xếp theo mức (sort ổn định: giữ thứ tự trong cùng mức)
}

class OTourSched {
  /** Mọi trận của các giai đoạn đã bốc thăm (để xếp lịch / tìm trùng). */
  otSchedItems(t) {
    const out = [];
    (t.st || []).forEach((st, s) => { if (st.matches) out.push(...stageItems(st, s)); });
    const homeOf = new Map(t.players.map((p) => [p.uid, p.home || p.name]));
    for (const it of out) { it.when = it.m.when || null; it.venue = it.m.venue || null; it.homeVenue = homeOf.get(it.a) || null; }
    return out;
  }

  /** Xếp lịch theo t.sched. onlyStage: chỉ giai đoạn đó (tự xếp sau bốc thăm). Trả { n, left }. */
  otSchedRun(t, mode, opts = {}) {
    const items = this.otSchedItems(t);
    for (const it of items) it.keep = it.m.done || (mode !== 'all' && !!it.m.when) || (opts.onlyStage != null && it.stage !== opts.onlyStage);
    const { placed, unplaced } = SC.autoSchedule(items, t.sched, { fromWhen: opts.fromWhen });
    const byId = new Map(items.map((it) => [it.id, it]));
    const touched = new Set();
    for (const p of placed) {
      const it = byId.get(p.id);
      Object.assign(it.m, { when: p.when, venue: p.venue || null });
      delete it.m.postponed;
      touched.add(it.stage);
    }
    // Xếp lại toàn bộ: trận không còn chỗ thì bỏ giờ cũ (tránh giữ giờ trùng)
    if (mode === 'all') for (const id of unplaced) { const m = byId.get(id).m; m.when = null; m.venue = null; touched.add(byId.get(id).stage); }
    for (const s of touched) t.st[s].v = (t.st[s].v || 0) + 1;
    return { n: placed.length, left: unplaced.length };
  }

  on_otSchedAuto(conn, { id, sched, mode }) {
    const { t, me } = this.otManaged(conn, id);
    const c = SC.cleanSched(sched);
    c.venues = c.venues.map((v) => clean(v, 40)).filter(Boolean);
    t.sched = c;
    const r = this.otSchedRun(t, mode === 'all' ? 'all' : 'empty');
    if (!r.n && r.left) throw E('ot_sched_none');
    this.otLog(t, me.id, 'sched', r);
    this.otSave(t);
  }

  /** Giai đoạn mới vừa bốc thăm: tự xếp nếu ban tổ chức bật (từ hôm nay trở đi). */
  otSchedNext(t) {
    if (!t.sched || !t.sched.auto || !t.st || !t.st[t.stage]) return;
    this.otSchedRun(t, 'empty', { onlyStage: t.stage, fromWhen: Date.now() });
  }

  on_otSchedShift(conn, { id, stage, round, days }) {
    const { t, me } = this.otManaged(conn, id);
    const st = t.st && t.st[Math.floor(Number(stage))];
    const d = Math.floor(Number(days));
    if (!st || !st.matches || !Number.isInteger(d) || !d || Math.abs(d) > 366) throw E('bad_message');
    const r = Math.floor(Number(round));
    const ids = st.groups ? st.groups.flatMap((g) => g.rounds[r] || []) : (st.rounds || [])[r] || [];
    let n = 0;
    for (const mid of ids) {
      const m = st.matches[mid];
      if (!m || m.done || !m.when) continue;
      m.when += d * SC.DAY;
      n++;
    }
    if (!n) throw E('ot_sched_nothing');
    st.v = (st.v || 0) + 1;
    this.otLog(t, me.id, 'shift', { r: r + 1, d });
    this.otSave(t);
  }

  on_otSchedClear(conn, { id }) {
    const { t, me } = this.otManaged(conn, id);
    let n = 0;
    for (const it of this.otSchedItems(t)) {
      if (it.m.done || (!it.m.when && !it.m.venue && !it.m.postponed)) continue;
      it.m.when = null; it.m.venue = null; delete it.m.postponed;
      t.st[it.stage].v = (t.st[it.stage].v || 0) + 1;
      n++;
    }
    this.otLog(t, me.id, 'sched_clear', { n });
    this.otSave(t);
  }

  on_otPostpone(conn, { id, match }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, m } = this.otAnyMatch(t, match);
    if (m.done) throw E('tour_match_done');
    m.when = null;
    m.postponed = true;
    st.v = (st.v || 0) + 1;
    this.otLog(t, me.id, 'postpone', { match: m.id });
    this.otSave(t);
  }

  on_otMakeup(conn, { id, match }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, m } = this.otAnyMatch(t, match);
    if (m.done) throw E('tour_match_done');
    if (!t.sched) throw E('ot_sched_cfg');
    const got = SC.findSlot(this.otSchedItems(t), t.sched, m.id, Date.now());
    if (!got) throw E('ot_sched_noslot');
    m.when = got.when;
    m.venue = got.venue || m.venue || null;
    delete m.postponed;
    st.v = (st.v || 0) + 1;
    this.otLog(t, me.id, 'makeup', { match: m.id });
    this.otSave(t);
  }

  on_otTeamHome(conn, { id, team, home }) {
    const { t } = this.otManaged(conn, id);
    const p = t.players.find((x) => x.uid === team);
    if (!p) throw E('bad_message');
    p.home = clean(home, 40) || null;
    this.otSave(t);
  }
}

module.exports = { OTourSched, stageItems };
