# Kế hoạch triển khai UI quản lý Teams Auto Report

## 1. Mục tiêu

Xây dựng một ứng dụng web bằng Next.js và shadcn/ui để người dùng:

- Xem danh sách thành viên và thông tin công khai của các thành viên khác.
- Xem task hiện tại, tiến độ và lịch sử đăng báo cáo của bản thân.
- Chỉnh sửa task, pending list, innovation và lịch đăng của bản thân.
- Tạo và quản lý group dùng chung để tạo parent post.
- Chọn group mà báo cáo của mình sẽ reply vào.
- Không được xem hoặc chỉnh sửa access token, refresh token và browser session.
- Không được chỉnh sửa task hoặc cấu hình riêng của người khác.
- Mọi thay đổi hợp lệ trên UI được API ghi trở lại các file JSON hợp nhất trong `users/<id>/`.

## 2. Phạm vi phiên bản đầu tiên

### Bao gồm

- Đăng nhập và đăng xuất.
- Phân quyền owner/admin cơ bản.
- Trang danh sách thành viên.
- Trang chi tiết member ở chế độ xem.
- Trang chỉnh sửa task của member đang đăng nhập.
- Trang lịch sử post.
- CRUD group.
- Chọn group cho member.
- Cấu hình title, nội dung parent post và lịch đăng theo group.
- API đọc/ghi JSON an toàn.
- Audit log cho các thay đổi từ UI.

### Chưa bao gồm

- Hiển thị hoặc chỉnh sửa `auth`.
- Hiển thị token, cookie hoặc dữ liệu trong `.browser-profiles`.
- Đăng nhập Microsoft OAuth để lấy Teams token.
- Điều khiển trực tiếp tiến trình `npm run watch` từ UI.
- Xóa bài đã đăng trên Microsoft Teams.
- Database bên ngoài trong phiên bản đầu tiên.

## 3. Kiến trúc đề xuất

Sử dụng một Next.js application chạy cùng máy và cùng workspace với `auto_report.js`.

```text
Browser
   |
   v
Next.js + shadcn/ui
   |
   +-- Auth/session
   +-- Authorization policy
   +-- Route handlers / server actions
   +-- JSON repository layer
           |
           +-- users/<member_id>/config.json
           +-- users/<member_id>/credentials.json
           +-- users/<member_id>/state.json
           +-- users/<user_id>/account.json
           +-- groups/<group_id>/config.json
           +-- audit/events.jsonl

auto_report.js
   |
   +-- đọc member config
   +-- resolve group config
   +-- tạo/tìm parent post
   +-- reply report
```

Không cho client browser truy cập trực tiếp filesystem. Tất cả thao tác phải đi qua server-side API và authorization policy.

## 4. Cấu trúc thư mục dự kiến

Có thể đặt UI trong thư mục `web/` để tách khỏi bot hiện tại:

```text
.
|-- auto_report.js
|-- users/
|   `-- <id>/
|       |-- account.json
|       |-- config.json
|       |-- credentials.json
|       `-- state.json
|-- groups/
|   `-- <group_id>/
|       `-- config.json
|-- audit/
|   `-- events.jsonl
|-- web/
|   |-- app/
|   |-- components/
|   |-- lib/
|   |   |-- auth/
|   |   |-- permissions/
|   |   |-- repositories/
|   |   |-- schemas/
|   |   `-- services/
|   |-- public/
|   |-- package.json
|   `-- next.config.ts
`-- NEXTJS_UI_IMPLEMENTATION_PLAN.md
```

## 5. Mô hình dữ liệu

### 5.1 User đăng nhập

User đăng nhập chỉ dùng cho UI, tách biệt với `auth` dùng để gọi Microsoft Teams.

File triển khai: `users/<member_id>/account.json`. Tên folder và `user.id` là ID ổn định của member; `username` là thông tin đăng nhập có thể đổi độc lập. `config.json`, `credentials.json` và `state.json` nằm cạnh `account.json`.

```json
{
  "id": "le_cong_tuan",
  "username": "le_cong_tuan",
  "passwordHash": "<bcrypt-hash>",
  "memberId": "le_cong_tuan",
  "role": "member",
  "enabled": true
}
```

