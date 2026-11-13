/*
 * Phần trình bày riêng của giải offline trong trang giai đoạn (gộp vào Hub cùng bracket.js – tách ra cho bracket.js gọn):
 *   elimExtras  – loại trực tiếp: người mang 1 trận thua từ pool (EVO), vòng vớt kiểu Olympic, hạt giống 1 chọn đối thủ bán kết;
 *   markAdvance – đánh dấu người đi tiếp / vào thẳng giai đoạn sau nữa / được miễn vòng đầu.
 */
'use strict';
const ST = require('./stages.js');

class BracketMark {
  /** Phần thêm của nhánh loại trực tiếp (giải offline). M: mã trận → trận gửi trình duyệt. */
  elimExtras(t, st, v, M) {
    if (st.oneLife && st.oneLife.length) v.oneLife = st.oneLife.map((u) => this.tourSide(t, u).name); // mang 1 trận thua từ pool (EVO)
    // Vòng vớt kiểu Olympic (stages-repechage.js): hai nhánh vớt + bảng hạng (hai huy chương đồng)
    if (st.rep) { v.rep = ST.REP.view(st, M).map((s) => ({ ...s, fin: this.tourSide(t, s.fin), direct: s.direct ? this.tourSide(t, s.direct) : null })); v.table = ST.REP.places(st).map((x) => ({ ...this.tourSide(t, x.uid), place: x.place })); }
    // Hạt giống 1 chọn đối thủ bán kết (cfg.pick – kiểu MSI): mở khi chưa chọn và chưa có trận nào xong
    if (st.cfg.pick && st.entrants.length === 4) v.pick = { open: !st.picked && !Object.values(st.matches).some((m) => m.done), picked: st.picked ? this.tourSide(t, st.picked) : null, late: !!st.pickLate, top: this.tourSide(t, st.entrants[0]), opts: [2, 3].map((k) => this.tourSide(t, st.entrants[k])) };
  }

  /**
   * Giải offline: đánh dấu đúng những người đi tiếp theo ST.advancers (gồm cả "đội xếp sau tốt nhất" – World Cup 2026),
   * và dải được miễn vòng đầu khi giai đoạn sau là loại trực tiếp không tròn lũy thừa 2 (league phase 36 đội → 24 đội:
   * hạng 1–8 vào thẳng vòng 1/8). Giải Caro giữ cách đánh dấu cũ (top N mỗi bảng).
   */
  markAdvance(t, st, i, v, seedOf) {
    if (ST.Kinds.get(st.type) && ST.Kinds.get(st.type).selfMark) return; // bảng GSL / vòng tranh hạt giống / nhánh đồ thị tự đánh dấu theo trận
    const sp = ST.splitAdvancers(st, seedOf), seeds = sp.seeds;
    // Dải hạng chuyển sang giai đoạn sau nữa: r.to = số thứ tự giai đoạn (1, 2…) để ghi "Vào thẳng giai đoạn n"
    const toOf = new Map((sp.routes || []).flatMap((r) => r.uids.map((u) => [u, r.to + 1])));
    const going = new Set([...seeds, ...toOf.keys()]);
    const next = t.stages[i + 1];
    let byes = 0;
    if (next && next.type === 'single' && seeds.length > 2) { let p = 2; while (p < seeds.length) p *= 2; byes = p - seeds.length; }
    const bye = new Set(seeds.slice(0, byes));
    const mark = (rows) => { for (const r of rows || []) { r.adv = going.has(r.uid); if (bye.has(r.uid)) r.bye = true; if (toOf.has(r.uid)) { r.skip = true; r.to = toOf.get(r.uid); } } };
    if (v.groups) for (const g of v.groups) mark(g.table);
    mark(v.table);
    if (byes) v.byes = byes;
  }
}

module.exports = { BracketMark };
