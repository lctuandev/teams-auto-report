import { expect, it } from "vitest";
import { planCatchUp, type CatchUpMember } from "./catch-up";

const schedule = { days: [1, 2, 3, 4, 5], skipDates: ["2026-10-06"], extraWorkDates: [] };
const member: CatchUpMember = {
  id: "member_one",
  displayName: "Member One",
  enabled: true,
  postedDates: ["2026-10-08"],
  skipDates: [],
  extraWorkDates: [],
  reportableTaskCount: 2,
};

it("reports a missed day after the latest posted report", () => {
  expect(planCatchUp(member, "2026-10-09", schedule)).toEqual({ kind: "report" });
});

it("skips members that cannot take a daily catch-up", () => {
  expect(planCatchUp(member, "2026-10-08", schedule)).toEqual({ kind: "posted" });
  expect(planCatchUp(member, "2026-10-07", schedule)).toEqual({ kind: "later-report", laterDate: "2026-10-08" });
  expect(planCatchUp(member, "2026-10-06", schedule)).toEqual({ kind: "not-report-day" });
  expect(planCatchUp({ ...member, enabled: false }, "2026-10-09", schedule)).toEqual({ kind: "disabled" });
  expect(planCatchUp({ ...member, reportableTaskCount: 0 }, "2026-10-09", schedule)).toEqual({ kind: "no-tasks" });
});
