/*
 * Ảnh đại diện: hiện ảnh (ảnh đã tải lên > chữ cái đầu tên) và đổi ảnh.
 * Ảnh được cắt vuông, thu nhỏ còn 128×128 và nén (WebP, trình duyệt không hỗ trợ thì JPEG) ngay trên máy người chơi,
 * tối đa 10 KB – máy chủ chỉ kiểm và lưu ảnh nhỏ (server/src/avatar.js), không tốn sức xử lý ảnh.
 *
 *   CaroAvatar.html(p, cls) – HTML ảnh của người chơi p ({ id | uid, name, av }); cls: lớp thêm (vd. 'sm')
 *   CaroAvatar.url(p)       – đường dẫn ảnh, hoặc '' nếu chưa có ảnh
 *   CaroAvatar.pick()       – mở chọn ảnh, thu nhỏ, gửi lên (cần đăng nhập)
 *   CaroAvatar.clear()      – xoá ảnh
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
    return `<span class="avatar ${esc(cls)}">${u ? `<img src="${esc(u)}" alt="" loading="lazy" decoding="async">` : ''}<b>${letter}</b></span>`;
  }
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

  window.CaroAvatar = { html, url, pick, clear, SIDE, MAX_BYTES };
})();
