const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = __dirname;
const EMPTY_CELL = "&nbsp;";
const AUTH_KEEPALIVE_PROFILES = ["spaces", "substrate", "ic3"];
const PARENT_POST_CACHE_FILE = path.join(ROOT, ".state", "parent-posts.json");
const MEMBER_STATE_KEYS = ["parentPosts", "postedReports", "dailyPlans", "monthlyReports"];
const DEFAULT_REPORT_NUMBER_TEMPLATE = "T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}";
const DAY_INDEX = {
  sunday: 0,
  sun: 0,
  "chủ nhật": 0,
  cn: 0,
  monday: 1,
  mon: 1,
  "thứ hai": 1,
  "thu hai": 1,
  t2: 1,
  tuesday: 2,
  tue: 2,
  "thứ ba": 2,
  "thu ba": 2,
  t3: 2,
  wednesday: 3,
  wed: 3,
  "thứ tư": 3,
  "thu tu": 3,
  t4: 3,
  thursday: 4,
  thu: 4,
  "thứ năm": 4,
  "thu nam": 4,
  t5: 4,
  friday: 5,
  fri: 5,
  "thứ sáu": 5,
  "thu sau": 5,
  t6: 5,
  saturday: 6,
  sat: 6,
  "thứ bảy": 6,
  "thu bay": 6,
  t7: 6
};

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  loadDotEnv(path.join(ROOT, ".env"));

  const args = parseArgs(process.argv.slice(2));

  if (args.watch) {
    startWatch(process.argv.slice(2));
    return;
  }

  const members = loadMemberConfigs(args.member);

  if (args["test-auth"]) {
    for (const member of members) {
      const authKey = typeof args["test-auth"] === "string" ? args["test-auth"] : "auth";
      const token = await getAccessToken(member.config, authKey);
      persistMember(member);
      console.log(`[INFO][${member.config.id}][${authKey}] Auth OK. Access token length: ${token.length}.`);
    }
    return;
  }

  let hasFailure = false;
  for (const member of members) {
    let releaseLock = null;
    try {
      if (!args["dry-run"] && !args.dryRun) {
        releaseLock = acquireMemberRunLock(member.config.id);
      }
      await runPipelineForMember(member, args);
    } catch (error) {
      hasFailure = true;
      console.error(`[ERROR][${member.config.id}] ${error.message}`);
    } finally {
      if (releaseLock) {
        releaseLock();
      }
    }
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
}

async function runPipelineForMember(member, args) {
  const config = member.config;
  const dryRun = Boolean(args["dry-run"] || args.dryRun);
  const force = Boolean(args.force);
  const timezone = args.timezone || config.schedule?.timezone || process.env.REPORT_TIMEZONE || "Asia/Bangkok";
  const postProfileKey = getPostProfileKey(config);
  const now = new Date();
  const reportDate = args.date ? parseDate(args.date) : getDatePartsInTimezone(now, timezone);
  const reportDateIso = formatIsoDate(reportDate);
  const title = renderTemplate(config.teams.searchTitleTemplate, reportDate, config);
  let pipelineStage = "report";

  if (!force && !dryRun) {
    const refreshedProfiles = await refreshAuthProfilesIfNeeded(config);
    if (refreshedProfiles.length) {
      persistMember(member);
      console.log(`[INFO][${config.id}] Refreshed auth profile(s): ${refreshedProfiles.join(", ")}.`);
    }
  }

  if (!force && !dryRun) {
    pipelineStage = getPipelineStage(config, reportDate, now, timezone);
    if (pipelineStage === "skip") {
      return;
    }
    if (ensureDailyPlan(config, reportDate)) {
      persistMember(member);
    }
    if (isReportAlreadyPosted(config, reportDateIso)) {
      return;
    }
  }

  let accessToken = null;
  let parentPost = null;

  if (args["parent-message-id"]) {
    parentPost = {
      title,
      parentMessageId: String(args["parent-message-id"]),
      threadId: args["thread-id"] || config.teams.threadId,
      clientConversationId: `${args["thread-id"] || config.teams.threadId};messageid=${args["parent-message-id"]}`,
      rank: null
    };
  } else {
    accessToken = await getAccessToken(config, postProfileKey);
    if (!dryRun) {
      persistMember(member);
    }
    console.log(`[INFO][${config.id}] Searching parent post: ${title}`);
    const parentPostResult = await withAuthRetry(
      config,
      accessToken,
      (token) => findOrCreateParentPost(config, token, title, reportDateIso, {
        allowCreate: !dryRun
      }),
      postProfileKey
    );
    accessToken = parentPostResult.accessToken;
    parentPost = parentPostResult.value;
    if (!dryRun && parentPost.createdOrFound) {
      persistMember(member);
    }
  }

  if (!dryRun && pipelineStage === "parentOnly") {
    console.log(`[INFO][${config.id}] Parent post is ready for ${reportDateIso}. Report reply will run after ${getReportPostAfterTime(config)}.`);
    return;
  }

  const parentMessageId = parentPost.parentMessageId;
  const threadId = parentPost.threadId || config.teams.threadId;
  if (!parentMessageId) {
    throw new Error("Search succeeded but parent message id was not found in the result.");
  }

  if (!dryRun) {
    if (!accessToken) {
      accessToken = await getAccessToken(config, postProfileKey);
      persistMember(member);
    }
    const parentWithReplies = await withAuthRetry(
      config,
      accessToken,
      (token) => loadParentPostReplies(config, token, parentPost),
      postProfileKey
    );
    accessToken = parentWithReplies.accessToken;
    parentPost = parentWithReplies.value;
  }

  const existingReply = findExistingReportReply(config, parentPost, reportDate);
  if (!dryRun && existingReply) {
    console.log(`[INFO][${config.id}] Report reply already exists in parent post. Marking ${reportDateIso} as checked.`);
    markReportChecked(config, {
      reportDateIso,
      title,
      parentMessageId,
      threadId,
      result: {
        OriginalArrivalTime:
          existingReply.originalArrivalTime ||
          existingReply.originalarrivaltime ||
          existingReply.originalarrivaltime ||
          existingReply.id ||
          null
      }
    });
    persistMember(member);
    return;
  }

  const content = buildReportHtml(config, reportDate);
  const payload = buildReplyPayload(config, {
    content,
    parentMessageId,
    threadId
  });

  if (dryRun) {
    console.log(`[DRY_RUN][${config.id}] Parent post:`);
    console.log(JSON.stringify(parentPost, null, 2));
    console.log(`[DRY_RUN][${config.id}] Reply payload:`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!accessToken) {
    accessToken = await getAccessToken(config, postProfileKey);
    persistMember(member);
  }
  const replyResult = await withAuthRetry(config, accessToken, (token) =>
    postReply(config, token, threadId, parentMessageId, payload),
    postProfileKey
  );
  accessToken = replyResult.accessToken;
  const result = replyResult.value;
  console.log(`[INFO][${config.id}] Posted report reply successfully.`);
  console.log(JSON.stringify(result, null, 2));

  const progressUpdates = updateTaskProgressAfterPost(config, reportDate);
  markReportChecked(config, {
    reportDateIso,
    title,
    parentMessageId,
    threadId,
    result
  });
  persistMember(member);
  console.log(`[INFO][${config.id}] Updated member progress for ${progressUpdates.length} task(s).`);
}

function loadMemberConfigs(memberFilter) {
  const membersDir = path.join(ROOT, "members");
  if (!fs.existsSync(membersDir)) {
    throw new Error("members folder was not found.");
  }

  const entries = fs.readdirSync(membersDir, { withFileTypes: true });
  const splitMemberDirs = entries
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(membersDir, entry.name, "config.json")))
    .map((entry) => entry.name)
    .sort();
  const splitMemberNames = new Set(splitMemberDirs);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .filter((file) => !splitMemberNames.has(path.basename(file, ".json")))
    .sort();

  if (!splitMemberDirs.length && !files.length) {
    throw new Error("No member config files were found in members/*/config.json or members/*.json.");
  }

  const members = [];
  for (const dirName of splitMemberDirs) {
    const memberDir = path.join(membersDir, dirName);
    const configFilePath = path.join(memberDir, "config.json");
    const stateFilePath = path.join(memberDir, "state.json");
    const config = loadSplitMemberConfig(configFilePath, stateFilePath, dirName);
    if (!shouldLoadMember(config, memberFilter, dirName)) {
      continue;
    }

    members.push({
      filePath: configFilePath,
      configFilePath,
      stateFilePath,
      config
    });
  }

  for (const file of files) {
    const filePath = path.join(membersDir, file);
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) {
      console.warn(`[WARN] Skipping empty member config: ${file}`);
      continue;
    }

    const config = JSON.parse(raw);
    config.id ||= path.basename(file, ".json");
    if (!shouldLoadMember(config, memberFilter, path.basename(file, ".json"))) {
      continue;
    }

    members.push({ filePath, config });
  }

  if (!members.length) {
    throw new Error(memberFilter ? `No enabled member matched: ${memberFilter}` : "No enabled member configs were found.");
  }

  return members;
}

function loadSplitMemberConfig(configFilePath, stateFilePath, fallbackId) {
  const config = readJson(configFilePath);
  const state = fs.existsSync(stateFilePath) ? readJson(stateFilePath) : {};
  config.id ||= fallbackId;

  for (const key of MEMBER_STATE_KEYS) {
    config[key] = state[key] || config[key] || {};
  }

  return config;
}

function shouldLoadMember(config, memberFilter, fallbackId) {
  if (memberFilter && config.id !== memberFilter && fallbackId !== memberFilter) {
    return false;
  }

  if (config.enabled === false) {
    console.log(`[INFO][${config.id}] Skipped disabled member.`);
    return false;
  }

  return true;
}

