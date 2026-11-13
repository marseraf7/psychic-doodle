/*
 * Registry các cách tính "tự chứa" của hệ Race (giải offline – chỉ mô phỏng thể thức): mỗi cách tính tự lo chuẩn hoá cấu hình,
 * kiểm / ghi kết quả từng chặng, bảng xếp hạng và phần gửi trình duyệt. stages-race.js tra registry thay cho chuỗi if.
 *   normalize(c, out)                      → điền phần riêng vào cấu hình đã chuẩn hoá
 *   clean(st, i, rows, members)            → { rows } | { code }
 *   record(st, i, rows)                    → true nếu cả giai đoạn đã xong (null: dùng cách ghi chung của stages-race.js)
 *   table(st, seedOf)                      → { list, stats } (thứ tự xếp hạng)
 *   view(st, i, adv, side, seedOf)         → phần gửi trình duyệt
 *   maxEvents                              → số chặng tối đa; seq: true → nhập / huỷ lần lượt từng chặng
 *   build?(st) / undo?(st, i)              → khi dựng giai đoạn / huỷ chặng i (chặng tự thêm: xoá các chặng sau)
 */
'use strict';
const GOLF = require('./stages-golf.js');
const OMN = require('./stages-omnium.js');
const MS = require('./stages-massstart.js');
const PUR = require('./stages-pursuit.js');
const BY = require('./stages-backyard.js');
const PK = require('./stages-poker.js');

const PLUGS = {
  golf: {
    normalize: GOLF.normalizeGolf,
    clean: (st, i, rows) => GOLF.cleanRound(st, i, rows),
    record: GOLF.recordRound, // vòng golf lưu được khi đang đánh dở
    table: (st, seedOf) => { const C = GOLF.golfCalc(st, seedOf); return { list: C.order, stats: C.stats }; },
    view: GOLF.golfView,
    maxEvents: 30, seq: true,
  },
  omnium: { ...OMN.plug, maxEvents: 4, seq: true }, // omnium xe đạp lòng chảo (4 đua con)
  massstart: { ...MS.plug, maxEvents: 2, seq: true }, // mass start trượt băng tốc độ (bán kết + chung kết)
  pursuit: { ...PUR.plug, maxEvents: 1, seq: true }, // đuổi bắt kiểu biathlon / Gundersen (xuất phát theo khoảng thua)
  backyard: { ...BY.plug, maxEvents: 1, seq: true }, // Backyard Ultra: mỗi giờ một yard, chặng sau tự thêm
  poker: { ...PK.plug, maxEvents: 1, seq: true }, // poker có bounty (PKO / Mystery): mỗi chặng một lần loại người
};

const get = (score) => (Object.prototype.hasOwnProperty.call(PLUGS, score) ? PLUGS[score] : null);
const NAMES = Object.keys(PLUGS);

module.exports = { PLUGS, NAMES, get };
