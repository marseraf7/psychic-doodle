# Bản vá `.github/workflows/app.yml` cho Issue #86 — cần người có quyền sửa workflow áp vào

**Kết luận:** Hai thay đổi thuộc Issue #86 nằm trong `.github/workflows/app.yml` — cổng khoá ký (H-A2) và bước đặt số bản dựng iOS (phần còn lại của M-A1). Baxter **không áp được**: GitHub App của connector không có quyền `workflows`, mọi đường ghi (Git Trees API và Contents API) đều bị GitHub từ chối 403 với lý do đúng nguyên văn "refusing to allow a GitHub App to create or update workflow … without `workflows` permission". Tài liệu này chứa bản vá nguyên vẹn để Claude Code (đẩy bằng git trực tiếp) hoặc người dùng áp vào. Các mục còn lại của #86 (H-A3, H-A4, M-A2, M-A3, nửa tĩnh của M-A1) đã làm trong chính PR của Issue này mà không cần sửa workflow.

**Môi trường:** soạn trên `6fe8bbd`, file đích `.github/workflows/app.yml` ở trạng thái gốc của nhánh chính.

## Vá 1 — H-A2: cổng khoá ký ở job Android

Thay toàn bộ bước `Chuẩn bị khoá ký (nếu có)` hiện tại bằng:

```yaml
      - name: Chuẩn bị khoá ký (nếu có)
        env:
          KEYSTORE_BASE64: ${{ secrets.CARO_KEYSTORE_BASE64 }}
          KEYSTORE_PASSWORD: ${{ secrets.CARO_KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.CARO_KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.CARO_KEY_PASSWORD }}
          DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}
        run: |
          if [ -n "$KEYSTORE_BASE64" ]; then
            # Có khoá mà thiếu một trong ba bí mật còn lại là cấu hình dở dang: dừng ngay với
            # thông báo rõ ràng thay vì để Gradle lỗi khó hiểu ở bước dựng (H-A2).
            if [ -z "$KEYSTORE_PASSWORD" ] || [ -z "$KEY_ALIAS" ] || [ -z "$KEY_PASSWORD" ]; then
              echo "::error::Đã có CARO_KEYSTORE_BASE64 nhưng thiếu CARO_KEYSTORE_PASSWORD / CARO_KEY_ALIAS / CARO_KEY_PASSWORD — kiểm tra lại Secrets của repo."
              exit 1
            fi
            echo "$KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/caro.jks"
            echo "CARO_KEYSTORE_FILE=$RUNNER_TEMP/caro.jks" >> "$GITHUB_ENV"
          elif [ "${{ github.event_name }}" = "workflow_dispatch" ] || [ "$GITHUB_REF_NAME" = "$DEFAULT_BRANCH" ]; then
            # H-A2: lượt dựng mang tính phát hành (chạy tay hoặc trên nhánh chính) mà không có
            # khoá ký thì phải ĐỎ — trước đây vẫn xanh và tải lên một AAB chưa ký trông y hệt
            # bản đã ký, chỉ bị Google Play từ chối ở phút chót.
            echo "::error::Lượt dựng phát hành nhưng chưa có khoá ký (CARO_KEYSTORE_BASE64) — bản release sẽ chưa ký. Hãy đặt đủ 4 Secrets CARO_KEYSTORE_* / CARO_KEY_* (xem app/README.md)."
            exit 1
          else
            echo "Chưa có khoá ký: bản release sẽ chưa ký (chỉ dùng bản debug để cài thử)."
          fi
```

Lý do giữ nguyên đường cảnh báo cho PR/nhánh thường: các check bắt buộc của nhánh chính chạy trên PR không có (hoặc không nên có) khoá ký phát hành; chỉ lượt phát hành thật mới bắt buộc ký.

## Vá 2 — M-A1 (phần CI): đặt số bản dựng iOS trước khi dựng

Thêm bước này vào job `ios`, ngay sau bước `Cài thư viện, dựng giao diện, đồng bộ iOS` và trước bước `Dựng app cho iOS Simulator`:

```yaml
      - name: Đặt số bản dựng + phiên bản iOS (M-A1)
        working-directory: app/ios/App
        run: |
          # CURRENT_PROJECT_VERSION trong project đang ghim = 1: bản tải thứ hai lên
          # App Store Connect sẽ bị từ chối "build already exists". Đặt theo cùng công thức
          # như versionCode Android (run_number * 100 + run_attempt) nên chạy lại CI cũng không trùng.
          agvtool new-version -all "$(( ${{ github.run_number }} * 100 + ${{ github.run_attempt }} ))"
          # MARKETING_VERSION trong project đã đồng bộ 1.0.0 ở PR này; bước này giữ nó luôn
          # khớp app/package.json về sau.
          agvtool new-marketing-version -all "$(node -p "require('../../package.json').version")"
```

## Không cần vá nữa

- Dòng `CARO_VERSION_CODE: ${{ github.run_number }}` trong env của job Android: giữ nguyên cũng được — `app/android/app/build.gradle` (đã sửa trong PR của #86) ưu tiên `GITHUB_RUN_NUMBER * 100 + GITHUB_RUN_ATTEMPT` khi chạy trên CI, biến env kia chỉ còn là dự phòng khi dựng tay. Muốn gọn thì xoá dòng đó trong cùng lần áp bản vá này.

Agent: baxter
