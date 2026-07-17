# Teams Daily Report Bot

Tool này tự động tạo post cha và reply báo cáo ngày vào Microsoft Teams channel/thread. Script hỗ trợ nhiều người bằng cách quét từng file trong `members/*.json`.

## Luồng Hoạt Động

1. Script load `.env`, sau đó đọc tất cả file trong `members/*.json`.
2. Với mỗi member `enabled: true`, script tính ngày hiện tại theo timezone.
3. Đến giờ tạo post cha, script tìm bài theo `teams.searchTitleTemplate`.
4. Nếu chưa có post cha, script tạo post cha trong channel.
5. Đến giờ report của member, script build nội dung từ `tasks`, `pending`, `innovations`.
6. Script reply vào post cha.
7. Sau khi reply thành công, script cập nhật:
   - `postedReports[YYYY-MM-DD].checked = true`
   - `tasks[].startPercent`
   - `dailyPlans`
   - token cache trong `auth.<profile>.token`

Script có lock trong `.locks/` để hạn chế chạy trùng cùng member.

## File Chính

```txt
.
├─ auto_report.js
├─ .env
├─ example.json
├─ members/
│  └─ <member_id>.json
└─ .gitignore
```

Không commit `.env`, `members/*.json`, token, hoặc `.locks/`.

## Tạo Member Mới

1. Copy `example.json` thành file mới:

   ```txt
   members/<member_id>.json
   ```

2. Sửa các field quan trọng:

   ```txt
   id
   auth.common.anchorMailbox
   auth.common.refreshToken
   teams.threadId
   teams.teamId
   author.from
   author.fromUserId
   author.displayName
   schedule
   report
   tasks
   pending
   innovations
   ```

3. Giữ state ban đầu là object rỗng:

   ```json
   "parentPosts": {},
   "postedReports": {},
   "dailyPlans": {}
   ```

4. Test auth:

   ```bash
   node auto_report.js --test-auth spaces --member <member_id>
   node auto_report.js --test-auth substrate --member <member_id>
   node auto_report.js --test-auth ic3 --member <member_id>
   ```

## Cấu Hình `.env`

`.env` chỉ nên chứa cấu hình dùng chung:

```env
AUTH_REFRESH_URL=https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token
AUTH_REFRESH_CONTENT_TYPE=application/x-www-form-urlencoded

MS_ORIGIN=https://teams.cloud.microsoft
MS_CLIENT_INFO=1
MS_X_CLIENT_SKU=msal.js.browser
MS_X_CLIENT_VER=5.6.3
MS_X_MS_LIB_CAPABILITY=retry-after, h429
MS_X_CLIENT_CURRENT_TELEMETRY=5|61,0,,,
MS_X_CLIENT_LAST_TELEMETRY=5|0|||0,0

SEARCH_API_URL=https://substrate.office.com/searchservice/api/v2/query
PARENT_SEARCH_METHOD=substrate
POST_API_BASE_URL=https://teams.cloud.microsoft/api/chatsvc/apac/v1/users/ME/conversations

REPORT_TIMEZONE=Asia/Bangkok
WATCH_INTERVAL_MINUTES=5
RUN_LOCK_STALE_MINUTES=240
TOKEN_REFRESH_BEFORE_HOURS=12
PARENT_POST_AFTER_TIME=17:25
REPORT_POST_RANDOM_WINDOW_MINUTES=0
PARENT_SEARCH_RETRY_COUNT=3
PARENT_SEARCH_RETRY_MS=2000
```

## Cấu Trúc Auth

Template hiện dùng một refresh token chính trong `auth.common.refreshToken`.

```json
{
  "auth": {
    "common": {
      "clientId": "5e3ce6c0-2b1f-4285-8d4b-75ee78787346",
      "redirectUri": "https://teams.cloud.microsoft/v2/authv2",
      "brkClientId": "5e3ce6c0-2b1f-4285-8d4b-75ee78787346",
      "brkRedirectUri": "https://teams.cloud.microsoft/v2/authv2",
      "includeBrkFields": false,
      "anchorMailbox": "Oid:<user-oid>@<tenant-id>",
      "refreshToken": "PASTE_TEAMS_WEB_REFRESH_TOKEN_HERE"
    },
    "spaces": {
      "scope": "https://api.spaces.skype.com/.default openid profile offline_access",
      "storeTokenInMember": true,
      "reusePrimaryRefreshToken": true
    },
    "substrate": {
      "scope": "https://substrate.office.com/.default openid profile offline_access",
      "storeTokenInMember": true,
      "reusePrimaryRefreshToken": true
    },
    "ic3": {
      "scope": "https://ic3.teams.office.com/.default openid profile offline_access",
      "storeTokenInMember": true,
      "reusePrimaryRefreshToken": true,
      "claims": {
        "access_token": {
          "xms_cc": {
            "values": ["CP1"]
          }
        }
      }
    }
  }
}
```

