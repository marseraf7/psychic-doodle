/*
 * Widget bàn cờ của connector MCP (chạy trong khung cô lập của Claude, nối với Claude qua lớp App của MCP Apps SDK).
 * Ba chế độ theo kết quả tool:
 *  - play     chơi với máy: chạm ô → gọi lại play_caro (qua Claude) → vẽ nước của máy; đi lại, ván mới, đổi luật / bên / mức.
 *  - suggest  hiện nước gợi ý + lý do; "Chơi tiếp từ đây" chuyển sang chế độ play.
 *  - puzzle   bài đố: chạm ô → caro_puzzle kiểm; xem lời giải; bài tiếp theo.
 * Không lưu gì: mọi trạng thái là danh sách nước. Chữ: widget-i18n.js (theo hostContext.locale).
 */
const { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } = globalThis.McpExtApps;
const DICT = globalThis.CARO_MCP_I18N;
const NS = 'http://www.w3.org/2000/svg';
const LIM = 30; // toạ độ hợp lệ -30..30 (khớp game.js)
const MIN_VIEW = 13; // khung nhìn tối thiểu 13 × 13 ô

let lang = 'en';
const t = (k, vars) => String((DICT[lang] || DICT.en)[k] ?? DICT.en[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => (vars && vars[v] != null ? vars[v] : ''));
const fmt = (m) => `[${m[0]},${m[1]}]`;

const S = {
  mode: 'play', rule: 'vn', moves: [], winner: null, line: null, draw: false, toMove: 'X', you: 'X', difficulty: 'normal',
  hint: null, reasonCode: null, puzzle: null, verdict: null, solution: null, answer: null, busy: false, error: null,
  site: '', view: null, fresh: -1,
};

const app = new App({ name: 'Caro x Gomoku', version: '1.0.0' }, {}, { autoResize: true });
const root = document.getElementById('app');

// ---------------------------------------------------------------- Giao diện của Claude: giao diện sáng / tối, biến màu, chữ
function applyContext(ctx) {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles && ctx.styles.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles && ctx.styles.css && ctx.styles.css.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.locale) {
    // zh-TW → zh-Hant, ja-JP → ja… (caro/langs.js fromTag – widget.js chèn vào); ngôn ngữ chưa có chữ thì tiếng Anh
    const l = globalThis.CARO_MCP_LANG ? globalThis.CARO_MCP_LANG(ctx.locale, Object.keys(DICT)) : String(ctx.locale).slice(0, 2).toLowerCase();
    lang = DICT[l] ? l : 'en';
    document.documentElement.lang = lang;
  }
  if (ctx.safeAreaInsets) {
    const i = ctx.safeAreaInsets;
    root.style.padding = `${12 + i.top}px ${12 + i.right}px ${12 + i.bottom}px ${12 + i.left}px`;
  }
}

// ---------------------------------------------------------------- Nhận kết quả tool
function take(sc) {
  if (!sc || !sc.mode) return;
  const prevLen = S.mode === sc.mode && S.puzzle && sc.puzzle && S.puzzle.id === sc.puzzle.id ? -1 : S.moves.length;
  Object.assign(S, {
    mode: sc.mode, rule: sc.rule || 'vn', moves: sc.moves || [], winner: sc.winner, line: sc.line, draw: !!sc.draw, toMove: sc.toMove,
    hint: sc.hint || null, reasonCode: sc.reasonCode || null, puzzle: sc.puzzle || null, verdict: sc.verdict || null,
    solution: sc.solution || null, answer: sc.answer || null, site: sc.site || S.site, error: null,
  });
  if (sc.you) S.you = sc.you;
  if (sc.difficulty) S.difficulty = sc.difficulty;
  S.fresh = sc.reply ? S.moves.length - 1 : prevLen >= 0 && S.moves.length === prevLen + 1 ? prevLen : -1;
  render();
}

