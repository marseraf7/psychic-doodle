/*
 * Lớp học / Nghiên cứu (C2) – xem / soạn một bài: bàn cờ dạng "ext" (CaroApp.enterExt) + khung #cls-panel:
 * chương, nút ⏮ ◀ ▶ ⏭, cây nước (biến trong ngoặc, bấm để tới), lời bình (CaroRich.render; chủ bài soạn bằng CaroRich.editor),
 * dấu ô / mũi tên (CaroApp.setMarks / setDrawLines). Chủ bài: đánh nước = thêm vào cây (tự lưu chương, học viên đang theo dõi
 * đi theo – clsSync), chế độ Dấu ô / Mũi tên, xoá từ nước này, đưa biến lên nhánh chính, thêm chương, nhập ván (chữ "h8 i9 …"
 * hoặc mã / link xem lại), quyền xem, chia sẻ link /?cls=<mã>, xoá bài. Học viên: "Theo giáo viên" (bật sẵn) hoặc tự thử nước
 * trên bản sao trong máy (không gửi lên). Khi chủ bài lưu, máy chủ chỉ gửi phần đổi (clsDelta – CaroClassTree.applyDelta);
 * lỡ một lần (số phiên bản không khớp) thì mở lại bài lấy bản đầy đủ.
 *   window.CaroClassView = { get state() }
 */
