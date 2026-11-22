/*
 * Tiếng Trung phồn thể (zh-Hant): không lẫn chữ giản thể. Bản dịch zh-Hant làm từ bản giản thể (zh) rồi bản địa hoá theo
 * cách dùng ở Đài Loan (docs/van-phong-4-ngon-ngu.md, mục 繁體中文) – bài thử này bắt chữ giản thể còn sót lại trong
 * caro/i18n/zh-Hant/*.js, server/src/i18n/zh-Hant.js, server/scripts/api-html/zh-Hant.json và mục zh-Hant của trang tĩnh.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadDir } = require('../scripts/i18n-load.js');

const ROOT = path.join(__dirname, '..', '..');
// Cặp giản thể → phồn thể hay gặp; chữ bên trái không dùng trong văn bản phồn thể
const PAIRS = ('这這 们們 设設 网網 账帳 录錄 戏戲 规規 则則 赛賽 选選 与與 个個 对對 时時 发發 说說 来來 会會 国國 动動 进進 '
  + '过過 还還 开開 关關 机機 体體 点點 线線 级級 战戰 胜勝 负負 输輸 赢贏 问問 题題 页頁 码碼 号號 图圖 种種 无無 当當 应應 '
  + '让讓 从從 认認 记記 读讀 写寫 间間 门門 长長 区區 场場 队隊 员員 组組 轮輪 绩績 积積 链鏈 删刪 预預 务務 载載 户戶').split(' ');
const SIMP = new RegExp('[' + PAIRS.map((p) => p[0]).join('') + ']', 'g');

function strings() {
  const out = [];
  for (const [k, s] of Object.entries(loadDir('zh-Hant').merged)) out.push([`caro/i18n/zh-Hant (${k})`, s]);
  const T = require('../src/i18n/zh-Hant.js');
  const flat = (o, p) => {
    if (typeof o === 'string') out.push([`server/src/i18n/zh-Hant.js (${p})`, o]);
    else if (typeof o === 'function') out.push([`server/src/i18n/zh-Hant.js (${p})`, o('U', '1')]);
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) flat(v, p ? p + '.' + k : k);
  };
  flat(T, '');
  out.push(['server/scripts/api-html/zh-Hant.json', fs.readFileSync(path.join(ROOT, 'server/scripts/api-html/zh-Hant.json'), 'utf8')]);
  for (const page of ['privacy.html', 'connector.html', 'licenses.html', 'api.html']) {
    const html = fs.readFileSync(path.join(ROOT, 'caro', page), 'utf8');
    const m = /<section id="zh-Hant"[\s\S]*?<\/section>/.exec(html);
    if (m) out.push([`caro/${page} (#zh-Hant)`, m[0]]);
  }
  return out;
}

test('zh-Hant: bảng cặp chữ giản thể / phồn thể đúng dạng', () => {
  assert.ok(PAIRS.length >= 60);
  for (const p of PAIRS) assert.notStrictEqual(p[0], p[1], p);
});

test('zh-Hant: không có chữ giản thể (这 们 设 网 账 录 戏 规 则 赛 选 与 …)', () => {
  const all = strings();
  assert.ok(all.length > 4000, 'đủ chuỗi zh-Hant');
  const bad = [];
  for (const [where, s] of all) {
    const hit = s.match(SIMP);
    if (hit) bad.push(`${where}: «${[...new Set(hit)].join('')}» – ${s.slice(0, 40)}`);
  }
  assert.deepStrictEqual(bad, [], bad.slice(0, 15).join('\n'));
});
