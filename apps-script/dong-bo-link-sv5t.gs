/**
 * Đồng bộ link "Xác nhận" / "Hồ sơ" / "Minh chứng" cho Chi đoàn ĐH Tổng hợp BNV
 * từ thư mục Drive "XÁC NHẬN BNV" vào sheet danh sách SV5T.
 *
 * Cách dùng:
 *   1. Mở Google Sheet → Tiện ích mở rộng → Apps Script.
 *   2. Dán toàn bộ file này vào, bấm Lưu.
 *   3. Chọn hàm `caiDatTuDong` → Chạy → cấp quyền (Drive + Sheets).
 *      Hàm này chạy đồng bộ một lần ngay và đặt lịch chạy lại mỗi 5 phút.
 *   4. Muốn tắt: chạy hàm `tatTuDong`.
 *
 * Quy tắc:
 *   - Chỉ điền vào ô đang TRỐNG, không bao giờ ghi đè ô đã có.
 *   - Cột được tìm theo tiêu đề ở dòng 11, nên chèn/xóa cột không làm lệch.
 *   - Ảnh xác nhận: file trong thư mục "Hình ảnh xác nhận đã nộp hồ sơ"
 *     có tên (bỏ đuôi) trùng Họ và tên.
 *   - Hồ sơ: thư mục trùng Họ và tên bên trong các thư mục "Năm ...".
 *   - Minh chứng: thư mục con trong thư mục Hồ sơ, tên có "minh chứng",
 *     "chứng minh" hoặc "SV5T".
 */

const CAU_HINH = {
  TEN_TAB: 'Trang tính1',
  THU_MUC_GOC: '1fDjQwwe8E6-MIh_OHKSIat0KDC9s_Fze',      // XÁC NHẬN BNV
  THU_MUC_ANH: '1St2MGF49sEG20K8gzEVL4hF_-KaNBbYK',      // Hình ảnh xác nhận đã nộp hồ sơ
  DONG_TIEU_DE: 11,
  TEN_CHI_DOAN: 'CHI ĐOÀN ĐẠI HỌC TỔNG HỢP BỘ NỘI VỤ',   // dòng tiêu đề của khối cần đồng bộ
  PHUT_LAP_LAI: 5,
};

/** Bỏ dấu, chữ thường, gộp khoảng trắng — để so tên không phụ thuộc cách gõ. */
function chuanHoa_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function boDuoi_(ten) {
  return String(ten).replace(/\.[a-z0-9]{2,5}$/i, '');
}

function laThuMucMinhChung_(ten) {
  const t = chuanHoa_(ten);
  return t.includes('minh chung') || t.includes('chung minh') || t.includes('sv5t');
}

/** Tìm chỉ số cột (1-based) theo tiêu đề. */
function timCot_(tieuDe, tuKhoa) {
  const k = chuanHoa_(tuKhoa);
  const i = tieuDe.findIndex(h => chuanHoa_(h).includes(k));
  if (i < 0) throw new Error('Không tìm thấy cột có tiêu đề chứa "' + tuKhoa + '"');
  return i + 1;
}

/** Xác định dòng đầu/cuối của khối Chi đoàn BNV. */
function timKhoiChiDoan_(sheet) {
  const cotA = sheet.getRange(1, 1, sheet.getLastRow(), 1).getDisplayValues().map(r => r[0]);
  const khoaChiDoan = chuanHoa_(CAU_HINH.TEN_CHI_DOAN);
  const batDau = cotA.findIndex(v => chuanHoa_(v).includes(khoaChiDoan));
  if (batDau < 0) throw new Error('Không tìm thấy dòng "' + CAU_HINH.TEN_CHI_DOAN + '"');
  let ketThuc = cotA.length;
  for (let i = batDau + 1; i < cotA.length; i++) {
    if (chuanHoa_(cotA[i]).startsWith('chi doan')) { ketThuc = i; break; }
  }
  // Trả về số dòng 1-based: dòng đầu tiên là sinh viên, dòng cuối cùng (bao gồm)
  return { dau: batDau + 2, cuoi: ketThuc };
}

