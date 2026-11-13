/*
 * Hệ Race – cách tính 'poker' (giải poker có tiền thưởng trên đầu – chỉ mô phỏng thể thức, chỉ dùng điểm thưởng / token, không
 * có tiền thật). Mỗi chặng là một lần loại người (một ván bài, có thể loại nhiều người): rows [{ uid: người bị loại, by: người
 * loại }] – người bị loại trước xếp sau; nhiều người bị loại cùng ván xếp theo thứ tự nhập. Chặng sau tự thêm tới khi còn 1 người.
 * cfg.poker = { type: 'pko' | 'mystery', start: bounty khởi đầu, pocket: % người loại nhận ngay (PKO, mặc định 50 – phần còn
 *   lại cộng vào bounty trên đầu mình), act: còn bao nhiêu người thì bật bounty (Mystery), envelopes: [giá trị phong bì] }.
 *   PKO: loại người có bounty X → nhận ⌊X × pocket%⌋, bounty mình + phần còn lại. Người vô địch nhận luôn bounty của mình.
 *   Mystery: trước mốc kích hoạt không có bounty; sau đó mỗi lần loại rút một phong bì ngẫu nhiên (không hoàn lại – máy chủ giữ
 *   hạt giống, giá trị phong bì ẩn tới khi rút; nhật ký rút công khai).
 * Sổ suy ra từ các lần loại (huỷ lần loại cuối thì tính lại; phong bì đã rút vẫn theo thứ tự rút nên huỷ rồi nhập lại rút lại
 * đúng phong bì đó). Lưu ×100, làm tròn xuống phần nhận ngay. Đăng ký vào stages-race-plug.js.
 */
'use strict';

const MAX_ENV = 200;
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

function normalize(c, out) {
  const p = c.poker && typeof c.poker === 'object' ? c.poker : {};
  out.events = 1;
  const type = p.type === 'mystery' ? 'mystery' : 'pko';
  out.poker = { type, start: int(p.start, 0, 1000000, 100), pocket: int(p.pocket, 0, 100, 50) };
  if (type === 'mystery') {
    out.poker.act = int(p.act, 2, 10000, 9);
    const env = Array.isArray(p.envelopes) ? p.envelopes.slice(0, MAX_ENV).map((x) => int(x, 0, 10000000, 0)) : [];
    out.poker.envelopes = env.length ? env : [1000, 500, 200, 200, 100, 100, 100, 50, 50, 50];
  }
}

