import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { MemberRepository } from "@/lib/repositories/member-repository";
import { TaskEditor } from "./task-editor";
import { AppShell } from "@/components/app-shell";

export default async function TasksPage() {
  const session = await requireSession();
  if (!session.memberId) redirect("/");
  const data = await new MemberRepository().getEditableTasks(session.memberId);

  return (
    <AppShell session={session}>
    <main className="px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm font-medium text-[#23815c] hover:underline">← Tổng quan</Link>
        <div className="mb-8 mt-6"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#23815c]">Cá nhân</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Quản lý task</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#718078]">Thay đổi thứ tự có thể ảnh hưởng daily plan cũ chưa dùng task ID. Mỗi lần lưu đều được version-check và ghi audit.</p></div>
        <TaskEditor memberId={data.memberId} initialVersion={data.version} initialTasks={data.tasks} initialExcludeCompletedTasks={data.excludeCompletedTasks} />
      </div>
    </main>
    </AppShell>
  );
}
