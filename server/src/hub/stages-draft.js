/*
 * Draft kiểu Magic: The Gathering cho giải offline (chỉ phần điều hành – không có dữ liệu lá bài, không mô phỏng việc chọn bài).
 * cfg.draft = { packs: số gói mỗi người (1–5, mặc định 3), pass: chiều chuyền từng gói ('left' | 'right'), decklist: bắt buộc
 *   nộp danh sách bài trước khi nhập kết quả, min: số lá tối thiểu (mặc định 40), cross: vòng đầu mỗi pod ghép người ngồi đối
 *   diện bàn (ghế 1 gặp ghế 5 ở pod 8 người) }.
 *   – Thụy Sĩ có pod (stages-pairing.js): mỗi khối vòng là một phiên draft – ghế trong pod bốc ngẫu nhiên (hạt giống của máy
 *     chủ), vòng đầu khối ghép đối diện bàn nếu bật `cross`.
 *   – Loại trực tiếp (Top 8 draft lại): cả giai đoạn là một pod, chỉ bốc ghế (nhánh vẫn theo hạt giống).
 * Danh sách bài: ban tổ chức dán danh sách ("2 Tên lá" mỗi dòng); máy chủ chỉ lưu số lá + thời điểm nộp (không lưu nội dung),
 * mỗi người một danh sách cho mỗi phiên draft.
 */
'use strict';

const MAX_PACKS = 5;
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

/** Chuẩn hoá (Thụy Sĩ có pod, hoặc loại trực tiếp). */
function normalize(c, out) {
  const d = c.draft;
  if (!d || typeof d !== 'object' || !((out.type === 'swiss' && out.pod) || out.type === 'single')) return;
  const packs = int(d.packs, 1, MAX_PACKS, 3);
  const pass = Array.from({ length: packs }, (_, k) => (Array.isArray(d.pass) && (d.pass[k] === 'left' || d.pass[k] === 'right') ? d.pass[k] : k % 2 ? 'right' : 'left'));
  out.draft = { packs, pass, decklist: d.decklist === true, min: int(d.min, 1, 250, 40), cross: out.type === 'swiss' && d.cross !== false };
}

/** Bốc ghế (LCG có hạt giống – lưu trong st để tái lập). */
function shuffle(st, list) {
  if (!st.draftSeed) st.draftSeed = (Math.floor(Math.random() * 4294967296) >>> 0) || 1;
  const a = [...list];
  for (let k = a.length - 1; k > 0; k--) {
    st.draftSeed = (Math.imul(st.draftSeed >>> 0, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((st.draftSeed / 4294967296) * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

/** Phiên draft mới: ghế của từng pod. */
function seat(st, block, pods) {
  st.drafts = st.drafts || [];
  st.drafts[block] = { pods: pods.map((p) => shuffle(st, p)), decks: {} };
  return st.drafts[block];
}

/** Ghép vòng đầu của phiên: ghế k gặp ghế k + n/2 (n chẵn), số lẻ thì người ngồi cuối được miễn. */
function crossPairs(seats) {
  const half = Math.floor(seats.length / 2), pairs = [];
  for (let k = 0; k < half; k++) pairs.push([seats[k], seats[k + half]]);
  return { pairs, bye: seats.length % 2 ? seats[seats.length - 1] : null };
}

/** Loại trực tiếp có draft: một pod gồm mọi người của giai đoạn. */
function seatStage(st) {
  if (st.cfg.draft && st.type === 'single') seat(st, 0, [st.entrants]);
}

/** Phiên draft đang diễn ra của giai đoạn (Thụy Sĩ: theo vòng mới nhất). */
function curBlock(st) {
  if (!st.drafts || !st.drafts.length) return -1;
  return st.type === 'swiss' && st.cfg.pod ? Math.floor(Math.max(0, st.rounds.length - 1) / st.cfg.pod.rounds) : 0;
}

/** Đếm lá trong danh sách: mỗi dòng "số lượng tên" (thiếu số lượng = 1); dòng trống / "Sideboard" bỏ qua. */
function countCards(text) {
  let n = 0;
  for (const line of String(text || '').split(/\r?\n/).slice(0, 400)) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    if (/^(sideboard|sb\b)/i.test(s)) break; // phần dự bị không tính
    const m = /^(\d{1,3})\s*x?\s+\S/i.exec(s);
    n += m ? Number(m[1]) : 1;
  }
  return n;
}

/** Nộp danh sách bài của uid cho phiên hiện tại. Trả mã lỗi hoặc null. */
function submitDeck(st, uid, text, now = Date.now()) {
  const b = curBlock(st);
  if (!st.cfg.draft || b < 0) return 'ot_deck_none';
  if (!st.drafts[b].pods.some((p) => p.includes(uid))) return 'ot_deck_none';
  const n = countCards(text);
  if (n < st.cfg.draft.min) return { code: 'ot_deck_small', args: { n: st.cfg.draft.min } };
  st.drafts[b].decks[uid] = { n, at: now };
  return null;
}

/** Trận chưa được nhập kết quả vì thiếu danh sách bài (decklist bắt buộc). */
function deckMissing(st, m) {
  if (!st.cfg.draft || !st.cfg.draft.decklist || !st.drafts) return false;
  const b = st.type === 'swiss' && st.cfg.pod ? Math.floor(m.round / st.cfg.pod.rounds) : 0;
  const D = st.drafts[b];
  return !!D && [m.a, m.b].some((u) => u && D.pods.some((p) => p.includes(u)) && !D.decks[u]);
}

function view(st, side) {
  if (!st.cfg.draft || !st.drafts) return null;
  const b = curBlock(st), D = st.drafts[b];
  if (!D) return null;
  return { block: b, packs: st.cfg.draft.packs, pass: st.cfg.draft.pass, pods: D.pods.map((p) => p.map((u) => ({ ...side(u), ...(D.decks[u] ? { deck: D.decks[u].n } : {}) }))), decklist: st.cfg.draft.decklist, min: st.cfg.draft.min };
}

module.exports = { MAX_PACKS, normalize, shuffle, seat, crossPairs, seatStage, curBlock, countCards, submitDeck, deckMissing, view };