function persistMember(member) {
  if (member.configFilePath && member.stateFilePath) {
    const { configData, stateData } = splitMemberConfigAndState(member.config);
    writeJson(member.configFilePath, configData);
    writeJson(member.stateFilePath, stateData);
    return;
  }

  writeJson(member.filePath, member.config);
}

function splitMemberConfigAndState(config) {
  const configData = { ...config };
  const stateData = {};

  for (const key of MEMBER_STATE_KEYS) {
    stateData[key] = configData[key] || {};
    delete configData[key];
  }

  return { configData, stateData };
}

function acquireMemberRunLock(memberId) {
  return acquireRunLock(`member-${sanitizeFileName(memberId)}`, { memberId });
}

function acquireRunLock(lockName, data = {}) {
  const locksDir = path.join(ROOT, ".locks");
  fs.mkdirSync(locksDir, { recursive: true });

  const lockFilePath = path.join(locksDir, `${sanitizeFileName(lockName)}.lock`);
  const staleMs = Number(process.env.RUN_LOCK_STALE_MINUTES || 240) * 60 * 1000;

  try {
    fs.writeFileSync(lockFilePath, JSON.stringify({
      ...data,
      pid: process.pid,
      startedAt: new Date().toISOString()
    }), {
      encoding: "utf8",
      flag: "wx"
    });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }

    const stat = fs.statSync(lockFilePath);
    if (Number.isFinite(staleMs) && staleMs > 0 && Date.now() - stat.mtimeMs > staleMs) {
      fs.unlinkSync(lockFilePath);
      return acquireRunLock(lockName, data);
    }

    throw new Error(`Another pipeline run is already active for lock ${lockName}.`);
  }

  return () => {
    try {
      fs.unlinkSync(lockFilePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`[WARN] Could not remove run lock ${lockName}: ${error.message}`);
      }
    }
  };
}

async function acquireParentPostLock(cacheKey, data = {}) {
  const timeoutMs = Number(process.env.PARENT_POST_LOCK_TIMEOUT_MS || 120000);
  const retryMs = Number(process.env.PARENT_POST_LOCK_RETRY_MS || 1000);
  const deadline = Date.now() + (Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000);
  const safeRetryMs = Number.isFinite(retryMs) && retryMs > 0 ? retryMs : 1000;
  const lockName = `parent-${cacheKey}`;

  while (true) {
    try {
      return acquireRunLock(lockName, data);
    } catch (error) {
      if (!String(error.message || "").includes("already active") || Date.now() >= deadline) {
        throw error;
      }
      await sleep(safeRetryMs);
    }
  }
}

function sanitizeFileName(value) {
  return String(value || "member").replace(/[^a-z0-9._-]+/gi, "_");
}

function startWatch(rawArgs) {
  const intervalMinutes = Number(process.env.WATCH_INTERVAL_MINUTES || 5);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error("WATCH_INTERVAL_MINUTES must be a positive number.");
  }

  const childArgs = stripWatchOnlyArgs(rawArgs);
  const intervalMs = intervalMinutes * 60 * 1000;
  let running = false;

  const runOnce = () => {
    if (running) {
      console.log("[WATCH] Previous run is still active. Skipping this tick.");
      return;
    }

    running = true;
    console.log(`[WATCH] Running pipeline at ${new Date().toISOString()}.`);
    const child = spawn(process.execPath, [__filename, ...childArgs], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", (error) => {
      running = false;
      console.error(`[WATCH] Failed to start pipeline: ${error.message}`);
    });

    child.on("exit", (code, signal) => {
      running = false;
      const status = signal ? `signal ${signal}` : `code ${code}`;
      console.log(`[WATCH] Pipeline finished with ${status}. Next check in ${intervalMinutes} minute(s).`);
    });
  };

  console.log(`[WATCH] Started. Checking every ${intervalMinutes} minute(s). Press Ctrl+C to stop.`);
  runOnce();
  setInterval(runOnce, intervalMs);
}

function stripWatchOnlyArgs(rawArgs) {
  const blocked = new Set([
    "watch",
    "force",
    "dry-run",
    "dryRun",
    "date",
    "parent-message-id",
    "thread-id",
    "test-auth"
  ]);
  const stripped = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      stripped.push(arg);
      continue;
    }

    const key = arg.slice(2).split("=")[0];
    if (blocked.has(key)) {
      if (!arg.includes("=") && rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--")) {
        index += 1;
      }
      continue;
    }

    stripped.push(arg);
  }

  return stripped;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}


function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFilePath = `${filePath}.tmp`;
  fs.writeFileSync(tempFilePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tempFilePath, filePath);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;

    const rawKey = arg.slice(2);
    if (rawKey.includes("=")) {
      const [key, ...rest] = rawKey.split("=");
      parsed[key] = rest.join("=");
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[rawKey] = next;
      index += 1;
    } else {
      parsed[rawKey] = true;
    }
  }
  return parsed;
}

async function getAccessToken(config = {}, authKey = "auth") {
  const auth = getAuthProfile(config, authKey);
  const cacheFile = getTokenCacheFile(config, authKey);
  const cached = auth?.token || readTokenCache(cacheFile);
  const envRefreshToken = auth?.refreshTokenEnv ? process.env[auth.refreshTokenEnv] : null;
  const configuredRefreshToken =
    auth?.refreshToken ||
    envRefreshToken ||
    (authKey !== "auth" && auth?.reusePrimaryRefreshToken ? getPrimaryRefreshToken(config) : null) ||
    process.env.AUTH_REFRESH_TOKEN;

  if (cached?.accessToken && !isExpired(cached.expiresAt)) {
    return cached.accessToken;
  }

  if (cached?.access_token && !isExpired(cached.expires_at)) {
    return cached.access_token;
  }

  if (
    (cached?.refreshToken && !isExpired(cached.refreshTokenExpiresAt)) ||
    (cached?.refresh_token && !isExpired(cached.refresh_token_expires_at)) ||
    configuredRefreshToken
  ) {
    try {
      const refreshed = await refreshAccessToken(
        cached?.refreshToken || cached?.refresh_token || configuredRefreshToken,
        config,
        authKey
      );
      saveTokenForConfig(config, cacheFile, refreshed, authKey);
      return refreshed.accessToken;
    } catch (error) {
      console.warn(`[WARN][${config.id || "member"}][${authKey}] Refresh token failed: ${error.message}`);
    }
  }

  if (authKey === "auth" && process.env.TEAMS_ACCESS_TOKEN) {
    return process.env.TEAMS_ACCESS_TOKEN;
  }

  const loggedIn = await login(config, authKey);
  saveTokenForConfig(config, cacheFile, loggedIn, authKey);
  return loggedIn.accessToken;
}

async function withAuthRetry(config, accessToken, operation, authKey = "auth") {
  try {
    return {
      accessToken,
      value: await operation(accessToken)
    };
  } catch (error) {
    if (!isUnauthorizedError(error)) {
      throw error;
    }

    console.warn(`[WARN][${config.id}][${authKey}] Access token was rejected. Refreshing token and retrying once.`);
    const refreshedAccessToken = await forceRefreshAccessToken(config, authKey);
    return {
      accessToken: refreshedAccessToken,
      value: await operation(refreshedAccessToken)
    };
  }
}

async function forceRefreshAccessToken(config = {}, authKey = "auth") {
  const auth = getAuthProfile(config, authKey);
  const cacheFile = getTokenCacheFile(config, authKey);
  const cached = auth?.token || readTokenCache(cacheFile) || {};
  const envRefreshToken = auth?.refreshTokenEnv ? process.env[auth.refreshTokenEnv] : null;
  const refreshToken =
    cached.refreshToken ||
    cached.refresh_token ||
    auth?.refreshToken ||
    envRefreshToken ||
    (authKey !== "auth" && auth?.reusePrimaryRefreshToken ? getPrimaryRefreshToken(config) : null) ||
    process.env.AUTH_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error("Access token expired and no refresh token is configured.");
  }

  const refreshed = await refreshAccessToken(refreshToken, config, authKey);
  saveTokenForConfig(config, cacheFile, refreshed, authKey);
  return refreshed.accessToken;
}

async function refreshAuthProfilesIfNeeded(config = {}) {
  const refreshedProfiles = [];

  for (const authKey of AUTH_KEEPALIVE_PROFILES) {
    if (!config.auth?.[authKey]) continue;

    try {
      const auth = getAuthProfile(config, authKey);
      const cacheFile = getTokenCacheFile(config, authKey);
      const cached = auth?.token || readTokenCache(cacheFile);

      if (!hasRefreshTokenSource(config, auth, authKey, cached)) {
        continue;
      }

      if (!cached?.accessToken && !cached?.access_token) {
        await getAccessToken(config, authKey);
        refreshedProfiles.push(authKey);
        continue;
      }

      if (shouldRefreshAuthCache(cached)) {
        await forceRefreshAccessToken(config, authKey);
        refreshedProfiles.push(authKey);
      }
    } catch (error) {
      console.warn(`[WARN][${config.id || "member"}][${authKey}] Auth keepalive failed: ${error.message}`);
    }
  }

  return refreshedProfiles;
}

function hasRefreshTokenSource(config, auth, authKey, cached) {
  return Boolean(
    cached?.refreshToken ||
    cached?.refresh_token ||
    auth?.refreshToken ||
    (auth?.refreshTokenEnv && process.env[auth.refreshTokenEnv]) ||
    (authKey !== "auth" && auth?.reusePrimaryRefreshToken && getPrimaryRefreshToken(config)) ||
    process.env.AUTH_REFRESH_TOKEN
  );
}

