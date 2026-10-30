/*
 * Giải đấu – thêm cho từng trận (tab Nhánh đấu của Cài đặt nâng cao, như Challonge):
 *  - Ảnh chia sẻ kết quả trận ("Generate shareable images for match results" – loại trực tiếp, nhánh thắng – thua,
 *    vòng tròn, Thụy Sĩ): vẽ ngay trên máy (canvas 1200×630, không tốn sức máy chủ), xem trước, tải về / chia sẻ.
 *  - Đính kèm trận ("Allow match attachments"): link, ảnh (tải lên như ảnh mô tả – rich-text.js), ghi chú; ban tổ chức
 *    và hai người chơi của trận thêm được, người đã thêm / ban tổ chức xoá được. Máy chủ: tour-opts.js.
 *   K.matchImgBtn(m), K.matchAttBtn(m) – nút trong ô trận (tour-stages.js). Nạp sau tour-stages.js, rich-text.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, D, icon, me, when } = K;
  const R = window.CaroRich;

  /** Trận theo mã trong các giai đoạn của giải + tên vòng. */
  function findMatch(t, id) {
    for (const v of t.stageViews || []) {
      const scan = (rounds, name) => { for (let r = 0; r < (rounds || []).length; r++) for (const m of rounds[r]) if (m && m.id === id) return { m, v, label: name(r, rounds.length) }; return null; };
      const rr = (r) => T('r_round', { n: r + 1 });
      const x = (v.type === 'swiss' ? scan(v.rounds, (r) => T('swiss_round', { n: r + 1, m: v.totalRounds })) : scan(v.rounds, (r, n) => K.roundName(n, r, v.type === 'double' ? 'wb_final' : 'r_final')))
        || scan(v.lrounds, (r, n) => (r === n - 1 ? T('lb_final') : T('lb') + ' · ' + rr(r)))
        || scan(v.gf && [v.gf], () => T('gf')) || scan(v.third && [[v.third]], () => T('third_place'));
      if (x) return x;
      for (const p of v.places || []) { const y = scan(p.rounds, () => T('place_range', { a: p.base, b: p.base + p.size - 1 })); if (y) return y; }
      for (const g of v.groups || []) { const y = scan(g.rounds, (r) => T('group_name', { name: g.name }) + ' · ' + rr(r)); if (y) return y; }
    }
    return null;
  }

  // ------------------------------------------------------------ Ảnh chia sẻ kết quả
  K.matchImgBtn = (m) => `<a href="#" data-act="matchImg" data-mid="${esc(m.id)}" title="${esc(T('mx_img'))}" aria-label="${esc(T('mx_img'))}">${icon('image')}</a>`;

  /** Cắt chữ cho vừa bề rộng w (thêm …). */
  function fit(ctx, s, w) {
    if (ctx.measureText(s).width <= w) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1);
    return s + '…';
  }
  function draw(t, x) {
    const { m, label } = x;
    const W = 1200, H = 630;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#13233f');
    bg.addColorStop(1, '#2d5aa8');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 15; i++) for (let j = 0; j < 8; j++) g.fillRect(40 + i * 80, 30 + j * 80, 2, 2); // lưới bàn cờ mờ
    g.textAlign = 'center';
    g.fillStyle = '#ffd36b';
    g.font = `600 30px ${font}`;
    g.fillText(fit(g, label || '', W - 120), W / 2, 92);
    g.fillStyle = '#ffffff';
    g.font = `700 46px ${font}`;
    g.fillText(fit(g, t.name, W - 120), W / 2, 152);
    const side = (p, wins, y, win) => {
      g.fillStyle = win ? 'rgba(255,211,107,0.18)' : 'rgba(255,255,255,0.07)';
      g.fillRect(110, y - 62, W - 220, 100);
      g.fillStyle = win ? '#ffd36b' : '#e8eefc';
      g.textAlign = 'left';
      g.font = `${win ? 700 : 500} 48px ${font}`;
      g.fillText(fit(g, (win ? '🏆 ' : '') + (p ? p.name : '—'), W - 420), 150, y);
      g.textAlign = 'right';
      g.font = `700 64px ${font}`;
      g.fillText(String(wins), W - 150, y + 6);
    };
    const winA = m.winner && m.a && m.winner === m.a.uid, winB = m.winner && m.b && m.winner === m.b.uid;
    side(m.a, m.wa, 290, winA);
    side(m.b, m.wb, 410, winB);
    g.textAlign = 'center';
    g.fillStyle = '#c9d6f2';
    g.font = `500 28px ${font}`;
    const sub = [m.draw ? T('draw') : '', K.setsText ? K.setsText(m) : '', m.walkover ? T('walkover') : ''].filter(Boolean).join(' · ');
    if (sub) g.fillText(fit(g, sub, W - 160), W / 2, 500);
    g.font = `500 24px ${font}`;
    g.fillStyle = '#9fb3dd';
    const site = (window.CARO_SERVER || location.origin).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    g.fillText(`Caro x Gomoku · ${site}/?t=${t.slug || t.id}`, W / 2, 585);
    return c;
  }

  let box = null;
  function closeBox() { if (box) { box.remove(); box = null; } }
  /** Hộp thoại (nổi trên trang giải – cũng là dialog). */
  function dialog(cls, html) {
    closeBox();
    box = document.createElement('dialog');
    box.className = 'mx-dlg ' + cls;
    box.innerHTML = `<button type="button" class="ghost sm icon mx-x" aria-label="${esc(T('close'))}">${icon('close')}</button>${html}`;
    box.querySelector('.mx-x').onclick = closeBox;
    box.addEventListener('close', closeBox);
    box.addEventListener('click', (e) => { if (e.target === box) closeBox(); });
    document.body.appendChild(box);
    if (box.showModal) box.showModal(); else box.setAttribute('open', '');
    return box;
  }

  K.acts.matchImg = (b) => {
    const t = D.tour;
    const x = t && findMatch(t, b.dataset.mid);
    if (!x) return;
    const canvas = draw(t, x);
    const d = dialog('mx-img', `<h4>${esc(T('mx_img'))}</h4><img alt="" src="${canvas.toDataURL('image/png')}">
      <div class="row"><button type="button" class="primary" data-mx="save">${icon('disk')}${esc(T('mx_save'))}</button>
      ${navigator.canShare ? `<button type="button" class="ghost" data-mx="share">${icon('share')}${esc(T('mx_share'))}</button>` : ''}</div>`);
    const file = () => new Promise((res) => canvas.toBlob((blob) => res(new File([blob], `${(t.slug || t.id)}-${x.m.id}.png`, { type: 'image/png' })), 'image/png'));
    d.querySelector('[data-mx="save"]').onclick = async () => {
      const f = await file();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    const sh = d.querySelector('[data-mx="share"]');
    if (sh) {
      sh.onclick = async () => {
        const f = await file();
        if (navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: t.name }).catch(() => {});
        else O.toast(T('mx_share_no'));
      };
    }
  };

  // ------------------------------------------------------------ Đính kèm trận
  K.matchAttBtn = (m) => `<a href="#" data-act="matchAtt" data-mid="${esc(m.id)}" title="${esc(T('mx_att'))}" aria-label="${esc(T('mx_att'))}">📎${m.att && m.att.length ? m.att.length : '+'}</a>`;
  let attMid = null;

  function attHtml(t, x) {
    const { m } = x;
    const uid = me() && me().uid;
    const canAdd = t.canManage || (t.attachments && m.a && m.b && [m.a.uid, m.b.uid].includes(uid));
    const list = (m.att || []).map((a) => `<li>${a.img ? `<a href="${esc(R.imgUrl(a.img))}" target="_blank" rel="noopener"><img class="mx-thumb" src="${esc(R.imgUrl(a.img))}" alt="" loading="lazy"></a>` : ''}
      <div>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer nofollow ugc">${esc(a.url)}</a>` : ''}${a.text ? `<p>${esc(a.text)}</p>` : ''}
      <small class="muted">${esc(a.name || '')} · ${esc(when(a.at))}</small></div>
      ${t.canManage || a.by === uid ? `<button type="button" class="ghost sm icon" data-act="matchAttDel" data-att="${esc(a.id)}" aria-label="${esc(T('mx_att_del'))}">${icon('trash')}</button>` : ''}</li>`).join('');
    const form = canAdd ? `<form class="mx-add"><input name="url" type="url" maxlength="300" placeholder="https://…" aria-label="${esc(T('mx_att_url'))}">
      <input name="text" maxlength="200" placeholder="${esc(T('mx_att_text'))}" aria-label="${esc(T('mx_att_text'))}">
      <label class="ghost sm mx-pick">${icon('image')}<span>${esc(T('mx_att_img'))}</span><input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
      <small class="mx-img-name muted"></small><p class="err"></p><button class="primary sm">${esc(T('mx_att_add'))}</button></form>` : '';
    return `<h4>${esc(T('mx_att'))}</h4><p class="muted">${esc((m.a ? m.a.name : '—') + ' – ' + (m.b ? m.b.name : '—'))} · ${esc(x.label || '')}</p>
      ${list ? `<ul class="mx-list">${list}</ul>` : `<p class="hint">${esc(T('mx_att_none'))}</p>`}${form}`;
  }

  function bindAtt(d) {
    const f = d.querySelector('.mx-add');
    if (!f) return;
    let img = null;
    const file = f.querySelector('input[type=file]');
    file.onchange = async () => {
      if (!file.files[0]) return;
      f.querySelector('.mx-img-name').textContent = T('rt_img_uploading');
      try { img = await R.uploadImage(file.files[0]); f.querySelector('.mx-img-name').textContent = '✓ ' + file.files[0].name; } catch (e) { img = null; f.querySelector('.mx-img-name').textContent = T('rt_img_fail'); }
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      const url = f.elements.url.value.trim(), text = f.elements.text.value.trim();
      if (!url && !text && !img) { f.querySelector('.err').textContent = T('srv_tour_att_empty'); return; }
      O.send({ t: 'tourAttach', id: D.tour.id, match: attMid, url: url || undefined, text: text || undefined, img: img || undefined });
      f.reset();
      img = null;
      f.querySelector('.mx-img-name').textContent = '';
    };
  }

  function showAtt() {
    const t = D.tour;
    const x = t && attMid && findMatch(t, attMid);
    if (!x) { closeBox(); return; }
    if (box && box.classList.contains('mx-att')) {
      // Đang mở: chỉ vẽ lại danh sách (giữ chữ đang gõ trong ô thêm)
      const tmp = document.createElement('div');
      tmp.innerHTML = attHtml(t, x);
      const old = box.querySelector('.mx-list, .hint');
      const neu = tmp.querySelector('.mx-list, .hint');
      if (old && neu) old.replaceWith(neu);
      return;
    }
    bindAtt(dialog('mx-att', attHtml(t, x)));
  }
  K.acts.matchAtt = (b) => { attMid = b.dataset.mid; closeBox(); showAtt(); };
  K.acts.matchAttDel = (b) => O.send({ t: 'tourAttachDel', id: D.tour.id, match: attMid, att: b.dataset.att });
  // Bấm nút trong hộp thoại (nằm ngoài trang giải): chuyển cho K.acts
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.mx-dlg [data-act]');
    if (!b || !K.acts[b.dataset.act]) return;
    e.preventDefault();
    K.acts[b.dataset.act](b);
  });
  // Trang giải vẽ lại (có cập nhật): làm mới danh sách đính kèm đang mở
  K.binders.push(() => { if (box && box.classList.contains('mx-att')) showAtt(); });
})();
