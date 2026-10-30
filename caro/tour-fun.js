/*
 * Giải đấu – phần cho người xem (Đợt 10; máy chủ: tour-fun.js):
 *  - Trước giờ đấu: dự đoán bục vinh quang (vô địch / á quân / hạng ba).
 *  - Đang đấu: "Ai sẽ thắng?" – bình chọn các trận đã rõ hai người nhưng chưa bắt đầu (tối đa 8 trận).
 *  - Giải xong: bảng xếp hạng người đoán, điểm của mình; bình chọn Kỳ thủ xuất sắc / Ván đẹp nhất (3 ngày).
 *  - Poster giải (ảnh PNG 1080×1350 vẽ bằng canvas ngay trên máy – không thêm việc cho máy chủ).
 *   K.funHtml(t) – phần đặt vào trang giải. Nạp sau tour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, D, me, icon } = K;
  const F = { pred: {} }; // dự đoán đang chọn (chưa lưu) theo giải

  const players = (t) => t.players.filter((p) => !p.withdrawn);
  const nameOf = (t, uid) => (t.players.find((p) => p.uid === uid) || {}).name || '?';

  function predictHtml(t) {
    const cur = F.pred[t.id] || t.myPred || [];
    const sel = (i) => `<label class="field inline"><span>${esc(T('fun_place_' + (i + 1)))}</span><select data-pred="${i}"><option value="">—</option>${players(t).map((p) => `<option value="${esc(p.uid)}" ${cur[i] === p.uid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;
    return `<section class="fun-sec"><h4>${icon('star')}${esc(T('fun_predict'))}</h4><p class="hint">${esc(T('fun_predict_hint', { n: t.predCount || 0 }))}</p>
      ${me() && players(t).length >= 2 ? `<div class="fun-pred">${[0, 1, 2].map(sel).join('')}</div><button type="button" class="ghost sm" data-act="funPredict">${esc(T(t.myPred ? 'fun_predict_update' : 'fun_predict_save'))}</button>` : ''}</section>`;
  }

  /** Trận bình chọn được: đã rõ hai người, chưa đấu, chưa có phòng. */
  function votable(t) {
    const out = [];
    for (const v of t.stageViews || []) {
      const lists = [...(v.rounds || []), ...(v.lrounds || []), v.gf || [], ...((v.groups || []).flatMap((g) => g.rounds))];
      for (const r of lists) for (const m of r) if (m && m.a && m.a.uid && m.b && m.b.uid && !m.done && !m.live && !m.bye) out.push(m);
    }
    return out.slice(0, 8);
  }
  function votesHtml(t) {
    const list = votable(t);
    if (!list.length || !me()) return '';
    const mine = t.myVotes || {};
    return `<section class="fun-sec"><h4>${icon('swords')}${esc(T('fun_vote'))}</h4><ul class="fun-votes">${list.map((m) => {
      const [a, b] = m.votes || [0, 0], n = a + b, pa = n ? Math.round((a / n) * 100) : 50;
      const btn = (side, p) => `<button type="button" class="ghost sm ${mine[m.id] === side ? 'on' : ''}" data-act="funVote" data-mid="${esc(m.id)}" data-v="${side}" aria-pressed="${mine[m.id] === side}">${esc(p.name)}</button>`;
      return `<li>${btn('a', m.a)}<span class="fun-bar" title="${esc(T('fun_votes_n', { n }))}"><i style="width:${pa}%"></i></span>${btn('b', m.b)}</li>`;
    }).join('')}</ul></section>`;
  }

  function doneHtml(t) {
    let html = '';
    if (t.predTop && t.predTop.length) {
      html += `<section class="fun-sec"><h4>${icon('star')}${esc(T('fun_pred_top'))}</h4>${t.myPredScore != null ? `<p class="hint">${esc(T('fun_my_score', { n: t.myPredScore }))}</p>` : ''}
        <ol class="ranks">${t.predTop.map((x, i) => `<li class="${me() && x.uid === me().uid ? 'me' : ''}"><span class="rank">${i + 1}</span><div class="pn"><b>${esc(x.name)}</b></div><span class="pts">${x.score}</span></li>`).join('')}</ol></section>`;
    }
    if (!t.awards) return html;
    const mine = t.myAwards || {};
    const tally = (k) => (t.awards[k].length ? `<ol class="fun-awards">${t.awards[k].map((x) => `<li>${esc(x.label)} <b>${x.votes}</b></li>`).join('')}</ol>` : `<p class="hint">${esc(T('fun_award_none'))}</p>`);
    const pick = (k, opts) => (t.awardOpen && me() ? `<select data-award="${k}"><option value="">${esc(T('fun_award_pick'))}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${mine[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : '');
    html += `<section class="fun-sec"><h4>${icon('medal', 'm1')}${esc(T('fun_awards'))}</h4>${t.awardOpen ? `<p class="hint">${esc(T('fun_awards_hint'))}</p>` : ''}
      <div class="fun-cat"><b>${esc(T('fun_award_mvp'))}</b>${pick('mvp', players(t).map((p) => [p.uid, p.name]))}${tally('mvp')}</div>
      ${(t.awardGames || []).length || t.awards.game.length ? `<div class="fun-cat"><b>${esc(T('fun_award_game'))}</b>${pick('game', (t.awardGames || []).map((g) => [g.share, g.label]))}${tally('game')}</div>` : ''}</section>`;
    return html;
  }

  K.funHtml = (t) => {
    if (t.status === 'draft' || t.status === 'rejected') return '';
    let html = `<div class="row">${t.recur ? `<span class="pill">${icon('retry')}${esc(T('recur_tag_' + t.recur, { n: t.recurN || 1 }))}</span>` : ''}
      <button type="button" class="ghost sm" data-act="funPoster">${icon('image')}${esc(T('fun_poster'))}</button></div>`;
    if ((t.status === 'scheduled' || t.status === 'pending') && t.format === 'bracket' && !t.teamMatch) html += predictHtml(t);
    if (t.status === 'running') html += votesHtml(t);
    if (t.status === 'finished') html += doneHtml(t);
    return html;
  };

  // ------------------------------------------------------------ Thao tác
  K.acts.funPredict = () => {
    const t = D.tour;
    const picks = [0, 1, 2].map((i) => (document.querySelector(`[data-pred="${i}"]`) || {}).value).filter(Boolean);
    if (new Set(picks).size !== picks.length) { O.toast(T('fun_pred_dup')); return; }
    O.send({ t: 'tourPredict', id: t.id, picks });
    delete F.pred[t.id];
    O.toast(T('saved'));
  };
  K.acts.funVote = (b) => {
    const t = D.tour;
    const cur = (t.myVotes || {})[b.dataset.mid];
    O.send({ t: 'tourVote', id: t.id, match: b.dataset.mid, pick: cur === b.dataset.v ? null : b.dataset.v }); // bấm lại: bỏ phiếu
  };
  K.acts.funPoster = () => poster(D.tour);
  K.binders.push((body) => {
    body.querySelectorAll('[data-pred]').forEach((x) => {
      x.onchange = () => { F.pred[D.tour.id] = [0, 1, 2].map((i) => (body.querySelector(`[data-pred="${i}"]`) || {}).value || ''); };
    });
    body.querySelectorAll('[data-award]').forEach((x) => {
      x.onchange = () => { if (x.value) O.send({ t: 'tourAward', id: D.tour.id, kind: x.dataset.award, pick: x.value }); };
    });
  });

  // ------------------------------------------------------------ Poster
  function wrap(g, text, max) {
    const words = String(text).split(/\s+/), lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (g.measureText(next).width > max && line) { lines.push(line); line = w; } else line = next;
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }
  function poster(t) {
    const W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1f3b73'); grad.addColorStop(1, '#0d1a33');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // Lưới caro mờ
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2;
    for (let x = 0; x <= W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const font = (w, s) => `${w} ${s}px system-ui, "Noto Sans", sans-serif`;
    g.fillStyle = '#ffd166'; g.font = font(700, 36); g.fillText('CARO x GOMOKU', 80, 130);
    g.fillStyle = '#fff'; g.font = font(800, 84);
    let y = 260;
    for (const l of wrap(g, t.name, W - 160)) { g.fillText(l, 80, y); y += 100; }
    g.font = font(500, 40); g.fillStyle = '#cfe0ff';
    const meta = document.createElement('div');
    meta.innerHTML = K.metaHtml ? K.metaHtml(t) : ''; // "Loại trực tiếp · Bo3 · 20 giây/nước…" (bỏ biểu tượng, giải mã ký tự)
    const lines = [meta.textContent.replace(/\s+/g, ' ').trim(), new Intl.DateTimeFormat(document.documentElement.lang || 'vi', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(t.startsAt + (D.skew || 0)),
      t.club ? t.club.name : ''].filter(Boolean); // dòng thông tin đã có số người
    y += 30;
    for (const l of lines) { for (const w of wrap(g, l, W - 160)) { g.fillText(w, 80, y); y += 58; } }
    if (t.status === 'finished' && t.podium && t.podium.length) {
      y += 40;
      g.fillStyle = '#ffd166'; g.font = font(700, 44); g.fillText(T('fun_poster_podium'), 80, y); y += 70;
      const medal = ['#f5c542', '#c0c7d1', '#d49a5a'];
      t.podium.slice(0, 3).forEach((p, i) => {
        g.fillStyle = medal[i]; g.beginPath(); g.arc(110, y - 14, 26, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#0d1a33'; g.font = font(800, 30); g.fillText(String(i + 1), 101, y - 3);
        g.fillStyle = '#fff'; g.font = font(600, 46); g.fillText(p.name || nameOf(t, p.uid), 160, y); y += 76;
      });
    }
    const url = (window.CARO_SERVER || location.origin).replace(/\/+$/, '') + '/?t=' + (t.slug || t.id);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, H - 150, W, 150);
    g.fillStyle = '#fff'; g.font = font(600, 36); g.fillText(T('fun_poster_join'), 80, H - 90);
    g.fillStyle = '#ffd166'; g.font = font(500, 30); g.fillText(url, 80, H - 45);
    cv.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = String(t.name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50) + '-poster.png';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }, 'image/png');
  }
})();
