/*
 * Các thể thức thi đấu theo vòng (không phụ thuộc mạng, kiểm thử riêng được):
 *   single     – loại trực tiếp (tuỳ chọn tranh hạng 3)
 *   double     – nhánh thắng / nhánh thua (thua 2 lần mới bị loại), chung kết tổng
 *                (tuỳ chọn "reset": người từ nhánh thua thắng chung kết thì đấu thêm 1 trận)
 *   roundrobin – vòng tròn, chia bảng (gặp nhau 1 hoặc 2 lần), tính điểm thắng / hoà / thua
 *   swiss      – hệ Thụy Sĩ: N vòng, mỗi vòng ghép người cùng điểm chưa gặp nhau
 *
 * Một giải có thể gồm nhiều vòng, ví dụ vòng bảng (vòng tròn) → playoff (loại trực tiếp / nhánh thắng-thua):
 * người đứng đầu mỗi bảng đi tiếp, được xếp hạt giống theo thành tích.
 *
 * Tuỳ chọn thêm (như Challonge): loại trực tiếp có trận xếp hạng mọi vị trí (placement); nhánh thắng – thua có chung kết
 * tổng 2 trận / 1 trận / không có (gf) và "split" (nửa dưới hạt giống bắt đầu ở nhánh thua); Bo riêng bán kết / chung
 * kết (boSemi / boFinal); vòng tròn / Thụy Sĩ: điểm ván thắng / hoà, điểm miễn đấu, cách xếp hạng (rankBy) và tie-break
 * 4 cấp (stages-tiebreak.js); Thụy Sĩ số vòng 0 = tự động.
 *
 * Trận (match): { id, round, a, b, wins, games, done, winner, loser, ... }
 *   a / b: mã người chơi; null = chưa biết; '-' = trống (miễn đấu).
 *   winner: mã người thắng; null khi hoà (vòng tròn / Thụy Sĩ); '-' khi cả hai bên trống.
 * Các phần: stages-base.js (hằng số, trận mới), stages-elim.js (loại trực tiếp / nhánh thắng-thua),
 * stages-groups.js (vòng tròn, Thụy Sĩ, bảng điểm). File này: chuẩn hoá cấu hình, tạo vòng, ghi kết quả, thứ hạng.
 */
'use strict';
const { TYPES, GROUP_TYPES, BYE, MAX_GROUP, MAX_GROUPS, isElim, real } = require('./stages-base.js');
const { seedOrder, resolveElim, buildSingle, buildDouble, elimSize, checkSlots, defaultSlots } = require('./stages-elim.js');
const { groupName, groupCount, drawGroups, buildRoundRobin, swissPairs, swissNextRound, tally, standings, advancers: groupAdvancers, swissMaxRounds } = require('./stages-groups.js');
const { RANK_BY, normalizeTiebreaks, tbValue, TIEBREAKS, MAX_TB } = require('./stages-tiebreak.js');
const League = require('./stages-league.js');
const Race = require('./stages-race.js');
const Gsl = require('./stages-gsl.js'); // giải offline: bảng đấu loại kép 4 đội kiểu GSL
const Kings = require('./stages-kings.js'); // giải offline: vòng tranh hạt giống + cơ hội cuối
const TM = require('./stages-tiematch.js'); // giải offline: trận phụ phân hạng ở vòng tròn

const MAX_BO = 25;
const MAX_STAGES_OFFLINE = 6; // giải offline: tới 6 giai đoạn (PGC 2022: bảng → nhánh thua 1 → nhánh thắng → nhánh thua 2 → Grand Survival → chung kết)
const MAX_ROUTES = 4;
/** Bo (số ván tối đa của một trận): số lẻ 1…MAX_BO (cần phân thắng thua); không hợp lệ = 0. */
const oddBo = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= MAX_BO && n % 2 === 1 ? n : 0; };
const GF = ['2', '1', 'none']; // chung kết tổng: 1–2 trận (reset) / 1 trận / không có
/** Số vòng Thụy Sĩ tự động: ⌈log₂ n⌉ (đủ để còn đúng một người toàn thắng). */
const swissAutoRounds = (n) => Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));

