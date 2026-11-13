/*
 * Giải đấu Offline – bridge đồng đội (chỉ mô phỏng thể thức), dùng chung trình duyệt và máy chủ (server/src/hub/otour-run.js):
 *   - Mỗi trận gồm `boards` ván bài, mỗi ván đánh ở 2 bàn: đội ô trên ngồi Bắc – Nam ở bàn 1, Đông – Tây ở bàn 2. Nhập điểm
 *     Bắc – Nam của từng bàn (số có dấu); bỏ trống = chưa nhập / ván không đấu (không tính), nhập 0 là điểm 0.
 *   - Chênh lệch mỗi ván (bàn 1 − bàn 2) đổi ra IMP theo bảng IMP chuẩn của WBF (tối đa 24 IMP / ván).
 *   - Tổng IMP hai đội đổi ra điểm thắng (VP) thang 20 theo công thức liên tục WBF 2013: B = 15 × √số ván,
 *     VP thắng = 10 + 10 × (1 − τ^(3·chênh/B)) / (1 − τ³), τ = (√5 − 1) / 2, tối đa 20, làm tròn 2 chữ số; đội thua = 20 − VP thắng
 *     (hoà IMP 10–10, tổng luôn 20,00). Ban tổ chức có thể dán thang VP riêng (vpTable: [[chênh IMP tối thiểu, VP thắng]…]).
 */
(function (root) {
  'use strict';
  // Ngưỡng chênh lệch điểm cho 1, 2 … 24 IMP (bảng IMP của WBF)
  const IMP = [20, 50, 90, 130, 170, 220, 270, 320, 370, 430, 500, 600, 750, 900, 1100, 1300, 1500, 1750, 2000, 2250, 2500, 3000, 3500, 4000];
  const MAX_BOARDS = 64;
  const TAU = (Math.sqrt(5) - 1) / 2;

  /** IMP của chênh lệch d (có dấu). */
  function imp(d) {
    const a = Math.abs(d);
    let k = 0;
    while (k < IMP.length && a >= IMP[k]) k++;
    return Math.sign(d) * k;
  }

  /** VP (×100, số nguyên) của đội thắng với chênh m IMP (m ≥ 0) trong trận `boards` ván. */
  function vpWbf(m, boards) {
    const B = 15 * Math.sqrt(Math.max(1, boards));
    const v = 10 + (10 * (1 - Math.pow(TAU, (3 * m) / B))) / (1 - Math.pow(TAU, 3));
    return Math.min(2000, Math.round(v * 100));
  }

  /** VP (×100) theo thang riêng: hàng cuối có chênh tối thiểu ≤ m. */
  function vpTableOf(table, m) {
    let v = 1000;
    for (const [min, vp] of table) if (m >= min) v = Math.round(vp * 100);
    return Math.min(2000, Math.max(1000, v));
  }

  /** Kiểm và chuẩn hoá danh sách ván: [[bàn 1, bàn 2] | null]. Trả { list } hoặc { code }. */
  function cleanBoards(rows, boards) {
    if (!Array.isArray(rows) || rows.length > boards) return { code: 'ot_bridge_boards', args: { n: boards } };
    const list = Array.from({ length: boards }, (_, k) => {
      const x = rows[k];
      if (!Array.isArray(x)) return null;
      const s = x.map((v) => (v === '' || v == null ? null : Math.round(Number(v))));
      if (s.length !== 2 || s.some((v) => v === null)) return null; // thiếu một bàn: chưa nhập
      return s.every((v) => Number.isFinite(v) && Math.abs(v) <= 7600 && v % 10 === 0) ? s : 'bad';
    });
    if (list.includes('bad')) return { code: 'ot_bridge_score' };
    if (!list.some(Boolean)) return { code: 'ot_bridge_empty' };
    return { list };
  }

  /** Kết quả trận: { impA, impB, vpA, vpB (số thập phân 2 chữ số), played }. */
  function result(list, boards, vpTable) {
    let impA = 0, impB = 0, played = 0;
    for (const x of list) {
      if (!x) continue;
      played++;
      const i = imp(x[0] - x[1]);
      if (i > 0) impA += i; else impB -= i;
    }
    const m = Math.abs(impA - impB);
    const w = Array.isArray(vpTable) && vpTable.length ? vpTableOf(vpTable, m) : vpWbf(m, boards);
    const [a, b] = impA >= impB ? [w, 2000 - w] : [2000 - w, w];
    return { impA, impB, vpA: a / 100, vpB: b / 100, played };
  }

  /** Chuẩn hoá phần bridge của giai đoạn (vòng tròn / Thụy Sĩ / loại trực tiếp): boards 1–64, vpTable (thang riêng, tuỳ chọn). */
  function normalizeCfg(c, out) {
    const n = Math.floor(Number(c && c.boards));
    if (!(n >= 1) || !['roundrobin', 'swiss', 'single'].includes(out.type)) return;
    out.boards = Math.min(MAX_BOARDS, n);
    out.bestOf = 1;
    if (Array.isArray(c.vpTable) && c.vpTable.length) {
      const t = c.vpTable.slice(0, 200).map((x) => [Math.max(0, Math.floor(Number(x && x[0])) || 0), Math.max(10, Math.min(20, Math.round(Number(x && x[1]) * 100) / 100 || 10))]).sort((a, b) => a[0] - b[0]);
      out.vpTable = t;
    }
  }

  const api = { IMP, MAX_BOARDS, imp, vpWbf, vpTableOf, cleanBoards, result, normalizeCfg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CaroOTourBridge = api;
})(typeof window !== 'undefined' ? window : globalThis);
