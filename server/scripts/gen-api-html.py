# Sinh caro/api.html (tài liệu API công khai v1, 4 ngôn ngữ – C4) từ một bảng để 4 bản luôn khớp nhau.
# Dùng: python3 server/scripts/gen-api-html.py caro/api.html   (thêm đường dẫn mới: sửa PATHS + eps của cả 4 ngôn ngữ, và api-v1-openapi.js)
# Ngôn ngữ thư mục (ja, ko, cs, zh-Hant – caro/langs.js): mỗi ngôn ngữ một file server/scripts/api-html/<mã>.json, cùng khoá
# như một mục của L dưới đây + "host" (chữ thay cho tên miền trong ví dụ) + "label" (tên trên thanh ngôn ngữ). Chưa có file
# thì trang để một dòng chỗ trống "@lang-slot <mã>" (các nhánh dịch song song mỗi nhánh thay đúng dòng của mình).
import html, json, os, sys
L = {
 'vi': dict(title='Caro x Gomoku – API công khai', back='Về game', h1='API công khai (v1)', meta='Dữ liệu chỉ đọc dạng JSON cho website, bot Discord / Telegram, công cụ thống kê.',
   chips=['Chỉ đọc', 'Không cần khoá', 'CORS mở', 'OpenAPI 3.1'],
   rules_h='Quy tắc chung', rules=['Địa chỉ gốc: <code>/api/v1</code> (cùng tên miền với trang này).', 'Mỗi IP tối đa <strong>120 lần / phút</strong>; quá thì trả <code>429</code> kèm <code>Retry-After</code> (giây).',
     'Mọi câu trả lời có <code>ETag</code>: gửi lại trong <code>If-None-Match</code> để nhận <code>304</code> (không phải tải lại).', 'Lỗi luôn có dạng <code>{"error": "not_found", "message": "Not found"}</code>.',
     'Không có dữ liệu riêng: email, bạn bè, người đã chặn, thiết bị. Ván gần đây chỉ trả khi người chơi để Lịch sử đấu ở chế độ Công khai; giải riêng tư / CLB / nháp không xem được.'],
   nota_h='Ký hiệu ô', nota='Bàn cờ không giới hạn. Tên ô theo khung 15×15 quanh tâm: cột a…o từ trái sang, hàng 1…15 từ dưới lên, ô giữa là <code>h8</code>; ra ngoài khung vẫn đếm tiếp (cột p, q…, hàng 16…, hàng 0, -1…). Trong JSON, nước đi là <code>[x, y]</code>: x tăng sang phải, y tăng xuống dưới, <code>[0, 0]</code> = h8.',
   ep_h='Các đường dẫn', col=('Đường dẫn', 'Trả về'), ex_h='Ví dụ', spec='Mô tả đầy đủ (OpenAPI 3.1):',
   eps=['Hồ sơ công khai: điểm từng loại thời gian, số ván thắng / thua / hoà, thành tích giải', 'Biểu đồ điểm: <code>[thời điểm ms, điểm]</code> theo loại', 'Ván gần đây (<code>?max=1…50</code>); lịch sử đấu không công khai → <code>"hidden": true</code>', 'Một ván theo mã chia sẻ (như link xem lại)', 'Ván dạng chữ kiểu PGN theo ký hiệu Caro', 'Thông tin giải công khai', 'Bảng xếp hạng của giải', '50 người đứng đầu (<code>?pool=bullet|blitz|rapid|classical</code>)', 'Tường thuật giải: ván đang đấu, bảng xếp hạng, kết quả gần đây (<code>key</code> = mã giải, giải Offline: <code>o.</code> + mã)', 'Bài đố của ngày (đổi lúc 0:00 giờ Việt Nam; <code>?date=YYYY-MM-DD</code>)', 'Tài liệu OpenAPI 3.1']),
 'en': dict(title='Caro x Gomoku – Public API', back='Back to game', h1='Public API (v1)', meta='Read-only JSON data for websites, Discord / Telegram bots and stats tools.',
   chips=['Read-only', 'No key needed', 'Open CORS', 'OpenAPI 3.1'],
   rules_h='General rules', rules=['Base URL: <code>/api/v1</code> (same domain as this page).', 'Each IP may make <strong>120 requests / minute</strong>; beyond that you get <code>429</code> with <code>Retry-After</code> (seconds).',
     'Every response carries an <code>ETag</code>: send it back in <code>If-None-Match</code> to get <code>304</code> (no re-download).', 'Errors always look like <code>{"error": "not_found", "message": "Not found"}</code>.',
     'No private data: email, friends, blocked players, devices. Recent games are returned only when the player’s game history is Public; private / club / draft tournaments are not available.'],
   nota_h='Cell notation', nota='The board is unlimited. Cells are named on a 15×15 frame around the center: columns a…o from left to right, rows 1…15 from bottom to top, the center is <code>h8</code>; beyond the frame the counting continues (columns p, q…, rows 16…, rows 0, -1…). In JSON a move is <code>[x, y]</code>: x grows to the right, y grows downward, <code>[0, 0]</code> = h8.',
   ep_h='Endpoints', col=('Path', 'Returns'), ex_h='Examples', spec='Full description (OpenAPI 3.1):',
   eps=['Public profile: rating per time control, wins / losses / draws, tournament results', 'Rating history: <code>[time ms, rating]</code> per pool', 'Recent games (<code>?max=1…50</code>); non-public game history → <code>"hidden": true</code>', 'One game by share id (like a replay link)', 'Game as PGN-like text in Caro notation', 'Public tournament info', 'Tournament standings', 'Top 50 players (<code>?pool=bullet|blitz|rapid|classical</code>)', 'Tournament broadcast: games in progress, standings, recent results (<code>key</code> = tournament id; offline: <code>o.</code> + id)', 'Puzzle of the day (changes at 0:00 Vietnam time; <code>?date=YYYY-MM-DD</code>)', 'OpenAPI 3.1 document']),
 'ru': dict(title='Caro x Gomoku – открытый API', back='К игре', h1='Открытый API (v1)', meta='Данные только для чтения в формате JSON для сайтов, ботов Discord / Telegram и статистики.',
   chips=['Только чтение', 'Без ключа', 'Открытый CORS', 'OpenAPI 3.1'],
   rules_h='Общие правила', rules=['Базовый адрес: <code>/api/v1</code> (тот же домен, что и у этой страницы).', 'С одного IP — не больше <strong>120 запросов в минуту</strong>; сверх этого ответ <code>429</code> с заголовком <code>Retry-After</code> (секунды).',
     'Каждый ответ содержит <code>ETag</code>: отправьте его в <code>If-None-Match</code>, чтобы получить <code>304</code> (без повторной загрузки).', 'Ошибки всегда имеют вид <code>{"error": "not_found", "message": "Not found"}</code>.',
     'Никаких личных данных: email, друзья, заблокированные, устройства. Последние партии выдаются, только если история партий игрока открыта для всех; закрытые, клубные и черновые турниры недоступны.'],
   nota_h='Обозначение клеток', nota='Доска не ограничена. Клетки называются по рамке 15×15 вокруг центра: столбцы a…o слева направо, ряды 1…15 снизу вверх, центр — <code>h8</code>; за рамкой счёт продолжается (столбцы p, q…, ряды 16…, ряды 0, -1…). В JSON ход — это <code>[x, y]</code>: x растёт вправо, y растёт вниз, <code>[0, 0]</code> = h8.',
   ep_h='Адреса', col=('Адрес', 'Что возвращает'), ex_h='Примеры', spec='Полное описание (OpenAPI 3.1):',
   eps=['Открытый профиль: рейтинг по контролю времени, победы / поражения / ничьи, турниры', 'История рейтинга: <code>[время в мс, рейтинг]</code> по видам', 'Последние партии (<code>?max=1…50</code>); если история закрыта → <code>"hidden": true</code>', 'Одна партия по коду ссылки (как ссылка на просмотр)', 'Партия текстом в стиле PGN в обозначениях Caro', 'Сведения об открытом турнире', 'Турнирная таблица', 'Топ-50 игроков (<code>?pool=bullet|blitz|rapid|classical</code>)', 'Трансляция турнира: идущие партии, таблица, последние результаты (<code>key</code> = код турнира; офлайн: <code>o.</code> + код)', 'Задача дня (меняется в 0:00 по времени Вьетнама; <code>?date=YYYY-MM-DD</code>)', 'Документ OpenAPI 3.1']),
 'zh': dict(title='Caro x Gomoku – 公开 API', back='返回游戏', h1='公开 API（v1）', meta='只读 JSON 数据，可用于网站、Discord / Telegram 机器人和统计工具。',
   chips=['只读', '无需密钥', '开放 CORS', 'OpenAPI 3.1'],
   rules_h='通用规则', rules=['基础地址：<code>/api/v1</code>（与本页同一域名）。', '每个 IP 每分钟最多 <strong>120 次请求</strong>；超出时返回 <code>429</code> 并附带 <code>Retry-After</code>（秒）。',
     '每个响应都带有 <code>ETag</code>：在 <code>If-None-Match</code> 中发回即可得到 <code>304</code>（无需重新下载）。', '错误格式始终为 <code>{"error": "not_found", "message": "Not found"}</code>。',
     '不含私人数据：邮箱、好友、已屏蔽的玩家、设备。仅当玩家的对局记录设为公开时才返回最近对局；私密、俱乐部和草稿赛事不可查看。'],
   nota_h='格子记法', nota='棋盘无边界。格子按中心周围的 15×15 框命名：列 a…o 从左到右，行 1…15 从下到上，中心为 <code>h8</code>；超出此框继续计数（列 p、q…，行 16…，行 0、-1…）。JSON 中一步棋为 <code>[x, y]</code>：x 向右增大，y 向下增大，<code>[0, 0]</code> = h8。',
   ep_h='接口', col=('路径', '返回'), ex_h='示例', spec='完整说明（OpenAPI 3.1）：',
   eps=['公开资料：各时限等级分、胜 / 负 / 和、赛事成绩', '等级分历史：按类别的 <code>[时间 ms, 等级分]</code>', '最近对局（<code>?max=1…50</code>）；对局记录未公开 → <code>"hidden": true</code>', '按分享码获取一局（同回放链接）', '以 Caro 记法输出的类 PGN 文本', '公开赛事信息', '赛事排名', '前 50 名玩家（<code>?pool=bullet|blitz|rapid|classical</code>）', '赛事直播：进行中的对局、排名、最近结果（<code>key</code> = 赛事代码；线下赛事：<code>o.</code> + 代码）', '每日谜题（越南时间 0:00 更换；<code>?date=YYYY-MM-DD</code>）', 'OpenAPI 3.1 文档']),
}
PATHS = ['/player/{username}', '/player/{username}/rating-history', '/player/{username}/games', '/game/{id}', '/game/{id}.txt', '/tournament/{id}', '/tournament/{id}/standings', '/leaderboard', '/broadcast/{key}', '/puzzle/daily', '/openapi.json']
EX = '''curl https://&lt;HOST&gt;/api/v1/player/an_nguyen
curl https://&lt;HOST&gt;/api/v1/game/AbCdEf12.txt
curl -H 'If-None-Match: W/"…"' 'https://&lt;HOST&gt;/api/v1/leaderboard?pool=blitz\''''
HOST = {'vi': 'tên-miền', 'en': 'your-domain', 'ru': 'домен', 'zh': '域名'}
DIR_LANGS = [('ja', 'ja'), ('ko', 'ko'), ('cs', 'cs'), ('zh-Hant', 'zh-Hant')]  # (mã, <html lang>) – thứ tự chỗ trống trên trang
EXTRA = {}
for code, _ in DIR_LANGS:
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'api-html', code + '.json')
    if os.path.exists(f):
        EXTRA[code] = json.load(open(f, encoding='utf8'))
        HOST[code] = EXTRA[code]['host']