(function () {
  'use strict';
  const N = window.CaroOnline, App = window.CaroApp, Tr = window.CaroClassTree;
  if (!N || !App || !Tr) return;
  const T = (k, a) => window.I18N.t(k, a);
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  const name = (m) => (window.CaroA11yCoords ? window.CaroA11yCoords.name(m[0], m[1]) : m.join(','));
  const st = { s: null, ci: 0, path: [], follow: true, mode: 'move', arrowFrom: null, ctrl: null, saveT: 0 };
  const meId = () => (N.state.me ? N.state.me.uid || N.state.me.id : null);
  const owner = () => !!st.s && st.s.owner === meId();
  const chap = () => st.s && st.s.chapters[st.ci];
  const node = () => (chap() ? Tr.nodeAt(chap().root, st.path) : null);

  function panel() {
    let p = $('cls-panel');
    if (!p) { p = document.createElement('section'); p.id = 'cls-panel'; p.className = 'cls-panel'; p.hidden = true; document.body.appendChild(p); }
    return p;
  }
  /** Cây nước dạng chữ: nhánh chính liền, biến trong ngoặc; nút đang chọn tô đậm. */
  function treeHtml(n, path, ply) {
    let out = '';
    let cur = n, p = path, k = ply;
    while (cur.ch && cur.ch.length) {
      const [main, ...vars] = cur.ch;
      const mp = [...p, 0];
      out += mv(main, mp, k);
      for (let i = 0; i < vars.length; i++) out += ` <span class="cls-var">(${mv(vars[i], [...p, i + 1], k)}${treeHtml(vars[i], [...p, i + 1], k + 1)})</span>`;
      cur = main; p = mp; k++;
    }
    return out;
  }
  function mv(n, path, ply) {
    const on = path.join('.') === st.path.join('.');
    return ` <button type="button" class="cls-mv${on ? ' on' : ''}${n.c ? ' has-c' : ''}" data-path="${path.join('.')}">${ply % 2 ? '' : (Math.floor(ply / 2) + 1) + '.'}${esc(name(n.m))}</button>`;
  }
  function drawPanel() {
    const p = panel();
    const s = st.s;
    p.hidden = !s || App.ext !== st.ctrl;
    if (p.hidden) { p.innerHTML = ''; return; }
    const ch = chap(), n = node();
    const ply0 = ch.setup.length;
    const chapters = s.chapters.map((c, i) => `<option value="${i}"${i === st.ci ? ' selected' : ''}>${esc(c.name || String(i + 1))}</option>`).join('');
    const comment = n && n.c ? `<div class="rich cls-c">${window.CaroRich.render(n.c)}</div>` : '';
    const ownerTools = owner() ? `<div class="cls-tools">
        <label class="cls-mode"><span>${esc(T('cls_mode'))}</span><select data-k="mode">${['move', 'mark', 'arrow'].map((m) => `<option value="${m}"${st.mode === m ? ' selected' : ''}>${esc(T('cls_mode_' + m))}</option>`).join('')}</select></label>
        <label class="cls-mode"><span>${esc(T('rules'))}</span><select data-k="rule">${['vn', 'free', 'std', 'renju'].map((r) => `<option value="${r}"${ch.rule === r ? ' selected' : ''}>${esc(T('grule_s_' + r))}</option>`).join('')}</select></label>
        <label class="cls-mode"><span>${esc(T('cls_vis'))}</span><select data-k="vis">${['public', 'unlisted', 'private'].concat(s.club ? ['club'] : []).map((v) => `<option value="${v}"${s.vis === v ? ' selected' : ''}>${esc(T('cls_vis_' + v))}</option>`).join('')}</select></label>
      </div>
      <div class="cls-btns">
        <button type="button" class="ghost sm" data-a="del"${st.path.length ? '' : ' disabled'}>${esc(T('cls_del_move'))}</button>
        <button type="button" class="ghost sm" data-a="promote"${st.path.length && st.path[st.path.length - 1] ? '' : ' disabled'}>${esc(T('cls_promote'))}</button>
        <button type="button" class="ghost sm" data-a="addch">${esc(T('cls_add_chapter'))}</button>
        <button type="button" class="ghost sm" data-a="import">${esc(T('cls_import'))}</button>
        <button type="button" class="ghost sm" data-a="delch"${s.chapters.length > 1 ? '' : ' disabled'}>${esc(T('cls_del_chapter'))}</button>
        <button type="button" class="ghost sm" data-a="delstudy">${esc(T('cls_delete'))}</button>
      </div>
      <form class="cls-cform">${window.CaroRich.editor('c', n ? n.c || '' : '', { rows: 3, max: Tr.LIMITS.comment })}<button type="submit" class="primary sm">${esc(T('cls_save_comment'))}</button></form>`
      : `<label class="cls-follow"><input type="checkbox" data-k="follow"${st.follow ? ' checked' : ''}> <span>${esc(T('cls_follow'))}</span></label>`;
    p.innerHTML = `<header class="cls-head"><h2><span class="ellip">${esc(s.title)}</span></h2>
        <button type="button" class="ghost sm" data-a="share">${esc(T('cls_share'))}</button><button type="button" class="ghost sm" data-a="leave">${esc(T('cls_leave'))}</button></header>
      <div class="cls-nav"><select data-k="chapter" aria-label="${esc(T('cls_chapter'))}">${chapters}</select>
        <button type="button" class="ghost sm" data-a="first" aria-label="⏮">⏮</button><button type="button" class="ghost sm" data-a="prev" aria-label="◀">◀</button>
        <button type="button" class="ghost sm" data-a="next" aria-label="▶">▶</button><button type="button" class="ghost sm" data-a="last" aria-label="⏭">⏭</button></div>
      ${s.desc && !st.path.length ? `<div class="rich cls-desc">${window.CaroRich.render(s.desc)}</div>` : ''}
      <div class="cls-tree" aria-label="${esc(T('cls_moves'))}">${treeHtml(ch.root, [], ply0) || `<span class="hint">${esc(T('cls_empty'))}</span>`}</div>
      ${comment}${ownerTools}`;
  }
  /** Dựng bàn cờ theo nút đang chọn + dấu / mũi tên của nút đó. */
  function show() {
    const ch = chap();
    if (!ch || App.ext !== st.ctrl) return;
    st.ctrl.moves = Tr.movesAt(ch, st.path);
    App.extSet(st.ctrl.moves);
    const n = node() || {};
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1f5fd1';
    App.setMarks((n.s || []).filter((x) => x.k === 'm').map((x) => ({ x: x.x, y: x.y, kind: 'bad', color: accent })));
    App.setDrawLines((n.s || []).filter((x) => x.k === 'a').map((x) => [x.x0, x.y0, x.x1, x.y1, 2]), null);
    drawPanel();
  }
  function go(path, sync = true) {
    if (!Tr.nodeAt(chap().root, path)) return;
    st.path = path;
    st.arrowFrom = null;
    show();
    if (sync && owner()) syncSoon();
  }
  /**
   * Báo học viên chỗ giáo viên đang đứng (clsSync). Máy chủ chỉ nhận một tin mỗi 80 ms: bấm nhanh (▶ liên tục, lùi rồi đi
   * nước ngay) thì gửi chỗ cuối cùng sau khi hết khoảng chờ – không bỏ mất tin cuối làm học viên đứng sai chỗ.
   */
  function syncSoon() {
    clearTimeout(st.syncT);
    const wait = 100 - (Date.now() - (st.syncAt || 0));
    const fire = () => { if (!st.s || !owner()) return; st.syncAt = Date.now(); N.send({ t: 'clsSync', id: st.s.id, chapter: st.ci, path: st.path }); };
    if (wait <= 0) fire(); else st.syncT = setTimeout(fire, wait);
  }
  /** Lưu chương (chủ bài) – gom các lần sửa liên tiếp. */
  function saveSoon() {
    clearTimeout(st.saveT);
    const id = st.s.id, ci = st.ci, ch = chap();
    st.saveT = setTimeout(() => sendChapter(id, ci, ch), 400);
  }
  /** Gửi chương: tin WebSocket tối đa 16 KB nên chương lớn được chia thành nhiều phần ≤ 12 000 ký tự (clsChapterPart). */
  function sendChapter(id, idx, chapter) {
    const text = JSON.stringify(chapter);
    if (text.length <= 12000) return N.send({ t: 'clsChapter', id, idx, chapter });
    const n = Math.ceil(text.length / 12000);
    for (let k = 0; k < n; k++) N.send({ t: 'clsChapterPart', id, idx, k, n, d: text.slice(k * 12000, (k + 1) * 12000) });
  }
  function onMove(x, y) {
    const ch = chap();
    if (!ch) return;
    if (owner() && st.mode !== 'move') {
      const n = node();
      if (st.mode === 'mark') Tr.toggleShape(n, { k: 'm', x, y });
      else if (!st.arrowFrom) { st.arrowFrom = [x, y]; return; } else { Tr.toggleShape(n, { k: 'a', x0: st.arrowFrom[0], y0: st.arrowFrom[1], x1: x, y1: y }); st.arrowFrom = null; }
      saveSoon(); show(); return;
    }
    if (!owner()) st.follow = false; // học viên tự thử nước: thôi đi theo giáo viên (bật lại ở ô "Theo giáo viên")
    const p = Tr.addMove(ch.root, st.path, [x, y]);
    if (!p) return;
    if (owner()) saveSoon();
    go(p);
  }
  function open(s, live) {
    st.s = s;
    st.lastSync = live ? { id: s.id, ...live } : null;
    st.ci = live && s.chapters[live.chapter] ? live.chapter : 0;
    st.path = live && live.chapter === st.ci && Tr.nodeAt(chap().root, live.path) ? live.path : [];
    st.mode = 'move';
    st.follow = true;
    st.ctrl = { moves: Tr.movesAt(chap(), st.path), get rule() { return chap() ? chap().rule : 'vn'; }, get canPlay() { return !!st.s; }, onMove, onExit: leave,
      render: () => ({ turn: esc(st.s ? st.s.title : ''), score: esc(chap() ? chap().name : '') }) };
    if (!App.enterExt(st.ctrl)) { st.s = null; N.toast(T('corr_busy')); return; }
    show();
  }
  function leave() {
    const s = st.s;
    st.s = null;
    if (s) N.send({ t: 'clsLeave', id: s.id });
    App.setMarks(null); App.setDrawLines([], null);
    drawPanel();
    if (App.ext === st.ctrl) App.exitExt();
  }
  async function act(a) {
    const s = st.s, ch = chap();
    if (a === 'leave') return leave();
    if (a === 'first') return go([]);
    if (a === 'prev') return go(Tr.prev(st.path));
    if (a === 'next') return go(Tr.next(ch.root, st.path));
    if (a === 'last') { let p = st.path; for (let q = Tr.next(ch.root, p); q.length !== p.length; q = Tr.next(ch.root, p)) p = q; return go(p); }
    if (a === 'share') {
      const url = (window.CARO_SERVER || location.origin).replace(/\/+$/, '') + '/?cls=' + s.id;
      try { await navigator.clipboard.writeText(url); N.toast(T('cls_copied')); } catch (e) { window.CaroConfirm.info(url); }
      return;
    }
    if (!owner()) return;
    if (a === 'del') { const p = Tr.remove(ch.root, st.path); saveSoon(); return go(p); }
    if (a === 'promote') { const p = Tr.promote(ch.root, st.path); saveSoon(); return go(p); }
    if (a === 'addch') {
      const nm = await window.CaroConfirm.prompt(T('cls_chapter_name'), String(s.chapters.length + 1));
      if (nm == null) return;
      N.send({ t: 'clsChapter', id: s.id, idx: s.chapters.length, chapter: Tr.newChapter(nm, ch.rule) });
      st.pendingCh = s.chapters.length;
      return;
    }
    if (a === 'delch') { if (await window.CaroConfirm.ask(T('cls_del_chapter_q'))) { N.send({ t: 'clsChapterDel', id: s.id, idx: st.ci }); st.ci = 0; st.path = []; } return; }
    if (a === 'delstudy') { if (await window.CaroConfirm.ask(T('cls_delete_q'))) N.send({ t: 'clsDelete', id: s.id }); return; }
    if (a === 'import') {
      const txt = await window.CaroConfirm.prompt(T('cls_import_q'), '');
      if (!txt) return;
      let moves = null;
      const code = /(?:replay=)?([\w-]{6,20})\s*$/.exec(txt.trim());
      const parsed = window.CaroGameText && window.CaroGameText.parse(txt);
      if (parsed && parsed.moves.length) moves = parsed.moves;
      else if (code) { try { const r = await fetch(N.base + '/api/v1/game/' + code[1]); if (r.ok) moves = (await r.json()).moves; } catch (e) { /* mất mạng */ } }
      if (!moves || !moves.length) return N.toast(T('cls_import_bad'));
      let p = st.path;
      for (const m of moves) { const q = Tr.addMove(ch.root, p, m); if (!q) break; p = q; }
      const clean = Tr.clean(ch); // bỏ nước trùng ô / sau nước thắng như máy chủ
      st.s.chapters[st.ci] = clean;
      saveSoon();
      return go(Tr.nodeAt(clean.root, p) ? p : []);
    }
  }
  panel().addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !st.s) return;
    if (b.dataset.path != null) { go(b.dataset.path ? b.dataset.path.split('.').map(Number) : []); return; }
    if (b.dataset.a) act(b.dataset.a);
  });
  panel().addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k || !st.s) return;
    if (k === 'chapter') { st.ci = Number(e.target.value); st.path = []; App.extSet([]); show(); if (owner()) syncSoon(); return; }
    if (k === 'follow') { st.follow = e.target.checked; return; }
    if (k === 'mode') { st.mode = e.target.value; st.arrowFrom = null; return; }
    if (k === 'rule') { chap().rule = e.target.value; saveSoon(); show(); return; }
    if (k === 'vis') N.send({ t: 'clsMeta', id: st.s.id, vis: e.target.value });
  });
  panel().addEventListener('submit', (e) => {
    e.preventDefault();
    const n = node();
    if (!n || !owner()) return;
    n.c = e.target.querySelector('textarea[name=c]').value.slice(0, Tr.LIMITS.comment);
    if (!n.c.trim()) delete n.c;
    saveSoon();
    drawPanel();
  });

  /** Bài vừa đổi (bản mới / phần thay đổi từ máy chủ): chủ bài giữ chỗ đang đứng; học viên đi theo nếu bật "Theo giáo viên". */
  function updated() {
    if (st.pendingCh != null && st.s.chapters[st.pendingCh]) { st.ci = st.pendingCh; st.path = []; st.pendingCh = null; }
    if (!chap()) { st.ci = 0; st.path = []; }
    if (!Tr.nodeAt(chap().root, st.path)) st.path = [];
    follow();
    show();
  }
  N.on('clsStudy', (m) => {
    st.refetchAt = 0;
    if (st.s && st.s.id === m.study.id) { st.s = m.study; updated(); return; }
    open(m.study, m.live);
  });
  // Chủ bài lưu: máy chủ chỉ gửi phần đổi (chương vừa sửa…); lỡ một lần (mất mạng chốc lát) thì lấy lại cả bài một lần
  N.on('clsDelta', (m) => {
    if (!st.s || st.s.id !== m.id) return;
    const r = Tr.applyDelta(st.s, m);
    if (r === 'ok') return updated();
    // Một lần mỗi 2 giây (lần trước lỗi / mất tin thì lần lỡ sau vẫn hỏi lại được)
    if (r === 'stale' && Date.now() - (st.refetchAt || 0) > 2000) { st.refetchAt = Date.now(); N.send({ t: 'clsOpen', id: m.id }); }
  });
  /** Đi theo chỗ giáo viên đang đứng (nếu nút đã có trong bản của mình – chưa có thì chờ bản mới của bài). */
  function follow() {
    const m = st.lastSync;
    if (!m || !st.s || st.s.id !== m.id || owner() || !st.follow || !st.s.chapters[m.chapter]) return false;
    if (!Tr.nodeAt(st.s.chapters[m.chapter].root, m.path)) return false;
    st.ci = m.chapter;
    st.path = m.path;
    return true;
  }
  N.on('clsSync', (m) => { st.lastSync = m; if (follow()) show(); });
  N.on('clsGone', (m) => { if (st.s && st.s.id === m.id) { leave(); N.toast(T('cls_gone')); } });
  window.addEventListener('caro:extenter', () => { if (st.s && App.ext !== st.ctrl) { st.s = null; drawPanel(); } });
  window.addEventListener('langchange', drawPanel);

  window.CaroClassView = { get state() { return { id: st.s && st.s.id, ci: st.ci, path: st.path.slice(), follow: st.follow, owner: owner() }; } };
})();
