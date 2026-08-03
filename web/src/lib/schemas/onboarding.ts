import { z } from "zod";
import { resourceIdSchema, timeSchema } from "./common";
import { displayNameToMemberId } from "@/lib/member-id";

export const createOnboardingAccountSchema = z.object({
  username: resourceIdSchema,
  password: z.string().min(6).max(200),
  displayName: z.string().trim().min(1).max(200),
  groupId: resourceIdSchema,
  postAfterTime: timeSchema,
  postAfterRandomWindowMinutes: z.number().int().min(0).max(240),
}).refine((value) => resourceIdSchema.safeParse(displayNameToMemberId(value.displayName)).success, {
  message: "Display name cannot produce a valid member ID",
  path: ["displayName"],
});
