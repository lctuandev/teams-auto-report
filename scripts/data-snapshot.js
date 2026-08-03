const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const backupRoot = path.join(root, ".backups");
const dataDirectories = ["users", "groups", "audit", ".state"];

function createBackup(prefix = "manual") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${prefix}-${timestamp}`;
  const target = path.join(backupRoot, name);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  const included = [];
  for (const directory of dataDirectories) {
    const source = path.join(root, directory);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(target, directory), { recursive: true, preserveTimestamps: true });
    included.push(directory);
  }
  fs.writeFileSync(path.join(target, "manifest.json"), `${JSON.stringify({ version: 1, createdAt: new Date().toISOString(), included }, null, 2)}\n`, { mode: 0o600 });
  return { name, target, included };
}

module.exports = { backupRoot, createBackup, dataDirectories, root };