Quy tắc:

- Không lưu mật khẩu dạng plain text.
- Dùng Argon2id hoặc bcrypt để hash mật khẩu.
- Một user thường liên kết với đúng một `memberId`.
- `member` chỉ sửa member được liên kết.
- `admin` có thể quản lý user/group; quyền sửa task người khác cần được quyết định riêng.

### 5.2 Group

Group đại diện cho một parent-post target dùng chung.

File đề xuất: `groups/<group_id>/config.json`.

```json
{
  "id": "advance_uav_navigation",
  "name": "Advance UAV Navigation System",
  "enabled": true,
  "teams": {
    "threadId": "19:<channel-id>@thread.tacv2",
    "teamId": "19:<team-id>@thread.tacv2",
    "conversationLinkPrefix": "https://teams.cloud.microsoft/l/message"
  },
  "parentPost": {
    "searchTitleTemplate": "ADVANCE UAV NAVIGATION SYSTEM - Báo cáo ngày {DD}/{MM}/{YYYY}",
    "contentTemplate": "<p>ADVANCE UAV NAVIGATION SYSTEM - Báo cáo ngày {DD}/{MM}/{YYYY}</p>",
    "timezone": "Asia/Bangkok",
    "days": [1, 2, 3, 4, 5],
    "skipDates": [],
    "extraWorkDates": [],
    "postAfterTime": "17:28"
  },
  "createdBy": "le_cong_tuan",
  "createdAt": "2026-07-23T00:00:00.000Z",
  "updatedAt": "2026-07-23T00:00:00.000Z",
  "version": 1
}
```

### 5.3 Member config sau khi hỗ trợ group

Member chỉ giữ cấu hình reply/report riêng và tham chiếu tới group.

```json
{
  "id": "le_cong_tuan",
  "enabled": true,
  "groupId": "advance_uav_navigation",
  "schedule": {
    "postAfterTime": "17:30",
    "postAfterRandomWindowMinutes": 20,
    "skipIfBeforePostTime": true
  },
  "tasks": [],
  "pending": [],
  "innovations": [],
  "report": {},
  "author": {
    "displayName": "Lê Công Tuấn"
  }
}
```

Teams `auth`, browser config và author identity nhạy cảm nằm trong `users/<member_id>/credentials.json`. `config.json` chỉ giữ `author.displayName` an toàn. API công khai không trả credentials về client.

### 5.4 Member state

Tiếp tục dùng `users/<member_id>/state.json` cho:

- `postedReports`
- `dailyPlans`
- `monthlyReports`
- `parentPosts`
- `browserRenewals`

UI chỉ nên trả các field cần thiết. Không trả `browserRenewals.lastError` nếu lỗi có thể chứa dữ liệu nhạy cảm từ OAuth response.

### 5.5 Audit log

File đề xuất: `audit/events.jsonl`.

Mỗi dòng là một JSON object:

```json
{
  "id": "<uuid>",
  "actorUserId": "le_cong_tuan",
  "action": "member.tasks.update",
  "targetType": "member",
  "targetId": "le_cong_tuan",
  "timestamp": "2026-07-23T00:00:00.000Z",
  "requestId": "<uuid>",
  "changes": {
    "fields": ["tasks"]
  }
}
```

Không ghi token, password hash hoặc toàn bộ config vào audit log.

## 6. Authentication và session

### Phương án đề xuất cho phiên bản đầu tiên

- Dùng Auth.js với Credentials Provider hoặc một session implementation server-side tương đương.
- Cookie session phải có `HttpOnly`, `Secure` khi chạy HTTPS và `SameSite=Lax`.
- Secret session lấy từ environment variable, không ghi vào source code.
- Password hash nằm trong `users/<id>/account.json` và không commit.
- Thêm rate limit cho login.
- Sau nhiều lần login sai, áp dụng cooldown tạm thời.

### Environment dự kiến cho UI

```env
AUTH_SECRET=<random-secret>
APP_BASE_URL=https://report.example.com
JSON_DATA_ROOT=/absolute/path/to/teams-auto-report
```

