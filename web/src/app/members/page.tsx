import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireSession } from "@/lib/auth/session";
import { MemberRepository } from "@/lib/repositories/member-repository";
import { UserRepository } from "@/lib/repositories/user-repository";
import { MemberStatusToggle } from "./member-status-toggle";

export default async function MembersPage() {
  const session = await requireSession();
  const members = await new MemberRepository().listSafe();
  const accounts = session.role === "admin"
    ? await Promise.all(members.map((member) => new UserRepository().getById(member.id)))
    : [];
  const accountById = new Map(accounts.filter((account) => account !== null).map((account) => [account.id, account]));

  return (
    <AppShell session={session}>
      <main className="mx-auto w-full max-w-7xl px-5 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Thành viên</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Admin có thể bật/tắt đồng thời quyền đăng nhập Web và lịch chạy bot của từng user.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {members.map((member) => {
            const task = member.tasks.find((item) => item.startPercent < item.maxPercent) ?? member.tasks[0];
            const progress = task ? Math.round(task.startPercent / Math.max(1, task.maxPercent) * 100) : 0;
            const account = accountById.get(member.id);
            const statusesMatch = !account || account.enabled === member.enabled;
            const userEnabled = Boolean(account?.enabled && member.enabled);
            const canToggle = session.role === "admin" && account && member.id !== session.userId && member.id !== session.memberId;

            return (
              <Card key={member.id} className="min-w-0">
                <CardContent className="flex h-full min-w-0 flex-col gap-5 p-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/members/${member.id}`} className="font-semibold hover:text-primary hover:underline">
                        {member.displayName}
                      </Link>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{member.id}</p>
                    </div>
                    {canToggle ? (
                      <MemberStatusToggle
                        memberId={member.id}
                        enabled={userEnabled}
                        version={member.version}
                      />
                    ) : (
                      <Badge className="shrink-0" variant={userEnabled || (session.role !== "admin" && member.enabled) ? "default" : "secondary"}>
                        {userEnabled || (session.role !== "admin" && member.enabled) ? "Đang hoạt động" : account ? "Đã tắt" : "Chưa có account"}
                      </Badge>
                    )}
                  </div>

                  {session.role === "admin" && !statusesMatch && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Trạng thái Web và bot đang không đồng bộ. Dùng công tắc để đồng bộ lại.
                    </div>
                  )}

                  {task ? (
                    <div className="mt-auto min-w-0">
                      <div className="mb-2 flex min-w-0 items-center gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate">{task.title}</span>
                        <span className="shrink-0 font-semibold text-primary">{task.startPercent}%</span>
                      </div>
                      <Progress value={progress} />
                    </div>
                  ) : (
                    <p className="mt-auto text-sm text-muted-foreground">Chưa có task</p>
                  )}

                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <div className="text-xs text-muted-foreground">
                      <span>{member.reportCount} báo cáo</span>
                      <span className="mx-2">·</span>
                      <span className="break-all">{member.groupId ?? "Chưa chọn group"}</span>
                    </div>
                    <Button nativeButton={false} render={<Link href={`/members/${member.id}`} />} variant="outline" size="sm">
                      Xem chi tiết
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
