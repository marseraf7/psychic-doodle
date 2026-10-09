"""Hàm dùng chung: định dạng và đọc số tiền."""


def vnd(n: int) -> str:
    return f"{n:,}".replace(",", ".") + "đ"


def parse_amount(text: str) -> int | None:
    """'150000', '150.000', '150k', '1.5tr', '2m' -> số nguyên VND."""
    t = text.lower().replace("vnd", "").replace("đ", "").replace(" ", "")
    mult = 1
    for suffix, m in (("tr", 1_000_000), ("m", 1_000_000), ("k", 1000)):
        if t.endswith(suffix):
            t, mult = t[: -len(suffix)].replace(",", "."), m
            break
    else:
        t = t.replace(".", "").replace(",", "")
    try:
        value = round(float(t) * mult)
    except ValueError:
        return None
    return value if abs(value) < 10**12 else None