Không đưa Microsoft refresh token/access token vào environment của browser client.

## 7. Authorization policy

Quyền phải được kiểm tra tại server, không chỉ ẩn nút trên UI.

| Hành động | Guest | Member | Group owner | Admin |
|---|---:|---:|---:|---:|
| Xem danh sách member công khai | Không | Có | Có | Có |
| Xem task member khác | Có thể cho phép read-only | Có | Có | Có |
| Sửa task bản thân | Không | Có | Có | Có |
| Sửa task member khác | Không | Không | Không | Tùy chính sách |
| Tạo group | Không | Có | Có | Có |
| Sửa group | Không | Không | Có | Có |
| Chọn group cho bản thân | Không | Có | Có | Có |
| Xem/chỉnh auth Teams | Không | Không | Không | Không qua UI |

Policy tối thiểu:

```text
canEditMember(session, targetMemberId)
  = session.memberId === targetMemberId

canEditGroup(session, group)
  = session.role === "admin" OR group.createdBy === session.userId
```

## 8. API đề xuất

### Authentication

- [x] Login/logout bằng Next.js Server Actions tương đương route API, có validation và rate limit.
- [x] `GET /api/auth/session`

Nếu dùng Auth.js thì sử dụng route chuẩn của Auth.js.

### Members

- [x] `GET /api/members`
  - Trả danh sách member công khai.
  - Không trả `auth`, token, password hoặc browser profile details.
- `GET /api/members/:memberId`
  - Trả task/config an toàn và trạng thái read-only.
- `PATCH /api/members/:memberId/tasks`
  - Chỉ owner của member được phép gọi.
- `PATCH /api/members/:memberId/report-config`
  - Sửa `tasks`, `pending`, `innovations`, `report`, reply schedule.
- `PATCH /api/members/:memberId/group`
  - Chọn `groupId` cho member hiện tại.
- `GET /api/members/:memberId/history`
  - Trả `postedReports` đã chuẩn hóa và phân trang.

### Groups

- `GET /api/groups`
- `POST /api/groups`
- `GET /api/groups/:groupId`
- `PATCH /api/groups/:groupId`
- `DELETE /api/groups/:groupId`
  - Giai đoạn đầu nên dùng soft delete: `enabled=false`.
  - Không cho disable/delete nếu vẫn còn member sử dụng, trừ khi admin xác nhận migration.

### Audit

- `GET /api/audit/me`
- `GET /api/audit` dành cho admin nếu cần.

## 9. Validation

Dùng Zod cho toàn bộ request body và dữ liệu JSON đọc từ disk.

Các validation quan trọng:

- `memberId`, `groupId`: chỉ cho phép `[a-z0-9_-]` và giới hạn độ dài.
- Không dùng trực tiếp route parameter để ghép path nếu chưa validate.
- `postAfterTime`: format `HH:mm` hợp lệ.
- `days`: chỉ nhận số nguyên `0..6`.
- `skipDates`, `extraWorkDates`: format `YYYY-MM-DD`.
- `dailyIncreaseRange`: hai số hữu hạn, min không lớn hơn max.
- `startPercent`, `maxPercent`: giới hạn hợp lý, ví dụ `0..100`.
- Title/content template: giới hạn kích thước.
- HTML content: cần whitelist/sanitize trước khi preview trên UI.
- `threadId`, `teamId`: validate prefix/format cơ bản.

API dùng allowlist field. Không nhận nguyên object config từ client rồi ghi đè xuống disk.

## 10. Repository layer và ghi JSON an toàn

Tạo repository server-side thay vì đọc/ghi file trực tiếp trong route handler:

```text
MemberRepository
GroupRepository
UserRepository
AuditRepository
```

Quy trình update:

1. Resolve đường dẫn từ ID đã validate.
2. Đọc JSON hiện tại.
3. Validate JSON hiện tại bằng schema.
4. Kiểm tra authorization.
5. Chỉ merge các field được phép.
6. Validate kết quả sau merge.
7. Ghi vào file tạm cùng filesystem.
8. `fsync` nếu cần.
9. Atomic rename file tạm thành file chính.
10. Ghi audit event.

