const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const apply = process.argv.includes("--apply");
const membersRoot = path.join(root, "members");
const usersRoot = path.join(root, "users");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".backups", `unified-users-${timestamp}`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sameJson(first, second) {
  return JSON.stringify(readJson(first)) === JSON.stringify(readJson(second));
}

if (!fs.existsSync(membersRoot)) {
  console.log("Nothing to migrate: members folder does not exist.");
  process.exit(0);
}

const memberIds = fs.readdirSync(membersRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(membersRoot, entry.name, "config.json")))
  .map((entry) => entry.name)
  .sort();

if (!memberIds.length) throw new Error("No members/*/config.json files were found.");

const accountMoves = [];
if (fs.existsSync(usersRoot)) {
  for (const entry of fs.readdirSync(usersRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const legacyConfig = path.join(usersRoot, entry.name, "config.json");
    if (!fs.existsSync(legacyConfig)) continue;
    const value = readJson(legacyConfig);
    if (typeof value.username === "string" && typeof value.passwordHash === "string") {
      accountMoves.push({ id: entry.name, source: legacyConfig, target: path.join(usersRoot, entry.name, "account.json") });
    }
  }
}

for (const { target, source } of accountMoves) {
  if (fs.existsSync(target) && !sameJson(source, target)) throw new Error(`Account collision: ${target}`);
}
for (const id of memberIds) {
  const sourceConfig = path.join(membersRoot, id, "config.json");
  const targetConfig = path.join(usersRoot, id, "config.json");
  if (fs.existsSync(targetConfig)) {
    const target = readJson(targetConfig);
    if (!(typeof target.username === "string" && typeof target.passwordHash === "string") && !sameJson(sourceConfig, targetConfig)) {
      throw new Error(`Member config collision: ${targetConfig}`);
    }
  }
}

console.log(`[${apply ? "APPLY" : "DRY-RUN"}] members: ${memberIds.join(", ")}`);
console.log(`[${apply ? "APPLY" : "DRY-RUN"}] legacy accounts: ${accountMoves.map(({ id }) => id).join(", ") || "none"}`);
if (!apply) {
  console.log("Run again with --apply to create a backup and migrate.");
  process.exit(0);
}

fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
fs.cpSync(membersRoot, path.join(backupRoot, "members"), { recursive: true, preserveTimestamps: true });
if (fs.existsSync(usersRoot)) fs.cpSync(usersRoot, path.join(backupRoot, "users"), { recursive: true, preserveTimestamps: true });
fs.mkdirSync(usersRoot, { recursive: true });

for (const { source, target } of accountMoves) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.copyFileSync(source, target);
  fs.unlinkSync(source);
}

for (const id of memberIds) {
  const sourceDirectory = path.join(membersRoot, id);
  const targetDirectory = path.join(usersRoot, id);
  fs.mkdirSync(targetDirectory, { recursive: true });
  for (const file of ["config.json", "state.json"]) {
    const source = path.join(sourceDirectory, file);
    if (!fs.existsSync(source)) continue;
    const target = path.join(targetDirectory, file);
    fs.copyFileSync(source, target);
    JSON.parse(fs.readFileSync(target, "utf8"));
  }
}

fs.rmSync(membersRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, "manifest.json"), `${JSON.stringify({
  version: 1,
  migratedAt: new Date().toISOString(),
  memberIds,
  accountIds: accountMoves.map(({ id }) => id),
}, null, 2)}\n`, { mode: 0o600 });
console.log(`Migration completed. Backup: ${backupRoot}`);
