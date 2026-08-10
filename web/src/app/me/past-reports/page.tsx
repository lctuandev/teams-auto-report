import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";
import { currentIsoDate } from "@/lib/date";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { MemberRepository } from "@/lib/repositories/member-repository";
import { ReportQueueRepository } from "@/lib/repositories/report-queue-repository";
import { PastReportsManager } from "./past-reports-manager";

export const dynamic = "force-dynamic";

export default async function PastReportsPage() {
  const session = await requireSession();
  if (!session.memberId) redirect("/");
  const repository = new MemberRepository();
  const member = await repository.getSafe(session.memberId);
  const group = member.groupId ? await new GroupRepository().get(member.groupId) : null;

  return (
    <AppShell session={session}>
      <main className="px-5 py-8 md:px-10">
        <div className="mx-auto max-w-6xl">
          <Link href="/" className="text-sm font-medium text-primary hover:underline">← Tổng quan</Link>
          <div className="mb-8 mt-6">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Cá nhân</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Báo cáo ngày đã qua</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              Chọn những ngày làm việc còn thiếu. Bot sẽ lần lượt tìm parent post theo title của group và đăng bằng pipeline hiện tại.
            </p>
          </div>
          {!group ? (
            <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
              Bạn cần chọn group trước khi có thể tạo báo cáo ngày cũ.
            </div>
          ) : (
            <PastReportsManager
              memberId={member.id}
              today={currentIsoDate(group.parentPost.timezone)}
              titleTemplate={group.parentPost.searchTitleTemplate}
              groupSchedule={group.parentPost}
              reportData={await repository.getPastReportData(member.id)}
              initialQueue={await new ReportQueueRepository().list(member.id)}
            />
          )}
        </div>
      </main>
    </AppShell>
  );
}
