const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildDryRunParentPost, getNextReportIndex, getOrCreateMonthlyReport, getParentPostCacheKey, getReportableTasks, getUsablePreviousRefreshTokenExpiry, isAllowedDay, loadMemberConfigs, persistCredentials, persistMember, persistPipelineResult, resolveMemberGroupConfig, saveBrowserRefreshToken, saveTokenForConfig, shouldRetryBrowserRenewAfterRuntimeFix, shouldRefreshAuthCache, shouldUpdateTaskProgress, splitMemberConfigAndState } = require("../auto_report");

test("group config supplies parent settings without persisting them into member config", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teams-report-group-"));
  const groupDir = path.join(root, "groups", "group_one");
  fs.mkdirSync(groupDir, { recursive: true });
  fs.writeFileSync(path.join(groupDir, "config.json"), JSON.stringify({
    id: "group_one", enabled: true,
    teams: { threadId: "thread-group", teamId: "team-group", conversationLinkPrefix: "https://teams.example/l/message" },
    parentPost: { searchTitleTemplate: "Report {DD}", contentTemplate: "<p>Report {DD}</p>", timezone: "Asia/Bangkok", days: [1, 2, 3, 4, 5], skipDates: [], extraWorkDates: [], postAfterTime: "17:28" }
  }));
  const runtime = resolveMemberGroupConfig({ id: "member_one", groupId: "group_one", schedule: { postAfterTime: "17:35", postAfterRandomWindowMinutes: 10 }, parentPosts: {} }, root);
  assert.equal(runtime.teams.threadId, "thread-group");
  assert.equal(runtime.schedule.parentPostAfterTime, "17:28");
  assert.equal(runtime.schedule.postAfterTime, "17:35");
  const persisted = splitMemberConfigAndState(runtime).configData;
  assert.equal(persisted.teams, undefined);
  assert.deepEqual(persisted.schedule, { postAfterTime: "17:35", postAfterRandomWindowMinutes: 10, skipIfBeforePostTime: true });
});

test("parent cache key is shared by members in one group", () => {
  const first = getParentPostCacheKey({ groupId: "group_one", teams: { threadId: "thread" } }, "Title A", "2026-07-23");
  const second = getParentPostCacheKey({ groupId: "group_one", teams: { threadId: "thread" } }, "Title B", "2026-07-23");
  const other = getParentPostCacheKey({ groupId: "group_two", teams: { threadId: "thread" } }, "Title A", "2026-07-23");
  assert.equal(first, second);
  assert.notEqual(first, other);
});

test("dry-run can model a parent post that does not exist", () => {
  const parent = buildDryRunParentPost({ id: "member_one", teams: { threadId: "thread-one" } }, "Daily report");
  assert.equal(parent.source, "dry-run-would-create");
  assert.equal(parent.wouldCreate, true);
  assert.equal(parent.threadId, "thread-one");
  assert.match(parent.clientConversationId, /dry-run-parent-message-id/);
});

test("member extra-work override enables a weekend report", () => {
  const saturday = { year: 2026, month: 7, day: 25 };
  assert.equal(isAllowedDay({
    schedule: { days: [1, 2, 3, 4, 5], skipDates: [], extraWorkDates: [] },
    report: { extraWorkDates: ["2026-07-25"] }
  }, saturday), true);
});

test("member skip has priority over an extra-work override", () => {
  const saturday = { year: 2026, month: 7, day: 25 };
  assert.equal(isAllowedDay({
    schedule: { days: [1, 2, 3, 4, 5], skipDates: [], extraWorkDates: [] },
    report: { skipDates: ["2026-07-25"], extraWorkDates: ["2026-07-25"] }
  }, saturday), false);
});

test("member overtime override has priority over a group holiday", () => {
  const holiday = { year: 2026, month: 9, day: 2 };
  assert.equal(isAllowedDay({
    schedule: { days: [1, 2, 3, 4, 5], skipDates: ["2026-09-02"], extraWorkDates: [] },
    report: { skipDates: [], extraWorkDates: ["2026-09-02"] }
  }, holiday), true);
});

