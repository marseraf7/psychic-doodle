// Dữ liệu sơ đồ tổ chức. Sửa nội dung, vị trí, thời điểm xuất hiện tại đây.
// LƯU Ý: số liệu tổng hợp từ báo chí, CẦN XÁC MINH với Ban Cán sự Đoàn / Hội SV trước khi dùng chính thức.
import { COLORS } from "./theme";

export type Branch = "top" | "doan" | "hoi";

export type OrgNode = {
  id: string;
  title: string;
  subtitle?: string;
  x: number; // tâm ô, theo pixel khung 1920x1080
  y: number;
  w: number;
  branch: Branch;
  appearAt: number; // khung hình (tính trong cảnh sơ đồ) bắt đầu xuất hiện
};

export type OrgEdge = {
  from: string;
  to: string;
  appearAt: number;
  dashed?: boolean;
  label?: string;
};

export const NODE_H = 118;

export const branchColor = (b: Branch) =>
  b === "top" ? COLORS.red : b === "doan" ? COLORS.doan : COLORS.hoi;

export const NODES: OrgNode[] = [
  {
    id: "top",
    title: "Đảng ủy & Đại sứ quán Việt Nam tại LB Nga",
    subtitle: "Lãnh đạo, chỉ đạo, quản lý",
    x: 960,
    y: 150,
    w: 760,
    branch: "top",
    appearAt: 0,
  },
  {
    id: "doan",
    title: "Ban Cán sự Đoàn tại LB Nga",
    subtitle: "Đoàn TNCS Hồ Chí Minh · thành lập 09/01/2001",
    x: 500,
    y: 390,
    w: 640,
    branch: "doan",
    appearAt: 30,
  },
  {
    id: "hoi",
    title: "Hội Sinh viên Việt Nam tại Nga",
    subtitle: "Đại hội lần thứ I: 03/2024",
    x: 1420,
    y: 390,
    w: 640,
    branch: "hoi",
    appearAt: 45,
  },
  {
    id: "doan-tp",
    title: "Đoàn Thanh niên các thành phố",
    subtitle: "Moskva, Saint Petersburg, …",
    x: 500,
    y: 620,
    w: 620,
    branch: "doan",
    appearAt: 95,
  },
  {
    id: "hoi-bch",
    title: "Ban Chấp hành (27) · Ban Thư ký (9)",
    subtitle: "Chủ tịch và 4 Phó Chủ tịch",
    x: 1420,
    y: 620,
    w: 640,
    branch: "hoi",
    appearAt: 110,
  },
  {
    id: "doan-cs",
    title: "Liên chi đoàn · Chi đoàn",
    subtitle: "Đoàn viên, sinh viên tại các trường",
    x: 500,
    y: 850,
    w: 620,
    branch: "doan",
    appearAt: 145,
  },
  {
    id: "hoi-cs",
    title: "Hội viên tại hơn 25 thành phố",
    subtitle: "Khoảng 3.000 sinh viên Việt Nam",
    x: 1420,
    y: 850,
    w: 640,
    branch: "hoi",
    appearAt: 160,
  },
];

export const EDGES: OrgEdge[] = [
  { from: "top", to: "doan", appearAt: 15 },
  { from: "top", to: "hoi", appearAt: 25 },
  { from: "doan", to: "hoi", appearAt: 70, dashed: true, label: "Phối hợp" },
  { from: "doan", to: "doan-tp", appearAt: 80 },
  { from: "hoi", to: "hoi-bch", appearAt: 95 },
  { from: "doan-tp", to: "doan-cs", appearAt: 130 },
  { from: "hoi-bch", to: "hoi-cs", appearAt: 145 },
];

export type StatCard = { value: string; label: string };

export const DOAN_STATS: StatCard[] = [
  { value: "25 năm", label: "Ban Cán sự Đoàn (2001 – 2026)" },
  { value: "2.888+", label: "đoàn viên (số liệu 2016)" },
  { value: "5 · 14 · 34", label: "Đoàn TP · Liên chi đoàn · Chi đoàn (2016)" },
];

export const HOI_STATS: StatCard[] = [
  { value: "~3.000", label: "sinh viên Việt Nam được đại diện" },
  { value: "25+", label: "thành phố trên khắp LB Nga" },
  { value: "2026 – 2028", label: "nhiệm kỳ Đại hội lần thứ II" },
];
