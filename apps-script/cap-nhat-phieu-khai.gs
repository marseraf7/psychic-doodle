/**
 * Cập nhật phiếu khai SV5T (file .xlsx) của đoàn viên ngay trên Drive, giữ nguyên ID file
 * (link trong sheet tổng không đổi), và kiểm tra link minh chứng.
 *
 * Dữ liệu đầu vào: file ZIP "SV5T_PHIEU_KHAI_DA_SUA.zip" (do Claude tạo) được tải lên thư mục
 * "XÁC NHẬN BNV". Trong ZIP có:
 *   - <fileId>.xlsx   : phiếu khai đã chỉnh theo mẫu, trùng ID với file gốc của đoàn viên
 *   - manifest.json   : tên, thư mục cá nhân, ảnh 3x4 trong file gốc, danh sách link minh chứng
 *
 * Cách dùng (script.google.com → Dự án mới → dán file này → Lưu):
 *   1. Chạy `kiemTraLinkMinhChung` → tạo Google Sheet "BÁO CÁO LINK MINH CHỨNG SV5T" trong thư mục gốc.
 *   2. Chạy `capNhatPhieuKhai` → với mỗi đoàn viên:
 *        - sao lưu file gốc vào thư mục "_SAO LƯU PHIẾU KHAI GỐC",
 *        - tách ảnh 3x4 từ file gốc, lưu vào thư mục cá nhân, chèn link vào ô H2,
 *        - ghi đè nội dung file .xlsx gốc bằng bản đã chỉnh (cùng ID).
 *      Nếu báo hết thời gian, chạy lại — script tự làm tiếp phần còn lại.
 *   2b. Chạy `taoGoogleSheet` → tạo phiếu khai dạng Google Sheet (ảnh, chữ ký nằm trong ô như mẫu)
 *      trong thư mục cá nhân, khôi phục file .xlsx gốc. Chạy lại nếu báo hết thời gian.
 *   3. Chạy `anhTuGoogleSheet` → với phiếu khai dạng Google Sheet có ảnh chèn sẵn ở H2: lưu ảnh vào
 *      thư mục cá nhân và thay bằng link "Ảnh".
 *   4. (Tuỳ chọn) `xoaBanChuyenDoiGoogleSheet` → chuyển vào Thùng rác các bản Google Sheet
 *      chuyển đổi trước đó (khôi phục được từ Thùng rác trong 30 ngày).
 */

const CAU_HINH_PK = {
  THU_MUC_GOC: '1fDjQwwe8E6-MIh_OHKSIat0KDC9s_Fze',   // XÁC NHẬN BNV
  MAU: '1Wnfco8C-GFaVGuyyJDA5bcb4kaY1XtfIidq-r88aTZg', // phiếu khai mẫu (Google Sheet)
  TEN_ZIP: 'SV5T_PHIEU_KHAI_DA_SUA.zip',
  TEN_THU_MUC_SAO_LUU: '_SAO LƯU PHIẾU KHAI GỐC',
  TEN_BAO_CAO: 'BÁO CÁO LINK MINH CHỨNG SV5T',
  PHOTO_PLACEHOLDER: 'https://drive.google.com/PHOTO_PLACEHOLDER',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  GIOI_HAN_GIAY: 300,
};

function docZip_() {
  const it = DriveApp.getFolderById(CAU_HINH_PK.THU_MUC_GOC).getFilesByName(CAU_HINH_PK.TEN_ZIP);
  if (!it.hasNext()) throw new Error('Chưa thấy file ' + CAU_HINH_PK.TEN_ZIP + ' trong thư mục XÁC NHẬN BNV');
  const blobs = Utilities.unzip(it.next().getBlob().setContentType('application/zip'));
  const map = {};
  blobs.forEach(b => { map[b.getName()] = b; });
  return { map, manifest: JSON.parse(map['manifest.json'].getDataAsString('UTF-8')) };
}

function thuMucCon_(cha, ten) {
  const it = cha.getFoldersByName(ten);
  return it.hasNext() ? it.next() : cha.createFolder(ten);
}

