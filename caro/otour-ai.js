/*
 * Giải đấu Offline – trợ lý AI trong form tạo giải (máy chủ: server/src/hub/otour-ai.js – Claude, khoá API ở máy chủ):
 * người dùng tả giải bằng lời, trợ lý trả lời + đề xuất bản cấu hình; form xem trước bằng lời (describeSpec), người dùng
 * bấm "Dùng cấu hình này" mới áp vào form (K.otApplySpec – otour-tpl.js), rồi vẫn tự sửa / tự bấm tạo giải.
 * Máy chủ chưa có khoá API thì khung không hiện. Khung tự vẽ lại riêng (#otai) – không vẽ lại cả form đang gõ.
 *   K.otAiHtml() – chỗ đặt khung ở đầu form tạo giải (otour.js – pageNew).
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const IO = window.CaroOTourSpecIO;
  if (!K || !IO) return;
  const { O, T, esc, $ } = K;
  const MAX_TURNS = 12; // như máy chủ
  const A = { on: null, left: 0, log: [], pending: false, spec: null, specError: null, err: '' };

  K.otAiHtml = () => `<div id="otai" class="ot-sec ot-ai" ${A.on ? '' : 'hidden'}>${A.on ? inner() : ''}</div>`;

  function inner() {
    const log = A.log.map((m) => `<li class="${esc(m.role)}">${esc(m.text)}</li>`).join('');
    const prev = A.spec ? `<div class="ot-ai-spec"><b>${esc(T('ot_ai_spec'))}</b><ul>${IO.describeSpec(A.spec, T).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <button type="button" class="primary sm" data-act="otAiApply">${esc(T('ot_ai_apply'))}</button></div>` : '';
    return `<h4>🤖 ${esc(T('ot_ai'))}</h4>
      ${A.log.length ? `<ol class="ot-ai-log">${log}</ol>` : `<p class="hint">${esc(T('ot_ai_hint'))}</p>`}
      ${A.pending ? `<p class="hint">${esc(T('ot_ai_wait'))}</p>` : ''}${prev}
      ${A.specError ? `<p class="err">${esc(T(A.specError))}</p>` : ''}<p class="err">${esc(A.err)}</p>
      <textarea id="otai-in" rows="2" maxlength="2000" placeholder="${esc(T('ot_ai_ph'))}" ${A.pending ? 'disabled' : ''}></textarea>
      <div class="row"><button type="button" class="primary sm" data-act="otAiSend" ${A.pending || !A.left ? 'disabled' : ''}>${esc(T('ot_ai_send'))}</button>
        <small class="muted">${esc(T('ot_ai_left', { n: A.left }))} · ${esc(T('ot_ai_note'))}</small></div>`;
  }
  /** Vẽ lại riêng khung trợ lý (giữ chữ đang gõ trong ô). */
  function paint() {
    const box = $('otai');
    if (!box) return;
    const typed = $('otai-in') ? $('otai-in').value : '';
    box.hidden = !A.on;
    box.innerHTML = A.on ? inner() : '';
    const inp = $('otai-in');
    if (inp && typed && !A.pending) inp.value = typed;
  }
  /** Bản cấu hình đang có trên form – trợ lý sửa tiếp từ đây. */
  function formSpec() {
    const fm = K.otForm;
    if (!fm || !fm.F || !fm.F.d) return null;
    fm.collect();
    const F = fm.F;
    return { sport: F.d.sport, result: F.d.result, ...(F.d.result === 'sets' ? { set: F.d.set } : {}), stages: F.stages };
  }

  K.acts.otAiSend = () => {
    const inp = $('otai-in');
    const text = inp ? inp.value.trim() : '';
    if (!text || A.pending) return;
    A.log.push({ role: 'user', text });
    A.err = '';
    A.pending = true;
    // Gửi các lượt gần nhất, bắt đầu bằng tin của người dùng (máy chủ chỉ nhận tối đa MAX_TURNS lượt)
    let hist = A.log.slice(-MAX_TURNS);
    while (hist.length && hist[0].role !== 'user') hist = hist.slice(1);
    O.send({ t: 'otAi', messages: hist, spec: formSpec() });
    if (inp) inp.value = '';
    paint();
  };
  K.acts.otAiApply = () => {
    if (A.spec && K.otApplySpec && K.otApplySpec(A.spec)) window.CaroConfirm.info(T('ot_io_ok'));
  };

  // Vào trang tạo giải: hỏi máy chủ trợ lý có bật không (và còn mấy lượt hôm nay)
  const enter = K.enter.otNew;
  K.enter.otNew = () => { if (enter) enter(); if (O.connected) O.send({ t: 'otAiInfo' }); };
  O.on('otAiInfo', (m) => { A.on = !!m.on && !!m.login; A.left = m.left || 0; if (K.V.page === 'otNew') paint(); });
  O.on('otAi', (m) => {
    A.pending = false;
    A.log.push({ role: 'assistant', text: m.reply || '…' });
    A.spec = m.spec || null;
    A.specError = m.specError || null;
    A.left = Math.max(0, A.left - 1);
    if (K.V.page === 'otNew') paint();
  });
  O.on('error', (m) => {
    if (m.ctx !== 'otAi') return;
    A.pending = false;
    A.err = T('srv_' + m.code, m.args || {});
    if (K.V.page === 'otNew') paint();
  });
  window.CaroOTourAi = { state: A };
})();
