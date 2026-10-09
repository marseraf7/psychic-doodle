"""Đồng bộ danh sách sản phẩm + giá từ Google Sheet (cột A: tên, cột B: giá, cột C: ghi chú)."""
import csv
import io
import logging
import re
import unicodedata

import httpx

from utils import parse_amount

log = logging.getLogger("sieuthiai.sheet")

# (từ khoá trong tên, danh mục) — xét theo thứ tự, khớp đầu tiên được chọn
CATEGORY_RULES = [
    (("API ",), ("🔌", "API Token AI")),
    (("CAPCUT", "CANVA", "ADOBE", "PICSART", "PISCART", "FIGMA", "MEITU", "WINK"), ("🎨", "Thiết kế & Chỉnh sửa")),
    (("VEO", "KLING", "HIGG", "LEONARDO", "FREEPIK", "HEYGEN", "MIDJOURNEY", "RUNWAY", "HAILOU", "HAILUO", "VIDU",
      "PIXVERSE", "SUNO", "ELEVENLABS", "VBEE"), ("🎬", "AI Ảnh, Video & Giọng nói")),
    (("CHATGPT", "CLAUDE", "GROK", "GEMINI", "PERPLEXITY", "COPILOT", "COLIPOT", "MONICA", "GENSPARK", "CURSOR",
      "LOVEABLE", "LOVABLE"), ("🤖", "AI Chat & Lập trình")),
    (("VPN", "PROXY"), ("🛡", "VPN & Proxy")),
    (("NETFLIX", "NEXTFLIX", "NEXTFARM", "SPOTIFY", "YOUTUBE", "IQIYI", "VIEON", "YOUKU", "CRUNCHYROLL", "XBOX",
      "LOCKET"), ("🍿", "Giải trí")),
    (("OFFICE", "MICRO OFF", "ZOOM", "SCRIBD", "TURNITIN", "ELSA", "DOULINGO", "DUOLINGO", "NOTION", "TRADINGVIEW",
      "SEMRUSH"), ("📚", "Học tập & Làm việc")),
    (("GOLOGIN", "GPM", "FACEBOOK", "INSTAGRAM", "DISCORD", "TIKTOK"), ("📈", "MMO & Marketing")),
]
DEFAULT_CATEGORY = ("📦", "Sản phẩm khác")


def csv_url(url: str) -> str:
    """Đổi link Google Sheet (edit/share) sang link tải CSV."""
    m = re.search(r"/spreadsheets/d/([\w-]+)", url)
    if not m:
        return url
    gid = re.search(r"[#&?]gid=(\d+)", url)
    return f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv" + (f"&gid={gid.group(1)}" if gid else "")


def normalize_key(name: str) -> str:
    return " ".join(unicodedata.normalize("NFC", name).lower().split())


def category_for(name: str):
    up = " " + name.upper() + " "
    for words, cat in CATEGORY_RULES:
        if any(w in up for w in words):
            return cat
    return DEFAULT_CATEGORY


def parse_sheet(text: str, markup: int):
    """Trả về [(key, tên, giá bán, danh mục, hết hàng?)] — bỏ qua dòng tiêu đề / dòng không có giá."""
    rows, seen = [], set()
    for cells in csv.reader(io.StringIO(text)):
        if len(cells) < 2:
            continue
        name = " ".join(cells[0].split())
        price = parse_amount(cells[1]) if cells[1].strip() else None
        if not name or not price or price <= 0:
            continue
        key = normalize_key(name)
        if key in seen:
            continue
        seen.add(key)
        note = " ".join(cells[2:]).upper()
        sold_out = "HẾT HÀNG" in note or "HET HANG" in note
        rows.append((key, name, price + markup, category_for(name), sold_out))
    return rows


async def fetch_rows(url: str, markup: int):
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        r = await client.get(csv_url(url))
        r.raise_for_status()
        if "text/csv" not in r.headers.get("content-type", ""):
            raise ValueError("Không đọc được sheet — hãy bật chia sẻ 'Bất kỳ ai có đường liên kết đều xem được'.")
        return parse_sheet(r.content.decode("utf-8-sig"), markup)
