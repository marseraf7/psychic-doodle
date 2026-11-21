"""
Làm sạch dữ liệu tự đấu .binpack(.lz4) của Rapfi-CARO trước khi huấn luyện (điều tra 21/11/2026,
docs/nnue-caro-dieu-tra-21-11-2026.md):
  1. Bỏ ván trùng – cùng chuỗi nước sau 8 phép xoay / lật bàn. Tự đấu cũ (số nút cố định) là tất định: lô dùng sách khai
     cuộc ~600 thế cho phần lớn là bản sao; học lại cùng ván hàng chục lần = học thuộc, val_loss tăng từ trước một epoch.
     Ván ở file đứng trước được giữ – đặt file ván kiểm tra (val) lên trước để ván của val không còn trong tập học.
  2. Bỏ ván có nước "không điểm" xen giữa các nước có điểm: dấu vết của lỗi Rapfi-CARO chưa xong độ sâu 1 (VALUE_NONE) –
     ván bị xử thua cho bên tới lượt và ghi một nước vô nghĩa (đã sửa bằng rapfi-caro-selfplay.patch). Ván không có điểm
     nào (chuyển từ jsonl bằng games-to-binpack.js) vẫn giữ.
  3. (tuỳ chọn) --rule / --size: chỉ giữ ván đúng luật (mã 7 = caro) và cỡ bàn.
  python3 clean-binpack.py <thư mục ra> <file vào …>      → mỗi file vào một file ra cùng tên (bỏ file không còn ván nào)
  python3 clean-binpack.py --self-test
Định dạng (như pytorch-nnue-trainer dataset/packed_binary.py): đầu ván 8 byte (boardSize:5 rule:3 result:4 totalPly:10
initPly:10 gameTag:14 moveCount:18), initPly × uint16 nước khai cuộc, moveCount × 4 byte nước (cờ:6 move:10, eval int16).
Đọc / ghi .lz4 cần gói lz4 (bộ huấn luyện có sẵn); file không nén thì không cần.
"""
import os
import struct
import sys


def _open(path, mode):
    if path.endswith(".lz4"):
        import lz4.frame  # chỉ cần khi file nén
        return lz4.frame.open(path, mode)
    return open(path, mode)


def read_games(data):
    """Tách bytes của một file thành [(đầu ván, khai cuộc [u16], nước [(cờ+move u16, eval i16)], bytes thô)]."""
    out, off = [], 0
    while off + 8 <= len(data):
        lo, hi = struct.unpack_from("<II", data, off)
        board, rule, result = lo & 31, (lo >> 5) & 7, (lo >> 8) & 15
        init_ply, move_count = (lo >> 22) & 1023, (hi >> 14) & 0x3FFFF
        size = 8 + 2 * init_ply + 4 * move_count
        if off + size > len(data):
            raise ValueError("file cụt giữa một ván")
        init = list(struct.unpack_from(f"<{init_ply}H", data, off + 8))
        moves = [struct.unpack_from("<Hh", data, off + 8 + 2 * init_ply + 4 * i) for i in range(move_count)]
        out.append(({"board": board, "rule": rule, "result": result}, init, moves, data[off:off + size]))
        off += size
    return out


def canon_key(board, seq):
    """Khoá của chuỗi nước (u16: x << 5 | y) dưới 8 phép xoay / lật bàn board × board."""
    best = None
    for t in range(8):
        r = []
        for m in seq:
            x, y = m >> 5, m & 31
            for _ in range(t & 3):
                x, y = y, board - 1 - x
            if t & 4:
                x = board - 1 - x
            r.append(x << 5 | y)
        r = tuple(r)
        if best is None or r < best:
            best = r
    return best


def bad_eval(moves):
    """Có nước chính không điểm (isNoEval) trong khi nước khác có điểm – dấu vết lỗi VALUE_NONE."""
    first = [(f, e) for f, e in moves if f & 1]  # isFirst: nước chính của nhóm multipv
    noeval = [bool(f & 4) for f, _ in first]
    return any(noeval) and not all(noeval)


def clean(files, out_dir, rule=7, size=20, seen=None):
    """Làm sạch files vào out_dir; seen (set) dùng chung giữa nhiều lần gọi để bỏ trùng giữa val và tập học."""
    seen = set() if seen is None else seen
    stats = {"games": 0, "kept": 0, "dup": 0, "bad_eval": 0, "other": 0}
    os.makedirs(out_dir, exist_ok=True)
    for path in files:
        with _open(path, "rb") as f:
            games = read_games(f.read())
        keep = []
        for head, init, moves, raw in games:
            stats["games"] += 1
            if (rule is not None and head["rule"] != rule) or (size is not None and head["board"] != size):
                stats["other"] += 1
                continue
            if bad_eval(moves):
                stats["bad_eval"] += 1
                continue
            seq = init + [(f >> 6) & 1023 for f, _ in moves if f & 1 and not f & 8]
            key = (head["board"], canon_key(head["board"], seq))
            if key in seen:
                stats["dup"] += 1
                continue
            seen.add(key)
            keep.append(raw)
        stats["kept"] += len(keep)
        if keep:
            with _open(os.path.join(out_dir, os.path.basename(path)), "wb") as f:
                f.write(b"".join(keep))
    return stats


def _pack(init, moves, result=2, rule=7, board=20):
    """Một ván giả để tự kiểm: moves = [(x, y, eval hoặc None)]."""
    lo = board | rule << 5 | result << 8 | (len(init) + len(moves)) << 12 | len(init) << 22
    hi = (lo >> 32) | len(moves) << 14
    buf = struct.pack("<II", lo & 0xFFFFFFFF, hi) + struct.pack(f"<{len(init)}H", *[x << 5 | y for x, y in init])
    for x, y, e in moves:
        buf += struct.pack("<Hh", 1 | 2 | (4 if e is None else 0) | (x << 5 | y) << 6, 0 if e is None else e)
    return buf


def self_test():
    import tempfile
    a = _pack([(9, 9)], [(10, 10, 5), (9, 10, -3)])
    mirror = _pack([(10, 9)], [(9, 10, 5), (10, 10, -3)])  # lật trái phải của ván a trên bàn 20×20
    bad = _pack([(9, 9)], [(11, 11, 7), (1, 0, None)])  # nước cuối không điểm: lỗi VALUE_NONE
    noeval = _pack([(9, 9)], [(12, 12, None), (12, 13, None)])  # ván chuyển từ jsonl: không có điểm nào
    other = _pack([(9, 9)], [(13, 13, 1)], rule=0)
    with tempfile.TemporaryDirectory() as d:
        p1, p2 = os.path.join(d, "v.binpack"), os.path.join(d, "t.binpack")
        open(p1, "wb").write(a)
        open(p2, "wb").write(mirror + bad + noeval + other + a)
        st = clean([p1, p2], os.path.join(d, "out"))
        assert st == {"games": 6, "kept": 2, "dup": 2, "bad_eval": 1, "other": 1}, st
        kept = read_games(open(os.path.join(d, "out", "t.binpack"), "rb").read())
        assert len(kept) == 1 and kept[0][3] == noeval
    print("clean-binpack: tự kiểm OK")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif len(sys.argv) >= 3:
        s = clean(sys.argv[2:], sys.argv[1])
        print(f"{s['games']} ván → giữ {s['kept']} · trùng {s['dup']} · lỗi điểm (VALUE_NONE) {s['bad_eval']} · "
              f"khác luật / cỡ bàn {s['other']}")
    else:
        sys.exit(__doc__)
