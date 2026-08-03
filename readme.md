# Teams Daily Report Bot

Bot tự động tạo hoặc tìm post cha trong Microsoft Teams channel, sau đó reply báo cáo ngày của từng member vào đúng thread. Tool được thiết kế để chạy liên tục bằng `--watch`, tự refresh token, chống post trùng, tính số báo cáo theo tháng, và cập nhật tiến độ task sau khi post thành công.

## Tính Năng Chính

- Hỗ trợ nhiều member qua folder hợp nhất `users/<member_id>/`.
- Mỗi member có `config.json` riêng và `state.json` riêng.
- Tự refresh access token cho các domain auth: `spaces`, `substrate`, `ic3`.
- Tự sync refresh token mới từ `spaces` về `auth.common.refreshToken`.
- Tự renew refresh token bằng browser profile khi refresh token sắp hết hạn.
- Tự tìm hoặc tạo post cha theo title ngày hiện tại.
- Dùng chung post cha cho nhiều member nếu cùng `threadId + date + title`.
- Chống tạo trùng post cha bằng cache global và lock file.
- Chống reply trùng bằng `postedReports` và kiểm tra replies cũ trên Teams.
- Random giờ reply trong khoảng cấu hình.
- Random phần trăm tăng task mỗi ngày, lưu lại để không random lại.
- Tính `Số báo cáo` theo format `T{tháng}/{số ngày đã report}/{tổng ngày làm trong tháng}`.
- Hỗ trợ ngày nghỉ (`skipDates`) và ngày làm bù (`extraWorkDates`).
- Group UI hỗ trợ áp dụng lịch nghỉ hành chính Việt Nam theo năm và chọn nhiều ngày bằng date picker.
- Hỗ trợ Docker/Compose để chạy nền.

## Luồng Hoạt Động

Mỗi lần pipeline chạy cho một member:

1. Load `.env`, `users/<member_id>/config.json`, và `users/<member_id>/state.json`.
2. Nếu refresh token sắp hết hạn, tự renew bằng browser profile.
3. Refresh/keepalive token nếu token sắp hết hạn.
4. Kiểm tra ngày hiện tại có nằm trong `schedule.days` hay không.
5. Nếu ngày bị khai báo trong `skipDates`, chỉ keepalive token rồi skip report.
6. Nếu chưa tới `parentPostAfterTime`, skip.
7. Nếu tới `parentPostAfterTime` nhưng chưa tới giờ report, chỉ tìm hoặc tạo post cha.
8. Nếu tới giờ report:
   - Check `postedReports[date].checked` để chặn trùng.
   - Tìm hoặc tạo post cha.
   - Load replies cũ để detect report đã tồn tại trên Teams.
   - Build HTML report.
   - Tính `Số báo cáo`.
   - Post reply.
   - Nếu post thành công: cập nhật task progress, `postedReports`, `monthlyReports`.

## Cấu Trúc File

```txt
.
|-- auto_report.js
|-- .env
|-- example/
|   |-- config.json
|   |-- credentials.json
|   |-- group-config.json
|   `-- state.json
|-- users/
|   `-- <member_id>/
|       |-- account.json
|       |-- config.json
|       |-- credentials.json
|       `-- state.json
|-- groups/
|   `-- <group_id>/
|       `-- config.json
|-- audit/
|   `-- events.jsonl
|-- .state/
|   `-- parent-posts.json
|-- .browser-profiles/
|   `-- <member_id>/
`-- .locks/
```

Ý nghĩa:

- `auto_report.js`: script chính.
- `.env`: config dùng chung cho mọi member, không nên commit.
- `example/config.json`: template config nghiệp vụ cho member mới.
- `example/credentials.json`: template Teams credentials/browser riêng.
- `example/group-config.json`: template group/parent post.
- `example/state.json`: template state rỗng.
- `users/<member_id>/account.json`: credential và quyền đăng nhập web; member chưa có tài khoản có thể không có file này.
- `users/<member_id>/config.json`: config sửa tay của từng member.
- `users/<member_id>/credentials.json`: `auth` và cấu hình browser riêng để token refresh không ghi vào config nghiệp vụ.
- `users/<member_id>/state.json`: state do script tự ghi.
- `groups/<group_id>/config.json`: Teams target, lịch tạo parent và template dùng chung của group.
- `audit/events.jsonl`: audit log do Web ghi.
- `.state/parent-posts.json`: cache post cha dùng chung.
- `.browser-profiles/<member_id>/`: browser session/cookie dùng để renew refresh token.
- `.locks/`: lock dùng chung giữa Web và bot (`member-<id>.lock`) để tránh ghi đè config, cùng lock parent để tránh tạo post trùng.

## Setup Member Mới

Tạo folder member:

```txt
users/<member_id>/
```

Copy file mẫu:

```txt
example/config.json -> users/<member_id>/config.json
example/credentials.json -> users/<member_id>/credentials.json
example/state.json -> users/<member_id>/state.json
example/group-config.json -> groups/<group_id>/config.json
```

Các field nghiệp vụ bắt buộc trong `config.json`:

```txt
id
enabled
author.displayName
groupId
version
schedule
report
tasks
```

Teams target nằm trong `groups/<group_id>/config.json`. `auth`, browser config
và Teams author identity nằm trong `credentials.json`; không đặt các field này
trở lại `config.json`.

## File `.env`

`.env` chỉ nên giữ config dùng chung:

```env
AUTH_REFRESH_URL=https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token
AUTH_REFRESH_CONTENT_TYPE=application/x-www-form-urlencoded

