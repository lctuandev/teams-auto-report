# Teams Daily Report Bot

Tool tu dong tao post cha va reply bao cao ngay vao Microsoft Teams channel/thread. Script ho tro nhieu member bang cach doc config trong `members/<member_id>/config.json` va state trong `members/<member_id>/state.json`.

## Cau Truc File

```txt
.
├─ auto_report.js
├─ .env
├─ example/
│  ├─ example.json
│  └─ state.example.json
├─ members/
│  └─ <member_id>/
│     ├─ config.json
│     └─ state.json
├─ .state/
│  └─ parent-posts.json
└─ .locks/
```

`config.json` la file sua tay: auth, Teams, schedule, report, tasks.

`state.json` la file script tu cap nhat:

```json
{
  "parentPosts": {},
  "postedReports": {},
  "dailyPlans": {}
}
```

`.state/parent-posts.json` la cache post cha dung chung cho tat ca members.

## Them Member Moi

1. Tao folder:

   ```txt
   members/<member_id>/
   ```

2. Copy:

   ```txt
   example/example.json -> members/<member_id>/config.json
   example/state.example.json -> members/<member_id>/state.json
   ```

3. Sua cac field quan trong trong `config.json`:

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

4. Test auth:

   ```bash
   npm run test-auth:spaces -- --member <member_id>
   npm run test-auth:substrate -- --member <member_id>
   npm run test-auth:ic3 -- --member <member_id>
   ```

## Auth

`auth.common.refreshToken` la primary refresh token. Cac profile co `reusePrimaryRefreshToken: true` co the dung token nay de doi access token theo scope rieng:

```txt
spaces    -> https://api.spaces.skype.com/.default
substrate -> https://substrate.office.com/.default
ic3       -> https://ic3.teams.office.com/.default
```

Thu tu uu tien refresh token khi refresh mot profile:

```txt
1. auth.<profile>.token.refreshToken
2. auth.<profile>.refreshToken
3. auth.common.refreshToken
4. refreshTokenEnv neu co
5. reusePrimaryRefreshToken fallback
6. AUTH_REFRESH_TOKEN trong .env
```

Khi `spaces` refresh thanh cong va Microsoft tra `refresh_token` moi, script cung sync:

```txt
auth.common.refreshToken = auth.spaces.refreshToken
```

de common khong giu refresh token cu qua han.

## Lay Refresh Token

Mo Teams web:

```txt
https://teams.cloud.microsoft/
```

Trong Chrome DevTools:

1. Network -> bat `Preserve log`.
2. Reload Teams.
3. Filter `oauth2/v2.0/token`.
4. Tim request co `client_id=5e3ce6c0-2b1f-4285-8d4b-75ee78787346`.
5. Copy `refresh_token` trong Response/Preview.
6. Dan vao `auth.common.refreshToken`.

Khong bat buoc phai thay request token co scope IC3 rieng. Refresh token tu Teams web client co the doi sang IC3 neu test sau pass:

```bash
npm run test-auth:ic3 -- --member <member_id>
```

## Lich Chay

Trong `config.json`:

```json
"schedule": {
  "timezone": "Asia/Bangkok",
  "days": [1, 2, 3, 4, 5],
  "parentPostAfterTime": "17:25",
  "postAfterTime": "17:30",
  "postAfterRandomWindowMinutes": 20
}
```

Y nghia:

- `days`: ngay duoc phep post, theo JavaScript day index: `0=CN`, `1=T2`, ..., `6=T7`.
- `parentPostAfterTime`: gio bat dau tim/tao post cha.
- `postAfterTime`: gio bat dau reply report.
- `postAfterRandomWindowMinutes`: random them so phut sau `postAfterTime`.

`schedule.days` la bat buoc neu member can report. Neu `days` khong khai bao hoac la mang rong, pipeline chi chay keepalive token roi skip, khong tao `dailyPlans`, khong tao post cha, khong reply report.

Neu member khong co `schedule.parentPostAfterTime`, script fallback ve `.env -> PARENT_POST_AFTER_TIME`.

## Luong Parent Post

Moi member render title bang:

```txt
teams.searchTitleTemplate
```

Post cha chi duoc dung chung khi cung:

```txt
threadId + reportDate + title
```

Neu 2 members cung gio nhung report vao 2 title khac nhau, script se tao/tim 2 post cha rieng.

Chong trung parent post:

- `members/<id>/state.json -> parentPosts`: cache rieng theo member.
- `.state/parent-posts.json`: cache global cho tat ca members.
- `.locks/parent-*.lock`: chi mot process duoc tim/tao parent post cho cung `threadId + date + title` tai mot thoi diem.

## Luong Report Reply

Sau khi reply thanh cong, script ghi vao `state.json`:

```json
"postedReports": {
  "2026-07-19": {
    "checked": true
  }
}
```

`postedReports` la state rieng cua tung member, vi nhieu member co the reply vao cung mot post cha.

Truoc khi reply, script cung co gang doc replies cu cua post cha bang `chatsvc` de giam rui ro post trung neu local state bi mat.

## Progress

Task config:

```json
"tasks": [
  {
    "title": "Hoan thien tinh nang A",
    "startPercent": 0,
    "dailyIncreaseRange": [5, 10],
    "maxPercent": 100
  }
]
```

Logic:

- `dailyIncreaseRange`: moi ngay random mot so trong khoang.
- `dailyIncrease`: dung so co dinh neu khong co range.
- Random moi ngay duoc luu trong `state.json -> dailyPlans[date].taskIncreases`.
- Sau khi post thanh cong, task duoc danh dau trong `dailyPlans[date].progressAppliedTasks` de khong cong trung.
- `task.progressStartDate` duoc cap nhat ve ngay vua post.
- `maxPercent` chan tien do khong vuot qua gioi han.

## Refresh Token Keepalive

Khi chay `--watch`, truoc khi check lich post, script kiem tra `spaces`, `substrate`, `ic3`.

Neu access token het han hoac refresh token con duoi:

```env
TOKEN_REFRESH_BEFORE_HOURS=12
```

script se refresh profile do va ghi token moi vao `config.json`.

Neu may/script tat qua luc refresh token het han, can mo Teams web lay refresh token moi va dan lai.

## Lenh Chay

Check syntax:

```bash
npm run check
```

Chay mot lan:

```bash
npm start -- --member <member_id>
```

Chay watch:

```bash
npm run watch
```

Chay watch mot member:

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

Can than voi `--force`, vi co the post trung neu Teams da co reply nhung state/cache khong nhan ra.

## Docker

Build:

```bash
docker build -t teams-daily-report-bot .
```

Compose:

```bash
docker compose up -d --build
```

Log:

```bash
docker logs -f teams-daily-report-bot
```

Dung:

```bash
docker compose down
```

Docker mount cac folder/file runtime:

```txt
.env -> /app/.env
members -> /app/members
.locks -> /app/.locks
.state -> /app/.state
```

## Bao Mat

- Khong commit `.env`.
- Khong commit `members/*/config.json` vi co refresh token.
- Khong commit `members/*/state.json` neu khong muon lo lich su post.
- Khong paste token len web decode public.
