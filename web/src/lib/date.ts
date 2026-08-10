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

export function renderDateTemplate(
  template: string,
  date: string,
  schedule?: { days: number[]; skipDates: string[]; extraWorkDates: string[] },
) {
  const [year, month, day] = date.split("-");
  const dayIndex = Number(day);
  let workdayIndex = dayIndex;
  if (schedule) {
    workdayIndex = 0;
    for (let currentDay = 1; currentDay <= dayIndex; currentDay += 1) {
      const currentDate = `${year}-${month}-${String(currentDay).padStart(2, "0")}`;
      if (isGroupReportDate(currentDate, schedule)) workdayIndex += 1;
    }
  }
  const values: Record<string, string> = {
    YYYY: year,
    YY: year.slice(-2),
    MM: month,
    M: String(Number(month)),
    DD: day,
    D: String(Number(day)),
    DAY_INDEX: String(dayIndex),
    DAY_INDEX_PAD2: String(dayIndex).padStart(2, "0"),
    WORKDAY_INDEX: String(workdayIndex),
    WORKDAY_INDEX_PAD2: String(workdayIndex).padStart(2, "0"),
  };
  return template.replace(/\{([A-Z0-9_]+)\}/g, (_, token: string) => values[token] ?? "");
}