function layIdDrive_(url) {
  const m = String(url || '').match(/\/d\/([\w-]{20,})|\/folders\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
  return m ? (m[1] || m[2] || m[3]) : null;
}

function moDuoc_(id) {
  try { DriveApp.getFileById(id).getName(); return true; } catch (e) {}
  try { DriveApp.getFolderById(id).getName(); return true; } catch (e) {}
  return false;
}

/** Bước 1: kiểm tra link minh chứng, ghi báo cáo ra Google Sheet. */
function kiemTraLinkMinhChung() {
  const { manifest } = docZip_();
  const goc = DriveApp.getFolderById(CAU_HINH_PK.THU_MUC_GOC);
  const ss = SpreadsheetApp.create(CAU_HINH_PK.TEN_BAO_CAO);
  DriveApp.getFileById(ss.getId()).moveTo(goc);
  const sh = ss.getActiveSheet();
  const rows = [['Đoàn viên', 'Ô', 'Tình trạng', 'Nội dung đoàn viên ghi', 'Link', 'Xử lý trong bản đã sửa']];
  const cache = {};
  manifest.forEach(m => {
    m.links.forEach(l => {
      let tt, xuLy = '';
      if (l.kind === 'empty') {
        tt = 'Có kê khai nhưng không có link minh chứng';
        xuLy = m.xn ? 'Đã điền link file xác nhận BCH' : 'Chưa có file xác nhận BCH';
      } else if (l.kind === 'text_only') {
        tt = 'Chỉ là chữ, không có link';
        xuLy = m.xn ? 'Đã gắn link file xác nhận BCH' : 'Chưa có file xác nhận BCH';
      } else {
        const id = layIdDrive_(l.url);
        if (!id) tt = 'Link ngoài Drive – cần mở thủ công';
        else {
          if (!(id in cache)) cache[id] = moDuoc_(id);
          tt = cache[id] ? (l.kind === 'url_text' ? 'OK (link dán dạng chữ – đã chuyển thành link)' : 'OK')
                         : 'KHÔNG MỞ ĐƯỢC (chưa chia sẻ / đã xoá / sai link)';
        }
      }
      rows.push([m.name, l.cell, tt, l.text, l.url || '', xuLy]);
    });
  });
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  const loi = rows.filter((r, i) => i > 0 && !String(r[2]).startsWith('OK')).length;
  console.log('Đã kiểm tra ' + (rows.length - 1) + ' ô, có ' + loi + ' ô cần xem. Báo cáo: ' + ss.getUrl());
}

function tachAnh_(blobGoc, entry) {
  const parts = Utilities.unzip(blobGoc.copyBlob().setContentType('application/zip'));
  const p = parts.find(b => b.getName() === entry);
  return p || null;
}

function luuAnh_(m, anh) {
  const folder = DriveApp.getFolderById(m.folderId);
  const ext = anh.getName().split('.').pop().toLowerCase();
  const ten = 'Ảnh 3x4 - ' + m.name + '.' + ext;
  const it = folder.getFilesByName(ten);
  const f = it.hasNext() ? it.next()
    : folder.createFile(anh.copyBlob().setName(ten).setContentType(ext === 'png' ? 'image/png' : 'image/jpeg'));
  return 'https://drive.google.com/file/d/' + f.getId() + '/view?usp=drive_link';
}

function ganLinkAnh_(blobSua, url) {
  const parts = Utilities.unzip(blobSua.copyBlob().setContentType('application/zip'));
  const out = parts.map(b => {
    if (b.getName() !== 'xl/worksheets/_rels/sheet1.xml.rels') return b;
    const xml = b.getDataAsString('UTF-8').split(CAU_HINH_PK.PHOTO_PLACEHOLDER).join(url);
    return Utilities.newBlob(xml, 'application/xml', b.getName());
  });
  return Utilities.zip(out, 'phieu.xlsx');
}

function ghiDe_(fileId, blob) {
  const res = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media&supportsAllDrives=true', {
      method: 'patch', contentType: CAU_HINH_PK.XLSX, payload: blob.getBytes(),
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
    });
  if (res.getResponseCode() >= 300) throw new Error('Ghi đè thất bại: ' + res.getContentText().slice(0, 300));
}