/**
 * Chuẩn hoá cấu hình một vòng (dữ liệu từ client). last: có phải vòng cuối không.
 * opts.offline: giải đấu Offline (otour-spec.js) – nhận thêm các thể thức của stages-league.js; giải Caro thì bỏ qua.
 */
function normalizeStage(c, last, opts = {}) {
  c = c || {};
  let type = TYPES.includes(c.type) ? c.type : 'single';
  if (opts.offline && c.type === 'race') return Race.normalizeRace(c, last); // giải offline: hệ Race (stages-race.js)
  if (opts.offline && c.type === 'gsl') return Gsl.normalizeGsl(c, last, oddBo); // giải offline: bảng GSL (stages-gsl.js)
  // Vòng tranh hạt giống + cơ hội cuối (stages-kings.js): chỉ làm giai đoạn giữa – ở cuối thì thành loại trực tiếp
  if (opts.offline && c.type === 'kings') return last ? normalizeStage({ ...c, type: 'single' }, last, opts) : Kings.normalizeKings(c, oddBo);
  // Giai đoạn giữa: vòng tròn / Thụy Sĩ; giải offline cho thêm loại trực tiếp (vòng loại đội thách đấu kiểu America's Cup)
  if (!last && !GROUP_TYPES.includes(type) && !(opts.offline && isElim(type))) type = 'roundrobin';
  const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  // Bo của cả giai đoạn: chọn sẵn Bo1 / 3 / 5 / 7 hoặc ban tổ chức tự nhập số lẻ tới MAX_BO
  const out = { type, bestOf: oddBo(c.bestOf) || (isElim(type) ? 3 : 1) };
  if (isElim(type)) {
    // Bo riêng bán kết / chung kết (0 = như các vòng khác): Bo1 / 3 / 5 / 7 hoặc ban tổ chức tự nhập số lẻ tới MAX_BO
    out.boSemi = oddBo(c.boSemi);
    out.boFinal = oddBo(c.boFinal);
  }
  if (type === 'single') {
    // Trận xếp hạng: mọi vị trí (placement), hoặc ban tổ chức chọn từng cặp hạng (places: 3 = tranh hạng 3–4, 5 = 5–6,
    // 7 = 7–8…; số lẻ 3…MAX_PLAYERS − 1). Bản trước chỉ có placement / thirdPlace.
    out.placement = c.placement === true;
    if (!out.placement && Array.isArray(c.places)) {
      out.places = [...new Set(c.places.map(Number))].filter((x) => Number.isInteger(x) && x >= 3 && x < 512 && x % 2 === 1).sort((a, b) => a - b).slice(0, 256);
      out.thirdPlace = out.places.includes(3);
    } else out.thirdPlace = out.placement || c.thirdPlace !== false;
  }
  if (type === 'double') {
    // Bản cũ chỉ có reset (true / false)
    out.gf = GF.includes(String(c.gf)) ? String(c.gf) : c.reset === false ? '1' : '2';
    out.reset = out.gf === '2';
    out.split = c.split === true;
  }
  if (type === 'roundrobin') {
    // Chia bảng theo số bảng, hoặc (như Challonge) theo số người mỗi bảng
    if (c.groupSize != null && c.groupSize !== '') out.groupSize = int(c.groupSize, 2, MAX_GROUP, 4);
    else out.groups = int(c.groups, 1, MAX_GROUPS, 1);
    out.meetings = [2, 3].includes(Number(c.meetings)) ? Number(c.meetings) : 1;
    out.rankBy = RANK_BY.includes(c.rankBy) ? c.rankBy : 'points';
  }
  if (type === 'swiss') {
    out.rounds = int(c.rounds, 0, 15, 5); // 0 = tự động theo số người
    // Xếp cặp: 'dutch' (chuẩn FIDE: trong mỗi nhóm điểm, nửa trên gặp nửa dưới – 1 gặp n/2+1…) / 'adjacent' (gặp người
    // liền kề: 1–2, 3–4…, cách của bản trước – giải cũ không có trường này vẫn chạy như cũ)
    // Giải offline + Thụy Sĩ theo thắng / thua: 'valve' – kiểu CS Major (stages-valve.js; không có record thì thành 'dutch')
    out.pairing = c.pairing === 'adjacent' || (c.pairing === 'valve' && opts.offline) ? c.pairing : 'dutch';
  }
  if (!isElim(type)) {
    const p = c.points || {};
    const w = int(p.w, 0, 10, 3);
    // Điểm trận thắng / hoà / thua; mỗi ván thắng / hoà cộng thêm; miễn đấu (Thụy Sĩ số lẻ) mặc định như thắng
    out.points = { w, d: int(p.d, 0, 10, 1), l: int(p.l, 0, 10, 0), gw: int(p.gw, 0, 10, 0), gt: int(p.gt, 0, 10, 0), bye: int(p.bye, 0, 10, w) };
    // Thắng / thua ở set quyết định, sau hiệp phụ / luân lưu (giải offline: bóng chuyền 3–2, khúc côn cầu) – chỉ khi có đặt
    if (p.wx != null) out.points.wx = int(p.wx, 0, 10, w);
    if (p.lx != null) out.points.lx = int(p.lx, 0, 10, out.points.l);
    out.tiebreaks = normalizeTiebreaks(c.tiebreaks, type);
    // Trận không đấu khi tính hệ số phụ: theo FIDE (mặc định) / như bản trước (stages-tb-calc.js)
    out.unplayed = c.unplayed === 'raw' ? 'raw' : 'fide';
    if (!last) out.advance = int(c.advance, 1, 32, 2); // RR: mỗi bảng; Thụy Sĩ: tổng số người đi tiếp
  }
  // Giải offline: loại trực tiếp không phải giai đoạn cuối (vòng loại của đội thách đấu kiểu America's Cup) – người đi
  // tiếp theo thứ hạng chung cuộc của nhánh (vô địch, á quân…)
  if (opts.offline && isElim(type) && !last) out.advance = int(c.advance, 1, 8, 1);
  // Tuỳ chọn thêm của giải offline: league phase, bảng lớn, hạng ba tốt nhất, Thụy Sĩ theo thắng / thua, 2 lượt
  if (!opts.offline) return out;
  const res = League.normalizeExtras(c, out, last, oddBo);
  // Loạt Bo2 (vòng bảng Dota 2 ở các giải Esports): đúng 2 ván, 1–1 là hoà – chỉ vòng tròn / Thụy Sĩ tính điểm (không phải
  // Thụy Sĩ theo thắng / thua, không phải loại trực tiếp)
  if (Number(c.bestOf) === 2 && GROUP_TYPES.includes(res.type) && !res.record) res.bestOf = 2;
  if (res.pairing === 'valve' && !res.record) res.pairing = 'dutch';
  // Trận phụ phân hạng (vòng tròn chia bảng có người đi tiếp – không phải league phase / mùa giải)
  if (res.type === 'roundrobin' && !last && !res.league && !res.season && TM.MODES.includes(c.tbm)) res.tbm = c.tbm;
  // Bốc thăm nhánh theo thành tích Thụy Sĩ (stages-recdraw.js) – normalizeStages bỏ nếu giai đoạn trước không phải Thụy Sĩ thắng / thua
  if (res.type === 'single' && c.draw === 'record' && !res.playoff) res.draw = 'record';
  return res;
}