Phải dùng lock theo resource để tránh UI và `auto_report.js` cùng ghi một file:

```text
.locks/member-<member_id>.lock
.locks/ui-group-<group_id>.lock
```

### Vấn đề concurrency cần xử lý

`auto_report.js` có thể cập nhật task progress và state đúng lúc UI lưu task. Nếu UI đọc config cũ rồi ghi toàn bộ object, tiến độ mới có thể bị mất.

Giải pháp:

- API chỉ patch field được gửi, không replace toàn bộ config.
- Thêm `version` hoặc ETag.
- Client gửi `expectedVersion`.
- Nếu version khác, API trả `409 Conflict` và yêu cầu reload.
- Bot và UI dùng chung tên lock member; bot reload dữ liệu sau khi lấy lock và tăng version khi persist config.

## 11. UI pages

### `/login`

- Username/password.
- Hiển thị lỗi chung, không tiết lộ user có tồn tại hay không.

### `/dashboard`

- Thông tin member hiện tại.
- Task đang thực hiện và phần trăm.
- Group đang chọn.
- Giờ reply kế tiếp.
- Trạng thái report gần nhất.

### `/members`

- Danh sách member.
- Tên, task, tiến độ và lần report gần nhất.
- Member khác chỉ ở chế độ read-only.

### `/members/[memberId]`

- Tab `Tasks`.
- Tab `Post history`.
- Tab `Report configuration`.
- Tab `Daily plans` nếu cần.
- Nút edit chỉ xuất hiện khi có quyền; API vẫn phải kiểm tra lại.

### `/me/tasks`

- Thêm, sửa, xóa, sắp xếp task.
- Cấu hình `startPercent`, `dailyIncrease`, `dailyIncreaseRange`, `maxPercent`.
- Cảnh báo khi thay đổi thứ tự task vì state hiện có thể dùng index làm key.
- Nên tự tạo `task.id` ổn định khi thêm task mới.

### `/groups`

- Danh sách group.
- Group đang sử dụng và số member đang tham gia.
- Tạo group mới.

### `/groups/new` và `/groups/[groupId]/edit`

- Tên group.
- `threadId`, `teamId`.
- Title template.
- Parent content template.
- Timezone, ngày đăng, ngày nghỉ, ngày làm bù.
- Giờ tạo parent post.
- Preview title/content.

### `/me/group`

- Chọn group để reply.
- Hiển thị preview parent title và lịch group.
- Xác nhận trước khi chuyển group nếu ngày hiện tại đã có report.

## 12. Component shadcn/ui dự kiến

- `Sidebar`
- `Card`
- `DataTable`
- `Tabs`
- `Form`
- `Input`
- `Textarea`
- `Select`
- `Calendar`
- `Checkbox`
- `Switch`
- `Dialog`
- `AlertDialog`
- `Toast/Sonner`
- `Badge`
- `Progress`
- `Skeleton`

Form dùng React Hook Form + Zod resolver.

## 13. Thay đổi cần thiết trong `auto_report.js`

### Tách group config

Khi load member:

1. Đọc `member.groupId`.
2. Đọc `groups/<groupId>/config.json`.
3. Resolve cấu hình runtime:
   - Group cung cấp `teams` và parent schedule/template.
   - Member cung cấp reply schedule, tasks, author và auth.
4. Không ghi group config vào member config khi persist state.

### Parent cache

Cache key nên bao gồm:

```text
groupId + threadId + reportDate
```

Không nên phụ thuộc vào member ID. Title chỉ dùng để search/validate; group phải là nguồn title duy nhất.

### Task ID ổn định

Mỗi task cần có `id`:

```json
{
  "id": "task_<uuid>",
  "title": "..."
}
```

`dailyPlans.taskIncreases` và `progressAppliedTasks` dùng task ID thay vì index. Việc này tránh sai tiến độ khi UI reorder hoặc xóa task.

## 14. Migration dữ liệu hiện tại

### Bước 1: Backup

Backup tối thiểu:

