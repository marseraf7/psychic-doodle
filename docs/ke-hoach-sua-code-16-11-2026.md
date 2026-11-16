# Kế hoạch sửa lỗi sau rà soát code Caro (16/11/2026)

Nền: repo ở `a3706f5` (CACHE caro-v200), đối chiếu với danh sách Laplace viết trên `ab5a5da` (v199).
Cách kiểm: đọc code hiện tại tại từng file:dòng + 2 thử nghiệm Chrome headless (R1, R3) trong thư mục scratchpad.
Chưa chạy lại các script tái hiện máy chủ của Laplace (đọc code là đủ rõ ở mọi mục Nhóm 1–2); nơi nào "chưa kiểm" đều ghi rõ.
Chuỗi giao diện mới (nếu có) luôn phải đủ vi/en/ru/zh và qua `i18n-quality`, `i18n-vars`.

## 1. Bảng tổng

Ký hiệu trạng thái: CL = còn lỗi (xác nhận bằng code hiện tại); ĐS = đã sửa; KPL = không phải lỗi; QĐ = cần Minh quyết; CK = chưa kiểm.
Ưu tiên: P1 cao, P2 trung, P3 thấp.

| # | Trạng thái | Ưu tiên | Đợt | Ghi chú ngắn |
|---|---|---|---|---|
| 1 | CL (đúng như Laplace; có chỉnh nhỏ: `on_clubRequest` CÓ xoá yêu cầu, chỗ không xoá là `addMember` ở đường vào thẳng) | P1 | 1 | Ban bị vô hiệu |
| 2 | QĐ | P1 | Minh | Tự báo tỉ số; có phần sửa an toàn |
| 3 | CL | P2 | 2 | Một dòng: `Math.max(min, k)` |
| 4 | CL | P1 | 1 | Chỉ tới khi có bản ghi hỏng; vẫn là DoS toàn máy chủ |
| 5 | CL | P2 | 1 | Không khởi động được khi db.json / dòng users hỏng |
| 6 | CL | P2 | 1 | EvalCache toạ độ vô lý |
| 7 | CL | P1 | 2 | Giải treo vĩnh viễn khi >50 khiếu nại |
| 8a, 8b, 8c | CL (8b cần chốt nhẹ cách sửa) | P1 | 1 | Rò rỉ giải riêng tư |
| 9a | CL | P2 | 2 | `access` đổi dù báo lỗi |
| 9b | CL (thấp) | P3 | 2 | |
| 10 | CL | P2 | 2 | Giải tổng "ma" + lách hạn mức |
| 11 (R1) | KPL phần lớn (xem mục 4) | P3 | 3 | Lập luận của Laplace về `scrollIntoView` sai; đã thử bằng Chrome |
| 12 | ĐS phần chính (PR #216); họ hàng: `online-auth.js:65` (xoá ảnh) CL, `club-talk.js:90` (xoá chat) CL nhẹ | P3 | 3 | |
| 13a | CL | P2 | 1 | Người bị ban vẫn xoá tin / bài của mình |
| 13b | CL (hành vi "mất tin" đúng) | P3 | 2 | |
| 13c | CL | P2 | 1 | `talkMuted` bị xoá khi rời CLB |
| 14 | CL | P2 | 1 | Trùng slug giải giao hữu |
| 15 | CL | P2 | 2 | Số set không bị chặn theo Bo |
| 16 | CL | P2 | 2 | Podium hạng 3 không theo hạt giống |
| 17 | QĐ nhẹ (mã có chú thích cố ý "không cắt") | P3 | Minh | |
| 18 | CL | P2 | 3 | Cache ô cấm Renju |
| 19 | CL | P2 | 3 | Undo không trả giờ cộng |
| 20 | QĐ | P2 | Minh | Quyền staff 'all' |
| 21 | CL | P3 | 4 | `room-swap2.js:23` |
| 22 (R3) | KPL (đã đo) | - | - | Ellipsis hoạt động |
| 23 (R4) | ĐS (PR #216, `.ot-log` dùng `gap`) | - | - | |
| 24 | CL (thấp) | P3 | 4 | |
| 25 | CL (thấp) | P3 | 2 | |
| 26 | CL (thấp) | P3 | 2 | |
| 27 | CL (thấp) | P3 | 2 | |
| 28 | CL (thấp) | P3 | 2 | `typeof null === 'object'` đúng |
| 29 | CL (thấp) | P3 | 4 | |
| 30 | CL (khoảng trống của test, chưa có vi phạm) | P3 | 3 | |
| 31 | CL (thấp) | P3 | 3 | Công thức tràn đúng |
| 32 | CL (thấp) | P3 | 3 | `c=702` cho `'{'` đúng |
| 33 | KPL / bỏ qua | P3 | 4 | Lỗi nội bộ, không hiển thị |
| Nghi 1 | CL phòng thủ (chưa biết có dữ liệu thật hỏng) | P3 | 2 | Kèm mục 5 |
| Nghi 2 | QĐ (mâu thuẫn xác nhận bằng code + test) | P2 | Minh | |
| Nghi 3 | CL / QĐ | P3 | Minh | `m.esp`, `m.events` không bị xoá khi huỷ |
| Nghi 4 | QĐ | P3 | Minh | Cùng gốc với mục 2 |
| Nghi 5 | CL (một nửa chưa kiểm đầu-cuối) | P3 | 2 | |
| Nghi 6 | QĐ | P3 | Minh | |
| Nghi 7 | CK | - | - | Cần dựng thế cờ |
| Nghi 8 | CL nhẹ (code đúng như mô tả: `try/catch` bỏ nước hỏng nhưng `turn` dùng `i`) | P3 | 4 | |
| Nghi 9 | CK | - | - | |
| Nghi 10 | CK (chưa mở từng chỗ) | P3 | 4 | |
| Nghi 11 | CL phòng thủ (xem dưới); chưa chứng minh `t.url` do người dùng chi phối | P3 | 4 | |
| Nghi 12 | CK | - | - | |
| Nghi 13 | QĐ | P3 | Minh | |
| Nghi 14 | CK | - | - | |
| Nghi 15 | CK (cả nhóm) | - | - | Đề nghị Laplace tách từng mục nếu muốn sửa |
| Nghi 16 | CK | - | - | |

## 2. Các đợt sửa

Quy ước chung cho mọi đợt: CLAUDE.md đòi chia file theo hub (~400 dòng/file); đổi file trong `caro/` thì tăng `CACHE` trong `caro/sw.js`.
Bài thử nên đặt trong file test MỚI nhỏ (một file một việc) rồi nạp tự động qua `test/*.test.js`; muốn tính vào `npm run coverage` thì không cần thêm gì (đã nạp `test/*.test.js`). Test client nằm ở `caro/tests` thì phải thêm vào danh sách `coverage` trong `server/package.json`.
Hiện KHÔNG có test nào cho `clubJoin` / `clubRequest` ngoài `tour.test.js:139` (chỉ tạo CLB); nên dựng file `server/test/club-security.test.js` dựa trên cách `tour.test.js` khởi động máy chủ (`start({port:0, dataFile:null, ...})`, client WebSocket giống `otour-client.js`).

### ĐỢT 1 – bảo mật / quyền / riêng tư / sập máy chủ (máy chủ, 1 PR)

**Mục 1 – Duyệt yêu cầu cũ đưa người bị ban trở lại / hạ cấp quản lý**
- Hiện tại: `server/src/hub/clubs.js:224-241` (`on_clubRequest`) khi `accept` chỉ kiểm `this.store.users.get(uid)`; `addMember` (`clubs.js:263-268`) ghi `members[uid]='member'` và KHÔNG xoá `c.requests`. Đường vào thẳng `on_clubJoin` (`clubs.js:206-209`) gọi `addMember` mà không dọn yêu cầu cũ. `on_clubReconsider` (`club-manage.js:104`) thì có `!c.members[uid] && !c.banned[uid]`.
- Mô tả của Laplace đúng. Chỉnh nhỏ: chính `on_clubRequest` có xoá `c.requests`; lỗ nằm ở chỗ yêu cầu còn sót do `addMember` không dọn.
- Sửa nhỏ nhất: (a) trong `on_clubRequest` đổi điều kiện thành `accept && this.store.users.get(uid) && !c.members[uid] && !c.banned[uid]` (y hệt `on_clubReconsider`); (b) trong `addMember` thêm `c.requests = c.requests.filter((x) => x !== uid); delete c.reqMsg[uid];`; (c) tuỳ chọn: `on_clubKick` cũng dọn `requests`/`reqMsg` của người bị kick (`dropMember` có thể làm hộ, nhưng `on_clubLeave` đã tự dọn nên đặt ở `dropMember` cho thống nhất cũng được). Không cần chuỗi mới.
- Bài thử (đỏ trên code cũ): `club-security.test.js`: X gửi yêu cầu vào CLB `request` → chủ đổi CLB sang `open` → X vào thẳng → chủ kick kèm ban → quản lý có quyền `requests` gọi `clubRequest {accept:true}` → khẳng định `members[X]` vẫn vắng và `banned[X]` còn. Biến thể officer: không bị hạ cấp xuống `member`, `perms` giữ nguyên.
- Rủi ro: thấp. Test hiện có chỉ chạm `clubCreate` / `clubGet`.

**Mục 13a – Người bị kick/ban vẫn xoá được tin chat và bài diễn đàn của mình**
- Hiện tại: `club-talk.js:77-87` (`on_clubChatDel`) và `club-talk.js:171-181` (`on_clubPostDel`) chỉ kiểm `m.uid !== me.id && !clubCan(mod)`.
- Sửa: với nhánh "xoá của chính mình" đòi `c.members[me.id]` (hoặc ít nhất `!c.banned[me.id]`); quản trị viên / người có quyền mod giữ nguyên. Mã lỗi sẵn có `club_officers_only` không hợp; dùng mã đã có cho "không phải thành viên" (tìm trong `msg.js`, ví dụ `club_members_only`; nếu chưa có thì thêm mã mới VÀ chuỗi lỗi 4 ngôn ngữ trong i18n tương ứng).
- Bài thử: ban người đã đăng bài đầu chủ đề → người đó gọi `clubPostDel` → chủ đề còn nguyên.
- Rủi ro: người tự rời CLB không xoá được bài cũ của mình nữa. Khuyến nghị chỉ chặn người bị ban (rộng nhất mà không đổi hành vi người rời CLB); nếu Minh muốn chặt hơn thì đòi là thành viên.

**Mục 13c – `dropMember` xoá `talkMuted` → né cấm nói bằng cách rời rồi vào lại**
- Hiện tại: `clubs.js:270-277` có dòng `c.talkMuted = c.talkMuted.filter(...)`.
- Sửa: bỏ dòng đó khỏi `dropMember` (giữ `muted`, đó là tắt tin của chính người đó). Cần giới hạn độ dài `talkMuted` (kiểm xem đã có trần chưa trong `on_clubTalkMute`; nếu chưa, thêm trần 200 kiểu `MAX_BANNED`). Gỡ cấm nói vẫn qua `on_clubTalkMute {mute:false}`.
- Bài thử: cấm nói người A → A rời → A vào lại (CLB open) → A gửi chat bị chặn.
- Rủi ro: danh sách phình theo thời gian; vì vậy cần trần.

**Mục 14 – Giao hữu CLB bỏ qua kiểm tra slug**
- Hiện tại: `club-battle.js:56-67` truyền `...o` (có `slug` do người dùng gửi) rồi gọi `createTour` mà không `checkSlug` như `tournaments.js:280`.
- Sửa: sau `tourFields(...)` thêm `this.checkSlug(fields.slug);` (đủ; hoặc ép `slug: ''` trong object truyền vào vì giải giao hữu không cần link riêng; khuyến nghị gọi `checkSlug`, không đổi hành vi hợp lệ).
- Bài thử: hai `clubMatchCreate` cùng `slug` → lần hai `tour_slug_taken` (xem mã lỗi trong `tour-opts.js:44`).
- Rủi ro: thấp.

**Mục 4 – Ảnh xem trước ván hỏng làm sập tiến trình**
- Hiện tại: `png.js:106` `board.play` ném lỗi; `web.js:205-214` (`serveReplayPng`) không try/catch; `store.js:244` `JSON.parse(g.moves)` không try/catch; `web.js:311-340` không có try/catch bao toàn bộ đường xử lý và không có `uncaughtException` (đã `grep -rn "uncaught" server/src server/server.js` → 0).
- Sửa: (a) trong `serveReplayPng` bọc `boardPng(...)` bằng try/catch, lỗi thì 404/422 `text/plain` và KHÔNG cache; (b) `store.gameByShare` bọc `JSON.parse` try/catch, hỏng thì trả `null`; cùng chỗ `pairGames` (`store.js:249`); (c) trong bộ xử lý HTTP chính (`web.js` ~dòng 310) bọc phần định tuyến bằng try/catch → `500` rồi `res.end()`. Không khuyến nghị thêm `process.on('uncaughtException')` toàn cục (nuốt lỗi làm trạng thái không rõ); chỉ nên log + để PM2/Docker khởi động lại như hiện nay.
- Bài thử: `web.test.js` (mới) hoặc thêm vào `wellknown.test.js`: ghi thẳng một ván `moves=[[0,0],[1,1],[0,0]]` vào Store rồi `GET /g/<share>.png` → 404/4xx, tiến trình còn sống, request sau vẫn trả lời.
- Rủi ro: thấp. Điều kiện kích hoạt đúng như Laplace nói (cần bản ghi hỏng sẵn).

**Mục 5 – db.json cũ hỏng làm máy chủ không lên**
- Hiện tại: `store.js:43` `JSON.parse(row.data)` từng dòng `users`; `store.js:66-68` `importLegacy`.
- Sửa: `importLegacy`: try/catch quanh `JSON.parse`, lỗi thì `fs.renameSync(file, file + '.corrupt-<ts>')`, ghi log, tiếp tục với CSDL rỗng (chỉ chạy khi `!this.users.size`, nên không đè dữ liệu thật). Dòng `users`: try/catch từng dòng, bỏ qua và log id (dòng gốc vẫn nằm trong SQLite nên khôi phục tay được). Không thêm chuỗi giao diện.
- Bài thử: `store-recovery.test.js` (mới): file db.json cắt dở → `new Store(file, legacy)` không ném, file đổi tên `.corrupt-*`; một dòng users hỏng → các dòng khác vẫn nạp.
- Rủi ro: im lặng bỏ qua một tài khoản hỏng. Vì vậy phải log rõ.

**Mục 6 – EvalCache nhận nước tốt nhất ngoài vùng**
- Hiện tại: `evalcache.js:48-55` `validResult`; giới hạn ±512 chỉ có ở `eval-key.js:30` (`validMoves`) cho danh sách nước.
- Sửa: trong `validResult` thêm `K.validMoves([r.move])` (hoặc `Math.abs(x) > 512 || Math.abs(y) > 512 → false`). Tuỳ chọn chặt hơn: nước phải trong ≤ 6 ô từ một quân (cần xem mức dùng thực của engine; không khuyến nghị làm trong đợt này).
- Bài thử: `evals.test.js` có sẵn khung: thêm ca hai tài khoản gửi khớp `move:[100000,100000]` → `lookup` trả `null`.
- Rủi ro: thấp.

**Mục 8 – Ba rò rỉ riêng tư giải Offline**
- Gốc chung: `otShared(t)` (`otour.js:208-225`) là phần chung cho MỌI người xem và còn phát chung qua bản vá (`otour.js:255-275`). Vì vậy không lọc theo người xem được trong `otSeriesView` / `otMultiView` / `otParentView`; phần nào theo người xem phải đi qua `otMine(t, uid)`.
- 8a (`otour-next.js:47-55`, `otSeriesView`): `ref()` không kiểm quyền. Phương án rẻ: `ref` trả `null` khi `x.access === 'private'` (người xem là chủ mất liên kết nhanh sang mùa riêng tư; vẫn vào được qua danh sách giải). Phương án đầy đủ: để các tham chiếu riêng tư vào `otMine` theo `otCanSee(x, uid)`. Khuyến nghị phương án rẻ trước.
- 8b (`otour-multi.js:289-291`, `otMultiShown`): hiện cho người chỉ được mời vào giải tổng thấy chi tiết giải con riêng tư. Hai hướng: (A) khoá: `otMultiShown` chỉ cho `c.access !== 'private'` và dồn chi tiết giải con riêng tư vào `otMine` theo người xem; (B) thống nhất quyền: `otCanSee(c, uid)` thêm điều kiện "giải con riêng tư cùng chủ với giải tổng riêng tư và uid nằm trong `reg.invited` của giải tổng" để người được mời giải tổng mở được giải con trực tiếp (đúng ý N6: "giải con tạo từ mẫu theo đúng chế độ của giải tổng"). KHUYẾN NGHỊ B (nhỏ, khớp ý đồ N6, không phải viết lại view). Cần Minh gật đầu vì B nới quyền xem.
- 8c (`otour-multi.js:300-304`, `otParentView`): lộ `{id, slug, name}` giải tổng riêng tư cho người chỉ được mời vào giải con. Nếu chọn B ở 8b thì quyền xem hai chiều thống nhất; nếu không, ẩn khi `p.access === 'private'` (sẽ mất liên kết ngược N6 lớp 3 cho chủ giải; khi đó đưa liên kết ngược vào `otMine`).
- Bài thử: mở rộng `otour-multi.test.js:94-102` (hiện chỉ vai chủ) và `otour-next.test.js`: khách / người được mời chỉ giải tổng → không thấy tên giải con riêng tư và mùa riêng tư trong `ot.tour`; nếu chọn B thì `otGet` giải con của người được mời thành công.
- Rủi ro: trung bình ở 8b (đổi luật xem). Kiểm kỹ `otour-public.test.js` và `otour-multi.test.js`.

### ĐỢT 2 – toàn vẹn dữ liệu giải (máy chủ, 1 PR; có thể tách 2a stages / 2b giải Offline)

**Mục 7 – Khiếu nại bị cắt ở 50 khiến trận kẹt**
- Hiện tại: `disputes.js:21-27` `slice(-KEEP)` (KEEP=50) cắt cả bản ghi `open`; `m.hold` đặt ở `bracket.js:260`, gỡ ở `disputes.js:104` (`resolveBracket`); `tickDisputes` (`disputes.js:125-133`) chỉ duyệt `t.disputes`.
- Sửa: giữ mọi bản ghi `status==='open'`, chỉ cắt các bản ghi đã đóng: `const open = all.filter(d => d.status==='open'); const closed = all.filter(d => d.status!=='open').slice(-KEEP); t.disputes = [...closed, ...open].sort((a,b)=>a.at-b.at)`. Thêm trần an toàn cho số `open` (vd 500) để không phình; vượt trần thì tự `confirm` bản mở cũ nhất qua `resolveDispute`.
- Bài thử: mở 51 khiếu nại (hạ KEEP hoặc dựng trận nhiều) → bản mở đầu tiên còn, `tickDisputes` quá hạn vẫn tự công nhận được, trận hết `hold`.
- Rủi ro: thấp.

**Mục 3 – Swiss / Race lấy thừa đội khi `advance = 1`**
- Hiện tại: `stages-groups.js:190` `Math.max(2, k)`; `otour-run.js:149` gọi `splitAdvancers(..., direct.length ? 1 : 2)`; `stages.js:241-275` truyền `min` xuống `advancers`.
- Sửa: `Math.max(min, k)` (`min` mặc định vẫn 2 nên hành vi cũ giữ nguyên; chỉ khác khi `min=1`). Hai nhánh `record` ở các dòng 186-187 vẫn trả `slice(0,2)` khi thiếu người: cũng nên `slice(0, Math.max(min, 1)...)`? Chỉ sửa nếu có test; không bắt buộc.
- Bài thử: `stages.test.js` hoặc `otour-swiss2.test.js`: Swiss 4 người `advance:1` với `min=1` → đúng 1 đội; Race 1 chặng tương tự; với `min` mặc định vẫn 2.
- Rủi ro: thấp, nhưng chạy `stages-*.test.js` và `otour-formats*.test.js`.

**Mục 9a – `on_otEdit` đổi `access` rồi mới ném lỗi spec**
- Hiện tại: `otour.js:153-165`: `Object.assign(t, this.otFields(o, t.id))` trước `specGuard(() => normalizeSpec(...))`.
- Sửa: tính `const f = this.otFields(...)` và (nếu cần) `sp` trước, rồi mới `Object.assign` cả hai. Không chuỗi mới.
- Bài thử: `otour.test.js`: giải private, gửi `otEdit` với `access:'public'` + spec rỗng → lỗi `ot_spec_stages` và `t.access` vẫn `private`.
- Rủi ro: thấp.

**Mục 9b – Xếp lịch tự động 'all' báo lỗi nhưng đã xoá giờ**
- Hiện tại: `otour-sched.js:79` xoá `when/venue` các trận chưa xếp được ở `mode==='all'` ngay trong `otSchedRun`, `on_otSchedAuto:88-90` gán `t.sched = c` trước rồi mới ném `ot_sched_none`.
- Sửa: chỉ xoá giờ cũ khi `placed.length > 0`; gán `t.sched` sau khi chắc chắn không ném (hoặc lưu bản cũ để khôi phục). Phần phụ `otAddTeams` (`otour-run.js:53-63`): kiểm trần trước vòng lặp (`names` đã `slice` theo MAX_TEAMS; tính số đội mới tối đa rồi ném trước khi thêm).
- Bài thử: `otour-sched.test.js`: lịch không đặt được trận nào ở mode `all` → báo lỗi nhưng `when` cũ còn.
- Rủi ro: thấp.

**Mục 10 – Tạo giải tổng: lỗi hạn mức giải con sau khi giải tổng đã lưu**
- Hiện tại: `otour.js:145-148`: `otAdd(t)` (đã `otSave`) rồi `otMultiGames` (`otour-multi.js:166` ném `ot_daily_limit`); `commit()` hạn mức ngày chưa chạy.
- Sửa: kiểm hạn mức giải con TRƯỚC `otAdd`: gọi `this.otMultiQuota(me, soGiaiCon)` (đã có) để ném sớm, rồi dùng chính hàm commit đó. Cách gọn: tách `otMultiGames` thành `otMultiGamesPlan` (kiểm) + phần tạo; hoặc bọc `try { otMultiGames } catch (e) { this.otForget(t.id); this.store.dropOTour(t.id); throw e }`.
- Bài thử: `otour-multi.test.js`: chạm trần giải con/ngày rồi tạo giải tổng từ mẫu → lỗi, `store` không có giải tổng mới, `me.otDay` không đổi.
- Rủi ro: thấp tới trung bình (đổi thứ tự lưu).

**Mục 15 – Nhập tỉ số không ràng buộc theo Bo (giải có tài khoản, offline)**
- Hiện tại: `tour-score.js:90` `sets.slice(0, MAX_SETS)` (9), mỗi set 0..999.
- Sửa: sau `list` đọc xong: `if (list.length > ST.boOf(st, m)) throw E('tour_score_bad')` (hoặc mã mới `tour_sets_many` kèm chuỗi 4 ngôn ngữ nếu muốn thông báo rõ như `ot_sets_many`). Test hiện có tương thích: `tour.test.js:808-810` (Bo3, 2 set), `tour.test.js:847` (Bo3, 3 set, scoreMode points). Các test `[[2,0]]` ở Bo mặc định cũng qua. Không khoá điểm từng set (999) vì cách tính `points` hợp lệ.
- Bài thử: `tour.test.js`: Bo1 gửi 9 set → `tour_score_bad`; cả đường tự báo (`selfReport`).
- Rủi ro: trung bình-thấp; chạy toàn bộ `tour.test.js`.

**Mục 16 – Podium hạng 3 theo thứ tự nhánh, không theo hạt giống**
- Hiện tại: `stages.js:346`: `out.push(...st.rounds[...-2].map(id => st.matches[id].loser))`.
- Sửa: sắp hai đội thua bán kết theo `seedOf(uid)` tăng dần (hạt giống thấp hơn đứng trước) trước khi `push`; không đổi nhánh `st.third`.
- Bài thử: `stages.test.js`: bốn hạt giống, `thirdPlace:false`, kết quả đúng hạt giống → `podium = [s1,s2,s3,s4]`; kèm `advance:3` lấy đúng [s1,s2,s3].
- Rủi ro: thấp.

**Mục 13b – `clubInbox` mất tin khi >30 tin chưa đọc**
- Hiện tại: `club-manage.js:157-169`: `c.seen[uid]` nhảy tới tin mới nhất nhưng chỉ gửi `slice(-30)`.
- Sửa: gom trước, rồi chỉ đánh dấu `seen` tới tin cuối cùng ĐÃ gửi của từng CLB: sắp mọi tin theo `at`, lấy 30 tin CŨ NHẤT (còn lại sẽ tới ở lần sau) hoặc giữ 30 tin mới nhất nhưng coi các tin bị cắt là chủ ý (ghi chú). Khuyến nghị: gửi 30 mới nhất (như hiện nay, người dùng muốn thấy tin mới) và chấp nhận bỏ tin cũ, nhưng ghi chú trong code; nếu Minh muốn không mất thì làm bản "cũ nhất trước". Đây là gần như QĐ nhẹ, ưu tiên thấp.
- Bài thử: 40 tin chưa đọc → nhận đúng 30; lần sau theo phương án chọn.

**Mục 25, 26, 27, 28 – bốn lỗi nhẹ của giải online** (đã mở code xác nhận cả bốn)
- 25: `tour-run.js:38-44` `on_tourKick`: thêm `if (!['scheduled','pending','running'].includes(t.status)) throw E('tour_closed')` trước khi ghi log. Bài thử: kick ở giải `finished` → lỗi, không có log.
- 26: `tour-reg.js:164-166`: đưa `tourLog(... 'reg_accept')` xuống sau `regAdmit` thành công (nếu `regAdmit` ném lỗi thì không log).
- 27: `tour-opts.js:99-127` (`attachTarget`/`on_tourAttach`): đòi `t.status` còn `running`/`scheduled` khi THÊM đính kèm (xoá vẫn cho). Cần chốt: người chơi có được đính kèm sau khi giải kết thúc không (có thể là chủ ý để nộp bằng chứng khiếu nại); khuyến nghị chỉ chặn khi `cancelled`/`finished` quá N ngày hoặc không làm.
- 28: `tour-tpl.js:35`: thêm `!data || Array.isArray(data)` vào điều kiện (mẫu `null` vượt qua `typeof null === 'object'`). Bài thử: `tourTplSave {data:null}` → `bad_message`.
- Rủi ro: thấp.

**Nghi 1 + mục 5 phòng thủ dữ liệu**: trong `rating.js` `upgradePools` (dòng 43-48) thêm bổ sung trường thiếu/NaN (`r`, `rd`, `vol`, `n`) từ `newPool(...)`. Chưa biết dữ liệu thật có hỏng không; làm rẻ, rủi ro thấp.

**Nghi 5** (`on_tourScore` không kiểm `m.hold`): ở nhánh online (`tour-score.js:73-76`) thêm `if (m.hold) throw E('tour_match_live')`-tương đương (cần mã lỗi mới `tour_match_held` + 4 chuỗi nếu muốn riêng) hoặc xoá `m.hold` và đóng khiếu nại liên quan khi BTC ghi đè. Chưa kiểm đầu-cuối nên làm sau cùng và kèm bài thử dựng khiếu nại mở rồi ghi đè.

### ĐỢT 3 – giao diện / client (1 PR; theo `chuan-giao-dien` và CLAUDE.md)

**Mục 18 – Cache ô cấm Renju**
- Hiện tại: `caro/board-view.js:243-251`: khoá `fbCache.key` = số nước + toạ độ nước cuối. `Board` không có hash (đã grep `rules-board.js`, `rules.js`).
- Sửa: khoá thêm tham chiếu: lưu `fbCache = { board: b, last: <đối tượng nước cuối>, n, cells }` và so `fbCache.board === b && fbCache.last === b.moves[n-1] && fbCache.n === n` (mỗi `play` tạo đối tượng nước mới nên undo rồi đi lại đường khác cho đối tượng khác; seek replay / vào giải đố tạo `Board` mới). Hoặc tối giản: xoá cache ở mọi chỗ đổi bàn (kém bền). Cần kiểm `Board.play` thật sự tạo đối tượng `{x,y,p}` mới mỗi lần (xem `rules-board.js`) trước khi chọn.
- Bài thử: test client mới `caro/tests/forbidden-cache.test.js` (thêm vào danh sách `coverage` của `server/package.json`): dựng hai thế cùng số nước và cùng ô cuối, khác nhau ở ô cấm → gọi lần lượt phải ra đúng. Cần xuất `forbiddenCells` hoặc kiểm qua hàm công khai.
- Rủi ro: thấp.

**Mục 19 – Undo không trả giờ cộng của đồng hồ tổng**
- Hiện tại: `app.js:154` gọi `LC.press` (cộng `inc`); `undo()` (`app.js:184-215`) nhánh thường không đụng `state.clocks`; chỉ nhánh hết giờ (dòng 194) xoá đồng hồ.
- Sửa: lưu ảnh chụp trước mỗi nước: trong nhánh đi nước, trước `LC.press` đẩy `{x: c.x, o: c.o}` (đã `settle`) vào `state.clockHist` (mảng, đặt `[]` khi ván mới / tải ván); `undo` pop đúng số nước bị lùi (AI mode lùi 2) rồi khôi phục `c.x`, `c.o` và gọi `LC.run` cho bên sắp đi (đã có `resetClock()` cuối). Cách rẻ hơn nhưng kém chính xác: undo trừ lại `c.inc` của bên đã đi mỗi nước bị lùi. Khuyến nghị cách ảnh chụp (đúng với cả thời gian đã dùng). `clockHist` không cần lưu vào `save()` (mất khi tải lại trang là chấp nhận được; hoặc chỉ coi undo sau tải lại không trả giờ).
- Bài thử: mở rộng `caro/tests/localclock.test.js` (đã có trong danh sách coverage): `press` rồi undo → quỹ giờ bằng trước nước đi; vòng đi-undo N lần không tăng quỹ.
- Rủi ro: trung bình (chạm vòng đời ván + `resetClock`); kiểm `local-games.test.js`.

**Mục 12 họ hàng** (PR #216 đã sửa nút "Xoá tỉ số" `app-dialogs.js:109-114`)
- `online-auth.js:65`: `if ($('av-remove')) $('av-remove').onclick = () => window.CaroAvatar.clear();` → `async` + `await window.CaroConfirm.ask(T('av_remove_q'))`. Chuỗi mới `av_remove_q` đủ vi/en/ru/zh theo `docs/van-phong-4-ngon-ngu.md`. Nên làm (không hoàn tác được).
- `club-talk.js:90` (`ccDel`, xoá một tin chat): khuyến nghị KHÔNG thêm hộp hỏi (người kiểm duyệt cần xoá nhanh, tin chat ngắn). Nếu Minh muốn thống nhất thì thêm `talk_chat_delete_q`.
- Bài thử: mở rộng `danger-confirm.test.js` hoặc thêm vào `confirm-dlg.e2e.js` ca xoá ảnh đại diện.

**Mục 11 (R1)**: không cần sửa lõi; xem mục 4 bên dưới. Việc tuỳ chọn: tách chiều cao thanh dính thành biến `--ot-tabs-h` dùng chung cho `scroll-padding-top`, để khi đổi kích cỡ nút tab không lệch. Ưu tiên thấp.

**Mục 30 – Test cấm dialog gốc có ba kẽ hở**: `server/test/no-native-dialogs.test.js`
- (a) quét thêm `caro/**/*.html` (cả thuộc tính `onclick="confirm("`); (b) bỏ cắt dòng ở `//` đầu tiên: dùng bộ gỡ chú thích thô nhưng an toàn cho chuỗi (hoặc chỉ cắt `//` khi đứng sau khoảng trắng/đầu dòng và không nằm trong dấu nháy); (c) regex mở rộng: `\b(window|globalThis|self|top)\s*(\.|\[\s*['"])(confirm|prompt|alert)` và `\b(confirm|prompt|alert)\s*\?\.\s*\(`. Kiểm xem không phát sinh dương tính giả (hiện không còn lời gọi gốc nào).
- Bài thử: thêm một vài chuỗi mẫu vào chính test để chứng minh regex bắt được.

**Mục 31 / 32**: `engine-position.js:81-84` (`pack` chồng khi y ≥ 32768; chỉ thêm kiểm `|y| < 32768` rồi trả `-1`/bỏ qua, hoặc ghi chú giới hạn); `board-view.js:275` `colName`: viết thuật toán bijective base 26 (`do { s = chr(97 + n % 26) + s; n = floor(n / 26) - 1 } while (n >= 0)`); thêm test cho 0, 25, 26, 701, 702 trong test engine / board. Rủi ro gần như không.

### ĐỢT 4 – mục thấp (một PR nhỏ gom)

- 21: `room-swap2.js:23` thay `this.drawOffer = null;` bằng `if (this.drawOffer && this.drawOffer !== id) this.declineDraw(); else this.drawOffer = null;` (khớp `room.js:187`). Bài thử: `syncroom.test.js` / `play2.test.js`: A xin hoà, B chọn bên → A bị `draw_wait`.
- 24: `club-talk.js:141-145` `topicDirty`: chỉ phát cho kết nối có quyền đọc diễn đàn (dùng đúng hàm `canForum(c, uid, false)` đã dùng ở `club-talk.js:~170`).
- 29: `disputes.js:84-95` trừ `streak` theo trạng thái hiện tại; chỉ sửa nếu tính được `streak` tại thời điểm ván (cần lưu `d.streakBefore`); khuyến nghị bỏ qua, ghi chú.
- 33: bỏ qua (lỗi nội bộ); nếu muốn gọn thì đổi chuỗi lỗi thành tiếng Anh `'Google script failed to load'`.
- Nghi 8 (`board-replay.js:60`, `app-ext.js:44`): `turn` nên theo số nước ĐÃ ghi được (`b.moves.length`) chứ không theo chỉ số gốc `i`; chỉ ảnh hưởng dữ liệu hỏng.
- Nghi 11 (`embed-run.js:36`): thêm `/^https?:$/.test(u.protocol)` cho `open.href`; rẻ, phòng thủ.
- Nghi 10, 12, 14, 15, 16, 7, 9 : chưa kiểm.

## 3. Câu hỏi cần Minh quyết

1. **Mục 2 / Nghi 4 – tự báo tỉ số (`selfReport`) đơn phương và kết quả chung kết không đảo ngược được.**
   - Tái hiện bằng code: `tour-score.js:48-60` + `71-108` đúng như Laplace; `tourScoreUndo` / `tourReset` đòi `running` (`tour-score.js:57`, `tour-manage.js:187`).
   - Phương án A (khuyến nghị): tự báo chỉ "đề xuất"; kết quả chốt khi đối thủ xác nhận cùng tỉ số hoặc BTC duyệt (hoặc tự chốt sau N phút nếu đối thủ im lặng, có cờ `m.pending`). Ít bất ngờ cho giải thân thiện.
   - Phương án B: giữ tự báo tức thì nhưng cho BTC (quyền `results`) sửa kết quả khi giải đã `finished` (mở khoá undo/reset cho trận trong giai đoạn cuối, tính lại `podium`, `tours.won`).
   - Phần an toàn làm ngay không cần chọn: ghi log + thông báo cho BTC khi có tự báo (đã có log `self_score`; thêm thông báo đẩy `note`), và giới hạn Bo (mục 15).
2. **Mục 20 – staff quyền `'all'`**: chú thích `tournaments.js:27-28` ("toàn quyền như người tạo, trừ phân quyền/xoá giải") không khớp `tour-run.js:22,31` (start/cancel chỉ `'owner'`) và các nơi dùng `managerOf(..., 'owner')` (`tour-manage.js:106,126,188,204,218`: reset, submit...).
   - Phương án A (khuyến nghị): nới start/cancel/reset/submit cho `'all'` đúng chú thích, giữ phân quyền và xoá giải chỉ cho owner.
   - Phương án B: sửa chú thích và nhãn quyền cho đúng hiện trạng (staff 'all' không bắt đầu / huỷ).
3. **Nghi 2 – nhãn điểm sửa tay Race**: server coi là GHI ĐÈ tổng (`stages-race.js:165` `rowPts`: `x.pts` thay luôn điểm theo hạng, kể cả điểm hạ gục) và test khoá (`stages-race.test.js:29-32`), nhưng nhãn `race_pts_auto` / `race_form_hint` (`i18n-otour.js:73-74` + en/ru/zh) ghi "Cộng / trừ điểm … thưởng hoặc phạt". Khuyến nghị đổi NHÃN thành "Điểm chặng (ghi đè)" 4 ngôn ngữ (không đổi dữ liệu đã lưu). Phương án khác: đổi server thành cộng thêm, phải sửa test và dữ liệu cũ.
4. **Nghi 3 – huỷ kết quả Offline không xoá `m.esp` / `m.events`** (`otour-undo.js:41` danh sách `Object.assign` không có hai trường): khuyến nghị xoá cả hai khi huỷ (thống kê tướng / thẻ / treo giò không nên tính trận đã huỷ), nhưng chủ giải có thể đã dựa vào việc giữ lại để nhập lại; hỏi.
5. **Nghi 4 / mục 2 (giải Offline)**: có cho chủ giải sửa tỉ số trận chung kết sau khi giải `finished` không? Khuyến nghị cho phép huỷ trận cuối khi giải còn trong 24h, chạy lại `finishStage`, và ghi log.
6. **Nghi 6 – đối đầu (h2h)**: hiện `miniPoints` dùng điểm trận (`stages-tiebreak.js:~107`). Khuyến nghị giữ thiết kế "đối đầu thuần" và chỉ thêm một dòng chú giải trong cấu hình thể thức; không đổi hành vi.
7. **Nghi 13 – huỷ kết quả Arena không hoàn Elo toàn cục**: khuyến nghị giữ (Elo không đảo ngược sạch; giải thích trong trang khiếu nại).
8. **Nghi 15 – các mục nhỏ nhóm CLB/giải**: chưa kiểm từng mục, xin Minh chọn mục nào đáng làm.
9. **Mục 17 – Buchholz Cut khi số đối thủ = số cần cắt**: `stages-tb-calc.js:37-39` ghi chú cố ý "ít phần tử hơn số cần cắt thì không cắt"; đầu file cũng không nêu quy tắc bằng nhau. Theo FIDE C.07 phần cắt hết thì 0. Khuyến nghị đổi `<=` thành `<` chỉ nếu Minh muốn bám FIDE tuyệt đối (đổi thứ hạng ở giải ít vòng); nếu không, thêm chú thích rõ và bỏ mục này. Kiểm trước `stages.test.js:409-427` và `otour-ties.test.js`.
10. **Mục 8b**: chọn hướng B (người được mời giải tổng mở được giải con riêng tư cùng chủ) hay A (khoá hẳn)? Khuyến nghị B.
11. **Mục 27**: có cho đính kèm bằng chứng sau khi giải kết thúc không? Khuyến nghị cho phép (phục vụ khiếu nại), bỏ mục này nếu Minh đồng ý.

## 4. Chỗ Laplace mô tả sai / thiếu hoặc không xác nhận được

**Mục 11 (R1) – lập luận về `scroll-padding-top` và `scrollIntoView({block:'nearest'})` là SAI** (kiểm bằng Chrome headless, file `/tmp/claude-0/-home-user-psychic-doodle/ec6dc74a-1267-549d-8294-7d5defbe5103/scratchpad/code-review/r1.html`):
- Dựng khung `overflow-y:auto` + `scroll-padding-top:64px` + thanh `position:sticky; top:0; height:53px` + phần tử đích. Kết quả đo (top của đích tính từ mép khung cuộn):
  - A: đích đang nằm một nửa dưới thanh dính (top=30) → `scrollIntoView({block:'nearest'})` kéo về 64 (không còn bị che);
  - B: đích ở dưới đáy → cuộn xuống vừa đủ (204);
  - C: đích đã trôi lên trên → kéo về 64 (ngay dưới thanh);
  - D: `focus()` ô nhập → ô hiện đầy đủ.
- Vậy `scroll-padding-top` có tác dụng với `scrollIntoView` kể cả `nearest` (nó thu nhỏ vùng nhìn thấy tối ưu), nên điều Laplace gọi là "còn hở" ở `otour-score.js:145` và `tour-score.js:109` không tái hiện được. Đúng là `scroll-padding` không tác dụng khi cuộn tay; nhưng đó là hành vi bình thường của `sticky` (nội dung trôi dưới thanh trong lúc cuộn, và rời khỏi thanh khi dừng cuộn), không phải lỗi. `docs/ke-hoach-sua-giao-dien-16-11-2026.md` (B1) đã nói đúng điều này.
- Phần lỗi thật (nếu có): (1) hai vị trí phụ mà Laplace chưa gán nguyên nhân (form Tạo giải Offline, hàng ở trang Cài đặt) – chưa kiểm; theo ảnh chụp của họ nên hỏi lại có phải do ảnh chụp lúc đang cuộn; (2) `scroll-padding-top: 64px` là số cứng so với chiều cao thật của thanh ~53px (6+6 đệm + nút 8+8+chữ + viền); an toàn nhưng nên dùng biến chung. `e2e/otour-ui.e2e.js` (L1: `coverAt` sau khi mở trận) đã kiểm phần tự cuộn.
- Có nên bỏ sticky? Không khuyến nghị: tab giải dài nhiều mục cần luôn thấy; đổi sang cuộn tab theo nội dung sẽ tệ hơn trên điện thoại. Không cần "thead dính" cho BXH (`table.stand`): đó là tính năng mới, không phải sửa lỗi.
- Về test "chỉ kiểm luật tồn tại" (`css-rules.test.js:48-52`): đúng; bù bằng e2e L1 (có chạy Chrome) là đủ; có thể thêm ca A ở trên (đích bị che một phần) vào `otour-ui.e2e.js` nếu muốn.

**Mục 22 (R3) – KHÔNG phải lỗi trong gói CSS thật** (`.../code-review/r3.html`): nạp đúng thứ tự `style.css → style-online.css → style-tour.css → shell.css` như `index.html:14-20`, chiều rộng 390px, tên giải 59 ký tự: `.titem .pn b` có `text-overflow: ellipsis`, `overflow:hidden`, `white-space:nowrap`, `display:block`, `.pn` giữ `min-width: 0`; đo `scrollWidth 444 > clientWidth 267` (tức bị cắt có "…"). Luật `.titem .pn { flex: 1 }` (`style-tour.css:96`) chỉ đặt `flex`, không ghi đè `min-width:0` của `.pn` (`style-online.css:142`). Laplace ghi đúng là "vay luật" nhưng "mất chữ cuối không có …" không tái hiện được. Nên đóng. Nếu vẫn thấy trên thiết bị thật, có thể do một trang nạp thiếu `style-online.css` (chưa kiểm các trang nhúng như `embed.html`) – nên thêm luật riêng `.titem .pn { min-width: 0 }` + `.titem .pn b {overflow:hidden; text-overflow:ellipsis; white-space:nowrap}` vào `style-tour.css` cho chắc (rẻ, an toàn).

**Mục 1**: nói `addMember` "không xoá yêu cầu khỏi `c.requests` ở đường vào thẳng" – đúng; còn `on_clubRequest` thì đã xoá yêu cầu trước khi `addMember`. Phần "hạ cấp quản lý" đúng (không kiểm `c.members[uid]`).

**Mục 12**: PR #216 đã xử lý nút "Xoá tỉ số"; hai họ hàng nêu ở đầu mục chưa xử lý (xem Đợt 3).

**Mục 17**: không hẳn là lỗi code: hàm có chú thích cố ý ("Ít phần tử hơn số cần cắt thì không cắt"); Laplace đúng ở chỗ khi bằng đúng số cần cắt thì khác FIDE; đây là chọn thiết kế, đã chuyển sang QĐ.

**Mục 23 (R4)**: đã ĐS: `style-tour.css:283-284` có `.ot-log` / `.ot-log li` dùng `gap: 2px 8px`.

**Mục 33**: không phải lỗi hiển thị (Laplace cũng nói vậy).

**Nghi 7 (`rules-ai.js vcf`), 9 (`an-pool.js` Worker `onerror`), 10, 12, 14, 15, 16**: CHƯA KIỂM (ngoài phạm vi thời gian); riêng `an-pool.js:76-90` mở ra thấy `onmessage` có xử lý `e.data.error` nhưng chưa thấy `onerror` / timeout cho trường hợp Worker chết – nhất quán với mô tả Laplace, chưa tái hiện.

**Chưa chạy**: các script tái hiện máy chủ của Laplace không có trên máy này; tôi KHÔNG tự chạy lại tái hiện mục 1/7/9/10 mà dựa vào đọc code (đủ chuỗi gọi). Khi làm, người thực hiện nên viết bài thử đỏ trước, rồi sửa.

## 5. Thứ tự đề nghị

1. Đợt 1 (bảo mật / quyền / riêng tư / sập): mục 1, 13a, 13c, 14, 4, 5, 6, 8 (a, b, c).
2. Đợt 2 (toàn vẹn dữ liệu giải): 7, 3, 9a, 9b, 10, 15, 16, 13b, 25-28, Nghi 1, Nghi 5.
3. Chờ Minh: 2, 20, Nghi 2, 3, 4, 6, 13, 17, 8b (hướng), 27.
4. Đợt 3 (client): 18, 19, 12 họ hàng, 30, 31, 32.
5. Đợt 4: 21, 24, 29, 33, Nghi 8, 11.
Kiểm sau mỗi đợt: `cd server && npm run coverage`; đợt 3 thêm `node caro/tests/e2e/otour-ui.e2e.js` và tăng `CACHE` trong `caro/sw.js`.

## 6. Kết quả thực hiện (16/11/2026)

Minh quyết: làm hết theo khuyến nghị. Đã làm trong một PR (ba commit theo đợt):

- **Đợt 1** (mục 1, 4, 5, 6, 8a/8b/8c, 13a, 13c, 14): xong. Bài thử `club-security`, `data-defense`, `otour-private`.
- **Đợt 2** (mục 3, 7, 9a, 9b, 10, 13b, 15, 16, 25, 26, 28, nghi ngờ 1): xong. Bài thử `integrity-1611`, thêm ca vào `tour.test.js`.
  Mục 13b làm theo hướng không mất tin (gửi 30 tin cũ nhất, phần còn lại ở lần vào sau).
- **Đợt 3** (mục 18, 19, 30, 32, nút xoá ảnh đại diện): xong. Mục 31 (`Position.pack` tràn khi |y| ≥ 32768) KHÔNG sửa – chỉ ảnh
  hưởng nước gợi ý ở toạ độ mà ván thật không tới được (máy chủ chặn ±512).
- **Đợt 4** (mục 21, 24, nghi ngờ 11): xong. Mục 29, 33, nghi ngờ 8: không sửa (như khuyến nghị / chỉ dữ liệu hỏng).
- **Quyết định sản phẩm:**
  1. Tự báo tỉ số = đề xuất; chốt khi đối thủ báo trùng hoặc ban tổ chức xác nhận (nút "Xác nhận tỉ số này", nhãn "Chờ xác nhận tỉ số").
  2. Quyền `'all'`: bắt đầu / huỷ / đặt lại / gửi duyệt được (quyền mới `'run'` trong `canManageTour`); phân quyền và xoá giải vẫn chỉ chủ giải.
  3. Nhãn ô điểm chặng: "Điểm chặng (ghi đè)" (4 ngôn ngữ).
  4. **KHÔNG làm** "huỷ kết quả thì xoá diễn biến trận / chi tiết ván": hai loại dữ liệu này ghi được cả TRƯỚC khi có kết quả và thống kê
     vốn đếm cả trận chưa có kết quả, nên xoá khi huỷ không làm thống kê đúng hơn mà còn làm mất công nhập khi chỉ sửa một tỉ số gõ nhầm.
  5. Giải offline: trong 24 giờ sau khi kết thúc còn huỷ được kết quả TRẬN của giai đoạn cuối (giải mở lại "đang diễn ra"). Chưa áp dụng
     cho giai đoạn cuối là chặng đua (race).
  6. Mục 8b theo hướng B. 7. Buchholz Cut (mục 17): giữ nguyên. 8. Đính kèm sau khi giải kết thúc (mục 27): giữ nguyên. 9. Đối đầu và Elo Arena: giữ nguyên.
- **Chưa kiểm / chưa làm:** nghi ngờ 5, 7, 9, 10, 12, 14, 15, 16; mục 29. Chưa có bài thử tự động riêng cho mục 18 (ô cấm Renju), 24, 32 và link trang nhúng.