function docAnhXacNhan_() {
  const map = {};
  const it = DriveApp.getFolderById(CAU_HINH.THU_MUC_ANH).getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const key = chuanHoa_(boDuoi_(f.getName()));
    if (!map[key]) map[key] = f.getUrl();
  }
  return map;
}

function docThuMucHoSo_() {
  const hoSo = {};
  const minhChung = {};
  const cacNam = DriveApp.getFolderById(CAU_HINH.THU_MUC_GOC).getFolders();
  while (cacNam.hasNext()) {
    const nam = cacNam.next();
    if (!chuanHoa_(nam.getName()).startsWith('nam')) continue; // chỉ lấy "Năm 1", "Năm 2", ...
    const nguoi = nam.getFolders();
    while (nguoi.hasNext()) {
      const tm = nguoi.next();
      const key = chuanHoa_(tm.getName());
      if (hoSo[key]) continue;
      hoSo[key] = tm.getUrl();
      const con = tm.getFolders();
      while (con.hasNext()) {
        const c = con.next();
        if (laThuMucMinhChung_(c.getName())) { minhChung[key] = c.getUrl(); break; }
      }
    }
  }
  return { hoSo, minhChung };
}

function taoLink_(chu, url) {
  return SpreadsheetApp.newRichTextValue().setText(chu).setLinkUrl(url).build();
}

/** Hàm chính: chạy theo lịch. */
function dongBoLink() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30 * 1000)) return;
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(CAU_HINH.TEN_TAB);
    const soCot = sheet.getLastColumn();
    const tieuDe = sheet.getRange(CAU_HINH.DONG_TIEU_DE, 1, 1, soCot).getDisplayValues()[0];
    const cotTen = timCot_(tieuDe, 'Họ và tên');
    const cotXN = timCot_(tieuDe, 'xác nhận nộp hồ sơ');
    const cotHS = timCot_(tieuDe, 'Link hồ sơ');
    const cotMC = timCot_(tieuDe, 'Link minh chứng');

    const khoi = timKhoiChiDoan_(sheet);
    const soDong = khoi.cuoi - khoi.dau + 1;
    if (soDong <= 0) return;
    const giaTri = sheet.getRange(khoi.dau, 1, soDong, soCot).getDisplayValues();

    const anh = docAnhXacNhan_();
    const { hoSo, minhChung } = docThuMucHoSo_();

    const thayDoi = [];
    giaTri.forEach((dong, i) => {
      const ten = dong[cotTen - 1];
      if (!ten) return;
      const key = chuanHoa_(ten);
      const r = khoi.dau + i;
      const dien = (cot, chu, url) => {
        if (!url || dong[cot - 1] !== '') return;
        sheet.getRange(r, cot).setRichTextValue(taoLink_(chu, url));
        thayDoi.push(ten + ': ' + chu);
      };
      dien(cotXN, 'Xác nhận', anh[key]);
      dien(cotHS, 'Hồ sơ', hoSo[key]);
      dien(cotMC, 'Minh chứng', minhChung[key]);
    });

    if (thayDoi.length) {
      console.log('Đã bổ sung ' + thayDoi.length + ' ô:\n' + thayDoi.join('\n'));
    } else {
      console.log('Không có gì mới.');
    }
  } finally {
    lock.releaseLock();
  }
}

/** Chạy một lần để đặt lịch tự động mỗi 5 phút. */
function caiDatTuDong() {
  tatTuDong();
  ScriptApp.newTrigger('dongBoLink').timeBased().everyMinutes(CAU_HINH.PHUT_LAP_LAI).create();
  dongBoLink();
}

/** Xóa lịch tự động. */
function tatTuDong() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'dongBoLink')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
