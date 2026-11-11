/*
 * Thể thức thêm cho giải đấu Offline (docs/de-xuat-giai-offline.md mục 4) – vẫn là vòng tròn / Thụy Sĩ / loại trực tiếp
 * của stages.js, chỉ thêm tuỳ chọn trong cấu hình giai đoạn:
 *   league   (vòng tròn) – "league phase" kiểu Champions League mới: mỗi đội gặp `games` đối thủ, chia đều cho `pots` nhóm
 *            hạt giống (CL: 36 đội, 4 nhóm, 8 trận – 2 đối thủ mỗi nhóm, 1 sân nhà 1 sân khách), cố tránh đội cùng quốc
 *            gia; một bảng xếp hạng chung. Đi tiếp theo dải hạng: giai đoạn sau là loại trực tiếp 24 đội thì hạng 1–8
 *            được miễn vòng đầu, 9–24 đá play-off (xếp nhánh theo hạt giống chuẩn), 25+ bị loại.
 *   playoff  (loại trực tiếp sau mùa giải) – nhánh theo miền, nhất bảng con, play-in, xếp lại cặp (stages-playoff.js);
 *   boRounds (loại trực tiếp) – Bo riêng từng vòng, vòng cuối danh sách áp cho các vòng sau.
 *   season   (vòng tròn) – mùa giải kiểu nhà nghề Mỹ: miền (mỗi miền một bảng xếp hạng) chia bảng con, số lần gặp nhau
 *            theo quan hệ (cùng bảng con / cùng miền / khác miền) – caro/otour-season.js, dựng ở stages-season.js.
 *   big      (vòng tròn) – bảng lớn tới MAX_BIG đội (league lượt đi – về 20 đội như Premier League).
 *   bestNext (vòng tròn, không phải vòng cuối) – thêm N đội đứng ngay sau suất đi tiếp có thành tích tốt nhất giữa các
 *            bảng (World Cup 2026: 12 bảng, nhất nhì + 8 đội hạng ba tốt nhất).
 *   region   (Thụy Sĩ) – vòng 1 tránh hai đội cùng khu vực (cột quốc gia); vòng sau ghép như thường.
 *   record   (Thụy Sĩ) – theo số thắng / thua kiểu LoL Worlds: thắng `win` trận thì đi tiếp, thua `lose` trận thì bị loại,
 *            ghép cặp cùng thành tích (1–0 gặp 1–0); trận quyết định đi tiếp / bị loại dùng Bo `bo`.
 *   path     (loại trực tiếp sau vòng bảng) – 'groups': nhánh cố định theo vị trí trong bảng (1A–2B, 1E–3A/B/C/D/F kiểu
 *            World Cup 2026 – caro/otour-path.js; otour-run.js dựng). Không hợp khuôn thì xếp theo hạt giống như thường.
 *   legs     (loại trực tiếp) – knock-out 2 lượt (tổng tỉ số, hoà thì luân lưu); legsFinal: chung kết cũng 2 lượt.
 *            Máy chủ giải offline ghi 2 lượt (otour-run.js); lõi nhánh đấu không đổi.
 */
'use strict';
const { BYE, real, newMatch } = require('./stages-base.js');
const { cleanSeason, seasonInfo } = require('../../../caro/otour-season.js');
const { normalizePlayoff } = require('./stages-playoff.js');

const MAX_BIG = 64;
const MAX_LEAGUE_GAMES = 20;
const MAX_POTS = 8;

const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

