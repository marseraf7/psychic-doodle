# -*- coding: utf-8 -*-
"""Giao diện dòng lệnh + menu tiếng Việt."""
import argparse
import datetime as _dt
import json
import os
import sys

from . import APP_NAME, VERSION
from .model import LEVEL_TAG, LEVEL_LABEL
from .source import LiveSource, ReplaySource
from .collectors import overview, disk, memory, gpu, crash
from . import report, qa_export

MODULES = {"overview": overview, "disk": disk, "ram": memory, "gpu": gpu, "crash": crash}
ORDER = ["overview", "disk", "ram", "gpu", "crash"]
MENU = [
    ("1", "Kiểm tra tổng quan máy", ["overview"]),
    ("2", "Kiểm tra ổ cứng / SSD / NVMe", ["disk"]),
    ("3", "Chẩn đoán RAM", ["ram"]),
    ("4", "Chẩn đoán VGA / GPU", ["gpu"]),
    ("5", "Crash / Dump Analysis (BSOD, treo, tự restart)", ["crash"]),
    ("6", "Chạy TẤT CẢ + xuất báo cáo HTML", ORDER),
    ("7", "Xuất gói QA / Field Test (.zip đã ẩn dữ liệu nhạy cảm)", None),
    ("0", "Thoát", None),
]
DEMO_SNAPSHOT = os.path.join(os.path.dirname(__file__), "samples", "demo_snapshot.json")


def analyze(src, keys=ORDER):
    out = []
    for k in keys:
        try:
            out.append(MODULES[k].run(src))
        except Exception as e:  # lỗi 1 mục không làm dừng các mục khác
            out.append({"key": k, "title": k, "status": "unknown", "summary": [], "tables": [], "notes": [],
                        "findings": [{"level": "unknown", "text": f"Lỗi khi phân tích mục này: {type(e).__name__}: {e}",
                                      "hint": "Hãy gửi gói QA để tác giả sửa."}]})
    return out


def analyze_snapshot(snapshot):
    return analyze(ReplaySource(snapshot))


def print_section(sec):
    print()
    print("=" * 70)
    print(f" {sec['title'].upper()}  -  {LEVEL_LABEL.get(sec['status'], sec['status'])}")
    print("=" * 70)
    for k, v in sec["summary"]:
        print(f"  {k:<28}: {v}")
    if sec["findings"]:
        print()
    for f in sec["findings"]:
        print(f"  {LEVEL_TAG.get(f['level'], '    ')} {f['text']}")
        if f.get("hint"):
            print(f"        -> {f['hint']}")
    for n in sec["notes"]:
        print(f"  * {n}")


def _setup_console():
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _progress(key):
    label = key.split(":", 1)[-1][:50]
    sys.stdout.write(f"\r  đang đọc: {label:<50}")
    sys.stdout.flush()


def _open(path):
    try:
        if os.name == "nt":
            os.startfile(path)  # mở báo cáo bằng trình duyệt mặc định (file cục bộ)
    except Exception:
        pass


def _out_dir(base):
    return os.path.join(base, _dt.datetime.now().strftime("%Y%m%d_%H%M%S"))


def run_and_report(src, keys, out_base, open_report=True, as_json=False):
    sections = analyze(src, keys)
    msg = sys.stderr if as_json else sys.stdout  # giữ stdout là JSON sạch khi --json
    if not as_json:
        sys.stdout.write("\r" + " " * 64 + "\r")
        for s in sections:
            print_section(s)
    else:
        print(json.dumps(sections, ensure_ascii=False, indent=1))
    paths = report.write_reports(sections, src.meta, _out_dir(out_base))
    print(f"\nĐã lưu báo cáo HTML: {paths[0]}", file=msg)
    for p in paths[1:]:
        print(f"                     {p}", file=msg)
    if open_report and paths:
        _open(paths[0])
    return sections, paths


def export_qa(src, out_base, symptom=""):
    analyze(src, ORDER)  # đảm bảo đã thu thập đủ mọi mục
    sys.stdout.write("\r" + " " * 64 + "\r")
    path = qa_export.build_zip(src.snapshot(), out_base, symptom=symptom, analyze=analyze_snapshot,
                               render_reports=report.write_reports)
    print(f"\nĐã tạo gói QA (đã ẩn tên máy, tên người dùng, serial, IP...): {path}")
    print("Tool KHÔNG tự gửi file này đi đâu. Bạn tự quyết định gửi cho kỹ thuật viên nếu cần.")
    return path