function normalizeStages(list, opts = {}) {
  // Giải offline tối đa MAX_STAGES_OFFLINE giai đoạn; giải Caro trực tuyến 3
  const arr = Array.isArray(list) && list.length ? list.slice(0, opts.offline ? MAX_STAGES_OFFLINE : 3) : [{ type: 'single' }];
  const out = arr.map((c, i) => normalizeStage(c, i === arr.length - 1, opts));
  // Playoff kiểu Mỹ chỉ có nghĩa ngay sau một mùa giải (stages-playoff.js)
  out.forEach((c, i) => { if (c.playoff && !(i > 0 && out[i - 1].season)) delete c.playoff; });
  out.forEach((c, i) => { if (c.draw && !(i > 0 && out[i - 1].type === 'swiss' && out[i - 1].record)) delete c.draw; });
  // Giải offline: đội hạt giống cao vào thẳng giai đoạn i ≥ 1 (LoL Worlds: 15 đội vào thẳng vòng Thụy Sĩ, 2 đội đá Play-In)
  out.forEach((c, i) => {
    const d = Math.floor(Number(arr[i] && arr[i].direct));
    if (i > 0 && opts.offline && d > 0 && !c.playoff) c.direct = Math.min(d, 256); // playoff kiểu Mỹ tự chọn đội từ mùa giải
    if (i > 0 && opts.offline && arr[i] && arr[i].directLast === true) c.directLast = true; // đội vào thẳng xếp sau đội đi tiếp
    // Giải offline 3 giai đoạn: `skip` đội đầu của giai đoạn 1 vào thẳng giai đoạn 3, các đội đi tiếp còn lại đá giai đoạn 2
    // (vòng vớt kiểu Survival Stage / Last Chance của các giải sinh tồn). Vòng tròn nhiều bảng: tính mỗi bảng.
    const sk = Math.floor(Number(arr[i] && arr[i].skip));
    // Bảng GSL: chỉ đội nhất bảng (bảng 8: tối đa 3 đội đầu) – phải còn đội đá giai đoạn 2
    if (opts.offline && sk > 0 && i === 0 && i + 2 < out.length && !isElim(c.type) && c.type !== 'kings' && !out[i + 2].playoff) c.skip = c.type === 'gsl' ? Math.min(sk, c.advance - 1) : Math.min(sk, 256);
    // Chuyển đội theo dải thứ hạng (routes – nhánh song song kiểu PGC 2022 / 2023): các dải hạng đầu lần lượt sang giai đoạn
    // `to` (≥ i + 2, vd. nhất – tám mỗi bảng vào thẳng nhánh thắng), phần `advance` sau đó sang giai đoạn i + 1 (có thể 0)
    const rt = arr[i] && Array.isArray(arr[i].routes) ? arr[i].routes : null;
    if (opts.offline && rt && i + 2 < out.length && !isElim(c.type) && c.type !== 'kings') {
      const r = rt.slice(0, MAX_ROUTES).map((x) => ({ n: Math.min(256, Math.floor(Number(x && x.n)) || 0), to: Math.floor(Number(x && x.to)) }))
        .filter((x) => x.n > 0 && x.to >= i + 2 && x.to < out.length && !out[x.to].playoff);
      if (r.length) {
        c.routes = r;
        delete c.skip;
        if (Number(arr[i].advance) === 0 && c.type !== 'gsl') c.advance = 0; // mọi đội đi tiếp đều theo routes
      }
    }
  });
  return out;
}

