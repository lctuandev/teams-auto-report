import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";
import { MemberRepository } from "@/lib/repositories/member-repository";
import { ReportConfigEditor } from "./report-config-editor";

export default async function ReportConfigPage() {
  const session = await requireSession();
  if (!session.memberId) redirect("/");
  const data = await new MemberRepository().getEditableReportConfig(session.memberId);
  return <AppShell session={session}><main className="mx-auto w-full max-w-5xl px-5 py-10 md:px-10"><div className="mb-8"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Cá nhân</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Cấu hình report</h1><p className="mt-3 text-sm text-muted-foreground">Cấu hình reply riêng của bạn. Parent post và Teams target được quản lý tại group.</p></div><ReportConfigEditor memberId={data.memberId} initialVersion={data.version} initialConfig={{ schedule: data.schedule, pending: data.pending, innovations: data.innovations, report: data.report }} monthlySummaries={data.monthlySummaries} /></main></AppShell>;
}
