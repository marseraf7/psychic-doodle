// Kiểm thử các thể thức thi đấu (không cần máy chủ): mô phỏng cả giải với kết quả ngẫu nhiên.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/hub/stages.js');

const players = (n) => Array.from({ length: n }, (_, i) => 'p' + (i + 1));
const seedOf = (u) => Number(u.slice(1));
/** Chơi hết vòng: kết quả do hàm pick quyết định (mặc định: hạt giống cao hơn thắng). */
function playOut(st, pick = (m) => (seedOf(m.a) < seedOf(m.b) ? m.a : m.b)) {
  for (let guard = 0; guard < 10000 && !st.done; guard++) {
    const ready = S.playable(st);
    if (!ready.length) throw new Error('kẹt: không còn trận nào đấu được nhưng vòng chưa xong');
    for (const m of ready) {
      const w = pick(m);
      m.wins = { [m.a]: w === m.a ? 1 : 0, [m.b]: w === m.b ? 1 : 0 };
      S.recordResult(st, m, w, { seedOf });
    }
  }
  return st;
}
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('chuẩn hoá cấu hình: vòng trước chỉ được vòng tròn / Thụy Sĩ, giới hạn giá trị', () => {
  const st = S.normalizeStages([{ type: 'single' }, { type: 'double', bestOf: 7 }]);
  assert.strictEqual(st[0].type, 'roundrobin');
  assert.strictEqual(st[1].type, 'double');
  assert.strictEqual(st[1].bestOf, 3);
  assert.strictEqual(S.normalizeStages([{ type: 'swiss', rounds: 99 }])[0].rounds, 15);
  assert.strictEqual(S.normalizeStages(null)[0].type, 'single');
  assert.strictEqual(S.normalizeStages([1, 2, 3, 4, 5]).length, 3);
});

test('loại trực tiếp: mọi số người 2..33, có miễn đấu, tranh hạng 3, hạt giống 1 vô địch', () => {
  for (let n = 2; n <= 33; n++) {
    const cfg = S.normalizeStages([{ type: 'single', thirdPlace: true }])[0];
    const st = playOut(S.buildStage(cfg, 0, players(n)));
    const pod = S.podium(st, seedOf);
    assert.strictEqual(pod[0], 'p1', 'n=' + n);
    if (n >= 2) assert.strictEqual(pod[1], 'p2', 'n=' + n);
    if (n >= 4) assert.strictEqual(pod[2], 'p3', 'n=' + n);
    // Mỗi người thua tối đa 1 trận không phải tranh hạng 3
    for (const u of players(n)) {
      const losses = Object.values(st.matches).filter((m) => m.loser === u && !m.third).length;
      assert.ok(losses <= 1);
    }
  }
});

test('nhánh thắng-thua: mọi số người 2..33, thua 2 lần mới bị loại, có / không reset chung kết', () => {
  for (const reset of [true, false]) {
    for (let n = 2; n <= 33; n++) {
      const cfg = S.normalizeStages([{ type: 'double', reset }])[0];
      const st = playOut(S.buildStage(cfg, 0, players(n)), (m) => (rnd() < 0.5 ? m.a : m.b));
      const pod = S.podium(st, seedOf);
      assert.ok(pod.length >= Math.min(n, 3) - (n === 2 ? 1 : 0), `n=${n} podium ${pod}`);
      for (const u of players(n)) {
        const losses = Object.values(st.matches).filter((m) => m.done && m.loser === u).length;
        if (u === pod[0]) assert.ok(losses <= 1, `vô địch thua tối đa 1 trận (n=${n})`);
        else assert.ok(losses >= 1 && losses <= 2, `${u} thua ${losses} trận (n=${n})`);
        // Ai không vô địch và không phải á quân của trận reset thì bị loại đúng sau 2 trận thua
        if (u !== pod[0] && losses === 1) {
          const lostInGf = Object.values(st.matches).some((m) => m.gf && m.loser === u);
          assert.ok(lostInGf, `${u} chỉ thua 1 trận mà không phải ở chung kết (n=${n})`);
        }
      }
    }
  }
});

