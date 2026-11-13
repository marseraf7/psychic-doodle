/*
 * Hỗ trợ bài thử: tạo giải từ mẫu qua máy chủ, nhập kết quả theo kiểu ghi của giải (hạt giống cao thắng) cho tới khi xong.
 * Dùng chung cho otour-graph.test.js, otour-swiss2.test.js… (không phải file bài thử).
 */
'use strict';
const ST = require('../src/hub/stages.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { ctx, account, until } = require('./otour-client.js');

async function startTpl(tid) {
  const tpl = TP.byId(tid);
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Kiểu ' + tid, spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running', 15000);
  return { org, t, id, so: ctx.app.hub.otSeedOf(t) };
}
/** Kết quả để hạt giống cao thắng, theo kiểu ghi kết quả của giải. */
function resultFor(t, st, m, so) {
  const hi = so(m.a) < so(m.b), bo = ST.boOf(st, m);
  const o = (x, y) => (hi ? [x, y] : [y, x]); // tỉ số theo hướng hạt giống cao thắng
  if (st.cfg.matchLadder) return { ladder: st.cfg.matchLadder[0].games === 1 ? [[0, hi ? 1 : -1]] : [[0, hi ? 1 : -1], [0, 0]] }; // thang ván: thắng ngay cấp 1
  if (t.result === 'winner') return { winner: hi ? m.a : m.b };
  if (t.result === 'sets' && t.set && t.set.rubber) return { sets: [o(2, 0), o(2, 1), o(0, 2)] }; // trận đồng đội: thắng 2 / 3 rubber
  if (t.result === 'sets' && st.cfg.fixed && m.sp == null) return { sets: [o(1, 0), o(1, 0), o(1, 0), o(0, 1)] }; // đủ 4 ván: 3–1
  if (t.result === 'sets' && t.set && t.set.race) return { sets: Array.from({ length: (bo + 1) / 2 }, () => o(t.set.to, 1)) }; // darts: thắng các set 3–1
  if (t.result === 'sets') return { sets: Array.from({ length: (bo + 1) / 2 }, () => (hi ? [6, 2] : [2, 6])) };
  if (m.start || m.tie) {
    const need = Math.floor(bo / 2) + 1 - ((m.start || [0])[0] || 0);
    return { sets: Array.from({ length: need }, () => (hi ? [3, 1] : [1, 3])) };
  }
  if ((ST.linked(st.type) || st.cfg.record || m.sp != null) && bo > 1) return { sets: Array.from({ length: (bo + 1) / 2 }, () => (hi ? [3, 1] : [1, 3])) };
  return { score: hi ? [2, 1] : [1, 2] };
}
/** Đấu tới khi xong giải (hoặc tới giai đoạn upto). onMatch(st, m) trả kết quả riêng (null: mặc định). */
async function playAllServer(org, t, id, so, onMatch, upto = 99) {
  for (let g = 0; t.status === 'running' && t.stage < upto && g < 600; g++) {
    const st = t.st[t.stage];
    const list = ST.playable(st);
    if (!list.length) break;
    for (const m of list) {
      org.send({ t: 'otScore', id, match: m.id, ...((onMatch && onMatch(st, m)) || resultFor(t, st, m, so)) });
      await until(() => m.done || t.st[t.stage] !== st || t.status !== 'running');
    }
  }
}
module.exports = { startTpl, resultFor, playAllServer };