/** Bước 2: sao lưu, tải ảnh 3x4, ghi đè file .xlsx gốc bằng bản đã sửa. Chạy lại nếu hết giờ. */
function capNhatPhieuKhai() {
  const t0 = Date.now();
  const props = PropertiesService.getScriptProperties();
  const { map, manifest } = docZip_();
  const saoLuu = thuMucCon_(DriveApp.getFolderById(CAU_HINH_PK.THU_MUC_GOC), CAU_HINH_PK.TEN_THU_MUC_SAO_LUU);
  const ketQua = [];
  for (const m of manifest) {
    if (props.getProperty('xong_' + m.fileId)) continue;
    if ((Date.now() - t0) / 1000 > CAU_HINH_PK.GIOI_HAN_GIAY) {
      console.log('Hết thời gian – hãy chạy lại capNhatPhieuKhai để làm tiếp.');
      break;
    }
    try {
      const goc = DriveApp.getFileById(m.fileId);
      const blobGoc = goc.getBlob();
      if (!props.getProperty('saoluu_' + m.fileId)) {
        goc.makeCopy(goc.getName(), saoLuu);
        props.setProperty('saoluu_' + m.fileId, '1');
      }
      let blob = map[m.fileId + '.xlsx'];
      let ghiChu = '';
      if (m.photoEntry) {
        const anh = tachAnh_(blobGoc, m.photoEntry);
        if (anh) { blob = ganLinkAnh_(blob, luuAnh_(m, anh)); ghiChu = 'đã tải ảnh 3x4'; }
        else ghiChu = 'KHÔNG tách được ảnh';
      }
      ghiDe_(m.fileId, blob);
      props.setProperty('xong_' + m.fileId, new Date().toISOString());
      ketQua.push('✔ ' + m.name + (ghiChu ? ' (' + ghiChu + ')' : ''));
    } catch (e) {
      ketQua.push('✘ ' + m.name + ': ' + e.message);
    }
  }
  const conLai = manifest.filter(m => !props.getProperty('xong_' + m.fileId)).map(m => m.name);
  console.log(ketQua.join('\n') + '\n\nCòn lại: ' + (conLai.length ? conLai.join(', ') : 'không'));
}

/** Bước 3 (tuỳ chọn): đưa các bản Google Sheet chuyển đổi trước đó vào Thùng rác. */
function xoaBanChuyenDoiGoogleSheet() {
  const { map } = docZip_();
  const ids = map['converted.json'] ? JSON.parse(map['converted.json'].getDataAsString('UTF-8')) : [];
  ids.forEach(id => {
    try { DriveApp.getFileById(id).setTrashed(true); console.log('Đã chuyển vào Thùng rác: ' + id); }
    catch (e) { console.log('Bỏ qua ' + id + ': ' + e.message); }
  });
}

/**
 * Phiếu khai dạng Google Sheet có ảnh chèn thẳng vào ô H2: lưu ảnh vào thư mục cá nhân
 * rồi thay ô H2 bằng chữ "Ảnh" có link tới ảnh. Quét mọi Google Sheet trong các thư mục "Năm ...".
 */
