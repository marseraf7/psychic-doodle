/*
 * Thể thức thi đấu – phần dùng chung (stages-elim.js, stages-groups.js, stages.js): hằng số, ô trống (miễn đấu),
 * tạo trận mới. Trận: { id, round, a, b, wins, games, done, winner, loser, ... } – xem chú thích đầu stages.js.
 */
'use strict';

const TYPES = ['single', 'double', 'roundrobin', 'swiss'];
const GROUP_TYPES = ['roundrobin', 'swiss']; // được dùng làm vòng trước (có người đi tiếp)
const BYE = '-';
const MAX_GROUP = 16; // tối đa người mỗi bảng vòng tròn (bảng lớn hơn: quá nhiều vòng, dữ liệu quá nặng)
const MAX_GROUPS = 64;

const isElim = (type) => type === 'single' || type === 'double';
const real = (x) => typeof x === 'string' && x !== BYE;

function newMatch(id, round, extra = {}) {
  return { id, round, a: null, b: null, wins: {}, games: [], done: false, winner: null, loser: null, room: null, readyAt: null, ...extra };
}

module.exports = { TYPES, GROUP_TYPES, BYE, MAX_GROUP, MAX_GROUPS, isElim, real, newMatch };