Ý nghĩa:

- `auth.common`: metadata chung và refresh token chính.
- `auth.spaces`: lấy access token `aud=https://api.spaces.skype.com`.
- `auth.substrate`: lấy access token `aud=https://substrate.office.com`, dùng để search post cha.
- `auth.ic3`: lấy access token `aud=https://ic3.teams.office.com`, dùng để tạo post cha và reply report.

Nếu một profile không đổi token được bằng `auth.common.refreshToken`, thêm refresh token riêng vào profile đó:

```json
"auth": {
  "ic3": {
    "refreshToken": "PASTE_PROFILE_SPECIFIC_REFRESH_TOKEN_HERE"
  }
}
```

## Cách Lấy Refresh Token

Mở Teams web:

```txt
https://teams.cloud.microsoft/
```

Trong Chrome DevTools:

1. Mở tab Network.
2. Bật `Preserve log`.
3. Reload Teams.
4. Filter:

   ```txt
   oauth2/v2.0/token
   ```

5. Tìm request token có:

   ```txt
   client_id=5e3ce6c0-2b1f-4285-8d4b-75ee78787346
   ```

6. Request đó có thể có scope như một trong các scope này:

   ```txt
   https://api.spaces.skype.com/.default openid profile offline_access
   https://substrate.office.com/.default openid profile offline_access
   ```

7. Ưu tiên copy `refresh_token` trong tab `Preview`/`Response` của request token. Nếu chỉ nhìn thấy Form Data, có thể dùng tạm `refresh_token` trong Form Data rồi chạy test để script lấy token mới và lưu lại.

8. Dán vào:

   ```json
   "auth": {
     "common": {
       "refreshToken": "PASTE_TEAMS_WEB_REFRESH_TOKEN_HERE"
     }
   }
   ```

Sau đó test:

```bash
node auto_report.js --test-auth spaces --member <member_id>
node auto_report.js --test-auth substrate --member <member_id>
node auto_report.js --test-auth ic3 --member <member_id>
```

Kết luận quan trọng: không bắt buộc phải thấy request token có scope `https://ic3.teams.office.com/.default`. Với Teams web client `5e3ce6c0...`, refresh token lấy từ `spaces` hoặc `substrate` có thể đổi sang IC3 bằng scope `auth.ic3.scope`. Bước xác nhận là `--test-auth ic3`.

## Refresh Token Keepalive

Access token hết hạn được xử lý tự động: script sẽ refresh trước khi gọi API hoặc retry một lần khi gặp `401`.

Refresh token cũng được giữ sống khi chạy `--watch`: mỗi tick, trước khi xét lịch làm việc, script kiểm tra các profile `spaces`, `substrate`, `ic3`. Nếu access token đã hết hạn hoặc `refreshTokenExpiresAt` còn dưới:

```env
TOKEN_REFRESH_BEFORE_HOURS=12
```

script sẽ chủ động refresh profile đó và ghi token mới vào member JSON.

Điều này xử lý case nhận refresh token vào thứ 6 nhưng thứ 7/CN không post report: miễn là `node auto_report.js --watch` vẫn chạy, token vẫn được rotate dù pipeline skip do ngoài ngày làm việc.

Nếu máy/script tắt cả cuối tuần và refresh token hết hạn trong lúc đó, script không thể tự cứu token đã hết hạn. Khi đó cần mở Teams web, lấy refresh token mới và dán lại vào member JSON.

## Cách Xác Minh Token Đúng

Không paste token lên web decode public. Có thể decode local:

```bash
node -e "const t='PASTE_ACCESS_TOKEN'.split('.')[1]; console.log(JSON.parse(Buffer.from(t,'base64url').toString()))"
```