test('nhánh thắng-thua 8 người: người thắng nhánh thua thắng chung kết 1 thì có trận reset', () => {
  const cfg = S.normalizeStages([{ type: 'double', reset: true }])[0];
  const st = S.buildStage(cfg, 0, players(8));
  // Hạt giống cao thắng mọi trận, trừ chung kết tổng: người từ nhánh thua thắng trận 1, thua trận reset
  playOut(st, (m) => (m.gf === 1 ? m.b : seedOf(m.a) < seedOf(m.b) ? m.a : m.b));
  const [g1, g2] = st.gf.map((id) => st.matches[id]);
  assert.ok(!g2.skipped && g2.done);
  assert.strictEqual(g1.a, 'p1');
  assert.strictEqual(g1.b, 'p2');
  assert.deepStrictEqual(S.podium(st, seedOf).slice(0, 2), ['p1', 'p2']);
});

test('vòng tròn: chia bảng kiểu rắn, mỗi cặp trong bảng gặp nhau đúng 1 (hoặc 2) lần, tính điểm 3/1/0', () => {
  for (const meetings of [1, 2]) {
    const cfg = S.normalizeStages([{ type: 'roundrobin', groups: 2, meetings, points: { w: 3, d: 1, l: 0 } }])[0];
    const st = S.buildStage(cfg, 0, players(7));
    assert.deepStrictEqual(st.groups.map((g) => g.players), [['p1', 'p4', 'p5'], ['p2', 'p3', 'p6', 'p7']]);
    for (const g of st.groups) {
      for (let i = 0; i < g.players.length; i++) {
        for (let j = i + 1; j < g.players.length; j++) {
          const x = g.players[i], y = g.players[j];
          const n = Object.values(st.matches).filter((m) => (m.a === x && m.b === y) || (m.a === y && m.b === x)).length;
          assert.strictEqual(n, meetings);
        }
      }
    }
    // Một người không đấu 2 trận cùng lúc: trận vòng sau chỉ mở khi đã xong vòng trước
    const first = S.playable(st);
    const busy = first.flatMap((m) => [m.a, m.b]);
    assert.strictEqual(new Set(busy).size, busy.length);
    playOut(st, (m) => (m.a === 'p3' && m.b === 'p6' ? null : seedOf(m.a) < seedOf(m.b) ? m.a : m.b));
    const tables = S.standings(st, seedOf);
    assert.deepStrictEqual(tables[1].list, ['p2', 'p3', 'p6', 'p7']);
    const p3 = tables[1].stats.p3;
    assert.strictEqual(p3.pts, meetings === 1 ? 3 + 1 : 6 + 1 + 3); // thắng p7, hoà p6 (lượt đi), thua p2
  }
});

test('vòng tròn: bằng điểm thì xét đối đầu', () => {
  const cfg = S.normalizeStages([{ type: 'roundrobin', groups: 1 }])[0];
  const st = S.buildStage(cfg, 0, players(3));
  // Vòng tròn 3 người: ai cũng thắng 1 thua 1 -> bằng điểm 3 người -> xét hiệu số ván rồi hạt giống
  playOut(st, (m) => {
    const pair = [m.a, m.b].sort().join();
    return { 'p1,p2': 'p1', 'p2,p3': 'p2', 'p1,p3': 'p3' }[pair];
  });
  assert.deepStrictEqual(S.standings(st, seedOf)[0].list, ['p1', 'p2', 'p3']);
  // 2 người bằng điểm: người thắng đối đầu xếp trên dù hạt giống thấp hơn
  const st2 = S.buildStage(cfg, 0, players(4));
  playOut(st2, (m) => {
    const pair = [m.a, m.b].sort().join();
    return { 'p1,p2': 'p2', 'p1,p3': 'p1', 'p1,p4': 'p1', 'p2,p3': 'p3', 'p2,p4': 'p2', 'p3,p4': 'p4' }[pair];
  });
  const list = S.standings(st2, seedOf)[0].list;
  assert.strictEqual(list[0], 'p2', 'p1 và p2 cùng 2 thắng, p2 thắng đối đầu');
});

test('Thụy Sĩ: không gặp lại, miễn đấu cho người thấp nhất chưa được miễn, đủ số vòng', () => {
  for (const n of [4, 5, 8, 9, 16, 21]) {
    const cfg = S.normalizeStages([{ type: 'swiss', rounds: 5, points: { w: 1, d: 0, l: 0 } }])[0];
    const st = S.buildStage(cfg, 0, players(n), { seedOf });
    playOut(st, (m) => (rnd() < 0.15 ? null : rnd() < 0.5 ? m.a : m.b));
    const expRounds = Math.min(5, S.swissMaxRounds(n));
    assert.strictEqual(st.rounds.length, expRounds, 'n=' + n);
    const seen = new Set();
    for (const m of Object.values(st.matches)) {
      if (m.bye) continue;
      const k = [m.a, m.b].sort().join();
      assert.ok(!seen.has(k), `gặp lại ${k} (n=${n})`);
      seen.add(k);
    }
    const byes = Object.values(st.matches).filter((m) => m.bye).map((m) => m.winner);
    assert.strictEqual(new Set(byes).size, byes.length, 'không ai được miễn đấu 2 lần');
    const tab = S.standings(st, seedOf)[0];
    assert.strictEqual(tab.list.length, n);
    for (let i = 1; i < tab.list.length; i++) assert.ok(tab.stats[tab.list[i - 1]].pts >= tab.stats[tab.list[i]].pts);
  }
});

