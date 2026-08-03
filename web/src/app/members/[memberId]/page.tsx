import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSession } from "@/lib/auth/session";
import { MemberRepository } from "@/lib/repositories/member-repository";
import { resourceIdSchema } from "@/lib/schemas/common";

export default async function MemberDetailPage({
  params,
}: PageProps<"/members/[memberId]">) {
  const session = await requireSession();
  const { memberId } = await params;
  if (!resourceIdSchema.safeParse(memberId).success) notFound();
  const repository = new MemberRepository();
  let member;
  try {
    member = await repository.getSafe(memberId);
  } catch {
    notFound();
  }
  const history = await repository.getHistory(memberId, 1, 20);
  const isOwner = session.memberId === member.id;

  return (
    <AppShell session={session}>
      <main className="mx-auto w-full max-w-6xl px-5 py-10 md:px-10">
        <Link
          href="/members"
          className="mb-6 inline-flex text-sm font-medium text-primary hover:underline"
        >
          ← Danh sách thành viên
        </Link>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              Thành viên
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {member.displayName}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{member.id}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant={member.enabled ? "default" : "secondary"}>
              {member.enabled ? "Đang hoạt động" : "Tạm dừng"}
            </Badge>
            {isOwner && <Badge variant="outline">Tài khoản của bạn</Badge>}
          </div>
        </div>
        <Tabs defaultValue="tasks">
          <div className="w-full overflow-x-auto pb-1">
            <TabsList className="min-w-max">
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="history">Lịch sử post</TabsTrigger>
              <TabsTrigger value="configuration">Cấu hình report</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="tasks" className="mt-5 space-y-4">
            {member.tasks.length ? (
              member.tasks.map((task) => (
                <Card key={task.id ?? task.title}>
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <h2 className="font-medium">{task.title}</h2>
                      <span className="font-semibold text-primary">
                        {task.startPercent}%
                      </span>
                    </div>
                    <Progress
                      value={Math.round(
                        (task.startPercent / Math.max(1, task.maxPercent)) *
                        100,
                      )}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Mục tiêu {task.maxPercent}%
                    </p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Empty text="Member chưa có task." />
            )}
          </TabsContent>
          <TabsContent value="history" className="mt-5">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Số báo cáo</TableHead>
                    <TableHead>Tiêu đề parent</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.items.map((report) => (
                    <TableRow key={report.date}>
                      <TableCell className="font-medium">
                        {report.date}
                      </TableCell>
                      <TableCell>{report.reportNumber ?? "—"}</TableCell>
                      <TableCell className="max-w-sm truncate">
                        {report.title ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={report.checked ? "default" : "secondary"}
                        >
                          {report.checked ? "Đã đăng" : "Chưa xác nhận"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!history.items.length && (
                <Empty text="Chưa có lịch sử báo cáo." />
              )}
            </Card>
          </TabsContent>
          <TabsContent value="configuration" className="mt-5">
            <Card>
              <CardContent className="grid gap-5 p-5 sm:grid-cols-3">
                <Info label="Group" value={member.groupId ?? "Chưa chọn"} />
                <Info label="Giờ reply" value={member.schedule.postAfterTime} />
                <Info
                  label="Random window"
                  value={`${member.schedule.postAfterRandomWindowMinutes} phút`}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </AppShell>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-medium">{value}</p>
    </div>
  );
}
