const fs = require("node:fs");
const path = require("node:path");
const { backupRoot, createBackup, dataDirectories, root } = require("./data-snapshot");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...value] = arg.replace(/^--/, "").split("="); return [key, value.length ? value.join("=") : true]; }));
const name = String(args.from || "");
if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Usage: npm run restore:data -- --from=<backup-name> [--apply]");
const sourceRoot = path.join(backupRoot, name);
const manifestPath = path.join(sourceRoot, "manifest.json");
if (!fs.existsSync(manifestPath)) throw new Error(`Backup manifest not found: ${name}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.included)) throw new Error("Unsupported backup manifest");
const included = manifest.included.filter((item) => dataDirectories.includes(item) && fs.existsSync(path.join(sourceRoot, item)));
console.log(`[${args.apply ? "APPLY" : "DRY-RUN"}] restore ${name}`);
console.log(`Directories: ${included.join(", ")}`);
if (!args.apply) { console.log("No files changed. Re-run with --apply to restore."); process.exit(0); }
const safety = createBackup("pre-restore");
for (const directory of included) {
  const target = path.join(root, directory);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(sourceRoot, directory), target, { recursive: true, preserveTimestamps: true });
}
console.log(`Restore complete. Pre-restore backup: ${safety.name}`);
