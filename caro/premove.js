/*
 * Đặt trước nước đi (premove – ý tưởng từ Lichess, tự viết lại, không dùng code của họ). Ván online đang đánh mà chưa
 * tới lượt mình (đối thủ đang nghĩ, hoặc nước vừa đi còn chờ máy chủ xác nhận): chạm một ô trống để đặt trước – bàn hiện
 * quân mờ viền tròn đứt (board-view.js). Bản tin phòng mới báo tới lượt mình mà ô vẫn trống thì đánh ngay, không chờ
 * người chơi bấm (bớt hẳn một lượt chờ mạng ở ván nhanh). Ô đã bị chiếm / ván xong / sang ván khác thì tự huỷ.
 * Chạm lại đúng ô để huỷ, chạm ô khác để đổi. Không dùng khi xem ván và ở giai đoạn khai cuộc Swap2.
 * Bật / tắt: Cài đặt → Bàn cờ (khoá caro.premove, mặc định bật).
 *
 *   window.CaroPremove = { enabled, setEnabled(on), canSet(), tap(x, y), cell(), afterRoom(), clear(), init(env) }
 *   app.js gọi init({ state, canPlaceNow, play, requestDraw, vibrate }) một lần.
 */
(function () {
  'use strict';
  const KEY = 'caro.premove';
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== '0'; } catch (e) { /* chế độ riêng tư: giữ mặc định */ }
  let env = null;
  let cell = null, gameKey = ''; // ô đặt trước [x, y] và ván (mã phòng + số ván) lúc đặt

  const keyOf = (r) => r.code + ':' + r.gameNo;
  const empty = (x, y) => env.state.board.get(x, y) === window.Caro.EMPTY;

  /** Đang chơi online, ván đang diễn ra, chưa tới lượt mình: chạm ô là đặt trước. */
  function canSet() {
    if (!enabled || !env) return false;
    const { state } = env;
    const o = state.online;
    if (!o || o.watch || state.replay || state.ext) return false;
    const r = o.room;
    if (!r || r.players.length !== 2 || r.winner || r.seriesWinner || r.phase) return false;
    return !env.canPlaceNow();
  }

  function clear() {
    if (!cell) return;
    cell = null;
    if (env) env.requestDraw();
  }

  /** Chạm ô (x, y) lúc chưa tới lượt: đặt / đổi / huỷ ô đặt trước. Trả về true nếu cú chạm đã được dùng. */
  function tap(x, y) {
    if (!canSet()) return false;
    if (!empty(x, y)) return true;
    if (cell && cell[0] === x && cell[1] === y) cell = null;
    else { cell = [x, y]; gameKey = keyOf(env.state.online.room); }
    env.vibrate(5);
    env.requestDraw();
    return true;
  }

  /** Ô đặt trước còn hiệu lực (để vẽ), hoặc null. */
  function current() {
    if (!cell || !env) return null;
    const o = env.state.online;
    if (!o || o.watch || o.room.winner || keyOf(o.room) !== gameKey || !empty(cell[0], cell[1])) return null;
    return cell;
  }

  /** Gọi sau mỗi bản tin phòng: tới lượt mình thì đánh ô đặt trước, hết hiệu lực thì huỷ. */
  function afterRoom() {
    if (!cell || !env) return;
    if (!current() || env.state.online.room.phase) return clear();
    if (!env.canPlaceNow()) return; // vẫn chưa tới lượt (vd. máy chủ vừa xác nhận nước trước của mình)
    const [x, y] = cell;
    cell = null;
    env.play(x, y);
  }

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) { /* chế độ riêng tư */ }
    if (!enabled) clear();
  }

  window.CaroPremove = {
    get enabled() { return enabled; },
    setEnabled, canSet, tap, cell: current, afterRoom, clear,
    init(e) { env = e; },
  };
})();