def interactive(src, out_base):
    print(f"\n{APP_NAME} v{VERSION} - chẩn đoán nhanh, CHỈ ĐỌC dữ liệu (không sửa hệ thống, không upload).")
    if not src.meta.get("is_admin") and src.meta.get("mode") == "live":
        print("[!] Đang chạy KHÔNG có quyền Administrator: SMART / dump có thể đọc thiếu.")
    while True:
        print()
        for k, label, _ in MENU:
            print(f"  {k}. {label}")
        try:
            c = input("\nChọn: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        item = next((m for m in MENU if m[0] == c), None)
        if not item:
            continue
        if c == "0":
            return
        if c == "7":
            try:
                sym = input("Mô tả ngắn triệu chứng (Enter để bỏ qua): ")
            except (EOFError, KeyboardInterrupt):
                sym = ""
            export_qa(src, out_base, sym)
        else:
            run_and_report(src, item[2], out_base)


def main(argv=None):
    _setup_console()
    ap = argparse.ArgumentParser(prog="pc_quickcheck", description=f"{APP_NAME} v{VERSION} - chẩn đoán nhanh máy Windows (chỉ đọc)")
    ap.add_argument("--all", action="store_true", help="chạy tất cả các mục rồi thoát")
    ap.add_argument("--only", help="chỉ chạy các mục: " + ",".join(ORDER))
    ap.add_argument("--days", type=int, default=30, help="số ngày Event Log cần xem (mặc định 30)")
    ap.add_argument("--out", default="bao_cao_pc", help="thư mục lưu báo cáo (mặc định ./bao_cao_pc)")
    ap.add_argument("--qa-zip", action="store_true", help="xuất gói QA/Field Test (.zip đã ẩn dữ liệu nhạy cảm)")
    ap.add_argument("--symptom", default="", help="mô tả triệu chứng đưa vào gói QA")
    ap.add_argument("--replay", metavar="SNAPSHOT", help="phân tích lại snapshot.json (từ gói QA) - chạy được trên mọi HĐH")
    ap.add_argument("--demo", action="store_true", help="chạy với dữ liệu mẫu (không cần Windows)")
    ap.add_argument("--save-snapshot", metavar="FILE", help="lưu snapshot thô (CHƯA ẩn dữ liệu) để debug")
    ap.add_argument("--no-dxdiag", action="store_true", help="bỏ qua dxdiag (nhanh hơn ~20 giây)")
    ap.add_argument("--no-open", action="store_true", help="không tự mở báo cáo")
    ap.add_argument("--json", action="store_true", help="in kết quả dạng JSON")
    ap.add_argument("--version", action="version", version=f"{APP_NAME} {VERSION}")
    a = ap.parse_args(argv)

    if a.replay or a.demo:
        src = ReplaySource.from_file(a.replay or DEMO_SNAPSHOT)
    else:
        if os.name != "nt":
            print("Tool chỉ thu thập được dữ liệu trên Windows. Trên HĐH khác dùng --replay <snapshot.json> hoặc --demo.")
            return 2
        src = LiveSource(days=a.days, use_dxdiag=not a.no_dxdiag, progress=None if a.json else _progress)

    keys = ORDER
    if a.only:
        keys = [k.strip() for k in a.only.split(",") if k.strip()]
        bad = [k for k in keys if k not in MODULES]
        if bad:
            ap.error("mục không hợp lệ: " + ", ".join(bad))

    if not (a.all or a.only or a.qa_zip or a.replay or a.demo):
        interactive(src, a.out)
    else:
        if a.all or a.only or a.replay or a.demo:
            run_and_report(src, keys, a.out, open_report=not a.no_open, as_json=a.json)
        if a.qa_zip:
            export_qa(src, a.out, a.symptom)
    if a.save_snapshot and isinstance(src, LiveSource):
        with open(a.save_snapshot, "w", encoding="utf-8") as fh:
            json.dump(src.snapshot(), fh, ensure_ascii=False, indent=1)
        print(f"Đã lưu snapshot thô (CHƯA ẩn dữ liệu): {a.save_snapshot}")
    return 0
