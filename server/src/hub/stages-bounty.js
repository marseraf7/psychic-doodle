/*
 * Sổ tiền thưởng kiểu BLAST Bounty (giai đoạn 'knock' mode 'bounty' – chỉ mô phỏng thể thức, đơn vị tiền chỉ là con số).
 * Mỗi đội khởi đầu có bounty theo hạt giống (cfg.bounty.ladder: [{ to: hạt giống cuối của bậc, amount }], mặc định 1–4: 60.000,
 * 5–8: 30.000, 9–12: 20.000, 13–16: 15.000, còn lại 0 – tổng 500.000). Thắng một trận: lấy `claim`% bounty của đội thua vào
 * quỹ đã nhận (bank), phần còn lại cộng vào bounty của mình; chung kết (finalFull): đội vô địch nhận trọn bounty của đội thua và
 * của chính mình. Đội thua giữ quỹ đã nhận. `self` (> 0): mỗi trận thắng được thêm từ ban tổ chức (ghi riêng, ngoài tổng).
 * Sổ là dữ liệu suy ra từ kết quả các trận theo thứ tự vòng – mỗi bút toán { match, from, to, amount, kind } không sửa; huỷ
 * kết quả thì sổ tự tính lại. Lưu theo đơn vị nhỏ nhất (×100) và làm tròn xuống phần nhận; tổng luôn bảo toàn.
 */
'use strict';
const { real } = require('./stages-base.js');

const DEF_LADDER = [{ to: 4, amount: 60000 }, { to: 8, amount: 30000 }, { to: 12, amount: 20000 }, { to: 16, amount: 15000 }];
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

function normalize(b) {
  const x = b && typeof b === 'object' ? b : {};
  const src = Array.isArray(x.ladder) && x.ladder.length ? x.ladder : DEF_LADDER;
  const ladder = src.slice(0, 16).map((s) => ({ to: int(s && s.to, 1, 256, 1), amount: int(s && s.amount, 0, 100000000, 0) })).sort((a, b) => a.to - b.to);
  return { ladder, claim: int(x.claim, 0, 100, 50), finalFull: x.finalFull !== false, seeding: x.seeding === 'inherit' ? 'inherit' : 'fixed', self: int(x.self, 0, 10000000, 0) };
}

/** Bounty khởi đầu theo hạt giống (đơn vị ×100). */
function startOf(cfg, seed) {
  const s = cfg.bounty.ladder.find((x) => seed <= x.to);
  return s ? s.amount * 100 : 0;
}

function init(st, seeds) { st.bounty0 = Object.fromEntries(seeds.map((u, k) => [u, startOf(st.cfg, k + 1)])); }

/** Tính sổ từ kết quả: { bank, head, ledger, total }. */
function compute(st) {
  const B = st.cfg.bounty, head = { ...st.bounty0 }, bank = Object.fromEntries(Object.keys(head).map((u) => [u, 0])), ledger = [];
  for (const ids of st.rounds) {
    for (const id of ids) {
      const m = st.matches[id];
      if (!m.done || !real(m.winner) || !real(m.loser)) continue;
      const w = m.winner, l = m.loser, L = head[l];
      if (m.final && B.finalFull) {
        ledger.push({ match: id, from: l, to: w, amount: L, kind: 'final' }, { match: id, from: w, to: w, amount: head[w], kind: 'own' });
        bank[w] += L + head[w];
        head[w] = 0;
      } else {
        const got = Math.floor((L * B.claim) / 100);
        ledger.push({ match: id, from: l, to: w, amount: got, kind: 'bank' }, { match: id, from: l, to: w, amount: L - got, kind: 'head' });
        bank[w] += got;
        head[w] += L - got;
      }
      head[l] = 0;
      if (B.self) { bank[w] += B.self * 100; ledger.push({ match: id, from: null, to: w, amount: B.self * 100, kind: 'self' }); }
    }
  }
  const total = Object.values(head).reduce((a, b) => a + b, 0) + Object.values(bank).reduce((a, b) => a + b, 0);
  return { head, bank, ledger, total };
}

/** Tổng phải bằng tổng ban đầu + phần ban tổ chức thêm (kiểm sau mỗi bút toán). */
function balanced(st) {
  const C = compute(st), start = Object.values(st.bounty0).reduce((a, b) => a + b, 0);
  const extra = C.ledger.filter((x) => x.kind === 'self').reduce((a, x) => a + x.amount, 0);
  return C.total === start + extra;
}

const money = (n) => n / 100;

function view(st, side) {
  const C = compute(st);
  const teams = Object.keys(C.head).map((u) => ({ ...side(u), bank: money(C.bank[u]), head: money(C.head[u]), total: money(C.bank[u] + C.head[u]), start: money(st.bounty0[u]) }))
    .sort((a, b) => b.bank - a.bank || b.total - a.total);
  return { teams, ledger: C.ledger.map((x) => ({ ...x, amount: money(x.amount), from: x.from ? side(x.from) : null, to: side(x.to) })), claim: st.cfg.bounty.claim };
}

module.exports = { DEF_LADDER, normalize, startOf, init, compute, balanced, money, view };
