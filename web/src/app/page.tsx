import Link from "next/link";
import { ArrowRight, Clock, Layers3 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireSession } from "@/lib/auth/session";
import { currentIsoDate, isGroupReportDate } from "@/lib/date";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { MemberRepository } from "@/lib/repositories/member-repository";
import { DailyCheckIn } from "./daily-check-in";

export const dynamic = "force-dynamic";

const questions = [
  "Ê chiến thần, còn sống sau đống bug hôm nay không? 👀",
  "Báo cáo đi, đừng để bot phải ping lần hai nhé. 😏",
  "Hôm nay bạn fix bug hay bug fix bạn? 🐛",
  "Task hôm nay đã Done chưa, hay đang 'để mai tính'? 🤨",
  "Bot nghe đồn hôm nay bạn code dữ lắm. Chứng minh bằng báo cáo đi! 😎",
  "Commit thì có, báo cáo chắc cũng có chứ? 🤔",
  "Bot không nhiều chuyện đâu... chỉ muốn biết hôm nay bạn làm gì thôi. 👀",
  "Deadline đang nhìn bạn. Báo cáo thì đang nhìn bot. 😌",
  "Đừng để bot phải mở Jira điều tra tung tích của bạn nhé. 🕵️",
  "Hôm nay tạo ra feature mới hay tạo thêm technical debt? 😏",
  "Có bug nào bị bạn đấm hôm nay không? Hay nó đấm ngược lại? 🥊",
  "Nếu hôm nay chỉ có 1 commit thì... chắc là typo đúng không? 😂",
  "Đừng ngại, bug nào cũng từng nghĩ nó là feature. 😌",
  "Bot hứa không méc sếp đâu... giờ kể hôm nay làm gì đi. 🤫",
  "Báo cáo nhanh đi, bot sắp hết RAM để chờ rồi. 🧠",
  "Bạn làm việc hay đang cosplay icon màu vàng trên Teams? 🟡",
  "Một ngày không báo cáo là một ngày bot mất niềm tin vào nhân loại. 😔",
  "Task hôm nay hoàn thành chưa hay vẫn đang 'Loading 99%'? ⏳",
  "Đến giờ khai báo thành tích rồi đồng chí! 📋",
  "Bot cần báo cáo để chứng minh bạn không chỉ mở VS Code cho đẹp. 💻",
  "Xin hãy báo cáo trước khi manager xuất hiện như một con boss cuối. 👹",
  "Bot đã chuẩn bị khăn giấy... để lau nước mắt nếu hôm nay lại gặp bug. 🥲",
  "Hôm nay bạn code hay chỉ ngồi nhìn thanh progress build? 🤡",
  "Nộp báo cáo đi, bot không muốn phải gọi hội tìm kiếm cứu nạn đâu. 🚑",
  "Nếu chưa có gì để báo cáo thì... ít nhất kể bot nghe hôm nay bug hành bạn thế nào. 🤣",
];

export default async function Home() {
  const session = await requireSession();
  if (!session.memberId)
    return (
      <AppShell session={session}>
        <main className="mx-auto w-full max-w-5xl px-5 py-10 md:px-10">
          <h1 className="text-3xl font-semibold">Teams Auto Report</h1>
          <p className="mt-3 text-muted-foreground">
            Tài khoản admin chưa liên kết member.
          </p>
        </main>
      </AppShell>
    );
  const repository = new MemberRepository();
  const member = await repository.getSafe(session.memberId);
  const group = member.groupId
    ? await new GroupRepository().get(member.groupId)
    : null;
  const timeZone = group?.parentPost.timezone ?? "Asia/Bangkok";
  const date = currentIsoDate(timeZone);
  const groupReportsToday = group
    ? isGroupReportDate(date, group.parentPost)
    : true;
  const dailyStatus = await repository.getDailyStatus(member.id, date);
  const questionIndex =
    [...`${session.userId}:${date}`].reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    ) % questions.length;
  const task =
    member.tasks.find((item) => item.startPercent < item.maxPercent) ??
    member.tasks[0];

  return (
    <AppShell session={session}>
      <main className="mx-auto w-full max-w-6xl px-5 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            Xin chào, {member.displayName}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Tổng quan hôm nay
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Những thông tin cần thiết cho báo cáo của bạn.
          </p>
        </div>
        <DailyCheckIn
          memberId={member.id}
          date={date}
          question={questions[questionIndex]}
          initialStatus={dailyStatus.status}
          initialVersion={dailyStatus.version}
          groupReportsToday={groupReportsToday}
        />
        <section className="mt-6 grid gap-4 md:grid-cols-[1.6fr_1fr]">
          {" "}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Task hiện tại
                  </p>
                  <h2 className="mt-2 font-semibold">
                    {task?.title ?? "Chưa có task"}
                  </h2>
                </div>
                {task && <Badge variant="outline">{task.startPercent}%</Badge>}
              </div>
              {task && (
                <Progress
                  value={Math.round(
                    (task.startPercent / Math.max(1, task.maxPercent)) * 100,
                  )}
                />
              )}
              <Link
                href="/me/tasks"
                className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Quản lý task <ArrowRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
            <Card>
              <CardContent className="p-5">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Layers3 className="size-4" />
                  Group
                </p>
                <p className="mt-2 break-all font-medium">
                  {member.groupId ?? "Chưa chọn"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="size-4" />
                  Lịch reply
                </p>
                <p className="mt-2 font-medium">
                  {member.schedule.postAfterTime} + 0–
                  {member.schedule.postAfterRandomWindowMinutes} phút
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
        <Card className="mt-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-xs text-muted-foreground">Báo cáo gần nhất</p>
              <p className="mt-1 font-medium">
                {member.lastReport?.date ?? "Chưa có báo cáo"}
              </p>
            </div>
            <Link
              href={`/members/${member.id}`}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Xem hồ sơ và lịch sử
            </Link>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
