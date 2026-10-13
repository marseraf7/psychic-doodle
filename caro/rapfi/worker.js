/*
 * Worker chạy Rapfi (bản WebAssembly) làm "bộ não" của BOAT ở luật tự do / tiêu chuẩn / Renju.
 *
 * Rapfi – engine Gomoku / Renju vô địch Gomocup – Copyright (C) Rapfi developers, giấy phép GPL-3
 * (https://github.com/dhbloo/rapfi, bản sao lưu https://github.com/marseraf7/rapfi). File này cùng các file rapfi-single*.js / *.wasm trong thư mục này được phát hành
 * theo GPL-3 (xem COPYING.txt; mã nguồn và cách dựng lại: SOURCE.md). Mạng NNUE "mix9svq" và mô hình cổ điển của Rapfi
 * là CC0 (https://github.com/dhbloo/rapfi-networks, bản sao lưu https://github.com/marseraf7/rapfi-networks) – mạng ~10 MB
 * chỉ tải khi cần, rồi giữ trong Cache Storage.
 *
 * Mỗi Worker chỉ phục vụ một luật (đổi luật thì trang tạo Worker mới). Giao tiếp:
 *   vào  { type: 'init', rule }                         – tải mạng + khởi động Rapfi
 *        { type: 'move', id, size, moves, ms }          – moves: [[x, y], …] toạ độ 0..size-1, X đi trước
 *   ra   { type: 'progress', pct } · { type: 'ready' } · { type: 'error', msg }
 *        { type: 'move', id, move: [x, y] | null, ev }  – ev: điểm Rapfi (góc nhìn bên đi), ±20000 = thắng / thua chắc
 */
'use strict';
const NETS_COMMIT = 'e32ad77a5364363b3e3a02b3f9e8610ade19ea98'; // rapfi-networks, ghim để mạng khớp bản engine
const NETS = {
  free: ['mix9svqfreestyle_bsmix.bin.lz4'],
  std: ['mix9svqstandard_bs15.bin.lz4'],
  renju: ['mix9svqrenju_bs15_black.bin.lz4', 'mix9svqrenju_bs15_white.bin.lz4'],
};
const RULE_N = { free: 0, std: 1, renju: 4 }; // mã luật trong giao thức Piskvork của Rapfi
const NET_CACHE = 'caro-rapfi-nets-v1'; // tách khỏi bộ nhớ đệm của sw.js nên không bị xoá khi app cập nhật
// Thứ tự thử: cùng máy chủ (nếu người triển khai đặt sẵn vào rapfi/nets/), rồi jsDelivr / GitHub raw của bản sao lưu
// (fork marseraf7/rapfi-networks), cuối cùng kho gốc dhbloo/rapfi-networks – cùng commit nên cùng nội dung
const REPOS = ['marseraf7/rapfi-networks', 'dhbloo/rapfi-networks'];
const sources = (f) => [
  'nets/' + f,
  ...REPOS.map((r) => `https://cdn.jsdelivr.net/gh/${r}@${NETS_COMMIT}/mix9svq/${f}`),
  ...REPOS.map((r) => `https://raw.githubusercontent.com/${r}/${NETS_COMMIT}/mix9svq/${f}`),
];
// Khoá trong Cache Storage: giữ như bản đầu (URL jsDelivr của kho gốc) để mạng đã tải không phải tải lại
const cacheKey = (f) => `https://cdn.jsdelivr.net/gh/dhbloo/rapfi-networks@${NETS_COMMIT}/mix9svq/${f}`;

let mod = null, out = [], lastEval = null;

/** Trình duyệt có WebAssembly SIMD không (kiểm bằng một hàm nhỏ dùng lệnh v128). */
function hasSimd() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch (e) { return false; }
}

/** Tải một file mạng (có báo tiến độ) – lấy từ Cache Storage nếu đã tải trước đó. */
async function fetchNet(file, onBytes) {
  const key = cacheKey(file);
  let cache = null;
  try { cache = await caches.open(NET_CACHE); } catch (e) { cache = null; }
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) { const buf = await hit.arrayBuffer(); onBytes(buf.byteLength, true); return new Uint8Array(buf); }
  }
  for (const url of sources(file)) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) continue;
      const reader = res.body.getReader(), parts = [];
      let n = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); n += value.length; onBytes(value.length, false);
      }
      if (n < 1e6) continue; // không phải file mạng (vd. trang lỗi)
      const buf = new Uint8Array(n);
      let o = 0;
      for (const p of parts) { buf.set(p, o); o += p.length; }
      if (cache) cache.put(key, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => {});
      return buf;
    } catch (e) { /* thử nguồn kế tiếp */ }
  }
  throw new Error('net ' + file);
}