function shouldRefreshAuthCache(cached = {}) {
  return (
    isExpired(cached.expiresAt || cached.expires_at) ||
    expiresWithin(cached.refreshTokenExpiresAt || cached.refresh_token_expires_at, getTokenRefreshBeforeMs())
  );
}

function getTokenRefreshBeforeMs() {
  const hours = Number(process.env.TOKEN_REFRESH_BEFORE_HOURS || 12);
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 12;
  return safeHours * 60 * 60 * 1000;
}

function expiresWithin(expiresAt, windowMs) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() <= windowMs;
}

function isUnauthorizedError(error) {
  return Number(error?.status) === 401;
}

function saveTokenForConfig(config, cacheFile, token, authKey = "auth") {
  const auth = getAuthProfile(config, authKey);
  const writableAuth = getWritableAuthProfile(config, authKey);
  if (auth && auth.storeTokenInMember !== false && writableAuth) {
    writableAuth.token = token;
    if (token.refreshToken) {
      writableAuth.refreshToken = token.refreshToken;
      syncPrimaryRefreshToken(config, authKey, token.refreshToken);
    }
    return;
  }

  writeTokenCache(cacheFile, token);
}

function syncPrimaryRefreshToken(config, authKey, refreshToken) {
  const normalizedKey = normalizeAuthKey(authKey);
  if (normalizedKey !== "spaces" || !refreshToken) {
    return;
  }

  config.auth ||= {};
  config.auth.common ||= {};
  config.auth.common.refreshToken = refreshToken;
}

function getTokenCacheFile(config = {}, authKey = "auth") {
  const auth = getAuthProfile(config, authKey);
  const tokenCacheFile =
    auth?.tokenCacheFile ||
    config.tokenCacheFile ||
    process.env.TOKEN_CACHE_FILE ||
    (authKey === "auth" ? "token.json" : `tokens/${authKey}.json`);
  return path.resolve(ROOT, tokenCacheFile);
}

function getAuthProfile(config = {}, authKey = "auth") {
  const authRoot = config.auth || {};
  const normalizedKey = normalizeAuthKey(authKey);

  if (!isStructuredAuth(authRoot)) {
    throw new Error(`Member ${config.id || ""} auth config must use auth.common plus auth.<profile>.`);
  }

  const common = authRoot.common || {};
  const profile = authRoot[normalizedKey] || {};
  if (!Object.keys(profile).length && normalizedKey !== "common") {
    throw new Error(`Auth profile "${normalizedKey}" was not found for member ${config.id || ""}.`);
  }

  return {
    ...common,
    ...profile,
    common
  };
}

function getWritableAuthProfile(config = {}, authKey = "auth") {
  const normalizedKey = normalizeAuthKey(authKey);

  config.auth ||= { common: {} };
  config.auth[normalizedKey] ||= {};
  return config.auth[normalizedKey];
}

function isStructuredAuth(authRoot) {
  return Boolean(
    authRoot &&
    typeof authRoot === "object" &&
    (authRoot.common || authRoot.spaces || authRoot.substrate || authRoot.ic3)
  );
}

function normalizeAuthKey(authKey = "auth") {
  const key = String(authKey || "auth");
  const aliases = {
    auth: "spaces",
    primary: "spaces",
    teams: "spaces",
    spaces: "spaces",
    search: "substrate",
    substrate: "substrate",
    post: "ic3",
    chatsvc: "ic3",
    ic3: "ic3",
    common: "common"
  };
  return aliases[key] || key;
}

function getPrimaryRefreshToken(config = {}) {
  return config.auth?.common?.refreshToken || config.auth?.spaces?.refreshToken || null;
}

function getDefaultAnchorMailbox(config = {}) {
  return config.auth?.common?.anchorMailbox || config.auth?.spaces?.anchorMailbox || "";
}

function getPostProfileKey(config = {}) {
  return config.auth?.ic3 ? "ic3" : "auth";
}

