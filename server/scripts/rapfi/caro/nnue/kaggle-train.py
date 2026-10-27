"""
Huấn luyện mạng NNUE luật Việt Nam bằng GPU trên Kaggle (miễn phí ~30 giờ GPU / tuần), rồi đẩy mạng ứng viên lên repo
dữ liệu chung (cand/) – máy luyện (run.sh, DATA_REPO) đấu chọn mạng này với mạng tốt nhất như mọi vòng.
Trong notebook Kaggle (Settings: Accelerator GPU, Internet On; Add-ons → Secrets: GITHUB_TOKEN), một ô:
    !git clone -q --depth 1 https://github.com/marseraf7/psychic-doodle /kaggle/temp/pd
    !python /kaggle/temp/pd/server/scripts/rapfi/caro/nnue/kaggle-train.py
(clone vào /kaggle/temp: không lẫn mã nguồn vào Output của notebook)
Biến môi trường (đặt bằng %env trước ô trên nếu muốn đổi):
  DATA_REPO   https://github.com/marseraf7/caro-nnue-data (mặc định)
  HOURS       giờ huấn luyện tối đa (mặc định 9 – phiên Kaggle dừng ở 12 giờ, chừa thời gian cài đặt / xuất / đẩy)
  BATCH 256 · LR 0.001 (học tiếp từ phiên trước: 0.0003) · WINDOW 3000 (số file dữ liệu mới nhất, mỗi file 200 ván) · SAVE_EVERY 5000 bước · TEMP_SAVE 1000 bước (lưu tạm)
  VAL_MOD 40 · VAL_FILES 30 · PATIENCE 2 – xem "Ván kiểm tra" dưới
Ván kiểm tra: khoảng 1/VAL_MOD số file (chọn theo mã băm tên file – phiên nào cũng đúng những file đó, không bao giờ đưa
vào học), lấy tối đa VAL_FILES file mới nhất. Mỗi lần lưu điểm kiểm tra, bộ huấn luyện chấm loss trên các ván này
(val_loss). train_loss chỉ đo trên ván đã học nên giảm mãi (thuộc lòng); val_loss mới cho biết mạng có mạnh lên với ván
chưa gặp. val_loss không tốt hơn mức tốt nhất PATIENCE lần liền thì dừng sớm (học thêm chỉ quá khớp, phí giờ GPU) và
xuất mạng ở điểm kiểm tra có val_loss thấp nhất.
Học tiếp qua nhiều phiên: thư mục chạy (/kaggle/working/run) là đầu ra của notebook. Phiên sau: Add Input → chọn đầu ra
của phiên trước – script lấy điểm kiểm tra cuối của phiên đó làm điểm xuất phát (không có thì học từ đầu). Chỉ giữ 2 điểm kiểm tra mới nhất cho đầu ra gọn.
Token chỉ đọc từ Kaggle Secrets / biến môi trường GITHUB_TOKEN, không in ra; cần quyền ghi (Contents) repo dữ liệu.
Chạy được cả trên máy không có GPU (để kiểm thử: HOURS=0.02 …) – khi đó dùng CPU.
"""
import glob
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
TRAINER_COMMIT = "ed6ff57cbd9d31bc5217ecbdf0de2a004c6be374"
DATA_REPO = os.environ.get("DATA_REPO", "https://github.com/marseraf7/caro-nnue-data").removesuffix(".git")
HOURS = float(os.environ.get("HOURS", "9"))
BATCH = os.environ.get("BATCH", "256")  # 1024 hết bộ nhớ GPU T4 16 GB (mix9svq, codebook 65536)
LR = os.environ.get("LR", "0.001")
# Học tiếp từ một mạng đã khá: tốc độ học 0.001 làm val_loss xuống thấp nhất rất sớm rồi tăng vọt (Kaggle 27/10: bước 5000
# 0,447 → 0,52–0,54) – mạng nhảy khỏi điểm tốt rồi thuộc lòng. Không đặt LR thì phiên học tiếp dùng mức này
LR_RESUME = os.environ.get("LR", "0.0003")
WINDOW = int(os.environ.get("WINDOW", "3000"))
VAL_MOD = int(os.environ.get("VAL_MOD", "40"))
VAL_FILES = int(os.environ.get("VAL_FILES", "30"))
PATIENCE = int(os.environ.get("PATIENCE", "2"))
SAVE_EVERY = os.environ.get("SAVE_EVERY", "5000")
# Lưu tạm cuốn chiếu: T4 lô 256 chạy ~1,4 bước/giây → 1000 bước ≈ 12 phút (hết giờ thì xuất từ bản này)
TEMP_SAVE = os.environ.get("TEMP_SAVE", "1000")
KAGGLE = Path("/kaggle/working").exists()
OUT = Path(os.environ.get("OUT", "/kaggle/working" if KAGGLE else str(Path.home() / "kaggle-out")))
TMP = Path(os.environ.get("TMP_DIR", "/kaggle/temp" if KAGGLE else str(Path.home() / "kaggle-tmp")))
RUN = OUT / "run"
T0 = time.time()