async function call(name, args) {
  S.busy = true; S.error = null; render();
  try {
    const r = await app.callServerTool({ name, arguments: args });
    S.busy = false;
    if (r.isError) { S.error = (r.content && r.content[0] && r.content[0].text) || 'error'; return null; }
    take(r.structuredContent);
    tellClaude();
    return r;
  } catch (e) {
    S.busy = false; S.error = String((e && e.message) || e); return null;
  } finally { render(); }
}

/** Cho Claude biết thế cờ hiện tại (để trò chuyện tiếp về ván đang chơi). Host không hỗ trợ thì bỏ qua. */
function tellClaude() {
  const status = S.winner ? `${S.winner} won` : S.draw ? 'draw' : `${S.toMove} to move`;
  const text = `Caro widget (${S.mode}, rule ${S.rule}${S.mode === 'play' ? `, user plays ${S.you}, ${S.difficulty}` : ''}): ${status}. moves: ${JSON.stringify(S.moves)}`;
  app.updateModelContext({ content: [{ type: 'text', text }] }).catch(() => {});
}

// ---------------------------------------------------------------- Thao tác
function playArgs(moves) { return { moves, rule: S.rule, difficulty: S.difficulty, you_play: S.you }; }

function onCell(x, y) {
  if (S.busy || occupied(x, y)) return;
  if (S.mode === 'play') {
    if (S.winner || S.draw || S.toMove !== S.you) return;
    const before = S.moves;
    S.moves = [...before, [x, y]]; S.fresh = S.moves.length - 1; S.toMove = S.you === 'X' ? 'O' : 'X';
    call('play_caro', playArgs(S.moves)).then((r) => { if (!r) { S.moves = before; S.toMove = S.you; render(); } });
  } else if (S.mode === 'puzzle' && S.verdict !== 'correct') {
    call('caro_puzzle', { id: S.puzzle.id, answer: [x, y] });
  }
}

function undo() {
  if (S.busy || !S.moves.length) return;
  const youN = S.you === 'X' ? 0 : 1; // chỉ số chẵn / lẻ của nước người chơi
  let n = S.moves.length - 1;
  while (n >= 0 && n % 2 !== youN) n--; // lùi tới nước gần nhất của người chơi (bỏ cả nước máy sau nó)
  if (n < 0) return;
  S.moves = S.moves.slice(0, n);
  Object.assign(S, { winner: null, line: null, draw: false, toMove: S.you, fresh: -1, error: null });
  render(); tellClaude();
}

function newGame() {
  if (S.busy) return;
  Object.assign(S, { mode: 'play', moves: [], winner: null, line: null, draw: false, hint: null, view: null, fresh: -1, error: null, toMove: 'X' });
  if (S.you === 'O') call('play_caro', playArgs([])); else render();
}

function setOpt(key, val) {
  if (S.busy || S[key] === val) return;
  S[key] = val;
  if (key === 'you' && !S.moves.length) return newGame();
  render();
}

function openSite() { if (S.site) app.openLink({ url: S.site }).catch(() => {}); } // site: máy chủ gửi kèm kết quả (texts.js site())

// ---------------------------------------------------------------- Vẽ
const occupied = (x, y) => S.moves.some((m) => m[0] === x && m[1] === y);

