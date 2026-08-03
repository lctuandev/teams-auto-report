const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.length ? value.join("=") : true];
}));
const apply = Boolean(args.apply);
const groupId = String(args["group-id"] || "advance_uav_navigation");
const createdBy = String(args["created-by"] || "le_cong_tuan");
if (!/^[a-z0-9_-]{1,80}$/.test(groupId) || !/^[a-z0-9_-]{1,80}$/.test(createdBy)) {
  throw new Error("group-id and created-by must match [a-z0-9_-]");
}

const memberRoot = path.join(root, "users");
const members = fs.readdirSync(memberRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(memberRoot, entry.name, "config.json")))
  .map((entry) => ({
    id: entry.name,
    filePath: path.join(memberRoot, entry.name, "config.json"),
    config: JSON.parse(fs.readFileSync(path.join(memberRoot, entry.name, "config.json"), "utf8"))
  }));
if (!members.length) throw new Error("No split member configs found");

function mostCommon(values, predicate = () => true) {
  const counts = new Map();
  for (const value of values.filter((item) => item !== undefined && item !== null && predicate(item))) {
    const key = typeof value === "string" ? value : JSON.stringify(value);
    const current = counts.get(key) || { value, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.value;
}

const threadId = mostCommon(members.map(({ config }) => config.teams?.threadId), (value) => !String(value).includes("<"));
const teamId = mostCommon(members.map(({ config }) => config.teams?.teamId), (value) => !String(value).includes("<"));
const title = mostCommon(members.map(({ config }) => config.teams?.searchTitleTemplate));
if (!threadId || !teamId || !title) throw new Error("Could not resolve a valid common Teams target/title");
for (const member of members) {
  if (member.config.teams?.threadId !== threadId || member.config.teams?.searchTitleTemplate !== title) {
    throw new Error(`Member ${member.id} does not match the common thread/title; split migration into multiple groups`);
  }
}

const now = new Date().toISOString();
const group = {
  id: groupId,
  name: title.split(/\s+-\s+Báo cáo/i)[0] || groupId,
  enabled: true,
  teams: {
    threadId,
    teamId,
    conversationLinkPrefix: mostCommon(members.map(({ config }) => config.teams?.conversationLinkPrefix), (value) => /^https:\/\//.test(value)) || "https://teams.cloud.microsoft/l/message"
  },
  parentPost: {
    searchTitleTemplate: title,
    contentTemplate: mostCommon(members.map(({ config }) => config.teams?.parentPostContentTemplate)) || `<p>${title}</p>`,
    timezone: mostCommon(members.map(({ config }) => config.schedule?.timezone)) || "Asia/Bangkok",
    days: mostCommon(members.map(({ config }) => config.schedule?.days)) || [1, 2, 3, 4, 5],
    skipDates: mostCommon(members.map(({ config }) => config.schedule?.skipDates)) || [],
    extraWorkDates: mostCommon(members.map(({ config }) => config.schedule?.extraWorkDates)) || [],
    postAfterTime: mostCommon(members.map(({ config }) => config.schedule?.parentPostAfterTime)) || "17:28"
  },
  createdBy,
  createdAt: now,
  updatedAt: now,
  version: 1
};

console.log(`[${apply ? "APPLY" : "DRY-RUN"}] group: ${group.id}`);
console.log(`[${apply ? "APPLY" : "DRY-RUN"}] members: ${members.map((member) => member.id).join(", ")}`);
console.log(`[${apply ? "APPLY" : "DRY-RUN"}] parent time: ${group.parentPost.postAfterTime}; timezone: ${group.parentPost.timezone}`);
if (!apply) {
  console.log("No files changed. Re-run with --apply to migrate.");
  process.exit(0);
}

const backupRoot = path.join(root, ".backups", `group-migration-${now.replace(/[:.]/g, "-")}`);
fs.mkdirSync(backupRoot, { recursive: true });

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temporaryPath, filePath);
}

for (const member of members) {
  const backupPath = path.join(backupRoot, "users", member.id, "config.json");
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(member.filePath, backupPath);
  fs.chmodSync(backupPath, 0o600);

  const config = { ...member.config, groupId };
  delete config.teams;
  config.schedule = {
    postAfterTime: member.config.schedule?.postAfterTime || "17:30",
    postAfterRandomWindowMinutes: member.config.schedule?.postAfterRandomWindowMinutes ?? 0,
    skipIfBeforePostTime: member.config.schedule?.skipIfBeforePostTime !== false
  };
  atomicWrite(member.filePath, config);
}
atomicWrite(path.join(root, "groups", groupId, "config.json"), group);
console.log(`Migration complete. Backup: ${backupRoot}`);