/** config.toml cho Rapfi: 1 luồng, bảng băm 16 MB (đủ nhẹ cho điện thoại), chỉ mạng của luật đang chơi. */
function config(rule) {
  const w = rule === 'renju'
    ? `weight_file_black = "${NETS.renju[0]}"\nweight_file_white = "${NETS.renju[1]}"`
    : `weight_file = "${NETS[rule][0]}"`;
  return `[general]
reload_config_each_move = false
clear_hash_after_config_loaded = false
default_thread_num = 1
message_mode = "normal"
coord_conversion_mode = "none"
default_candidate_range = "square3_line4"
memory_reserved_mb = 0
default_tt_size_kb = 16384

[model]
binary_file = "model210901.bin"

[model.evaluator]
type = "mix9svq"
draw_black_winrate = 0.5
draw_ratio = 1.0

[[model.evaluator.weights]]
${w}

[search]
aspiration_window = true
num_iteration_after_mate = 24
num_iteration_after_singular_root = 24
max_search_depth = 99

[search.timectl]
match_space = 21.0
match_space_min = 7.0
average_branch_factor = 1.7
advanced_stop_ratio = 0.75
move_horizon = 64
`;
}

/** Gửi lệnh Piskvork; bản 1 luồng chạy đồng bộ nên khi hàm trả về, mọi dòng trả lời đã nằm trong `out`. */
function send(cmd) { out = []; mod.sendCommand(cmd); return out; }

async function init(rule) {
  const files = NETS[rule];
  if (!files) throw new Error('rule ' + rule);
  if (!hasSimd()) throw new Error('simd'); // báo ngay, không tải mạng vô ích
  const total = { free: 10030398, std: 10345775, renju: 9984172 + 9844944 }[rule];
  let got = 0, lastPct = -1;
  const onBytes = (n) => {
    got += n;
    const pct = Math.min(99, Math.floor((got / total) * 100));
    if (pct !== lastPct) { lastPct = pct; self.postMessage({ type: 'progress', pct }); }
  };
  const [model, ...nets] = await Promise.all([
    fetch('model210901.bin').then((r) => { if (!r.ok) throw new Error('model'); return r.arrayBuffer(); }),
    ...files.map((f) => fetchNet(f, onBytes)),
  ]);
  importScripts('rapfi-single-simd128.js');
  mod = await self.Rapfi({
    // expose-fs.js (lúc dựng) gọi hàm này trước main(): ghi file vào bộ nhớ ảo để Rapfi đọc khi khởi động
    onFS(FS) {
      FS.writeFile('/config.toml', config(rule));
      FS.writeFile('/model210901.bin', new Uint8Array(model));
      files.forEach((f, i) => FS.writeFile('/' + f, nets[i]));
    },
    onReceiveStdout(line) {
      const em = /Eval ([+-]?M?\d+)/.exec(line);
      if (em) lastEval = /M/.test(em[1]) ? (em[1][0] === '-' ? -20000 : 20000) : Number(em[1]);
      out.push(line);
    },
    onReceiveStderr() {},
    onExit() { mod = null; },
  });
}

let size = 0;
function move(d) {
  if (size !== d.size) {
    const r = send('START ' + d.size);
    if (!r.includes('OK')) throw new Error('START ' + d.size);
    size = d.size;
    for (const c of [`INFO rule ${RULE_N[d.rule]}`, 'INFO timeout_match 0', 'INFO thread_num 1', 'INFO max_memory 0']) send(c);
  }
  send('INFO timeout_turn ' + d.ms);
  const side = d.moves.length % 2;
  lastEval = null;
  // Cả khối BOARD … DONE gửi một lần: Rapfi đọc hết các dòng rồi nghĩ, in nước đi dạng "x,y"
  const lines = ['BOARD', ...d.moves.map(([x, y], i) => `${x},${y},${i % 2 === side ? 1 : 2}`), 'DONE'];
  const res = send(lines.join('\n'));
  const mv = res.map((l) => /^(\d+),(\d+)$/.exec(l.trim())).find(Boolean);
  return mv ? [Number(mv[1]), Number(mv[2])] : null;
}

let rule = null;
if (typeof module !== 'undefined' && module.exports) module.exports = { NETS, RULE_N, config }; // cho script đo sức (Node)
else self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    rule = d.rule;
    try {
      await init(rule);
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', msg: String((err && err.message) || err) });
    }
    return;
  }
  if (d.type === 'move') {
    let m = null;
    try { if (mod) m = move({ ...d, rule }); } catch (err) { m = null; }
    self.postMessage({ type: 'move', id: d.id, move: m, ev: lastEval });
  }
};