/** Khung nhìn: ôm mọi quân (+2 ô), tối thiểu 13 ô, chỉ nở ra trong một ván (không nhảy qua lại). */
function view() {
  const pts = [...S.moves, ...(S.hint ? [S.hint] : []), ...(S.solution ? [S.solution] : [])];
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  if (pts.length) { x0 = Math.min(...pts.map((p) => p[0])); x1 = Math.max(...pts.map((p) => p[0])); y0 = Math.min(...pts.map((p) => p[1])); y1 = Math.max(...pts.map((p) => p[1])); }
  x0 -= 2; x1 += 2; y0 -= 2; y1 += 2;
  if (S.view && S.view.n >= Math.max(x1 - x0, y1 - y0) + 1 && S.view.x0 <= x0 && S.view.y0 <= y0 && S.view.x0 + S.view.n > x1 && S.view.y0 + S.view.n > y1) return S.view;
  const n = Math.min(2 * LIM + 1, Math.max(MIN_VIEW, x1 - x0 + 1, y1 - y0 + 1));
  const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
  const clampS = (c) => Math.max(-LIM, Math.min(LIM - n + 1, c - Math.floor(n / 2)));
  S.view = { x0: clampS(cx), y0: clampS(cy), n };
  return S.view;
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function stone(g, side, x, y, cls) {
  const cx = x * 10 + 5, cy = y * 10 + 5;
  if (side === 'X') {
    const p = el('path', { d: `M${cx - 3} ${cy - 3}L${cx + 3} ${cy + 3}M${cx + 3} ${cy - 3}L${cx - 3} ${cy + 3}`, class: 'x ' + (cls || '') }, g);
    return p;
  }
  return el('circle', { cx, cy, r: 3.3, class: 'o ' + (cls || '') }, g);
}

function drawBoard() {
  const v = view(), n = v.n;
  const svg = el('svg', { viewBox: `0 0 ${n * 10} ${n * 10}`, class: 'board' + (canClick() ? '' : ' locked'), role: 'img', 'aria-label': t('board') });
  const g = el('g', {}, svg);
  for (let i = 1; i < n; i++) {
    el('line', { x1: i * 10, y1: 0, x2: i * 10, y2: n * 10, class: 'grid' }, g);
    el('line', { x1: 0, y1: i * 10, x2: n * 10, y2: i * 10, class: 'grid' }, g);
  }
  const lx = (x) => x - v.x0, ly = (y) => y - v.y0;
  if (S.line) {
    for (const [x, y] of S.line) el('rect', { x: lx(x) * 10, y: ly(y) * 10, width: 10, height: 10, class: 'wincell' }, g);
  }
  if (S.hint) { el('rect', { x: lx(S.hint[0]) * 10 + 1, y: ly(S.hint[1]) * 10 + 1, width: 8, height: 8, rx: 2, class: 'hint' }, g); }
  if (S.solution) el('rect', { x: lx(S.solution[0]) * 10 + 1, y: ly(S.solution[1]) * 10 + 1, width: 8, height: 8, rx: 2, class: 'hint' }, g);
  if (S.answer && S.verdict === 'wrong') el('rect', { x: lx(S.answer[0]) * 10 + 1, y: ly(S.answer[1]) * 10 + 1, width: 8, height: 8, rx: 2, class: 'wrong' }, g);
  const last = S.moves[S.moves.length - 1];
  if (last && !S.line) el('rect', { x: lx(last[0]) * 10 + 0.6, y: ly(last[1]) * 10 + 0.6, width: 8.8, height: 8.8, rx: 1.8, class: 'last' }, g);
  if (!S.moves.length && v.x0 <= 0 && v.y0 <= 0 && v.x0 + n > 0 && v.y0 + n > 0) el('circle', { cx: lx(0) * 10 + 5, cy: ly(0) * 10 + 5, r: 1.1, class: 'star' }, g);
  S.moves.forEach((m, i) => stone(g, i % 2 ? 'O' : 'X', lx(m[0]), ly(m[1]), i === S.fresh ? 'new' : ''));
  if (S.hint) stone(g, S.toMove, lx(S.hint[0]), ly(S.hint[1]), 'ghost');
  if (S.solution) stone(g, S.toMove, lx(S.solution[0]), ly(S.solution[1]), S.verdict === 'correct' ? 'new' : 'ghost');
  if (S.line && S.line.length) {
    const a = S.line[0], b = S.line[S.line.length - 1];
    el('line', { x1: lx(a[0]) * 10 + 5, y1: ly(a[1]) * 10 + 5, x2: lx(b[0]) * 10 + 5, y2: ly(b[1]) * 10 + 5, class: 'winline' }, g);
  }
  // Bóng quân khi rê chuột (máy tính)
  const ghost = el('g', {}, svg);
  svg.addEventListener('pointermove', (e) => {
    ghost.textContent = '';
    if (!canClick() || e.pointerType !== 'mouse') return;
    const c = cellAt(svg, e, v);
    if (c && !occupied(c[0], c[1])) stone(ghost, S.mode === 'play' ? S.you : S.toMove, lx(c[0]), ly(c[1]), 'ghost');
  });
  svg.addEventListener('pointerleave', () => { ghost.textContent = ''; });
  svg.addEventListener('click', (e) => { const c = cellAt(svg, e, v); if (c) onCell(c[0], c[1]); });
  return svg;
}

function cellAt(svg, e, v) {
  const r = svg.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * v.n), y = Math.floor(((e.clientY - r.top) / r.height) * v.n);
  if (x < 0 || y < 0 || x >= v.n || y >= v.n) return null;
  return [x + v.x0, y + v.y0];
}

