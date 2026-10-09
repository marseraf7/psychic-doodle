"""Bot Telegram bán tài khoản / dịch vụ AI — mẫu "Siêu Thị AI".

Chạy:  python bot.py   (cấu hình trong file .env, xem .env.example)
"""
import asyncio
import html
import io
import logging
from urllib.parse import quote

from telegram import (
    BotCommand,
    InlineKeyboardButton as Btn,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    Update,
)
from telegram.constants import ParseMode
from telegram.error import Forbidden, TelegramError
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

import config
import sheet_sync
from db import DB, InsufficientBalance, OutOfStock
from utils import parse_amount, vnd

logging.basicConfig(format="%(asctime)s %(levelname)s %(name)s: %(message)s", level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("sieuthiai")

db = DB(config.DB_PATH)

# ---------- nút menu chính ----------
M_SHOP = "🛒 Sản phẩm"
M_ACCOUNT = "👤 Tài khoản"
M_TOPUP = "💰 Nạp tiền"
M_ORDERS = "📦 Đơn hàng"
M_REF = "🎁 Giới thiệu"
M_SUPPORT = "📞 Hỗ trợ"

MAIN_MENU = ReplyKeyboardMarkup(
    [[KeyboardButton(M_SHOP), KeyboardButton(M_TOPUP)],
     [KeyboardButton(M_ACCOUNT), KeyboardButton(M_ORDERS)],
     [KeyboardButton(M_REF), KeyboardButton(M_SUPPORT)]],
    resize_keyboard=True,
)

TOPUP_AMOUNTS = [20000, 50000, 100000, 200000, 500000, 1000000]
MAX_TOPUP = 50_000_000


def esc(s) -> str:
    return html.escape(str(s or ""))


def is_admin(uid: int) -> bool:
    return uid in config.ADMIN_IDS


async def touch_user(update: Update, referrer_id=None):
    u = update.effective_user
    return db.upsert_user(u.id, u.username, u.full_name, referrer_id)


def banned(update: Update) -> bool:
    row = db.get_user(update.effective_user.id)
    return bool(row and row["banned"])


async def reply(update: Update, text: str, markup=None):
    """Trả lời tin nhắn, hoặc sửa tin nhắn cũ nếu đến từ nút bấm inline."""
    q = update.callback_query
    if q:
        try:
            await q.edit_message_text(text, parse_mode=ParseMode.HTML, reply_markup=markup,
                                      disable_web_page_preview=True)
            return
        except TelegramError:
            # tin cũ là ảnh (QR) hoặc nội dung không đổi -> gửi tin mới
            pass
    await update.effective_chat.send_message(text, parse_mode=ParseMode.HTML, reply_markup=markup,
                                             disable_web_page_preview=True)


# ================= KHÁCH HÀNG =================

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ref = None
    if ctx.args and ctx.args[0].startswith("ref"):
        try:
            ref = int(ctx.args[0][3:])
        except ValueError:
            pass
    is_new = await touch_user(update, ref)
    if banned(update):
        return
    user = update.effective_user
    if is_new and ref and db.get_user(user.id)["referrer_id"] == ref:
        try:
            await ctx.bot.send_message(ref, f"🎉 <b>{esc(user.full_name)}</b> vừa tham gia qua link giới thiệu của bạn!",
                                       parse_mode=ParseMode.HTML)
        except TelegramError:
            pass
    await update.message.reply_text(
        f"👋 Xin chào <b>{esc(user.full_name)}</b>!\n\n"
        f"Chào mừng bạn đến với <b>{esc(config.SHOP_NAME)}</b> 🤖🛒\n"
        "Nơi cung cấp tài khoản & dịch vụ AI uy tín, giá tốt: ChatGPT, Claude, Gemini, Midjourney, Canva, CapCut...\n\n"
        "⚡ Giao hàng <b>tự động 24/7</b> ngay sau khi thanh toán\n"
        "🛡 Bảo hành đầy đủ theo từng sản phẩm\n\n"
        "👇 Chọn chức năng bên dưới để bắt đầu.",
        parse_mode=ParseMode.HTML,
        reply_markup=MAIN_MENU,
    )


async def show_categories(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    cats = db.categories()
    if not cats:
        await reply(update, "😔 Hiện shop chưa có sản phẩm nào. Vui lòng quay lại sau!")
        return
    kb = [[Btn(f"{c['emoji']} {c['name']} ({c['n']})", callback_data=f"cat:{c['id']}")] for c in cats]
    await reply(update, "🛒 <b>DANH MỤC SẢN PHẨM</b>\n\nChọn danh mục bạn quan tâm:", InlineKeyboardMarkup(kb))


def can_sell(p, qty=1) -> bool:
    """Đủ hàng trong kho, hoặc sản phẩm bán kiểu đặt hàng (admin giao tay) và nguồn chưa báo hết."""
    return p["in_stock"] >= qty or bool(p["manual"] and not p["sold_out"])


def stock_label(p) -> str:
    if p["in_stock"]:
        return f"còn {p['in_stock']}"
    return "còn hàng" if can_sell(p) else "hết hàng"


async def show_category(update: Update, ctx, cid: int):
    prods = db.products(cid)
    if not prods:
        await reply(update, "Danh mục này chưa có sản phẩm.", InlineKeyboardMarkup([[Btn("⬅️ Quay lại", callback_data="cats")]]))
        return
    kb = []
    for p in prods:
        icon = "" if can_sell(p) else "⛔ "
        kb.append([Btn(f"{icon}{p['name']} • {vnd(p['price'])}", callback_data=f"prod:{p['id']}")])
    kb.append([Btn("⬅️ Danh mục", callback_data="cats")])
    await reply(update, "📋 <b>Chọn sản phẩm:</b>", InlineKeyboardMarkup(kb))


async def show_product(update: Update, ctx, pid: int):
    p = db.product(pid)
    if not p or not p["active"]:
        await reply(update, "Sản phẩm không tồn tại hoặc đã ngừng bán.")
        return
    text = (
        f"🏷 <b>{esc(p['name'])}</b>\n\n"
        f"{esc(p['description'])}\n\n"
        f"💵 Giá: <b>{vnd(p['price'])}</b>\n"
        f"📦 Tình trạng: <b>{stock_label(p)}</b>"
    )
    kb = []
    if can_sell(p):
        qtys = [q for q in (1, 2, 3, 5, 10) if can_sell(p, q)]
        kb.append([Btn(f"Mua {q}", callback_data=f"buy:{pid}:{q}") for q in qtys])
    else:
        text += "\n\n⛔ Sản phẩm tạm hết hàng. Liên hệ hỗ trợ để đặt trước."
    kb.append([Btn("⬅️ Quay lại", callback_data=f"cat:{p['category_id']}")])
    await reply(update, text, InlineKeyboardMarkup(kb))


async def confirm_buy(update: Update, ctx, pid: int, qty: int):
    p = db.product(pid)
    u = db.get_user(update.effective_user.id)
    if not p or not p["active"] or not can_sell(p, qty):
        await reply(update, "⛔ Không đủ hàng.", InlineKeyboardMarkup([[Btn("⬅️ Quay lại", callback_data=f"prod:{pid}")]]))
        return
    total = p["price"] * qty
    text = (
        "🧾 <b>XÁC NHẬN ĐƠN HÀNG</b>\n\n"
        f"Sản phẩm: <b>{esc(p['name'])}</b>\n"
        f"Số lượng: <b>{qty}</b>\n"
        f"Thành tiền: <b>{vnd(total)}</b>\n"
        f"Số dư hiện tại: <b>{vnd(u['balance'])}</b>"
    )
    if u["balance"] < total:
        text += f"\n\n⚠️ Bạn còn thiếu <b>{vnd(total - u['balance'])}</b>. Vui lòng nạp thêm."
        kb = [[Btn("💰 Nạp tiền", callback_data="topup")], [Btn("⬅️ Quay lại", callback_data=f"prod:{pid}")]]
    else:
        kb = [[Btn("✅ Xác nhận mua", callback_data=f"pay:{pid}:{qty}")],
              [Btn("❌ Huỷ", callback_data=f"prod:{pid}")]]
    await reply(update, text, InlineKeyboardMarkup(kb))


async def notify_admins(ctx, text: str):
    for admin in config.ADMIN_IDS:
        try:
            await ctx.bot.send_message(admin, text, parse_mode=ParseMode.HTML)
        except TelegramError:
            pass


async def do_buy(update: Update, ctx, pid: int, qty: int):
    uid = update.effective_user.id
    try:
        oid, items, balance = db.buy(uid, pid, qty)
    except OutOfStock:
        await reply(update, "⛔ Rất tiếc, sản phẩm vừa hết hàng.")
        return
    except InsufficientBalance as e:
        await reply(update, f"⚠️ Số dư không đủ, còn thiếu <b>{vnd(e.args[0])}</b>.",
                    InlineKeyboardMarkup([[Btn("💰 Nạp tiền", callback_data="topup")]]))
        return
    p = db.product(pid)
    u = update.effective_user
    who = f"<b>{esc(u.full_name)}</b> (@{esc(u.username or '-')}, <code>{u.id}</code>)"
    order = f"{qty} × {esc(p['name'])} = {vnd(p['price'] * qty)}"
    if items:
        await reply(update, f"✅ Thanh toán thành công! Số dư còn lại: <b>{vnd(balance)}</b>")
        await send_items(ctx.bot, update.effective_chat.id, oid, p["name"], items, "🎉 <b>GIAO HÀNG THÀNH CÔNG</b>")
        await notify_admins(ctx, f"🛍 Đơn mới #{oid}: {who} mua {order}. Kho còn {p['in_stock']}.")
    else:
        await reply(
            update,
            f"✅ Thanh toán thành công! Số dư còn lại: <b>{vnd(balance)}</b>\n\n"
            f"🧾 Đơn <b>#{oid}</b> đang được xử lý — admin sẽ giao hàng qua bot trong thời gian sớm nhất. "
            "Bạn sẽ nhận được tin nhắn khi có hàng.",
        )
        await notify_admins(
            ctx,
            f"🔔 <b>ĐƠN CẦN GIAO #{oid}</b>\n{who} mua {order}.\n\n"
            f"Giao hàng: gõ <code>/giao {oid}</code> rồi xuống dòng ghi thông tin tài khoản.\n"
            f"Huỷ + hoàn tiền: <code>/huydon {oid}</code>",
        )


async def send_items(bot, chat_id: int, order_id: int, product_name: str, items: list[str], header: str):
    body = "\n".join(items)
    text = f"{header}\n\n🧾 Mã đơn: <b>#{order_id}</b>\n🏷 {esc(product_name)}\n\n<code>{esc(body)}</code>"
    if len(text) <= 4000:
        await bot.send_message(chat_id, text, parse_mode=ParseMode.HTML)
    else:
        await bot.send_message(chat_id, f"{header}\n\n🧾 Mã đơn: <b>#{order_id}</b> — nội dung gửi kèm file bên dưới.",
                                parse_mode=ParseMode.HTML)
        await bot.send_document(chat_id, io.BytesIO(body.encode()), filename=f"don_{order_id}.txt")


async def show_account(update: Update, ctx):
    u = db.get_user(update.effective_user.id)
    n_orders = len(db.orders(u["id"], limit=10_000))
    await reply(
        update,
        "👤 <b>THÔNG TIN TÀI KHOẢN</b>\n\n"
        f"🆔 ID: <code>{u['id']}</code>\n"
        f"👤 Tên: {esc(u['full_name'])}\n"
        f"💰 Số dư: <b>{vnd(u['balance'])}</b>\n"
        f"📦 Số đơn đã mua: <b>{n_orders}</b>\n"
        f"📅 Tham gia: {u['created_at'][:10]}",
        InlineKeyboardMarkup([[Btn("💰 Nạp tiền", callback_data="topup"), Btn("📦 Đơn hàng", callback_data="orders")]]),
    )


async def show_topup(update: Update, ctx):
    kb, row = [], []
    for a in TOPUP_AMOUNTS:
        row.append(Btn(vnd(a), callback_data=f"tp:{a}"))
        if len(row) == 3:
            kb.append(row)
            row = []
    if row:
        kb.append(row)
    kb.append([Btn("✏️ Nhập số khác", callback_data="tp:custom")])
    await reply(update, "💰 <b>NẠP TIỀN VÀO TÀI KHOẢN</b>\n\nChọn số tiền muốn nạp:", InlineKeyboardMarkup(kb))


async def create_topup(update: Update, ctx, amount: int):
    if amount < config.MIN_TOPUP or amount > MAX_TOPUP:
        await reply(update, f"⚠️ Số tiền nạp phải từ {vnd(config.MIN_TOPUP)} đến {vnd(MAX_TOPUP)}.")
        return
    user = update.effective_user
    tid = db.create_topup(user.id, amount)
    code = f"{config.TOPUP_PREFIX}{tid}"
    caption = (
        "🏦 <b>THÔNG TIN CHUYỂN KHOẢN</b>\n\n"
        f"Ngân hàng: <b>{esc(config.BANK_ID)}</b>\n"
        f"Số tài khoản: <code>{esc(config.BANK_ACCOUNT)}</code>\n"
        f"Chủ tài khoản: <b>{esc(config.BANK_OWNER)}</b>\n"
        f"Số tiền: <code>{amount}</code> ({vnd(amount)})\n"
        f"Nội dung: <code>{code}</code>\n\n"
        "⚠️ Ghi <b>đúng nội dung</b> chuyển khoản. Tiền sẽ được cộng sau khi admin xác nhận."
    )
    kb = InlineKeyboardMarkup([[Btn("✅ Tôi đã chuyển khoản", callback_data=f"paid:{tid}")]])
    if config.BANK_ID and config.BANK_ACCOUNT:
        qr = (f"https://img.vietqr.io/image/{quote(config.BANK_ID)}-{quote(config.BANK_ACCOUNT)}-compact2.png"
              f"?amount={amount}&addInfo={quote(code)}&accountName={quote(config.BANK_OWNER)}")
        try:
            await update.effective_chat.send_photo(qr, caption=caption, parse_mode=ParseMode.HTML, reply_markup=kb)
            return
        except TelegramError as e:
            log.warning("Không gửi được ảnh QR: %s", e)
    await update.effective_chat.send_message(caption, parse_mode=ParseMode.HTML, reply_markup=kb)


async def user_paid(update: Update, ctx, tid: int):
    t = db.topup(tid)
    user = update.effective_user
    if not t or t["user_id"] != user.id:
        return
    if t["status"] != "pending":
        await update.callback_query.answer("Phiếu nạp này đã được xử lý.", show_alert=True)
        return
    if ctx.user_data.get(f"paid_{tid}"):
        await update.callback_query.answer("Đã báo admin, vui lòng chờ xác nhận.", show_alert=True)
        return
    ctx.user_data[f"paid_{tid}"] = True
    kb = InlineKeyboardMarkup([[Btn("✅ Duyệt", callback_data=f"ok:{tid}"), Btn("❌ Huỷ", callback_data=f"no:{tid}")]])
    for admin in config.ADMIN_IDS:
        try:
            await ctx.bot.send_message(
                admin,
                f"💳 <b>YÊU CẦU NẠP TIỀN</b>\n\nKhách: <b>{esc(user.full_name)}</b> "
                f"(@{esc(user.username or '-')}, <code>{user.id}</code>)\n"
                f"Số tiền: <b>{vnd(t['amount'])}</b>\nNội dung CK: <code>{config.TOPUP_PREFIX}{tid}</code>",
                parse_mode=ParseMode.HTML, reply_markup=kb,
            )
        except TelegramError:
            pass
    await update.callback_query.answer("Đã gửi yêu cầu, admin sẽ xác nhận sớm!", show_alert=True)


async def show_orders(update: Update, ctx):
    orders = db.orders(update.effective_user.id)
    if not orders:
        await reply(update, "📦 Bạn chưa có đơn hàng nào.", InlineKeyboardMarkup([[Btn("🛒 Mua ngay", callback_data="cats")]]))
        return
    icons = {"done": "✅", "pending": "⏳", "cancelled": "❌"}
    kb = [[Btn(f"{icons.get(o['status'], '')} #{o['id']} • {o['name'][:26]} ×{o['quantity']} • {vnd(o['total'])}",
               callback_data=f"ord:{o['id']}")] for o in orders]
    await reply(update, "📦 <b>10 ĐƠN HÀNG GẦN NHẤT</b>\n✅ đã giao · ⏳ đang xử lý · ❌ đã huỷ (hoàn tiền)\n"
                        "Bấm vào đơn để xem lại thông tin đã mua:", InlineKeyboardMarkup(kb))


async def show_order(update: Update, ctx, oid: int):
    o, items = db.order(oid)
    uid = update.effective_user.id
    if not o or (o["user_id"] != uid and not is_admin(uid)):
        return
    if o["status"] != "done":
        state = "⏳ đang được xử lý" if o["status"] == "pending" else "❌ đã huỷ và hoàn tiền"
        await update.effective_chat.send_message(
            f"🧾 Đơn <b>#{o['id']}</b> — {esc(o['name'])} ×{o['quantity']}\nTrạng thái: {state}", parse_mode=ParseMode.HTML)
        return
    await send_items(ctx.bot, update.effective_chat.id, o["id"], o["name"], items, f"📦 <b>ĐƠN HÀNG</b> — {o['created_at']}")


async def show_ref(update: Update, ctx):
    u = db.get_user(update.effective_user.id)
    link = f"https://t.me/{ctx.bot.username}?start=ref{u['id']}"
    text = (
        "🎁 <b>GIỚI THIỆU BẠN BÈ</b>\n\n"
        f"Link giới thiệu của bạn:\n<code>{link}</code>\n\n"
        f"👥 Đã giới thiệu: <b>{db.referrals(u['id'])}</b> người\n"
        f"💵 Hoa hồng đã nhận: <b>{vnd(u['ref_earned'])}</b>"
    )
    if config.REF_PERCENT:
        text += f"\n\nNhận ngay <b>{config.REF_PERCENT}%</b> mỗi lần bạn bè của bạn nạp tiền!"
    await reply(update, text)


async def show_support(update: Update, ctx):
    text = "📞 <b>HỖ TRỢ KHÁCH HÀNG</b>\n\n"
    kb = None
    if config.SUPPORT_USERNAME:
        text += f"Liên hệ: @{esc(config.SUPPORT_USERNAME)}\n"
        kb = InlineKeyboardMarkup([[Btn("💬 Nhắn hỗ trợ", url=f"https://t.me/{config.SUPPORT_USERNAME}")]])
    text += "Vui lòng gửi kèm <b>mã đơn hàng</b> hoặc <b>ID</b> của bạn để được hỗ trợ nhanh nhất."
    await reply(update, text, kb)


# ---------- điều phối ----------

async def on_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await touch_user(update)
    if banned(update):
        return
    text = update.message.text.strip()

    if ctx.user_data.pop("await_amount", False) and text not in (M_SHOP, M_ACCOUNT, M_TOPUP, M_ORDERS, M_REF, M_SUPPORT):
        amount = parse_amount(text)
        if amount is None:
            await update.message.reply_text("⚠️ Số tiền không hợp lệ. Bấm 💰 Nạp tiền để thử lại.")
        else:
            await create_topup(update, ctx, amount)
        return

    handlers = {
        M_SHOP: show_categories, M_ACCOUNT: show_account, M_TOPUP: show_topup,
        M_ORDERS: show_orders, M_REF: show_ref, M_SUPPORT: show_support,
    }
    if text in handlers:
        await handlers[text](update, ctx)
    else:
        await update.message.reply_text("Vui lòng chọn chức năng ở menu bên dưới 👇", reply_markup=MAIN_MENU)


async def on_button(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await touch_user(update)
    if banned(update):
        await q.answer()
        return
    action, *rest = q.data.split(":")
    args = [int(x) if x.lstrip("-").isdigit() else x for x in rest]

    # các nút trả lời bằng popup tự gọi q.answer()
    if action == "paid":
        return await user_paid(update, ctx, args[0])
    if action in ("ok", "no"):
        return await admin_resolve(update, ctx, args[0], action == "ok")

    await q.answer()
    if action == "cats":
        await show_categories(update, ctx)
    elif action == "cat":
        await show_category(update, ctx, args[0])
    elif action == "prod":
        await show_product(update, ctx, args[0])
    elif action == "buy":
        await confirm_buy(update, ctx, args[0], args[1])
    elif action == "pay":
        await do_buy(update, ctx, args[0], args[1])
    elif action == "topup":
        await show_topup(update, ctx)
    elif action == "tp":
        if args[0] == "custom":
            ctx.user_data["await_amount"] = True
            await reply(update, f"✏️ Nhập số tiền muốn nạp (tối thiểu {vnd(config.MIN_TOPUP)}), ví dụ: <code>150000</code> hoặc <code>150k</code>")
        else:
            await create_topup(update, ctx, args[0])
    elif action == "orders":
        await show_orders(update, ctx)
    elif action == "ord":
        await show_order(update, ctx, args[0])


# ================= ADMIN =================

ADMIN_HELP = """🛠 <b>LỆNH QUẢN TRỊ</b>

<b>Sản phẩm</b>
/dssp — danh sách danh mục & sản phẩm (kèm ID)
/themdm &lt;emoji&gt; &lt;tên&gt; — thêm danh mục
/themsp &lt;id_dm&gt; | &lt;tên&gt; | &lt;giá&gt; | &lt;mô tả&gt; — thêm sản phẩm
/giasp &lt;id_sp&gt; &lt;giá&gt; — đổi giá
/ansp &lt;id_sp&gt; · /hiensp &lt;id_sp&gt; — ẩn / hiện sản phẩm
/themkho &lt;id_sp&gt; rồi xuống dòng, mỗi dòng 1 hàng (vd: email|mật khẩu)
/capnhat — cập nhật giá từ Google Sheet ngay (tự động mỗi {sync} phút)

<b>Đơn đặt hàng (giao tay)</b>
/donchua — các đơn đang chờ giao
/giao &lt;mã đơn&gt; rồi xuống dòng ghi thông tin giao cho khách
/huydon &lt;mã đơn&gt; — huỷ đơn chờ giao và hoàn tiền

<b>Khách hàng</b>
/khach &lt;id&gt; — xem thông tin khách
/congtien &lt;id&gt; &lt;số tiền&gt; — cộng tiền (số âm để trừ)
/ban &lt;id&gt; · /unban &lt;id&gt; — chặn / bỏ chặn

<b>Khác</b>
/thongke — thống kê doanh thu
/thongbao &lt;nội dung&gt; — gửi thông báo tới mọi khách"""


def admin_only(func):
    async def wrapper(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        if not is_admin(update.effective_user.id):
            return
        try:
            await func(update, ctx)
        except (ValueError, IndexError):
            await update.message.reply_text("⚠️ Sai cú pháp. Gõ /admin để xem hướng dẫn.")
    return wrapper


@admin_only
async def cmd_admin(update: Update, ctx):
    await update.message.reply_text(ADMIN_HELP.replace("{sync}", str(config.SYNC_MINUTES)), parse_mode=ParseMode.HTML)


@admin_only
async def cmd_stats(update: Update, ctx):
    s = db.stats()
    await update.message.reply_text(
        "📊 <b>THỐNG KÊ</b>\n\n"
        f"👥 Khách hàng: <b>{s['users']}</b>\n"
        f"📦 Đơn hàng: <b>{s['orders']}</b>\n"
        f"💵 Doanh thu: <b>{vnd(s['revenue'])}</b> (hôm nay {vnd(s['today_revenue'])})\n"
        f"💰 Tổng nạp: <b>{vnd(s['topup'])}</b>\n"
        f"⏳ Phiếu nạp chờ duyệt: <b>{s['pending']}</b>",
        parse_mode=ParseMode.HTML,
    )


@admin_only
async def cmd_list(update: Update, ctx):
    lines = []
    cats = {c["id"]: c for c in db.all("SELECT * FROM categories ORDER BY id")}
    prods = db.products(include_hidden=True)
    for cid, c in cats.items():
        lines.append(f"\n<b>[{cid}] {c['emoji']} {esc(c['name'])}</b>")
        for p in prods:
            if p["category_id"] == cid:
                hidden = " 🚫ẩn" if not p["active"] else ""
                stock = f"kho {p['in_stock']}" if p["in_stock"] or not p["manual"] else "đặt hàng"
                if p["sold_out"]:
                    stock += " (nguồn hết)"
                lines.append(f"  • <code>{p['id']}</code> {esc(p['name'])} — {vnd(p['price'])} — {stock}{hidden}")
    text = "📋 <b>DANH SÁCH SẢN PHẨM</b>" + ("\n".join(lines) if lines else "\nChưa có gì.")
    for i in range(0, len(text), 4000):
        await update.message.reply_text(text[i:i + 4000], parse_mode=ParseMode.HTML)


@admin_only
async def cmd_add_cat(update: Update, ctx):
    emoji, name = ctx.args[0], " ".join(ctx.args[1:])
    if not name:
        raise ValueError
    cid = db.add_category(emoji, name)
    await update.message.reply_text(f"✅ Đã thêm danh mục [{cid}] {emoji} {name}")


@admin_only
async def cmd_add_product(update: Update, ctx):
    raw = update.message.text.split(maxsplit=1)[1]
    parts = [x.strip() for x in raw.split("|")]
    cid, name, price = int(parts[0]), parts[1], parse_amount(parts[2])
    desc = parts[3] if len(parts) > 3 else ""
    if not name or price is None or not db.one("SELECT 1 FROM categories WHERE id=?", cid):
        raise ValueError
    pid = db.add_product(cid, name, price, desc)
    await update.message.reply_text(f"✅ Đã thêm sản phẩm [{pid}] {name} — {vnd(price)}\nThêm hàng vào kho bằng /themkho {pid}")


@admin_only
async def cmd_price(update: Update, ctx):
    pid, price = int(ctx.args[0]), parse_amount(ctx.args[1])
    if price is None or not db.run("UPDATE products SET price=? WHERE id=?", price, pid).rowcount:
        raise ValueError
    await update.message.reply_text(f"✅ Sản phẩm {pid} giá mới: {vnd(price)}")


async def _set_active(update: Update, ctx, active: int):
    pid = int(ctx.args[0])
    if not db.run("UPDATE products SET active=?, admin_hidden=? WHERE id=?", active, 1 - active, pid).rowcount:
        raise ValueError
    await update.message.reply_text(f"✅ Đã {'hiện' if active else 'ẩn'} sản phẩm {pid}")


@admin_only
async def cmd_hide(update: Update, ctx):
    await _set_active(update, ctx, 0)


@admin_only
async def cmd_show(update: Update, ctx):
    await _set_active(update, ctx, 1)


@admin_only
async def cmd_add_stock(update: Update, ctx):
    first, *rest = update.message.text.split("\n")
    pid = int(first.split()[1])
    lines = [x.strip() for x in rest if x.strip()]
    if not db.product(pid):
        await update.message.reply_text("⚠️ Không tìm thấy sản phẩm.")
        return
    if not lines:
        await update.message.reply_text(f"Gửi theo mẫu:\n/themkho {pid}\nemail1@gmail.com|matkhau1\nemail2@gmail.com|matkhau2")
        return
    n = db.add_stock(pid, lines)
    await update.message.reply_text(f"✅ Đã thêm {n} hàng vào kho. Tồn kho hiện tại: {db.product(pid)['in_stock']}")


@admin_only
async def cmd_user(update: Update, ctx):
    u = db.get_user(int(ctx.args[0]))
    if not u:
        await update.message.reply_text("Không tìm thấy khách.")
        return
    orders = db.orders(u["id"], limit=10_000)
    await update.message.reply_text(
        f"👤 <b>{esc(u['full_name'])}</b> (@{esc(u['username'] or '-')})\n"
        f"ID: <code>{u['id']}</code>\nSố dư: <b>{vnd(u['balance'])}</b>\n"
        f"Đơn: {len(orders)} — đã chi {vnd(sum(o['total'] for o in orders))}\n"
        f"Người giới thiệu: {u['referrer_id'] or '-'}\nTham gia: {u['created_at']}\n"
        f"Trạng thái: {'🚫 bị chặn' if u['banned'] else '✅ bình thường'}",
        parse_mode=ParseMode.HTML,
    )


@admin_only
async def cmd_add_money(update: Update, ctx):
    uid, amount = int(ctx.args[0]), parse_amount(ctx.args[1])
    if amount is None:
        raise ValueError
    balance = db.add_balance(uid, amount)
    if balance is None:
        await update.message.reply_text("Không tìm thấy khách.")
        return
    await update.message.reply_text(f"✅ Đã {'cộng' if amount >= 0 else 'trừ'} {vnd(abs(amount))}. Số dư mới: {vnd(balance)}")
    try:
        verb = "được cộng" if amount >= 0 else "bị trừ"
        await ctx.bot.send_message(uid, f"💰 Tài khoản của bạn vừa {verb} <b>{vnd(abs(amount))}</b>.\nSố dư: <b>{vnd(balance)}</b>",
                                   parse_mode=ParseMode.HTML)
    except TelegramError:
        pass


async def _set_ban(update: Update, ctx, value: int):
    uid = int(ctx.args[0])
    if not db.run("UPDATE users SET banned=? WHERE id=?", value, uid).rowcount:
        await update.message.reply_text("Không tìm thấy khách.")
        return
    await update.message.reply_text(f"✅ Đã {'chặn' if value else 'bỏ chặn'} {uid}")


@admin_only
async def cmd_ban(update: Update, ctx):
    await _set_ban(update, ctx, 1)


@admin_only
async def cmd_unban(update: Update, ctx):
    await _set_ban(update, ctx, 0)


@admin_only
async def cmd_broadcast(update: Update, ctx):
    text = update.message.text.split(maxsplit=1)[1]
    ids = db.all_user_ids()
    await update.message.reply_text(f"📣 Đang gửi tới {len(ids)} khách...")
    ok = 0
    for uid in ids:
        try:
            await ctx.bot.send_message(uid, f"📣 <b>THÔNG BÁO</b>\n\n{esc(text)}", parse_mode=ParseMode.HTML)
            ok += 1
        except Forbidden:
            pass  # khách đã chặn bot
        except TelegramError as e:
            log.warning("Gửi thông báo tới %s lỗi: %s", uid, e)
    await update.message.reply_text(f"✅ Đã gửi thành công {ok}/{len(ids)}")


async def admin_resolve(update: Update, ctx, tid: int, approve: bool):
    q = update.callback_query
    admin = update.effective_user
    if not is_admin(admin.id):
        await q.answer()
        return
    result = db.resolve_topup(tid, admin.id, approve, config.REF_PERCENT)
    if not result:
        await q.answer("Phiếu này đã được xử lý trước đó.", show_alert=True)
        return
    t, balance, ref = result
    await q.answer("Đã duyệt" if approve else "Đã huỷ")
    status = f"✅ ĐÃ DUYỆT bởi {esc(admin.full_name)}" if approve else f"❌ ĐÃ HUỶ bởi {esc(admin.full_name)}"
    try:
        await q.edit_message_text(q.message.text_html + f"\n\n<b>{status}</b>", parse_mode=ParseMode.HTML)
    except TelegramError:
        pass
    try:
        if approve:
            await ctx.bot.send_message(
                t["user_id"],
                f"✅ Nạp tiền thành công <b>{vnd(t['amount'])}</b>!\n💰 Số dư hiện tại: <b>{vnd(balance)}</b>",
                parse_mode=ParseMode.HTML,
            )
        else:
            await ctx.bot.send_message(
                t["user_id"],
                f"❌ Yêu cầu nạp {vnd(t['amount'])} (mã {config.TOPUP_PREFIX}{tid}) không được xác nhận. "
                "Liên hệ hỗ trợ nếu bạn đã chuyển khoản.",
            )
        if ref:
            await ctx.bot.send_message(ref[0], f"🎁 Bạn nhận được <b>{vnd(ref[1])}</b> hoa hồng giới thiệu!",
                                       parse_mode=ParseMode.HTML)
    except TelegramError:
        pass


@admin_only
async def cmd_pending(update: Update, ctx):
    orders = db.pending_orders()
    if not orders:
        await update.message.reply_text("✅ Không có đơn nào đang chờ giao.")
        return
    lines = [f"⏳ <b>{len(orders)} ĐƠN CHỜ GIAO</b>"]
    for o in orders:
        lines.append(f"\n<b>#{o['id']}</b> {o['created_at'][5:16]} — {esc(o['full_name'])} (<code>{o['user_id']}</code>)\n"
                     f"   {o['quantity']} × {esc(o['name'])} = {vnd(o['total'])}")
    text = "\n".join(lines)
    for i in range(0, len(text), 4000):
        await update.message.reply_text(text[i:i + 4000], parse_mode=ParseMode.HTML)


@admin_only
async def cmd_deliver(update: Update, ctx):
    first, _, content = update.message.text.partition("\n")
    oid = int(first.split()[1])
    content = content.strip()
    if not content:
        await update.message.reply_text(f"Gửi theo mẫu:\n/giao {oid}\nemail@gmail.com|matkhau")
        return
    if not db.deliver_order(oid, content):
        await update.message.reply_text("⚠️ Không tìm thấy đơn đang chờ giao với mã này.")
        return
    o, items = db.order(oid)
    try:
        await send_items(ctx.bot, o["user_id"], oid, o["name"], items, "🎉 <b>GIAO HÀNG THÀNH CÔNG</b>")
        await update.message.reply_text(f"✅ Đã giao đơn #{oid} cho khách.")
    except TelegramError as e:
        await update.message.reply_text(f"⚠️ Đã lưu nội dung đơn #{oid} nhưng không gửi được cho khách ({e}). "
                                        "Khách vẫn xem lại được trong 📦 Đơn hàng.")


@admin_only
async def cmd_cancel_order(update: Update, ctx):
    oid = int(ctx.args[0])
    result = db.cancel_order(oid)
    if not result:
        await update.message.reply_text("⚠️ Không tìm thấy đơn đang chờ giao với mã này.")
        return
    o, balance = result
    await update.message.reply_text(f"✅ Đã huỷ đơn #{oid}, hoàn {vnd(o['total'])} cho khách.")
    try:
        await ctx.bot.send_message(
            o["user_id"],
            f"❌ Đơn <b>#{oid}</b> đã bị huỷ, bạn được hoàn <b>{vnd(o['total'])}</b>.\n💰 Số dư: <b>{vnd(balance)}</b>",
            parse_mode=ParseMode.HTML,
        )
    except TelegramError:
        pass


# ---------- đồng bộ Google Sheet ----------

async def sync_sheet(app: Application) -> dict:
    rows = await sheet_sync.fetch_rows(config.SHEET_URL, config.PRICE_MARKUP)
    if not rows:
        raise ValueError("Sheet không có dòng sản phẩm hợp lệ (cột A tên, cột B giá).")
    stats = db.sync_sheet_products(rows)
    stats["total"] = len(rows)
    log.info("Đồng bộ sheet: %s", stats)
    return stats


async def sync_loop(app: Application):
    failing = False
    while True:
        try:
            await sync_sheet(app)
            failing = False
        except asyncio.CancelledError:
            raise
        except Exception as e:  # mạng lỗi, sheet bị khoá... -> giữ nguyên giá cũ, thử lại lần sau
            log.warning("Đồng bộ sheet lỗi: %s", e)
            if not failing:  # chỉ báo admin lần đầu, tránh spam mỗi giờ
                failing = True
                for admin in config.ADMIN_IDS:
                    try:
                        await app.bot.send_message(admin, f"⚠️ Không cập nhật được giá từ Google Sheet: {e}")
                    except TelegramError:
                        pass
        await asyncio.sleep(config.SYNC_MINUTES * 60)


@admin_only
async def cmd_sync(update: Update, ctx):
    if not config.SHEET_URL:
        await update.message.reply_text("Chưa cấu hình SHEET_URL trong file .env.")
        return
    try:
        s = await sync_sheet(ctx.application)
    except Exception as e:
        await update.message.reply_text(f"⚠️ Cập nhật lỗi: {e}")
        return
    await update.message.reply_text(
        f"✅ Đã cập nhật {s['total']} sản phẩm từ sheet (giá +{vnd(config.PRICE_MARKUP)}).\n"
        f"Mới: {s['added']} · Thay đổi: {s['updated']} · Ngừng bán (đã xoá khỏi sheet): {s['removed']}"
    )


# ================= KHỞI ĐỘNG =================

async def post_init(app: Application):
    await app.bot.set_my_commands([
        BotCommand("start", "Mở menu chính"),
        BotCommand("sanpham", "Xem sản phẩm"),
        BotCommand("naptien", "Nạp tiền"),
        BotCommand("taikhoan", "Thông tin tài khoản"),
        BotCommand("donhang", "Đơn hàng đã mua"),
        BotCommand("hotro", "Liên hệ hỗ trợ"),
    ])
    log.info("Bot @%s đã sẵn sàng", app.bot.username)
    if config.SHEET_URL:
        app.bot_data["sync_task"] = asyncio.create_task(sync_loop(app))


async def post_shutdown(app: Application):
    task = app.bot_data.get("sync_task")
    if task:
        task.cancel()


def user_cmd(func):
    async def wrapper(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        await touch_user(update)
        if not banned(update):
            await func(update, ctx)
    return wrapper


async def on_error(update: object, ctx: ContextTypes.DEFAULT_TYPE):
    log.error("Lỗi khi xử lý update", exc_info=ctx.error)


def main():
    if not config.BOT_TOKEN:
        raise SystemExit("Thiếu BOT_TOKEN. Sao chép .env.example thành .env và điền token từ @BotFather.")
    if config.SEED_DEMO and not config.SHEET_URL:
        db.seed_demo()

    app = Application.builder().token(config.BOT_TOKEN).post_init(post_init).post_shutdown(post_shutdown).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("sanpham", user_cmd(show_categories)))
    app.add_handler(CommandHandler("naptien", user_cmd(show_topup)))
    app.add_handler(CommandHandler("taikhoan", user_cmd(show_account)))
    app.add_handler(CommandHandler("donhang", user_cmd(show_orders)))
    app.add_handler(CommandHandler("hotro", user_cmd(show_support)))

    for name, fn in {
        "admin": cmd_admin, "thongke": cmd_stats, "dssp": cmd_list, "themdm": cmd_add_cat,
        "themsp": cmd_add_product, "giasp": cmd_price, "ansp": cmd_hide, "hiensp": cmd_show,
        "themkho": cmd_add_stock, "khach": cmd_user, "congtien": cmd_add_money,
        "ban": cmd_ban, "unban": cmd_unban, "thongbao": cmd_broadcast,
        "capnhat": cmd_sync, "donchua": cmd_pending, "giao": cmd_deliver, "huydon": cmd_cancel_order,
    }.items():
        app.add_handler(CommandHandler(name, fn))

    app.add_handler(CallbackQueryHandler(on_button))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND & filters.ChatType.PRIVATE, on_text))
    app.add_error_handler(on_error)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