/**
 * Chia đội theo "vào thẳng": giai đoạn sau cùng nhận các hạt giống cao nhất trước (vd. vào thẳng chung kết), rồi tới
 * giai đoạn trước nó… Trả { first: đội đá giai đoạn đầu, direct: { [giai đoạn]: [đội] } }. uids theo thứ tự hạt giống.
 */
function directPlan(stages, uids) {
  const direct = {};
  let k = 0;
  for (let i = stages.length - 1; i >= 1; i--) {
    const d = stages[i].direct || 0;
    if (d) { direct[i] = uids.slice(k, k + d); k += d; }
  }
  return { first: uids.slice(k), direct };
}
/** Tổng số đội vào thẳng các giai đoạn sau. */
const directTotal = (stages) => stages.reduce((s, c, i) => s + (i ? c.direct || 0 : 0), 0);

// ------------------------------------------------------------ Khởi tạo / tiến trình
/** Tạo vòng mới với danh sách hạt giống (thứ tự = hạt giống 1, 2, …). */
function buildStage(cfg, index, seeds, opts = {}) {
  const st = { type: cfg.type, cfg, index, key: `s${index}`, entrants: [...seeds], matches: {}, done: false };
  // placeBy 'list': xếp vào nhánh theo thứ tự danh sách (1 gặp 2…) thay cho luật hạt giống; slots: ô vòng 1 ban tổ chức
  // kéo thả (stages-elim.js)
  if (cfg.type === 'single') buildSingle(st, seeds, opts.groupOf, opts.placeBy, opts.slots);
  else if (cfg.type === 'double') buildDouble(st, seeds, opts.groupOf, opts.placeBy, opts.slots);
  else if (cfg.type === 'roundrobin') buildRoundRobin(st, seeds, opts.groups, opts); // opts.countryOf: league phase
  else if (cfg.type === 'race') Race.buildRace(st); // giải offline: các chặng đua
  else if (cfg.type === 'gsl') Gsl.buildGsl(st, seeds); // giải offline: bảng đấu loại kép 4 đội
  else if (cfg.type === 'kings') Kings.buildKings(st, seeds); // giải offline: vòng tranh hạt giống + cơ hội cuối
  else {
    st.rounds = [];
    const want = cfg.rounds || swissAutoRounds(seeds.length);
    st.cfg = { ...cfg, rounds: Math.min(want, swissMaxRounds(seeds.length)) };
    swissNextRound(st, opts.seedOf || ((u) => seeds.indexOf(u)), opts.isActive, opts.pairs, opts.countryOf); // pairs: vòng 1 cặp cố định (giao hữu CLB); countryOf: vòng 1 tránh cùng khu vực
  }
  return st;
}