```text
users/
groups/
.state/
```

### Bước 2: Tạo group từ cấu hình Teams hiện tại

- Gom các member có cùng `threadId`, `teamId` và title vào một group.
- Di chuyển parent title/content/schedule sang group.
- Thêm `groupId` vào từng member.

### Bước 3: Thêm task ID

- Sinh ID cho task chưa có ID.
- Chuyển key dạng `"0"`, `"1"` trong daily plan sang task ID tương ứng.
- Không thay đổi `startPercent` hoặc lịch sử đã post.

### Bước 4: Tạo UI users

- Tạo một UI user cho mỗi member.
- Đặt mật khẩu ban đầu qua CLI hoặc admin flow.
- Không đưa mật khẩu mặc định vào Git.

### Bước 5: Hợp nhất member và user

- [x] Di chuyển `members/<id>/config.json` và `state.json` sang `users/<id>/`.
- [x] Đổi credential UI sang `users/<id>/account.json`.
- [x] Tách Teams `auth` và browser config sang `users/<id>/credentials.json` để token refresh không ghi `config.json`.
- [x] Đồng bộ lock member giữa Web/bot, bot reload config sau khi lấy lock và tăng `version` khi cập nhật progress.
- [x] Refactor Web repositories, account CLI, backup/restore, Docker mounts và `auto_report.js`.
- [x] Migration có dry-run, collision check và backup phục hồi trong `.backups/`.

### Bước 5: Chạy migration dry-run

- In danh sách file sẽ thay đổi.
- In mapping member -> group.
- In mapping task index -> task ID.
- Chỉ ghi file khi chạy với flag xác nhận.

## 15. Security checklist

- [ ] Không trả field `auth` qua API.
- [ ] Không trả refresh/access token trong error response hoặc log UI.
- [ ] Không phục vụ trực tiếp thư mục repo bằng static file server.
- [ ] Validate và canonicalize mọi path parameter.
- [ ] Chống path traversal.
- [ ] Kiểm tra authorization trong từng mutation endpoint.
- [ ] CSRF protection cho cookie-based mutation.
- [ ] Rate limit login và mutation endpoints.
- [ ] Password hash bằng Argon2id/bcrypt.
- [ ] Session secret đủ mạnh.
- [ ] HTTPS khi truy cập qua mạng.
- [ ] HTML preview được sanitize.
- [x] Atomic write và resource lock.
- [ ] Audit log không chứa secret.
- [ ] Backup/restore được kiểm thử.

## 16. Testing strategy

### Unit tests

- Zod schemas.
- Authorization policy.
- Redaction serializer: chắc chắn không trả `auth`.
- Member/group repository.
- Atomic write và version conflict.
- Group resolution cho bot.
- Task ID migration.

### Integration tests

- Login thành công/thất bại.
- Member chỉ sửa được task của chính mình.
- Member xem được task người khác ở read-only.
- Group owner sửa được group.
- User chọn group và config member được cập nhật.
- API trả `409` khi version cũ.
- Bot đọc được cấu hình sau khi UI ghi.

### End-to-end tests

- Login -> sửa task -> reload -> dữ liệu còn đúng.
- Tạo group -> chọn group -> dashboard hiển thị đúng.
- Hai user cùng sửa resource -> một request nhận conflict.
- UI không bao giờ render token/auth data.

## 17. Kế hoạch triển khai theo phase

### Phase 0: Chốt yêu cầu

- Chọn hình thức login.
- Chốt vai trò admin.
- Chốt ai được tạo/sửa group.
- Chốt task của member khác có được xem đầy đủ hay chỉ xem summary.
- Chốt group owner có được thay đổi `threadId/teamId` sau khi đã có report hay không.

### Phase 1: Data model và repository

- [x] Tạo Zod schemas cho member, state, task, schedule và UI user.
- [ ] Tạo repositories đọc/ghi JSON. *(Đã có MemberRepository, UserRepository và JSON helper; còn Group/Audit repository và mutation.)*
- [x] Atomic write, UI resource lock, optimistic version conflict và audit JSONL cho member task mutation.
- [x] Test redaction auth.

