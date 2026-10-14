/*
 * Lịch sử đấu TRÊN MÁY NÀY: kho ván đã chơi lưu trong bộ nhớ của trình duyệt / app trên chính thiết bị (localStorage),
 * không gửi lên máy chủ – dùng được cả khi không có mạng, khi chơi bằng tài khoản khách, khi chơi với máy.
 * Chỉ phần lưu trữ (không đụng DOM) – giao diện: local-history.js (danh sách), local-save.js (hỏi lưu, cài đặt).
 *
 * Khoá trong localStorage (đều bắt đầu bằng "caro.lg."):
 *   caro.lg.index    – danh sách ván (thông tin tóm tắt, mới nhất trước)
 *   caro.lg.g.<id>   – nước đi + kết quả phân tích của từng ván (tách riêng để mở danh sách không phải đọc cả kho)
 *   caro.lg.set      – cài đặt { on: lưu lịch sử trên máy, ask: hỏi trước khi lưu }
 *   caro.lg.pending  – ván vừa xong đang chờ người chơi trả lời "có lưu không"
 * Xoá ván = xoá hẳn các khoá đó khỏi máy (không còn bản nào, không cần thêm bước nào).
 * Giữ tối đa MAX ván (ván cũ nhất tự xoá); bộ nhớ đầy thì bỏ phần phân tích của ván cũ trước, rồi tới ván cũ.
 *
 * Dùng chung trình duyệt (window.CaroLocalGames) và Node (kiểm thử: caro/tests/local-games.test.js).
 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.CaroLocalGames = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PRE = 'caro.lg.';
  const K = { index: PRE + 'index', set: PRE + 'set', pending: PRE + 'pending', game: (id) => PRE + 'g.' + id };
  const MAX = 200;
  const DEFAULTS = { on: true, ask: true };
  // Thông tin tóm tắt giữ trong danh sách (nước đi + phân tích nằm ở khoá riêng của ván)
  const META = ['id', 'at', 'kind', 'bot', 'me', 'x', 'o', 'winner', 'reason', 'rule', 'timeLimit', 'clock', 'n', 'an'];

  const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
  const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);

  /** Ván hợp lệ để lưu: có nước đi (mảng [x, y] số nguyên) và kết quả. */
  function valid(rec) {
    return !!rec && Array.isArray(rec.moves) && rec.moves.length > 0 && rec.moves.length <= 2000 &&
      rec.moves.every((m) => Array.isArray(m) && Number.isInteger(m[0]) && Number.isInteger(m[1])) && [1, 2, 3].includes(rec.winner);
  }

  /** storage: đối tượng kiểu localStorage (getItem / setItem / removeItem). now: hàm lấy giờ (kiểm thử). */
  function create(storage, now) {
    now = now || Date.now;
    const read = (k, d) => {
      try { const v = storage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    };
    const raw = (k) => { try { return storage.getItem(k); } catch (e) { return null; } };
    const write = (k, v) => storage.setItem(k, JSON.stringify(v)); // ném lỗi khi bộ nhớ đầy – nơi gọi xử lý
    const drop = (k) => { try { storage.removeItem(k); } catch (e) { /* bỏ qua */ } };

    const index = () => { const a = read(K.index, []); return Array.isArray(a) ? a.filter((g) => g && g.id) : []; };

    /** Ghi được thì thôi; bộ nhớ đầy thì giải phóng dần (phân tích ván cũ → ván cũ nhất) rồi thử lại. */
    function writeFreeing(key, val, keepId) {
      for (;;) {
        try { write(key, val); return true; } catch (e) {
          if (!isQuota(e) || !freeSome(keepId)) return false;
        }
      }
    }
    function freeSome(keepId) {
      const list = index();
      for (let i = list.length - 1; i >= 0; i--) {
        const g = list[i];
        if (g.id === keepId || !g.an) continue;
        const d = read(K.game(g.id), null);
        if (d) { d.analysis = null; try { write(K.game(g.id), d); } catch (e) { /* vẫn đầy */ } }
        g.an = false;
        saveIndex(list);
        return true;
      }
      const old = list.filter((g) => g.id !== keepId).pop();
      if (!old) return false;
      drop(K.game(old.id));
      saveIndex(list.filter((g) => g.id !== old.id));
      return true;
    }
    function saveIndex(list) {
      try { write(K.index, list); } catch (e) { /* danh sách nhỏ – hiếm khi đầy; ván vẫn đọc được từ khoá riêng */ }
    }

    const api = {
      MAX,
      /** Cài đặt: { on, ask }. */
      settings() { return { ...DEFAULTS, ...read(K.set, {}) }; },
      setSettings(patch) { const s = { ...api.settings(), ...patch }; try { write(K.set, s); } catch (e) { /* riêng tư */ } return s; },

      /** Danh sách ván (tóm tắt), mới nhất trước. */
      list() { return index(); },
      count() { return index().length; },

      /** Một ván đầy đủ: tóm tắt + moves + analysis (null nếu chưa phân tích / đã bị bỏ khi bộ nhớ đầy). */
      get(id) {
        const meta = index().find((g) => g.id === id);
        const d = meta && read(K.game(id), null);
        return d && Array.isArray(d.moves) ? { ...meta, moves: d.moves, analysis: d.analysis || null } : null;
      },

      /** Lưu một ván vừa xong. Trả về id, hoặc null nếu không lưu được. Cùng một ván (cùng nước đi + giờ kết thúc) không lưu 2 lần. */
      add(rec) {
        if (!valid(rec)) return null;
        const at = Number(rec.at) || now();
        const list = index();
        const same = list.find((g) => g.at === at && g.n === rec.moves.length && g.rule === (rec.rule || 'vn'));
        if (same) return same.id;
        const id = at.toString(36) + Math.random().toString(36).slice(2, 6);
        const meta = pick({ ...rec, id, at, rule: rec.rule || 'vn', n: rec.moves.length, an: !!rec.analysis }, META);
        if (!writeFreeing(K.game(id), { moves: rec.moves, analysis: rec.analysis || null }, id)) return null;
        for (;;) {
          // Dựng lại danh sách mỗi lần thử: freeSome có thể vừa bỏ bớt ván cũ
          const next = [meta].concat(index());
          const extra = next.splice(MAX); // quá MAX ván: bỏ ván cũ nhất
          try {
            write(K.index, next);
            for (const g of extra) drop(K.game(g.id));
            return id;
          } catch (e) {
            if (!isQuota(e) || !freeSome(id)) { drop(K.game(id)); return null; }
          }
        }
      },

      /** Gắn kết quả phân tích vào ván đã lưu (mở lại không phải phân tích lại). */
      setAnalysis(id, analysis) {
        const list = index();
        const meta = list.find((g) => g.id === id);
        const d = meta && read(K.game(id), null);
        if (!d) return false;
        d.analysis = analysis || null;
        if (!writeFreeing(K.game(id), d, id)) return false;
        const fresh = index(); // freeSome có thể đã đổi danh sách
        const m2 = fresh.find((g) => g.id === id);
        if (m2) { m2.an = !!analysis; saveIndex(fresh); }
        return true;
      },

      /** Ván đã lưu có cùng luật + nước đi (để gắn phân tích khi người chơi phân tích ván vừa chơi). */
      findByMoves(rule, moves) {
        const s = JSON.stringify(moves);
        for (const g of index()) {
          if (g.rule !== (rule || 'vn') || g.n !== moves.length) continue;
          const d = read(K.game(g.id), null);
          if (d && JSON.stringify(d.moves) === s) return g.id;
        }
        return null;
      },

      /** Xoá hẳn các ván (mảng id) khỏi máy. Trả về số ván đã xoá. */
      remove(ids) {
        const set = new Set(ids || []);
        const list = index();
        const keep = list.filter((g) => !set.has(g.id));
        for (const g of list) if (set.has(g.id)) drop(K.game(g.id));
        saveIndex(keep);
        return list.length - keep.length;
      },

      /** Xoá toàn bộ lịch sử đấu trên máy (giữ cài đặt). */
      clear() {
        const n = api.remove(index().map((g) => g.id));
        drop(K.index);
        drop(K.pending);
        return n;
      },

      /** Dung lượng đang dùng (byte – localStorage lưu chuỗi UTF-16: 2 byte mỗi ký tự). */
      usage() {
        const list = index();
        let chars = 0;
        const add = (k) => { const v = raw(k); if (v != null) chars += k.length + v.length; };
        add(K.index);
        add(K.pending);
        for (const g of list) add(K.game(g.id));
        return { games: list.length, bytes: chars * 2, analyzed: list.filter((g) => g.an).length };
      },

      // Ván vừa xong chờ hỏi "có lưu không" (còn giữ khi đóng app giữa chừng: lần mở sau hỏi tiếp)
      pending() { const p = read(K.pending, null); return valid(p) ? p : null; },
      setPending(rec) {
        if (!rec) return drop(K.pending);
        try { write(K.pending, rec); } catch (e) { /* đầy: lần này không giữ được */ }
      },
    };
    return api;
  }

  return { create, MAX, KEYS: K, valid };
});
