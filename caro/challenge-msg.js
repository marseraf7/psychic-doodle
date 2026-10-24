/*
 * Tin nhắn chat kèm lời thách đấu (Issue #128, hạng mục 5).
 * Khi thách đấu bạn bè, ngoài thẻ lời mời, người thách còn gửi một tin nhắn DM mang mã
 * lời mời. Tin nhắn này không hiển thị nguyên văn: bên nhận vẽ thành thẻ bấm được
 * (Chấp nhận / Từ chối), bên gửi vẽ thành dòng thông báo. Mã dùng chữ in thường để
 * không bị máy chủ lọc chữ (cleanText chỉ thay ký tự điều khiển, giữ nguyên văn bản).
 * Định dạng: [challenge:<id lời mời hex>]
 *
 *   window.CaroChallengeMsg = { marker(id), parse(text) -> id | null }
 */
(function () {
  'use strict';
  const RE = /^\[challenge:([0-9a-f]+)\]$/;
  function marker(id) { return '[challenge:' + id + ']'; }
  function parse(text) {
    if (typeof text !== 'string') return null;
    const m = text.match(RE);
    return m ? m[1] : null;
  }
  window.CaroChallengeMsg = { marker, parse };
})();
