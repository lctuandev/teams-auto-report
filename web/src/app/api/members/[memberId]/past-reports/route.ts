import { getSession } from "@/lib/auth/session";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { currentIsoDate, isGroupReportDate, renderDateTemplate } from "@/lib/date";
import { canEditMember } from "@/lib/permissions/policy";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { MemberRepository } from "@/lib/repositories/member-repository";
import { ReportAlreadyPostedError, ReportQueueRepository } from "@/lib/repositories/report-queue-repository";
import { ResourceLockedError } from "@/lib/repositories/resource-lock";
import { resourceIdSchema } from "@/lib/schemas/common";
import { enqueuePastReportsSchema } from "@/lib/schemas/report-queue";

export async function GET(_request: Request, context: RouteContext<"/api/members/[memberId]/past-reports">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { memberId } = await context.params;
  if (!resourceIdSchema.safeParse(memberId).success) return Response.json({ error: "Invalid member ID" }, { status: 400 });
  if (!canEditMember(session, memberId)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ items: await new ReportQueueRepository().list(memberId) });
}

export async function POST(request: Request, context: RouteContext<"/api/members/[memberId]/past-reports">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });

  const { memberId } = await context.params;
  if (!resourceIdSchema.safeParse(memberId).success) return Response.json({ error: "Invalid member ID" }, { status: 400 });
  if (!canEditMember(session, memberId)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const input = enqueuePastReportsSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid report dates" }, { status: 400 });

  try {
    const member = await new MemberRepository().getSafe(memberId);
    if (!member.groupId) return Response.json({ error: "Member has no group" }, { status: 400 });
    const group = await new GroupRepository().get(member.groupId);
    if (!group) return Response.json({ error: "Group was not found" }, { status: 400 });
    const reportData = await new MemberRepository().getPastReportData(memberId);
    const today = currentIsoDate(group.parentPost.timezone);
    const dates = [...new Set(input.data.dates)].sort();
    const memberSkipDates = new Set(reportData.skipDates);
    const memberExtraDates = new Set(reportData.extraWorkDates);
    const effectiveSchedule = {
      days: group.parentPost.days,
      skipDates: [...new Set([
        ...reportData.skipDates,
        ...group.parentPost.skipDates.filter((date) => !memberExtraDates.has(date)),
      ])],
      extraWorkDates: [...new Set([
        ...group.parentPost.extraWorkDates,
        ...reportData.extraWorkDates,
      ])].filter((date) => !memberSkipDates.has(date)),
    };

    for (const date of dates) {
      const allowed = reportData.skipDates.includes(date)
        ? false
        : reportData.extraWorkDates.includes(date) || isGroupReportDate(date, group.parentPost);
      if (date >= today || !allowed) {
        return Response.json({ error: `Date ${date} is not an eligible past report date` }, { status: 400 });
      }
    }

    const items = await new ReportQueueRepository().enqueue(
      memberId,
      dates.map((date) => ({
        date,
        title: renderDateTemplate(group.parentPost.searchTitleTemplate, date, effectiveSchedule),
      })),
      input.data.tasks,
    );
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    await new AuditRepository().append({
      actorUserId: session.userId,
      action: "member.past-reports.enqueue",
      targetType: "member",
      targetId: memberId,
      requestId,
      fields: [...dates.map((date) => `reportQueue.${date}`), "reportQueue.tasks"],
    });
    return Response.json({ items }, { status: 201, headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof ReportAlreadyPostedError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof ResourceLockedError) return Response.json({ error: "Resource is busy" }, { status: 423 });
    return Response.json({ error: "Unable to queue past reports" }, { status: 500 });
  }
}
