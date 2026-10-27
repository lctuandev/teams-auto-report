"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, LoaderCircle, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { planCatchUp, type CatchUpMember, type CatchUpPlan, type GroupSchedule } from "@/lib/catch-up";
import { renderDateTemplate } from "@/lib/date";
import type { CatchUpItem } from "@/lib/schemas/catch-up";
import { cn } from "@/lib/utils";

type Props = {
  groupId: string;
  today: string;
  titleTemplate: string;
  schedule: GroupSchedule;
  recentReportDays: string[];
  knownParentDates: string[];
  members: CatchUpMember[];
  initialQueue: CatchUpItem[];
};

const VISIBLE_RECENT_DAYS = 10;

export function CatchUpManager({ groupId, today, titleTemplate, schedule, recentReportDays, knownParentDates, members, initialQueue }: Props) {
  const [date, setDate] = useState(recentReportDays[0] ?? "");
  const [queue, setQueue] = useState(initialQueue);
  const [submitting, setSubmitting] = useState(false);
  const knownParents = useMemo(() => new Set(knownParentDates), [knownParentDates]);
  const plans = useMemo(
    () => members.map((member) => ({ member, plan: planCatchUp(member, date, schedule) })),
    [members, date, schedule],
  );
  const reportCount = plans.filter(({ plan }) => plan.kind === "report").length;
  const activeItem = queue.find((item) => item.date === date && (item.status === "queued" || item.status === "processing"));
  const yesterday = recentDay(today);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/groups/${groupId}/catch-up`);
      if (response.ok) setQueue((await response.json()).items);
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [groupId]);

  async function enqueue() {
    if (!date || !reportCount || activeItem) return;
    setSubmitting(true);
    const response = await fetch(`/api/groups/${groupId}/catch-up`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      toast.error("Không thể tạo yêu cầu báo cáo bù", { description: result.error ?? "Hãy thử lại sau." });
      return;
    }
    setQueue(result.items);
    toast.success("Đã thêm vào queue", { description: "Bot sẽ báo cáo bù ở lượt chạy kế tiếp, trước báo cáo hằng ngày." });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" />Chọn ngày cần báo cáo bù</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Các ngày report gần nhất của group, kèm số member đã đăng.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {recentReportDays.slice(0, VISIBLE_RECENT_DAYS).map((day) => {
                const postedCount = members.filter((member) => member.enabled && member.postedDates.includes(day)).length;
                const enabledCount = members.filter((member) => member.enabled).length;
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => setDate(day)}
                    className={cn(
                      "rounded-lg border p-2 text-left text-sm transition",
                      day === date ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary hover:bg-primary/5",
                    )}
                  >
                    <span className="block font-medium">{formatDay(day)}</span>
                    <span className={cn("block text-xs", day === date ? "text-primary-foreground/80" : postedCount < enabledCount ? "text-amber-700" : "text-muted-foreground")}>
                      {postedCount}/{enabledCount} đã đăng
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="flex flex-col gap-2 text-sm font-medium sm:flex-row sm:items-center">
              Hoặc chọn ngày khác
              <input type="date" value={date} max={yesterday} onChange={(event) => setDate(event.target.value)} className="h-9 rounded-lg border bg-background px-3 text-sm" />
            </label>
          </CardContent>
        </Card>

        {date && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Search className="size-5 text-primary" />Parent post</CardTitle></CardHeader>
            <CardContent>
              <p className="break-words rounded-lg bg-muted p-3 font-medium">{renderDateTemplate(titleTemplate, date, schedule)}</p>
              <p className={cn("mt-3 text-xs", knownParents.has(date) ? "text-emerald-700" : "text-muted-foreground")}>
                {knownParents.has(date)
                  ? "Bot đã ghi nhận parent post này."
                  : "Chưa có trong cache của bot. Bot sẽ tìm trên Teams; nếu không thấy, member đó báo lỗi và không có parent post nào được tạo."}
              </p>
            </CardContent>
          </Card>
        )}

        {date && (
          <Card>
            <CardHeader><CardTitle>Member trong group · {formatDay(date)}</CardTitle></CardHeader>
            <CardContent className="divide-y">
              {!members.length && <p className="text-sm text-muted-foreground">Group chưa có member nào.</p>}
              {plans.map(({ member, plan }) => (
                <div key={member.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{member.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.id}</p>
                  </div>
                  <PlanBadge plan={plan} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{date ? `${formatDay(date)} · ${reportCount} member sẽ báo cáo` : "Chưa chọn ngày"}</p>
            <p className="text-xs text-muted-foreground">
              {activeItem ? "Ngày này đang có yêu cầu chờ bot xử lý." : "Member đã đăng hoặc đã có báo cáo ngày sau sẽ được bỏ qua."}
            </p>
          </div>
          <Button onClick={enqueue} disabled={!date || date >= today || !reportCount || Boolean(activeItem) || submitting}>
            {submitting ? <LoaderCircle className="animate-spin" /> : <Send />}Báo cáo bù
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Lịch sử báo cáo bù</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!queue.length && <p className="text-sm text-muted-foreground">Chưa có yêu cầu nào.</p>}
            {queue.slice(0, 12).map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3"><span className="font-medium">{formatDay(item.date)}</span><QueueBadge status={item.status} /></div>
                <p className="mt-1 text-xs text-muted-foreground">bởi {item.requestedBy}</p>
                {item.error && <p className="mt-2 text-xs text-red-600">{item.error}</p>}
                {item.results.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {item.results.map((result) => (
                      <li key={result.memberId} className={cn(result.status === "failed" ? "text-red-600" : result.status === "posted" ? "text-emerald-700" : "text-muted-foreground")}>
                        <span className="font-medium">{result.memberId}</span>: {result.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlanBadge({ plan }: { plan: CatchUpPlan }) {
  switch (plan.kind) {
    case "report": return <Badge>Sẽ báo cáo</Badge>;
    case "posted": return <Badge variant="outline" className="text-emerald-700">Đã đăng</Badge>;
    case "disabled": return <Badge variant="secondary">Đã tắt</Badge>;
    case "not-report-day": return <Badge variant="secondary">Không phải ngày report</Badge>;
    case "later-report": return <Badge variant="secondary">Đã có báo cáo {formatDay(plan.laterDate)}</Badge>;
    case "no-tasks": return <Badge variant="secondary">Không có task để report</Badge>;
  }
}

function QueueBadge({ status }: { status: CatchUpItem["status"] }) {
  const labels = { queued: "Đang chờ", processing: "Đang xử lý", completed: "Hoàn tất", failed: "Có lỗi" };
  return <Badge variant={status === "completed" ? "default" : status === "failed" ? "destructive" : "secondary"}>{labels[status]}</Badge>;
}

function formatDay(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function recentDay(today: string) {
  const cursor = new Date(`${today}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  return cursor.toISOString().slice(0, 10);
}
