# CrazyGames Full Launch – làm sẵn, TẮT mặc định (27/11/2026)

Minh chốt ngày 27/11/2026: làm sẵn mã cho Full Launch nhưng không bật. Chỉ bật khi CrazyGames **mời** Full Launch và Minh
đồng ý thử kiếm tiền bằng quảng cáo. Khi bật, quảng cáo **chỉ có ở bản CrazyGames**; bản web, app và itch.io vẫn không có
quảng cáo. Bối cảnh và rủi ro: `docs/dot3-ghi-chu-quyet-dinh.md` mục 1.

Nguồn: docs.crazygames.com, đọc ngày 27/11/2026 (SDK → Video ads, User, Game; Requirements → Ads, Account integration).

## 1. Có gì trong bản Full

| Phần | Cách làm | Mã |
|---|---|---|
| Quảng cáo midgame | Chỉ xin khi vừa hết ván với máy (điểm nghỉ). Không xin trong hay sau ván online, không xin ở nút điều hướng. CrazyGames tự giới hạn tối đa 1 lần / 3 phút, game cũng tự giữ khoảng cách 3 phút. Chỉ tắt tiếng và che màn hình khi quảng cáo **thật sự bắt đầu** (`adStarted`), trả lại khi `adFinished` / `adError`. Bị chặn quảng cáo thì vẫn chơi bình thường. Không có quảng cáo thưởng. | `caro/portal-crazygames-full.js` |
| Tài khoản CrazyGames | Người chơi đã đăng nhập CrazyGames thì game lấy token (`getUserToken`, khoá `IN_GAME_AUTH`). Máy chủ kiểm chữ ký RS256 bằng khoá công khai JWKS chính thức, kiểm `gameId`, rồi vào hoặc tạo tài khoản Caro `cg_…` gắn với tài khoản CrazyGames. Tiến độ lưu trên máy chủ của mình (cách "backend qua User module", nên **không** dùng Data module). | `server/src/crazygames-auth.js`, `server/src/hub/host-login.js` |
| Khách | Chơi khách như bản Basic. Thẻ tài khoản có nút nhỏ "Log in with CrazyGames": không phải nút chính, không tự bật hộp đăng nhập. | như trên |
| Phiên theo CrazyGames | Không có nút Đăng xuất trong game (CrazyGames không cho). Khi CrazyGames đổi người dùng hoặc đăng xuất, game đăng xuất phiên cũ, nên trên máy dùng chung không ai vào nhầm tài khoản người khác. | như trên |
| Link mời phòng | Lấy từ SDK (`game.inviteLink({ room })`). Mở game từ link mời thì vào phòng (`getInviteParam('room')`). | `caro/online-room.js`, `caro/online.js` |
| Chữ "không quảng cáo" | Trang chủ đổi sang câu không nhắc quảng cáo (`home_intro_free`, 8 ngôn ngữ). Mô tả trang bỏ chữ "ad-free". | `build-portal.js` |

## 2. Cách bật (Minh làm, chỉ khi đã được mời và đồng ý)

1. **Máy chủ:** đặt biến môi trường `CRAZYGAMES_GAME_ID=<mã game trên CrazyGames Developer Portal>` rồi khởi động lại.
   - Mã này không phải bí mật.
   - Không đặt thì đăng nhập bằng CrazyGames tắt hẳn.
   - Máy chủ cần ra được `userportal.crazygames.com` để tải khoá công khai.
2. **Đóng gói:** `node server/scripts/build-portal.js crazygames --full --server https://<tên miền của game>`. Không có
   `--full` thì ra gói Basic như cũ.
3. **Trong biểu mẫu nộp của CrazyGames:**
   - Chọn tích hợp tài khoản mức Full.
   - Lưu tiến độ: chọn cách "backend của mình". Không bật Progress Save / Data module, vì game không dùng.
4. Nhờ Laplace kiểm theo mục 3, trong QA Tool của CrazyGames.

## 3. Laplace kiểm (QA Tool của CrazyGames, sau khi Minh tải gói `--full` lên)

1. Chưa đăng nhập CrazyGames:
   - Chơi khách được.
   - Tab More có nút nhỏ "Log in with CrazyGames".
   - Không có nút Đăng xuất.
2. Bấm nút, đăng nhập CrazyGames:
   - Game vào tài khoản (tên = username CrazyGames).
   - Giải vài câu đố, đóng tab, mở lại: tiến độ còn.
3. Đăng xuất CrazyGames (trang tải lại): game về khách. Đăng nhập tài khoản CrazyGames khác: vào tài khoản khác.
4. Chơi với máy tới hết ván:
   - Quảng cáo hiện (QA Tool có quảng cáo thử).
   - Trong lúc quảng cáo, game im tiếng.
   - Xong quảng cáo: tiếng trở lại, chơi tiếp được.
   - Ván kế tiếp trong vòng 3 phút: không có quảng cáo.
5. Bật trình chặn quảng cáo: chơi bình thường, không bị khoá tính năng nào.
6. Tạo phòng: link mời là link CrazyGames. Mở link ở trình duyệt khác: vào đúng phòng.
7. Ván online: không có quảng cáo giữa hay ngay sau ván.

## 4. Kiểm thử trong repo

- `server/test/crazygames-auth.test.js`:
  - token đúng / sai chữ ký / khoá khác / alg `none` / HS256 nhầm thuật toán / khoá cũ / sai `gameId` / hết hạn;
  - JWKS lỗi, nhớ đệm, tải lại có giới hạn;
  - luồng máy chủ.
- `caro/tests/portal-crazygames-full.test.js`: khi nào được xin quảng cáo; phiên theo tài khoản CrazyGames.
- `server/test/portal-build.test.js`: gói thường không có module Full; gói `--full` có cờ + module, không còn "ad-free".
- `caro/tests/e2e/portal-cg-full.e2e.js`: SDK giả + JWKS giả, toàn bộ luồng ở 390px.

## 5. Chưa xác minh

- Tỉ lệ chia doanh thu quảng cáo (CrazyGames không công bố).
- Có được ở lại Basic lâu dài khi đã được mời Full không.
- Tài liệu chỉ có ví dụ mã cho `requestAd` ở HTML5 (dùng callback), không có khai báo hàm chính thức. Mã viết theo đúng ví dụ.
