/*
 * Giải đấu Offline – trợ lý AI trong form tạo giải (máy chủ: server/src/hub/otour-ai.js): người dùng tả giải bằng lời, trợ
 * lý trả lời + đề xuất bản cấu hình; form xem trước bằng lời (describeSpec), người dùng bấm "Dùng cấu hình này" mới áp vào
 * form (K.otApplySpec – otour-tpl.js), rồi vẫn tự sửa / tự bấm tạo giải.
 * Hai cách: AI của máy chủ (mặc định Muse Spark – có trần lượt / ngày) hoặc khoá API riêng của người dùng (Muse, Claude,
 * OpenAI, Gemini, DeepSeek, OpenRouter – caro/otour-ai-providers.js): khoá chỉ nằm trên máy người dùng (localStorage nếu
 * chọn "Nhớ", không thì chỉ trong phiên này), gửi kèm từng lần hỏi; máy chủ chỉ dùng cho lần gọi đó, không lưu.
 * Khung hội thoại tự vẽ lại riêng (#otai-chat) – không vẽ lại cả form, không mất chữ đang gõ ở phần cài đặt khoá.
 *   K.otAiHtml() – chỗ đặt khung ở đầu form tạo giải (otour.js – pageNew). Chỉ hiện cho người đã đăng nhập.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const IO = window.CaroOTourSpecIO;
  const PV = window.CaroOTourAiProviders;
  if (!K || !IO || !PV) return;
  const { O, T, esc, $ } = K;
  const MAX_TURNS = 12; // như máy chủ
  const STORE = 'caro.aiOwn';
  const A = { on: false, provider: null, left: 0, login: false, log: [], pending: false, spec: null, specError: null, err: '', own: null };
  // Khoá riêng đã nhớ trên máy này (localStorage có thể bị chặn: chỉ dùng trong phiên)
  try { const x = JSON.parse(localStorage.getItem(STORE) || 'null'); if (x && PV.PROVIDERS[x.provider] && PV.keyOk(x.key)) A.own = { ...x, remember: true }; } catch (e) { /* bỏ qua */ }

  const pname = (p) => (PV.PROVIDERS[p] ? PV.PROVIDERS[p].name : p);
  const canSend = () => !A.pending && (A.own || (A.on && A.left > 0));

  K.otAiHtml = () => `<div id="otai" class="ot-sec ot-ai" ${A.login ? '' : 'hidden'}><div id="otai-chat">${A.login ? chat() : ''}</div>${A.login ? ownHtml() : ''}</div>`;

  function chat() {
    const log = A.log.map((m) => `<li class="${esc(m.role)}">${esc(m.text)}</li>`).join('');
    const prev = A.spec ? `<div class="ot-ai-spec"><b>${esc(T('ot_ai_spec'))}</b><ul>${IO.describeSpec(A.spec, T).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <button type="button" class="primary sm" data-act="otAiApply">${esc(T('ot_ai_apply'))}</button></div>` : '';
    const using = A.own ? T('ot_ai_using_own', { name: pname(A.own.provider), model: PV.cleanModel(A.own.provider, A.own.model) })
      : A.on ? T('ot_ai_using_srv', { name: pname(A.provider), n: A.left }) : T('ot_ai_need_key');
    return `<h4>🤖 ${esc(T('ot_ai'))}</h4>
      ${A.log.length ? `<ol class="ot-ai-log">${log}</ol>` : `<p class="hint">${esc(T('ot_ai_hint'))}</p>`}
      ${A.pending ? `<p class="hint">${esc(T('ot_ai_wait'))}</p>` : ''}${prev}
      ${A.specError ? `<p class="err">${esc(T(A.specError))}</p>` : ''}<p class="err">${esc(A.err)}</p>
      <textarea id="otai-in" rows="2" maxlength="2000" placeholder="${esc(T('ot_ai_ph'))}" ${A.pending ? 'disabled' : ''}></textarea>
      <div class="row"><button type="button" class="primary sm" data-act="otAiSend" ${canSend() ? '' : 'disabled'}>${esc(T('ot_ai_send'))}</button>
        <small class="muted">${esc(using)} · ${esc(T('ot_ai_note'))}</small></div>`;
  }

  /** Phần "Dùng khoá API của riêng bạn" (mở sẵn khi máy chủ chưa bật AI và chưa có khoá riêng). */
  function ownHtml() {
    const o = A.own || { provider: 'muse', key: '', model: '' };
    const p = PV.PROVIDERS[o.provider] || PV.PROVIDERS.muse;
    return `<details class="ot-ai-own" id="otai-own" ${!A.on && !A.own ? 'open' : ''}><summary>${esc(T('ot_ai_own'))}${A.own ? ' ✓' : ''}</summary>
      <p class="hint">${esc(T('ot_ai_own_hint'))}</p>
      <div class="row ot-ai-own-row">
        <label class="field inline"><span>${esc(T('ot_ai_provider'))}</span><select id="otai-prov">${Object.keys(PV.PROVIDERS).map((k) => `<option value="${esc(k)}" ${k === o.provider ? 'selected' : ''}>${esc(pname(k))}</option>`).join('')}</select></label>
        <label class="field inline"><span>${esc(T('ot_ai_model'))}</span><input id="otai-model" maxlength="80" autocomplete="off" spellcheck="false" value="${esc(o.model || '')}" placeholder="${esc(p.model)}"></label>
      </div>
      <label class="field"><span>${esc(T('ot_ai_key'))} · <a id="otai-getkey" href="${esc(p.keyUrl)}" target="_blank" rel="noopener noreferrer">${esc(T('ot_ai_getkey'))}</a></span>
        <input id="otai-key" type="password" autocomplete="off" spellcheck="false" maxlength="300" value="${esc(o.key || '')}"></label>
      <label class="check"><input type="checkbox" id="otai-remember" ${o.remember ? 'checked' : ''}> <span>${esc(T('ot_ai_remember'))}</span></label>
      <p class="err" id="otai-own-err"></p>
      <div class="row"><button type="button" class="ghost sm" data-act="otAiOwnSave">${esc(T('ot_ai_save'))}</button>
        ${A.own ? `<button type="button" class="ghost sm danger" data-act="otAiOwnClear">${esc(T('ot_ai_clear'))}</button>` : ''}</div></details>`;
  }

  /** Vẽ lại riêng phần hội thoại (giữ chữ đang gõ trong ô hỏi). */
  function paint() {
    const box = $('otai');
    if (!box) return;
    box.hidden = !A.login;
    const c = $('otai-chat');
    if (!c) return;
    const typed = $('otai-in') ? $('otai-in').value : '';
    c.innerHTML = A.login ? chat() : '';
    const inp = $('otai-in');
    if (inp && typed && !A.pending) inp.value = typed;
    // Lần đầu biết đã đăng nhập (khung vẽ khi chưa có thông tin): dựng phần cài đặt khoá
    if (A.login && !$('otai-own')) c.insertAdjacentHTML('afterend', ownHtml());
  }
  /** Bản cấu hình đang có trên form – trợ lý sửa tiếp từ đây. */
  function formSpec() {
    const fm = K.otForm;
    if (!fm || !fm.F || !fm.F.d) return null;
    fm.collect();
    const F = fm.F;
    return { sport: F.d.sport, result: F.d.result, ...(F.d.result === 'sets' ? { set: F.d.set } : {}), stages: F.stages, ...(F.d.esports ? { esports: F.d.esports } : {}) };
  }

  K.acts.otAiSend = () => {
    const inp = $('otai-in');
    const text = inp ? inp.value.trim() : '';
    if (!text || !canSend()) return;
    A.log.push({ role: 'user', text });
    A.err = '';
    A.pending = true;
    // Gửi các lượt gần nhất, bắt đầu bằng tin của người dùng (máy chủ chỉ nhận tối đa MAX_TURNS lượt)
    let hist = A.log.slice(-MAX_TURNS);
    while (hist.length && hist[0].role !== 'user') hist = hist.slice(1);
    O.send({ t: 'otAi', messages: hist, spec: formSpec(), ...(A.own ? { own: { provider: A.own.provider, key: A.own.key, model: A.own.model || '' } } : {}) });
    if (inp) inp.value = '';
    paint();
  };
  K.acts.otAiApply = () => {
    if (A.spec && K.otApplySpec && K.otApplySpec(A.spec)) window.CaroConfirm.info(T('ot_io_ok'));
  };
  K.acts.otAiOwnSave = () => {
    const provider = $('otai-prov').value, key = $('otai-key').value.trim(), model = $('otai-model').value.trim(), remember = $('otai-remember').checked;
    if (!PV.PROVIDERS[provider] || !PV.keyOk(key)) { $('otai-own-err').textContent = T('srv_ot_ai_key_bad'); return; }
    A.own = { provider, key, model, remember };
    try { if (remember) localStorage.setItem(STORE, JSON.stringify({ provider, key, model })); else localStorage.removeItem(STORE); } catch (e) { /* chỉ dùng trong phiên */ }
    $('otai-own-err').textContent = '';
    $('otai-own').open = false;
    $('otai-own').querySelector('summary').textContent = T('ot_ai_own') + ' ✓';
    paint();
    window.CaroConfirm.info(T('ot_ai_saved', { name: pname(provider) }));
  };
  K.acts.otAiOwnClear = () => {
    A.own = null;
    try { localStorage.removeItem(STORE); } catch (e) { /* bỏ qua */ }
    const box = $('otai-own');
    if (box) box.outerHTML = ownHtml();
    paint();
  };
  // Đổi nhà cung cấp: gợi ý model mặc định + link lấy khoá của nhà cung cấp đó (lắng nghe chung – phần cài đặt có thể được
  // chèn sau khi form đã vẽ)
  document.addEventListener('change', (e) => {
    if (!e.target || e.target.id !== 'otai-prov') return;
    const p = PV.PROVIDERS[e.target.value];
    if (!p) return;
    $('otai-model').placeholder = p.model;
    $('otai-getkey').href = p.keyUrl;
  });

  // Vào trang tạo giải: hỏi máy chủ trợ lý có bật không (và còn mấy lượt hôm nay)
  const enter = K.enter.otNew;
  K.enter.otNew = () => { if (enter) enter(); if (O.connected) O.send({ t: 'otAiInfo' }); };
  O.on('otAiInfo', (m) => { Object.assign(A, { on: !!m.on, provider: m.provider || null, left: m.left || 0, login: !!m.login }); if (K.V.page === 'otNew') paint(); });
  O.on('otAi', (m) => {
    A.pending = false;
    A.log.push({ role: 'assistant', text: m.reply || '…' });
    A.spec = m.spec || null;
    A.specError = m.specError || null;
    if (!A.own) A.left = Math.max(0, A.left - 1);
    if (K.V.page === 'otNew') paint();
  });
  O.on('error', (m) => {
    if (m.ctx !== 'otAi') return;
    A.pending = false;
    A.err = T('srv_' + m.code, m.args || {});
    if (K.V.page === 'otNew') paint();
  });
  // Mất kết nối giữa lúc chờ trả lời: kết nối lại thì mở khoá nút Gửi (câu trả lời cũ không về nữa) và hỏi lại thông tin
  O.on('welcome', () => {
    if (A.pending) { A.pending = false; A.err = T('ot_ai_lost'); }
    if (K.V.page === 'otNew') { O.send({ t: 'otAiInfo' }); paint(); }
  });
  window.CaroOTourAi = { state: A };
})();