test('nhiều vòng: vòng bảng (2 bảng, nhất nhì đi tiếp) -> playoff, nhất bảng gặp nhì bảng kia', () => {
  const [g, po] = S.normalizeStages([{ type: 'roundrobin', groups: 2, advance: 2 }, { type: 'single', thirdPlace: false }]);
  const st = playOut(S.buildStage(g, 0, players(8)));
  const adv = S.advancers(st, seedOf);
  assert.deepStrictEqual(adv.seeds, ['p1', 'p2', 'p3', 'p4']);
  const playoff = S.buildStage(po, 1, adv.seeds, { groupOf: adv.groupOf });
  const semis = playoff.rounds[0].map((id) => playoff.matches[id]);
  for (const m of semis) assert.notStrictEqual(adv.groupOf[m.a], adv.groupOf[m.b], 'không gặp người cùng bảng ở bán kết');
  playOut(playoff);
  assert.strictEqual(S.podium(playoff, seedOf)[0], 'p1');
});

test('nhiều vòng: Thụy Sĩ (top 4) -> nhánh thắng-thua', () => {
  const [sw, de] = S.normalizeStages([{ type: 'swiss', rounds: 3, advance: 4 }, { type: 'double' }]);
  const st = playOut(S.buildStage(sw, 0, players(10), { seedOf }));
  const adv = S.advancers(st, seedOf);
  assert.strictEqual(adv.seeds.length, 4);
  const d = playOut(S.buildStage(de, 1, adv.seeds));
  assert.strictEqual(S.podium(d, seedOf).length, 3);
});

test('vắng cả hai (vòng tròn): cả hai đều thua, không ai được điểm', () => {
  const cfg = S.normalizeStages([{ type: 'roundrobin' }])[0];
  const st = S.buildStage(cfg, 0, players(2));
  const m = S.playable(st)[0];
  S.recordResult(st, m, null, { double: true });
  const tab = S.standings(st, seedOf)[0];
  assert.strictEqual(tab.stats.p1.pts, 0);
  assert.strictEqual(tab.stats.p1.l, 1);
  assert.ok(st.done);
});

test('Thụy Sĩ: số vòng giới hạn theo số người, không ai gặp lại (mô phỏng 3..24 người, có hoà)', () => {
  for (let n = 3; n <= 24; n++) {
    const max = n <= 4 ? (n % 2 ? n : n - 1) : Math.ceil(n / 2);
    assert.strictEqual(S.swissMaxRounds(n), max);
    for (let k = 0; k < 40; k++) {
      const cfg = S.normalizeStages([{ type: 'swiss', rounds: 15 }])[0];
      const st = playOut(S.buildStage(cfg, 0, players(n), { seedOf }), (m) => (rnd() < 0.25 ? null : rnd() < 0.5 ? m.a : m.b));
      assert.strictEqual(st.rounds.length, Math.min(15, max), 'n=' + n);
      const seen = new Set();
      for (const m of Object.values(st.matches)) {
        if (m.bye) continue;
        const key = [m.a, m.b].sort().join();
        assert.ok(!seen.has(key), `gặp lại ${key} (n=${n})`);
        seen.add(key);
      }
    }
  }
});

test('Thụy Sĩ: buộc phải gặp lại thì chọn cách ghép ít cặp gặp lại nhất', () => {
  // 4 người, p1-p2 và p3-p4 đã gặp nhau, p1-p3 cũng đã gặp: còn p1-p4 / p2-p3 không ai gặp lại
  const played = new Set(['p1|p2', 'p3|p4', 'p1|p3']);
  assert.deepStrictEqual(S.swissPairs(['p1', 'p2', 'p3', 'p4'], played, {}).pairs, [['p1', 'p4'], ['p2', 'p3']]);
  // Mọi cặp đều đã gặp: vẫn ghép đủ người
  const all = new Set(['p1|p2', 'p1|p3', 'p1|p4', 'p2|p3', 'p2|p4', 'p3|p4']);
  assert.strictEqual(S.swissPairs(['p1', 'p2', 'p3', 'p4'], all, {}).pairs.length, 2);
});

