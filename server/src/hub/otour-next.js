/*
 * Giải đấu Offline – giải nhiều mùa (đợt 4): tạo mùa sau từ một giải đã kết thúc, giữ nguyên cấu hình (bộ môn, cách ghi
 * kết quả, các giai đoạn, chi tiết ván, luật treo giò, kiểu đăng ký theo lời mời – danh sách mời làm lại mỗi mùa). Danh sách đặc cách trọn đời (`t.exempt` –
 * tên đội / người) tự chuyển sang mùa sau; nhà vô địch tự vào danh sách và đứng đầu mùa sau (hạt giống 1 – như đội giữ
 * cúp America's Cup vào thẳng trận tranh cúp, người thắng The Masters được dự trọn đời). Có thể giữ cả danh sách đội.
 * Các mùa nối với nhau: t.series = { root, n, prev?, next? }.
 */
'use strict';
const crypto = require('crypto');
const { E } = require('../msg.js');
const { cleanPublicText } = require('./shared.js');

const MAX_EXEMPT = 200;
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

/** Danh sách tên (mảng hoặc chuỗi nhiều dòng) → tên sạch, không trùng (không phân biệt hoa thường). */
function cleanNames(x) {
  const arr = Array.isArray(x) ? x : String(x || '').split(/\r?\n/);
  const seen = new Set(), out = [];
  for (const raw of arr) {
    const n = cleanPublicText(String(raw || ''), 60).replace(/[<>|]/g, '').trim();
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
    if (out.length >= MAX_EXEMPT) break;
  }
  return out;
}

class OTourNext {
  /** Đánh dấu đội có tên trong danh sách đặc cách. */
  otMarkExempt(t) {
    const set = new Set((t.exempt || []).map((n) => n.toLowerCase()));
    for (const p of t.players) { if (set.has(p.name.toLowerCase())) p.exempt = true; else delete p.exempt; }
  }

  /** Ban tổ chức sửa danh sách đặc cách trọn đời (mỗi dòng một tên) – lúc nào cũng được. */
  on_otExempt(conn, { id, names }) {
    const { t, me } = this.otManaged(conn, id);
    t.exempt = cleanNames(names);
    this.otMarkExempt(t);
    this.otLog(t, me.id, 'exempt', { n: t.exempt.length });
    this.otSave(t);
  }

  /** Liên kết các mùa cho người xem: số mùa, mùa trước / sau (mã + tên + link riêng). */
  otSeriesView(t) {
    if (!t.series) return null;
    const ref = (id) => {
      const x = id && this.otGet(id);
      return x ? { id: x.id, slug: x.slug || null, name: x.name } : null;
    };
    return { n: t.series.n, prev: ref(t.series.prev), next: ref(t.series.next) };
  }

  /**
   * Tạo mùa sau (giải đã kết thúc). carry: giữ cả danh sách đội (thứ tự: bục trao giải rồi theo hạt giống cũ); không thì
   * chỉ những người được đặc cách. Nhà vô địch luôn đứng đầu và được thêm vào danh sách đặc cách.
   */
  on_otNextSeason(conn, { id, carry }) {
    const { t, me } = this.otManaged(conn, id);
    if (t.multi) throw E('ot_multi_no_start'); // giải tổng: tạo mùa sau cho từng giải con
    if (t.status !== 'finished') throw E('ot_next_not_done');
    if (t.series && t.series.next && this.otGet(t.series.next)) throw E('ot_next_exists');
    const commit = this.otQuota(this.store.users.get(t.owner) || me); // hạn mức của chủ giải (quản trị viên tạo hộ)
    const byUid = new Map(t.players.map((p) => [p.uid, p]));
    const champ = t.podium && byUid.get(t.podium[0]);
    const exempt = cleanNames([...(champ ? [champ.name] : []), ...(t.exempt || [])]);
    const lower = new Set(exempt.map((n) => n.toLowerCase()));
    const byName = new Map(t.players.map((p) => [p.name.toLowerCase(), p]));
    // Thứ tự đội mùa sau: đặc cách (vô địch đầu tiên), rồi – nếu giữ cả danh sách – bục trao giải, rồi theo hạt giống cũ
    const rest = carry === true
      ? [...(t.podium || []).map((u) => byUid.get(u)), ...[...t.players].sort((a, b) => (a.seed || 1e9) - (b.seed || 1e9))]
      : [];
    const seen = new Set(), players = [];
    const add = (src, name) => {
      const key = (src ? src.name : name).toLowerCase();
      if (seen.has(key) || players.length >= 512) return;
      seen.add(key);
      const p = { uid: 't:' + crypto.randomBytes(5).toString('hex'), name: src ? src.name : name };
      for (const k of ['country', 'team', 'young']) if (src && src[k]) p[k] = src[k];
      if (src && src.roster && src.roster.length) p.roster = clone(src.roster);
      if (src && src.home) p.home = src.home;
      if (lower.has(key)) p.exempt = true;
      players.push(p);
    };
    for (const n of exempt) add(byName.get(n.toLowerCase()), n);
    for (const p of rest) if (p) add(p);
    const now = Date.now();
    const series = t.series || { root: t.id, n: 1 };
    const t2 = {
      id: crypto.randomBytes(5).toString('hex'), kind: 'otour', name: t.name, desc: t.desc, slug: null, access: t.access,
      sport: t.sport, result: t.result, set: clone(t.set), stages: clone(t.stages), esports: clone(t.esports),
      ...(t.disc ? { disc: clone(t.disc) } : {}), ...(t.reg && t.reg.invite ? { reg: { open: false, invite: true } } : {}), // giải mời: mùa sau mời lại từ đầu
      exempt, series: { root: series.root, n: series.n + 1, prev: t.id },
      owner: t.owner, status: 'draft', created: now, updated: now, players, st: null, stage: 0, podium: null, log: [],
    };
    t.series = { ...series, next: t2.id };
    this.otLog(t, me.id, 'next_season', { n: t2.series.n });
    this.otSave(t);
    this.otAdd(t2, me.id, 'created');
    commit();
    conn.send({ t: 'otCreated', id: t2.id });
  }
}

module.exports = { OTourNext, cleanNames };
