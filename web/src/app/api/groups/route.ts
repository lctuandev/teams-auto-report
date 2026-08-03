import { getSession } from "@/lib/auth/session";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { MemberRepository } from "@/lib/repositories/member-repository";
import { ResourceLockedError } from "@/lib/repositories/resource-lock";
import { createGroupSchema } from "@/lib/schemas/group";

export async function GET() {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [groups, members] = await Promise.all([new GroupRepository().list(), new MemberRepository().listSafe()]);
  return Response.json({ groups: groups.map((group) => ({ ...group, memberCount: members.filter((member) => member.groupId === group.id).length })) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const input = createGroupSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid group data", issues: input.error.issues }, { status: 400 });
  try {
    const group = await new GroupRepository().create(input.data, session.userId);
    await new AuditRepository().append({ actorUserId: session.userId, action: "group.create", targetType: "group", targetId: group.id, requestId: crypto.randomUUID(), fields: ["name", "teams", "parentPost"] });
    return Response.json({ group }, { status: 201 });
  } catch (error) {
    if ((error as Error).message === "GROUP_EXISTS") return Response.json({ error: "Group already exists" }, { status: 409 });
    if (error instanceof ResourceLockedError) return Response.json({ error: "Resource is busy" }, { status: 423 });
    return Response.json({ error: "Unable to create group" }, { status: 500 });
  }
}