def say(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def sh(*cmd, cwd=None, quiet=False):
    """Chạy lệnh; lỗi thì dừng (không in lệnh – có thể chứa token)."""
    r = subprocess.run(cmd, cwd=cwd, stdout=subprocess.DEVNULL if quiet else None, stderr=subprocess.STDOUT if quiet else None)
    if r.returncode:
        sys.exit(f"Lệnh {cmd[0]} {cmd[1] if len(cmd) > 1 else ''} lỗi (mã {r.returncode})")


def token():
    t = os.environ.get("GITHUB_TOKEN", "")
    if not t and KAGGLE:
        try:
            from kaggle_secrets import UserSecretsClient
            t = UserSecretsClient().get_secret("GITHUB_TOKEN")
        except Exception:
            t = ""
    return t


def repo_url():
    """URL có kèm token (nếu có) – chỉ đưa cho git, không in. Repo cục bộ (kiểm thử) để nguyên."""
    t = token()
    if t and DATA_REPO.startswith("https://github.com/"):
        return DATA_REPO.replace("https://", f"https://x-access-token:{t}@") + ".git"
    return DATA_REPO if not DATA_REPO.startswith("https://") else DATA_REPO + ".git"


def setup_trainer():
    tr = TMP / "trainer"
    if not (tr / ".git").exists():
        say("Tải bộ huấn luyện pytorch-nnue-trainer (ghim commit) + thêm luật caro")
        sh("git", "clone", "-q", "https://github.com/dhbloo/pytorch-nnue-trainer", str(tr))
    sh("git", "-C", str(tr), "checkout", "-q", TRAINER_COMMIT)
    sh(sys.executable, str(HERE / "trainer-add-caro.py"), str(tr))
    say("Cài phụ thuộc + dựng phần mở rộng C++ của bộ huấn luyện (vài phút)")
    sh(sys.executable, "-m", "pip", "install", "-q", str(tr), quiet=True)
    return tr


def is_val(f):
    """File để riêng làm ván kiểm tra – theo mã băm tên file nên cố định qua mọi phiên."""
    return VAL_MOD > 0 and zlib.crc32(Path(f).name.encode()) % VAL_MOD == 0


def fetch_data():
    """Clone nông repo dữ liệu, trả (WINDOW file ván mới nhất để học, tối đa VAL_FILES file ván kiểm tra mới nhất) –
    theo epoch trong tên sp-<epoch>-…; hai danh sách không bao giờ chung file."""
    d = TMP / "data-repo"
    if d.exists():
        shutil.rmtree(d)
    say("Tải dữ liệu tự đấu từ repo dữ liệu")
    os.environ["GIT_TERMINAL_PROMPT"] = "0"
    sh("git", "clone", "-q", "--depth", "1", repo_url(), str(d))
    files = glob.glob(str(d / "data" / "**" / "sp-*.binpack.lz4"), recursive=True)
    files.sort(key=lambda f: int(re.match(r"sp-(\d+)-", Path(f).name).group(1)), reverse=True)
    val = [f for f in files if is_val(f)][:VAL_FILES]
    if len(files) - len(val) < 10:
        val = []  # quá ít ván (kiểm thử): học hết, không chấm val
    train = [f for f in files if f not in set(val)][:WINDOW]
    return train, val


def resume_previous():
    """Phiên trước (đầu ra notebook gắn làm Input): lấy điểm kiểm tra cuối làm điểm xuất phát (load_from).
    Dữ liệu packed_binary không học tiếp "chính xác" từ state_*.pt được (bộ huấn luyện từ chối), nên chỉ nạp trọng số."""
    if (RUN / "ckpts").exists():
        return ""
    cks = [f for f in glob.glob("/kaggle/input/**/run/ckpts/ckpt_mix9svq_*.pt", recursive=True) if os.path.getsize(f) > 0]
    if not cks:
        return ""
    # Mỗi phiên đánh số bước lại từ 0: chọn phiên mới nhất (file sửa sau cùng), rồi bước cao nhất trong phiên đó
    run = Path(max(cks, key=os.path.getmtime)).parent
    ck = max((f for f in cks if Path(f).parent == run), key=lambda f: Path(f).name)
    if len({Path(f).parent for f in cks}) > 1:
        say(f"Có nhiều phiên trước trong Input – lấy phiên sửa sau cùng: {run.parent.parent}. Chỉ nên gắn một phiên.")
    dst = OUT / "prev" / Path(ck).name
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(ck, dst)
    say(f"Học tiếp từ phiên trước: {Path(ck).name}")
    return str(dst)


def prune(keep=2):
    """Chỉ giữ `keep` điểm kiểm tra mới nhất mỗi loại (ckpt_, ckpt_ema…, state_) cho đầu ra Kaggle gọn – cộng điểm kiểm
    tra có val_loss thấp nhất (để xuất mạng từ đó)."""
    best = best_val()
    groups = {}
    for f in glob.glob(str(RUN / "ckpts" / "*.pt")):
        m = re.match(r"(.*_)(\d{7})(.*)\.pt$", Path(f).name)
        if m:
            groups.setdefault(m.group(1) + m.group(3), []).append(f)
    for fs in groups.values():
        for f in sorted(fs)[:-keep]:
            if best and f"_{best[0]:07d}" in Path(f).name:
                continue
            os.remove(f)


def keops_cuda_env():
    """KeOps (lượng tử hoá vector của mix9svq) tự dịch nhân CUDA lúc chạy, cần liên kết -lnvrtc / -lcuda và header
    nvrtc.h, cuda.h. Kaggle chỉ có libnvrtc.so.12 (không có libnvrtc.so) nên ld báo "cannot find -lnvrtc".
    Tìm thư viện / header (CUDA hệ thống + gói pip nvidia-*), tạo symlink tên trần trong TMP/keops-cuda, đặt
    LIBRARY_PATH / LD_LIBRARY_PATH / CPATH rồi xoá bộ đệm KeOps đã dịch hỏng."""
    import site
    roots = ["/usr/local/cuda/lib64", "/usr/local/cuda/targets/x86_64-linux/lib", "/usr/lib/x86_64-linux-gnu",
             "/usr/local/nvidia/lib64"]
    for sp in site.getsitepackages():
        roots += glob.glob(sp + "/nvidia/*/lib")
    incs = ["/usr/local/cuda/include", "/usr/local/cuda/targets/x86_64-linux/include"]
    for sp in site.getsitepackages():
        incs += glob.glob(sp + "/nvidia/*/include")
    need_nvrtc = not any(Path(r, "nvrtc.h").exists() for r in incs)
    if need_nvrtc or not any(glob.glob(r + "/libnvrtc.so*") for r in roots):
        say("Cài gói nvidia-cuda-nvrtc-cu12 cho KeOps")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "nvidia-cuda-nvrtc-cu12"], stdout=subprocess.DEVNULL)
        for sp in site.getsitepackages():
            roots += glob.glob(sp + "/nvidia/*/lib")
            incs += glob.glob(sp + "/nvidia/*/include")
    out = TMP / "keops-cuda"
    out.mkdir(parents=True, exist_ok=True)
    for name in ("nvrtc", "cuda", "nvrtc-builtins"):
        cand = sorted(f for r in roots for f in glob.glob(f"{r}/lib{name}.so*") if os.path.exists(f))
        if cand and not (out / f"lib{name}.so").exists():
            (out / f"lib{name}.so").symlink_to(cand[0])
        say(f"KeOps: lib{name}.so → {cand[0] if cand else 'KHÔNG THẤY'}")
    have = [r for r in incs if Path(r).is_dir()]
    say(f"KeOps: nvrtc.h {'có' if any(Path(r, 'nvrtc.h').exists() for r in have) else 'KHÔNG THẤY'}, "
        f"cuda.h {'có' if any(Path(r, 'cuda.h').exists() for r in have) else 'KHÔNG THẤY'}")
    libs = [str(out)] + [r for r in roots if Path(r).is_dir()]
    for var, extra in (("LIBRARY_PATH", libs), ("LD_LIBRARY_PATH", libs), ("CPATH", have)):
        os.environ[var] = ":".join(extra + [p for p in os.environ.get(var, "").split(":") if p])
    shutil.rmtree(Path.home() / ".cache" / "keops2.3", ignore_errors=True)


