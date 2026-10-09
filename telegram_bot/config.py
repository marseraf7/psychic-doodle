"""Đọc cấu hình từ file .env (cùng thư mục) hoặc biến môi trường."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file(BASE_DIR / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
ADMIN_IDS = {
    int(x) for x in os.environ.get("ADMIN_IDS", "").replace(" ", "").split(",") if x.lstrip("-").isdigit()
}
SHOP_NAME = os.environ.get("SHOP_NAME", "Siêu Thị AI")
SUPPORT_USERNAME = os.environ.get("SUPPORT_USERNAME", "").lstrip("@")

BANK_ID = os.environ.get("BANK_ID", "")
BANK_ACCOUNT = os.environ.get("BANK_ACCOUNT", "")
BANK_OWNER = os.environ.get("BANK_OWNER", "")
TOPUP_PREFIX = os.environ.get("TOPUP_PREFIX", "SAI").upper()
MIN_TOPUP = _int("MIN_TOPUP", 10000)
REF_PERCENT = _int("REF_PERCENT", 5)
SEED_DEMO = os.environ.get("SEED_DEMO", "1") == "1"

DB_PATH = Path(os.environ.get("DB_PATH", "data/shop.db"))
if not DB_PATH.is_absolute():
    DB_PATH = BASE_DIR / DB_PATH

# Google Sheet bảng giá (cột A: tên, cột B: giá, cột C: ghi chú "HẾT HÀNG")
SHEET_URL = os.environ.get("SHEET_URL", "")
PRICE_MARKUP = _int("PRICE_MARKUP", 20000)
SYNC_MINUTES = max(1, _int("SYNC_MINUTES", 60))