/** Thứ tự phong bì (hoán vị theo hạt giống của máy chủ – đặt khi dựng giai đoạn). */
function shuffleEnv(st) {
  const n = (st.cfg.poker.envelopes || []).length;
  let r = st.pokerSeed >>> 0;
  const order = Array.from({ length: n }, (_, k) => k);
  for (let k = n - 1; k > 0; k--) { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; const j = Math.floor((r / 4294967296) * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
  return order;
}

/** Tính trạng thái từ các lần loại: { alive, out: [uid theo thứ tự bị loại], bank, head, kos, ledger, draws }. */
function calc(st) {
  const P = st.cfg.poker, n = st.entrants.length;
  const head = Object.fromEntries(st.entrants.map((u) => [u, P.type === 'pko' ? P.start * 100 : 0]));
  const bank = Object.fromEntries(st.entrants.map((u) => [u, 0])), kos = Object.fromEntries(st.entrants.map((u) => [u, 0]));
  const out = [], ledger = [], draws = [];
  let alive = [...st.entrants];
  const envOrder = P.type === 'mystery' ? shuffleEnv(st) : [];
  for (const ev of st.events) {
    if (!ev.done) break;
    for (const x of ev.rows) {
      const left = alive.length; // số người còn lại trước lần loại này
      alive = alive.filter((u) => u !== x.uid);
      out.push(x.uid);
      if (!x.by) continue;
      kos[x.by]++;
      if (P.type === 'pko') {
        const X = head[x.uid], got = Math.floor((X * P.pocket) / 100);
        bank[x.by] += got;
        head[x.by] += X - got;
        head[x.uid] = 0;
        ledger.push({ ev: ev.i, from: x.uid, to: x.by, amount: got, kind: 'pocket' }, { ev: ev.i, from: x.uid, to: x.by, amount: X - got, kind: 'head' });
      } else if (left <= P.act && draws.length < envOrder.length) {
        const k = envOrder[draws.length], v = P.envelopes[k] * 100;
        draws.push({ ev: ev.i, by: x.by, env: k, amount: v });
        bank[x.by] += v;
        ledger.push({ ev: ev.i, from: null, to: x.by, amount: v, kind: 'envelope' });
      }
    }
  }
  // Còn một người: vô địch nhận bounty trên đầu mình (PKO)
  if (alive.length === 1 && P.type === 'pko' && head[alive[0]]) {
    ledger.push({ ev: null, from: alive[0], to: alive[0], amount: head[alive[0]], kind: 'own' });
    bank[alive[0]] += head[alive[0]];
    head[alive[0]] = 0;
  }
  return { alive, out, bank, head, kos, ledger, draws, total: n };
}

function clean(st, i, rows) {
  const C = calc({ ...st, events: st.events.filter((e) => e.i < i) });
  if (!Array.isArray(rows) || !rows.length || rows.length >= C.alive.length) return { code: rows && rows.length >= C.alive.length ? 'ot_poker_all' : 'tour_score_bad' };
  const ok = new Set(C.alive), seen = new Set(), out = [];
  for (const r of rows) {
    const uid = r && String(r.uid), by = r && r.by != null && r.by !== '' ? String(r.by) : null;
    if (!ok.has(uid) || seen.has(uid)) return { code: 'tour_score_bad' };
    if (by && (!ok.has(by) || by === uid || rows.some((y) => String(y.uid) === by))) return { code: 'ot_poker_by' }; // người loại phải còn trong giải
    seen.add(uid);
    out.push({ uid, ...(by ? { by } : {}) });
  }
  return { rows: out };
}

function record(st, i, rows) {
  const ev = st.events[i];
  ev.rows = rows;
  ev.done = true;
  const C = calc(st);
  st.done = C.alive.length <= 1;
  if (!st.done && i === st.events.length - 1) st.events.push({ i: i + 1, done: false, rows: null });
  return st.done;
}

function undo(st, i) {
  st.events.length = i + 1;
  Object.assign(st.events[i], { done: false, rows: null });
  st.done = false;
}

/** Xếp hạng: người còn lại, rồi người bị loại sau xếp trên. */
function order(st, C) { return [...C.alive, ...[...C.out].reverse()]; }

function table(st) {
  const C = calc(st);
  return { list: order(st, C), stats: Object.fromEntries(st.entrants.map((u) => [u, { uid: u, bank: C.bank[u], kos: C.kos[u] }])) };
}

function view(st, i, adv, side) {
  const C = calc(st), money = (n) => n / 100, alive = new Set(C.alive);
  const rows = order(st, C).map((u, k) => ({ ...side(u), rank: k + 1, bank: money(C.bank[u]), head: money(C.head[u]), kos: C.kos[u], ...(alive.has(u) ? { alive: true } : {}), adv: k < adv }));
  const events = st.events.map((e) => ({ i: e.i, done: e.done, ...(e.rows ? { rows: e.rows.map((x) => ({ ...x, ...side(x.uid), ...(x.by ? { byName: side(x.by).name } : {}) })) } : {}) }));
  const P = st.cfg.poker;
  const poker = { type: P.type, alive: C.alive.map(side), ledger: C.ledger.map((x) => ({ ...x, amount: money(x.amount) })),
    ...(P.type === 'mystery' ? { draws: C.draws.map((d) => ({ ...d, amount: money(d.amount), by: side(d.by) })), left: P.envelopes.length - C.draws.length, max: Math.max(...P.envelopes), active: C.alive.length <= P.act } : {}) };
  return { index: i, type: 'race', cfg: { ...st.cfg, poker: { ...P, envelopes: undefined } }, done: st.done, events, table: rows, poker, entrants: st.entrants.map(side) };
}

/** Khi dựng giai đoạn: hạt giống rút phong bì của máy chủ. */
function seedOf(st) { st.pokerSeed = (Math.floor(Math.random() * 4294967296) >>> 0) || 1; }

module.exports = { normalize, calc, clean, record, undo, seedOf, plug: { normalize, clean, record, undo, table, view, build: seedOf } };