function readTokenCache(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeTokenCache(filePath, token) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(token, null, 2)}\n`, "utf8");
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return Date.now() >= new Date(expiresAt).getTime() - 60_000;
}

async function refreshAccessToken(refreshToken, config = {}, authKey = "auth") {
  if (!process.env.AUTH_REFRESH_URL) {
    throw new Error("AUTH_REFRESH_URL is empty.");
  }

  const request = buildRefreshTokenRequest(refreshToken, config, authKey);
  const response = await fetchJson(buildRefreshTokenUrl(process.env.AUTH_REFRESH_URL, config, authKey), {
    method: "POST",
    headers: request.headers,
    body: request.body
  });

  const token = normalizeTokenResponse(response, refreshToken);
  logTokenExpiry(config, authKey, token);
  return token;
}

function logTokenExpiry(config = {}, authKey = "auth", token = {}) {
  console.log(
    [
      `[INFO][${config.id || "member"}][${normalizeAuthKey(authKey)}] Token refreshed.`,
      `accessTokenExpiresAt=${formatExpiryForLog(token.expiresAt)}`,
      `refreshTokenExpiresAt=${formatExpiryForLog(token.refreshTokenExpiresAt)}`
    ].join(" ")
  );
}

function formatExpiryForLog(expiresAt) {
  if (!expiresAt) {
    return "unknown";
  }

  const expiresTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresTime)) {
    return String(expiresAt);
  }

  return `${new Date(expiresTime).toISOString()} (${formatMsRemaining(expiresTime - Date.now())})`;
}

function formatMsRemaining(ms) {
  const expired = ms < 0;
  let remainingSeconds = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const days = Math.floor(remainingSeconds / 86400);
  remainingSeconds %= 86400;
  const hours = Math.floor(remainingSeconds / 3600);
  remainingSeconds %= 3600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const prefix = expired ? "expired " : "in ";
  const suffix = expired ? " ago" : "";

  if (days > 0) {
    return `${prefix}${days}d ${hours}h ${minutes}m${suffix}`;
  }

  if (hours > 0) {
    return `${prefix}${hours}h ${minutes}m${suffix}`;
  }

  if (minutes > 0) {
    return `${prefix}${minutes}m ${seconds}s${suffix}`;
  }

  return `${prefix}${seconds}s${suffix}`;
}

function buildRefreshTokenUrl(rawUrl, config = {}, authKey = "auth") {
  try {
    const url = new URL(rawUrl);
    const auth = getAuthProfile(config, authKey);
    const includeBrkFields =
      typeof auth?.includeBrkFields === "boolean"
        ? auth.includeBrkFields
        : process.env.MS_INCLUDE_BRK_FIELDS === "true";

    setUrlSearchParam(url, "client_id", auth?.clientId || process.env.MS_CLIENT_ID);
    if (includeBrkFields) {
      setUrlSearchParam(url, "brk_client_id", auth?.brkClientId || process.env.MS_BRK_CLIENT_ID);
      setUrlSearchParam(url, "brk_redirect_uri", auth?.brkRedirectUri || process.env.MS_BRK_REDIRECT_URI);
    }
    url.searchParams.set("client-request-id", crypto.randomUUID());
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function setUrlSearchParam(url, key, value) {
  if (value !== undefined && value !== null && value !== "") {
    url.searchParams.set(key, value);
  }
}

function buildRefreshTokenRequest(refreshToken, config = {}, authKey = "auth") {
  const contentType = process.env.AUTH_REFRESH_CONTENT_TYPE || "application/json";
  if (contentType === "application/x-www-form-urlencoded") {
    const auth = getAuthProfile(config, authKey);
    const params = new URLSearchParams();
    setFormValue(params, "client_id", auth?.clientId || process.env.MS_CLIENT_ID);
    setFormValue(params, "redirect_uri", auth?.redirectUri || process.env.MS_REDIRECT_URI);
    setFormValue(params, "scope", auth?.scope || process.env.MS_SCOPE);
    setFormValue(params, "grant_type", "refresh_token");
    setFormValue(params, "client_info", process.env.MS_CLIENT_INFO || "1");
    setFormValue(params, "x-client-SKU", process.env.MS_X_CLIENT_SKU);
    setFormValue(params, "x-client-VER", process.env.MS_X_CLIENT_VER);
    setFormValue(params, "x-ms-lib-capability", process.env.MS_X_MS_LIB_CAPABILITY);
    setFormValue(params, "x-client-current-telemetry", process.env.MS_X_CLIENT_CURRENT_TELEMETRY);
    setFormValue(params, "x-client-last-telemetry", process.env.MS_X_CLIENT_LAST_TELEMETRY);
    setFormValue(params, "refresh_token", refreshToken);
    setFormValue(params, "claims", normalizeClaimsValue(auth?.claims));
    setFormValue(params, "X-AnchorMailbox", auth?.anchorMailbox || getDefaultAnchorMailbox(config) || process.env.MS_X_ANCHOR_MAILBOX);
    const includeBrkFields =
      typeof auth?.includeBrkFields === "boolean"
        ? auth.includeBrkFields
        : process.env.MS_INCLUDE_BRK_FIELDS === "true";
    if (includeBrkFields) {
      setFormValue(params, "brk_client_id", auth?.brkClientId || process.env.MS_BRK_CLIENT_ID);
      setFormValue(params, "brk_redirect_uri", auth?.brkRedirectUri || process.env.MS_BRK_REDIRECT_URI);
    }

    return {
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8",
        ...buildSpaAuthHeaders(config, authKey)
      },
      body: params.toString()
    };
  }

  return {
    headers: {
      "content-type": "application/json",
      ...buildSpaAuthHeaders(config, authKey)
    },
    body: JSON.stringify({ refreshToken })
  };
}

function buildSpaAuthHeaders(config = {}, authKey = "auth") {
  const auth = getAuthProfile(config, authKey);
  const origin =
    auth?.origin ||
    process.env.MS_ORIGIN ||
    getOriginFromUrl(auth?.redirectUri || process.env.MS_REDIRECT_URI);
  return origin ? { origin } : {};
}

function getOriginFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return "";
  }
}

function setFormValue(params, key, value) {
  if (value !== undefined && value !== null && value !== "") {
    params.set(key, value);
  }
}

function normalizeClaimsValue(claims) {
  if (!claims) return "";
  return typeof claims === "string" ? claims : JSON.stringify(claims);
}

async function login(config = {}, authKey = "auth") {
  const auth = getAuthProfile(config, authKey);
  if (!process.env.AUTH_LOGIN_URL) {
    throw new Error(
      "No usable token found. Set TEAMS_ACCESS_TOKEN now, or fill AUTH_LOGIN_URL/AUTH_USERNAME/AUTH_PASSWORD later."
    );
  }

  const response = await fetchJson(process.env.AUTH_LOGIN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      username: auth?.username || process.env.AUTH_USERNAME,
      email: auth?.email || process.env.AUTH_EMAIL,
      password: auth?.password || process.env.AUTH_PASSWORD
    })
  });

  return normalizeTokenResponse(response);
}

function normalizeTokenResponse(response, fallbackRefreshToken) {
  const accessToken =
    response.accessToken || response.access_token || response.token || response.data?.accessToken;
  const refreshToken =
    response.refreshToken ||
    response.refresh_token ||
    response.data?.refreshToken ||
    fallbackRefreshToken ||
    null;
  const expiresIn = Number(response.expiresIn || response.expires_in || response.data?.expiresIn || 0);
  const refreshTokenExpiresIn = Number(
    response.refreshTokenExpiresIn ||
    response.refresh_token_expires_in ||
    response.data?.refreshTokenExpiresIn ||
    response.data?.refresh_token_expires_in ||
    0
  );
  const expiresAt =
    response.expiresAt ||
    response.expires_at ||
    response.data?.expiresAt ||
    (expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null);
  const refreshTokenExpiresAt =
    response.refreshTokenExpiresAt ||
    response.refresh_token_expires_at ||
    response.data?.refreshTokenExpiresAt ||
    response.data?.refresh_token_expires_at ||
    (refreshTokenExpiresIn ? new Date(Date.now() + refreshTokenExpiresIn * 1000).toISOString() : null);

  if (!accessToken) {
    throw new Error("Auth response does not contain an access token.");
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    refreshTokenExpiresAt,
    tokenType: response.tokenType || response.token_type || response.data?.tokenType || "Bearer",
    scope: response.scope || response.data?.scope || null,
    idToken: response.idToken || response.id_token || response.data?.idToken || null,
    clientInfo: response.clientInfo || response.client_info || response.data?.clientInfo || null
  };
}

async function searchParentPost(config, accessToken, title) {
  const method = getParentSearchMethod(config);

  if (method === "substrate") {
    return searchParentPostViaSubstrate(config, accessToken, title);
  }

  try {
    return await searchParentPostViaListPosts(config, accessToken, title);
  } catch (error) {
    if (method !== "both" || !String(error.message || "").startsWith("Could not find parent post")) {
      throw error;
    }

    return searchParentPostViaSubstrate(config, accessToken, title);
  }
}

function getParentSearchMethod(config) {
  return String(config.teams?.parentSearchMethod || process.env.PARENT_SEARCH_METHOD || "list").toLowerCase();
}

async function searchParentPostViaListPosts(config, accessToken, title) {
  const pageSize = Number(process.env.LIST_POSTS_PAGE_SIZE || 50);
  const maxPages = Number(process.env.LIST_POSTS_MAX_PAGES || 5);
  let continuationToken = null;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchJson(buildListPostsUrl(config, pageSize, continuationToken), {
      method: "GET",
      headers: csaRequestHeaders(accessToken)
    });

    const posts = response.posts || response.value || response.Posts || [];
    const exact = posts.find((post) => isExactListPostResult(post, title));
    if (exact) {
      return normalizeListPostResult(config, exact, title);
    }

    continuationToken = response.continuationToken || response.ContinuationToken || null;
    if (!continuationToken || response.hasMore === false) {
      break;
    }
  }

  throw new Error(`Could not find parent post with title: ${title}`);
}

function buildListPostsUrl(config, pageSize, continuationToken) {
  const baseUrl =
    process.env.LIST_POSTS_API_BASE_URL ||
    "https://teams.cloud.microsoft/api/csa/apac/api/v1/containers";
  const url = new URL(`${baseUrl}/${encodeURIComponent(config.teams.threadId)}/posts`);

  setUrlSearchParam(url, "modality", "post");
  setUrlSearchParam(url, "pageSize", Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 50);
  setUrlSearchParam(url, "teamId", config.teams.teamId);
  setUrlSearchParam(url, "includeRcMetadata", "true");
  setUrlSearchParam(url, "filterSystemMessage", "true");
  setUrlSearchParam(url, "shouldIncludeSharedToL1Rc", "true");
  setUrlSearchParam(url, "continuationToken", continuationToken);

  return url.toString();
}

function isExactListPostResult(post, title) {
  const message = post.message || post.Message || post;
  const subject = message.properties?.subject || message.Properties?.subject || "";
  const contentText = htmlToText(message.content || message.Content || "");
  return subject === title || contentText === title;
}

function normalizeListPostResult(config, post, title) {
  const message = post.message || post.Message || post;
  const properties = message.properties || message.Properties || {};
  const parentMessageId = message.parentMessageId || message.id || post.id || post.Id || null;
  const threadId = message.containerId || post.containerId || config.teams.threadId;

  return {
    title: properties.subject || htmlToText(message.content || "") || title,
    parentMessageId,
    threadId,
    clientConversationId: `${threadId};messageid=${parentMessageId}`,
    rank: null,
    replies: post.replies || post.Replies || null
  };
}

function htmlToText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function searchParentPostViaSubstrate(config, accessToken, title) {
  const searchAccessToken = await getAccessToken(config, "substrate");
  const result = await withAuthRetry(
    config,
    searchAccessToken,
    (token) => searchParentPostViaSubstrateWithToken(config, token, title),
    "substrate"
  );
  return result.value;
}

async function searchParentPostViaSubstrateWithToken(config, accessToken, title) {
  const url = process.env.SEARCH_API_URL || "https://substrate.office.com/searchservice/api/v2/query";
  const queryString = [
    `clientthreadid:${config.teams.threadId}`,
    "AND (Extension_SkypeSpaces_ConversationPost_Extension_ThreadType_String:(topic OR space))",
    "AND NOT (isClientSoftDeleted:TRUE)",
    title
  ].join(" ");

  const body = {
    entityRequests: [
      {
        entityType: "Message",
        contentSources: ["Teams"],
        fields: [
          "Extension_SkypeSpaces_ConversationPost_Extension_FromSkypeInternalId_String",
          "Extension_SkypeSpaces_ConversationPost_Extension_FileData_String",
          "Extension_SkypeSpaces_ConversationPost_Extension_ThreadType_String",
          "GroupId",
          "Extension_SkypeSpaces_ConversationPost_Extension_SenderTenantId_String",
          "Extension_SkypeSpaces_ConversationPost_Extension_ParentMessageId_String",
          "Extension_SkypeSpaces_ConversationPost_Extension_ConversationType_String",
          "Extension_SkypeSpaces_ConversationPost_Extension_Topic_String",
          "Extension_SkypeSpaces_ConversationPost_Extension_ImageSrc_String",
          "Extension_SkypeSpaces_ConversationPost_Extension_MessageSubType_String"
        ],
        query: {
          queryString,
          displayQueryString: title
        },
        propertySet: "Optimized",
        from: 0,
        size: 25
      }
    ],
    cvid: crypto.randomUUID(),
    logicalId: crypto.randomUUID(),
    QueryAlterationOptions: {
      EnableAlteration: true,
      EnableSuggestion: true,
      SupportedRecourseDisplayTypes: ["Suggestion"]
    },
    scenario: {
      Dimensions: [
        {
          DimensionName: "QueryType",
          DimensionValue: "ContextualTypeahead"
        },
        {
          DimensionName: "FormFactor",
          DimensionValue: "ring36.cdlworker.reactSearch"
        }
      ],
      Name: "powerbar"
    }
  };

  const response = await fetchJson(url, {
    method: "POST",
    headers: substrateSearchHeaders(config, accessToken),
    body: JSON.stringify(body)
  });

  const results =
    response.EntitySets?.flatMap((set) =>
      set.ResultSets?.flatMap((resultSet) => resultSet.Results || []) || []
    ) || [];

  const exact = results.find((result) => isExactParentPostResult(result, title));
  if (!exact) {
    throw new Error(`Could not find parent post with title: ${title}`);
  }

  const source = exact.Source || {};
  const extensions = source.Extensions || {};
  return {
    title: source.Subject || source.ConversationTopic || title,
    parentMessageId:
      extensions.SkypeSpaces_ConversationPost_Extension_ParentMessageId ||
      source.InternetMessageId ||
      extractMessageId(source.ClientConversationId),
    threadId: source.ClientThreadId || config.teams.threadId,
    clientConversationId: source.ClientConversationId,
    rank: exact.Rank
  };
}

function isExactParentPostResult(result, title) {
  const source = result.Source || {};
  return source.Subject === title || source.ConversationTopic === title;
}

async function findOrCreateParentPost(config, accessToken, title, reportDateIso, options = {}) {
  const parentCacheKey = getParentPostCacheKey(config, title, reportDateIso);
  const cachedParent = config.parentPosts?.[reportDateIso];
  if (cachedParent?.checked && cachedParent.parentMessageId) {
    if (process.env.PARENT_TRUST_CACHED_PARENT !== "true") {
      try {
        const parentPost = await searchParentPost(config, accessToken, title);
        markParentPostChecked(config, reportDateIso, parentPost, "state-refresh");
        return {
          ...parentPost,
          source: "state-refresh",
          createdOrFound: true
        };
      } catch (error) {
        if (!String(error.message || "").startsWith("Could not find parent post")) {
          throw error;
        }
      }
    }

    return {
      title: cachedParent.title || title,
      parentMessageId: cachedParent.parentMessageId,
      threadId: cachedParent.threadId || config.teams.threadId,
      clientConversationId: cachedParent.clientConversationId || null,
      rank: null,
      source: "state"
    };
  }

  const globalCachedParent = readGlobalParentPost(parentCacheKey);
  if (globalCachedParent?.parentMessageId) {
    const parentPost = {
      ...globalCachedParent,
      source: "global-state",
      createdOrFound: true
    };
    markParentPostChecked(config, reportDateIso, parentPost, "global-state");
    return parentPost;
  }

  const releaseParentLock = await acquireParentPostLock(parentCacheKey, {
    memberId: config.id,
    reportDateIso,
    threadId: config.teams.threadId,
    title
  });

  try {
    const lockedGlobalCachedParent = readGlobalParentPost(parentCacheKey);
    if (lockedGlobalCachedParent?.parentMessageId) {
      const parentPost = {
        ...lockedGlobalCachedParent,
        source: "global-state",
        createdOrFound: true
      };
      markParentPostChecked(config, reportDateIso, parentPost, "global-state");
      return parentPost;
    }

    const parentPost = await searchOrCreateParentPostUnderLock(config, accessToken, title, reportDateIso, options);
    writeGlobalParentPost(parentCacheKey, parentPost);
    return parentPost;
  } finally {
    releaseParentLock();
  }
}

async function searchOrCreateParentPostUnderLock(config, accessToken, title, reportDateIso, options = {}) {
  try {
    const parentPost = await searchParentPost(config, accessToken, title);
    markParentPostChecked(config, reportDateIso, parentPost, "search");
    return {
      ...parentPost,
      source: "search",
      createdOrFound: true
    };
  } catch (error) {
    if (!String(error.message || "").startsWith("Could not find parent post")) {
      throw error;
    }

    if (options.allowCreate === false) {
      throw error;
    }
  }

  console.log(`[INFO] Parent post not found. Creating parent post: ${title}`);
  const result = await createParentPost(config, accessToken, title, parseDate(reportDateIso));
  let parentMessageId = extractCreatedMessageId(result);

  if (!parentMessageId) {
    parentMessageId = await retryFindCreatedParentMessageId(config, accessToken, title);
  }

  if (!parentMessageId) {
    throw new Error("Created parent post but could not determine its message id.");
  }

  const parentPost = {
    title,
    parentMessageId,
    threadId: config.teams.threadId,
    clientConversationId: `${config.teams.threadId};messageid=${parentMessageId}`,
    rank: null,
    createResult: result
  };
  markParentPostChecked(config, reportDateIso, parentPost, "created");

  return {
    ...parentPost,
    source: "created",
    createdOrFound: true
  };
}

function getParentPostCacheKey(config, title, reportDateIso) {
  return crypto
    .createHash("sha256")
    .update([config.teams.threadId, reportDateIso, title].join("|"))
    .digest("hex");
}

function readGlobalParentPost(cacheKey) {
  const cache = readGlobalParentPostCache();
  return cache[cacheKey] || null;
}

function writeGlobalParentPost(cacheKey, parentPost) {
  const cache = readGlobalParentPostCache();
  cache[cacheKey] = {
    title: parentPost.title,
    parentMessageId: parentPost.parentMessageId,
    threadId: parentPost.threadId,
    clientConversationId: parentPost.clientConversationId || null,
    cachedAt: new Date().toISOString()
  };
  writeJson(PARENT_POST_CACHE_FILE, cache);
}

function readGlobalParentPostCache() {
  if (!fs.existsSync(PARENT_POST_CACHE_FILE)) return {};
  try {
    return readJson(PARENT_POST_CACHE_FILE);
  } catch {
    return {};
  }
}

async function retryFindCreatedParentMessageId(config, accessToken, title) {
  const retryCount = Number(process.env.PARENT_SEARCH_RETRY_COUNT || 3);
  const retryMs = Number(process.env.PARENT_SEARCH_RETRY_MS || 2000);

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    await sleep(retryMs);
    try {
      const parentPost = await searchParentPost(config, accessToken, title);
      return parentPost.parentMessageId;
    } catch (error) {
      if (attempt === retryCount || !String(error.message || "").startsWith("Could not find parent post")) {
        throw error;
      }
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createParentPost(config, accessToken, title, reportDate) {
  const encodedConversation = encodeURIComponent(config.teams.threadId);
  const baseUrl =
    process.env.POST_API_BASE_URL ||
    "https://teams.cloud.microsoft/api/chatsvc/apac/v1/users/ME/conversations";
  const url = `${baseUrl}/${encodedConversation}/messages`;

  return fetchJson(url, {
    method: "POST",
    headers: teamsRequestHeaders(accessToken),
    body: JSON.stringify(buildParentPostPayload(config, title, reportDate))
  });
}

async function postReply(config, accessToken, threadId, parentMessageId, payload) {
  const encodedConversation = encodeURIComponent(`${threadId};messageid=${parentMessageId}`);
  const baseUrl =
    process.env.POST_API_BASE_URL ||
    "https://teams.cloud.microsoft/api/chatsvc/apac/v1/users/ME/conversations";
  const url = `${baseUrl}/${encodedConversation}/messages`;

  return fetchJson(url, {
    method: "POST",
    headers: teamsRequestHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}

async function loadParentPostReplies(config, accessToken, parentPost) {
  try {
    const response = await fetchParentPostReplies(config, accessToken, parentPost.threadId, parentPost.parentMessageId);
    const replies = extractMessageList(response);
    return {
      ...parentPost,
      replies
    };
  } catch (error) {
    console.warn(`[WARN][${config.id}] Could not check existing replies before posting: ${error.message}`);
    return parentPost;
  }
}

async function fetchParentPostReplies(config, accessToken, threadId, parentMessageId) {
  const encodedConversation = encodeURIComponent(`${threadId};messageid=${parentMessageId}`);
  const baseUrl =
    process.env.POST_API_BASE_URL ||
    "https://teams.cloud.microsoft/api/chatsvc/apac/v1/users/ME/conversations";
  const url = new URL(`${baseUrl}/${encodedConversation}/messages`);
  setUrlSearchParam(url, "view", "msnp24Equivalent|supportsMessageProperties");
  setUrlSearchParam(url, "pageSize", process.env.REPLY_CHECK_PAGE_SIZE || 200);

  return fetchJson(url.toString(), {
    method: "GET",
    headers: teamsRequestHeaders(accessToken)
  });
}

function extractMessageList(response) {
  if (Array.isArray(response)) return response;
  return (
    response?.messages ||
    response?.Messages ||
    response?.value ||
    response?.Value ||
    response?.data?.messages ||
    response?.data?.value ||
    []
  );
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText} from ${url}: ${text}`);
    error.status = response.status;
    error.statusText = response.statusText;
    error.url = url;
    error.responseText = text;
    throw error;
  }

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function authHeaders(accessToken) {
  return {
    authorization: `Bearer ${accessToken}`
  };
}

