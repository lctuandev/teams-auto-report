import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";
import { getVietnamHolidayCalendar } from "@/lib/vietnam-holidays";
import { GroupForm } from "../group-form";

export default async function NewGroupPage() {
  const session = await requireSession();
  const calendar = getVietnamHolidayCalendar(new Date().getFullYear());

  return (
    <AppShell session={session}>
      <main className="mx-auto w-full max-w-5xl px-5 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Groups</p>
          <h1 className="mt-2 text-3xl font-semibold">Tạo group</h1>
        </div>
        <GroupForm
          mode="create"
          initial={{
            name: "",
            teams: {
              threadId: "",
              teamId: "",
              conversationLinkPrefix: "https://teams.cloud.microsoft/l/message",
            },
            parentPost: {
              searchTitleTemplate: "Báo cáo ngày {DD}/{MM}/{YYYY}",
              contentTemplate: "<p>Báo cáo ngày {DD}/{MM}/{YYYY}</p>",
              timezone: "Asia/Ho_Chi_Minh",
              days: [1, 2, 3, 4, 5],
              skipDates: calendar?.skipDates ?? [],
              extraWorkDates: calendar?.extraWorkDates ?? [],
              postAfterTime: "17:28",
            },
          }}
        />
      </main>
    </AppShell>
  );
}