Token search đúng thường có:

```txt
aud = https://substrate.office.com
scp có SubstrateSearch-Internal.ReadWrite
```

Token post/reply đúng thường có:

```txt
aud = https://ic3.teams.office.com
scp = Teams.AccessAsUser.All
```

## Các Field Identity Quan Trọng

- `auth.common.clientId`: lấy từ `client_id` trong token request. Với Teams web thường là `5e3ce6c0-2b1f-4285-8d4b-75ee78787346`.
- `auth.common.brkClientId`: lấy từ `brk_client_id` nếu request có broker fields.
- `auth.common.anchorMailbox`: lấy từ `X-AnchorMailbox`, dạng `Oid:<user-oid>@<tenant-id>`.
- `author.from`: lấy từ payload post/reply Teams, dạng `8:orgid:<user-oid>`.
- `author.fromUserId`: thường giống `author.from`.
- `author.displayName`: tên hiển thị khi post.
- `teams.threadId`: channel/conversation id, dạng `19:...@thread.tacv2`.
- `teams.teamId`: team id, dạng `19:...@thread.tacv2`.

## Cấu Hình Teams

```json
"teams": {
  "threadId": "19:<channel-thread-id>@thread.tacv2",
  "teamId": "19:<team-id>@thread.tacv2",
  "conversationLinkPrefix": "https://teams.cloud.microsoft/l/message",
  "searchTitleTemplate": "ADVANCE UAV NAVIGATION SYSTEM - Báo cáo ngày {DD}/{MM}/{YYYY}",
  "parentPostContentTemplate": "<p>ADVANCE UAV NAVIGATION SYSTEM - Báo cáo ngày {DD}/{MM}/{YYYY}</p>"
}
```

Template ngày hỗ trợ:

```txt
{YYYY} {YY} {MM} {M} {DD} {D}
{WORKDAY_INDEX} {WORKDAY_INDEX_PAD2}
```

## Lịch Chạy

```json
"schedule": {
  "timezone": "Asia/Bangkok",
  "days": [1, 2, 3, 4, 5],
  "parentPostAfterTime": "17:25",
  "postAfterTime": "17:30",
  "postAfterRandomWindowMinutes": 20
}
```

Ý nghĩa:

- `days`: ngày được phép post, theo JavaScript day index: `0=CN`, `1=T2`, ..., `6=T7`.
- `parentPostAfterTime`: giờ bắt đầu tìm/tạo post cha.
- `postAfterTime`: giờ bắt đầu reply báo cáo.
- `postAfterRandomWindowMinutes`: random thêm số phút sau `postAfterTime`.

Random mỗi ngày được lưu vào `dailyPlans[YYYY-MM-DD]`, nên chạy lại cùng ngày sẽ không random lại nếu state chưa bị xóa.

## Tasks Và Progress

```json
"tasks": [
  {
    "title": "Hoàn thiện tính năng A",
    "startPercent": 0,
    "dailyIncreaseRange": [5, 10],
    "maxPercent": 100
  },
  {
    "title": "Kiểm thử tính năng B",
    "startPercent": 20,
    "dailyIncrease": 5,
    "maxPercent": 100
  }
]
```

Logic:

- Nếu có `dailyIncreaseRange`, mỗi ngày random một số trong khoảng đó.
- Random progress của ngày được lưu trong `dailyPlans[date].taskIncreases`.
- Sau khi post thành công, ngày đó được đánh dấu trong `dailyPlans[date].progressAppliedTasks` để không cộng trùng nếu chạy lại.
- Nếu `task.progressStartDate` trùng ngày report nhưng ngày đó chưa có marker applied, script vẫn cộng progress cho ngày report một lần.
- Sau khi reply thành công, script tăng `startPercent`.
- `maxPercent` chặn tiến độ không vượt quá mức tối đa.

Ví dụ state sau khi post thành công:

```json
"dailyPlans": {
  "2026-07-17": {
    "taskIncreases": {
      "0": 5,
      "1": 12
    },
    "progressAppliedTasks": {
      "0": true,
      "1": true
    }
  }
}
```

## Chống Trùng

Script chống trùng bằng:

