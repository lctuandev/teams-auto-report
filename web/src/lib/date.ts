export function currentIsoDate(timeZone = "Asia/Bangkok", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isGroupReportDate(date: string, schedule: { days: number[]; skipDates: string[]; extraWorkDates: string[] }) {
  if (schedule.skipDates.includes(date)) return false;
  if (schedule.extraWorkDates.includes(date)) return true;
  return schedule.days.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
}
