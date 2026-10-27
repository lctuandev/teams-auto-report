import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";
import { currentIsoDate, isGroupReportDate } from "@/lib/date";
import { canEditGroup } from "@/lib/permissions/policy";
import { CatchUpRepository } from "@/lib/repositories/catch-up-repository";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { resourceIdSchema } from "@/lib/schemas/common";
import { CatchUpManager } from "./catch-up-manager";

export const dynamic = "force-dynamic";

const RECENT_CALENDAR_DAYS = 60;

export default async function CatchUpPage({ params }: PageProps<"/groups/[groupId]/catch-up">) {
  const session = await requireSession();
  const { groupId } = await params;
  if (!resourceIdSchema.safeParse(groupId).success) notFound();
  let group;
  try { group = await new GroupRepository().get(groupId); } catch { notFound(); }
  if (!canEditGroup(session, group)) redirect("/groups");

  const today = currentIsoDate(group.parentPost.timezone);
  const recentReportDays = previousDates(today, RECENT_CALENDAR_DAYS).filter((date) => isGroupReportDate(date, group.parentPost));
  const repository = new CatchUpRepository();
  const [members, queue, knownParentDates] = await Promise.all([
    repository.listGroupMembers(group.id),
    repository.list(group.id),
    repository.knownParentPostDates(group.id, group.teams.threadId, recentReportDays),
  ]);

  return (
    <AppShell session={session}>
      <main className="px-5 py-8 md:px-10">
        <div className="mx-auto max-w-6xl">
          <Link href="/groups" className="text-sm font-medium text-primary hover:underline">← Danh sách Groups</Link>
          <div className="mb-8 mt-6">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">{group.name}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Báo cáo bù theo ngày</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              Chọn một ngày đã có parent post nhưng member chưa reply. Bot dùng task daily hiện tại, cộng tiến độ như một lần báo cáo hằng ngày, và chỉ reply vào parent post sẵn có — không tạo parent post mới.
            </p>
          </div>
          <CatchUpManager
            groupId={group.id}
            today={today}
            titleTemplate={group.parentPost.searchTitleTemplate}
            schedule={group.parentPost}
            recentReportDays={recentReportDays}
            knownParentDates={knownParentDates}
            members={members}
            initialQueue={queue}
          />
        </div>
      </main>
    </AppShell>
  );
}

function previousDates(today: string, count: number) {
  const cursor = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: count }, () => {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    return cursor.toISOString().slice(0, 10);
  });
}
