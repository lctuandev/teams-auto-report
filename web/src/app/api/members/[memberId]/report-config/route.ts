import { getSession } from "@/lib/auth/session";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { canEditMember } from "@/lib/permissions/policy";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { MemberRepository, VersionConflictError } from "@/lib/repositories/member-repository";
import { ResourceLockedError } from "@/lib/repositories/resource-lock";
import { resourceIdSchema } from "@/lib/schemas/common";
import { updateReportConfigSchema } from "@/lib/schemas/member";

export async function PATCH(request: Request, context: RouteContext<"/api/members/[memberId]/report-config">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const { memberId } = await context.params;
  const id = resourceIdSchema.safeParse(memberId);
  if (!id.success) return Response.json({ error: "Invalid member ID" }, { status: 400 });
  if (!canEditMember(session, id.data)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const input = updateReportConfigSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid report configuration", issues: input.error.issues }, { status: 400 });
  try {
    const result = await new MemberRepository().updateReportConfig(id.data, input.data.expectedVersion, input.data);
    await new AuditRepository().append({ actorUserId: session.userId, action: "member.report-config.update", targetType: "member", targetId: id.data, requestId: crypto.randomUUID(), fields: ["schedule", "pending", "innovations", "report"] });
    return Response.json(result);
  } catch (error) {
    if (error instanceof VersionConflictError) return Response.json({ error: "Version conflict", currentVersion: error.currentVersion }, { status: 409 });
    if (error instanceof ResourceLockedError) return Response.json({ error: "Resource is busy" }, { status: 423 });
    console.error(`[report-config] Unable to update member ${id.data}:`, error);
    return Response.json({ error: "Unable to update report configuration" }, { status: 500 });
  }
}
