/*
 * Chạy trọn mọi mẫu giải có giai đoạn race qua máy chủ (giải offline – chỉ mô phỏng thể thức): mỗi chặng / lượt nhập kết quả
 * theo đúng kiểu nhập của cách tính (điểm theo hạng, thời gian, golf, omnium, mass start, nhảy cầu, đuổi bắt, Backyard, poker…),
 * hạt giống cao luôn về trước. Giai đoạn không phải race nhập như otour-tplrun.js. Kiểm: không có lỗi máy chủ, giải xong.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const GOLF = require('../src/hub/stages-golf.js');
const MS = require('../src/hub/stages-massstart.js');
const BY = require('../src/hub/stages-backyard.js');
const PK = require('../src/hub/stages-poker.js');
const TP = require('../../caro/otour-templates.js');
const { until } = require('./otour-client.js');
const { startTpl, resultFor } = require('./otour-tplrun.js');

/** Kết quả một chặng / lượt cho danh sách người `mem` (đã xếp theo hạt giống). */
function raceRows(st, i, mem) {
  const c = st.cfg, H = 3600000;
  switch (c.score) {
    case 'time': case 'gt': return mem.map((uid, k) => ({ uid, rank: k + 1, time: H + k * 1000 }));
    case 'golf': {
      const par = c.par;
      if (c.input === 'hole') return mem.map((uid, k) => ({ uid, h: par.map((p, j) => p + (j < k % par.length ? 1 : 0) + (j === 0 ? Math.floor(k / par.length) : 0)) }));
      return mem.map((uid, k) => ({ uid, s: par.reduce((a, b) => a + b, 0) + k }));
    }
    case 'omnium': return mem.map((uid, k) => ({ uid, rank: k + 1, ...(i === 3 ? { sp: Math.max(0, 10 - k), lap: 0 } : {}) }));
    case 'skijump': return mem.map((uid, k) => ({ uid, pts: Math.max(0, 140 - k * 0.5) }));
    case 'backyard': return mem.map((uid, k) => ({ uid, done: i < 2 || k === 0 })); // 2 yard cả đoàn, rồi chỉ người đầu
    case 'poker': return [{ uid: mem[mem.length - 1], by: mem[0] }]; // mỗi chặng loại người cuối
    default: return mem.map((uid, k) => ({ uid, rank: k + 1 })); // points, massstart, pursuit
  }
}

/** Người của chặng / lượt (theo hạt giống): [{ heat, mem }]. */
function lobbies(st, i, so) {
  const by = (a, b) => so(a) - so(b), ev = st.events[i], c = st.cfg;
  if (ev.heats) return ev.heats.map((h, k) => ({ heat: k, mem: [...h.uids].sort(by), done: h.done })).filter((x) => !x.done);
  if (c.score === 'massstart') return [{ heat: null, mem: (c.massStart.semis && i === 0 ? MS.heatsOf(st).flat() : MS.membersOf(st, i)).sort(by) }];
  if (c.score === 'golf') return [{ heat: null, mem: GOLF.eligible(st, i).sort(by) }];
  if (c.score === 'backyard') return [{ heat: null, mem: BY.calc({ ...st, events: st.events.filter((e) => e.i < i) }).alive.sort(by) }];
  if (c.score === 'poker') return [{ heat: null, mem: PK.calc({ ...st, events: st.events.filter((e) => e.i < i) }).alive.sort(by) }];
  return [{ heat: null, mem: [...Race.lobby(st, i)].sort(by) }];
}

const RACE = TP.TEMPLATES.filter((t) => t.stages.some((s) => s.type === 'race'));

test('Mọi mẫu giải có race chạy trọn qua máy chủ', { timeout: 600000 }, async () => {
  assert.ok(RACE.length >= 20);
  const bad = [];
  for (const tpl of RACE) {
    const { org, t, id, so } = await startTpl(tpl.id);
    let err = null;
    try {
      for (let g = 0; t.status === 'running' && g < 3000; g++) {
        const st = t.st[t.stage], v0 = st.v || 0, stage0 = t.stage;
        if (st.type === 'race') {
          const ev = st.events.find((e) => !e.done);
          if (!ev) break;
          for (const { heat, mem } of lobbies(st, ev.i, so)) {
            org.send({ t: 'otRace', id, event: ev.i, ...(heat != null ? { heat } : {}), rows: raceRows(st, ev.i, mem) });
            // Chờ máy chủ ghi xong lượt / chặng này rồi mới gửi tiếp (không gửi trùng)
            await until(() => (heat != null ? ev.heats[heat].done : ev.done || (st.v || 0) !== v0) || ev.done || t.stage !== stage0 || t.status !== 'running' || org.msgs.some((m) => m.t === 'error'), 5000);
            if (org.msgs.some((m) => m.t === 'error')) break;
          }
        } else {
          const m = ST.playable(st)[0];
          if (!m) break;
          if (ST.DRF.deckMissing(st, m)) for (const u of [m.a, m.b]) org.send({ t: 'otDeck', id, uid: u, list: '40 Island' });
          org.send({ t: 'otScore', id, match: m.id, ...resultFor(t, st, m, so) });
          await until(() => m.done || t.stage !== stage0 || org.msgs.some((x) => x.t === 'error'), 5000);
        }
        const e = org.msgs.find((m) => m.t === 'error');
        if (e) { err = e.code + ' ' + JSON.stringify(e.args || {}); break; }
      }
    } catch (e) { err = String(e.message).slice(0, 120); }
    if (err || t.status !== 'finished') bad.push(`${tpl.id}: ${err || 'chưa xong (giai đoạn ' + (t.stage + 1) + ')'}`);
    org.close();
  }
  assert.deepStrictEqual(bad, []);
});