function substrateSearchHeaders(config, accessToken) {
  const requestId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const tokenPayload = decodeJwtPayload(accessToken);
  const oid = tokenPayload?.oid;
  const puid = tokenPayload?.puid;
  const defaultAnchorMailbox = getDefaultAnchorMailbox(config);
  const substrateAuth = getAuthProfile(config, "substrate");
  const tenantId = tokenPayload?.tid || getTenantIdFromAnchorMailbox(substrateAuth?.anchorMailbox || defaultAnchorMailbox);
  const anchorMailbox =
    substrateAuth?.searchAnchorMailbox ||
    (puid && tenantId ? `PUID:${puid}@${tenantId}` : null) ||
    substrateAuth?.anchorMailbox ||
    defaultAnchorMailbox ||
    process.env.MS_X_ANCHOR_MAILBOX ||
    "";
  const routingSessionKey =
    substrateAuth?.routingSessionKey ||
    (oid && tenantId ? `OID:${oid}@${tenantId}` : null) ||
    normalizeOidAnchorMailbox(substrateAuth?.anchorMailbox || defaultAnchorMailbox) ||
    "";

  return {
    ...authHeaders(accessToken),
    "client-request-id": requestId,
    "client-session-id": sessionId,
    clientrequestid: requestId,
    referer: process.env.SEARCH_REFERER || "https://teams.cloud.microsoft/",
    "user-agent": process.env.TEAMS_USER_AGENT || process.env.SEARCH_USER_AGENT || "",
    "x-anchormailbox": anchorMailbox,
    "x-cafelatencyheaderenabled": "1",
    "x-client-flights":
      process.env.SEARCH_CLIENT_FLIGHTS ||
      "DisableTeamsSharedFilesFilter,QueryMicroservice,KeepAliveEnabledFlight,RequestFileMetaDataExtension,nwShortenCaptionsForTeamsCtrlfSearch,FakeConversationUXFlight,EnableFileFiltersViaKQL,EnableCAForTeamsFlight,SearchV2Flight,SubstrateSearchFanoutFlight,lutmsearchmsg,TMSParseRefiningQueries",
    "x-client-localtime": new Date().toISOString(),
    "x-client-ui-language": process.env.SEARCH_CLIENT_UI_LANGUAGE || "userLocale",
    "x-client-version": process.env.SEARCH_CLIENT_VERSION || "T2.1",
    "x-ms-request-id": requestId,
    "x-ms-session-id": sessionId,
    "x-routingparameter-sessionkey": routingSessionKey
  };
}

