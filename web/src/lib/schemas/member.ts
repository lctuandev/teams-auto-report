import { z } from "zod";
import { isoDateSchema, resourceIdSchema, timeSchema, versionSchema } from "./common";

export const taskSchema = z
  .object({
    id: resourceIdSchema.optional(),
    title: z.string().trim().min(1).max(500),
    startPercent: z.number().finite().min(0).max(100),
    dailyIncrease: z.number().finite().min(0).max(100).optional(),
    dailyIncreaseRange: z
      .tuple([z.number().finite().min(0).max(100), z.number().finite().min(0).max(100)])
      .refine(([min, max]) => min <= max, "Minimum increase cannot exceed maximum")
      .optional(),
    maxPercent: z.number().finite().min(0).max(100),
  })
  .passthrough();

export const taskInputSchema = z.object({
  id: resourceIdSchema.optional(),
  title: z.string().trim().min(1).max(500),
  startPercent: z.number().finite().min(0).max(100),
  dailyIncrease: z.number().finite().min(0).max(100).optional(),
  dailyIncreaseRange: z
    .tuple([z.number().finite().min(0).max(100), z.number().finite().min(0).max(100)])
    .refine(([min, max]) => min <= max, "Minimum increase cannot exceed maximum")
    .optional(),
  maxPercent: z.number().finite().min(0).max(100),
}).refine((task) => task.startPercent <= task.maxPercent, {
  message: "Start percent cannot exceed maximum percent",
});

export const updateTasksSchema = z.object({
  expectedVersion: z.number().int().positive(),
  tasks: z.array(taskInputSchema).max(100),
  excludeCompletedTasks: z.boolean().optional(),
});

export const pendingItemSchema = z.object({ item: z.string().trim().max(1000), solution: z.string().trim().max(2000) });
export const innovationItemSchema = z.object({ item: z.string().trim().max(1000), support: z.string().trim().max(2000) });
const reportConfigDataObjectSchema = z.object({
  schedule: z.object({
    postAfterTime: timeSchema,
    postAfterRandomWindowMinutes: z.number().int().min(0).max(240),
    skipIfBeforePostTime: z.boolean(),
  }),
  pending: z.array(pendingItemSchema).max(50),
  innovations: z.array(innovationItemSchema).max(50),
  report: z.object({
    numberTemplate: z.string().trim().min(1).max(500),
    countProgressByWorkdaysOnly: z.boolean(),
    initialReportedWorkdaysByMonth: z.record(
      z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      z.number().int().min(0).max(31),
    ),
    skipDates: z.array(isoDateSchema).max(1000),
    extraWorkDates: z.array(isoDateSchema).max(1000),
  }),
});

function validateReportCalendar(
  data: z.infer<typeof reportConfigDataObjectSchema>,
  context: z.RefinementCtx,
) {
  const extraDates = new Set(data.report.extraWorkDates);
  data.report.skipDates.forEach((date, index) => {
    if (extraDates.has(date)) {
      context.addIssue({
        code: "custom",
        path: ["report", "skipDates", index],
        message: "Một ngày không thể vừa là ngày nghỉ vừa là ngày đi làm",
      });
    }
  });
}

export const reportConfigDataSchema = reportConfigDataObjectSchema.superRefine(validateReportCalendar);
export const updateReportConfigSchema = reportConfigDataObjectSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .superRefine(validateReportCalendar);

export const memberScheduleSchema = z
  .object({
    timezone: z.string().min(1).max(100).optional(),
    days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    skipDates: z.array(isoDateSchema).optional(),
    extraWorkDates: z.array(isoDateSchema).optional(),
    parentPostAfterTime: timeSchema.optional(),
    postAfterTime: timeSchema,
    postAfterRandomWindowMinutes: z.number().int().min(0).max(240).default(0),
    skipIfBeforePostTime: z.boolean().default(true),
  })
  .passthrough();

export const memberConfigSchema = z
  .object({
    id: resourceIdSchema,
    enabled: z.boolean(),
    groupId: resourceIdSchema.optional(),
    version: versionSchema.optional(),
    tasks: z.array(taskSchema).max(100),
    pending: z.array(z.unknown()).default([]),
    innovations: z.array(z.unknown()).default([]),
    schedule: memberScheduleSchema,
    report: z.record(z.string(), z.unknown()).default({}),
    author: z
      .object({ displayName: z.string().trim().min(1).max(200).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const memberStateSchema = z
  .object({
    postedReports: z.record(z.string(), z.unknown()).default({}),
    dailyPlans: z.record(z.string(), z.unknown()).default({}),
    monthlyReports: z.record(z.string(), z.unknown()).default({}),
    parentPosts: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

export type MemberConfig = z.infer<typeof memberConfigSchema>;
export type MemberState = z.infer<typeof memberStateSchema>;
export type SafeMember = ReturnType<typeof toSafeMember>;

export function toSafeMember(config: MemberConfig, state: MemberState) {
  const reports = Object.entries(state.postedReports);
  const lastReport = reports.at(-1);

  return {
    id: config.id,
    displayName: config.author?.displayName ?? config.id,
    enabled: config.enabled,
    groupId: config.groupId ?? null,
    version: config.version ?? 1,
    tasks: config.tasks.map((task) => ({
      id: task.id ?? null,
      title: task.title,
      startPercent: task.startPercent,
      maxPercent: task.maxPercent,
    })),
    schedule: {
      postAfterTime: config.schedule.postAfterTime,
      postAfterRandomWindowMinutes: config.schedule.postAfterRandomWindowMinutes,
    },
    reportCount: reports.length,
    lastReport: lastReport ? { date: lastReport[0] } : null,
  };
}