out = ['''<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Caro x Gomoku – API công khai</title>
  <meta name="theme-color" content="#f6f3ec" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#16191e" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="style-extras.css">
  <script src="theme.js"></script>
  <link rel="stylesheet" href="policy-page.css">
  <link rel="stylesheet" href="api-page.css">
</head>
<body>
<!-- Tài liệu API công khai v1 (C4) – 4 ngôn ngữ, đổi ngôn ngữ bằng privacy.js. Sinh từ một bảng (giữ 4 bản khớp nhau);
     máy chủ: server/src/api-v1-http.js, server/src/hub/api-v1.js, server/src/api-v1-openapi.js -->
<header class="top">
  <div class="wrap">
    <a class="brand" href="./"><img src="icon.svg" alt=""><span id="brand-label">Caro x Gomoku</span></a>
    <nav class="langs" aria-label="Language"><a href="#vi" lang="vi">VI</a><a href="#en" lang="en">EN</a><a href="#ru" lang="ru">RU</a><a href="#zh" lang="zh-CN">中文</a></nav>
    <a class="back" href="./"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6"/></svg><span id="back-label">Về game</span></a>
  </div>
</header>

<main class="wrap">''']
def section(l, d, lang, label):
    rows = '\n'.join(f'          <tr><td><code>GET /api/v1{html.escape(p)}</code></td><td>{e}</td></tr>' for p, e in zip(PATHS, d['eps']))
    extra = f' data-label="{label}"' if label else ''
    out.append(f'''  <section id="{l}" lang="{lang}"{extra} data-title="{d['title']}" data-back="{d['back']}" data-brand="Caro x Gomoku">
    <header class="hero">
      <h1>{d['h1']}</h1>
      <p class="meta">{d['meta']}</p>
      <ul class="chips">{''.join(f'<li>{c}</li>' for c in d['chips'])}</ul>
    </header>
    <div class="card">
      <h2>{d['rules_h']}</h2>
      <ul class="list">{''.join(f'<li><span>{r}</span></li>' for r in d['rules'])}</ul>
    </div>
    <div class="card">
      <h2>{d['nota_h']}</h2>
      <p>{d['nota']}</p>
    </div>
    <div class="card">
      <h2>{d['ep_h']}</h2>
      <div class="api-scroll">
        <table class="api-table">
          <thead><tr><th scope="col">{d['col'][0]}</th><th scope="col">{d['col'][1]}</th></tr></thead>
          <tbody>
{rows}
          </tbody>
        </table>
      </div>
      <p>{d['spec']} <a href="/api/v1/openapi.json"><code>/api/v1/openapi.json</code></a></p>
    </div>
    <div class="card">
      <h2>{d['ex_h']}</h2>
      <pre class="api-pre">{EX.replace('HOST', HOST[l])}</pre>
    </div>
  </section>
''')
for l, d in L.items():
    section(l, d, 'zh-CN' if l == 'zh' else l, None)
for code, lang in DIR_LANGS:
    if code in EXTRA:
        section(code, EXTRA[code], lang, EXTRA[code]['label'])
    else:
        out.append(f'  <!-- @lang-slot {code}: server/scripts/api-html/{code}.json rồi chạy lại server/scripts/gen-api-html.py -->\n')
out.append('''  <footer class="foot"><span id="foot-brand">Caro x Gomoku</span><a href="/api/v1/openapi.json">OpenAPI 3.1</a></footer>
</main>
<script src="langs.js"></script>
<script src="privacy.js"></script>
</body>
</html>
''')
open(sys.argv[1], 'w', encoding='utf8').write('\n'.join(out))
