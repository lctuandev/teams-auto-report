import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";
import { GroupRepository } from "@/lib/repositories/group-repository";
import { OnboardingForm } from "./onboarding-form";

export default async function NewAccountPage() {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/");
  const groups = (await new GroupRepository().list()).filter((group) => group.enabled).map((group) => ({ id: group.id, name: group.name }));
  return (
    <AppShell session={session}>
      <main className="mx-auto w-full max-w-4xl px-5 py-10 md:px-10">
        <div className="mb-8"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Local admin</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Tạo account và onboarding Teams</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Chỉ chạy trên localhost. Sau browser login, copy folder user và browser profile tương ứng lên server.</p></div>
        <OnboardingForm groups={groups} />
      </main>
    </AppShell>
  );
}
