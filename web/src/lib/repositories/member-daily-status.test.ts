import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { MemberRepository } from "./member-repository";

const originalRoot = process.env.JSON_DATA_ROOT;
afterEach(() => {
  if (originalRoot === undefined) delete process.env.JSON_DATA_ROOT;
  else process.env.JSON_DATA_ROOT = originalRoot;
});

async function createMember(root: string) {
  const directory = path.join(root, "users", "member_one");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "config.json"), JSON.stringify({
    id: "member_one",
    enabled: true,
    version: 1,
    tasks: [],
    pending: [],
    innovations: [],
    schedule: { postAfterTime: "17:30", postAfterRandomWindowMinutes: 0, skipIfBeforePostTime: true },
    report: { numberTemplate: "T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}", skipDates: [], extraWorkDates: [] },
  }));
  await writeFile(path.join(directory, "state.json"), JSON.stringify({
    postedReports: {},
    dailyPlans: {},
    monthlyReports: {},
    parentPosts: {},
    browserRenewals: {},
  }));
}

it("persists a regular-day report confirmation across repository reloads", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "daily-status-"));
  process.env.JSON_DATA_ROOT = root;
  await createMember(root);
  const repository = new MemberRepository();

  const result = await repository.confirmDailyReport("member_one", 1, "2026-07-23");
  const reloaded = await new MemberRepository().getDailyStatus("member_one", "2026-07-23");
  const state = JSON.parse(await readFile(path.join(root, "users", "member_one", "state.json"), "utf8"));

  expect(result).toEqual({ date: "2026-07-23", status: "report", version: 2 });
  expect(reloaded).toEqual({ date: "2026-07-23", status: "report", version: 2 });
  expect(state.dailyPlans["2026-07-23"].checkInStatus).toBe("report");
});

it("persists report confirmation together with a special work date", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "daily-status-special-"));
  process.env.JSON_DATA_ROOT = root;
  await createMember(root);
  const repository = new MemberRepository();

  await repository.approveSpecialDailyReport("member_one", 1, "2026-07-25");
  const config = JSON.parse(await readFile(path.join(root, "users", "member_one", "config.json"), "utf8"));
  const status = await repository.getDailyStatus("member_one", "2026-07-25");

  expect(config.report.extraWorkDates).toContain("2026-07-25");
  expect(status.status).toBe("report");
});

it("updates monthly report base and personal calendar overrides", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-config-"));
  process.env.JSON_DATA_ROOT = root;
  await createMember(root);

  const result = await new MemberRepository().updateReportConfig("member_one", 1, {
    schedule: { postAfterTime: "17:30", postAfterRandomWindowMinutes: 10, skipIfBeforePostTime: true },
    pending: [{ item: "", solution: "" }],
    innovations: [{ item: "", support: "" }],
    report: {
      numberTemplate: "T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}",
      countProgressByWorkdaysOnly: true,
      initialReportedWorkdaysByMonth: { "2026-07": 13 },
      skipDates: [],
      extraWorkDates: [],
    },
  });
  const config = JSON.parse(await readFile(path.join(root, "users", "member_one", "config.json"), "utf8"));

  expect(result.version).toBe(2);
  expect(config.report.initialReportedWorkdaysByMonth["2026-07"]).toBe(13);
});