def val_history():
    """[(bước, val_loss phần giá trị)] theo thứ tự – từ training_log.jsonl của bộ huấn luyện."""
    out = []
    try:
        for line in open(RUN / "training_log.jsonl"):
            if '"val_loss"' in line:
                d = json.loads(line)
                v = (d.get("val_loss") or {}).get("value_loss")
                if v is not None:
                    out.append((int(d["it"]), float(v)))
    except (OSError, ValueError, KeyError):
        pass
    return out


def best_val():
    """(bước, val_loss) thấp nhất trong phiên này, hoặc None."""
    h = val_history()
    return min(h, key=lambda x: x[1]) if h else None


def stalled():
    """val_loss không thấp hơn mức tốt nhất trước đó PATIENCE lần chấm liền."""
    h = val_history()
    if PATIENCE <= 0 or len(h) <= PATIENCE:
        return False
    before = min(v for _, v in h[:-PATIENCE])
    return min(v for _, v in h[-PATIENCE:]) >= before


def train(tr, files, val_files, load_from=""):
    gpu = subprocess.run([sys.executable, "-c", "import torch,sys; sys.exit(0 if torch.cuda.is_available() else 1)"]).returncode == 0
    train_dir = RUN / "train"
    shutil.rmtree(train_dir, ignore_errors=True)
    train_dir.mkdir(parents=True)
    for f in files:
        (train_dir / Path(f).name).symlink_to(f)
    val_dir = RUN / "val"
    shutil.rmtree(val_dir, ignore_errors=True)
    if val_files:
        val_dir.mkdir(parents=True)
        for f in val_files:
            (val_dir / Path(f).name).symlink_to(f)
    # Chấm val đúng lúc lưu điểm kiểm tra: mỗi val_loss ứng với một file ckpt để xuất
    sh(sys.executable, str(HERE / "make-train-config.py"), str(RUN), str(train_dir), BATCH, "100000000", LR, load_from, SAVE_EVERY,
       TEMP_SAVE, str(val_dir) if val_files else "", SAVE_EVERY)
    if gpu:
        keops_cuda_env()
    cmd = [sys.executable, "-m", "accelerate.commands.launch", "--num_processes", "1"] + ([] if gpu else ["--cpu"]) + ["train.py", "-c", str(RUN / "config.yaml")]
    if not gpu:
        cmd.append("--use_cpu")
    deadline = T0 + HOURS * 3600
    say(f"Huấn luyện ({'GPU' if gpu else 'CPU'}) trên {len(files)} file (+ {len(val_files)} file ván kiểm tra) đến "
        f"{time.strftime('%H:%M', time.localtime(deadline))}")
    with open(RUN / "train.log", "a") as lg:
        # Nhóm tiến trình riêng: hết giờ thì dừng cả accelerate lẫn tiến trình huấn luyện con (không giữ GPU)
        p = subprocess.Popen(cmd, cwd=tr, stdout=lg, stderr=subprocess.STDOUT, start_new_session=True)
        seen = 0
        while p.poll() is None and time.time() < deadline:
            time.sleep(30)
            prune()
            h = val_history()
            if len(h) > seen:
                seen = len(h)
                b = best_val()
                say(f"Bước {h[-1][0]}: val_loss {h[-1][1]:.4f} (thấp nhất {b[1]:.4f} ở bước {b[0]})")
                if stalled():
                    say(f"val_loss không giảm {PATIENCE} lần liền – dừng sớm (học thêm chỉ thuộc lòng ván cũ)")
                    break
        # Hết giờ mà chưa lưu lần nào (máy chậm / bộ dữ liệu lớn): chờ thêm tối đa 30 phút cho điểm kiểm tra đầu tiên.
        # Bộ huấn luyện không lưu khi bị ngắt – dừng là mất phần học sau lần lưu gần nhất (vài phút với SAVE_EVERY)
        while p.poll() is None and not latest_ckpt() and time.time() < deadline + 1800:
            time.sleep(15)
        if p.poll() is None:
            # Hết giờ: dừng sau lần lưu gần nhất (điểm kiểm tra đang ghi dở bị bỏ – xuất từ file hoàn chỉnh trước đó)
            os.killpg(p.pid, signal.SIGTERM)
            try:
                p.wait(120)
            except subprocess.TimeoutExpired:
                os.killpg(p.pid, signal.SIGKILL)
                p.wait()
        elif p.returncode and time.time() < deadline and not stalled():
            # Bộ huấn luyện tự thoát lỗi giữa chừng (không phải hết giờ / dừng sớm): báo rõ + in đuôi train.log ngay trong
            # log notebook – trước đây script lặng lẽ xuất mạng từ điểm kiểm tra cuối như thể đã học xong
            say(f"LỖI: bộ huấn luyện dừng giữa chừng (mã {p.returncode}) – xuất mạng từ điểm kiểm tra cuối. Đuôi train.log:")
            try:
                print("".join(open(RUN / "train.log", errors="replace").readlines()[-30:]), flush=True)
            except OSError:
                pass
    prune()


