import { z } from "zod";
import { isoDateSchema, resourceIdSchema, timeSchema, versionSchema } from "./common";

export const groupSchema = z.object({
  id: resourceIdSchema,
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
  teams: z.object({
    threadId: z.string().trim().min(10).max(500),
    teamId: z.string().trim().min(10).max(500),
    conversationLinkPrefix: z.string().url().max(500),
  }),
  parentPost: z.object({
    searchTitleTemplate: z.string().trim().min(1).max(1000),
    contentTemplate: z.string().trim().min(1).max(20_000),
    timezone: z.string().trim().min(1).max(100),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    skipDates: z.array(isoDateSchema).max(366),
    extraWorkDates: z.array(isoDateSchema).max(366),
    postAfterTime: timeSchema,
  }),
  createdBy: resourceIdSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  version: versionSchema,
});

export type Group = z.infer<typeof groupSchema>;

export const groupFieldsSchema = groupSchema.pick({ name: true, teams: true, parentPost: true });
export const createGroupSchema = groupFieldsSchema.extend({ id: resourceIdSchema });
export const updateGroupSchema = groupFieldsSchema.extend({ expectedVersion: z.number().int().positive() });