test('vòng bảng: chia theo số người mỗi bảng (như Challonge), không bảng nào quá 16 người', () => {
  const sizes = (cfg, n) => S.buildStage(S.normalizeStages([cfg])[0], 0, players(n)).groups.map((g) => g.players.length);
  assert.deepStrictEqual(sizes({ type: 'roundrobin', groupSize: 4 }, 10), [3, 3, 4]); // chia kiểu rắn: người dư vào bảng cuối
  assert.deepStrictEqual(sizes({ type: 'roundrobin', groupSize: 4 }, 16), [4, 4, 4, 4]);
  assert.deepStrictEqual(sizes({ type: 'roundrobin', groupSize: 99 }, 20), [10, 10], 'tối đa 16 người/bảng');
  assert.deepStrictEqual(sizes({ type: 'roundrobin', groups: 1 }, 40), [13, 13, 14], '1 bảng 40 người -> tự chia 3 bảng');
  assert.ok(sizes({ type: 'roundrobin', groups: 1 }, 128).every((x) => x <= 16));
  const cfg = S.normalizeStages([{ type: 'roundrobin', groupSize: 3 }])[0];
  assert.strictEqual(cfg.groupSize, 3);
  assert.strictEqual(cfg.groups, undefined);
  // 30 bảng: tên A..Z rồi AA, AB…
  const many = S.buildStage(S.normalizeStages([{ type: 'roundrobin', groups: 30 }])[0], 0, players(60));
  assert.deepStrictEqual(many.groups.slice(24, 28).map((g) => g.name), ['Y', 'Z', 'AA', 'AB']);
});

test('vòng bảng: ban tổ chức tự xếp bảng; người mới vào bảng ít người nhất; bảng 1 người được gộp', () => {
  const cfg = S.normalizeStages([{ type: 'roundrobin', groups: 2 }])[0];
  // p9 không còn trong giải -> bảng C trống; p6, p7 chưa được xếp -> lần lượt vào bảng ít người nhất
  const plan = [['p1', 'p2', 'p3'], ['p4', 'p5'], ['p9']];
  const st = S.buildStage(cfg, 0, players(7), { groups: plan });
  assert.deepStrictEqual(st.groups.map((g) => g.players), [['p1', 'p2', 'p3'], ['p4', 'p5'], ['p6', 'p7']]);
  playOut(st);
  assert.ok(st.done);
  // Bảng chỉ còn 1 người -> dồn sang bảng khác
  const st2 = S.buildStage(cfg, 0, players(5), { groups: [['p1', 'p2', 'p3', 'p4'], ['p5']] });
  assert.deepStrictEqual(st2.groups.map((g) => g.players), [['p1', 'p2', 'p3', 'p4', 'p5']]);
  // Không có kế hoạch: chia kiểu rắn như cũ
  assert.deepStrictEqual(S.drawGroups(cfg, players(4)), [['p1', 'p4'], ['p2', 'p3']]);
});

test('vòng tròn: danh sách trận đấu được (cách tính nhanh) khớp định nghĩa gốc ở mọi thời điểm', () => {
  // Định nghĩa gốc: trận đấu được khi cả hai không còn trận nào chưa xong ở vòng sớm hơn trong bảng
  const slow = (st) => Object.values(st.matches).filter((m) => !m.done && S.real(m.a) && S.real(m.b) &&
    !Object.values(st.matches).some((x) => !x.done && x.round < m.round && x.group === m.group &&
      (x.a === m.a || x.b === m.a || x.a === m.b || x.b === m.b))).map((m) => m.id).sort();
  for (const [n, groups, meetings] of [[7, 1, 1], [9, 2, 2], [16, 3, 1]]) {
    const st = S.buildStage(S.normalizeStages([{ type: 'roundrobin', groups, meetings }])[0], 0, players(n));
    while (!st.done) {
      assert.deepStrictEqual(S.playable(st).map((m) => m.id).sort(), slow(st));
      const ready = S.playable(st);
      const m = ready[Math.floor(rnd() * ready.length)]; // xong từng trận một, thứ tự ngẫu nhiên
      S.recordResult(st, m, rnd() < 0.3 ? null : m.a, { seedOf });
    }
  }
});