function anhTuGoogleSheet() {
  const nam = DriveApp.getFolderById(CAU_HINH_PK.THU_MUC_GOC).getFolders();
  const ketQua = [];
  while (nam.hasNext()) {
    const n = nam.next();
    if (!/^n[aă]m/i.test(n.getName().normalize('NFD').replace(/[̀-ͯ]/g, ''))) continue;
    const nguoi = n.getFolders();
    while (nguoi.hasNext()) {
      const tm = nguoi.next();
      const files = tm.getFilesByType(MimeType.GOOGLE_SHEETS);
      while (files.hasNext()) {
        const f = files.next();
        let sh;
        try { sh = SpreadsheetApp.openById(f.getId()).getSheets()[0]; } catch (e) { continue; }
        const o = sh.getRange('H2');
        const v = o.getValue();
        if (!v || typeof v.getContentUrl !== 'function') continue;
        const ten = String(sh.getRange('C9').getDisplayValue() || tm.getName()).trim();
        const res = UrlFetchApp.fetch(v.getContentUrl(), {
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
        if (res.getResponseCode() >= 300) { ketQua.push('✘ ' + ten + ': không tải được ảnh'); continue; }
        const anh = tm.createFile(res.getBlob().setName('Ảnh 3x4 - ' + ten + '.jpg'));
        const url = 'https://drive.google.com/file/d/' + anh.getId() + '/view?usp=drive_link';
        o.setRichTextValue(SpreadsheetApp.newRichTextValue().setText('Ảnh').setLinkUrl(url).build());
        ketQua.push('✔ ' + ten);
      }
    }
  }
  console.log(ketQua.length ? ketQua.join('\n') : 'Không có Google Sheet nào chèn ảnh ở H2.');
}

/**
 * Tạo phiếu khai dạng Google Sheet (ảnh/chữ ký nằm trong ô như file mẫu) cho từng đoàn viên
 * từ bản .xlsx đã sửa trong ZIP, đặt trong thư mục cá nhân; khôi phục file .xlsx gốc từ bản sao lưu.
 * Các bản Google Sheet thử nghiệm trước đó (converted.json) được đưa vào Thùng rác.
 * Chạy lại nếu báo hết thời gian — script tự làm tiếp.
 */
function taoGoogleSheet() {
  const t0 = Date.now();
  const props = PropertiesService.getScriptProperties();
  const { map, manifest } = docZip_();
  const goc = DriveApp.getFolderById(CAU_HINH_PK.THU_MUC_GOC);
  const saoLuu = thuMucCon_(goc, CAU_HINH_PK.TEN_THU_MUC_SAO_LUU);
  const mau = SpreadsheetApp.openById(CAU_HINH_PK.MAU).getSheets()[0];
  if (!props.getProperty('da_xoa_ban_thu')) {
    xoaBanChuyenDoiGoogleSheet();
    props.setProperty('da_xoa_ban_thu', '1');
  }
  const ketQua = [];
  for (const m of manifest) {
    if (props.getProperty('gs_' + m.fileId)) continue;
    if ((Date.now() - t0) / 1000 > CAU_HINH_PK.GIOI_HAN_GIAY) {
      console.log('Hết thời gian – hãy chạy lại taoGoogleSheet để làm tiếp.');
      break;
    }
    try {
      const xlsx = DriveApp.getFileById(m.fileId);
      // 1. bản .xlsx đã sửa (gắn link ảnh 3x4 nếu có)
      let blob = map[m.fileId + '.xlsx'];
      if (m.photoEntry) {
        const anh = tachAnh_(saoLuuBlob_(saoLuu, xlsx) || xlsx.getBlob(), m.photoEntry);
        if (anh) blob = ganLinkAnh_(blob, luuAnh_(m, anh));
      }
      // 2. khôi phục file .xlsx gốc từ bản sao lưu
      const bak = saoLuuBlob_(saoLuu, xlsx);
      if (bak && props.getProperty('xong_' + m.fileId)) ghiDe_(m.fileId, bak);
      // 3. chuyển thành Google Sheet trong thư mục cá nhân
      const ten = '03. ' + m.name.toUpperCase() + ' | PHIẾU KHAI SV5T 2025-2026';
      const ss = SpreadsheetApp.openById(nhapXlsx_(blob, ten, m.folderId));
      const M = ss.getSheets()[0];
      M.getImages().forEach(i => i.remove());
      // 4. lấy định dạng, phần đầu, phần cam kết – chữ ký (ảnh trong ô) từ file mẫu
      const T = mau.copyTo(ss);
      T.getRange('A1:J100').copyTo(M.getRange('A1:J100'), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      T.getRange('A1:G7').copyTo(M.getRange('A1:G7'));
      T.getRange('A83:J100').copyTo(M.getRange('A83:J100'));
      for (let c = 1; c <= 10; c++) M.setColumnWidth(c, T.getColumnWidth(c));
      [1, 2, 3, 4, 5, 6, 7].concat(Array.from({ length: 18 }, (_, i) => 83 + i))
        .forEach(r => M.setRowHeight(r, T.getRowHeight(r)));
      M.getRange('F96').clearContent();
      M.getRange('F100').setValue(m.name);
      ss.deleteSheet(T);
      M.setName('Trang tính1');
      props.setProperty('gs_' + m.fileId, ss.getId());
      ketQua.push('✔ ' + m.name + ': ' + ss.getUrl());
    } catch (e) {
      ketQua.push('✘ ' + m.name + ': ' + e.message);
    }
  }
  const conLai = manifest.filter(m => !props.getProperty('gs_' + m.fileId)).map(m => m.name);
  console.log(ketQua.join('\n') + '\n\nCòn lại: ' + (conLai.length ? conLai.join(', ') : 'không'));
}

function saoLuuBlob_(saoLuu, file) {
  const it = saoLuu.getFilesByName(file.getName());
  return it.hasNext() ? it.next().getBlob() : null;
}

/** Tải .xlsx lên và chuyển thành Google Sheet; trả về ID file mới. */
function nhapXlsx_(blob, ten, folderId) {
  const b = 'sv5t' + Date.now();
  const meta = JSON.stringify({ name: ten, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [folderId] });
  const payload = Utilities.newBlob('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
    '\r\n--' + b + '\r\nContent-Type: ' + CAU_HINH_PK.XLSX + '\r\n\r\n').getBytes()
    .concat(blob.getBytes())
    .concat(Utilities.newBlob('\r\n--' + b + '--').getBytes());
  const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'post', contentType: 'multipart/related; boundary=' + b, payload: payload,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('Tạo Google Sheet thất bại: ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText()).id;
}

/** Xoá trạng thái đã làm (chỉ dùng khi muốn chạy lại từ đầu). */
function datLaiTrangThai() {
  PropertiesService.getScriptProperties().deleteAllProperties();
}
