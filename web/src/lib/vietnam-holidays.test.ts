import { describe, expect, it } from "vitest";
import { getVietnamHolidayCalendar, mergeVietnamHolidayCalendar } from "./vietnam-holidays";

describe("Vietnam holiday calendar", () => {
  it("contains the official 2026 leave and swapped work dates", () => {
    const calendar = getVietnamHolidayCalendar(2026);
    expect(calendar?.skipDates).toContain("2026-02-16");
    expect(calendar?.skipDates).toContain("2026-04-27");
    expect(calendar?.skipDates).toContain("2026-09-02");
    expect(calendar?.extraWorkDates).toEqual(["2026-01-10", "2026-08-22"]);
  });

  it("merges without duplicates and lets work dates override leave dates", () => {
    const calendar = getVietnamHolidayCalendar(2026)!;
    const result = mergeVietnamHolidayCalendar({
      skipDates: ["2026-01-10", "2026-12-31"],
      extraWorkDates: [],
    }, calendar);
    expect(result.skipDates).not.toContain("2026-01-10");
    expect(result.skipDates).toContain("2026-12-31");
    expect(new Set(result.skipDates).size).toBe(result.skipDates.length);
  });
});
