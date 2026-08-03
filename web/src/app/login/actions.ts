"use server";

import { compare } from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, deleteSession } from "@/lib/auth/session";
import { canAttemptLogin, clearLoginFailures, recordLoginFailure } from "@/lib/auth/rate-limit";
import { UserRepository } from "@/lib/repositories/user-repository";

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});

export async function login(formData: FormData) {
  const headersList = await headers();
  const address = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  const key = `${address}:${parsed.success ? parsed.data.username : "invalid"}`;

  if (!parsed.success || !canAttemptLogin(key)) redirect("/login?error=invalid");

  try {
    const user = await new UserRepository().findEnabledByUsername(parsed.data.username);
    if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
      recordLoginFailure(key);
      redirect("/login?error=invalid");
    }

    clearLoginFailures(key);
    await createSession({
      userId: user.id,
      username: user.username,
      memberId: user.memberId,
      role: user.role,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      redirect("/login?error=setup");
    }
    throw error;
  }
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
