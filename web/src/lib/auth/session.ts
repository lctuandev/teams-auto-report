import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { resourceIdSchema } from "@/lib/schemas/common";
import { userRoleSchema } from "@/lib/schemas/user";
import { UserRepository } from "@/lib/repositories/user-repository";
import { shouldUseSecureCookie } from "@/lib/auth/cookie-security";

export const SESSION_COOKIE = "teams_report_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

const sessionSchema = z.object({
  userId: resourceIdSchema,
  username: resourceIdSchema,
  memberId: resourceIdSchema.nullable(),
  role: userRoleSchema,
});

export type Session = z.infer<typeof sessionSchema>;

function getSessionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSessionKey());
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie({
      override: process.env.AUTH_COOKIE_SECURE,
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      origin: requestHeaders.get("origin"),
      nodeEnv: process.env.NODE_ENV,
    }),
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
    priority: "high",
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionKey(), { algorithms: ["HS256"] });
    const signedSession = sessionSchema.parse(payload);
    const account = await new UserRepository().getById(signedSession.userId);
    if (!account?.enabled) return null;
    return {
      userId: account.id,
      username: account.username,
      memberId: account.memberId,
      role: account.role,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