function decodeJwtPayload(token) {
  const part = String(token || "").split(".")[1];
  if (!part) return null;

  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function getTenantIdFromAnchorMailbox(anchorMailbox) {
  return String(anchorMailbox || "").split("@")[1] || "";
}

function normalizeOidAnchorMailbox(anchorMailbox) {
  if (!anchorMailbox) return "";
  return String(anchorMailbox).replace(/^Oid:/i, "OID:");
}

function csaRequestHeaders(accessToken) {
  return {
    ...authHeaders(accessToken),
    clientinfo:
      process.env.TEAMS_CLIENT_INFO ||
      "os=windows; osVer=NT 10.0; proc=x86; lcid=vi-vn; deviceType=1; country=vn; clientName=skypeteams; clientVer=1415/26061118216; utcOffset=+07:00; timezone=Asia/Bangkok",
    referer: process.env.CSA_REFERER || "https://teams.cloud.microsoft/",
    "user-agent":
      process.env.TEAMS_USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "x-ms-migration": "True",
    "x-ms-request-priority": "0",
    "x-ms-test-user": "False"
  };
}

function teamsRequestHeaders(accessToken) {
  return {
    ...authHeaders(accessToken),
    behavioroverride: "redirectAs404",
    clientinfo:
      process.env.TEAMS_CLIENT_INFO ||
      "os=windows; osVer=NT 10.0; proc=x86; lcid=vi-vn; deviceType=1; country=vn; clientName=skypeteams; clientVer=1415/26061118216; utcOffset=+07:00; timezone=Asia/Bangkok",
    referer:
      process.env.TEAMS_REFERER ||
      "https://teams.cloud.microsoft/v2/worker/precompiled-web-worker-c08a745869bd9e85.js",
    "user-agent":
      process.env.TEAMS_USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "x-ms-migration": "True",
    "x-ms-request-priority": "0",
    "x-ms-test-user": "False"
  };
}

function buildParentPostPayload(config, title, reportDate) {
  const now = new Date().toISOString();
  const from = config.author?.from || process.env.AUTH_FROM_USER_ID || "";
  const fromUserId = config.author?.fromUserId || from;
  const threadId = config.teams.threadId;
  const content = buildParentPostContent(config, title, reportDate);

  return {
    id: "-1",
    type: "Message",
    conversationid: threadId,
    conversationLink: `${config.teams.conversationLinkPrefix || "blah"}/${threadId}`,
    from,
    fromUserId,
    composetime: now,
    originalarrivaltime: now,
    content,
    messagetype: "RichText/Html",
    contenttype: "Text",
    imdisplayname: config.author?.displayName || process.env.AUTH_DISPLAY_NAME || "",
    clientmessageid: createClientMessageId(),
    callId: "",
    state: 0,
    version: "0",
    amsreferences: [],
    properties: {
      importance: "",
      subject: title,
      title: "",
      cards: "[]",
      links: "[]",
      mentions: "[]",
      onbehalfof: null,
      files: "[]",
      policyViolation: null,
      formatVariant: "TEAMS"
    },
    postType: "Standard",
    crossPostChannels: []
  };
}

function extractCreatedMessageId(result) {
  return (
    result?.OriginalArrivalTime ||
    result?.originalArrivalTime ||
    result?.originalarrivaltime ||
    result?.id ||
    String(result?.raw || "").match(/\b\d{10,}\b/)?.[0] ||
    null
  );
}

function buildParentPostContent(config, title, reportDate) {
  const template = config.teams?.parentPostContentTemplate;
  if (template) {
    return renderTemplate(template, reportDate, config, { TITLE: title });
  }

  return `<p>${escapeHtml(title)}</p>`;
}

function buildReplyPayload(config, { content, parentMessageId, threadId }) {
  const now = new Date().toISOString();
  const from = config.author?.from || process.env.AUTH_FROM_USER_ID || "";
  const fromUserId = config.author?.fromUserId || from;

  return {
    id: "-1",
    type: "Message",
    conversationid: threadId,
    conversationLink: `${config.teams.conversationLinkPrefix || "blah"}/${threadId};messageid=${parentMessageId}`,
    from,
    fromUserId,
    composetime: now,
    originalarrivaltime: now,
    content,
    messagetype: "RichText/Html",
    contenttype: "Text",
    imdisplayname: config.author?.displayName || process.env.AUTH_DISPLAY_NAME || "",
    clientmessageid: createClientMessageId(),
    callId: "",
    state: 0,
    version: "0",
    amsreferences: [],
    properties: {
      importance: "",
      subject: "",
      title: "",
      cards: "[]",
      links: "[]",
      mentions: "[]",
      onbehalfof: null,
      files: "[]",
      policyViolation: null,
      formatVariant: "TEAMS"
    },
    replyChainId: parentMessageId,
    crossPostChannels: []
  };
}

function findExistingReportReply(config, parentPost, reportDate) {
  const replies = parentPost?.replies?.messages || parentPost?.replies || [];
  if (!Array.isArray(replies) || !replies.length) return null;

  const authorId = config.author?.from || process.env.AUTH_FROM_USER_ID || "";
  const reportDateText = formatDate(reportDate);

  return replies.find((reply) => {
    const content = String(reply.content || "");
    const from = reply.from || reply.fromUserId || "";
    return (!authorId || from === authorId) && content.includes("BÁO CÁO NGÀY") && content.includes(reportDateText);
  }) || null;
}

function buildReportHtml(config, reportDate) {
  const rows = buildTaskRows(config, reportDate).join("");
  const pendingRows = buildPendingRows(config.pending, "solution", 2).join("");
  const innovationRows = buildPendingRows(config.innovations, "support", 2).join("");
  const reportNumber = getReportNumber(config, reportDate);

  return [
    '<p>&nbsp;</p><figure class="table"><table class="copy-paste-table"><tbody>',
    '<tr><td colspan="3"><span style="font-size:x-large;"><strong>BÁO CÁO NGÀY</strong></span></td><td>&nbsp;</td></tr>',
    `<tr><td colspan="3"><p data-is-tablecell-container="true"><span style="font-size:x-large;"><strong>Ngày báo cáo:&nbsp; ${formatDate(reportDate)}&nbsp; &nbsp; &nbsp;Số báo cáo :${escapeHtml(reportNumber)}</strong></span></p></td><td>&nbsp;</td></tr>`,
    '<tr><td><span style="font-size:inherit;"><strong>I.</strong></span></td><td><span style="font-size:inherit;"><strong>KẾ HOẠCH CÔNG VIỆC/ SẢN PHẨM ĐƯỢC GIAO TRONG THÁNG</strong></span></td><td><span style="font-size:inherit;"><strong>LŨY KẾ SẢN PHẨM HOÀN THÀNH TỪ NGÀY 01 ĐẦU THÁNG ĐẾN NAY/ TỔNG SẢN PHẨM ĐƯỢC GIAO</strong></span></td><td><span style="font-size:inherit;"><strong>TỶ LỆ</strong></span></td></tr>',
    rows,
    '<tr><td><span style="font-size:inherit;"><strong>II.</strong></span></td><td><span style="font-size:inherit;"><strong>PENDING LIST</strong></span></td><td colspan="2"><span style="font-size:inherit;"><strong>HƯỚNG XỬ LÝ</strong></span></td></tr>',
    pendingRows,
    '<tr><td><span style="font-size:inherit;"><strong>III.</strong></span></td><td><span style="font-size:inherit;"><strong>ĐỔI MỚI SÁNG TẠO CÔNG VIỆC</strong></span></td><td colspan="2"><span style="font-size:inherit;"><strong>ĐỀ XUẤT HỖ TRỢ (NẾU CÓ)</strong></span></td></tr>',
    innovationRows,
    "</tbody></table></figure><p>&nbsp;</p>"
  ].join("");
}

function buildTaskRows(config, reportDate) {
  const tasks = config.tasks || [];
  if (!tasks.length) {
    return [
      '<tr><td><span style="font-size:inherit;">1</span></td><td><p data-is-tablecell-container="true">&nbsp;</p></td><td><p>&nbsp;</p></td><td><p data-is-tablecell-container="true">&nbsp;</p></td></tr>'
    ];
  }

  return tasks.map((task, index) => {
    const percent = calculateTaskPercent(config, task, reportDate, index);
    return [
      "<tr>",
      `<td><span style="font-size:inherit;">${index + 1}</span></td>`,
      `<td><p>${escapeHtml(task.title || "") || EMPTY_CELL}</p></td>`,
      "<td><p>&nbsp;</p></td>",
      `<td><p data-is-tablecell-container="true">${percent}%</p></td>`,
      "</tr>"
    ].join("");
  });
}

function getReportNumber(config, reportDate) {
  return getReportNumberInfo(config, reportDate).reportNumber;
}

function getReportNumberInfo(config, reportDate) {
  const reportNumberTemplate =
    config.report?.reportNumberTemplate ??
    config.report?.numberTemplate ??
    DEFAULT_REPORT_NUMBER_TEMPLATE;
  const monthlyReport = getOrCreateMonthlyReport(config, reportDate);
  const reportDateIso = formatIsoDate(reportDate);
  const existingPosted = config.postedReports?.[reportDateIso];
  const existingReportIndex = Number(existingPosted?.reportIndex);
  const reportIndex = Number.isFinite(existingReportIndex)
    ? existingReportIndex
    : getNextReportIndex(config, reportDate, monthlyReport);

  const reportNumber = renderTemplate(reportNumberTemplate || DEFAULT_REPORT_NUMBER_TEMPLATE, reportDate, config, {
    REPORT_INDEX: String(reportIndex),
    REPORT_INDEX_PAD2: pad2(reportIndex),
    REPORTED_WORKDAYS: String(reportIndex),
    REPORTED_WORKDAYS_PAD2: pad2(reportIndex),
    MONTH_WORKDAYS: String(monthlyReport.totalWorkdays),
    MONTH_WORKDAYS_PAD2: pad2(monthlyReport.totalWorkdays),
    TOTAL_WORKDAYS: String(monthlyReport.totalWorkdays),
    TOTAL_WORKDAYS_PAD2: pad2(monthlyReport.totalWorkdays)
  });

  return {
    monthKey: formatMonthKey(reportDate),
    reportIndex,
    reportNumber,
    totalWorkdays: monthlyReport.totalWorkdays,
    baseReportedWorkdays: monthlyReport.baseReportedWorkdays || 0
  };
}

function updateTaskProgressAfterPost(config, reportDate) {
  const reportDateIso = formatIsoDate(reportDate);
  const tasks = config.tasks || [];

  return tasks.map((task, index) => {
    const nextPercent = calculateTaskPercent(config, task, reportDate, index);
    task.startPercent = nextPercent;
    task.progressStartDate = reportDateIso;
    markTaskProgressAppliedForDate(config, task, index, reportDateIso);
    return {
      title: task.title || "",
      startPercent: nextPercent,
      progressStartDate: reportDateIso
    };
  });
}

function buildPendingRows(items = [], secondKey, minRows) {
  const normalized = [...items];
  while (normalized.length < minRows) {
    normalized.push({ item: "", [secondKey]: "" });
  }

  return normalized.map((row, index) => {
    return [
      "<tr>",
      `<td><span style="font-size:inherit;">${index + 1}</span></td>`,
      `<td>${escapeHtml(row.item || "") || EMPTY_CELL}</td>`,
      `<td colspan="2">${escapeHtml(row[secondKey] || "") || EMPTY_CELL}</td>`,
      "</tr>"
    ].join("");
  });
}

function calculateTaskPercent(config, task, reportDate, taskIndex = 0) {
  const startDate = parseDate(task.progressStartDate || formatIsoDate(reportDate));
  const progressDates = getProgressDates(startDate, reportDate, config, task, taskIndex);
  const increase = progressDates.reduce((sum, dateParts) => {
    return sum + getTaskIncreaseForDate(config, task, taskIndex, formatIsoDate(dateParts));
  }, 0);
  const value = Number(task.startPercent || 0) + increase;
  const max = Number.isFinite(Number(task.maxPercent)) ? Number(task.maxPercent) : 100;
  const min = Number.isFinite(Number(task.minPercent)) ? Number(task.minPercent) : 0;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getProgressDates(startDate, endDate, config, task, taskIndex) {
  const start = dateToUtc(startDate);
  const end = dateToUtc(endDate);
  const dates = [];
  if (end < start) return dates;

  const current = new Date(start);
  current.setUTCDate(current.getUTCDate() + 1);

  while (current <= end) {
    const parts = {
      year: current.getUTCFullYear(),
      month: current.getUTCMonth() + 1,
      day: current.getUTCDate()
    };

    if (
      (!config.report?.countProgressByWorkdaysOnly || isAllowedDay(config, parts)) &&
      !isTaskProgressAppliedForDate(config, task, taskIndex, formatIsoDate(parts))
    ) {
      dates.push(parts);
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  const endDateIso = formatIsoDate(endDate);
  if (
    dates.length === 0 &&
    start.getTime() === end.getTime() &&
    !isTaskProgressAppliedForDate(config, task, taskIndex, endDateIso) &&
    (!config.report?.countProgressByWorkdaysOnly || isAllowedDay(config, endDate))
  ) {
    dates.push(endDate);
  }

  return dates;
}

function getTaskIncreaseForDate(config, task, taskIndex, dateIso) {
  const plan = getOrCreateDailyPlan(config, parseDate(dateIso));
  plan.taskIncreases ||= {};

  const key = getTaskPlanKey(task, taskIndex);
  if (Number.isFinite(Number(plan.taskIncreases[key]))) {
    return Number(plan.taskIncreases[key]);
  }

  const range = normalizeIncreaseRange(task);
  const increase = randomIntInclusive(range[0], range[1]);
  plan.taskIncreases[key] = increase;
  return increase;
}

function getTaskPlanKey(task, taskIndex) {
  return task.id || task.key || String(taskIndex);
}

function isTaskProgressAppliedForDate(config, task, taskIndex, dateIso) {
  const key = getTaskPlanKey(task, taskIndex);
  return Boolean(config.dailyPlans?.[dateIso]?.progressAppliedTasks?.[key]);
}

function markTaskProgressAppliedForDate(config, task, taskIndex, dateIso) {
  const plan = getOrCreateDailyPlan(config, parseDate(dateIso));
  const key = getTaskPlanKey(task, taskIndex);
  plan.progressAppliedTasks ||= {};
  plan.progressAppliedTasks[key] = true;
}

function normalizeIncreaseRange(task) {
  if (Array.isArray(task.dailyIncreaseRange) && task.dailyIncreaseRange.length >= 2) {
    const min = Number(task.dailyIncreaseRange[0]);
    const max = Number(task.dailyIncreaseRange[1]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return min <= max ? [min, max] : [max, min];
    }
  }

  const fixed = Number(task.dailyIncrease || 0);
  return [fixed, fixed];
}

function getOrCreateMonthlyReport(config, reportDate) {
  config.monthlyReports ||= {};
  const monthKey = formatMonthKey(reportDate);
  const monthStart = { year: reportDate.year, month: reportDate.month, day: 1 };
  const monthEnd = getMonthEnd(reportDate.year, reportDate.month);
  const totalWorkdays = countWorkdays(monthStart, monthEnd, config);

  config.monthlyReports[monthKey] ||= {};
  const month = config.monthlyReports[monthKey];
  month.year = reportDate.year;
  month.month = reportDate.month;
  month.totalWorkdays = totalWorkdays;

  if (!Number.isFinite(Number(month.baseReportedWorkdays))) {
    const firstTrackedDateIso = getCheckedReportDatesForMonth(config, monthKey).sort()[0];
    month.baseReportedWorkdays = getInitialBaseReportedWorkdays(
      config,
      firstTrackedDateIso ? parseDate(firstTrackedDateIso) : reportDate
    );
  }
  updateMonthlyReportSummary(config, reportDate);

  return month;
}

function getNextReportIndex(config, reportDate, monthlyReport) {
  const monthKey = formatMonthKey(reportDate);
  const reportDateIso = formatIsoDate(reportDate);
  const baseReportedWorkdays = Number.isFinite(Number(monthlyReport.baseReportedWorkdays))
    ? Number(monthlyReport.baseReportedWorkdays)
    : 0;
  const checkedBefore = getCheckedReportDatesForMonth(config, monthKey)
    .filter((dateIso) => dateIso < reportDateIso)
    .sort();
  const explicitPriorIndexes = checkedBefore
    .map((dateIso) => Number(config.postedReports?.[dateIso]?.reportIndex))
    .filter(Number.isFinite);
  const nextExplicitIndex = explicitPriorIndexes.length
    ? Math.max(...explicitPriorIndexes) + 1
    : baseReportedWorkdays + 1;
  const nextSequentialIndex = baseReportedWorkdays + checkedBefore.length + 1;

  return Math.max(nextExplicitIndex, nextSequentialIndex);
}

function updateMonthlyReportSummary(config, reportDate) {
  const monthKey = formatMonthKey(reportDate);
  const month = config.monthlyReports?.[monthKey];
  if (!month) return null;

  const baseReportedWorkdays = Number.isFinite(Number(month.baseReportedWorkdays))
    ? Number(month.baseReportedWorkdays)
    : 0;
  const checkedDates = getCheckedReportDatesForMonth(config, monthKey);
  month.reportedWorkdays =
    baseReportedWorkdays +
    checkedDates.length;
  month.latestReportDate = checkedDates.length ? checkedDates[checkedDates.length - 1] : null;
  month.latestReportNumber = month.latestReportDate
    ? config.postedReports?.[month.latestReportDate]?.reportNumber || null
    : null;
  month.updatedAt ||= new Date().toISOString();

  return month;
}

function getCheckedReportDatesForMonth(config, monthKey) {
  return Object.entries(config.postedReports || {})
    .filter(([dateIso, posted]) => dateIso.startsWith(`${monthKey}-`) && posted?.checked)
    .map(([dateIso]) => dateIso)
    .sort();
}

function getInitialBaseReportedWorkdays(config, reportDate) {
  const monthKey = formatMonthKey(reportDate);
  const configuredByMonth = config.report?.initialReportedWorkdaysByMonth?.[monthKey];
  const configured = configuredByMonth ?? config.report?.initialReportedWorkdays;
  if (Number.isFinite(Number(configured))) {
    return Math.max(0, Math.floor(Number(configured)));
  }

  const monthStart = { year: reportDate.year, month: reportDate.month, day: 1 };
  const previousDate = addDays(reportDate, -1);
  if (!isSameMonth(formatIsoDate(previousDate), reportDate)) {
    return 0;
  }

  return countWorkdays(monthStart, previousDate, config);
}

function countWorkdays(startDate, endDate, config) {
  const start = dateToUtc(startDate);
  const end = dateToUtc(endDate);
  if (end < start) return 0;

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const parts = {
      year: current.getUTCFullYear(),
      month: current.getUTCMonth() + 1,
      day: current.getUTCDate()
    };
    if (isAllowedDay(config, parts)) {
      count += 1;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

function daysBetween(startDate, endDate) {
  const diff = dateToUtc(endDate).getTime() - dateToUtc(startDate).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function assertPostDayAllowed(config, reportDate) {
  if (!isAllowedDay(config, reportDate)) {
    throw new Error(
      `Report date ${formatDate(reportDate)} is outside configured post days (${describeAllowedDays(config)}).`
    );
  }
}

function ensureDailyPlan(config, reportDate) {
  const plan = getOrCreateDailyPlan(config, reportDate);
  const before = JSON.stringify(plan);

  ensureReportPostAfterTime(config, reportDate, plan);

  return JSON.stringify(plan) !== before;
}

function getOrCreateDailyPlan(config, reportDate) {
  const dateIso = formatIsoDate(reportDate);
  config.dailyPlans ||= {};
  config.dailyPlans[dateIso] ||= {};
  return config.dailyPlans[dateIso];
}

function ensureReportPostAfterTime(config, reportDate, plan) {
  if (plan.reportPostAfterTime) return;

  const baseTime = config.schedule?.postAfterTime || "17:30";
  const windowMinutes = Number(
    config.schedule?.postAfterRandomWindowMinutes ??
    process.env.REPORT_POST_RANDOM_WINDOW_MINUTES ??
    0
  );
  const safeWindowMinutes = Number.isFinite(windowMinutes) && windowMinutes > 0 ? Math.floor(windowMinutes) : 0;
  const delayMinutes = safeWindowMinutes ? randomIntInclusive(0, safeWindowMinutes) : 0;

  plan.reportBasePostAfterTime = baseTime;
  plan.reportRandomDelayMinutes = delayMinutes;
  plan.reportPostAfterTime = addMinutesToTime(baseTime, delayMinutes);
  plan.plannedAt = new Date().toISOString();
}

function addMinutesToTime(time, minutes) {
  const total = (parseTimeToMinutes(time) + minutes) % 1440;
  const normalized = total < 0 ? total + 1440 : total;
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
}

function randomIntInclusive(min, max) {
  const low = Math.ceil(Number(min));
  const high = Math.floor(Number(max));
  if (!Number.isFinite(low) || !Number.isFinite(high)) return 0;
  if (high <= low) return low;
  return crypto.randomInt(low, high + 1);
}

function getPipelineStage(config, reportDate, now, timezone) {
  if (!isAllowedDay(config, reportDate)) {
    console.log(`[INFO][${config.id}] Pipeline skipped. Report date ${formatDate(reportDate)} is outside configured post days (${describeAllowedDays(config)}).`);
    return "skip";
  }

  if (!config.schedule?.skipIfBeforePostTime) return "report";

  const parentPostAfterTime = config.schedule?.parentPostAfterTime || process.env.PARENT_POST_AFTER_TIME || "17:25";
  const reportPostAfterTime = getReportPostAfterTime(config, reportDate);
  const currentTime = getTimePartsInTimezone(now, timezone);
  const currentMinutes = currentTime.hour * 60 + currentTime.minute;
  const parentPostAfterMinutes = parseTimeToMinutes(parentPostAfterTime);
  const reportPostAfterMinutes = parseTimeToMinutes(reportPostAfterTime);

  if (currentMinutes < parentPostAfterMinutes) {
    console.log(
      `[INFO][${config.id}] Pipeline skipped. Current time ${formatTime(currentTime)} ${timezone} is before parent post time ${parentPostAfterTime}.`
    );
    return "skip";
  }

  if (currentMinutes < reportPostAfterMinutes) {
    return "parentOnly";
  }

  return "report";
}

function assertPipelineWindowAllowed(config, reportDate, now, timezone) {
  const stage = getPipelineStage(config, reportDate, now, timezone);
  if (stage === "parentOnly") {
    console.log(`[INFO][${config.id}] Pipeline is in parent-only stage before report time ${getReportPostAfterTime(config, reportDate)}.`);
    process.exit(0);
  }
}

function getReportPostAfterTime(config, reportDate) {
  if (reportDate) {
    const dateIso = formatIsoDate(reportDate);
    const plannedTime = config.dailyPlans?.[dateIso]?.reportPostAfterTime;
    if (plannedTime) return plannedTime;
  }

  return config.schedule?.postAfterTime || "17:30";
}

function isReportAlreadyPosted(config, reportDateIso) {
  const posted = config.postedReports?.[reportDateIso];
  if (!posted?.checked) return false;

  console.log(
    `[INFO][${config.id}] Pipeline skipped. Report ${reportDateIso} was already posted at ${posted.postedAt || "unknown time"}.`
  );
  return true;
}

function markReportChecked(config, { reportDateIso, title, parentMessageId, threadId, result }) {
  const reportInfo = getReportNumberInfo(config, parseDate(reportDateIso));

  config.postedReports ||= {};
  config.postedReports[reportDateIso] = {
    checked: true,
    postedAt: new Date().toISOString(),
    monthKey: reportInfo.monthKey,
    reportIndex: reportInfo.reportIndex,
    reportNumber: reportInfo.reportNumber,
    totalWorkdays: reportInfo.totalWorkdays,
    title,
    parentMessageId,
    threadId,
    responseOriginalArrivalTime:
      result?.OriginalArrivalTime || result?.originalArrivalTime || result?.originalarrivaltime || null
  };
  const month = updateMonthlyReportSummary(config, parseDate(reportDateIso));
  if (month) {
    month.updatedAt = new Date().toISOString();
  }
}

function markParentPostChecked(config, reportDateIso, parentPost, source) {
  config.parentPosts ||= {};
  config.parentPosts[reportDateIso] = {
    checked: true,
    source,
    checkedAt: new Date().toISOString(),
    title: parentPost.title,
    parentMessageId: parentPost.parentMessageId,
    threadId: parentPost.threadId || null,
    clientConversationId: parentPost.clientConversationId || null
  };
}

function isAllowedDay(config, dateParts) {
  const dateIso = formatIsoDate(dateParts);
  if (isDateListed(config.schedule?.skipDates, dateIso) || isDateListed(config.report?.skipDates, dateIso)) {
    return false;
  }

  if (isDateListed(config.schedule?.extraWorkDates, dateIso) || isDateListed(config.report?.extraWorkDates, dateIso)) {
    return true;
  }

  if (Array.isArray(config.schedule?.days) && config.schedule.days.length) {
    const allowedDays = new Set(config.schedule.days.map(dayToIndex));
    return allowedDays.has(dateToUtc(dateParts).getUTCDay());
  }

  return false;
}

function isDateListed(dates, dateIso) {
  return Array.isArray(dates) && dates.includes(dateIso);
}

function dayToIndex(day) {
  if (Number.isInteger(day) && day >= 0 && day <= 6) {
    return day;
  }

  const key = String(day).trim().toLowerCase();
  if (/^[0-6]$/.test(key)) {
    return Number(key);
  }

  if (!(key in DAY_INDEX)) {
    throw new Error(`Unsupported day name: ${day}`);
  }
  return DAY_INDEX[key];
}

function describeAllowedDays(config) {
  if (Array.isArray(config.schedule?.days) && config.schedule.days.length) {
    return config.schedule.days.join(", ");
  }

  return "no schedule.days configured";
}

function renderTemplate(template, dateParts, config, extraValues = {}) {
  const monthStart = { year: dateParts.year, month: dateParts.month, day: 1 };
  const workdayIndex = countWorkdays(
    monthStart,
    dateParts,
    config
  );
  const dayIndex = daysBetween(monthStart, dateParts) + 1;
  const values = {
    YYYY: String(dateParts.year),
    YY: String(dateParts.year).slice(-2),
    MM: pad2(dateParts.month),
    M: String(dateParts.month),
    DD: pad2(dateParts.day),
    D: String(dateParts.day),
    DAY_INDEX: String(dayIndex),
    DAY_INDEX_PAD2: pad2(dayIndex),
    WORKDAY_INDEX: String(workdayIndex),
    WORKDAY_INDEX_PAD2: pad2(workdayIndex),
    ...extraValues
  };

  return String(template || "").replace(/\{([A-Z0-9_]+)\}/g, (_, key) => values[key] ?? "");
}

function getDatePartsInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
}

function getTimePartsInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function parseTimeToMinutes(value) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid schedule.postAfterTime "${value}". Use HH:mm.`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error(`Invalid schedule.postAfterTime "${value}". Use HH:mm.`);
  }

  return hour * 60 + minute;
}

function parseDate(input) {
  const match = String(input).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date "${input}". Use YYYY-MM-DD.`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function dateToUtc(dateParts) {
  return new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
}

function addDays(dateParts, days) {
  const date = dateToUtc(dateParts);
  date.setUTCDate(date.getUTCDate() + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function getMonthEnd(year, month) {
  return {
    year,
    month,
    day: new Date(Date.UTC(year, month, 0)).getUTCDate()
  };
}

function formatDate(dateParts) {
  return `${pad2(dateParts.day)}/${pad2(dateParts.month)}/${dateParts.year}`;
}

function formatIsoDate(dateParts) {
  return `${dateParts.year}-${pad2(dateParts.month)}-${pad2(dateParts.day)}`;
}

function formatMonthKey(dateParts) {
  return `${dateParts.year}-${pad2(dateParts.month)}`;
}

function isSameMonth(dateIso, dateParts) {
  return dateIso.startsWith(`${formatMonthKey(dateParts)}-`);
}

function formatTime(timeParts) {
  return `${pad2(timeParts.hour)}:${pad2(timeParts.minute)}:${pad2(timeParts.second)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function extractMessageId(clientConversationId) {
  return String(clientConversationId || "").match(/messageid=([^;]+)/)?.[1] || null;
}

function createClientMessageId() {
  const random = crypto.randomInt(10_000, 99_999);
  return `${Date.now()}${random}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
