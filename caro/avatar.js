/*
 * Ảnh đại diện: hiện ảnh (ảnh đã tải lên > chữ cái đầu tên) và đổi ảnh.
 * Ảnh được cắt vuông, thu nhỏ còn 128×128 và nén (WebP, trình duyệt không hỗ trợ thì JPEG) ngay trên máy người chơi,
 * tối đa 10 KB – máy chủ chỉ kiểm và lưu ảnh nhỏ (server/src/avatar.js), không tốn sức xử lý ảnh.
 *
 *   CaroAvatar.html(p, cls) – HTML ảnh của người chơi p ({ id | uid, name, av }); cls: lớp thêm (vd. 'sm')
 *   CaroAvatar.url(p)       – đường dẫn ảnh, hoặc '' nếu chưa có ảnh
 *   CaroAvatar.pick()       – mở chọn ảnh, thu nhỏ, gửi lên (cần đăng nhập)
 *   CaroAvatar.clear()      – xoá ảnh
 *   CaroAvatar.view(p)      – mở xem ảnh lớn của người chơi p (của mình hay người khác đều được)
 *
 * Bấm vào bất kỳ ảnh đại diện nào đang hiện ảnh thật (hồ sơ, tài khoản, bạn bè, thẻ người chơi trên bàn cờ…)
 * cũng mở xem lớn, trừ khi ảnh nằm trong một nút bấm (giữ nguyên hành vi của nút đó).
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const SIDE = 128;
  const MAX_BYTES = 10 * 1024; // như máy chủ (server/src/avatar.js)
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function url(p) {
    const O = window.CaroOnline;
    const uid = p && (p.uid || p.id);
    if (!p || !p.av || !O || typeof uid !== 'string' || !/^[0-9a-f]{16}$/.test(uid)) return '';
    return (O.base || '') + '/api/avatar/' + uid + '?v=' + encodeURIComponent(p.av);
  }

  function html(p, cls = '') {
    const letter = esc(((p && p.name) || '?').trim().charAt(0).toUpperCase() || '?');
    const u = url(p);
    return `<span class="avatar ${esc(cls)}"${u ? ` data-avname="${esc((p && p.name) || '')}" title="${esc(T('av_view'))}"` : ''}>${u ? `<img src="${esc(u)}" alt="" loading="lazy" decoding="async">` : ''}<b>${letter}</b></span>`;
  }

  // ------------------------------------------------------------ Xem ảnh lớn
  // Khung xem là <dialog> mở bằng showModal(): phải vậy mới nổi lên trên các hộp thoại modal khác
  // (vd. hồ sơ người chơi là dialog thật) – div thường dù z-index cao vẫn thua "top layer" của dialog.
  let viewer = null;
  /** Đóng khung xem ảnh lớn (nếu đang mở). */
  function closeView() { if (viewer) { viewer.remove(); viewer = null; } }
  /** Mở khung xem ảnh lớn từ đường dẫn ảnh + tên người chơi. */
  function openView(src, name) {
    if (!src) return;
    closeView();
    viewer = document.createElement('dialog');
    viewer.className = 'av-view';
    viewer.setAttribute('aria-label', T('av_view'));
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = src;
    img.alt = name || '';
    fig.appendChild(img);
    if (name) {
      const cap = document.createElement('figcaption');
      cap.textContent = name;
      fig.appendChild(cap);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'av-x';
    btn.setAttribute('aria-label', T('close'));
    btn.textContent = '✕';
    btn.onclick = closeView;
    viewer.append(fig, btn);
    // Bấm ra ngoài khung ảnh (trúng chính phần dialog, vùng đệm) thì đóng; 'close' tự dọn dẹp.
    viewer.addEventListener('click', (e) => { if (e.target === viewer) closeView(); });
    viewer.addEventListener('close', closeView);
    document.body.appendChild(viewer);
    if (viewer.showModal) viewer.showModal(); // Esc tự đóng (sự kiện close) – không cần bắt phím riêng
    btn.focus();
  }
  /** Xem ảnh lớn của người chơi p ({ id | uid, name, av }). Chưa có ảnh thì không làm gì. */
  function view(p) { const u = url(p); if (u) openView(u, (p && p.name) || ''); }

  // Bấm vào ảnh đại diện đang hiện ảnh thật → xem lớn. Ảnh nằm trong nút bấm thì để nút đó tự xử lý
  // (nút tài khoản trên thanh trên, ô chọn người chơi…), tránh phá các luồng bấm hiện có.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('.avatar');
    if (!a || !a.querySelector(':scope > img')) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    openView(a.querySelector(':scope > img').src, a.dataset.avname || '');
  });
  // Ảnh lỗi (đã xoá, mất mạng): bỏ ảnh, hiện lại chữ cái (CSP không cho thuộc tính onerror)
  document.addEventListener('error', (e) => { if (e.target.matches && e.target.matches('.avatar > img')) e.target.remove(); }, true);

  /** Đọc file ảnh → canvas vuông SIDE×SIDE (cắt giữa). */
  async function square(file) {
    let src;
    try {
      src = await createImageBitmap(file);
    } catch (e) {
      // Trình duyệt cũ: qua thẻ <img>
      src = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }
    const w = src.width, h = src.height, s = Math.min(w, h);
    if (!s) throw new Error('empty');
    const c = document.createElement('canvas');
    c.width = c.height = SIDE;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#fff'; // ảnh trong suốt → nền trắng (JPEG không có kênh trong suốt)
    g.fillRect(0, 0, SIDE, SIDE);
    g.drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, SIDE, SIDE);
    if (src.close) src.close();
    return c;
  }

  const blobOf = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));

  /** Nén canvas tới khi ≤ MAX_BYTES: WebP rồi JPEG, giảm dần chất lượng. */
  async function encode(c) {
    for (const type of ['image/webp', 'image/jpeg']) {
      for (const q of [0.82, 0.7, 0.55, 0.4]) {
        const b = await blobOf(c, type, q);
        if (!b || b.type !== type) break; // trình duyệt không nén được loại này (Safari cũ trả PNG)
        if (b.size <= MAX_BYTES) return b;
      }
    }
    return null;
  }

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

  function pick() {
    const O = window.CaroOnline;
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      let blob;
      try {
        blob = await encode(await square(file));
      } catch (e) {
        return O.toast(T('av_bad_file'));
      }
      if (!blob) return O.toast(T('av_too_big'));
      O.send({ t: 'avatarSet', data: await toBase64(blob) });
    };
    inp.click();
  }

  function clear() { window.CaroOnline.send({ t: 'avatarClear' }); }

  window.CaroAvatar = { html, url, pick, clear, view, SIDE, MAX_BYTES };
})();
