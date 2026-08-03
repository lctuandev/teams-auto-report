import { describe, expect, it } from "vitest";
import { memberConfigSchema, memberStateSchema, toSafeMember, updateReportConfigSchema } from "./member";

describe("member redaction", () => {
  it("returns allowlisted data without auth or browser fields", () => {
    const config = memberConfigSchema.parse({
      id: "member_one",
      enabled: true,
      tasks: [{ title: "Task A", startPercent: 20, maxPercent: 100 }],
      pending: [],
      innovations: [],
      schedule: { postAfterTime: "17:30" },
      report: {},
      author: { displayName: "Member One", fromUserId: "sensitive-id" },
      auth: { common: { refreshToken: "must-not-leak" } },
      browser: { profileDir: ".browser-profiles/member_one" },
    });
    const state = memberStateSchema.parse({
      postedReports: {}, dailyPlans: {}, monthlyReports: {}, parentPosts: {},
      browserRenewals: { lastError: "sensitive oauth error" },
    });
    const safe = toSafeMember(config, state);

    expect(safe.displayName).toBe("Member One");
    expect(JSON.stringify(safe)).not.toContain("refreshToken");
    expect(JSON.stringify(safe)).not.toContain("profileDir");
    expect(JSON.stringify(safe)).not.toContain("fromUserId");
    expect(JSON.stringify(safe)).not.toContain("oauth error");
  });
});

describe("report config calendar", () => {
  const base = {
    expectedVersion: 1,
    schedule: { postAfterTime: "17:30", postAfterRandomWindowMinutes: 0, skipIfBeforePostTime: true },
    pending: [],
    innovations: [],
    report: {
      numberTemplate: "T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}",
      countProgressByWorkdaysOnly: true,
      initialReportedWorkdaysByMonth: { "2026-07": 13 },
      skipDates: ["2026-07-27"],
      extraWorkDates: ["2026-07-26"],
    },
  };

  it("accepts monthly base and separate workday overrides", () => {
    expect(updateReportConfigSchema.parse(base).report.initialReportedWorkdaysByMonth["2026-07"]).toBe(13);
  });

  it("rejects a date selected as both leave and work", () => {
    const result = updateReportConfigSchema.safeParse({
      ...base,
      report: { ...base.report, extraWorkDates: ["2026-07-27"] },
    });
    expect(result.success).toBe(false);
  });
});
