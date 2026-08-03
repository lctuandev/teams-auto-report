import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";
import { canEditGroup } from "@/lib/permissions/policy";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { resourceIdSchema } from "@/lib/schemas/common";
import { GroupForm } from "../../group-form";
export default async function EditGroupPage({ params }: PageProps<"/groups/[groupId]/edit">) { const session = await requireSession(); const { groupId } = await params; if (!resourceIdSchema.safeParse(groupId).success) notFound(); let group; try { group = await new GroupRepository().get(groupId); } catch { notFound(); } if (!canEditGroup(session, group)) redirect("/groups"); return <AppShell session={session}><main className="mx-auto w-full max-w-5xl px-5 py-10 md:px-10"><Link href="/groups" className="mb-6 inline-flex text-sm font-medium text-primary hover:underline">← Danh sách Groups</Link><div className="mb-8"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Groups</p><h1 className="mt-2 break-words text-3xl font-semibold">{group.name}</h1></div><GroupForm mode="edit" groupId={group.id} version={group.version} initial={{ name: group.name, teams: group.teams, parentPost: group.parentPost }} /></main></AppShell>; }
