import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { MemberRepository } from "@/lib/repositories/member-repository";
import { GroupSelector } from "./group-selector";
export default async function MyGroupPage() { const session = await requireSession(); if (!session.memberId) redirect("/"); const repository = new MemberRepository(); const [member, groups] = await Promise.all([repository.getSafe(session.memberId), new GroupRepository().list()]); const today = new Date().toISOString().slice(0,10); return <AppShell session={session}><main className="mx-auto w-full max-w-5xl px-5 py-10 md:px-10"><div className="mb-8"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Cá nhân</p><h1 className="mt-2 text-3xl font-semibold">Chọn group</h1><p className="mt-3 text-sm text-muted-foreground">Báo cáo của bạn sẽ reply vào parent post của group đã chọn.</p></div><GroupSelector memberId={member.id} version={member.version} currentGroupId={member.groupId} groups={groups} hasReportToday={member.lastReport?.date === today} /></main></AppShell>; }