function canClick() {
  if (S.busy) return false;
  if (S.mode === 'play') return !S.winner && !S.draw && S.toMove === S.you;
  if (S.mode === 'puzzle') return S.verdict !== 'correct' && !S.solution;
  return false;
}

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function btn(label, onClick, cls, disabled) {
  const b = h('button', 'btn' + (cls ? ' ' + cls : ''), label);
  b.type = 'button'; b.disabled = !!disabled; b.addEventListener('click', onClick);
  return b;
}

function seg(items, current, onPick) {
  const s = h('div', 'seg');
  for (const [val, label] of items) {
    const b = h('button', '', label);
    b.type = 'button'; b.setAttribute('aria-pressed', String(val === current)); b.disabled = S.busy;
    b.addEventListener('click', () => onPick(val));
    s.appendChild(b);
  }
  return s;
}

const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor" opacity=".08"/>'
  + '<path d="M6 6l5 5M11 6l-5 5" stroke="#d4472b" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="16" r="3.2" fill="none" stroke="#2a6fd4" stroke-width="2.2"/></svg>';

function statusRow() {
  const row = h('div', 'status');
  const dot = h('span', 'dot');
  let msg, cls = '';
  if (S.error) { msg = t('error', { msg: S.error }); cls = 'err'; }
  else if (S.busy) { msg = S.mode === 'puzzle' ? t('checking') : t('thinking'); cls = 'thinking'; }
  else if (S.mode === 'play') {
    if (S.winner) { const youWon = S.winner === S.you; msg = youWon ? t('you_win') : t('you_lose'); cls = youWon ? 'win' : 'lose'; }
    else if (S.draw) msg = t('draw');
    else msg = t('your_move');
  } else if (S.mode === 'suggest') msg = S.hint ? t('hint', { side: S.toMove, move: fmt(S.hint) }) : '';
  else msg = t('goal', { side: S.toMove, n: S.puzzle ? S.puzzle.len : '' });
  const side = S.mode === 'play' ? (S.busy ? (S.you === 'X' ? 'O' : 'X') : S.you) : S.toMove;
  dot.style.background = side === 'O' ? 'var(--o)' : 'var(--x)';
  row.className = 'status ' + cls;
  row.append(dot, h('span', 'msg', msg), h('span', 'moves', t('move_n', { n: S.moves.length })));
  return row;
}