SEARCH_API_URL=https://substrate.office.com/searchservice/api/v2/query
PARENT_SEARCH_METHOD=substrate
LIST_POSTS_API_BASE_URL=https://teams.cloud.microsoft/api/csa/apac/api/v1/containers
POST_API_BASE_URL=https://teams.cloud.microsoft/api/chatsvc/apac/v1/users/ME/conversations

REPORT_TIMEZONE=Asia/Bangkok
WATCH_INTERVAL_MINUTES=10
ACCESS_TOKEN_REFRESH_BEFORE_MINUTES=10
BROWSER_RENEW_BEFORE_HOURS=8
BROWSER_RENEW_RETRY_MINUTES=60
AUTO_BROWSER_RENEW=true
BROWSER_RENEW_HEADLESS=false
BROWSER_RENEW_CHANNEL=chrome
PARENT_POST_AFTER_TIME=17:25
REPORT_POST_RANDOM_WINDOW_MINUTES=0
```

Một số key quan trọng:

- `AUTH_REFRESH_URL`: token endpoint của tenant.
- `WATCH_INTERVAL_MINUTES`: khoảng cách mỗi lần `--watch` check pipeline.
- `ACCESS_TOKEN_REFRESH_BEFORE_MINUTES`: refresh access token khi còn dưới số phút này; nên nhỏ hơn lifetime access token để watch không refresh ở mọi vòng.
- `BROWSER_RENEW_BEFORE_HOURS`: nếu refresh token còn dưới số giờ này, watch sẽ thử lấy refresh token mới qua browser profile.
- `BROWSER_RENEW_RETRY_MINUTES`: cooldown giữa các lần browser renew để tránh mở browser liên tục.
- `AUTO_BROWSER_RENEW`: bật/tắt auto browser renew trong watch. Set `false` nếu muốn tắt.
- `BROWSER_RENEW_HEADLESS`: `false` để lần đầu login có cửa sổ browser. Sau khi profile đã login, có thể thử `true`.
- `BROWSER_RENEW_CHANNEL`: browser Playwright dùng, ví dụ `chrome` hoặc `msedge`.
- `PARENT_POST_AFTER_TIME`: giờ mặc định tạo/tìm post cha nếu member không set `schedule.parentPostAfterTime`.
- `REPORT_POST_RANDOM_WINDOW_MINUTES`: random window mặc định nếu member không set `schedule.postAfterRandomWindowMinutes`.
- `TEAMS_CLIENT_INFO`, `TEAMS_REFERER`, `TEAMS_USER_AGENT`: header giống Teams web client.

## Config `teams`

```json
"teams": {
  "threadId": "19:<channel-thread-id>@thread.tacv2",
  "teamId": "19:<team-id>@thread.tacv2",
  "conversationLinkPrefix": "blah",
  "searchTitleTemplate": "ADVANCE UAV NAVIGATION SYSTEM - Báo cáo ngày {DD}/{MM}/{YYYY}",
  "parentPostContentTemplate": "<p>ADVANCE UAV NAVIGATION SYSTEM - Báo cáo ngày {DD}/{MM}/{YYYY}</p>"
}
```

Ý nghĩa:

- `threadId`: conversation/channel thread id. Lấy từ API Teams channel, thường có dạng `19:...@thread.tacv2`.
- `teamId`: team id dùng cho API list/search posts.
- `conversationLinkPrefix`: prefix để build `conversationLink` trong payload reply. Nếu request mẫu của Teams dùng `blah`, có thể giữ `blah`.
- `searchTitleTemplate`: title bot dùng để search post cha.
- `parentPostContentTemplate`: content HTML khi bot cần tạo post cha.

Template hỗ trợ các biến:

```txt
{YYYY} {YY} {MM} {M} {DD} {D}
{DAY_INDEX} {DAY_INDEX_PAD2}
{WORKDAY_INDEX} {WORKDAY_INDEX_PAD2}
{REPORT_INDEX} {REPORT_INDEX_PAD2}
{MONTH_WORKDAYS} {MONTH_WORKDAYS_PAD2}
```

## Config `author`

`displayName` nằm trong `config.json`. Các identity dùng để gọi Teams như
`from` và `fromUserId` nằm trong `credentials.json`:

```json
"author": {
  "from": "8:orgid:<user-oid>",
  "fromUserId": "8:orgid:<user-oid>",
  "displayName": "Your Display Name"
}
```

Ý nghĩa:

- `from`: user id trong payload Teams, dạng `8:orgid:<user-oid>`.
- `fromUserId`: thường giống `from`.
- `displayName`: tên hiển thị trong payload post/reply.

`user-oid` cũng là phần dùng trong `auth.common.anchorMailbox`.

## Config `browser`

Phần này nằm trong `users/<member_id>/credentials.json`, không nằm trong
`config.json`:

```json
"browser": {
  "autoRenew": true,
  "profileDir": ".browser-profiles/le_cong_tuan",
  "channel": "chrome",
  "headless": false,
  "timeoutMs": 600000
}
```

Ý nghĩa:

- `autoRenew`: bật/tắt auto renew refresh token cho member này.
- `profileDir`: folder browser profile riêng của member. Folder này chứa cookie/session Microsoft.
- `channel`: browser dùng để mở login flow, thường là `chrome` hoặc `msedge`.
- `headless`: nên để `false` cho lần login đầu tiên để bạn có thể nhập tài khoản/MFA.
- `timeoutMs`: thời gian chờ browser login/token response.

Nếu không khai báo `browser.profileDir`, script tự dùng:

```txt
.browser-profiles/<member_id>
```

Không commit hoặc share folder `.browser-profiles/`.

## Config `schedule`

```json
"schedule": {
  "timezone": "Asia/Bangkok",
  "days": [1, 2, 3, 4, 5],
  "skipDates": [],
  "extraWorkDates": [],
  "parentPostAfterTime": "17:25",
  "postAfterTime": "17:30",
  "postAfterRandomWindowMinutes": 20,
  "skipIfBeforePostTime": true
}
```

Ý nghĩa:

- `timezone`: timezone để tính ngày/giờ report.
- `days`: các ngày được report theo JavaScript day index: `0=CN`, `1=T2`, ..., `6=T7`.
- `skipDates`: ngày nghỉ, format `YYYY-MM-DD`. Ngày này không post, không tăng progress, không tăng số báo cáo, và không tính vào tổng ngày làm trong tháng.
- `extraWorkDates`: ngày làm bù ngoài `days`, format `YYYY-MM-DD`.
- `parentPostAfterTime`: sau giờ này bot được phép tìm/tạo post cha.
- `postAfterTime`: sau giờ này bot được phép reply report.
- `postAfterRandomWindowMinutes`: random thêm `0..N` phút sau `postAfterTime`.
- `skipIfBeforePostTime`: nếu `true`, bot sẽ tôn trọng khung giờ trên. Nếu `false`, bot có thể report ngay khi pipeline chạy.

Nếu `schedule.days` không có hoặc là mảng rỗng, member chỉ được keepalive token, không tạo post cha và không reply report.

## Config `report`

```json
"report": {
  "numberTemplate": "T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}",
  "initialReportedWorkdaysByMonth": {},
  "countProgressByWorkdaysOnly": true,
  "excludeCompletedTasks": false
}
```

Ý nghĩa:

- `numberTemplate`: format cho cột `Số báo cáo`.
- `initialReportedWorkdaysByMonth`: override số ngày đã report trước khi bot bắt đầu track, theo từng tháng.
- `countProgressByWorkdaysOnly`: nếu `true`, progress chỉ tăng trong ngày hợp lệ theo schedule.
- `excludeCompletedTasks`: mặc định `false`. Khi bật, task có
  `startPercent >= 100` vẫn được giữ trên UI nhưng không xuất hiện trong daily
  report.

Ví dụ override số ngày đã report trong tháng 7:

```json
"initialReportedWorkdaysByMonth": {
  "2026-07": 12
}
```

Nếu không khai báo override, khi bắt đầu giữa tháng bot sẽ tự seed `baseReportedWorkdays` bằng số ngày làm từ ngày 01 đến trước ngày report đầu tiên.

## Số Báo Cáo

Template mặc định:

```txt
T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}
```

Ví dụ `T07/14/23`:

- `T07`: tháng 07.
- `14`: ngày report thứ 14 trong tháng.
- `23`: tổng ngày làm trong tháng theo `schedule.days`, đã trừ `skipDates` và cộng `extraWorkDates`.

Chi tiết từng ngày nằm trong `postedReports`:

```json
"postedReports": {
  "2026-07-20": {
    "checked": true,
    "monthKey": "2026-07",
    "reportIndex": 14,
    "reportNumber": "T07/14/23",
    "totalWorkdays": 23
  }
}
```

Tổng hợp theo tháng nằm trong `monthlyReports`:

```json
"monthlyReports": {
  "2026-07": {
    "year": 2026,
    "month": 7,
    "totalWorkdays": 23,
    "baseReportedWorkdays": 12,
    "reportedWorkdays": 14,
    "latestReportDate": "2026-07-20",
    "latestReportNumber": "T07/14/23"
  }
}
```

Qua tháng mới, bot tạo key mới như `2026-08`, reset counter của tháng đó về `1` nếu chạy từ ngày làm đầu tiên của tháng.

## Config `tasks`

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

Ý nghĩa:

- `title`: nội dung task hiện trong báo cáo.
- `startPercent`: phần trăm hiện tại. Sau khi post thành công, script cập nhật field này.
- `dailyIncreaseRange`: random phần trăm tăng mỗi ngày, ví dụ `[5, 10]`.
- `dailyIncrease`: tăng cố định nếu không dùng range.
- `maxPercent`: giới hạn tối đa, thường là `100`.
- `minPercent`: tùy chọn, giới hạn tối thiểu.
- `progressStartDate`: tùy chọn, override ngày bắt đầu tính progress cho task riêng.

Random progress mỗi ngày được lưu trong:

```txt
state.json -> dailyPlans[date].taskIncreases
```

Sau khi post thành công, task được đánh dấu trong:

```txt
state.json -> dailyPlans[date].progressAppliedTasks
```

Để tránh cộng tiến độ trùng khi pipeline chạy lại.

## Config `pending` Và `innovations`

```json
"pending": [
  {
    "item": "Đang chờ review API",
    "solution": "Follow team backend"
  }
],
"innovations": [
  {
    "item": "Tối ưu thao tác map",
    "support": "Cần thêm data test"
  }
]
```

- `pending`: hiện trong section `PENDING LIST`.
- `innovations`: hiện trong section `ĐỔI MỚI SÁNG TẠO CÔNG VIỆC`.

Nếu để mảng rỗng, bot vẫn render tối thiểu 2 dòng trong mỗi section.

## Config `auth`

Auth nằm trong `users/<member_id>/credentials.json` và được tách theo domain:

```json
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
    "reusePrimaryRefreshToken": true
  },
  "substrate": {
    "scope": "https://substrate.office.com/.default openid profile offline_access",
    "reusePrimaryRefreshToken": true
  },
  "ic3": {
    "scope": "https://ic3.teams.office.com/.default openid profile offline_access",
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
```

Ý nghĩa các profile:

- `common`: chứa client metadata và refresh token gốc.
- `spaces`: dùng cho Teams spaces token, đồng thời sync refresh token mới về `common`.
- `substrate`: dùng cho API search post cha.
- `ic3`: dùng cho API tạo post cha và reply report.

Cách lấy brkClientId và clientId

![alt text](images/image.png)

Cách lấy anchorMailbox

![alt text](images/image-2.png)

Thứ tự ưu tiên refresh token khi refresh một profile:

```txt
1. auth.<profile>.token.refreshToken
2. auth.<profile>.refreshToken
3. auth.common.refreshToken
4. refreshTokenEnv nếu có
5. reusePrimaryRefreshToken fallback
6. AUTH_REFRESH_TOKEN trong .env
```

Sau khi refresh thành công, token mới luôn được lưu riêng vào
`users/<member_id>/credentials.json` tại `auth.<profile>.token`. Bot không dùng
token cache dùng chung giữa các thành viên.

## Lấy Refresh Token

Mở Teams web:

```txt
https://teams.cloud.microsoft/
```

Trong Chrome DevTools:

1. Mở tab `Network`.
2. Bật `Preserve log`.
3. Reload Teams.
4. Filter `oauth2/v2.0/token`.
5. Tìm request có `client_id=5e3ce6c0-2b1f-4285-8d4b-75ee78787346`.
6. Mở tab `Preview` hoặc `Response`.
7. Copy `refresh_token`.
8. Dán vào `auth.common.refreshToken`.

![alt text](images/image-3.png)

Sau đó test:

```bash
npm run test-auth:spaces -- --member <member_id>
npm run test-auth:substrate -- --member <member_id>
npm run test-auth:ic3 -- --member <member_id>
```

Nếu `ic3` fail, thử copy refresh token từ request token có scope liên quan `ic3.teams.office.com` hoặc `Teams.AccessAsUser.All`, rồi dán vào:

```json
"auth": {
  "ic3": {
    "refreshToken": "PASTE_IC3_REFRESH_TOKEN_HERE"
  }
}
```

Nếu `substrate` fail, làm tương tự với request scope `https://substrate.office.com/.default`.

## Token Keepalive

Khi chạy `--watch`, bot refresh token trước khi check lịch post.

Bot refresh profile nếu:

- Access token đã hết hạn.
- Refresh token sắp hết hạn trong vòng `BROWSER_RENEW_BEFORE_HOURS`.

Mỗi lần refresh, log sẽ hiện thời gian hết hạn mới:

```txt
[INFO][member][ic3] Token refreshed. accessTokenExpiresAt=... refreshTokenExpiresAt=...
```

Nếu script/máy tắt quá lâu làm refresh token hết hạn, cần vào Teams web lấy refresh token mới và dán lại vào config.

## Browser Auto Renew

Teams web dùng SPA refresh token có lifetime cố định khoảng 24h. Khi refresh token gần hết hạn, chỉ gọi `/token` bằng refresh token cũ thường không kéo dài lifetime. Teams web xử lý bằng cách chạy lại `/authorize` trong browser top-level, dùng cookie/session Microsoft để lấy authorization code mới, rồi đổi code lấy refresh token mới.

Bot làm tương tự bằng Playwright:

1. `npm run watch` phát hiện refresh token còn dưới `BROWSER_RENEW_BEFORE_HOURS`.
2. Bot mở browser profile của member.
3. Nếu profile chưa login, bạn login/MFA trong cửa sổ browser.
4. Bot lấy authorization code/token response mới.
5. Bot lưu refresh token mới vào `auth.common.refreshToken`.
6. Bot cập nhật refresh token mới cho các profile `spaces`, `substrate`, `ic3`.

Lần đầu tiên nên renew riêng member trên máy có GUI:

```bash
npm run renew-token -- --member <member_id>
```

Khi browser mở ra, login Teams/Microsoft như bình thường. Sau đó profile được lưu trong:

```txt
.browser-profiles/<member_id>
```

Bạn cũng có thể ép renew thủ công để setup lần đầu hoặc debug:

```bash
npm run renew-token -- --member <member_id>
```

Lưu ý:

- Tính năng này cần package `playwright-core` và Chrome/Edge đã cài trên máy.
- Nếu dùng Edge, đổi `BROWSER_RENEW_CHANNEL=msedge` hoặc `browser.channel`.
- Browser profile chứa cookie/session đăng nhập, nhạy cảm như token.
- Docker có Chromium headless để tự renew các profile đã đăng nhập. Lần login
  đầu vẫn nên thực hiện trên máy local có GUI, sau đó dùng chung/copy cả
  `users/<member_id>/` và `.browser-profiles/<member_id>/`.

## Tạo account và onboarding Teams an toàn

Nút **Mở browser để đăng nhập Teams** trong Web không cần `npm run watch`.
Web tự chạy một process one-shot tương đương:

```bash
node auto_report.js --renew-token --member=<member_id>
```

Process này chỉ đăng nhập/renew token và lưu browser profile; nó không chạy
scheduler và không đăng daily report.

Quy trình an toàn khi bot đang chạy bằng Docker:

```bash
# Tại thư mục gốc dự án
docker compose stop teams-report

# Chỉ chạy Web local
cd web
npm run dev
```

Mở `http://localhost:3000/admin/accounts/new`, tạo account và hoàn thành browser
login. Sau đó dừng Web local bằng `Ctrl+C`, quay lại thư mục gốc và bật bot:

```bash
docker compose start teams-report
```

Không chạy `npm run watch` ở local đồng thời với service `teams-report` trong
Docker. Local và Docker có thể dùng chung bind volume (`users`, `.state`,
`.locks`, `.browser-profiles`) nhưng vẫn là hai scheduler độc lập; chạy song
song có thể tạo hai snapshot và dẫn đến duplicate reply. Chỉ Docker nên sở hữu
scheduler, còn local chỉ dùng Web và lệnh one-shot `renew-token`.

## State

`state.json` là file script tự cập nhật, thông thường không sửa tay:

```json
{
  "parentPosts": {},
  "postedReports": {},
  "dailyPlans": {},
  "monthlyReports": {},
  "browserRenewals": {}
}
```

Ý nghĩa:

- `parentPosts`: parent post cache riêng của member.
- `postedReports`: lịch sử report từng ngày và flag chống post trùng.
- `dailyPlans`: random giờ post và random progress theo ngày.
- `monthlyReports`: summary số báo cáo theo tháng.
- `browserRenewals`: lịch sử/cooldown cho auto browser renew.

## Chống Trùng

Parent post:

- Key global được tính theo `threadId + reportDate + title`.
- Cache trong `.state/parent-posts.json`.
- Lock trong `.locks/parent-*.lock`.

Report reply:

- Nếu `postedReports[date].checked = true`, pipeline skip.
- Trước khi reply, bot cố gắng load replies cũ từ Teams và tìm report cùng ngày/cùng author.
- Nếu thấy reply cũ, bot mark state là checked và không post thêm.

## Lệnh Chạy

Check syntax:

```bash
npm run check
```

Chạy một lần:

```bash
npm start -- --member <member_id>
```

Chạy tất cả enabled members một lần:

```bash
npm start
```

Chạy watch:

```bash
npm run watch
```

Chạy watch một member:

```bash
npm run watch -- --member <member_id>
```

Dry run:

```bash
node auto_report.js --dry-run --parent-message-id <message_id> --date YYYY-MM-DD --member <member_id>
```

Force:

```bash
node auto_report.js --force --member <member_id>
```

Test auth:

```bash
npm run test-auth:spaces -- --member <member_id>
npm run test-auth:substrate -- --member <member_id>
npm run test-auth:ic3 -- --member <member_id>
```

Renew token bằng browser profile:

```bash
npm run renew-token -- --member <member_id>
```

Cẩn thận với `--force`, vì nó bỏ qua một số check lịch và có thể post trùng nếu Teams đã có reply nhưng state/cache không nhận ra.

## Docker

Build image:

```bash
docker build -t teams-daily-report-bot .
```

Chạy bằng Compose:

```bash
docker compose up -d --build
```

Web tự nhận biết protocol tại lần đăng nhập: truy cập trực tiếp bằng HTTP trong
mạng nội bộ sẽ dùng cookie thường, còn HTTPS (bao gồm
`X-Forwarded-Proto: https` từ reverse proxy) sẽ dùng cookie `Secure`. Có thể ép
chế độ bằng `WEB_COOKIE_SECURE=true|false`; môi trường public nên dùng HTTPS và
đặt `true`.

Xem log:

```bash
docker logs -f teams-daily-report-bot
```

Dừng:

```bash
docker compose down
```

Compose mount các runtime path:

```txt
.env -> /app/.env
users -> /app/users
.locks -> /app/.locks
.state -> /app/.state
.browser-profiles -> /app/.browser-profiles
groups -> /app/groups
```

## Chuẩn hóa và backup dữ liệu

Kiểm tra schema member mà không ghi file:

```bash
npm run data:normalize
```

Apply sau khi xem dry-run:

```bash
npm run data:normalize -- --apply
```

Lệnh apply tự tạo snapshot phục hồi trong `.backups/`. Migration hiện chuẩn
hóa `version`, `report.numberTemplate`, `skipDates`, `extraWorkDates` và loại
`reportNumberTemplate`/`dailyStatuses` legacy. Chạy lại dry-run sau apply phải
trả về `0` thay đổi.

Các migration one-time của cấu trúc cũ được lưu tại `scripts/migrations/` để
tham khảo và không còn được expose qua npm scripts.

## Lịch nghỉ Việt Nam và tăng ca

Trong trang tạo/sửa group, admin có thể áp dụng lịch nghỉ hành chính Việt Nam
đã được công bố cho từng năm. Lịch 2026 bao gồm cả ngày nghỉ hoán đổi và ngày
làm bù theo thông báo của Bộ Nội vụ; dữ liệu có liên kết nguồn Chính phủ ngay
trên UI. Admin vẫn có thể thêm/xóa ngày bằng date picker để phù hợp lịch riêng
của doanh nghiệp.

Thứ tự ưu tiên khi bot quyết định có báo cáo:

1. `member.report.skipDates`: member chủ động nghỉ.
2. `member.report.extraWorkDates`: member xác nhận tăng ca trên Home.
3. `group.parentPost.skipDates` và `extraWorkDates`.
4. Các thứ làm việc bình thường trong `group.parentPost.days`.

Vì vậy ngày nghỉ lễ của group áp dụng cho mọi member, nhưng một member chọn
“Hôm nay tôi sẽ báo cáo” vẫn có thể tạo parent chung và reply riêng.

## Bảo Mật

- Không commit `.env`.
- Không commit `users/*/account.json`, vì chứa password hash và quyền đăng nhập.
- Không commit `users/*/config.json`, vì chứa cấu hình và nội dung báo cáo nội bộ.
- Không commit `users/*/credentials.json`, vì chứa refresh token/access token và thiết lập browser.
- Không commit `users/*/state.json` nếu không muốn lộ lịch sử post.
- Không commit `groups/*/config.json`, `audit/*.jsonl`, `.state/` hoặc `.backups/`; đây là runtime data được backup/deploy riêng.
- Không commit `.browser-profiles/`, vì có cookie/session Microsoft.
- Không paste token lên website decode public.
- Nếu token lộ, logout Teams web và lấy refresh token mới.

## Troubleshooting

`401 Unauthorized` khi search:

- Test `substrate`: `npm run test-auth:substrate -- --member <member_id>`.
- Kiểm tra `auth.substrate.scope`.
- Lấy refresh token mới từ Teams web nếu cần.

`401 Authentication failed` khi post/reply:

- Test `ic3`: `npm run test-auth:ic3 -- --member <member_id>`.
- Đảm bảo IC3 token có audience/scope đúng.
- Kiểm tra `author.from`, `threadId`, và `POST_API_BASE_URL`.

Bot không report:

- Kiểm tra `schedule.days`.
- Kiểm tra ngày có nằm trong `skipDates` không.
- Kiểm tra giờ hiện tại đã qua `parentPostAfterTime`/`postAfterTime` chưa.
- Kiểm tra `postedReports[date].checked` đã true chưa.

Số báo cáo sai:

- Kiểm tra `schedule.days`, `skipDates`, `extraWorkDates`.
- Kiểm tra `monthlyReports[month].baseReportedWorkdays`.
- Kiểm tra `postedReports` có ngày nào bị thiếu/dư không.
