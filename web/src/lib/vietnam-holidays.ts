export type VietnamHolidayCalendar = {
  year: number;
  label: string;
  sourceUrl: string;
  skipDates: string[];
  extraWorkDates: string[];
  holidays: Array<{ name: string; dates: string[] }>;
};

const calendars: Record<number, VietnamHolidayCalendar> = {
  2026: {
    year: 2026,
    label: "Lịch nghỉ hành chính Việt Nam 2026",
    sourceUrl: "https://baochinhphu.vn/bo-noi-vu-thong-bao-lich-nghi-tet-am-lich-va-nghi-le-quoc-khanh-nam-2026-102251017095507785.htm",
    skipDates: [
      "2026-01-01",
      "2026-01-02",
      "2026-02-16",
      "2026-02-17",
      "2026-02-18",
      "2026-02-19",
      "2026-02-20",
      "2026-04-27",
      "2026-04-30",
      "2026-05-01",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ],
    extraWorkDates: ["2026-01-10", "2026-08-22"],
    holidays: [
      { name: "Tết Dương lịch", dates: ["2026-01-01", "2026-01-02"] },
      { name: "Tết Âm lịch", dates: ["2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20"] },
      { name: "Nghỉ bù Giỗ Tổ Hùng Vương", dates: ["2026-04-27"] },
      { name: "Ngày Chiến thắng và Quốc tế Lao động", dates: ["2026-04-30", "2026-05-01"] },
      { name: "Quốc khánh", dates: ["2026-08-31", "2026-09-01", "2026-09-02"] },
    ],
  },
};

export function getVietnamHolidayCalendar(year: number) {
  return calendars[year] ?? null;
}

export function availableVietnamHolidayYears() {
  return Object.keys(calendars).map(Number).sort((a, b) => a - b);
}

export function mergeVietnamHolidayCalendar(
  current: { skipDates: string[]; extraWorkDates: string[] },
  calendar: VietnamHolidayCalendar,
) {
  const extraWorkDates = [...new Set([...current.extraWorkDates, ...calendar.extraWorkDates])].sort();
  const workDates = new Set(extraWorkDates);
  const skipDates = [...new Set([...current.skipDates, ...calendar.skipDates])]
    .filter((date) => !workDates.has(date))
    .sort();
  return { skipDates, extraWorkDates };
}