/**
 * Các trận nối sẵn tới trận sau (người thắng / thua tự chuyển): loại trực tiếp, nhánh thắng – thua, bảng GSL. Không có hoà.
 * Vòng tranh hạt giống (kings) không nối tới trận nào nhưng cũng không có hoà, huỷ kết quả như loại trực tiếp.
 */
const linked = (type) => isElim(type) || type === 'gsl' || type === 'kings';

/**
 * Số đội đầu của giai đoạn vào thẳng giai đoạn sau nữa (cfg.skip): tách danh sách đi tiếp thành { skip, next }.
 * Vòng tròn nhiều bảng: `skip` đội đầu mỗi bảng.
 */
/** Các dải chuyển đội của giai đoạn: routes, hoặc `skip` cũ (= một dải sang giai đoạn sau nữa). */
const routesOf = (st) => (Array.isArray(st.cfg.routes) && st.cfg.routes.length ? st.cfg.routes : []);

function splitAdvancers(st, seedOf, min = 2) {
  const rts = routesOf(st);
  if (rts.length) {
    // routes: dải hạng đầu lần lượt sang các giai đoạn `to`; còn lại `advance` sang giai đoạn kế tiếp
    const sumN = rts.reduce((a, r) => a + r.n, 0);
    let pool, groupOf, per = 1;
    if (st.type === 'gsl') { const a = Gsl.advancers(st, seedOf); pool = a.tiers; groupOf = a.groupOf; }
    else {
      const adv = advancers({ ...st, cfg: { ...st.cfg, advance: (st.cfg.advance || 0) + sumN } }, seedOf, 0);
      groupOf = adv.groupOf;
      per = st.type === 'roundrobin' && st.groups ? st.groups.length : st.type === 'race' && st.cfg.groups ? st.cfg.groups : 1;
      pool = adv.seeds;
    }
    let k = 0;
    const take = (n) => {
      if (st.type === 'gsl') { const x = pool.slice(k, k + n).flat(); k += n; return x; }
      const x = pool.slice(k, k + n * per); k += x.length; return x;
    };
    const routes = rts.map((r) => ({ to: r.to, uids: take(r.n) }));
    const seeds = st.type === 'gsl' ? pool.slice(k).flat() : pool.slice(k);
    return { seeds, groupOf, routes, skip: routes.filter((r) => r.to === st.index + 2).flatMap((r) => r.uids) };
  }
  const sk = st.cfg.skip || 0;
  if (!sk) return { ...advancers(st, seedOf, min), skip: [], routes: [] };
  if (st.type === 'gsl') { // các tầng đầu (nhất bảng…) vào thẳng giai đoạn sau nữa
    const a = Gsl.advancers(st, seedOf);
    const skip = a.tiers.slice(0, sk).flat();
    return { seeds: a.tiers.slice(sk).flat(), groupOf: a.groupOf, skip, routes: [{ to: st.index + 2, uids: skip }] };
  }
  const adv = advancers({ ...st, cfg: { ...st.cfg, advance: (st.cfg.advance || 0) + sk } }, seedOf, min);
  const per = st.type === 'roundrobin' && st.groups ? st.groups.length : st.type === 'race' && st.cfg.groups ? st.cfg.groups : 1; // mỗi bảng
  const total = Math.min(sk * per, Math.max(0, adv.seeds.length - 1));
  const skip = adv.seeds.slice(0, total);
  return { seeds: adv.seeds.slice(total), groupOf: adv.groupOf, skip, routes: [{ to: st.index + 2, uids: skip }] };
}