/** Chuẩn hoá các tuỳ chọn thêm (gọi từ normalizeStage – stages.js) và ghi vào out. oddBo: hàm kiểm Bo lẻ. */
function normalizeExtras(c, out, last, oddBo) {
  if (out.type === 'roundrobin') {
    if (c.big === true) {
      out.big = true;
      if (out.groupSize != null) out.groupSize = int(c.groupSize, 2, MAX_BIG, 4);
    }
    if (c.league && typeof c.league === 'object') {
      const pots = int(c.league.pots, 1, MAX_POTS, 4);
      out.league = { games: int(c.league.games, 1, MAX_LEAGUE_GAMES, 8), pots };
      out.big = true;
      out.groups = 1;
      delete out.groupSize;
      out.meetings = 1;
    }
    // Mùa giải kiểu nhà nghề Mỹ: miền / bảng con, số lần gặp theo quan hệ (caro/otour-season.js, stages-season.js)
    if (c.season && typeof c.season === 'object') {
      out.season = cleanSeason(c.season);
      delete out.league;
      out.big = true;
      out.groups = out.season.confs;
      delete out.groupSize;
      out.meetings = 1;
    }
    if (!last && c.bestNext) out.bestNext = int(c.bestNext, 0, 32, 0) || undefined;
    if (!out.bestNext) delete out.bestNext;
  }
  if (out.type === 'swiss' && c.record && typeof c.record === 'object') {
    const win = int(c.record.win, 1, 5, 3), lose = int(c.record.lose, 1, 5, 3);
    out.record = { win, lose, bo: oddBo(c.record.bo) || 0 };
    // boLast (FACEIT 2018): Bo riêng chỉ cho trận mà cả hai đội đều đang ở thế thắng là đi tiếp, thua là bị loại (2–2)
    if (out.record.bo && c.record.boLast === true) out.record.boLast = true;
    out.rounds = win + lose - 1;
    // Thứ hạng: ít trận thua hơn (3–0 > 3–1 > 3–2), rồi các hệ số đã chọn
    if (!out.tiebreaks.includes('losses')) out.tiebreaks = ['losses', ...out.tiebreaks].slice(0, 5);
  }
  // Thụy Sĩ: vòng 1 không cho hai đội cùng khu vực (cột "quốc gia" của danh sách) gặp nhau – như LoL Worlds
  if (out.type === 'swiss' && c.region === true) out.region = true;
  if ((out.type === 'single' || out.type === 'double') && c.legs === true) {
    out.legs = true;
    out.legsFinal = c.legsFinal === true;
  }
  // Playoff kiểu nhà nghề Mỹ sau mùa giải (stages-playoff.js) + Bo riêng từng vòng (MLB: 3, 5, 7, 7)
  if (out.type === 'single') {
    const po = normalizePlayoff(c.playoff);
    if (po) out.playoff = po;
    if (Array.isArray(c.boRounds)) {
      const list = c.boRounds.slice(0, 8).map(oddBo).filter(Boolean);
      if (list.length) out.boRounds = list;
    }
  }
  // Nhánh theo vị trí trong bảng (1A gặp 2B, kiểu World Cup 2026) thay cho xếp theo hạt giống – caro/otour-path.js
  if ((out.type === 'single' || out.type === 'double') && c.path === 'groups') out.path = 'groups';
  return out;
}

/** Lỗi cấu hình league phase với n đội (null nếu được): số đội chia đều cho các nhóm, số trận chia đều cho các nhóm. */
function leagueError(cfg, n) {
  const L = cfg.league;
  if (!L) return null;
  const p = L.pots, s = n / p, k = L.games / p;
  if (!Number.isInteger(s) || s < 2) return { code: 'ot_league_pots', args: { pots: p } };
  if (!Number.isInteger(k)) return { code: 'ot_league_games', args: { pots: p } };
  // Trong nhóm của mình: k đối thủ trong s − 1 đội còn lại (k lẻ thì s phải chẵn); nhóm khác: k ≤ s
  if (k > s - 1 || (k % 2 && s % 2)) return { code: 'ot_league_size', args: { games: L.games, n } };
  return null;
}

/** Lỗi cấu hình mùa giải với n đội (null nếu được). */
function seasonError(cfg, n) {
  return cfg.season ? seasonInfo(cfg.season, n).error : null;
}

/** Trộn ngẫu nhiên (Fisher–Yates). */
function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Bốc thăm league phase: trả danh sách cặp [sân nhà, sân khách]. Nhóm hạt giống theo thứ tự seeds (nhóm 1 = s đội đầu…).
 * Mỗi đội gặp k = games / pots đối thủ của mỗi nhóm (cả nhóm mình): lịch là một "khuôn" cố định trên các vị trí trong
 * nhóm (các bước xoay – luôn đủ trận, không gặp lại, nửa sân nhà nửa sân khách); bốc thăm = xếp đội vào các vị trí.
 * Tránh cùng quốc gia: tìm kiếm cục bộ – đổi chỗ hai đội trong cùng một nhóm (khuôn không đổi nên mọi ràng buộc vẫn
 * đúng), giữ nước đổi không làm tăng số cặp cùng quốc gia, tới khi hết cặp trùng hoặc hết lượt thử.
 */