- `.locks/<member>.lock`: tránh hai process chạy cùng member.
- `postedReports[YYYY-MM-DD].checked`: ngày đã post thì bỏ qua.
- `parentPosts[YYYY-MM-DD]`: cache post cha đã tìm/tạo.
- Trước khi reply, script cố gắng gọi `chatsvc/.../conversations/<threadId;messageid=parentId>/messages` để đọc replies cũ của post cha.
- Kiểm tra reply cũ của cùng user/ngày nếu search response có dữ liệu replies.

Nếu API đã post thành công nhưng máy tắt trước khi ghi JSON, state có thể chưa kịp lưu. Khi đó nên kiểm tra Teams trước khi force chạy lại.

## Lệnh Chạy

Kiểm tra syntax:

```bash
npm run check
```

Test auth:

```bash
npm run test-auth:spaces -- --member <member_id>
npm run test-auth:substrate -- --member <member_id>
npm run test-auth:ic3 -- --member <member_id>
```

Chạy một lần:

```bash
npm start -- --member <member_id>
```

Chạy liên tục trong tuần:

```bash
npm run watch
```

Chạy watch cho một người:

```bash
npm run watch -- --member <member_id>
```

Dry run:

```bash
node auto_report.js --dry-run --parent-message-id <message_id> --date YYYY-MM-DD --member <member_id>
```

Force bỏ qua check giờ/ngày đã post:

```bash
node auto_report.js --force --member <member_id>
```

Cẩn thận với `--force`, vì có thể tạo post/reply trùng nếu state hoặc Teams đã có dữ liệu.

## Docker

Docker image không copy `.env` hoặc `members/*.json` vào image. Các file này được mount ở runtime để script có thể đọc config và ghi lại token mới vào member JSON.

Build image:

```bash
docker build -t teams-daily-report-bot .
```

Chạy bằng Docker:

```bash
docker run -d --name teams-daily-report-bot --restart unless-stopped \
  -v "%cd%/.env:/app/.env:ro" \
  -v "%cd%/members:/app/members" \
  -v "%cd%/.locks:/app/.locks" \
  teams-daily-report-bot
```

Trên PowerShell, dùng:

```powershell
docker run -d --name teams-daily-report-bot --restart unless-stopped `
  -v "${PWD}/.env:/app/.env:ro" `
  -v "${PWD}/members:/app/members" `
  -v "${PWD}/.locks:/app/.locks" `
  teams-daily-report-bot
```

Chạy bằng Docker Compose:

```bash
docker compose up -d --build
```

Xem log:

```bash
docker logs -f teams-daily-report-bot
```

Dừng:

```bash
docker compose down
```

## Troubleshooting

`HTTP 401 from substrate.office.com/searchservice`

- Token search sai resource hoặc hết hạn.
- Chạy `node auto_report.js --test-auth substrate --member <member_id>`.
- Token đúng phải có `aud=https://substrate.office.com`.

`Authentication failed` khi gọi `chatsvc/.../messages`

- Token post/reply sai resource hoặc hết hạn.
- Chạy `node auto_report.js --test-auth ic3 --member <member_id>`.
- Token đúng phải có `aud=https://ic3.teams.office.com` và `scp=Teams.AccessAsUser.All`.

`ClientMessageId must be a number in string format`

- `clientmessageid` phải là chuỗi số. Code hiện đã generate chuỗi số.

`Parent post not found`

- Kiểm tra `teams.searchTitleTemplate`.
- Kiểm tra `teams.threadId`.
- Kiểm tra ngày `{DD}/{MM}/{YYYY}`.
- Nếu quá giờ tạo post cha, script sẽ tự tạo post cha khi không tìm thấy.

Muốn chạy lại một ngày đã post:

- Xóa `postedReports[YYYY-MM-DD]`.
- Nếu muốn random lại giờ/progress, xóa `dailyPlans[YYYY-MM-DD]`.
- Kiểm tra Teams trước để tránh post trùng.

## Lưu Ý Bảo Mật

- Không commit token.
- Không gửi token lên chat public hoặc ticket public.
- `members/*.json` chứa refresh token và access token cache.
- Nếu lộ refresh token, đăng xuất Teams hoặc revoke session.
- Refresh token có thể rotate sau mỗi lần refresh; script sẽ ghi token mới vào member JSON.
