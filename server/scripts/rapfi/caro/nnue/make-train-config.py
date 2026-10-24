"""
Ghi config.yaml cho pytorch-nnue-trainer – dùng chung cho run.sh (máy luyện, CPU) và kaggle-train.py (Kaggle, GPU) để
hai nơi luyện cùng một kiểu mạng (Rapfi-CARO chỉ nạp được đúng mix9svq với các tham số này).
  python3 make-train-config.py <rundir> <thư mục dữ liệu> <cỡ lô> <số bước> <tốc độ học> [điểm kiểm tra để học tiếp]
                               [lưu mỗi … bước] [lưu tạm mỗi … bước]
Lưu tạm (temp_save_interval) là bản cuốn chiếu – chỉ giữ bản mới nhất: máy bị dừng giữa chừng (Spot) thì run.sh nạp bản
đó (load_from) và học nốt phần còn lại, không mất cả vòng. (state_*.pt không dùng được: dữ liệu packed_binary không học
tiếp "chính xác" được, bộ huấn luyện từ chối.)
Ghi chú các tham số bắt buộc (đều đã kiểm – Laplace cũng tìm ra độc lập, gói review ngày 24/10):
  - model_type mix9svq: bản Rapfi chỉ nạp kiến trúc này ("incompatible architecture" với mix9 thường)
  - codebook_size 65536 như mạng chính thức: 16384 (mặc định) cho file sai độ dài, Rapfi không nạp
  - kmeans_init false: khởi tạo k-means xong sau vài bước làm đổi bộ chỉ số loss giữa chừng, bộ huấn luyện dừng lỗi
  - data_pipelines line_encoding: mix9svq cần đặc trưng theo đường
"""
import sys
from pathlib import Path

rundir, data, batch, iters, lr = sys.argv[1:6]
load_from = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] else ""
save_every = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] else iters
temp_every = sys.argv[8] if len(sys.argv) > 8 and sys.argv[8] else "5000"

cfg = f"""rundir: {rundir}
dataset_type: packed_binary
dataset_args: {{rules: [caro], boardsizes: 20, apply_symmetry: true}}
train_datas: [{data}]
data_pipelines: {{line_encoding: {{line_length: 11}}}}
model_type: mix9svq
model_args: {{dim_middle: 128, dim_feature: 64, dim_policy: 32, dim_value: 64, dim_dwconv: 32, codebook_size: 65536, kmeans_init: false}}
loss_args: {{policy_reg_lambda: 0.001}}
batch_size: {batch}
iterations: {iters}
save_interval: {save_every}
temp_save_interval: {temp_every}
log_interval: 100
val_interval: 100000000
learning_rate: {lr}
weight_decay: 1.0e-7
clip_grad_norm: 1.0
"""
if load_from:
    cfg += f"load_from: {load_from}\n"
Path(rundir).mkdir(parents=True, exist_ok=True)
(Path(rundir) / "config.yaml").write_text(cfg)