function leagueDraw(seeds, cfg, countryOf = () => '', rnd = Math.random) {
  const { pots: p } = cfg.league;
  const n = seeds.length, s = Math.floor(n / p), k = Math.floor(cfg.league.games / p);
  // Khuôn: cặp vị trí [[nhóm, chỗ], [nhóm, chỗ]] – vị trí đầu là sân nhà
  const tpl = [];
  for (let j = 0; j < p; j++) {
    // Cùng nhóm: bước 1…⌊k/2⌋ (mỗi đội 1 trận nhà, 1 trận khách mỗi bước); k lẻ: thêm bước s/2
    for (let o = 1; o <= Math.floor(k / 2); o++) for (let i = 0; i < s; i++) tpl.push([[j, i], [j, (i + o) % s]]);
    if (k % 2) for (let i = 0; i < s / 2; i++) tpl.push(i % 2 ? [[j, i + s / 2], [j, i]] : [[j, i], [j, i + s / 2]]);
    for (let q = j + 1; q < p; q++) for (let o = 0; o < k; o++) for (let i = 0; i < s; i++) tpl.push(o % 2 ? [[q, (i + o) % s], [j, i]] : [[j, i], [q, (i + o) % s]]);
  }
  const slot = (j, i) => j * s + i;
  const touch = Array.from({ length: p * s }, () => []); // vị trí → các cặp có vị trí đó
  tpl.forEach(([x, y], e) => { touch[slot(...x)].push(e); touch[slot(...y)].push(e); });
  let perm, best = null, bestBad = Infinity;
  const team = ([j, i]) => perm[j][i];
  const clash = (e) => { const c = countryOf(team(tpl[e][0])); return c && c === countryOf(team(tpl[e][1])) ? 1 : 0; };
  // Tổng số cặp trùng quanh hai vị trí (cặp nối chính hai vị trí đó tính hai lần ở cả trước và sau nên chênh lệch vẫn đúng)
  const around = (j, a, b) => { let t = 0; for (const e of touch[slot(j, a)]) t += clash(e); for (const e of touch[slot(j, b)]) t += clash(e); return t; };
  // Vài lần khởi đầu ngẫu nhiên. Mỗi bước: lấy một cặp đang trùng quốc gia, đổi một đội của cặp đó với một đội khác cùng
  // nhóm; nước tệ hơn bị bỏ (thỉnh thoảng – 3% – vẫn nhận để thoát chỗ kẹt). Giữ cách xếp tốt nhất.
  for (let run = 0; run < 8 && bestBad > 0; run++) {
    perm = Array.from({ length: p }, (_, j) => shuffle(seeds.slice(j * s, (j + 1) * s), rnd));
    let bad = tpl.reduce((t, _, e) => t + clash(e), 0);
    if (bad < bestBad) { best = perm.map((x) => [...x]); bestBad = bad; }
    for (let it = 0; bad > 0 && it < 4000 && s > 1; it++) {
      let e = Math.floor(rnd() * tpl.length);
      for (let g = 0; g < tpl.length && !clash(e); g++) e = (e + 1) % tpl.length;
      const [j, a] = tpl[e][rnd() < 0.5 ? 0 : 1], b = Math.floor(rnd() * s);
      if (a === b) continue;
      const before = around(j, a, b);
      [perm[j][a], perm[j][b]] = [perm[j][b], perm[j][a]];
      const d = around(j, a, b) - before;
      if (d > 0 && rnd() > 0.03) { [perm[j][a], perm[j][b]] = [perm[j][b], perm[j][a]]; continue; }
      bad = tpl.reduce((t, _, x) => t + clash(x), 0);
      if (bad < bestBad) { best = perm.map((x) => [...x]); bestBad = bad; }
    }
  }
  perm = best;
  return tpl.map(([x, y]) => [team(x), team(y)]);
}

