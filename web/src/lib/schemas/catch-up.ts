import { z } from "zod";
import { isoDateSchema, resourceIdSchema } from "./common";

export const catchUpResultSchema = z.object({
  memberId: z.string().max(200),
  status: z.enum(["posted", "skipped", "failed"]),
  message: z.string().max(2000),
});

export const catchUpItemSchema = z.object({
  id: resourceIdSchema,
  groupId: resourceIdSchema,
  date: isoDateSchema,
  status: z.enum(["queued", "processing", "completed", "failed"]),
  requestedBy: z.string().max(200),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  error: z.string().max(2000).optional(),
  results: z.array(catchUpResultSchema).max(500).default([]),
});

export const catchUpQueueSchema = z.object({
  version: z.literal(1).default(1),
  items: z.array(catchUpItemSchema).max(1000).default([]),
});

export const enqueueCatchUpSchema = z.object({
  date: isoDateSchema,
});

export type CatchUpItem = z.infer<typeof catchUpItemSchema>;
