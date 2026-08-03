const fs = require("node:fs");
const path = require("node:path");
const { createBackup, root } = require("../data-snapshot");

const apply = process.argv.includes("--apply");
const usersRoot = path.join(root, "users");

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temporaryPath, filePath);
}

const migrations = fs.readdirSync(usersRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const configPath = path.join(usersRoot, entry.name, "config.json");
    if (!fs.existsSync(configPath)) return [];
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!Object.hasOwn(config, "auth") && !Object.hasOwn(config, "browser")) return [];
    const credentialsPath = path.join(usersRoot, entry.name, "credentials.json");
    const credentials = { auth: config.auth || {}, browser: config.browser || {} };
    if (fs.existsSync(credentialsPath)) {
      const existing = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
      if (JSON.stringify(existing) !== JSON.stringify(credentials)) {
        throw new Error(`Credentials collision: ${credentialsPath}`);
      }
    }
    const nextConfig = { ...config };
    delete nextConfig.auth;
    delete nextConfig.browser;
    return [{ id: entry.name, configPath, credentialsPath, credentials, nextConfig }];
  });

console.log(`[${apply ? "APPLY" : "DRY-RUN"}] credentials to extract: ${migrations.map(({ id }) => id).join(", ") || "none"}`);
if (!apply || !migrations.length) {
  if (!apply && migrations.length) console.log("Run again with --apply to back up and migrate.");
  process.exit(0);
}

const backup = createBackup("pre-credentials-migration");
for (const migration of migrations) {
  writeJsonAtomic(migration.credentialsPath, migration.credentials);
  writeJsonAtomic(migration.configPath, migration.nextConfig);
}
console.log(`Credentials migration completed. Restorable backup: ${backup.name}`);
