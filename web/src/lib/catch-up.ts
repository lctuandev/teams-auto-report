import { isGroupReportDate } from "@/lib/date";

export type CatchUpMember = {
  id: string;
  displayName: string;
  enabled: boolean;
  postedDates: string[];
  skipDates: string[];
  extraWorkDates: string[];
  reportableTaskCount: number;
};

export type GroupSchedule = { days: number[]; skipDates: string[]; extraWorkDates: string[] };

export type CatchUpPlan =
  | { kind: "report" }
  | { kind: "posted" }
  | { kind: "disabled" }
  | { kind: "not-report-day" }
  | { kind: "later-report"; laterDate: string }
  | { kind: "no-tasks" };

// Mirrors getCatchUpSkipReason in auto_report.js so the UI can preview what the
// bot will do with each member before the request is queued.
export function planCatchUp(member: CatchUpMember, date: string, schedule: GroupSchedule): CatchUpPlan {
  if (!member.enabled) return { kind: "disabled" };
  const reportDay = member.skipDates.includes(date)
    ? false
    : member.extraWorkDates.includes(date) || isGroupReportDate(date, schedule);
  if (!reportDay) return { kind: "not-report-day" };
  if (member.postedDates.includes(date)) return { kind: "posted" };
  const laterDate = member.postedDates.filter((postedDate) => postedDate > date).sort()[0];
  if (laterDate) return { kind: "later-report", laterDate };
  if (member.reportableTaskCount === 0) return { kind: "no-tasks" };
  return { kind: "report" };
}
