/*
 * Thẻ xem trước link chia sẻ (Open Graph) cho Zalo / Messenger / Facebook / Telegram (A3): trang chính mở bằng link
 * ?replay= (ván đã lưu), ?room= (ván đang đấu / lời mời vào phòng), ?t= (giải đấu), ?o= (giải đấu Offline), ?club= (CLB),
 * ?u= (hồ sơ kỳ thủ), ?bc= (tường thuật giải – C3, trang broadcast.html), ?cls= (bài Lớp học – C2). Máy chủ chèn <meta property="og:…"> vào <head> (web.js → serveIndex) để ứng dụng chat hiện tiêu đề,
 * mô tả, ảnh ngay khi dán link – người nhận không cần đăng nhập vẫn thấy.
 * File này chỉ dựng chữ + HTML (không đọc dữ liệu): dữ liệu lấy từ hub/og.js (đã kiểm quyền xem như khách chưa đăng nhập).
 * Mọi giá trị đều được thoát HTML; chữ người dùng tự đặt (tên giải, tên CLB…) bị cắt ngắn, bỏ xuống dòng.
 * Ngôn ngữ: ?lang= trong link, không có thì theo Accept-Language của trình duyệt / ứng dụng đọc link, mặc định tiếng Việt.
 * Danh sách ngôn ngữ: caro/langs.js (qua langs.js); chữ của ngôn ngữ thư mục (ja, ko, cs, zh-Hant): server/src/i18n/<mã>.js, mục og –
 * khoá thiếu lấy tiếng Anh.
 */
'use strict';

const Langs = require('./langs.js');

const LANGS = Langs.CODES;
const SITE = 'Caro x Gomoku';

// {x} … thay bằng dữ liệu. Giữ ngắn: ứng dụng chat cắt mô tả ở ~2 dòng.
const S = {
  vi: {
    won: '{name} thắng', draw: 'Hoà', unfinished: 'Ván chưa xong', moves: '{n} nước',
    replay_d: '{result} · {n} nước · Xem lại từng nước, không cần đăng nhập',
    live_t: 'Đang đấu: {x} vs {o}', live_d: '{n} nước · Bấm để xem trực tiếp, không cần đăng nhập',
    room_t: 'Lời mời chơi Caro · phòng {code}', room_d: 'Bấm để vào phòng chơi ngay, không cần đăng ký',
    tour_d: 'Giải đấu Caro · {n} kỳ thủ · Xem lịch, kết quả và đăng ký',
    ot_d: 'Giải đấu · {n} đội / kỳ thủ · Xem nhánh đấu và kết quả',
    club_t: 'CLB {name}', club_d: 'Câu lạc bộ Caro · {n} thành viên',
    user_d: 'Elo {r} · {g} ván · Xem hồ sơ kỳ thủ',
    bc_t: 'Tường thuật: {name}', bc_d: '{n} ván đang đấu · Xem trực tiếp, bảng xếp hạng, kết quả',
    cls_d: 'Bài học Caro · {n} chương · Thế cờ, biến, lời bình',
    home_d: 'Chơi Caro / Gomoku miễn phí với bạn bè hoặc máy – ngay trên trình duyệt',
  },
  en: {
    won: '{name} won', draw: 'Draw', unfinished: 'Unfinished game', moves: '{n} moves',
    replay_d: '{result} · {n} moves · Replay move by move, no sign-in needed',
    live_t: 'Live: {x} vs {o}', live_d: '{n} moves · Tap to watch live, no sign-in needed',
    room_t: 'Gomoku invite · room {code}', room_d: 'Tap to join the room and play now, no sign-up needed',
    tour_d: 'Gomoku tournament · {n} players · Schedule, results and registration',
    ot_d: 'Tournament · {n} teams / players · Bracket and results',
    club_t: '{name} club', club_d: 'Gomoku club · {n} members',
    user_d: 'Rating {r} · {g} games · View player profile',
    bc_t: 'Live: {name}', bc_d: '{n} games in progress · Watch live, standings and results',
    cls_d: 'Gomoku study · chapters: {n} · Positions, variations, comments',
    home_d: 'Play Gomoku free with friends or the computer – right in your browser',
  },
  ru: {
    won: 'Победил(а) {name}', draw: 'Ничья', unfinished: 'Партия не окончена', moves: 'ходов: {n}',
    replay_d: '{result} · ходов: {n} · Разбор по ходам без входа в аккаунт',
    live_t: 'Идёт партия: {x} – {o}', live_d: 'Ходов: {n} · Смотреть в прямом эфире без входа',
    room_t: 'Приглашение в гомоку · комната {code}', room_d: 'Нажмите, чтобы войти в комнату и играть без регистрации',
    tour_d: 'Турнир по гомоку · игроков: {n} · Расписание, результаты, регистрация',
    ot_d: 'Турнир · команд / игроков: {n} · Сетка и результаты',
    club_t: 'Клуб {name}', club_d: 'Клуб гомоку · участников: {n}',
    user_d: 'Рейтинг {r} · партий: {g} · Профиль игрока',
    bc_t: 'Трансляция: {name}', bc_d: 'Идущих партий: {n} · Смотрите вживую, таблица и результаты',
    cls_d: 'Урок гомоку · глав: {n} · Позиции, варианты, комментарии',
    home_d: 'Играйте в гомоку бесплатно с друзьями или компьютером прямо в браузере',
  },
  zh: {
    won: '{name} 获胜', draw: '和棋', unfinished: '对局未结束', moves: '{n} 手',
    replay_d: '{result} · {n} 手 · 逐手回放，无需登录',
    live_t: '正在对局：{x} vs {o}', live_d: '{n} 手 · 点击观看直播，无需登录',
    room_t: '五子棋邀请 · 房间 {code}', room_d: '点击进入房间立即对弈，无需注册',
    tour_d: '五子棋比赛 · {n} 名棋手 · 赛程、结果与报名',
    ot_d: '比赛 · {n} 支队伍 / 棋手 · 对阵图与结果',
    club_t: '{name} 俱乐部', club_d: '五子棋俱乐部 · {n} 名成员',
    user_d: '等级分 {r} · {g} 局 · 查看棋手资料',
    bc_t: '直播：{name}', bc_d: '{n} 局进行中 · 实时观看、排名与结果',
    cls_d: '五子棋课程 · {n} 章 · 局面、变化与评注',
    home_d: '在浏览器中免费与好友或电脑下五子棋',
  },
};
Object.assign(S, Langs.withDirLangs('og', {})); // ja, ko, cs, zh-Hant: server/src/i18n/<mã>.js

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Chữ một dòng, tối đa max ký tự (cắt thì thêm "…"). */
function clip(s, max) {
  const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  const a = [...t];
  return a.length > max ? a.slice(0, max - 1).join('') + '…' : t;
}
function fill(str, vars) {
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
}

