// Cấu trúc kich-ban.json. Mỗi cảnh có "loai" và "giay" (thời lượng).
export type ChuyenCanh = "cat" | "loe-sang" | "zoom-mo";

type CanhChung = { giay: number; chuyen?: ChuyenCanh; ghiChu?: string };

export type CanhMoDau = CanhChung & {
  loai: "mo-dau";
  bieuTuong?: string[]; // ảnh PNG trong public/, ví dụ ["logo-dang.png"]
  tieuDe: string;
  phuDe?: string;
};
export type CanhFootage = CanhChung & {
  loai: "footage";
  nguon?: string; // ảnh hoặc video trong public/
  chuyenDong?: "zoom-vao" | "zoom-ra" | "lia-trai" | "lia-phai";
  chuTren?: string; // chữ chạy ngang (tùy chọn)
};
export type CanhVanBan = CanhChung & {
  loai: "van-ban";
  logo?: string;
  tieuDe: string;
  dong: string[]; // các đoạn văn bản trên trang giấy
  toSang: number[]; // chỉ số đoạn được làm nổi bật ở pha cận cảnh
};
export type CanhTuKhoa = CanhChung & {
  loai: "tu-khoa";
  bangRon?: string; // dòng nhỏ trên cùng, ví dụ "THANH NIÊN VIỆT NAM"
  tuKhoa: string[];
  anhMinhHoa?: string;
};
export type CanhSoLieu = CanhChung & {
  loai: "so-lieu";
  nam?: string;
  so: number;
  donVi?: string;
  chuThich: string;
  anh?: string;
};
export type CanhChuong = CanhChung & { loai: "chuong"; chu: string };
export type CanhLuoiAnh = CanhChung & { loai: "luoi-anh"; anh: string[] };
export type CanhTuongAnh = CanhChung & { loai: "tuong-anh"; anh: string[]; noiBat?: number[] };
export type CanhKet = CanhChung & { loai: "ket"; logo?: string; khauHieu: string };

export type Canh =
  | CanhMoDau
  | CanhFootage
  | CanhVanBan
  | CanhTuKhoa
  | CanhSoLieu
  | CanhChuong
  | CanhLuoiAnh
  | CanhTuongAnh
  | CanhKet;

export type KichBan = {
  meta: {
    tieuDe: string;
    fps: number;
    rong: number;
    cao: number;
    loiDan?: string; // file giọng đọc trong public/
    nhacNen?: string;
    amLuongNhac?: number; // 0..1, mặc định 0.18 khi có lời dẫn
  };
  canh: Canh[];
};