### Phase 2: Refactor bot hỗ trợ group

- [x] Tạo group schema và GroupRepository.
- [x] Resolve member + group runtime config từ cấu trúc hợp nhất `users/<member_id>/`.
- [x] Sửa parent cache theo `groupId + threadId + reportDate`.
- [x] Migration group hiện tại với dry-run mặc định và backup trước khi apply.
- [x] Unit test group resolution, persistence redaction và shared parent cache key.
- [x] Dry-run mô phỏng parent chưa tồn tại bằng `wouldCreate`, không ghi cache và không post Teams.

### Phase 3: Next.js foundation

- [x] Khởi tạo Next.js App Router + TypeScript.
- [x] Cài Tailwind v4 và khởi tạo shadcn/ui với component foundation.
- [x] Layout, green theme và responsive navigation dùng chung cho desktop/mobile.
- [x] Auth/session bằng credential nội bộ, bcrypt và signed HttpOnly cookie.
- [x] Authorization policy cơ bản cho member, group owner và admin.
- [x] CLI bootstrap/reset password với prompt ẩn và bcrypt hash; mỗi account lưu tại `users/<member_id>/account.json`, username có thể đổi độc lập.
- [x] Trang tài khoản self-service đổi username/mật khẩu, yêu cầu mật khẩu hiện tại, chống username trùng và đăng xuất sau cập nhật.
- [x] Khởi tạo account cho toàn bộ member hiện có với username ban đầu bằng member ID; yêu cầu user đổi mật khẩu mặc định sau khi đăng nhập.
- [x] Local admin onboarding: tạo account/member, chọn group, browser login Teams, tách credentials/profile và hướng dẫn copy cả hai lên server.
- [x] Member ID onboarding là read-only và được server tự sinh từ tên hiển thị theo dạng bỏ dấu, chữ thường, phân cách `_`.
- [x] Onboarding chỉ báo hoàn tất khi browser renew thành công; bot trả exit code lỗi nếu không lấy được token.
- [x] Lock Web/bot tự thu hồi khi PID chủ sở hữu không còn chạy, thay vì chỉ chờ hết thời gian stale.
- [x] Local admin có thể xóa account vừa tạo cùng browser profile và lock mồ côi; yêu cầu nhập đúng Member ID, chặn xóa account đang đăng nhập và chặn khi tiến trình còn chạy.
- [x] Chuẩn hóa JSON member bằng migration dry-run/backup: version bắt buộc, report number canonical và loại field daily status cũ.
- [x] Phân loại runtime data khỏi Git; archive migration lịch sử, xóa schema/assets/rule cũ và đồng bộ tài liệu cấu trúc dữ liệu.
- [x] Admin bật/tắt user tại trang Thành viên, đồng bộ `account.enabled` (đăng nhập Web) và `config.enabled` (bot report), audit/version-check và vô hiệu session ngay khi khóa.
- [x] Sửa AppShell responsive: desktop navigation không wrap, tablet/laptop chuyển sang Sheet và task increase switch không overflow trên mobile.
- [x] Daily check-in lưu lựa chọn “Hôm nay tôi sẽ báo cáo” theo ngày trong `state.dailyPlans`, giữ trạng thái sau reload mà không thay đổi lịch mặc định; ngày đặc biệt vẫn thêm `extraWorkDates`.
- [x] Group holiday calendar: áp dụng lịch nghỉ hành chính Việt Nam 2026 từ nguồn Chính phủ, chọn nhiều ngày bằng date picker, hỗ trợ ngày làm bù và member overtime override từ Home.
- [x] Token keepalive: tách ngưỡng access-token theo phút, giữ refresh-token expiry khi Microsoft không trả lại, và browser renew chỉ nhận authorization-code token mới để tránh mở browser lặp.
  - Password policy hiện tại: tối thiểu 6 ký tự theo yêu cầu vận hành.

### Phase 4: Member UI

