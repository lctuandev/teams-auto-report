import { z } from "zod";
import { resourceIdSchema } from "./common";

export const userRoleSchema = z.enum(["member", "admin"]);

export const userSchema = z.object({
  id: resourceIdSchema,
  username: resourceIdSchema,
  passwordHash: z.string().min(20).max(200),
  memberId: resourceIdSchema.nullable(),
  role: userRoleSchema,
  enabled: z.boolean(),
});

export const updateAccountSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  username: resourceIdSchema,
  newPassword: z.string().min(6).max(200).optional(),
  confirmPassword: z.string().max(200).optional(),
}).refine((value) => !value.newPassword || value.newPassword === value.confirmPassword, {
  message: "Password confirmation does not match",
  path: ["confirmPassword"],
});

export type User = z.infer<typeof userSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
