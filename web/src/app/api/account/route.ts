import { deleteSession, getSession } from "@/lib/auth/session";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { DuplicateUsernameError, InvalidCurrentPasswordError, UserRepository } from "@/lib/repositories/user-repository";
import { ResourceLockedError } from "@/lib/repositories/resource-lock";
import { updateAccountSchema } from "@/lib/schemas/user";

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const input = updateAccountSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid account data", issues: input.error.issues }, { status: 400 });

  try {
    const changedFields = [
      ...(input.data.username !== session.username ? ["username"] : []),
      ...(input.data.newPassword ? ["password"] : []),
    ];
    if (!changedFields.length) return Response.json({ error: "No account changes" }, { status: 400 });
    const account = await new UserRepository().updateOwnAccount(session.userId, input.data);
    await new AuditRepository().append({ actorUserId: session.userId, action: "account.update", targetType: "user", targetId: session.userId, requestId: crypto.randomUUID(), fields: changedFields });
    await deleteSession();
    return Response.json({ account, signedOut: true });
  } catch (error) {
    if (error instanceof InvalidCurrentPasswordError) return Response.json({ error: "Invalid current password" }, { status: 403 });
    if (error instanceof DuplicateUsernameError) return Response.json({ error: "Username already exists" }, { status: 409 });
    if (error instanceof ResourceLockedError) return Response.json({ error: "Account is busy" }, { status: 423 });
    return Response.json({ error: "Unable to update account" }, { status: 500 });
  }
}
