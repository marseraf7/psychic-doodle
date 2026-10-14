"""
Thêm luật caro (Rapfi-CARO, luật Việt Nam) vào bản tải về của pytorch-nnue-trainer (https://github.com/dhbloo/pytorch-nnue-trainer,
commit ed6ff57 – bộ huấn luyện NNUE của tác giả Rapfi; không kèm trong repo này):
  - utils/data_utils.py: Rule.CARO = 7 (mã luật caro trong dữ liệu .binpack của Rapfi-CARO), chỉ số 3, tên "caro"
  - model/serialization/__init__.py: mặt nạ luật của file mạng bit 8 = caro (Rapfi-CARO: eval/weightloader.h)
  - export.py: đọc lại bit 8
  python3 trainer-add-caro.py <thư mục trainer>
Giữ nguyên kiểu xuống dòng (CRLF) của file gốc; chạy lại lần hai không đổi gì.
"""
import sys
from pathlib import Path

ROOT = Path(sys.argv[1])
EDITS = {
    "utils/data_utils.py": [
        ("    RENJU = 4\n", "    RENJU = 4\n    CARO = 7  # Rapfi-CARO (Vietnamese rule)\n"),
        ("expected freestyle, standard, or renju", "expected freestyle, standard, renju, or caro"),
        ("Indices = [0, 1, None, None, 2]", "Indices = [0, 1, None, None, 2, None, None, 3]"),
        ('RuleName = ["freestyle", "standard", None, None, "renju"]',
         'RuleName = ["freestyle", "standard", None, None, "renju", None, None, "caro"]'),
    ],
    "model/serialization/__init__.py": [
        ("        rule_mask |= 4\n    return rule_mask", "        rule_mask |= 4\n    if \"caro\" in rules:\n        rule_mask |= 8\n    return rule_mask"),
        ('if rule not in ["freestyle", "standard", "renju"]:', 'if rule not in ["freestyle", "standard", "renju", "caro"]:'),
        ("must be in [freestyle, standard, renju]", "must be in [freestyle, standard, renju, caro]"),
    ],
    "export.py": [
        ('        rules.append("renju")\n', '        rules.append("renju")\n    if rule_mask & 8:\n        rules.append("caro")\n'),
    ],
}

for rel, pairs in EDITS.items():
    path = ROOT / rel
    text = orig = path.read_bytes().decode("utf-8")
    nl = "\r\n" if "\r\n" in text else "\n"
    for old, new in pairs:
        old, new = old.replace("\n", nl), new.replace("\n", nl)
        if new in text:
            continue  # đã sửa
        if old not in text:
            sys.exit(f"{rel}: không thấy đoạn cần sửa – bản trainer khác commit ed6ff57?")
        text = text.replace(old, new, 1)
    if text != orig:
        path.write_bytes(text.encode("utf-8"))
        print("sửa", rel)
