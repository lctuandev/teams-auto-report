import { getSession } from "@/lib/auth/session";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { canEditMember } from "@/lib/permissions/policy";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { MemberRepository, VersionConflictError } from "@/lib/repositories/member-repository";
import { resourceIdSchema } from "@/lib/schemas/common";
import { z } from "zod";

const inputSchema = z.object({ groupId: resourceIdSchema, expectedVersion: z.number().int().positive() });
export async function PATCH(request: Request, context: RouteContext<"/api/members/[memberId]/group">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const { memberId } = await context.params;
  if (!resourceIdSchema.safeParse(memberId).success) return Response.json({ error: "Invalid member ID" }, { status: 400 });
  if (!canEditMember(session, memberId)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid group selection" }, { status: 400 });
  try {
    const group = await new GroupRepository().get(input.data.groupId);
    if (!group.enabled) return Response.json({ error: "Group is disabled" }, { status: 409 });
    const member = await new MemberRepository().updateGroup(memberId, input.data.expectedVersion, group.id);
    await new AuditRepository().append({ actorUserId: session.userId, action: "member.group.update", targetType: "member", targetId: memberId, requestId: crypto.randomUUID(), fields: ["groupId"] });
    return Response.json({ member });
  } catch (error) {
    if (error instanceof VersionConflictError) return Response.json({ error: "Version conflict", currentVersion: error.currentVersion }, { status: 409 });
    return Response.json({ error: "Unable to select group" }, { status: 500 });
  }
}
