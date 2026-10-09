"""Lưu trữ SQLite cho shop: khách hàng, danh mục, sản phẩm, kho hàng, đơn hàng, phiếu nạp."""
import re
import sqlite3
from datetime import datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    username    TEXT,
    full_name   TEXT,
    balance     INTEGER NOT NULL DEFAULT 0,
    referrer_id INTEGER,
    ref_earned  INTEGER NOT NULL DEFAULT 0,
    banned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '📦'
);
CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price       INTEGER NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS stock (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    content    TEXT NOT NULL,
    order_id   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_stock_free ON stock(product_id, order_id);
CREATE TABLE IF NOT EXISTS orders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity   INTEGER NOT NULL,
    total      INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, id);
CREATE TABLE IF NOT EXISTS topups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    amount     INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',  -- pending | done | rejected
    created_at TEXT NOT NULL,
    handled_by INTEGER
);
"""

DEMO = [
    ("🤖", "ChatGPT", [
        ("ChatGPT Plus 1 tháng (tài khoản riêng)", 120000, "Tài khoản ChatGPT Plus chính chủ, dùng GPT mới nhất, bảo hành 30 ngày."),
        ("ChatGPT Plus 1 tháng (nâng cấp chính chủ)", 150000, "Nâng cấp trên email của bạn. Gửi email cho hỗ trợ sau khi mua."),
    ]),
    ("🧠", "Claude", [
        ("Claude Pro 1 tháng", 180000, "Tài khoản Claude Pro, dùng các model Claude mới nhất, bảo hành 30 ngày."),
    ]),
    ("✨", "Gemini", [
        ("Google AI Pro 1 năm", 250000, "Gemini Advanced + 2TB Google One, nâng cấp chính chủ."),
    ]),
    ("🎨", "Thiết kế & Video", [
        ("Canva Pro 1 năm", 90000, "Mời vào team Canva Pro, dùng trên email của bạn."),
        ("CapCut Pro 1 tháng", 60000, "Tài khoản CapCut Pro dùng trên mọi thiết bị."),
        ("Midjourney Basic 1 tháng", 200000, "Tài khoản Midjourney gói Basic."),
    ]),
]


def describe(name: str) -> str:
    """Mô tả tự động cho sản phẩm lấy từ sheet, dựa vào ký hiệu bảo hành trong tên."""
    up = name.upper()
    if "KBH" in up:
        warranty = "Không bảo hành."
    elif re.search(r"\bBHF\b|BẢO HÀNH FULL", up):
        warranty = "Bảo hành full thời gian sử dụng."
    else:
        m = re.search(r"\bBH\s*(\d+)\s*(D|NGÀY)?", up)
        warranty = f"Bảo hành {m.group(1)} ngày." if m else ""
    return ("🛡 " + warranty + "\n" if warranty else "") + \
        "📩 Sau khi thanh toán, admin sẽ giao hàng qua bot trong thời gian sớm nhất."


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class InsufficientBalance(Exception):
    pass


class OutOfStock(Exception):
    pass


class DB:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        # isolation_level=None: tự quản lý giao dịch bằng BEGIN IMMEDIATE
        self.conn = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)
        self._migrate()

    def _migrate(self):
        """Thêm cột mới cho CSDL tạo từ bản cũ."""
        cols = {
            "products": [
                ("source_key", "TEXT"),                       # khoá sản phẩm đồng bộ từ Google Sheet
                ("manual", "INTEGER NOT NULL DEFAULT 0"),     # 1 = hết kho vẫn bán, admin giao tay
                ("sold_out", "INTEGER NOT NULL DEFAULT 0"),   # 1 = nguồn báo hết hàng
                ("admin_hidden", "INTEGER NOT NULL DEFAULT 0"),
            ],
            "orders": [
                ("status", "TEXT NOT NULL DEFAULT 'done'"),   # done | pending | cancelled
                ("delivery", "TEXT"),                         # nội dung admin giao tay
            ],
        }
        for table, wanted in cols.items():
            have = {r["name"] for r in self.all(f"PRAGMA table_info({table})")}
            for name, decl in wanted:
                if name not in have:
                    self.run(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
        self.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_source ON products(source_key)")

    # ---------- tiện ích ----------
    def one(self, sql, *args):
        return self.conn.execute(sql, args).fetchone()

    def all(self, sql, *args):
        return self.conn.execute(sql, args).fetchall()

    def run(self, sql, *args):
        return self.conn.execute(sql, args)

    def tx(self):
        db = self

        class _Tx:
            def __enter__(self):
                db.conn.execute("BEGIN IMMEDIATE")
                return db

            def __exit__(self, exc_type, *_):
                db.conn.execute("ROLLBACK" if exc_type else "COMMIT")
                return False

        return _Tx()

    def seed_demo(self):
        if self.one("SELECT 1 FROM categories LIMIT 1"):
            return
        with self.tx():
            for emoji, name, products in DEMO:
                cid = self.run("INSERT INTO categories(name, emoji) VALUES (?, ?)", name, emoji).lastrowid
                for pname, price, desc in products:
                    self.run(
                        "INSERT INTO products(category_id, name, description, price) VALUES (?, ?, ?, ?)",
                        cid, pname, desc, price,
                    )

    # ---------- khách hàng ----------
    def upsert_user(self, uid, username, full_name, referrer_id=None) -> bool:
        """Trả về True nếu là khách mới."""
        if self.one("SELECT 1 FROM users WHERE id=?", uid):
            self.run("UPDATE users SET username=?, full_name=? WHERE id=?", username, full_name, uid)
            return False
        if referrer_id == uid or (referrer_id and not self.one("SELECT 1 FROM users WHERE id=?", referrer_id)):
            referrer_id = None
        self.run(
            "INSERT INTO users(id, username, full_name, referrer_id, created_at) VALUES (?, ?, ?, ?, ?)",
            uid, username, full_name, referrer_id, now(),
        )
        return True

    def get_user(self, uid):
        return self.one("SELECT * FROM users WHERE id=?", uid)

    def add_balance(self, uid, amount) -> int | None:
        with self.tx():
            if not self.one("SELECT 1 FROM users WHERE id=?", uid):
                return None
            self.run("UPDATE users SET balance = balance + ? WHERE id=?", amount, uid)
            return self.one("SELECT balance FROM users WHERE id=?", uid)["balance"]

    # ---------- danh mục & sản phẩm ----------
    def categories(self):
        return self.all(
            """SELECT c.*, COUNT(p.id) AS n FROM categories c
               LEFT JOIN products p ON p.category_id = c.id AND p.active = 1
               GROUP BY c.id HAVING n > 0 ORDER BY c.id"""
        )

    def products(self, category_id=None, include_hidden=False):
        sql = """SELECT p.*, (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.order_id IS NULL) AS in_stock
                 FROM products p WHERE 1=1"""
        args = []
        if category_id is not None:
            sql += " AND p.category_id = ?"
            args.append(category_id)
        if not include_hidden:
            sql += " AND p.active = 1"
        return self.all(sql + " ORDER BY p.category_id, p.id", *args)

    def product(self, pid):
        return self.one(
            """SELECT p.*, (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.order_id IS NULL) AS in_stock
               FROM products p WHERE p.id = ?""",
            pid,
        )

    def add_category(self, emoji, name):
        return self.run("INSERT INTO categories(name, emoji) VALUES (?, ?)", name, emoji).lastrowid

    def add_product(self, category_id, name, price, description):
        return self.run(
            "INSERT INTO products(category_id, name, description, price) VALUES (?, ?, ?, ?)",
            category_id, name, description, price,
        ).lastrowid

    def add_stock(self, pid, lines) -> int:
        with self.tx():
            for line in lines:
                self.run("INSERT INTO stock(product_id, content) VALUES (?, ?)", pid, line)
        return len(lines)

    # ---------- mua hàng ----------
    def buy(self, uid, pid, qty):
        """Trừ tiền + xuất kho trong một giao dịch. Trả về (order_id, [nội dung], số dư mới).

        Kho đủ -> giao ngay. Kho thiếu mà sản phẩm bán kiểu đặt hàng -> tạo đơn chờ admin giao ([] nội dung).
        """
        with self.tx():
            p = self.one("SELECT * FROM products WHERE id=? AND active=1", pid)
            if not p:
                raise OutOfStock()
            items = self.all(
                "SELECT id, content FROM stock WHERE product_id=? AND order_id IS NULL ORDER BY id LIMIT ?", pid, qty
            )
            if len(items) < qty:
                if not p["manual"] or p["sold_out"]:
                    raise OutOfStock()
                items = []
            total = p["price"] * qty
            balance = self.one("SELECT balance FROM users WHERE id=?", uid)["balance"]
            if balance < total:
                raise InsufficientBalance(total - balance)
            self.run("UPDATE users SET balance = balance - ? WHERE id=?", total, uid)
            oid = self.run(
                "INSERT INTO orders(user_id, product_id, quantity, total, created_at, status) VALUES (?, ?, ?, ?, ?, ?)",
                uid, pid, qty, total, now(), "done" if items else "pending",
            ).lastrowid
            self.conn.executemany("UPDATE stock SET order_id=? WHERE id=?", [(oid, it["id"]) for it in items])
            return oid, [it["content"] for it in items], balance - total

    def orders(self, uid, limit=10):
        return self.all(
            """SELECT o.*, p.name FROM orders o JOIN products p ON p.id = o.product_id
               WHERE o.user_id=? ORDER BY o.id DESC LIMIT ?""",
            uid, limit,
        )

    def order(self, oid):
        o = self.one("SELECT o.*, p.name FROM orders o JOIN products p ON p.id = o.product_id WHERE o.id=?", oid)
        if not o:
            return None, []
        items = [r["content"] for r in self.all("SELECT content FROM stock WHERE order_id=? ORDER BY id", oid)]
        if o["delivery"]:
            items.append(o["delivery"])
        return o, items

    def pending_orders(self):
        return self.all(
            """SELECT o.*, p.name, u.full_name, u.username FROM orders o
               JOIN products p ON p.id = o.product_id JOIN users u ON u.id = o.user_id
               WHERE o.status='pending' ORDER BY o.id"""
        )

    def deliver_order(self, oid, content) -> bool:
        return self.run(
            "UPDATE orders SET status='done', delivery=? WHERE id=? AND status='pending'", content, oid
        ).rowcount == 1

    def cancel_order(self, oid):
        """Huỷ đơn chờ giao và hoàn tiền. Trả về (đơn, số dư mới) hoặc None."""
        with self.tx():
            o = self.one("SELECT * FROM orders WHERE id=? AND status='pending'", oid)
            if not o:
                return None
            self.run("UPDATE orders SET status='cancelled' WHERE id=?", oid)
            self.run("UPDATE users SET balance = balance + ? WHERE id=?", o["total"], o["user_id"])
            return o, self.one("SELECT balance FROM users WHERE id=?", o["user_id"])["balance"]

    # ---------- đồng bộ Google Sheet ----------
    def sync_sheet_products(self, rows):
        """rows: [(key, tên, giá, danh mục (emoji, tên), hết hàng?)]. Trả về thống kê thay đổi."""
        stats = {"added": 0, "updated": 0, "removed": 0}
        with self.tx():
            cat_ids = {}
            for _, _, _, (emoji, cname), _ in rows:
                if cname not in cat_ids:
                    c = self.one("SELECT id FROM categories WHERE name=?", cname)
                    cat_ids[cname] = c["id"] if c else self.add_category(emoji, cname)
            seen = set()
            for key, name, price, (_, cname), sold_out in rows:
                seen.add(key)
                p = self.one("SELECT * FROM products WHERE source_key=?", key)
                if not p:
                    self.run(
                        """INSERT INTO products(category_id, name, description, price, source_key, manual, sold_out)
                           VALUES (?, ?, ?, ?, ?, 1, ?)""",
                        cat_ids[cname], name, describe(name), price, key, int(sold_out),
                    )
                    stats["added"] += 1
                    continue
                active = 0 if p["admin_hidden"] else 1
                changed = (p["name"], p["price"], p["sold_out"], p["active"], p["category_id"]) != (
                    name, price, int(sold_out), active, cat_ids[cname])
                if changed:
                    self.run(
                        "UPDATE products SET name=?, price=?, sold_out=?, active=?, category_id=? WHERE id=?",
                        name, price, int(sold_out), active, cat_ids[cname], p["id"],
                    )
                    stats["updated"] += 1
            # ẩn sản phẩm mẫu (giá minh hoạ) nếu chưa từng nhập kho
            for _, _, products in DEMO:
                for pname, _, _ in products:
                    self.run(
                        """UPDATE products SET active=0 WHERE name=? AND source_key IS NULL AND active=1
                           AND NOT EXISTS (SELECT 1 FROM stock s WHERE s.product_id = products.id)""",
                        pname,
                    )
            for p in self.all("SELECT id, source_key FROM products WHERE source_key IS NOT NULL AND active=1"):
                if p["source_key"] not in seen:
                    self.run("UPDATE products SET active=0 WHERE id=?", p["id"])
                    stats["removed"] += 1
        return stats

    # ---------- nạp tiền ----------
    def create_topup(self, uid, amount):
        return self.run(
            "INSERT INTO topups(user_id, amount, created_at) VALUES (?, ?, ?)", uid, amount, now()
        ).lastrowid

    def topup(self, tid):
        return self.one("SELECT * FROM topups WHERE id=?", tid)

    def resolve_topup(self, tid, admin_id, approve: bool, ref_percent=0):
        """Duyệt/huỷ phiếu nạp đúng một lần. Trả về (phiếu, số dư mới, (referrer_id, hoa hồng)) hoặc None nếu đã xử lý."""
        with self.tx():
            t = self.one("SELECT * FROM topups WHERE id=? AND status='pending'", tid)
            if not t:
                return None
            self.run(
                "UPDATE topups SET status=?, handled_by=? WHERE id=?",
                "done" if approve else "rejected", admin_id, tid,
            )
            if not approve:
                return t, None, None
            self.run("UPDATE users SET balance = balance + ? WHERE id=?", t["amount"], t["user_id"])
            u = self.one("SELECT balance, referrer_id FROM users WHERE id=?", t["user_id"])
            ref = None
            bonus = t["amount"] * ref_percent // 100
            if u["referrer_id"] and bonus > 0:
                self.run(
                    "UPDATE users SET balance = balance + ?, ref_earned = ref_earned + ? WHERE id=?",
                    bonus, bonus, u["referrer_id"],
                )
                ref = (u["referrer_id"], bonus)
            return t, u["balance"], ref

    # ---------- thống kê ----------
    def stats(self):
        return {
            "users": self.one("SELECT COUNT(*) n FROM users")["n"],
            "orders": self.one("SELECT COUNT(*) n FROM orders")["n"],
            "revenue": self.one("SELECT COALESCE(SUM(total), 0) n FROM orders")["n"],
            "topup": self.one("SELECT COALESCE(SUM(amount), 0) n FROM topups WHERE status='done'")["n"],
            "pending": self.one("SELECT COUNT(*) n FROM topups WHERE status='pending'")["n"],
            "today_revenue": self.one(
                "SELECT COALESCE(SUM(total), 0) n FROM orders WHERE created_at >= ?", now()[:10]
            )["n"],
        }

    def referrals(self, uid):
        return self.one("SELECT COUNT(*) n FROM users WHERE referrer_id=?", uid)["n"]

    def all_user_ids(self):
        return [r["id"] for r in self.all("SELECT id FROM users WHERE banned=0")]
