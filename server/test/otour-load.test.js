'use strict';
// Bài đo tải giải đấu Offline trong CI (docs/de-xuat-giai-offline.md mục 7): giải 512 đội, 32 bảng × 16 → loại trực tiếp.
// Đo phần nặng nhất mỗi lần có kết quả: dựng trang giải chung + tách phần + tính bản vá (otFlush làm đúng việc này một lần
// cho mọi người xem). Ngưỡng rộng (máy CI chậm) – mục đích là bắt lỗi làm chậm đi nhiều lần, không đo chính xác.
const test = require('node:test');
const assert = require('node:assert');
const { ctx, account, until, teams, real } = require('./otour-client.js');
const ST = require('../src/hub/stages.js');
const { viewParts, diffParts } = require('../src/hub/tourpush.js');

test('Tải: 512 đội, 32 bảng – mỗi kết quả tính bản vá đủ nhanh, bản vá nhỏ; giai đoạn đã xong được dựng một lần', async () => {
  const org = await account();
  const spec = { sport: 'football', stages: [{ type: 'roundrobin', groupSize: 16, advance: 2 }, { type: 'single', thirdPlace: false }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Giải lớn', spec, teams: teams(512) }, 'otCreated', undefined, 15000);
  const hub = ctx.app.hub, t = hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running', 15000);
  const st = t.st[0];
  assert.strictEqual(st.groups.length, 32);
  const t0 = process.hrtime.bigint();
  let shared = hub.otShared(t), parts = viewParts(shared);
  const fullBytes = JSON.stringify(shared).length;
  const firstMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const ms = Object.values(st.matches).filter((m) => real(m.a) && real(m.b));
  const N = 60, cost = [], sizes = [];
  for (let i = 0; i < N; i++) {
    const m = ms[i * 37 % ms.length];
    if (m.done) continue;
    Object.assign(m, { score: [2, 1], wins: { [m.a]: 2, [m.b]: 1 } });
    ST.recordResult(st, m, m.a, { seedOf: hub.otSeedOf(t), isActive: () => true });
    st.v = (st.v || 0) + 1;
    const a = process.hrtime.bigint();
    shared = hub.otShared(t);
    const next = viewParts(shared);
    const patch = JSON.stringify(diffParts(parts, next, shared));
    cost.push(Number(process.hrtime.bigint() - a) / 1e6);
    sizes.push(patch.length);
    parts = next;
  }
  const avg = (x) => x.reduce((s, v) => s + v, 0) / x.length;
  console.log(`  512 đội: trang đầy đủ ${(fullBytes / 1024).toFixed(0)} KB (dựng ${firstMs.toFixed(0)} ms); mỗi kết quả ${avg(cost).toFixed(1)} ms, bản vá ${(avg(sizes) / 1024).toFixed(1)} KB`);
  assert.ok(fullBytes < 3 * 1024 * 1024, 'trang đầy đủ < 3 MB');
  assert.ok(avg(cost) < 800, 'mỗi kết quả tính bản vá < 800 ms (trên máy thường ~50–150 ms)');
  assert.ok(Math.max(...sizes) < 64 * 1024, 'bản vá mỗi kết quả < 64 KB');
  // Xong cả vòng bảng → giai đoạn 1 đã xong được dựng một lần (memo), các lần sau rẻ hơn hẳn
  for (const m of Object.values(st.matches)) if (!m.done && real(m.a) && real(m.b)) { Object.assign(m, { score: [1, 0], wins: { [m.a]: 1, [m.b]: 0 } }); ST.recordResult(st, m, m.a, { seedOf: hub.otSeedOf(t), isActive: () => true }); }
  st.v++;
  hub.otNextStage(t);
  assert.strictEqual(t.stage, 1);
  hub.otShared(t); // dựng (và nhớ) giai đoạn 1 đã xong
  const b = process.hrtime.bigint();
  for (let i = 0; i < 5; i++) hub.otShared(t);
  const memoMs = Number(process.hrtime.bigint() - b) / 1e6 / 5;
  console.log(`  sau vòng bảng: dựng trang ${memoMs.toFixed(1)} ms / lần (giai đoạn đã xong dùng lại)`);
  assert.ok(memoMs < avg(cost) + 50, 'giai đoạn đã xong không bị dựng lại mỗi lần');
  org.close();
});