test("monthly report base follows a per-month override and returns to automatic mode", () => {
  const config = {
    schedule: { days: [1, 2, 3, 4, 5], skipDates: [], extraWorkDates: [] },
    report: { initialReportedWorkdaysByMonth: { "2026-07": 13 } },
    postedReports: {
      "2026-07-20": { checked: true, reportIndex: 14, reportNumber: "T07/14/23" },
    },
    monthlyReports: {},
  };

  let month = getOrCreateMonthlyReport(config, { year: 2026, month: 7, day: 21 });
  assert.equal(month.baseReportedWorkdays, 13);
  assert.equal(month.baseReportedWorkdaysSource, "override");

  delete config.report.initialReportedWorkdaysByMonth["2026-07"];
  month = getOrCreateMonthlyReport(config, { year: 2026, month: 7, day: 21 });
  assert.equal(month.baseReportedWorkdays, 13);
  assert.equal(month.baseReportedWorkdaysSource, "auto");
});

test("completed tasks remain reportable by default and are filtered only when enabled", () => {
  const tasks = [
    { id: "done", title: "Done", startPercent: 100 },
    { id: "active", title: "Active", startPercent: 80 },
  ];
  assert.deepEqual(getReportableTasks({ tasks, report: {} }), tasks);
  assert.deepEqual(
    getReportableTasks({ tasks, report: { excludeCompletedTasks: true } }),
    [tasks[1]],
  );
});

test("backfill uses the next unused report index and does not regress newer task progress", () => {
  const config = {
    __backfill: true,
    postedReports: {
      "2026-08-03": { checked: true, reportIndex: 1 },
      "2026-08-05": { checked: true, reportIndex: 2 },
    },
  };
  assert.equal(getNextReportIndex(config, { year: 2026, month: 8, day: 4 }, { baseReportedWorkdays: 0 }), 3);
  assert.equal(shouldUpdateTaskProgress(config, "2026-08-04"), false);
  assert.equal(shouldUpdateTaskProgress(config, "2026-08-06"), true);
});

test("isolated backfill tasks are returned without replacing persistent member tasks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teams-report-isolated-tasks-"));
  const filePath = path.join(root, "member.json");
  const persistentTasks = [{ id: "daily", title: "Daily task", startPercent: 80 }];
  const isolatedTasks = [{ id: "backfill", title: "Past task", startPercent: 15 }];
  const member = { filePath, config: { id: "member_one", tasks: isolatedTasks } };

  const result = persistPipelineResult(member, persistentTasks, true);
  const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));

  assert.deepEqual(result, isolatedTasks);
  assert.deepEqual(stored.tasks, persistentTasks);
  assert.deepEqual(member.config.tasks, persistentTasks);
});

test("access token keepalive does not refresh a healthy one-hour token every watch loop", () => {
  const previous = process.env.ACCESS_TOKEN_REFRESH_BEFORE_MINUTES;
  process.env.ACCESS_TOKEN_REFRESH_BEFORE_MINUTES = "10";
  try {
    assert.equal(shouldRefreshAuthCache({
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    }), false);
    assert.equal(shouldRefreshAuthCache({
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    }), true);
  } finally {
    if (previous === undefined) delete process.env.ACCESS_TOKEN_REFRESH_BEFORE_MINUTES;
    else process.env.ACCESS_TOKEN_REFRESH_BEFORE_MINUTES = previous;
  }
});

test("browser renew retries immediately after a missing browser runtime is installed", () => {
  const previous = process.env.BROWSER_RENEW_EXECUTABLE_PATH;
  process.env.BROWSER_RENEW_EXECUTABLE_PATH = process.execPath;
  try {
    assert.equal(shouldRetryBrowserRenewAfterRuntimeFix({
      lastError: "browserType.launchPersistentContext: Chromium distribution 'chrome' is not found"
    }), true);
    assert.equal(shouldRetryBrowserRenewAfterRuntimeFix({
      lastError: "Browser login requires user interaction"
    }), false);
  } finally {
    if (previous === undefined) delete process.env.BROWSER_RENEW_EXECUTABLE_PATH;
    else process.env.BROWSER_RENEW_EXECUTABLE_PATH = previous;
  }
});

test("a browser-issued refresh token clears the previous token expiry when Microsoft omits the new expiry", () => {
  const config = {
    auth: {
      common: {},
      spaces: {
        reusePrimaryRefreshToken: true,
        token: {
          refreshToken: "expired-token",
          refreshTokenExpiresAt: "2026-07-23T07:32:51.810Z"
        }
      }
    }
  };

  saveBrowserRefreshToken(config, { refreshToken: "new-token", refreshTokenExpiresAt: null });

  assert.equal(config.auth.spaces.token.refreshToken, "new-token");
  assert.equal(config.auth.spaces.token.refreshTokenExpiresAt, null);
});

