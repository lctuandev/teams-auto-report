import { getSession } from "@/lib/auth/session";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { canEditMember } from "@/lib/permissions/policy";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { MemberRepository, VersionConflictError } from "@/lib/repositories/member-repository";
import { ResourceLockedError } from "@/lib/repositories/resource-lock";
import { resourceIdSchema } from "@/lib/schemas/common";
import { updateTasksSchema } from "@/lib/schemas/member";

export async function PATCH(request: Request, context: RouteContext<"/api/members/[memberId]/tasks">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });

  const params = await context.params;
  const idResult = resourceIdSchema.safeParse(params.memberId);
  if (!idResult.success) return Response.json({ error: "Invalid member ID" }, { status: 400 });
  if (!canEditMember(session, idResult.data)) return Response.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = updateTasksSchema.safeParse(body);
  if (!input.success) return Response.json({ error: "Invalid task data", issues: input.error.issues }, { status: 400 });

  try {
    const member = await new MemberRepository().updateTasks(
      idResult.data,
      input.data.expectedVersion,
      input.data.tasks,
      input.data.excludeCompletedTasks,
    );
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    await new AuditRepository().append({
      actorUserId: session.userId,
      action: "member.tasks.update",
      targetType: "member",
      targetId: idResult.data,
      requestId,
      fields: ["tasks", "report.excludeCompletedTasks"],
    });
    return Response.json({ member }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return Response.json({ error: "Version conflict", currentVersion: error.currentVersion }, { status: 409 });
    }
    if (error instanceof ResourceLockedError) return Response.json({ error: "Resource is busy" }, { status: 423 });
    return Response.json({ error: "Unable to update tasks" }, { status: 500 });
  }
}