/** Trận đã sẵn sàng đấu (đủ 2 người thật, chưa xong; vòng tròn: đã xong các vòng trước của 2 người). */
function playable(st) {
  const all = Object.values(st.matches);
  // Vòng tròn: vòng sớm nhất còn trận chưa xong của từng người (mỗi người chỉ ở một bảng).
  // Tính một lượt cho cả vòng (O(số trận)) – giải 512 người có tới 3840 trận.
  let first = null;
  if (st.type === 'roundrobin') {
    first = new Map();
    for (const x of all) {
      if (x.done) continue;
      for (const u of [x.a, x.b]) if (!first.has(u) || x.round < first.get(u)) first.set(u, x.round);
    }
  }
  const out = [];
  for (const m of all) {
    if (m.done || !real(m.a) || !real(m.b)) continue;
    if (first && (first.get(m.a) < m.round || first.get(m.b) < m.round)) continue;
    out.push(m);
  }
  return out;
}

/**
 * Ghi kết quả một trận. winner: mã người thắng, hoặc null nếu hoà (chỉ vòng tròn / Thụy Sĩ).
 * Trả về true nếu cả vòng đã xong.
 */
function recordResult(st, m, winner, opts = {}) {
  if (m.done) return st.done;
  if (linked(st.type)) resolveElim(st, m, winner, winner === m.a ? m.b : m.a);
  else {
    m.done = true;
    m.winner = winner;
    m.loser = winner === null ? null : winner === m.a ? m.b : m.a;
    if (opts.double) { m.double = true; m.winner = BYE; }
    if (st.type === 'swiss') {
      const cur = st.rounds[st.rounds.length - 1];
      const more = !st.cfg.record || League.recordActive(st).length >= 2; // theo thắng / thua: còn người chưa phân định
      if (cur.every((id) => st.matches[id].done) && st.rounds.length < st.cfg.rounds && more) swissNextRound(st, opts.seedOf || ((u) => st.entrants.indexOf(u)), opts.isActive);
    }
  }
  if (st.type === 'roundrobin' && st.cfg.tbm) TM.addTiebreaks(st, opts.seedOf); // bằng điểm ở vạch đi tiếp: thêm trận phụ
  st.done = Object.values(st.matches).every((x) => x.done);
  return st.done;
}

/** Thứ hạng cuối của vòng cuối: [nhất, nhì, ba…] (mã người chơi). */
/** Người đi tiếp: vòng tròn / Thụy Sĩ / Race theo bảng xếp hạng; loại trực tiếp (giải offline) theo thứ hạng chung cuộc. */
function advancers(st, seedOf, min = 2) {
  if (st.type === 'gsl') return Gsl.advancers(st, seedOf);
  if (st.type === 'kings') return Kings.advancers(st, seedOf);
  if (isElim(st.type)) return { seeds: podium(st, seedOf).slice(0, Math.max(1, st.cfg.advance || 1)), groupOf: {} };
  return groupAdvancers(st, seedOf, min);
}

