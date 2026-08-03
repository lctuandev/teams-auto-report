const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeUserConfig } = require("../scripts/normalize-user-configs");

test("normalizes legacy report fields and supplies a stable version", () => {
  const original = {
    id: "member_one",
    report: {
      reportNumberTemplate: "R-{REPORT_INDEX}",
      dailyStatuses: { "2026-07-23": "report" },
    },
  };

  const result = normalizeUserConfig(original);

  assert.equal(result.config.version, 1);
  assert.equal(result.config.report.numberTemplate, "R-{REPORT_INDEX}");
  assert.deepEqual(result.config.report.skipDates, []);
  assert.deepEqual(result.config.report.extraWorkDates, []);
  assert.equal(Object.hasOwn(result.config.report, "reportNumberTemplate"), false);
  assert.equal(Object.hasOwn(result.config.report, "dailyStatuses"), false);
  assert.equal(Object.hasOwn(original.report, "reportNumberTemplate"), true);
});

test("is idempotent for a canonical config", () => {
  const canonical = {
    id: "member_one",
    version: 3,
    report: {
      numberTemplate: "T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}",
      skipDates: [],
      extraWorkDates: [],
    },
  };

  assert.deepEqual(normalizeUserConfig(canonical), { config: canonical, changes: [] });
});