def latest_ckpt():
    cks = sorted(f for f in glob.glob(str(RUN / "ckpts" / "ckpt_mix9svq_*.pt")))
    good = []
    for f in cks:
        try:
            if os.path.getsize(f) > 0:
                good.append(f)
        except OSError:
            pass
    return good[-1] if good else None


def best_ckpt():
    """Điểm kiểm tra để xuất: bản có val_loss thấp nhất (nếu còn file), không thì bản mới nhất."""
    b = best_val()
    if b:
        # Tên đầy đủ có cả mô tả kiến trúc: ckpt_mix9svq_basicns_…_0005000.pt
        for f in glob.glob(str(RUN / "ckpts" / f"ckpt_mix9svq_*_{b[0]:07d}.pt")):
            if os.path.getsize(f) > 0:
                return f
    return latest_ckpt()


def value_loss():
    v = None
    try:
        for line in open(RUN / "training_log.jsonl"):
            if "train_loss" in line:
                v = json.loads(line)["train_loss"].get("value_loss")
    except (OSError, ValueError):
        pass
    return v

def tidy(keep=None):
    """Cuối phiên: thu gọn đầu ra để Kaggle lưu Output trong vài phút (trước đây phiên 9 giờ kẹt nhiều giờ ở bước lưu,
    quá giới hạn 12 giờ). Bỏ run/train (symlink tới dữ liệu đã có trên repo – Kaggle đi theo link chép cả trăm file), prev/
    (bản chép ckpt phiên trước), state_*.pt (trạng thái bộ tối ưu – phiên sau chỉ nạp trọng số, xem resume_previous) và
    mọi điểm kiểm tra trừ cái mới nhất mỗi loại – vẫn đủ để phiên sau học tiếp."""
    shutil.rmtree(RUN / "train", ignore_errors=True)
    shutil.rmtree(RUN / "val", ignore_errors=True)
    shutil.rmtree(OUT / "prev", ignore_errors=True)
    good = keep or latest_ckpt()  # bản vừa xuất (val_loss thấp nhất) – phiên sau học tiếp từ đây, không từ bản đã quá khớp
    step = re.search(r"_(\d{7})\.pt$", good).group(1) if good else None
    for f in glob.glob(str(RUN / "ckpts" / "*.pt")):
        name = Path(f).name
        if name.startswith("state_") or not step or f"_{step}." not in name:
            os.remove(f)
    mb = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file() and not f.is_symlink()) / 1e6
    say(f"Thu gọn đầu ra: còn {mb:.0f} MB (giữ {Path(good).name if good else 'không có điểm kiểm tra'} để phiên sau học tiếp)")