function podium(st, seedOf) {
  if (st.type === 'gsl') return Gsl.advancers(st, seedOf).seeds.slice(0, 3);
  if (st.type === 'kings') return Kings.advancers(st, seedOf).seeds.slice(0, 3);
  if (st.type === 'single') {
    const final = st.matches[st.rounds[st.rounds.length - 1][0]];
    const out = [final.winner, final.loser];
    if (st.third) out.push(st.matches[st.third].winner);
    else if (st.rounds.length >= 2) out.push(...st.rounds[st.rounds.length - 2].map((id) => st.matches[id].loser));
    return out.filter(real);
  }
  if (st.type === 'double') {
    const lbFinal = st.lrounds.length ? st.matches[st.lrounds[st.lrounds.length - 1][0]] : null;
    // Không có chung kết tổng: vô địch nhánh thắng nhất, vô địch nhánh thua nhì
    if (!st.gf.length) {
      const wbFinal = st.matches[st.rounds[st.rounds.length - 1][0]];
      return [wbFinal.winner, lbFinal ? lbFinal.winner : wbFinal.loser, lbFinal && lbFinal.loser].filter(real);
    }
    const g1 = st.matches[st.gf[0]], g2 = st.gf[1] && st.matches[st.gf[1]];
    const last = g2 && !g2.skipped ? g2 : g1;
    return [last.winner, last.loser, lbFinal && lbFinal.loser].filter(real);
  }
  const tables = standings(st, seedOf);
  if (tables.length === 1) return tables[0].list.slice(0, 3);
  // Nhiều bảng ở vòng cuối: nhất các bảng xếp theo thành tích
  return groupAdvancers({ ...st, cfg: { ...st.cfg, advance: 1 } }, seedOf).seeds.slice(0, 3);
}

/** Số ván tối đa của một trận: Bo riêng cho chung kết / bán kết (nếu đặt), còn lại như cả giai đoạn. */
function boOf(st, m) {
  const c = st.cfg;
  if (m && m.bo) return m.bo; // Bo riêng của trận (Thụy Sĩ theo thắng / thua: trận quyết định; play-in)
  // Bo riêng từng vòng (giải offline – playoff MLB: 3, 5, 7, 7)
  const base = st.type === 'single' && Array.isArray(c.boRounds) && c.boRounds.length && m && !m.place && !m.third
    ? c.boRounds[Math.min(m.round, c.boRounds.length - 1)] || c.bestOf : c.bestOf;
  if (!isElim(st.type) || !m || (!c.boFinal && !c.boSemi)) return base;
  let level = 0; // 2 = chung kết, 1 = bán kết
  if (st.type === 'single') {
    const R = st.rounds.length;
    if (!m.place && !m.third) level = m.round === R - 1 ? 2 : m.round === R - 2 ? 1 : 0;
  } else if (m.gf) level = 2;
  // Chung kết nhánh thắng (không có chung kết tổng thì đây là trận quyết định vô địch)
  else if (!m.lb && m.round === st.rounds.length - 1) level = st.gf.length ? 1 : 2;
  else if (m.lb && m.round === st.lrounds.length - 1) level = 1; // chung kết nhánh thua
  return (level === 2 && c.boFinal) || (level === 1 && c.boSemi) || base;
}

/** Người bị loại ở vòng loại trực tiếp (thua trận cuối của mình và không còn trận nào). */
function eliminated(st, uid) {
  if (!isElim(st.type)) return false;
  const mine = Object.values(st.matches).filter((m) => m.a === uid || m.b === uid);
  if (mine.some((m) => !m.done)) return false;
  return mine.some((m) => m.done && m.loser === uid && !m.loserTo) || (st.type === 'double' && mine.some((m) => m.lb && m.loser === uid));
}

module.exports = {
  TYPES, GROUP_TYPES, BYE, seedOrder, normalizeStages, buildStage, playable, recordResult, standings, advancers, podium,
  linked, splitAdvancers, routesOf, tieBeforeUndo: TM.beforeUndo, gslError: Gsl.gslError, gslTables: Gsl.tables, kingsError: Kings.kingsError, kingsTables: Kings.tables, gslPlaces: Gsl.places,
  twoLeg: League.twoLeg, leagueError: League.leagueError, seasonError: League.seasonError, records: League.records,
  tally, eliminated, isElim, real, tbValue, MAX_BO, MAX_STAGES_OFFLINE, elimSize, checkSlots, defaultSlots, TIEBREAKS, MAX_TB, swissPairs, swissMaxRounds, swissAutoRounds, drawGroups, groupCount, groupName, boOf, MAX_GROUP, MAX_GROUPS, directPlan, directTotal,
};
