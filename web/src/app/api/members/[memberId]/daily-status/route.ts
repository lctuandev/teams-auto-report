import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { currentIsoDate, isGroupReportDate } from "@/lib/date";
import { canEditMember } from "@/lib/permissions/policy";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { MemberRepository, VersionConflictError } from "@/lib/repositories/member-repository";
import { resourceIdSchema } from "@/lib/schemas/common";

const inputSchema = z.object({ expectedVersion: z.number().int().positive(), status: z.enum(["report", "skip"]) });
export async function PATCH(request: Request, context: RouteContext<"/api/members/[memberId]/daily-status">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const { memberId } = await context.params;
  if (!resourceIdSchema.safeParse(memberId).success) return Response.json({ error: "Invalid member ID" }, { status: 400 });
  if (!canEditMember(session, memberId)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid daily status" }, { status: 400 });
  try {
    const repository = new MemberRepository();
    const member = await repository.getSafe(memberId);
    const group = member.groupId ? await new GroupRepository().get(member.groupId) : null;
    const timeZone = group?.parentPost.timezone ?? "Asia/Bangkok";
    const date = currentIsoDate(timeZone);
    if (input.data.status === "report") {
      if (!group || isGroupReportDate(date, group.parentPost)) {
        const result = await repository.confirmDailyReport(memberId, input.data.expectedVersion, date);
        await new AuditRepository().append({ actorUserId: session.userId, action: "member.daily-report.confirm", targetType: "member", targetId: memberId, requestId: crypto.randomUUID(), fields: ["state.dailyPlans.checkInStatus"] });
        return Response.json(result);
      }
      const result = await repository.approveSpecialDailyReport(memberId, input.data.expectedVersion, date);
      await new AuditRepository().append({ actorUserId: session.userId, action: "member.daily-report.extra-work", targetType: "member", targetId: memberId, requestId: crypto.randomUUID(), fields: ["report.extraWorkDates"] });
      return Response.json(result);
    }
    const result = await repository.skipDailyReport(memberId, input.data.expectedVersion, date);
    await new AuditRepository().append({ actorUserId: session.userId, action: "member.daily-report.skip", targetType: "member", targetId: memberId, requestId: crypto.randomUUID(), fields: ["report.skipDates"] });
    return Response.json(result);
  } catch (error) {
    if (error instanceof VersionConflictError) return Response.json({ error: "Version conflict", currentVersion: error.currentVersion }, { status: 409 });
    return Response.json({ error: "Unable to update daily status" }, { status: 500 });
  }
}
