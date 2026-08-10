import { z } from "zod";
import { isoDateSchema, resourceIdSchema } from "./common";
import { taskInputSchema } from "./member";

export const queuedReportTaskSchema = taskInputSchema.safeExtend({
  id: resourceIdSchema,
  progressStartDate: isoDateSchema.optional(),
});

export const reportQueueItemSchema = z.object({
  id: resourceIdSchema,
  batchId: resourceIdSchema.optional(),
  memberId: resourceIdSchema,
  date: isoDateSchema,
  title: z.string().trim().min(1).max(1000),
  status: z.enum(["queued", "processing", "completed", "failed"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  error: z.string().max(2000).optional(),
  tasks: z.array(queuedReportTaskSchema).max(100).default([]),
});

export const reportQueueSchema = z.object({
  version: z.literal(1).default(1),
  items: z.array(reportQueueItemSchema).max(1000).default([]),
});

export const enqueuePastReportsSchema = z.object({
  dates: z.array(isoDateSchema).min(1).max(31),
  tasks: z.array(taskInputSchema).min(1).max(100),
});

export type ReportQueueItem = z.infer<typeof reportQueueItemSchema>;