function render() {
  root.textContent = '';
  const top = h('div', 'top');
  const brand = h('div', 'brand');
  brand.innerHTML = LOGO;
  brand.appendChild(h('span', '', S.mode === 'puzzle' && S.puzzle ? (S.puzzle.daily ? t('daily') + ' · ' : '') + t('puzzle', { id: S.puzzle.id }) : 'Caro x Gomoku'));
  top.append(brand, h('span', 'spacer'), h('span', 'badge', t('rule_' + S.rule)));
  if (S.mode === 'play') top.appendChild(h('span', 'badge', t('you', { side: S.you })));
  if (S.mode === 'puzzle' && S.puzzle) top.appendChild(h('span', 'badge', S.puzzle.kind.toUpperCase() + ' · ' + S.puzzle.rating));
  root.append(top, statusRow());

  const wrap = h('div', 'board-wrap');
  wrap.appendChild(drawBoard());
  root.appendChild(wrap);

  if (S.mode === 'play') {
    const opts = h('div', 'row');
    opts.appendChild(seg([['easy', t('easy')], ['normal', t('normal')], ['hard', t('hard')]], S.difficulty, (v) => setOpt('difficulty', v)));
    if (!S.moves.length || (S.you === 'O' && S.moves.length === 1)) {
      opts.appendChild(seg([['X', 'X'], ['O', 'O']], S.you, (v) => setOpt('you', v)));
      opts.appendChild(seg(['vn', 'free', 'std', 'renju'].map((r) => [r, t('rule_' + r)]), S.rule, (v) => { setOpt('rule', v); if (S.moves.length) newGame(); }));
    }
    root.appendChild(opts);
    const act = h('div', 'actions');
    act.append(btn(t('undo'), undo, '', S.busy || !S.moves.some((_, i) => i % 2 === (S.you === 'X' ? 0 : 1))),
      btn(t('new_game'), newGame, 'primary', S.busy), btn(t('full') + ' ↗', openSite, 'link'));
    root.appendChild(act);
  } else if (S.mode === 'suggest') {
    if (S.reasonCode) root.appendChild(h('div', 'note', t('r_' + S.reasonCode.k, S.reasonCode)));
    const act = h('div', 'actions');
    act.append(btn(t('play_here'), () => { Object.assign(S, { mode: 'play', you: S.toMove, hint: null, fresh: -1 }); render(); }, 'primary', S.busy),
      btn(t('full') + ' ↗', openSite, 'link'));
    root.appendChild(act);
  } else if (S.mode === 'puzzle') {
    if (S.verdict === 'correct') root.appendChild(h('div', 'note ok', t('correct')));
    else if (S.verdict === 'wrong') root.appendChild(h('div', 'note bad', t('wrong')));
    else if (S.solution) root.appendChild(h('div', 'note', t('solution', { move: fmt(S.solution) })));
    else root.appendChild(h('div', 'note', t('tap_key')));
    const act = h('div', 'actions');
    if (!S.solution) act.appendChild(btn(t('reveal'), () => call('caro_puzzle', { id: S.puzzle.id, reveal: true }), '', S.busy));
    act.append(btn(t('next'), () => { S.view = null; call('caro_puzzle', { id: (S.puzzle.id % (S.puzzle.total || 1)) + 1 }); }, 'primary', S.busy),
      btn(t('full') + ' ↗', openSite, 'link'));
    root.appendChild(act);
  }
}

// ---------------------------------------------------------------- Kết nối với Claude
app.ontoolinput = (p) => {
  const a = (p && p.arguments) || {};
  if (a.difficulty) S.difficulty = a.difficulty;
  if (a.you_play) S.you = a.you_play;
  if (a.rule) S.rule = a.rule;
};
app.ontoolresult = (r) => { if (r && !r.isError) take(r.structuredContent); else if (r) { S.error = (r.content && r.content[0] && r.content[0].text) || 'error'; render(); } };
app.onhostcontextchanged = (ctx) => { applyContext(ctx); render(); };
app.onteardown = async () => ({});

if (globalThis.CARO_MCP_PREVIEW) { // ảnh chụp màn hình / xem thử ngoài Claude (không có host để bắt tay)
  applyContext(globalThis.CARO_MCP_PREVIEW_CONTEXT);
  take(globalThis.CARO_MCP_PREVIEW);
} else {
  // Chưa có kết quả tool sau 2 giây (host chậm / lỗi): hiện bàn trống thay cho khung chờ
  setTimeout(() => { if (root.querySelector('.skel')) render(); }, 2000);
  await app.connect().catch(() => {});
  applyContext(app.getHostContext());
  if (!root.querySelector('.skel')) render();
}