def export_and_push(tr, ck, nfiles, nval):
    label = time.strftime("k-%Y%m%d-%H%M", time.gmtime())
    net = OUT / f"{label}.bin.lz4"
    say(f"Xuất mạng từ {Path(ck).name}")
    sh(sys.executable, "export.py", "-c", str(RUN / "run_config.yaml"), "-p", ck, "-o", str(net),
       "--export_type", "bin-lz4", "--export_args", "{rule: caro, board_size: 20}", cwd=tr)
    if not net.exists() or net.stat().st_size == 0:
        sys.exit("Xuất mạng lỗi")
    b = best_val()
    meta = {"label": label, "checkpoint": Path(ck).name, "value_loss": value_loss(), "files": nfiles,
            "val_loss": b[1] if b else None, "val_files": nval, "early_stop": stalled(),
            "batch": int(BATCH), "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    say(f"Đẩy mạng ứng viên cand/{label} lên repo dữ liệu")
    d = TMP / "cand-repo"
    shutil.rmtree(d, ignore_errors=True)
    sh("git", "clone", "-q", "--filter=blob:none", "--sparse", repo_url(), str(d))
    sh("git", "-C", str(d), "sparse-checkout", "set", "cand")
    (d / "cand").mkdir(exist_ok=True)
    shutil.copy(net, d / "cand" / net.name)
    (d / "cand" / f"{label}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    sh("git", "-C", str(d), "config", "user.name", "caro-nnue-kaggle")
    sh("git", "-C", str(d), "config", "user.email", "caro-nnue-kaggle@users.noreply.github.com")
    sh("git", "-C", str(d), "add", "--sparse", f"cand/{net.name}", f"cand/{label}.json")
    sh("git", "-C", str(d), "commit", "-q", "-m", f"Kaggle: mạng ứng viên {label} (val loss {meta['val_loss']})")
    for i in range(6):
        if subprocess.run(["git", "-C", str(d), "push", "-q"], stderr=subprocess.DEVNULL).returncode == 0:
            say(f"Xong: cand/{label}.bin.lz4 – máy luyện sẽ đấu chọn với mạng tốt nhất")
            return
        time.sleep(2 ** (i + 1))
        subprocess.run(["git", "-C", str(d), "pull", "-q", "--rebase"], stderr=subprocess.DEVNULL)
    sys.exit(f"Đẩy mạng lỗi – mạng vẫn ở {net} (tải về rồi đẩy tay vào cand/)")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    if DATA_REPO.startswith("https://github.com/") and not token():
        sys.exit("Thiếu GITHUB_TOKEN (Kaggle: Add-ons → Secrets) – cần quyền ghi repo dữ liệu")
    tr = setup_trainer()
    files, val_files = fetch_data()
    if not files:
        sys.exit("Repo dữ liệu chưa có ván nào (data/…/sp-*.binpack.lz4)")
    prev = resume_previous()
    if prev:
        LR = LR_RESUME
        say(f"Tốc độ học {LR} (học tiếp từ phiên trước)")
    train(tr, files, val_files, prev)
    ck = best_ckpt()
    if not ck:
        # In đuôi train.log ngay trong log notebook (khỏi phải tải Output về mới biết lỗi gì)
        try:
            print("".join(open(RUN / "train.log", errors="replace").readlines()[-40:]), flush=True)
        except OSError:
            pass
        sys.exit(f"Huấn luyện không ra điểm kiểm tra nào – xem {RUN / 'train.log'}")
    try:
        export_and_push(tr, ck, len(files), len(val_files))
    finally:
        tidy(ck)  # cả khi đẩy lỗi: mạng .bin.lz4 vẫn nằm trong đầu ra để tải tay
