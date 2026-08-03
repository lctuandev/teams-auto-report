const fs = require("node:fs");
const path = require("node:path");
const { createBackup, root } = require("./data-snapshot");

const DEFAULT_NUMBER_TEMPLATE = "T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}";

function normalizeUserConfig(config) {
  const normalized = structuredClone(config);
  const changes = [];

  if (!Number.isInteger(normalized.version) || normalized.version < 1) {
    normalized.version = 1;
    changes.push("version");
  }

  normalized.report = normalized.report && typeof normalized.report === "object" ? normalized.report : {};
  if (typeof normalized.report.numberTemplate !== "string" || !normalized.report.numberTemplate.trim()) {
    normalized.report.numberTemplate =
      typeof normalized.report.reportNumberTemplate === "string" && normalized.report.reportNumberTemplate.trim()
        ? normalized.report.reportNumberTemplate
        : DEFAULT_NUMBER_TEMPLATE;
    changes.push("report.numberTemplate");
  }
  if (Object.hasOwn(normalized.report, "reportNumberTemplate")) {
    delete normalized.report.reportNumberTemplate;
    changes.push("report.reportNumberTemplate");
  }
  if (Object.hasOwn(normalized.report, "dailyStatuses")) {
    delete normalized.report.dailyStatuses;
    changes.push("report.dailyStatuses");
  }
  for (const field of ["skipDates", "extraWorkDates"]) {
    if (!Array.isArray(normalized.report[field])) {
      normalized.report[field] = [];
      changes.push(`report.${field}`);
    }
  }

  return { config: normalized, changes };
}

function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  fs.renameSync(temporaryPath, filePath);
}

function collectMigrations(dataRoot = root) {
  const usersRoot = path.join(dataRoot, "users");
  if (!fs.existsSync(usersRoot)) return [];
  return fs.readdirSync(usersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const filePath = path.join(usersRoot, entry.name, "config.json");
      if (!fs.existsSync(filePath)) return [];
      const current = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const normalized = normalizeUserConfig(current);
      return normalized.changes.length ? [{ id: entry.name, filePath, ...normalized }] : [];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function main() {
  const apply = process.argv.includes("--apply");
  const migrations = collectMigrations();
  console.log(`[${apply ? "APPLY" : "DRY-RUN"}] user configs to normalize: ${migrations.length}`);
  for (const migration of migrations) {
    console.log(`- ${migration.id}: ${migration.changes.join(", ")}`);
  }
  if (!apply) {
    console.log(migrations.length ? "No files changed. Re-run with --apply to create a backup and normalize." : "No files changed.");
    return;
  }
  if (!migrations.length) {
    console.log("All user configs are already normalized.");
    return;
  }

  const backup = createBackup("pre-user-config-normalization");
  for (const migration of migrations) atomicWriteJson(migration.filePath, migration.config);
  console.log(`Normalization completed. Restorable backup: ${backup.name}`);
}

if (require.main === module) main();

module.exports = { DEFAULT_NUMBER_TEMPLATE, collectMigrations, normalizeUserConfig };
