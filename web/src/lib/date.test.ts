import { expect, it } from "vitest";
import { renderDateTemplate } from "./date";

it("renders the same date and calendar tokens used by parent search titles", () => {
  expect(renderDateTemplate(
    "Report {DD}/{MM}/{YYYY} - {DAY_INDEX_PAD2} - WD{WORKDAY_INDEX}",
    "2026-08-10",
    { days: [1, 2, 3, 4, 5], skipDates: [], extraWorkDates: [] },
  )).toBe("Report 10/08/2026 - 10 - WD6");
});

it("removes unsupported template tokens like the bot renderer", () => {
  expect(renderDateTemplate("Report {DD} {UNKNOWN}", "2026-08-10")).toBe("Report 10 ");
});
