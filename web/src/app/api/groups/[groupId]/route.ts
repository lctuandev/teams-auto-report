import { getSession } from "@/lib/auth/session";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { canEditGroup } from "@/lib/permissions/policy";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { MemberRepository, VersionConflictError } from "@/lib/repositories/member-repository";
import { ResourceLockedError } from "@/lib/repositories/resource-lock";
import { resourceIdSchema } from "@/lib/schemas/common";
import { updateGroupSchema } from "@/lib/schemas/group";

async function contextData(context: RouteContext<"/api/groups/[groupId]">) {
  const { groupId } = await context.params;
  return resourceIdSchema.safeParse(groupId);
}

export async function GET(_request: Request, context: RouteContext<"/api/groups/[groupId]">) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = await contextData(context);
  if (!id.success) return Response.json({ error: "Invalid group ID" }, { status: 400 });
  try { return Response.json({ group: await new GroupRepository().get(id.data) }); }
  catch { return Response.json({ error: "Group not found" }, { status: 404 }); }
}

export async function PATCH(request: Request, context: RouteContext<"/api/groups/[groupId]">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const id = await contextData(context);
  if (!id.success) return Response.json({ error: "Invalid group ID" }, { status: 400 });
  const repository = new GroupRepository();
  let current;
  try { current = await repository.get(id.data); } catch { return Response.json({ error: "Group not found" }, { status: 404 }); }
  if (!canEditGroup(session, current)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const input = updateGroupSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid group data", issues: input.error.issues }, { status: 400 });
  try {
    const group = await repository.update(id.data, input.data);
    await new AuditRepository().append({ actorUserId: session.userId, action: "group.update", targetType: "group", targetId: id.data, requestId: crypto.randomUUID(), fields: ["name", "teams", "parentPost"] });
    return Response.json({ group });
  } catch (error) { return mutationError(error); }
}

export async function DELETE(request: Request, context: RouteContext<"/api/groups/[groupId]">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const id = await contextData(context);
  if (!id.success) return Response.json({ error: "Invalid group ID" }, { status: 400 });
  const repository = new GroupRepository();
  let group;
  try { group = await repository.get(id.data); } catch { return Response.json({ error: "Group not found" }, { status: 404 }); }
  if (!canEditGroup(session, group)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const members = await new MemberRepository().listSafe();
  if (members.some((member) => member.groupId === id.data)) return Response.json({ error: "Group is still used by members" }, { status: 409 });
  const expectedVersion = Number(new URL(request.url).searchParams.get("expectedVersion"));
  try {
    const disabled = await repository.disable(id.data, expectedVersion);
    await new AuditRepository().append({ actorUserId: session.userId, action: "group.disable", targetType: "group", targetId: id.data, requestId: crypto.randomUUID(), fields: ["enabled"] });
    return Response.json({ group: disabled });
  } catch (error) { return mutationError(error); }
}

function mutationError(error: unknown) {
  if (error instanceof VersionConflictError) return Response.json({ error: "Version conflict", currentVersion: error.currentVersion }, { status: 409 });
  if (error instanceof ResourceLockedError) return Response.json({ error: "Resource is busy" }, { status: 423 });
  return Response.json({ error: "Unable to update group" }, { status: 500 });
}