test("a successful browser renewal supersedes an older persisted expiry", () => {
  const config = {
    browserRenewals: {
      lastSuccessAt: "2026-07-23T08:33:16.000Z",
      lastRefreshTokenExpiresAt: null
    }
  };
  const token = { refreshTokenExpiresAt: "2026-07-23T07:32:51.810Z" };

  assert.equal(getUsablePreviousRefreshTokenExpiry(config, token), null);
});

test("unified users folder loads member config and ignores account-only directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teams-report-users-"));
  const memberDirectory = path.join(root, "users", "member_one");
  const adminDirectory = path.join(root, "users", "admin_one");
  fs.mkdirSync(memberDirectory, { recursive: true });
  fs.mkdirSync(adminDirectory, { recursive: true });
  fs.writeFileSync(path.join(memberDirectory, "config.json"), JSON.stringify({
    id: "member_one",
    enabled: true,
    tasks: [],
    pending: [],
    innovations: [],
    schedule: { postAfterTime: "17:30", postAfterRandomWindowMinutes: 0 },
    report: {}
  }));
  fs.writeFileSync(path.join(memberDirectory, "state.json"), JSON.stringify({ postedReports: {} }));
  fs.writeFileSync(path.join(adminDirectory, "account.json"), JSON.stringify({ username: "admin_one" }));
  const members = loadMemberConfigs(undefined, root);
  assert.equal(members.length, 1);
  assert.equal(members[0].config.id, "member_one");
  assert.equal(members[0].configFilePath, path.join(memberDirectory, "config.json"));
});

test("credential refresh writes credentials without touching member config", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teams-report-credentials-"));
  const directory = path.join(root, "users", "member_one");
  fs.mkdirSync(directory, { recursive: true });
  const configPath = path.join(directory, "config.json");
  const statePath = path.join(directory, "state.json");
  const credentialsPath = path.join(directory, "credentials.json");
  fs.writeFileSync(configPath, JSON.stringify({
    id: "member_one", enabled: true, tasks: [], pending: [], innovations: [],
    schedule: { postAfterTime: "17:30", postAfterRandomWindowMinutes: 0 }, report: {}
  }));
  fs.writeFileSync(statePath, "{}");
  fs.writeFileSync(credentialsPath, JSON.stringify({ auth: { ic3: { token: { accessToken: "old" } } }, browser: { autoRenew: true } }));
  const before = fs.readFileSync(configPath, "utf8");
  const member = loadMemberConfigs("member_one", root)[0];
  member.config.auth.ic3.token.accessToken = "new";
  persistCredentials(member);
  assert.equal(fs.readFileSync(configPath, "utf8"), before);
  assert.equal(JSON.parse(fs.readFileSync(credentialsPath, "utf8")).auth.ic3.token.accessToken, "new");
});

test("refreshed tokens are always isolated in the member auth profile", () => {
  const config = {
    id: "member_one",
    auth: {
      common: {},
      spaces: { storeTokenInMember: false }
    }
  };

  saveTokenForConfig(config, {
    accessToken: "member-access-token",
    refreshToken: "member-refresh-token",
    expiresAt: "2026-07-24T12:00:00.000Z"
  }, "spaces");

  assert.equal(config.auth.spaces.token.accessToken, "member-access-token");
  assert.equal(config.auth.spaces.refreshToken, "member-refresh-token");
  assert.equal(config.auth.common.refreshToken, "member-refresh-token");
});

test("bot member persistence increments config version", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teams-report-version-"));
  const directory = path.join(root, "users", "member_one");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "config.json"), JSON.stringify({
    id: "member_one", enabled: true, version: 4, tasks: [], pending: [], innovations: [],
    schedule: { postAfterTime: "17:30", postAfterRandomWindowMinutes: 0 }, report: {}
  }));
  fs.writeFileSync(path.join(directory, "state.json"), "{}");
  fs.writeFileSync(path.join(directory, "credentials.json"), JSON.stringify({ auth: {}, browser: {} }));
  const member = loadMemberConfigs("member_one", root)[0];
  persistMember(member);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "config.json"), "utf8")).version, 5);
});
