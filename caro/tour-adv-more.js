/*
 * Giải đấu – các ô "Advanced options" kiểu Challonge ở trang Cài đặt nâng cao (cắm vào bản nháp qua K.tourDraft.EXT):
 *  - Quyền: người chơi tự báo tỉ số (giải offline, người chơi thêm bằng "@tên" có tài khoản); chia sẻ quyền quản trị
 *    (tên đăng nhập → đồng ban tổ chức đủ quyền ngay khi tạo giải). Ẩn khỏi danh sách công khai = "Chỉ người có link".
 *  - Thông báo: báo khi tới trận; gửi kết quả khi giải kết thúc (vào chuông thông báo, người offline nhận khi vào lại).
 *  - Khác: hiện mục Thông báo / Bảng xếp hạng với người xem (ban tổ chức luôn thấy).
 * Máy chủ: tournaments.js (tourFields, addAdmins), tour-score.js (tự báo), tour-notes.js. Nạp sau tour-form.js, trước tour-adv.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K || !K.tourDraft) return;
  const { T, esc } = K;
  const DR = K.tourDraft;

  Object.assign(DR.EXT.defaults, { selfReport: true, admins: '', notifyMatch: true, notifyResults: true, showNews: true, showStandings: true });
  const chk = (name, v, label, hint, cls = '') => `<label class="check ${esc(cls)}"><input type="checkbox" name="${name}" ${v ? 'checked' : ''}> <span>${esc(label)}${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</span></label>`;

  Object.assign(DR.FIELDS, {
    selfReport: (d) => chk('selfReport', d.selfReport, T('adv_self_report'), T('adv_self_report_hint'), 'only-offline'),
    // Chỉ khi tạo giải; sau khi tạo: tab Quản lý → Ban tổ chức (phân quyền chi tiết)
    admins: (d) => (DR.F.editId ? `<p class="hint">${esc(T('adv_admins_edit'))}</p>`
      : `<label class="field"><span>${esc(T('adv_admins'))}</span><textarea name="admins" rows="2" maxlength="400" placeholder="@tennguoichoi1, @tennguoichoi2">${esc(d.admins)}</textarea><small class="hint">${esc(T('adv_admins_hint'))}</small></label>`),
    notifyMatch: (d) => chk('notifyMatch', d.notifyMatch, T('adv_notify_match'), T('adv_notify_match_hint')),
    notifyResults: (d) => chk('notifyResults', d.notifyResults, T('adv_notify_results'), T('adv_notify_results_hint')),
    showNews: (d) => chk('showNews', d.showNews, T('adv_show_news')),
    showStandings: (d) => chk('showStandings', d.showStandings, T('adv_show_standings')),
  });

  DR.EXT.payloads.push((d, { ko }) => ({
    selfReport: ko && !!d.offline && !!d.selfReport,
    admins: DR.F.editId ? undefined : String(d.admins || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 10),
    notifyMatch: !!d.notifyMatch, notifyResults: !!d.notifyResults, showNews: !!d.showNews, showStandings: !!d.showStandings,
  }));
  DR.EXT.fromTour.push((d, t) => {
    Object.assign(d, { selfReport: !!t.selfReport, notifyMatch: t.notifyMatch !== false, notifyResults: t.notifyResults !== false,
      showNews: t.showNews !== false, showStandings: t.showStandings !== false, admins: '' });
  });
})();