/** Xếp các cặp vào các lượt (mỗi đội tối đa một trận mỗi lượt): tham lam, cặp của đội nhiều trận nhất xếp trước. */
function scheduleRounds(pairs, rnd = Math.random) {
  const rounds = [], busy = [];
  for (const pr of shuffle([...pairs], rnd)) {
    let r = 0;
    while (busy[r] && (busy[r].has(pr[0]) || busy[r].has(pr[1]))) r++;
    if (!busy[r]) { busy[r] = new Set(); rounds[r] = []; }
    busy[r].add(pr[0]); busy[r].add(pr[1]);
    rounds[r].push(pr);
  }
  return rounds;
}

/** Dựng league phase vào st (một bảng chung, các lượt đấu – cùng hình dạng vòng tròn để dùng chung bảng điểm, cách vẽ). */
function buildLeague(st, seeds, countryOf, rnd) {
  const grp = { name: 'A', players: [...seeds], rounds: [], league: true };
  st.groups = [grp];
  // Số đội thực tế không khớp cấu hình (đi tiếp từ vòng trước khác dự tính): một nhóm, số trận gần nhất làm được
  let cfg = st.cfg;
  if (leagueError(cfg, seeds.length)) {
    const n = seeds.length;
    let g = Math.min(cfg.league.games, n - 1);
    if (g % 2 && n % 2) g--;
    cfg = { ...cfg, league: { games: Math.max(1, g), pots: 1 } };
  }
  scheduleRounds(leagueDraw(seeds, cfg, countryOf, rnd), rnd).forEach((pairs, r) => {
    grp.rounds.push(pairs.map(([x, y], i) => {
      const m = newMatch(`${st.key}g0r${r}m${i}`, r, { group: 0 });
      m.a = x;
      m.b = y;
      st.matches[m.id] = m;
      return m.id;
    }));
  });
}

// ------------------------------------------------------------ Thụy Sĩ theo số thắng / thua
/** Số thắng / thua của từng người (miễn đấu tính thắng). */
function records(st) {
  const r = Object.fromEntries(st.entrants.map((u) => [u, { w: 0, l: 0 }]));
  for (const m of Object.values(st.matches)) {
    if (!m.done || !r[m.a]) continue;
    if (m.bye) { r[m.a].w++; continue; }
    if (!real(m.winner) || !r[m.b]) continue;
    r[m.winner].w++;
    r[m.loser].l++;
  }
  return r;
}

/** Người còn thi đấu (chưa đủ số thắng để đi tiếp, chưa đủ số thua để bị loại). */
function recordActive(st, rec = records(st)) {
  const { win, lose } = st.cfg.record;
  return st.entrants.filter((u) => rec[u].w < win && rec[u].l < lose);
}

/** Trận quyết định (một bên còn một trận nữa là đi tiếp hoặc bị loại): Bo riêng của cấu hình record. */
function recordBo(st, rec, a, b) {
  const { win, lose, bo } = st.cfg.record;
  if (!bo || b === BYE) return 0;
  const decide = (u) => rec[u] && (rec[u].w === win - 1 || rec[u].l === lose - 1);
  const last = (u) => rec[u] && rec[u].w === win - 1 && rec[u].l === lose - 1;
  if (st.cfg.record.boLast) return last(a) && last(b) ? bo : 0;
  return [a, b].some(decide) ? bo : 0;
}

// ------------------------------------------------------------ Knock-out 2 lượt
/** Trận đá 2 lượt? (loại trực tiếp có legs; không áp cho tranh hạng, chung kết tổng nhánh thắng – thua; chung kết chỉ khi legsFinal) */
function twoLeg(st, m) {
  if (!st || !st.cfg.legs || !m || m.third || m.place || m.gf) return false;
  if (st.type === 'single' && m.round === st.rounds.length - 1 && !st.cfg.legsFinal) return false;
  return true;
}

// ------------------------------------------------------------ Đi tiếp
/** Thêm bestNext người đứng ngay sau suất đi tiếp (hạng k + 1 các bảng) có thành tích tốt nhất. */
function bestNextTier(tables, k, n, compare) {
  if (!n) return [];
  const tier = [];
  tables.forEach((t, g) => { const uid = t.list[k]; if (uid) tier.push({ uid, s: t.stats[uid], g }); });
  return tier.sort(compare).slice(0, n);
}

module.exports = { MAX_BIG, MAX_LEAGUE_GAMES, MAX_POTS, normalizeExtras, leagueError, seasonError, leagueDraw, scheduleRounds, buildLeague, records, recordActive, recordBo, bestNextTier, twoLeg };
