#!/usr/bin/env bash
# Đổi tên miền chính trong mã nguồn bằng một lệnh: bash scripts/set-domain.sh caro.example.com [--dry-run]
# (gọi scripts/set-domain.js – danh sách file: scripts/domain-files.js; các bước còn lại: docs/doi-ten-mien.md)
set -euo pipefail
exec node "$(dirname "${BASH_SOURCE[0]}")/set-domain.js" "$@"
