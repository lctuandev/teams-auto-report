import { getSession } from "@/lib/auth/session";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { currentIsoDate, isGroupReportDate } from "@/lib/date";
import { canEditGroup } from "@/lib/permissions/policy";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { CatchUpRepository } from "@/lib/repositories/catch-up-repository";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { ResourceLockedError } from "@/lib/repositories/resource-lock";
import { enqueueCatchUpSchema } from "@/lib/schemas/catch-up";
import { resourceIdSchema } from "@/lib/schemas/common";

async function loadEditableGroup(context: RouteContext<"/api/groups/[groupId]/catch-up">) {
  const session = await getSession();
  if (!session) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const { groupId } = await context.params;
  if (!resourceIdSchema.safeParse(groupId).success) return { error: Response.json({ error: "Invalid group ID" }, { status: 400 }) };
  let group;
  try { group = await new GroupRepository().get(groupId); } catch { return { error: Response.json({ error: "Group not found" }, { status: 404 }) }; }
  if (!canEditGroup(session, group)) return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { session, group };
}

export async function GET(_request: Request, context: RouteContext<"/api/groups/[groupId]/catch-up">) {
  const loaded = await loadEditableGroup(context);
  if (loaded.error) return loaded.error;
  return Response.json({ items: await new CatchUpRepository().list(loaded.group.id) });
}

export async function POST(request: Request, context: RouteContext<"/api/groups/[groupId]/catch-up">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const loaded = await loadEditableGroup(context);
  if (loaded.error) return loaded.error;
  const { group } = loaded;
  const input = enqueueCatchUpSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid catch-up date" }, { status: 400 });

  const { date } = input.data;
  if (date >= currentIsoDate(group.parentPost.timezone) || !isGroupReportDate(date, group.parentPost)) {
    return Response.json({ error: `Date ${date} is not a past report day of this group` }, { status: 400 });
  }

  try {
    const repository = new CatchUpRepository();
    const { created } = await repository.enqueue(group.id, date, session.username);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    if (created) {
      await new AuditRepository().append({
        actorUserId: session.userId,
        action: "group.catch-up.enqueue",
        targetType: "group",
        targetId: group.id,
        requestId,
        fields: [`catchUpQueue.${date}`],
      });
    }
    return Response.json({ items: await repository.list(group.id), created }, { status: created ? 201 : 200, headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof ResourceLockedError) return Response.json({ error: "Resource is busy" }, { status: 423 });
    return Response.json({ error: "Unable to queue catch-up report" }, { status: 500 });
  }
}