- [x] Members list.
- [x] Member detail read-only với tabs Tasks, Post history và Report configuration summary.
- [x] Dashboard cá nhân: current task/progress, group, reply schedule và report gần nhất.
- [x] Daily check-in trên Home với câu hỏi luân phiên, skip riêng ngày hiện tại; ngày ngoài lịch group cho phép member override báo cáo để bot tạo parent chung và reply riêng.
- [x] Task editor: thêm/xóa/sắp xếp, progress, switch tăng cố định/ngẫu nhiên theo khoảng, ownership policy, CSRF, version conflict và audit.
- [x] Task editor: switch tùy chọn loại task có `startPercent >= 100` khỏi daily report; mặc định tắt và task vẫn hiển thị trên UI.
- [x] Post history serializer an toàn và API phân trang.
- [x] Report config editor: reply schedule, report numbering, pending và innovations với owner-only mutation/audit.
- [x] Report config editor: override số report ban đầu theo tháng cho member tham gia giữa tháng, giải thích công thức và lịch tháng/năm chọn ngày nghỉ/ngày đi làm riêng; bot đồng bộ override vào monthly state hiện có.

### Phase 5: Group UI

- [x] Group list/detail với member count và owner/admin access.
- [x] Create/edit/soft-disable group với version, lock, audit và kiểm tra member đang sử dụng.
- [x] Parent post title/HTML preview trong sandbox.
- [x] Member chọn group, có xác nhận nếu ngày hiện tại đã report.

### Mobile UI audit

- [x] Responsive App Shell/Sheet navigation ở tablet và mobile.
- [x] Chống overflow cho member tabs, history table và long resource IDs.
- [x] Task card actions/form/footer responsive trên màn hình hẹp.
- [x] Chuẩn hóa feedback mutation toàn Web bằng shadcn Sonner toast; bỏ success/error/conflict alert inline khỏi content.
- [x] Group forms, action bars và selectors dùng layout mobile-first.

### Phase 6: Hardening

- [x] Audit UI/API với member self-scope và admin all-scope.
- [x] Login rate limit và mutation rate limit theo user/IP.
- [x] CSRF same-origin và security headers/CSP.
- [x] Backup/restore CLI có manifest, dry-run và pre-restore safety backup.
- [x] Concurrency test cho resource lock và optimistic version conflict.
- [x] Docker/Compose deployment cho bot + web, volume data dùng chung và non-root UID/GID.
- [x] Đồng bộ tài liệu quy trình onboarding an toàn: Web local tự chạy one-shot renew, không chạy local watcher song song với Docker scheduler.

## 18. Tiêu chí hoàn thành MVP

- User đăng nhập và chỉ sửa được member của mình.
- User xem được danh sách member khác nhưng không mutation được dữ liệu của họ.
- User tạo group và chọn group cho mình.
- Group config là nguồn duy nhất cho parent post.
- Bot vẫn đăng parent/reply đúng sau khi chuyển sang group model.
- UI không trả hoặc log bất kỳ Teams auth token nào.
- JSON write có validation, lock, atomic rename và audit.
- Có backup và migration script cho dữ liệu hiện tại.
- Có test chứng minh không thể sửa task của user khác.

## 19. Các quyết định cần bổ sung

Vui lòng chỉnh sửa hoặc trả lời các điểm sau trước khi bắt đầu implement:

1. Login bằng username/password nội bộ hay Microsoft Entra ID?
2. Có role `admin` hay mọi user ngang quyền?
3. Admin có được sửa task của người khác không?
4. Task của người khác hiển thị toàn bộ hay chỉ title/progress?
5. Mọi member có quyền tạo group hay chỉ admin?
6. Người tạo group có quyền sửa/xóa group vĩnh viễn không?
7. Một member chỉ thuộc một group hay có thể thuộc nhiều group?
8. Một report có thể reply vào nhiều group không?
9. Có cần UI preview chính xác HTML sẽ gửi lên Teams không?
10. Có cần UI chạy test/dry-run hoặc kích hoạt post thủ công không?
11. Có cần giữ JSON làm storage lâu dài hay dự kiến chuyển sang SQLite/PostgreSQL?
12. UI sẽ chỉ chạy nội bộ trên một máy hay được public qua domain/HTTPS?
