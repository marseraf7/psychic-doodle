/*
 * Registry các loại giai đoạn tự chứa của giải offline (bảng GSL, vòng tranh hạt giống, nhánh đồ thị…). Thêm một loại mới
 * chỉ cần viết một file stages-<tên>.js và đăng ký ở đây – stages.js, bracket.js, otour-spec.js, otour-sched.js,
 * otour-multi.js tra registry thay cho chuỗi if theo từng loại. Mỗi loại cung cấp:
 *   normalize(c, last, { oddBo })   → cấu hình đã chuẩn hoá (giải offline)
 *   build(st, seeds, opts)          → dựng trận vào st.matches
 *   advancers(st, seedOf)           → { seeds, groupOf, tiers? }  (người đi tiếp)
 *   podium(st, seedOf)              → [nhất, nhì, ba]
 *   error(cfg, n)                   → null | { code, args }  (cỡ giai đoạn không hợp)
 *   view(st, { M, side, seedOf, adv }) → các trường riêng gửi trình duyệt (gộp vào stageView)
 *   places?(st, seedOf)             → [{ uid, place }] thứ hạng chung cuộc (giải tổng – otour-multi.js)
 *   linked: true                    → trận nối next / loserTo, không có hoà (ghi / huỷ kết quả như loại trực tiếp)
 *   selfMark: true                  → tự đánh dấu đội đi tiếp (bracket.js không đánh dấu thêm)
 *   midOnly: true                   → chỉ làm giai đoạn giữa (ở cuối thì thành loại trực tiếp)
 *   sched: 'groups' | 'rounds'      → cách lấy trận khi xếp lịch (st.groups[].rounds / st.rounds)
 *   after?(st, m) / beforeUndo?(st, m) → sau khi ghi kết quả (dựng vòng sau) / trước khi huỷ (false = khoá)
 */
'use strict';
const Gsl = require('./stages-gsl.js');
const Kings = require('./stages-kings.js');
const Graph = require('./stages-graph.js');
const Pools = require('./stages-pools.js');
const Knock = require('./stages-knock.js');

const groupsView = (tables) => (st, { M, side, seedOf, adv }) => {
  const tabs = tables(st, side, seedOf, adv);
  return { groups: st.groups.map((g, gi) => ({ name: g.name, rounds: g.rounds.map((r) => r.map(M)), table: tabs[gi] })) };
};

const KINDS = {
  gsl: {
    normalize: (c, last, { oddBo }) => Gsl.normalizeGsl(c, last, oddBo),
    build: (st, seeds) => Gsl.buildGsl(st, seeds),
    advancers: (st, seedOf) => Gsl.advancers(st, seedOf),
    podium: (st, seedOf) => Gsl.advancers(st, seedOf).seeds.slice(0, 3),
    error: Gsl.gslError,
    view: groupsView(Gsl.tables),
    linked: true, selfMark: true, sched: 'groups', seqGroups: true,
  },
  kings: {
    normalize: (c, last, { oddBo }) => Kings.normalizeKings(c, oddBo),
    build: (st, seeds) => Kings.buildKings(st, seeds),
    advancers: (st, seedOf) => Kings.advancers(st, seedOf),
    podium: (st, seedOf) => Kings.advancers(st, seedOf).seeds.slice(0, 3),
    error: Kings.kingsError,
    view: groupsView((st, side, seedOf) => Kings.tables(st, side, seedOf)),
    linked: true, selfMark: true, midOnly: true, sched: 'groups',
  },
  graph: { ...Graph, sched: 'rounds' },
  pools: Pools, // pool loại kép xếp tầng (kiểu EVO)
  knock: Knock, // loại trực tiếp dựng từng vòng: bốc thăm lại (Snooker Shoot Out), chọn đối thủ + sổ bounty (BLAST Bounty)
};

/** Loại giai đoạn trong registry (null nếu là loại cũ: single, double, roundrobin, swiss, race). */
const get = (type) => (Object.prototype.hasOwnProperty.call(KINDS, type) ? KINDS[type] : null);
const TYPES = Object.keys(KINDS);

/** Lỗi cỡ giai đoạn của mọi loại trong registry. */
function sizeError(cfg, n) {
  const k = get(cfg && cfg.type);
  return k && k.error ? k.error(cfg, n) : null;
}

module.exports = { KINDS, TYPES, get, sizeError };