/** Ngôn ngữ của thẻ: ?lang= (zh-TW, ja-JP… cũng nhận – langs.js fromTag) → Accept-Language (theo trọng số q, q=0 là không
 * nhận) → vi. */
function pickLang(query, acceptLang) {
  const q = query && query.get && Langs.fromTag(String(query.get('lang') || '').slice(0, 20));
  if (q) return q;
  return Langs.fromAccept(acceptLang) || 'vi';
}

/**
 * Tiêu đề + mô tả theo loại link. info (hub/og.js): { kind, …dữ liệu đã lọc } hoặc null.
 * → { title, desc } (chưa thoát HTML).
 */
function texts(info, lang) {
  const l = LANGS.includes(lang) ? lang : 'vi';
  const L = S[l] || {}, F = S[Langs.fallback(l)] || S.vi; // khoá thiếu (ngôn ngữ thư mục chưa dịch xong): tiếng Anh
  const t = (k, v = {}) => fill(L[k] ?? F[k], v);
  const name = (s) => clip(s || '?', 40);
  switch (info && info.kind) {
    case 'replay': {
      const result = info.winner === 1 ? t('won', { name: name(info.x) }) : info.winner === 2 ? t('won', { name: name(info.o) })
        : info.winner === 3 ? t('draw') : t('unfinished');
      return { title: `${name(info.x)} ✕ vs ${name(info.o)} ◯`, desc: t('replay_d', { result, n: info.n | 0 }) };
    }
    case 'live': return { title: t('live_t', { x: name(info.x), o: name(info.o) }), desc: t('live_d', { n: info.n | 0 }) };
    case 'room': return { title: t('room_t', { code: clip(info.code, 6) }), desc: t('room_d') };
    case 'tour': return { title: clip(info.name, 90), desc: t('tour_d', { n: info.n | 0 }) };
    case 'cls': return { title: clip(info.name, 90), desc: t('cls_d', { n: info.n | 0 }) }; // bài Lớp học (C2)
    case 'bc': return { title: t('bc_t', { name: clip(info.name, 80) }), desc: t('bc_d', { n: info.n | 0 }) }; // tường thuật giải (C3)
    case 'otour': return { title: clip(info.name, 90), desc: t('ot_d', { n: info.n | 0 }) };
    case 'club': return { title: t('club_t', { name: clip(info.name, 60) }), desc: info.intro ? clip(info.intro, 200) : t('club_d', { n: info.n | 0 }) };
    case 'user': return { title: `${name(info.name)} (@${clip(info.username, 20)})`, desc: t('user_d', { r: info.rating | 0, g: info.games | 0 }) };
    default: return { title: SITE, desc: t('home_d') };
  }
}

/**
 * Trang chính kèm thẻ xem trước. info: dữ liệu từ hub/og.js (null → trả nguyên trang); base: gốc trang (https://…);
 * url: đường dẫn trang (/?t=…); image: đường dẫn ảnh (/api/…png). Mọi giá trị đều đã thoát HTML.
 * Thêm og:* + twitter:card ở đầu <head>, thay <title> và <meta name="description"> sẵn có bằng tên / mô tả của nội dung.
 */
function inject(html, { info, lang, base, url, image }) {
  if (!info) return html;
  const { title, desc } = texts(info, lang);
  const loc = (Langs.BY[lang] || Langs.BY.vi).og;
  const full = title === SITE ? SITE : title + ' – ' + SITE;
  const tags = [
    ['og:type', 'website'], ['og:site_name', SITE], ['og:title', full], ['og:description', desc], ['og:locale', loc],
    ['og:image', base + image], ['og:image:width', '1200'], ['og:image:height', '630'], ['og:url', base + url],
  ].map(([k, v]) => `<meta property="${k}" content="${escHtml(v)}">`).concat('<meta name="twitter:card" content="summary_large_image">').join('\n  ');
  return html.replace('<head>', () => `<head>\n  ${tags}`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escHtml(full)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${escHtml(desc)}">`);
}

module.exports = { inject, texts, pickLang, clip, escHtml, LANGS, STRINGS: S };
