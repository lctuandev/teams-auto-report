import { getSession } from "@/lib/auth/session";
import { isLocalAdminRuntime } from "@/lib/auth/local-request";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { OnboardingConflictError, OnboardingRepository } from "@/lib/repositories/onboarding-repository";
import { ResourceLockedError } from "@/lib/repositories/resource-lock";
import { createOnboardingAccountSchema } from "@/lib/schemas/onboarding";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!isLocalAdminRuntime(request)) return Response.json({ error: "Onboarding is local-only" }, { status: 403 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const input = createOnboardingAccountSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid onboarding data", issues: input.error.issues }, { status: 400 });

  try {
    const group = await new GroupRepository().get(input.data.groupId);
    if (!group.enabled) return Response.json({ error: "Group is disabled" }, { status: 409 });
    const created = await new OnboardingRepository().create(input.data);
    await new AuditRepository().append({ actorUserId: session.userId, action: "account.onboarding.create", targetType: "user", targetId: created.memberId, requestId: crypto.randomUUID(), fields: ["account", "member", "credentials", "state", "groupId"] });
    return Response.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof OnboardingConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof ResourceLockedError) return Response.json({ error: "Onboarding is busy" }, { status: 423 });
    return Response.json({ error: "Unable to create onboarding account" }, { status: 500 });
  }
}
