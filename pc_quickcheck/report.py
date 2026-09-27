# -*- coding: utf-8 -*-
"""Xuất báo cáo HTML tự chứa (không tải CSS/JS từ Internet) - mở bằng trình duyệt bất kỳ."""
import html
import os

from . import APP_NAME, VERSION
from .model import LEVEL_LABEL, worst

_CSS = """
:root{--bg:#f6f7f9;--card:#fff;--fg:#1d2330;--muted:#5b6475;--line:#e3e6ec;
--ok:#1a7f4b;--info:#2b62c9;--warn:#b26a00;--crit:#c62828;--unknown:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#12151b;--card:#1b2029;--fg:#e7eaf0;--muted:#9aa3b2;--line:#2c3340;
--ok:#4cc38a;--info:#6f9bff;--warn:#f0a93b;--crit:#ff6b6b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
font:14px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
.wrap{max-width:1150px;margin:0 auto;padding:20px 16px 40px}
header h1{margin:0 0 4px;font-size:22px}header .meta{color:var(--muted);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:16px 0}
.card h2{margin:0 0 10px;font-size:18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;color:#fff}
.b-ok{background:var(--ok)}.b-info{background:var(--info)}.b-warn{background:var(--warn)}
.b-crit{background:var(--crit)}.b-unknown{background:var(--unknown)}
.kv{display:grid;grid-template-columns:minmax(140px,240px) 1fr;gap:4px 14px;margin:0 0 10px}
.kv div:nth-child(odd){color:var(--muted)}
.f{border-left:4px solid var(--line);padding:6px 10px;margin:6px 0;background:rgba(127,127,127,.06);border-radius:0 6px 6px 0}
.f-ok{border-color:var(--ok)}.f-info{border-color:var(--info)}.f-warn{border-color:var(--warn)}.f-crit{border-color:var(--crit)}
.f .h{color:var(--muted);font-size:13px;margin-top:2px}
.tw{overflow-x:auto;margin:10px 0}table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600;white-space:nowrap}caption{text-align:left;font-weight:600;padding:4px 0}
.notes{color:var(--muted);font-size:13px;margin:8px 0 0;padding-left:18px}
nav a{margin-right:12px;color:var(--info);text-decoration:none}
footer{color:var(--muted);font-size:12px;margin-top:24px}
@media (max-width:640px){.kv{grid-template-columns:1fr}.kv div:nth-child(odd){margin-top:6px}}
"""

REPORT_FILES = {"overview": "tong_quan.html", "disk": "o_cung.html", "ram": "ram.html", "gpu": "vga_gpu.html",
                "crash": "crash_dump.html"}


def _e(s):
    return html.escape("" if s is None else str(s))


def render_section(sec):
    st = sec.get("status", "ok")
    out = [f'<section class="card" id="{_e(sec["key"])}"><h2>{_e(sec["title"])}'
           f'<span class="badge b-{_e(st)}">{_e(LEVEL_LABEL.get(st, st))}</span></h2>']
    if sec.get("summary"):
        out.append('<div class="kv">' + "".join(f"<div>{_e(k)}</div><div>{_e(v)}</div>" for k, v in sec["summary"]) + "</div>")
    for f in sec.get("findings", []):
        out.append(f'<div class="f f-{_e(f["level"])}"><b>{_e(LEVEL_LABEL.get(f["level"], ""))}:</b> {_e(f["text"])}'
                   + (f'<div class="h">&rarr; {_e(f["hint"])}</div>' if f.get("hint") else "") + "</div>")
    for t in sec.get("tables", []):
        out.append('<div class="tw"><table><caption>' + _e(t["title"]) + "</caption><thead><tr>"
                   + "".join(f"<th>{_e(c)}</th>" for c in t["columns"]) + "</tr></thead><tbody>"
                   + "".join("<tr>" + "".join(f"<td>{_e(c)}</td>" for c in r) + "</tr>" for r in t["rows"])
                   + "</tbody></table></div>")
    if sec.get("notes"):
        out.append('<ul class="notes">' + "".join(f"<li>{_e(n)}</li>" for n in sec["notes"]) + "</ul>")
    out.append("</section>")
    return "\n".join(out)


def render(sections, meta, title):
    overall = worst(*[s.get("status", "ok") for s in sections]) if sections else "ok"
    nav = ""
    if len(sections) > 1:
        nav = "<nav>" + "".join(f'<a href="#{_e(s["key"])}">{_e(s["title"])}</a>' for s in sections) + "</nav>"
    admin = "có" if meta.get("is_admin") else "KHÔNG (một số mục đọc thiếu)"
    mode = "Phân tích lại từ gói QA" if meta.get("mode") == "replay" else "Chạy trực tiếp"
    return f"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(title)}</title><style>{_CSS}</style></head><body><div class="wrap">
<header><h1>{_e(title)} <span class="badge b-{_e(overall)}">{_e(LEVEL_LABEL.get(overall, overall))}</span></h1>
<div class="meta">{_e(APP_NAME)} v{_e(meta.get("tool_version", VERSION))} &middot; {_e(mode)} &middot;
Thời điểm quét: {_e(meta.get("created", ""))} &middot; Quyền Administrator: {_e(admin)} &middot;
Event Log {_e(meta.get("days", ""))} ngày gần nhất</div>{nav}</header>
{''.join(render_section(s) for s in sections)}
<footer>Báo cáo được tạo cục bộ. {_e(APP_NAME)} chỉ đọc dữ liệu: không sửa hệ thống, không format, không repair,
không cài/xóa driver, không gửi dữ liệu đi đâu.</footer>
</div></body></html>"""


def write_reports(sections, meta, out_dir):
    """Ghi báo cáo riêng từng mục + báo cáo tổng hợp. Trả danh sách đường dẫn."""
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for s in sections:
        p = os.path.join(out_dir, REPORT_FILES.get(s["key"], s["key"] + ".html"))
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(render([s], meta, f"Báo cáo {s['title']}"))
        paths.append(p)
    if len(sections) > 1:
        p = os.path.join(out_dir, "bao_cao_tong_hop.html")
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(render(sections, meta, "Báo cáo tổng hợp"))
        paths.insert(0, p)
    return paths
