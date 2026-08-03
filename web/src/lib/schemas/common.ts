import { z } from "zod";

export const resourceIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9_-]+$/, "Only lowercase letters, numbers, _ and - are allowed");

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
export const isoDateSchema = z.iso.date();

export const versionSchema = z.number().int().positive().default(1);
